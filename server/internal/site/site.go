// Package site serves the built website: the React app that `bun run build` writes into dist/, baked into
// the binary so the whole cookbook is one file to run.
package site

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// built is the website as the last build left it. The all: prefix keeps dist/.gitkeep, which is what lets
// the Go code compile on a fresh clone, before the website has ever been built.
//
//go:embed all:dist
var built embed.FS

// notBuilt is what the site says when the binary was built before the website was.
const notBuilt = "The website hasn't been built yet. Run `bun run build` in the project folder, then start the " +
	"server again.\n"

// Files returns the built website, rooted at dist/.
func Files() fs.FS {
	files, err := fs.Sub(built, "dist")
	if err != nil {
		// dist is a fixed, valid name, so this can only happen if the embed line above is broken.
		panic(err)
	}
	return files
}

// Handler serves the built website. Real files, like the scripts and styles, are served as they are.
// Every other path gets index.html, so a page like /recipes/chimichurri loads the app, which then shows
// the right recipe. The app decides what each path means; the server only has to hand it over.
func Handler(files fs.FS) http.Handler {
	fileServer := http.FileServerFS(files)
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		name := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
		if name != "" && name != "index.html" && isFile(files, name) {
			fileServer.ServeHTTP(writer, request)
			return
		}
		serveIndex(files, writer)
	})
}

// serveIndex sends the app's page, or a note saying how to build it when there isn't one yet.
func serveIndex(files fs.FS, writer http.ResponseWriter) {
	index, err := fs.ReadFile(files, "index.html")
	if err != nil {
		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		writer.WriteHeader(http.StatusServiceUnavailable)
		_, _ = writer.Write([]byte(notBuilt))
		return
	}

	// the page names the current build's scripts, so the browser should always ask for a fresh copy.
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-cache")
	_, _ = writer.Write(index)
}

// isFile reports whether name is a file, rather than a folder or nothing at all, in the built website.
func isFile(files fs.FS, name string) bool {
	info, err := fs.Stat(files, name)
	return err == nil && info.IsDir() == false
}
