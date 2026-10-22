// Command recipes serves the cookbook website, checks every recipe card and says what's wrong, or makes
// the certificates that put the site on https. Without -config, it reads the config.yaml next to itself.
//
//	recipes [-config config.yaml] [-listen address]    serve the site
//	recipes check [-config config.yaml]                check every card, exiting 1 when any has a problem
//	recipes certs [-config config.yaml]                make or renew the https certificates
//	recipes version                                    say which release this is
package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"

	"recipes/server/internal/announce"
	"recipes/server/internal/api"
	"recipes/server/internal/cards"
	"recipes/server/internal/certs"
	"recipes/server/internal/config"
	"recipes/server/internal/site"
	"recipes/server/internal/trust"
)

// readHeaderTimeout is how long a visitor gets to send a request's headers before the server gives up on
// it, so a connection that never finishes can't sit there forever.
const readHeaderTimeout = 10 * time.Second

// machineName is this machine's own name, like j-desktop. It's os.Hostname everywhere but the tests.
var machineName = os.Hostname

// version is what git called this program's commit when it was built, like v1.0.0 on a release's own commit,
// which the release build and `bun run build` write in. A copy built any other way, like the one `bun run dev`
// runs, says dev.
var version = "dev"

// programFolder is the folder this program sits in, which is where a downloaded copy keeps its config. It's
// os.Executable everywhere but the tests.
var programFolder = func() (string, error) {
	path, err := os.Executable()
	if err != nil {
		return "", err
	}

	// a link to the program leads back to the real file, where its config sits. Windows can't always follow
	// a path this way, as on a mapped drive, and a Windows program is rarely started through a link anyway,
	// so there the path it was started from stands.
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	return filepath.Dir(path), nil
}

// localAddresses lists this machine's addresses on its networks, where other devices can reach it. It's
// announce.LocalAddresses everywhere but the tests.
var localAddresses = announce.LocalAddresses

func main() {
	code := run(os.Args[1:], os.Stdout, os.Stderr)

	// a program double-clicked on Windows gets a window that closes the moment it exits, taking whatever
	// went wrong with it, so the window waits for Enter first.
	if code != 0 && runtime.GOOS == "windows" {
		fmt.Fprintln(os.Stderr, "Press Enter to close this window.")
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
	}
	os.Exit(code)
}

// run is main with its inputs and outputs handed in, so tests can drive it. It returns the exit code:
// 0 for success, 1 for a failure, 2 for a command or flag it doesn't know.
func run(arguments []string, stdout io.Writer, stderr io.Writer) int {
	// the command comes first when there is one; anything starting with a dash is already a flag.
	command := "serve"
	if len(arguments) > 0 && strings.HasPrefix(arguments[0], "-") == false {
		command = arguments[0]
		arguments = arguments[1:]
	}
	if command == "version" {
		fmt.Fprintf(stdout, "recipes %s\n", version)
		return 0
	}
	if command != "serve" && command != "check" && command != "certs" {
		fmt.Fprintf(stderr, "There's no %q command. Use serve, check, certs or version.\n", command)
		return 2
	}

	flags := flag.NewFlagSet("recipes", flag.ContinueOnError)
	flags.SetOutput(stderr)
	configPath := flags.String("config", "", "the config file to read, instead of the config.yaml next to this program")
	listen := flags.String("listen", "", "an address to listen on instead of the config's, like 127.0.0.1:8686")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}

	path, err := findConfig(*configPath)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	settings, err := config.Load(path)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	// development runs beside the always-on copy, so it needs an address of its own without a second config.
	if *listen != "" {
		settings.Listen = *listen
	}

	switch command {
	case "check":
		return check(settings, stdout, stderr)
	case "certs":
		return makeCertificates(settings, time.Now(), stdout, stderr)
	}
	return serve(settings, stdout, stderr)
}

// findConfig picks the config file to read: the one named with -config when there is one, and otherwise
// the config.yaml next to this program, which is where a downloaded copy keeps it. That one is looked for
// here, since the folder the program was started from tells nothing: a program double-clicked on a Mac
// starts in the home folder.
func findConfig(named string) (string, error) {
	if named != "" {
		return named, nil
	}

	folder, err := programFolder()
	if err != nil {
		return "", fmt.Errorf("couldn't work out which folder this program is in (%v), so name its config with -config", err)
	}
	path := filepath.Join(folder, "config.yaml")
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("there's no config.yaml next to this program, in %s. Put one there, or name one with -config", folder)
	}
	return path, nil
}

// check reads every card and prints each problem on its own line, then a tally. It exits 1 when there
// is any problem at all, so it can stop a script the way a failing test does.
func check(settings config.Config, stdout io.Writer, stderr io.Writer) int {
	library, err := cards.Load(settings.RecipesFolder)
	if err != nil {
		fmt.Fprintf(stderr, "Couldn't read the recipes folder: %v\n", err)
		return 1
	}

	for _, problem := range library.Problems {
		fmt.Fprintf(stdout, "%s: %s\n", problem.File, problem.Message)
	}
	fmt.Fprintf(stdout, "%s, %s.\n", count(len(library.Recipes), "recipe"), count(len(library.Problems), "problem"))

	if len(library.Problems) > 0 {
		return 1
	}
	return 0
}

