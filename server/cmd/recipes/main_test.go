package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
	if code != 2 || stderr != "There's no \"chekc\" command. Use serve or check.\n" {
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
	code, stdout, _ := runWith("-config", configPath, "-listen", "127.0.0.1:99999")

	// Assert.
	if code != 1 || strings.HasSuffix(stdout, "at http://127.0.0.1:99999\n") == false {
		t.Fatalf("got %d %q", code, stdout)
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
	if code != 1 || strings.HasPrefix(stdout, "Serving the recipes in") == false || stderr == "" {
		t.Fatalf("got %d %q %q", code, stdout, stderr)
	}
}
