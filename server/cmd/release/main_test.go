package main

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The release owes a stranger a zip that runs as it is: the program allowed to run, a config, the starter
// cards and the note on getting going, all inside one folder. Above all it owes them nothing that's a
// secret: a private key in a download hands the trust every device placed in it to whoever unzips it.

// linux is the Linux target, for tests that need one.
var linux = targets[2]

// starterCards is a folder of cards, listed out of order.
var starterCards = map[string][]byte{
	"rice-omelet.yaml":      []byte("title: Rice Omelet\n"),
	"_template.yaml":        []byte("# the format\n"),
	"fruit-punch.yaml":      []byte("title: Fruit Punch\n"),
	"prehistoric-meat.yaml": []byte("title: Prehistoric Meat\n"),
}

// namesOf lists the entries' names, in order.
func namesOf(entries []entry) []string {
	names := []string{}
	for _, item := range entries {
		names = append(names, item.name)
	}
	return names
}

// TestEntriesForLaysOutOneFolder covers a zip's layout: the program, the config, the note and the cards, in
// a fixed order inside one folder named for the version and the computer.
func TestEntriesForLaysOutOneFolder(t *testing.T) {
	// Arrange.
	program, config := []byte("program"), []byte("recipesFolder: recipe-cards\n")

	// Act.
	entries := entriesFor(linux, "v1.0.0", program, config, starterCards)

	// Assert.
	expected := []string{
		"recipes-v1.0.0-linux/recipes",
		"recipes-v1.0.0-linux/config.yaml",
		"recipes-v1.0.0-linux/START-HERE.txt",
		"recipes-v1.0.0-linux/recipe-cards/_template.yaml",
		"recipes-v1.0.0-linux/recipe-cards/fruit-punch.yaml",
		"recipes-v1.0.0-linux/recipe-cards/prehistoric-meat.yaml",
		"recipes-v1.0.0-linux/recipe-cards/rice-omelet.yaml",
	}
	if strings.Join(namesOf(entries), "\n") != strings.Join(expected, "\n") {
		t.Fatalf("got %q", namesOf(entries))
	}
	if entries[0].mode != 0o755 || entries[0].program == false || entries[1].mode != 0o644 || string(entries[1].data) != string(config) {
		t.Fatalf("got the program as %+v and the config as %+v", entries[0], entries[1])
	}
}

// TestEntriesForPointsTheNoteAtTheReadme covers the note on getting going, which links to the full
// instructions rather than leaving a placeholder.
func TestEntriesForPointsTheNoteAtTheReadme(t *testing.T) {
	// Arrange.
	program, config := []byte("program"), []byte("")

	// Act.
	entries := entriesFor(linux, "v1.0.0", program, config, map[string][]byte{})

	// Assert.
	note := string(entries[2].data)
	if strings.Contains(note, "{readme}") || strings.Contains(note, "https://github.com/je-can-code/recipes#readme") == false {
		t.Fatalf("got %q", note)
	}
}

// TestEntriesForNamesTheWindowsProgram covers Windows, whose program ends in .exe.
func TestEntriesForNamesTheWindowsProgram(t *testing.T) {
	// Arrange.
	windows := targets[1]

	// Act.
	entries := entriesFor(windows, "v1.0.0", []byte("program"), []byte(""), map[string][]byte{})

	// Assert.
	if entries[0].name != "recipes-v1.0.0-windows/recipes.exe" {
		t.Fatalf("got %q", entries[0].name)
	}
}

// TestRefuseSecretsPassesAReleaseLayout covers an ordinary zip, which has nothing to refuse.
func TestRefuseSecretsPassesAReleaseLayout(t *testing.T) {
	// Arrange.
	entries := entriesFor(linux, "v1.0.0", []byte("program"), []byte("listen: 0.0.0.0:8686\n"), starterCards)

	// Act.
	err := refuseSecrets(entries)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
}

// TestRefuseSecretsRefusesACertificatesFolder covers anything from a certificates folder, whatever it's
// called inside it.
func TestRefuseSecretsRefusesACertificatesFolder(t *testing.T) {
	// Arrange.
	entries := []entry{{name: "recipes-v1.0.0-linux/certs/site.crt", mode: 0o644, data: []byte("certificate")}}

	// Act.
	err := refuseSecrets(entries)

	// Assert.
	if err == nil || err.Error() != "recipes-v1.0.0-linux/certs/site.crt comes from a certificates folder, which never goes in a release" {
		t.Fatalf("got %v", err)
	}
}

