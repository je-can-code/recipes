package site

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// Handler owes the browser the app for every page and the real file for every asset. Get that backwards
// and either a recipe link reloads into a 404, or the app's own script comes back as HTML and the page
// stays blank. A binary built before the website must say so, rather than serve nothing.

// builtSite is a stand-in for a built website.
var builtSite = fstest.MapFS{
	"index.html":    {Data: []byte("<html>app</html>")},
	"assets/app.js": {Data: []byte("console.log('app');")},
}

// get requests path from the handler and returns the response.
func get(t *testing.T, handler http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

// TestHandlerServesABuiltFile covers an asset the page asks for.
func TestHandlerServesABuiltFile(t *testing.T) {
	// Arrange.
	handler := Handler(builtSite)

	// Act.
	response := get(t, handler, "/assets/app.js")

	// Assert.
	if response.Code != http.StatusOK || response.Body.String() != "console.log('app');" {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}

// TestHandlerServesTheAppForAPage covers a page path, which has no file behind it.
func TestHandlerServesTheAppForAPage(t *testing.T) {
	// Arrange.
	handler := Handler(builtSite)

	// Act.
	response := get(t, handler, "/recipes/chimichurri")

	// Assert.
	if response.Code != http.StatusOK || response.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("got Cache-Control %q, expected no-cache", response.Header().Get("Cache-Control"))
	}
}

// TestHandlerServesTheAppAtTheRoot covers the home page.
func TestHandlerServesTheAppAtTheRoot(t *testing.T) {
	// Arrange.
	handler := Handler(builtSite)

	// Act.
	response := get(t, handler, "/")

	// Assert.
	if response.Code != http.StatusOK || response.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}

// TestHandlerServesTheAppForIndexHtmlByName covers /index.html, which the file server would otherwise
// answer with a redirect.
func TestHandlerServesTheAppForIndexHtmlByName(t *testing.T) {
	// Arrange.
	handler := Handler(builtSite)

	// Act.
	response := get(t, handler, "/index.html")

	// Assert.
	if response.Code != http.StatusOK || response.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}

// TestHandlerServesTheAppForAFolder covers a path naming a folder of assets rather than a file.
func TestHandlerServesTheAppForAFolder(t *testing.T) {
	// Arrange.
	handler := Handler(builtSite)

	// Act.
	response := get(t, handler, "/assets")

	// Assert.
	if response.Code != http.StatusOK || response.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}

// TestHandlerExplainsAMissingBuild covers a binary built before the website was.
func TestHandlerExplainsAMissingBuild(t *testing.T) {
	// Arrange.
	handler := Handler(fstest.MapFS{})

	// Act.
	response := get(t, handler, "/")

	// Assert.
	if response.Code != http.StatusServiceUnavailable || response.Body.String() != notBuilt {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}

// TestFilesKeepsTheGitkeep covers the embed itself: the placeholder that lets a fresh clone compile has
// to survive into Files, or the all: prefix has gone missing.
func TestFilesKeepsTheGitkeep(t *testing.T) {
	// Arrange.
	files := Files()

	// Act.
	_, err := fs.Stat(files, ".gitkeep")

	// Assert.
	if err != nil {
		t.Fatalf("dist/.gitkeep is missing from the embedded files: %v", err)
	}
}
