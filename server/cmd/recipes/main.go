// Command recipes serves the cookbook website, or checks every recipe card and says what's wrong.
//
//	recipes [-config config.yaml] [-listen address]    serve the site
//	recipes check [-config config.yaml]                check every card, exiting 1 when any has a problem
package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"recipes/server/internal/api"
	"recipes/server/internal/cards"
	"recipes/server/internal/config"
	"recipes/server/internal/site"
)

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
	if command != "serve" && command != "check" {
		fmt.Fprintf(stderr, "There's no %q command. Use serve or check.\n", command)
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

	if command == "check" {
		return check(settings, stdout, stderr)
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

// serve runs the site until the process stops. ListenAndServe only ever returns with an error, such as
// the address already being taken, so reaching the end of this means the site couldn't start or stay up.
func serve(settings config.Config, stdout io.Writer, stderr io.Writer) int {
	shelf := cards.NewShelf(settings.RecipesFolder)
	routes := api.Routes(shelf, site.Handler(site.Files()))

	fmt.Fprintf(stdout, "Serving the recipes in %s at http://%s\n", settings.RecipesFolder, settings.Listen)
	err := http.ListenAndServe(settings.Listen, routes)
	fmt.Fprintln(stderr, err)
	return 1
}

// count words a number of things, singular for exactly one.
func count(number int, thing string) string {
	if number == 1 {
		return fmt.Sprintf("1 %s", thing)
	}
	return fmt.Sprintf("%d %ss", number, thing)
}