// makeCertificates makes the site's certificate authority if there isn't one yet, then issues the site a
// fresh certificate for its name, this machine's own name, localhost, and this machine's addresses on its
// networks, for a device that reaches it by address. Running it again renews the site's certificate under
// the same authority, so a device that trusts the site already needs nothing new.
func makeCertificates(settings config.Config, now time.Time, stdout io.Writer, stderr io.Writer) int {
	if settings.Certificates == "" {
		fmt.Fprintln(stderr, "The config needs a certificates folder to keep them in, like certificates: certs")
		return 1
	}

	// a machine that won't say its name still gets a certificate for the site's name and localhost.
	machine, err := machineName()
	if err != nil {
		machine = ""
	}
	ips := networkIPs()
	names := siteNames(settings.Name, machine, ips)
	issued, err := certs.Issue(settings.Certificates, authorityName(machine), names, now)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	if issued.MadeAuthority {
		fmt.Fprintf(stdout, "Made a certificate authority: %s\n", filepath.Join(settings.Certificates, certs.AuthorityFile))
	}
	fmt.Fprintf(stdout, "Made the site's certificate for %s, good until %s.\n", strings.Join(issued.Names, ", "), issued.Expires.Format("2006-01-02"))
	if issued.MadeAuthority {
		fmt.Fprintf(stdout, "Restart the site, then open %s/trust on each device to trust it.\n", trustAddress(settings, ips))
		return 0
	}
	fmt.Fprintln(stdout, "Restart the site to use it. Devices that already trust the site need nothing new.")
	return 0
}

// networkIPs lists this machine's addresses on its networks. A machine whose networks can't be listed has
// none to offer, which only means devices reach it by name instead.
func networkIPs() []string {
	addresses, err := localAddresses()
	if err != nil {
		return []string{}
	}

	ips := []string{}
	for _, address := range addresses {
		ips = append(ips, address.IP)
	}
	return ips
}

// trustAddress is where a device goes the first time, to trust the site: the plain http side, reached the
// way another device reaches this machine, or on this machine itself when nothing else can reach it.
func trustAddress(settings config.Config, ips []string) string {
	here, elsewhere := addressesFor("http", settings.Listen, settings.Name, ips)
	if len(elsewhere) > 0 {
		return elsewhere[0]
	}
	return here
}

// siteNames lists the names the site's certificate covers, without repeats: the site's own name, this
// machine's .local name, localhost, and this machine's addresses.
func siteNames(name string, machine string, ips []string) []string {
	candidates := []string{name, "localhost"}
	if machine != "" {
		candidates = []string{name, strings.TrimSuffix(machine, ".local") + ".local", "localhost"}
	}
	candidates = append(candidates, ips...)

	names := []string{}
	for _, candidate := range candidates {
		if candidate != "" && slices.Contains(names, candidate) == false {
			names = append(names, candidate)
		}
	}
	return names
}

// authorityName is what the certificate authority calls itself, which is how each device's settings list
// it, so it says whose recipes it's for.
func authorityName(machine string) string {
	if machine == "" {
		return "Recipes"
	}
	return fmt.Sprintf("Recipes on %s", strings.TrimSuffix(machine, ".local"))
}

// serve runs the site until the process stops. Serving only ever ends with an error, so reaching the end
// of this means the site couldn't start, as when the address is already taken, or couldn't stay up.
func serve(settings config.Config, stdout io.Writer, stderr io.Writer) int {
	shelf := cards.NewShelf(settings.RecipesFolder)
	routes := api.Routes(shelf, site.Handler(site.Files()))

	// https only means something to other devices, and leaving it out on loopback also keeps development
	// off the https port the always-on copy holds.
	if settings.Certificates != "" && servesOtherDevices(settings.Listen) {
		return serveSecurely(settings, routes, stdout, stderr)
	}

	listener, err := net.Listen("tcp", settings.Listen)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	for _, line := range welcome(settings, false, networkIPs()) {
		fmt.Fprintln(stdout, line)
	}
	announceName(settings, stdout, stderr)

	server := &http.Server{Handler: routes, ReadHeaderTimeout: readHeaderTimeout}
	fmt.Fprintln(stderr, server.Serve(listener))
	return 1
}

