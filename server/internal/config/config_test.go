package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Load owes the server a config it can trust: the recipes folder it names, anchored to the config file
// rather than to wherever the server started, a listen address even when none is given, and a loud
// refusal for a config that is missing, misspelled, has no folder or names the site something no device
// will look up, rather than a server pointed at the wrong place.

// writeConfig writes a config file holding content and returns its path.
func writeConfig(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

// TestLoadReadsEverySetting covers a config that sets everything.
func TestLoadReadsEverySetting(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\nlisten: 127.0.0.1:9000\nname: recipes.local\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if config.RecipesFolder != "/cookbook" || config.Listen != "127.0.0.1:9000" || config.Name != "recipes.local" {
		t.Fatalf("got %+v", config)
	}
}

// TestLoadAnchorsTheCertificatesAndListensSecurelyOn443 covers a config with a relative certificates folder
// and no https address, which gets https's usual port.
func TestLoadAnchorsTheCertificatesAndListensSecurelyOn443(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\ncertificates: certs\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(filepath.Dir(path), "certs")
	if config.Certificates != expected || config.ListenSecure != "0.0.0.0:443" {
		t.Fatalf("got certificates %q on %q, expected %q on 0.0.0.0:443", config.Certificates, config.ListenSecure, expected)
	}
}

// TestLoadKeepsAnAbsoluteCertificatesFolderAndItsAddress covers a config that says exactly where both are.
func TestLoadKeepsAnAbsoluteCertificatesFolderAndItsAddress(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\ncertificates: /secrets\nlistenSecure: 127.0.0.1:8443\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if config.Certificates != "/secrets" || config.ListenSecure != "127.0.0.1:8443" {
		t.Fatalf("got certificates %q on %q", config.Certificates, config.ListenSecure)
	}
}

// TestLoadLeavesHttpsOffWithoutCertificates covers a config with no certificates, which gets no https
// address either, so nothing goes looking for one.
func TestLoadLeavesHttpsOffWithoutCertificates(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\nlisten: 127.0.0.1:9000\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if config.Certificates != "" || config.ListenSecure != "" || config.Listen != "127.0.0.1:9000" {
		t.Fatalf("got %+v", config)
	}
}

// TestLoadRefusesANameWithMoreThanTwoParts covers a name like recipes.j-desktop.local, which Linux won't
// look up at all.
func TestLoadRefusesANameWithMoreThanTwoParts(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\nname: recipes.j-desktop.local\n")

	// Act.
	_, err := Load(path)

	// Assert.
	if err == nil || strings.Contains(err.Error(), `names the site "recipes.j-desktop.local"`) == false {
		t.Fatalf("got %v, expected a refusal of the name", err)
	}
}

// TestLoadRefusesANameOutsideLocal covers a name that doesn't end in .local, which devices never ask the
// local network about.
func TestLoadRefusesANameOutsideLocal(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\nname: recipes.home\n")

	// Act.
	_, err := Load(path)

	// Assert.
	if err == nil || strings.Contains(err.Error(), `names the site "recipes.home"`) == false {
		t.Fatalf("got %v, expected a refusal of the name", err)
	}
}

// TestLoadAnchorsARelativeFolderToTheConfig covers a relative recipes folder.
func TestLoadAnchorsARelativeFolderToTheConfig(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: cards\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(filepath.Dir(path), "cards")
	if config.RecipesFolder != expected {
		t.Fatalf("got folder %q, expected %q", config.RecipesFolder, expected)
	}
}

// TestLoadFallsBackToTheDefaultAddress covers a config with no listen address.
func TestLoadFallsBackToTheDefaultAddress(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\n")

	// Act.
	config, err := Load(path)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if config.Listen != "0.0.0.0:8686" {
		t.Fatalf("got listen %q, expected the default", config.Listen)
	}
}

// TestLoadNeedsARecipesFolder covers a config that doesn't say where the cards are, empty file included.
func TestLoadNeedsARecipesFolder(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "")

	// Act.
	_, err := Load(path)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "needs a recipesFolder") == false {
		t.Fatalf("got %v, expected a missing-folder error", err)
	}
}

// TestLoadRefusesAnUnknownKey covers a misspelled key, which must fail rather than be ignored.
func TestLoadRefusesAnUnknownKey(t *testing.T) {
	// Arrange.
	path := writeConfig(t, "recipesFolder: /cookbook\nlisten_on: 127.0.0.1:9000\n")

	// Act.
	_, err := Load(path)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "field listen_on not found") == false {
		t.Fatalf("got %v, expected an unknown-key error", err)
	}
}

// TestLoadFailsWithoutAConfigFile covers a server started where there is no config.
func TestLoadFailsWithoutAConfigFile(t *testing.T) {
	// Arrange.
	path := filepath.Join(t.TempDir(), "config.yaml")

	// Act.
	_, err := Load(path)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "couldn't read the config") == false {
		t.Fatalf("got %v, expected a missing-file error", err)
	}
}
