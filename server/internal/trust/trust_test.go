package trust

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"recipes/server/internal/certs"
)

// The plain-http side owes a new device the only two things it can use before it trusts the site, the
// trust page and the authority to download, and owes every other visitor a temporary redirect to the same
// place on https, on the same name they used. A permanent redirect would outlive a broken https.

// authority makes a real certificate authority in a temporary folder and returns its file.
func authority(t *testing.T) string {
	t.Helper()

	folder := t.TempDir()
	if _, err := certs.Issue(folder, "Recipes on j-desktop", []string{"recipes.local"}, time.Now()); err != nil {
		t.Fatal(err)
	}
	return filepath.Join(folder, certs.AuthorityFile)
}

// visit sends one plain-http request to the routes and returns the response.
func visit(t *testing.T, routes http.Handler, host string, path string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Host = host
	recorder := httptest.NewRecorder()
	routes.ServeHTTP(recorder, request)
	return recorder
}

// TestTrustPageNamesTheAuthorityAndTheWayBack covers the page a new device opens first.
func TestTrustPageNamesTheAuthorityAndTheWayBack(t *testing.T) {
	// Arrange.
	routes, err := Routes(authority(t), "443")
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response := visit(t, routes, "recipes.local", "/trust")

	// Assert.
	body := response.Body.String()
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "text/html; charset=utf-8" {
		t.Fatalf("got %d %q", response.Code, response.Header().Get("Content-Type"))
	}
	if strings.Contains(body, "Recipes on j-desktop") == false || strings.Contains(body, `href="https://recipes.local/"`) == false {
		t.Fatalf("the page doesn't name the authority or link back to https:\n%s", body)
	}
}

// TestAuthorityDownloadsAsACertificate covers the download, which has to arrive as a certificate for an
// iPhone to offer to install it.
func TestAuthorityDownloadsAsACertificate(t *testing.T) {
	// Arrange.
	file := authority(t)
	routes, err := Routes(file, "443")
	if err != nil {
		t.Fatal(err)
	}
	expected, _ := os.ReadFile(file)

	// Act.
	response := visit(t, routes, "recipes.local", "/ca.crt")

	// Assert.
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/x-x509-ca-cert" {
		t.Fatalf("got %d %q", response.Code, response.Header().Get("Content-Type"))
	}
	if response.Body.String() != string(expected) {
		t.Fatal("sent something other than the authority")
	}
}

// TestEverythingElseGoesToHttpsTemporarily covers a page visit over plain http, query and all.
func TestEverythingElseGoesToHttpsTemporarily(t *testing.T) {
	// Arrange.
	routes, err := Routes(authority(t), "443")
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response := visit(t, routes, "recipes.local", "/search?q=so1")

	// Assert.
	if response.Code != http.StatusTemporaryRedirect || response.Header().Get("Location") != "https://recipes.local/search?q=so1" {
		t.Fatalf("got %d to %q", response.Code, response.Header().Get("Location"))
	}
}

// TestRedirectKeepsTheNameAndDropsThePlainPort covers a visitor who used the machine's own name and an
// explicit http port: they stay on that name, and the http port doesn't follow them to https.
func TestRedirectKeepsTheNameAndDropsThePlainPort(t *testing.T) {
	// Arrange.
	routes, err := Routes(authority(t), "443")
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response := visit(t, routes, "j-desktop.local:80", "/recipes/chimichurri")

	// Assert.
	if response.Header().Get("Location") != "https://j-desktop.local/recipes/chimichurri" {
		t.Fatalf("got %q", response.Header().Get("Location"))
	}
}

// TestRedirectNamesAnUnusualHttpsPort covers https on a port other than 443, which the address then needs.
func TestRedirectNamesAnUnusualHttpsPort(t *testing.T) {
	// Arrange.
	routes, err := Routes(authority(t), "8443")
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response := visit(t, routes, "recipes.local:8080", "/")

	// Assert.
	if response.Header().Get("Location") != "https://recipes.local:8443/" {
		t.Fatalf("got %q", response.Header().Get("Location"))
	}
}

// TestRedirectBracketsAnIPv6Address covers a visitor who used an IPv6 address, which needs its brackets in
// an address without a port.
func TestRedirectBracketsAnIPv6Address(t *testing.T) {
	// Arrange.
	routes, err := Routes(authority(t), "443")
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response := visit(t, routes, "[fde2::19]:80", "/")

	// Assert.
	if response.Header().Get("Location") != "https://[fde2::19]/" {
		t.Fatalf("got %q", response.Header().Get("Location"))
	}
}

// TestRoutesFailWithoutTheAuthority covers a certificates folder that's missing its authority.
func TestRoutesFailWithoutTheAuthority(t *testing.T) {
	// Arrange.
	file := filepath.Join(t.TempDir(), certs.AuthorityFile)

	// Act.
	_, err := Routes(file, "443")

	// Assert.
	if err == nil || strings.Contains(err.Error(), "couldn't read the certificate authority") == false {
		t.Fatalf("got %v, expected a missing-authority error", err)
	}
}

// TestRoutesFailOnAnAuthorityThatIsntOne covers an authority file holding something else.
func TestRoutesFailOnAnAuthorityThatIsntOne(t *testing.T) {
	// Arrange.
	file := filepath.Join(t.TempDir(), certs.AuthorityFile)
	if err := os.WriteFile(file, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := Routes(file, "443")

	// Assert.
	if err == nil || strings.Contains(err.Error(), "doesn't hold a certificate") == false {
		t.Fatalf("got %v, expected a complaint about the file", err)
	}
}