// serveSecurely runs the site on https, with plain http beside it sending visitors over, except for the
// page and the download a new device needs to trust the site. When either one stops, the whole server
// stops, and the service starts it again.
func serveSecurely(settings config.Config, routes http.Handler, stdout io.Writer, stderr io.Writer) int {
	certificate, err := tls.LoadX509KeyPair(
		filepath.Join(settings.Certificates, certs.SiteFile),
		filepath.Join(settings.Certificates, certs.SiteKeyFile),
	)
	if err != nil {
		fmt.Fprintf(stderr, "Couldn't load the site's certificate from %s: %v. Run `recipes certs` to make one.\n", settings.Certificates, err)
		return 1
	}
	expires, err := certs.Expiry(settings.Certificates)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	_, securePort, err := net.SplitHostPort(settings.ListenSecure)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	plainRoutes, err := trust.Routes(filepath.Join(settings.Certificates, certs.AuthorityFile), securePort)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	secureListener, err := net.Listen("tcp", settings.ListenSecure)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	plainListener, err := net.Listen("tcp", settings.Listen)
	if err != nil {
		secureListener.Close()
		fmt.Fprintln(stderr, err)
		return 1
	}
	for _, line := range welcome(settings, true, networkIPs()) {
		fmt.Fprintln(stdout, line)
	}
	fmt.Fprintf(stdout, "The site's certificate is good until %s. Run `recipes certs` before then to renew it.\n",
		expires.Format("2006-01-02"))
	announceName(settings, stdout, stderr)

	stopped := make(chan error, 2)
	go func() {
		secure := &http.Server{
			Handler:           routes,
			ReadHeaderTimeout: readHeaderTimeout,
			TLSConfig:         &tls.Config{Certificates: []tls.Certificate{certificate}, MinVersion: tls.VersionTLS12},
		}
		stopped <- secure.ServeTLS(secureListener, "", "")
	}()
	go func() {
		plain := &http.Server{Handler: plainRoutes, ReadHeaderTimeout: readHeaderTimeout}
		stopped <- plain.Serve(plainListener)
	}()
	fmt.Fprintln(stderr, <-stopped)
	return 1
}

// welcome is what serving says first: which release, which recipes, then where to open them, on this
// computer and on a phone or tablet on the same network. A site on https also says where a device goes the
// first time, to trust it.
func welcome(settings config.Config, secure bool, ips []string) []string {
	scheme := "http"
	listen := settings.Listen
	if secure {
		scheme = "https"
		listen = settings.ListenSecure
	}

	lines := []string{fmt.Sprintf("Recipes %s, serving the recipes in %s.", version, settings.RecipesFolder)}
	here, elsewhere := addressesFor(scheme, listen, settings.Name, ips)
	lines = append(lines, fmt.Sprintf("Open %s on this computer.", here))
	if len(elsewhere) == 0 {
		return lines
	}

	lines = append(lines, fmt.Sprintf("On a phone or tablet on the same Wi-Fi, open %s.", strings.Join(elsewhere, " or ")))
	if secure {
		lines = append(lines, fmt.Sprintf("A device's first visit goes to %s/trust, to trust the site.", trustAddress(settings, ips)))
	}
	return lines
}

// addressesFor works out where a site listening on listen can be opened: here, on this computer, and
// elsewhere, from other devices, best first. A site listening everywhere is here at localhost and elsewhere
// at its own name, when it has one, then at each of this machine's addresses. One listening on loopback is
// only here, and one listening on a single address is at that address either way. A port that's the
// scheme's usual one is left out, so the addresses read the way a person types them.
func addressesFor(scheme string, listen string, name string, ips []string) (string, []string) {
	host, port, err := net.SplitHostPort(listen)
	if err != nil {
		return fmt.Sprintf("%s://%s", scheme, listen), []string{}
	}

	address := func(target string) string {
		if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
			return fmt.Sprintf("%s://%s", scheme, target)
		}
		return fmt.Sprintf("%s://%s", scheme, net.JoinHostPort(target, port))
	}

	if host != "" && host != "0.0.0.0" && host != "::" {
		if servesOtherDevices(listen) == false {
			return address("localhost"), []string{}
		}
		return address(host), []string{address(host)}
	}

	elsewhere := []string{}
	if name != "" {
		elsewhere = append(elsewhere, address(name))
	}
	for _, ip := range ips {
		elsewhere = append(elsewhere, address(ip))
	}
	return address("localhost"), elsewhere
}

// announceName gets Avahi answering for the site's name, once the site can answer to it. It only does so
// for a site other devices can reach, which also keeps development from claiming the name the always-on
// copy holds.
func announceName(settings config.Config, stdout io.Writer, stderr io.Writer) {
	if settings.Name == "" || servesOtherDevices(settings.Listen) == false {
		return
	}
	announcer := announce.New(settings.Name, &announce.DBus{}, stdout, stderr)
	go announcer.Run(context.Background())
}

// servesOtherDevices reports whether a site listening on address can be reached from other devices. Only
// loopback can't be: 127.0.0.1, ::1 and localhost all lead back to this machine alone.
func servesOtherDevices(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return false
	}

	// an empty host listens everywhere, and a host name isn't an IP, so neither can be loopback.
	ip := net.ParseIP(host)
	return ip == nil || ip.IsLoopback() == false
}

// count words a number of things, singular for exactly one.
func count(number int, thing string) string {
	if number == 1 {
		return fmt.Sprintf("1 %s", thing)
	}
	return fmt.Sprintf("%d %ss", number, thing)
}