// TestRefuseSecretsRefusesAKeyFile covers a key file anywhere, named the way the certs command names them.
func TestRefuseSecretsRefusesAKeyFile(t *testing.T) {
	// Arrange.
	entries := []entry{{name: "recipes-v1.0.0-linux/recipe-cards/ca.key", mode: 0o644, data: []byte("key")}}

	// Act.
	err := refuseSecrets(entries)

	// Assert.
	if err == nil || err.Error() != "recipes-v1.0.0-linux/recipe-cards/ca.key is a private key, which never goes in a release" {
		t.Fatalf("got %v", err)
	}
}

// TestRefuseSecretsRefusesAKeyByWhatItHolds covers a private key under an innocent name.
func TestRefuseSecretsRefusesAKeyByWhatItHolds(t *testing.T) {
	// Arrange.
	key := []byte("-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----\n")
	entries := []entry{{name: "recipes-v1.0.0-linux/config.yaml", mode: 0o644, data: key}}

	// Act.
	err := refuseSecrets(entries)

	// Assert.
	if err == nil || err.Error() != "recipes-v1.0.0-linux/config.yaml holds a private key, which never goes in a release" {
		t.Fatalf("got %v", err)
	}
}

// TestRefuseSecretsLeavesTheProgramAlone covers the program, which is built here and carries the words a
// key file starts with, since it reads and writes them.
func TestRefuseSecretsLeavesTheProgramAlone(t *testing.T) {
	// Arrange.
	entries := []entry{{name: "recipes-v1.0.0-linux/recipes", mode: 0o755, data: []byte("EC PRIVATE KEY-----"), program: true}}

	// Act.
	err := refuseSecrets(entries)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
}

// TestWriteZipKeepsWhatEachFileHolds covers writing a zip and reading it back: every file, its contents,
// its date, and the program's permission to run.
func TestWriteZipKeepsWhatEachFileHolds(t *testing.T) {
	// Arrange.
	zipPath := filepath.Join(t.TempDir(), "recipes.zip")
	entries := entriesFor(linux, "v1.0.0", []byte("program"), []byte("listen: 0.0.0.0:8686\n"), starterCards)
	made := time.Date(2026, 10, 15, 11, 40, 0, 0, time.UTC)

	// Act.
	err := writeZip(zipPath, entries, made)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	if len(reader.File) != len(entries) {
		t.Fatalf("got %d files, expected %d", len(reader.File), len(entries))
	}
	for index, file := range reader.File {
		part, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(part)
		part.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name != entries[index].name || file.Mode().Perm() != entries[index].mode || bytes.Equal(content, entries[index].data) == false {
			t.Fatalf("file %d came back as %s %v %q", index, file.Name, file.Mode(), content)
		}
		if file.Modified.UTC().Equal(made) == false {
			t.Fatalf("file %d is dated %v, expected %v", index, file.Modified, made)
		}
	}
}

// TestChooseEveryComputer covers a release with no computer named, which builds for all three.
func TestChooseEveryComputer(t *testing.T) {
	// Arrange.
	only := ""

	// Act.
	chosen, err := choose(only)

	// Assert.
	if err != nil || len(chosen) != 3 || chosen[0].name != "mac" || chosen[1].name != "windows" || chosen[2].name != "linux" {
		t.Fatalf("got %v %v", chosen, err)
	}
}

// TestChooseOneComputer covers -only, which the tests on every push use to build Linux alone.
func TestChooseOneComputer(t *testing.T) {
	// Arrange.
	only := "linux"

	// Act.
	chosen, err := choose(only)

	// Assert.
	if err != nil || len(chosen) != 1 || chosen[0].goos != "linux" || chosen[0].goarch != "amd64" {
		t.Fatalf("got %v %v", chosen, err)
	}
}

// TestRunRefusesAComputerItDoesntBuildFor covers a name no target has.
func TestRunRefusesAComputerItDoesntBuildFor(t *testing.T) {
	// Arrange.
	stdout, stderr := bytes.Buffer{}, bytes.Buffer{}

	// Act.
	code := run([]string{"-only", "intel-mac"}, &stdout, &stderr)

	// Assert.
	if code != 2 || stderr.String() != "there's no \"intel-mac\" to build for. Use mac, windows or linux\n" {
		t.Fatalf("got %d %q", code, stderr.String())
	}
}

// TestRunNeedsTheWebsiteBuilt covers running before the website is built into the program, which would
// ship a program with no website in it.
func TestRunNeedsTheWebsiteBuilt(t *testing.T) {
	// Arrange- an empty folder, with no built website.
	t.Chdir(t.TempDir())
	stdout, stderr := bytes.Buffer{}, bytes.Buffer{}

	// Act.
	code := run([]string{"-only", "linux"}, &stdout, &stderr)

	// Assert.
	if code != 1 || strings.Contains(stderr.String(), "Run `bun run release`") == false {
		t.Fatalf("got %d %q", code, stderr.String())
	}
	if _, err := os.Stat("../release"); err == nil {
		t.Fatal("made a release folder anyway")
	}
}
