// Command recipes serves the cookbook website, checks every recipe card and says what's wrong, or makes
// the certificates that put the site on https.
//
//	recipes [-config config.yaml] [-listen address]    serve the site
//	recipes check [-config config.yaml]                check every card, exiting 1 when any has a problem
//	recipes certs [-config config.yaml]                make or renew the https certificates
package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
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

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
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
	if command != "serve" && command != "check" && command != "certs" {
		fmt.Fprintf(stderr, "There's no %q command. Use serve, check or certs.\n", command)
		return 2
	}

	flags := flag.NewFlagSet("recipes", flag.ContinueOnError)
	flags.SetOutput(stderr)
	configPath := flags.String("config", "config.yaml", "the config file to read")
	listen := flags.String("listen", "", "an address to listen on instead of the config's, like 127.0.0.1:8686")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}

	settings, err := config.Load(*configPath)
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
// fresh certificate for its name, this machine's own name and localhost. Running it again renews the
// site's certificate under the same authority, so a device that trusts the site already needs nothing new.
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
	names := siteNames(settings.Name, machine)
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
		fmt.Fprintf(stdout, "Restart the site, then open http://%s/trust on each device to trust it.\n", names[0])
		return 0
	}
	fmt.Fprintln(stdout, "Restart the site to use it. Devices that already trust the site need nothing new.")
	return 0
}

// siteNames lists the names the site's certificate covers, without repeats: the site's own name, this
// machine's .local name, and localhost.
func siteNames(name string, machine string) []string {
	candidates := []string{name, "localhost"}
	if machine != "" {
		candidates = []string{name, strings.TrimSuffix(machine, ".local") + ".local", "localhost"}
	}

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

	fmt.Fprintf(stdout, "Serving the recipes in %s at http://%s\n", settings.RecipesFolder, settings.Listen)
	listener, err := net.Listen("tcp", settings.Listen)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
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
		fmt.Fprintf(stderr, "Couldn't load the site's certificate from %s: %v. Run `bun run certs` to make one.\n", settings.Certificates, err)
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

	fmt.Fprintf(stdout, "Serving the recipes in %s at https://%s, with http://%s sending visitors there\n",
		settings.RecipesFolder, settings.ListenSecure, settings.Listen)
	fmt.Fprintf(stdout, "The site's certificate is good until %s. Run `bun run certs` before then to renew it.\n",
		expires.Format("2006-01-02"))

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
