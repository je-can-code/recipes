// Command release builds the downloads a GitHub release carries: one zip for each kind of computer, each
// holding the program, a config that runs as it is, a few recipe cards to start from, and a note on getting
// going. It runs from the server folder once the website has been built into it, which `bun run release`
// does first:
//
//	go run ./cmd/release [-version v1.0.0] [-out ../release] [-only linux]
package main

import (
	"archive/zip"
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// target is one kind of computer a release has a zip for.
type target struct {
	// name goes in the zip's name, like recipes-v1.0.0-mac.zip.
	name string

	// goos and goarch are what Go calls the computer, for building the program.
	goos   string
	goarch string

	// program is the program's file name there.
	program string

	// steps is the note on getting going, START-HERE.txt.
	steps string
}

// entry is one file in a zip: where it goes, its permissions, what it holds, and whether it's the program,
// which is built here rather than copied, so it's the one file not read for keys.
type entry struct {
	name    string
	mode    fs.FileMode
	data    []byte
	program bool
}

// cardsFolder is the folder of recipe cards inside each zip, which the shipped config points at. It can't be
// called recipes, since on a Mac or Linux the program already is.
const cardsFolder = "recipe-cards"

// readme is where the full instructions live, for anything the note in the zip leaves out.
const readme = "https://github.com/je-can-code/recipes#readme"

// targets are the computers a release covers: Macs with Apple's own chips, Windows on Intel and AMD (which
// Windows on ARM runs too), and Linux on Intel and AMD. An Intel Mac or a Raspberry Pi builds from source.
var targets = []target{
	{name: "mac", goos: "darwin", goarch: "arm64", program: "recipes", steps: macSteps},
	{name: "windows", goos: "windows", goarch: "amd64", program: "recipes.exe", steps: windowsSteps},
	{name: "linux", goos: "linux", goarch: "amd64", program: "recipes", steps: linuxSteps},
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// run is main with its inputs and outputs handed in. It returns the exit code: 0 when every zip was
// written, 1 for a failure, 2 for a flag it doesn't know.
func run(arguments []string, stdout io.Writer, stderr io.Writer) int {
	flags := flag.NewFlagSet("release", flag.ContinueOnError)
	flags.SetOutput(stderr)
	version := flags.String("version", "", "the release's version, like v1.0.0; without it, git describes this commit")
	out := flags.String("out", "../release", "the folder to write the zips to")
	root := flags.String("root", "..", "the repository's top folder, which holds config.example.yaml and starter-recipes")
	only := flags.String("only", "", "build the zip for one computer only: mac, windows or linux")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}

	chosen, err := choose(*only)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	if _, err := os.Stat(filepath.Join("internal", "site", "dist", "index.html")); err != nil {
		fmt.Fprintln(stderr, "The website isn't built into the program yet. Run `bun run release`, which builds it first.")
		return 1
	}
	if *version == "" {
		*version = describe()
	}

	config, err := os.ReadFile(filepath.Join(*root, "config.example.yaml"))
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	cards, err := readCards(filepath.Join(*root, "starter-recipes"))
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	for _, computer := range chosen {
		program, err := build(computer, *version)
		if err != nil {
			fmt.Fprintf(stderr, "Couldn't build the program for %s: %v\n", computer.name, err)
			return 1
		}
		entries := entriesFor(computer, *version, program, config, cards)
		if err := refuseSecrets(entries); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		zipPath := filepath.Join(*out, fmt.Sprintf("recipes-%s-%s.zip", *version, computer.name))
		if err := writeZip(zipPath, entries, time.Now()); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		fmt.Fprintf(stdout, "Wrote %s\n", zipPath)
	}
	return 0
}

// choose picks the computers to build for: every one, or only the one named.
func choose(only string) ([]target, error) {
	if only == "" {
		return targets, nil
	}
	for _, computer := range targets {
		if computer.name == only {
			return []target{computer}, nil
		}
	}
	return nil, fmt.Errorf("there's no %q to build for. Use mac, windows or linux", only)
}

// describe names this commit the way git does, like v1.0.0 on a tagged commit, or a short hash between
// tags, marked dirty when files have changed since. Without git, it's dev, as a program built by hand is.
func describe() string {
	output, err := exec.Command("git", "describe", "--tags", "--always", "--dirty").Output()
	if err != nil {
		return "dev"
	}
	return strings.TrimSpace(string(output))
}

// build compiles the program for one computer and returns it. Go builds for any computer from any other
// without its C toolchain, which CGO_ENABLED=0 makes sure of; -trimpath leaves this machine's folders out of
// the program, -s -w leave out the debugging tables, and -X writes the version in.
func build(computer target, version string) ([]byte, error) {
	folder, err := os.MkdirTemp("", "recipes-release-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(folder)

	output := filepath.Join(folder, computer.program)
	command := exec.Command("go", "build", "-trimpath", "-ldflags", "-s -w -X main.version="+version, "-o", output, "./cmd/recipes")
	command.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+computer.goos, "GOARCH="+computer.goarch)
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		return nil, err
	}
	return os.ReadFile(output)
}

