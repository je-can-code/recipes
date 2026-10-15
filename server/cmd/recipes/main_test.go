package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"recipes/server/internal/announce"
	"recipes/server/internal/config"
)

// run owes a script an honest exit code: 0 only when every card is clean, 1 for any problem or failure,
// and 2 for a command or flag it doesn't know. check is meant to sit in front of anything that trusts the
// recipes folder, so a 0 that hides a broken card defeats the point of having it. servesOtherDevices owes
// serve a straight answer about who can reach the site, since a development copy that announced the name
// would collide with the always-on copy that holds it.

// cleanCard is a card that passes every rule.
const cleanCard = `title: Test Gravy
intro: >-
  A gravy.
serves: 2
time: about 10 minutes
ingredients:
  - items:
      - 1/4 cup flour
method:
  steps:
    - lead: Whisk.
      text: >-
        Whisk it.
`

// setUp writes a recipes folder from the given files, and a config pointing at it with the given listen
// address. It returns the config's path.
func setUp(t *testing.T, files map[string]string, listen string) string {
	t.Helper()

	folder := t.TempDir()
	recipes := filepath.Join(folder, "recipes")
	if err := os.MkdirAll(recipes, 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(recipes, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	configPath := filepath.Join(folder, "config.yaml")
	content := "recipesFolder: recipes\nlisten: " + listen + "\n"
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return configPath
}

// runWith runs the command and returns its exit code with everything it printed.
func runWith(arguments ...string) (int, string, string) {
	stdout := bytes.Buffer{}
	stderr := bytes.Buffer{}
	code := run(arguments, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

// TestCheckPassesACleanFolder covers the everyday case: every card fine.
func TestCheckPassesACleanFolder(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "127.0.0.1:0")

	// Act.
	code, stdout, _ := runWith("check", "-config", configPath)

	// Assert.
	if code != 0 || stdout != "1 recipe, 0 problems.\n" {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestCheckFailsOnAnyProblem covers a broken card beside a clean one, which still fails the check and
// names the card and what's wrong with it.
func TestCheckFailsOnAnyProblem(t *testing.T) {
	// Arrange.
	broken := strings.Replace(cleanCard, "time: about 10 minutes\n", "", 1)
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard, "broken.yaml": broken}, "127.0.0.1:0")

	// Act.
	code, stdout, _ := runWith("check", "-config", configPath)

	// Assert.
	if code != 1 || stdout != "broken.yaml: Needs a time.\n1 recipe, 1 problem.\n" {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestCheckFailsWhenTheFolderIsMissing covers a config pointing at a folder that isn't there.
func TestCheckFailsWhenTheFolderIsMissing(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{}, "127.0.0.1:0")
	if err := os.Remove(filepath.Join(filepath.Dir(configPath), "recipes")); err != nil {
		t.Fatal(err)
	}

	// Act.
	code, _, stderr := runWith("check", "-config", configPath)

	// Assert.
	if code != 1 || strings.HasPrefix(stderr, "Couldn't read the recipes folder") == false {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestRunFailsWithoutAConfig covers starting somewhere with no config file.
func TestRunFailsWithoutAConfig(t *testing.T) {
	// Arrange.
	configPath := filepath.Join(t.TempDir(), "config.yaml")

	// Act.
	code, _, stderr := runWith("check", "-config", configPath)

	// Assert.
	if code != 1 || strings.Contains(stderr, "couldn't read the config") == false {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestRunRefusesAnUnknownCommand covers a typo in the command.
func TestRunRefusesAnUnknownCommand(t *testing.T) {
	// Arrange.
	arguments := []string{"chekc"}

	// Act.
	code, _, stderr := runWith(arguments...)

	// Assert.
	if code != 2 || stderr != "There's no \"chekc\" command. Use serve, check, certs or version.\n" {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestVersionSaysWhichReleaseThisIs covers the version command, which needs no config at all.
func TestVersionSaysWhichReleaseThisIs(t *testing.T) {
	// Arrange- the program sits somewhere with no config, which version mustn't need.
	withProgramFolder(t, t.TempDir(), nil)

	// Act.
	code, stdout, _ := runWith("version")

	// Assert.
	if code != 0 || stdout != "recipes dev\n" {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// withProgramFolder makes the program sit in folder for the rest of the test, or fail to say where it is.
func withProgramFolder(t *testing.T, folder string, err error) {
	t.Helper()

	original := programFolder
	programFolder = func() (string, error) {
		return folder, err
	}
	t.Cleanup(func() {
		programFolder = original
	})
}

// TestRunReadsTheConfigBesideTheProgram covers a downloaded copy started with no flags, wherever it was
// started from, which reads the config.yaml sitting next to it.
func TestRunReadsTheConfigBesideTheProgram(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "127.0.0.1:0")
	withProgramFolder(t, filepath.Dir(configPath), nil)

	// Act.
	code, stdout, _ := runWith("check")

	// Assert.
	if code != 0 || stdout != "1 recipe, 0 problems.\n" {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestRunSaysWhereTheConfigBelongs covers a copy with no config beside it, which names the folder it
// looked in and the way around it.
func TestRunSaysWhereTheConfigBelongs(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	withProgramFolder(t, folder, nil)

	// Act.
	code, _, stderr := runWith("check")

	// Assert.
	expected := "there's no config.yaml next to this program, in " + folder + ". Put one there, or name one with -config\n"
	if code != 1 || stderr != expected {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestRunAsksForAConfigWhenItCantFindItself covers a program that can't say where it is, which can only
// be told where its config is.
func TestRunAsksForAConfigWhenItCantFindItself(t *testing.T) {
	// Arrange.
	withProgramFolder(t, "", errors.New("no executable"))

	// Act.
	code, _, stderr := runWith("check")

	// Assert.
	if code != 1 || stderr != "couldn't work out which folder this program is in (no executable), so name its config with -config\n" {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// withMachineName makes the machine call itself name for the rest of the test.
func withMachineName(t *testing.T, name string, err error) {
	t.Helper()

	original := machineName
	machineName = func() (string, error) {
		return name, err
	}
	t.Cleanup(func() {
		machineName = original
	})
}

// withLocalAddresses makes the machine's network addresses the given IPs for the rest of the test, or makes
// listing them fail.
func withLocalAddresses(t *testing.T, ips []string, err error) {
	t.Helper()

	original := localAddresses
	localAddresses = func() ([]announce.Address, error) {
		addresses := []announce.Address{}
		for index, ip := range ips {
			addresses = append(addresses, announce.Address{Interface: index + 1, IP: ip})
		}
		return addresses, err
	}
	t.Cleanup(func() {
		localAddresses = original
	})
}

// setUpCertificates writes a config with a certificates folder and a site name, and returns its path and
// the certificates folder. The machine has one network address, 192.0.2.10.
func setUpCertificates(t *testing.T, listen string) (string, string) {
	t.Helper()

	withLocalAddresses(t, []string{"192.0.2.10"}, nil)
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, listen)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	content = append(content, []byte("name: recipes.local\ncertificates: certs\n")...)
	if err := os.WriteFile(configPath, content, 0644); err != nil {
		t.Fatal(err)
	}
	return configPath, filepath.Join(filepath.Dir(configPath), "certs")
}

// TestCertsMakesAnAuthorityTheFirstTime covers the first run, which makes the authority and says where
// each device goes to trust it.
func TestCertsMakesAnAuthorityTheFirstTime(t *testing.T) {
	// Arrange.
	withMachineName(t, "j-desktop", nil)
	configPath, folder := setUpCertificates(t, "0.0.0.0:80")

	// Act.
	code, stdout, _ := runWith("certs", "-config", configPath)

	// Assert.
	if code != 0 {
		t.Fatalf("got %d", code)
	}
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	expectedLines := []string{
		"Made a certificate authority: " + filepath.Join(folder, "ca.crt"),
		"Made the site's certificate for recipes.local, j-desktop.local, localhost, 192.0.2.10, good until",
		"Restart the site, then open http://recipes.local/trust on each device to trust it.",
	}
	if len(lines) != 3 || lines[0] != expectedLines[0] || strings.HasPrefix(lines[1], expectedLines[1]) == false || lines[2] != expectedLines[2] {
		t.Fatalf("got %q", stdout)
	}
}

// TestCertsRenewsUnderTheSameAuthority covers a second run, which only renews the site's certificate.
func TestCertsRenewsUnderTheSameAuthority(t *testing.T) {
	// Arrange.
	withMachineName(t, "j-desktop", nil)
	configPath, _ := setUpCertificates(t, "0.0.0.0:80")
	if code, _, _ := runWith("certs", "-config", configPath); code != 0 {
		t.Fatalf("the first run failed with %d", code)
	}

	// Act.
	code, stdout, _ := runWith("certs", "-config", configPath)

	// Assert.
	if code != 0 || strings.Contains(stdout, "Made a certificate authority") || strings.HasSuffix(stdout, "Devices that already trust the site need nothing new.\n") == false {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestCertsNeedsAFolder covers a config without a certificates folder.
func TestCertsNeedsAFolder(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "0.0.0.0:80")

	// Act.
	code, _, stderr := runWith("certs", "-config", configPath)

	// Assert.
	if code != 1 || stderr != "The config needs a certificates folder to keep them in, like certificates: certs\n" {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestCertsFailsWhereItCantWrite covers a certificates folder it can't create.
func TestCertsFailsWhereItCantWrite(t *testing.T) {
	// Arrange- a file sits where the folder would go.
	withMachineName(t, "j-desktop", nil)
	configPath, folder := setUpCertificates(t, "0.0.0.0:80")
	if err := os.WriteFile(folder, []byte("in the way"), 0644); err != nil {
		t.Fatal(err)
	}

	// Act.
	code, _, stderr := runWith("certs", "-config", configPath)

	// Assert.
	if code != 1 || stderr == "" {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestCertsCarriesOnWhenTheMachineWontSayItsName covers a machine name that can't be read, which leaves
// the site's own name and localhost.
func TestCertsCarriesOnWhenTheMachineWontSayItsName(t *testing.T) {
	// Arrange.
	withMachineName(t, "", errors.New("no name"))
	configPath, _ := setUpCertificates(t, "0.0.0.0:80")

	// Act.
	code, stdout, _ := runWith("certs", "-config", configPath)

	// Assert.
	if code != 0 || strings.Contains(stdout, "Made the site's certificate for recipes.local, localhost, 192.0.2.10, good until") == false {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestCertsCarriesOnWhenTheNetworksCantBeListed covers a machine whose network addresses can't be read,
// which still gets a certificate for its names.
func TestCertsCarriesOnWhenTheNetworksCantBeListed(t *testing.T) {
	// Arrange.
	withMachineName(t, "j-desktop", nil)
	configPath, _ := setUpCertificates(t, "0.0.0.0:80")
	withLocalAddresses(t, []string{"192.0.2.10"}, errors.New("no networks"))

	// Act.
	code, stdout, _ := runWith("certs", "-config", configPath)

	// Assert.
	if code != 0 || strings.Contains(stdout, "Made the site's certificate for recipes.local, j-desktop.local, localhost, good until") == false {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestCertsSendsDevicesToAnAddressWithoutAName covers a site with no name of its own on a port of its own,
// whose devices go to this machine's address, port and all, to trust it.
func TestCertsSendsDevicesToAnAddressWithoutAName(t *testing.T) {
	// Arrange.
	withMachineName(t, "j-desktop", nil)
	withLocalAddresses(t, []string{"192.0.2.10"}, nil)
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "0.0.0.0:8686")
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, append(content, []byte("certificates: certs\n")...), 0644); err != nil {
		t.Fatal(err)
	}

	// Act.
	code, stdout, _ := runWith("certs", "-config", configPath)

	// Assert.
	if code != 0 || strings.HasSuffix(stdout, "Restart the site, then open http://192.0.2.10:8686/trust on each device to trust it.\n") == false {
		t.Fatalf("got %d %q", code, stdout)
	}
}

// TestSiteNamesCoversTheSiteTheMachineLocalhostAndAddresses covers the usual names, in order.
func TestSiteNamesCoversTheSiteTheMachineLocalhostAndAddresses(t *testing.T) {
	// Arrange.
	name, machine, ips := "recipes.local", "j-desktop", []string{"192.0.2.10"}

	// Act.
	names := siteNames(name, machine, ips)

	// Assert.
	if strings.Join(names, " ") != "recipes.local j-desktop.local localhost 192.0.2.10" {
		t.Fatalf("got %v", names)
	}
}

// TestSiteNamesLeavesOutRepeatsAndBlanks covers a site with no name of its own on a machine whose name
// already ends in .local, and an address listed twice.
func TestSiteNamesLeavesOutRepeatsAndBlanks(t *testing.T) {
	// Arrange.
	name, machine, ips := "", "j-desktop.local", []string{"192.0.2.10", "192.0.2.10"}

	// Act.
	names := siteNames(name, machine, ips)

	// Assert.
	if strings.Join(names, " ") != "j-desktop.local localhost 192.0.2.10" {
		t.Fatalf("got %v", names)
	}
}

// TestAuthorityNameSaysWhoseItIs covers the name devices list the authority under.
func TestAuthorityNameSaysWhoseItIs(t *testing.T) {
	// Arrange.
	machines := []string{"j-desktop", "j-desktop.local", ""}

	// Act.
	authorityNames := []string{authorityName(machines[0]), authorityName(machines[1]), authorityName(machines[2])}

	// Assert.
	if strings.Join(authorityNames, " / ") != "Recipes on j-desktop / Recipes on j-desktop / Recipes" {
		t.Fatalf("got %v", authorityNames)
	}
}

// TestServeSecurelyNeedsItsCertificates covers https configured before `certs` has run. It fails before
// listening anywhere, and says how to fix it.
func TestServeSecurelyNeedsItsCertificates(t *testing.T) {
	// Arrange.
	configPath, _ := setUpCertificates(t, "0.0.0.0:0")

	// Act.
	code, _, stderr := runWith("-config", configPath)

	// Assert.
	if code != 1 || strings.Contains(stderr, "Run `recipes certs` to make one.") == false {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// madeCertificates writes a config with certificates already made, https on secureListen and http on
// listen, and returns its path.
func madeCertificates(t *testing.T, listen string, secureListen string) string {
	t.Helper()

	withMachineName(t, "j-desktop", nil)
	configPath, _ := setUpCertificates(t, listen)
	if code, _, stderr := runWith("certs", "-config", configPath); code != 0 {
		t.Fatalf("making certificates failed: %q", stderr)
	}
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	content = append(content, []byte("listenSecure: "+secureListen+"\n")...)
	if err := os.WriteFile(configPath, content, 0644); err != nil {
		t.Fatal(err)
	}
	return configPath
}

// TestServeSecurelyFailsWhenHttpsCantListen covers an https address that can't be listened on. It fails
// rather than hanging, naming the address, and never claims the site is open.
func TestServeSecurelyFailsWhenHttpsCantListen(t *testing.T) {
	// Arrange.
	configPath := madeCertificates(t, "0.0.0.0:0", "127.0.0.1:99999")

	// Act.
	code, stdout, stderr := runWith("-config", configPath)

	// Assert.
	if code != 1 || stdout != "" || strings.Contains(stderr, "99999") == false {
		t.Fatalf("got %d %q %q", code, stdout, stderr)
	}
}

// TestServeSecurelyFailsWhenHttpCantListen covers a plain http address that can't be listened on, once
// https already is. It lets https go again before failing, and never claims the site is open.
func TestServeSecurelyFailsWhenHttpCantListen(t *testing.T) {
	// Arrange.
	configPath := madeCertificates(t, "0.0.0.0:99999", "127.0.0.1:0")

	// Act.
	code, stdout, stderr := runWith("-config", configPath)

	// Assert.
	if code != 1 || stdout != "" || strings.Contains(stderr, "99999") == false {
		t.Fatalf("got %d %q %q", code, stdout, stderr)
	}
}

// TestServeStaysPlainOnLoopback covers development, which listens on loopback with the same config and
// must stay off https, so a missing certificate doesn't stop it and its https port can't collide.
func TestServeStaysPlainOnLoopback(t *testing.T) {
	// Arrange- the address is unusable, so serving fails, but only after choosing plain http, where a
	// missing certificate would have stopped it first.
	configPath, _ := setUpCertificates(t, "127.0.0.1:99999")

	// Act.
	code, _, stderr := runWith("-config", configPath)

	// Assert.
	if code != 1 || strings.Contains(stderr, "99999") == false || strings.Contains(stderr, "certs") {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestRunRefusesAnUnknownFlag covers a typo in a flag.
func TestRunRefusesAnUnknownFlag(t *testing.T) {
	// Arrange.
	arguments := []string{"check", "-confg", "config.yaml"}

	// Act.
	code, _, _ := runWith(arguments...)

	// Assert.
	if code != 2 {
		t.Fatalf("got %d, expected 2", code)
	}
}

// TestServeListensWhereTheFlagSays covers -listen, which overrides the config's address. The config's
// address here is a good one, so only the flag's unusable one can make serving fail.
func TestServeListensWhereTheFlagSays(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "127.0.0.1:0")

	// Act.
	code, _, stderr := runWith("-config", configPath, "-listen", "127.0.0.1:99999")

	// Assert.
	if code != 1 || strings.Contains(stderr, "99999") == false {
		t.Fatalf("got %d %q", code, stderr)
	}
}

// TestServesOtherDevicesOnEveryNetwork covers 0.0.0.0, the address the always-on copy listens on.
func TestServesOtherDevicesOnEveryNetwork(t *testing.T) {
	// Arrange.
	address := "0.0.0.0:80"

	// Act.
	reachable := servesOtherDevices(address)

	// Assert.
	if reachable == false {
		t.Fatalf("%s isn't reachable, expected it to be", address)
	}
}

// TestServesOtherDevicesWithNoHost covers an address with only a port, which listens everywhere.
func TestServesOtherDevicesWithNoHost(t *testing.T) {
	// Arrange.
	address := ":80"

	// Act.
	reachable := servesOtherDevices(address)

	// Assert.
	if reachable == false {
		t.Fatalf("%s isn't reachable, expected it to be", address)
	}
}

// TestServesNoOtherDevicesOnLoopback covers 127.0.0.1, the address development listens on.
func TestServesNoOtherDevicesOnLoopback(t *testing.T) {
	// Arrange.
	address := "127.0.0.1:8686"

	// Act.
	reachable := servesOtherDevices(address)

	// Assert.
	if reachable {
		t.Fatalf("%s is reachable, expected it not to be", address)
	}
}

// TestServesNoOtherDevicesOnLocalhost covers localhost, loopback by name.
func TestServesNoOtherDevicesOnLocalhost(t *testing.T) {
	// Arrange.
	address := "localhost:8686"

	// Act.
	reachable := servesOtherDevices(address)

	// Assert.
	if reachable {
		t.Fatalf("%s is reachable, expected it not to be", address)
	}
}

// TestServesNoOtherDevicesOnAnAddressItCantRead covers an address with no port, which can't be listened on.
func TestServesNoOtherDevicesOnAnAddressItCantRead(t *testing.T) {
	// Arrange.
	address := "0.0.0.0"

	// Act.
	reachable := servesOtherDevices(address)

	// Assert.
	if reachable {
		t.Fatalf("%s is reachable, expected it not to be", address)
	}
}

// TestServeFailsOnAnAddressItCantUse covers serving, which is the default with no command, on an address
// that can't be listened on. It has to come back with a failure rather than hang or claim success.
func TestServeFailsOnAnAddressItCantUse(t *testing.T) {
	// Arrange.
	configPath := setUp(t, map[string]string{"test-gravy.yaml": cleanCard}, "127.0.0.1:99999")

	// Act.
	code, stdout, stderr := runWith("-config", configPath)

	// Assert.
	if code != 1 || stdout != "" || stderr == "" {
		t.Fatalf("got %d %q %q", code, stdout, stderr)
	}
}

// settingsFor is a config that listens on listen, and on secureListen for https, with the given name.
func settingsFor(listen string, secureListen string, name string) config.Config {
	return config.Config{RecipesFolder: "/recipes", Listen: listen, ListenSecure: secureListen, Name: name}
}

// TestWelcomeSaysWhereToOpenTheSite covers the everyday downloaded copy: plain http on its own port,
// everywhere, with one network address.
func TestWelcomeSaysWhereToOpenTheSite(t *testing.T) {
	// Arrange.
	settings := settingsFor("0.0.0.0:8686", "", "")

	// Act.
	lines := welcome(settings, false, []string{"192.0.2.10"})

	// Assert.
	expected := []string{
		"Recipes dev, serving the recipes in /recipes.",
		"Open http://localhost:8686 on this computer.",
		"On a phone or tablet on the same Wi-Fi, open http://192.0.2.10:8686.",
	}
	if strings.Join(lines, "\n") != strings.Join(expected, "\n") {
		t.Fatalf("got %q", lines)
	}
}

// TestWelcomeOnHttpsNamesTheSiteAndTheTrustPage covers the always-on copy: https on the usual ports, a
// name of its own, and two network addresses, with the first visit sent to trust the site.
func TestWelcomeOnHttpsNamesTheSiteAndTheTrustPage(t *testing.T) {
	// Arrange.
	settings := settingsFor("0.0.0.0:80", "0.0.0.0:443", "recipes.local")

	// Act.
	lines := welcome(settings, true, []string{"192.0.2.10", "198.51.100.7"})

	// Assert.
	expected := []string{
		"Recipes dev, serving the recipes in /recipes.",
		"Open https://localhost on this computer.",
		"On a phone or tablet on the same Wi-Fi, open https://recipes.local or https://192.0.2.10 or https://198.51.100.7.",
		"A device's first visit goes to http://recipes.local/trust, to trust the site.",
	}
	if strings.Join(lines, "\n") != strings.Join(expected, "\n") {
		t.Fatalf("got %q", lines)
	}
}

// TestWelcomeOnLoopbackStaysOnThisComputer covers development, which no other device can reach.
func TestWelcomeOnLoopbackStaysOnThisComputer(t *testing.T) {
	// Arrange.
	settings := settingsFor("127.0.0.1:8686", "", "recipes.local")

	// Act.
	lines := welcome(settings, false, []string{"192.0.2.10"})

	// Assert.
	if strings.Join(lines, "\n") != "Recipes dev, serving the recipes in /recipes.\nOpen http://localhost:8686 on this computer." {
		t.Fatalf("got %q", lines)
	}
}

// TestAddressesForOneAddress covers a site listening on a single network address, which is opened there
// from anywhere.
func TestAddressesForOneAddress(t *testing.T) {
	// Arrange.
	listen := "192.0.2.10:8686"

	// Act.
	here, elsewhere := addressesFor("http", listen, "recipes.local", []string{"198.51.100.7"})

	// Assert.
	if here != "http://192.0.2.10:8686" || strings.Join(elsewhere, " ") != "http://192.0.2.10:8686" {
		t.Fatalf("got %q and %q", here, elsewhere)
	}
}

// TestAddressesForEveryNetworkByPortAlone covers an address of only a port, and the IPv6 way of saying
// everywhere, which both listen on every network.
func TestAddressesForEveryNetworkByPortAlone(t *testing.T) {
	// Arrange.
	listens := []string{":8686", "[::]:8686"}

	// Act.
	results := []string{}
	for _, listen := range listens {
		here, elsewhere := addressesFor("http", listen, "", []string{"192.0.2.10"})
		results = append(results, here+" "+strings.Join(elsewhere, " "))
	}

	// Assert.
	expected := "http://localhost:8686 http://192.0.2.10:8686"
	if results[0] != expected || results[1] != expected {
		t.Fatalf("got %q", results)
	}
}

// TestAddressesForAnAddressItCantRead covers a listen address with no port, which is shown as it is.
func TestAddressesForAnAddressItCantRead(t *testing.T) {
	// Arrange.
	listen := "0.0.0.0"

	// Act.
	here, elsewhere := addressesFor("http", listen, "", []string{"192.0.2.10"})

	// Assert.
	if here != "http://0.0.0.0" || len(elsewhere) != 0 {
		t.Fatalf("got %q and %q", here, elsewhere)
	}
}

// TestTrustAddressStaysHereOnLoopback covers a site no other device can reach, whose trust page is only on
// this computer.
func TestTrustAddressStaysHereOnLoopback(t *testing.T) {
	// Arrange.
	settings := settingsFor("127.0.0.1:8686", "", "")

	// Act.
	address := trustAddress(settings, []string{"192.0.2.10"})

	// Assert.
	if address != "http://localhost:8686" {
		t.Fatalf("got %q", address)
	}
}