// readCards reads every file in the starter cards' folder, by name. The cards sit at its top level, so
// anything deeper is left behind.
func readCards(folder string) (map[string][]byte, error) {
	files, err := os.ReadDir(folder)
	if err != nil {
		return nil, err
	}

	cards := map[string][]byte{}
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		content, err := os.ReadFile(filepath.Join(folder, file.Name()))
		if err != nil {
			return nil, err
		}
		cards[file.Name()] = content
	}
	return cards, nil
}

// entriesFor lays out one computer's zip, all inside a folder named after it, so unzipping never scatters
// files: the program, which has to be allowed to run, the config, the cards, and the note on getting going.
func entriesFor(computer target, version string, program []byte, config []byte, cards map[string][]byte) []entry {
	top := fmt.Sprintf("recipes-%s-%s", version, computer.name)
	entries := []entry{
		{name: path.Join(top, computer.program), mode: 0o755, data: program, program: true},
		{name: path.Join(top, "config.yaml"), mode: 0o644, data: config},
		{name: path.Join(top, "START-HERE.txt"), mode: 0o644, data: []byte(strings.ReplaceAll(computer.steps, "{readme}", readme))},
	}

	// every zip lists its cards in the same order, whatever order the folder gave them in.
	names := []string{}
	for name := range cards {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		entries = append(entries, entry{name: path.Join(top, cardsFolder, name), mode: 0o644, data: cards[name]})
	}
	return entries
}

// refuseSecrets stops a zip that would carry a private key or anything from a certificates folder. Those
// belong to the machine that made them: a device that trusts an authority believes whatever its key signs,
// for any website, so one in a download would hand that trust to everyone who has it.
func refuseSecrets(entries []entry) error {
	for _, item := range entries {
		if slices.Contains(strings.Split(item.name, "/"), "certs") {
			return fmt.Errorf("%s comes from a certificates folder, which never goes in a release", item.name)
		}
		if strings.HasSuffix(item.name, ".key") {
			return fmt.Errorf("%s is a private key, which never goes in a release", item.name)
		}
		if item.program == false && bytes.Contains(item.data, []byte("PRIVATE KEY-----")) {
			return fmt.Errorf("%s holds a private key, which never goes in a release", item.name)
		}
	}
	return nil
}

// writeZip writes entries to a zip at zipPath, keeping each file's permissions, so the program unzips
// ready to run on a Mac or Linux, and dating every file at made. A file without a date unzips as dated
// centuries from now, since a zip counts its years from 1980.
func writeZip(zipPath string, entries []entry, made time.Time) (err error) {
	file, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer func() {
		err = errors.Join(err, file.Close())
	}()

	writer := zip.NewWriter(file)
	for _, item := range entries {
		header := &zip.FileHeader{Name: item.name, Method: zip.Deflate, Modified: made}
		header.SetMode(item.mode)
		part, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		if _, err := part.Write(item.data); err != nil {
			return err
		}
	}
	return writer.Close()
}

// macSteps is the note on getting going on a Mac.
const macSteps = `Recipes, for a Mac with Apple's own chip (M1 or newer)

1. Double-click "recipes". The first time, macOS stops it, since it doesn't come from the App Store or a
   developer Apple knows. Click Done, then open System Settings, go to Privacy & Security, scroll down, and
   click "Open Anyway" beside the note about recipes. Double-click it again and choose Open.

   Or, in Terminal, type "xattr -dr com.apple.quarantine " (with the space), drag this folder onto the
   window, press Return, then double-click "recipes".

2. A Terminal window opens and shows the address to open, like http://localhost:8686. Leave the window
   open while you use the site, since closing it stops the site.

3. On a phone or tablet on the same Wi-Fi, open the other address it shows, like http://192.168.1.23:8686.

Your recipes are the cards in the recipe-cards folder here. To keep them somewhere else, change
recipesFolder in config.yaml. recipe-cards/_template.yaml explains everything a card can hold.

Everything else, like https so a phone keeps its own copy and its screen stays on, is in the README:
{readme}
`

// windowsSteps is the note on getting going on Windows.
const windowsSteps = `Recipes, for Windows

1. Double-click recipes.exe. The first time, Windows may say "Windows protected your PC", since the program
   isn't signed. Click "More info", then "Run anyway". If Windows asks whether to let it use your networks,
   allow private networks, so phones on your Wi-Fi can reach it.

2. A window opens and shows the address to open, like http://localhost:8686. Leave the window open while
   you use the site, since closing it stops the site.

3. On a phone or tablet on the same Wi-Fi, open the other address it shows, like http://192.168.1.23:8686.

Your recipes are the cards in the recipe-cards folder here. To keep them somewhere else, change
recipesFolder in config.yaml. recipe-cards\_template.yaml explains everything a card can hold.

Everything else, like https so a phone keeps its own copy and its screen stays on, is in the README:
{readme}
`

// linuxSteps is the note on getting going on Linux.
const linuxSteps = `Recipes, for Linux

1. In a terminal, in this folder, run ./recipes

2. It shows the address to open, like http://localhost:8686. Leave it running while you use the site.

3. On a phone or tablet on the same Wi-Fi, open the other address it shows, like http://192.168.1.23:8686.

Your recipes are the cards in the recipe-cards folder here. To keep them somewhere else, change
recipesFolder in config.yaml. recipe-cards/_template.yaml explains everything a card can hold.

Everything else, like https so a phone keeps its own copy and its screen stays on, and keeping the site
running all the time, is in the README:
{readme}
`
