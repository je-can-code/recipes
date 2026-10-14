package certs

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Issue owes the site certificates every device will accept once it trusts the authority: a site
// certificate that verifies for each of its names and no other, short enough for Apple's limit, and an
// authority that never changes underneath the devices trusting it. It owes the private keys their privacy.

// now is the moment every test issues certificates at.
var now = time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC)

// names is what the site's certificate covers in these tests.
var names = []string{"recipes.local", "j-desktop.local", "localhost"}

// readCertificate reads the certificate in a PEM file.
func readCertificate(t *testing.T, path string) *x509.Certificate {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode(content)
	certificate, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	return certificate
}

// verifyFor checks the site certificate in folder against its authority for one name, at the given time.
func verifyFor(t *testing.T, folder string, name string, at time.Time) error {
	t.Helper()

	roots := x509.NewCertPool()
	roots.AddCert(readCertificate(t, filepath.Join(folder, AuthorityFile)))
	site := readCertificate(t, filepath.Join(folder, SiteFile))
	_, err := site.Verify(x509.VerifyOptions{DNSName: name, Roots: roots, CurrentTime: at})
	return err
}

// TestIssueMakesAnAuthorityAndASiteCertificateForEveryName covers the first run, in an empty folder.
func TestIssueMakesAnAuthorityAndASiteCertificateForEveryName(t *testing.T) {
	// Arrange.
	folder := filepath.Join(t.TempDir(), "certs")

	// Act.
	issued, err := Issue(folder, "Recipes on j-desktop", names, now)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if issued.MadeAuthority == false || strings.Join(issued.Names, " ") != "recipes.local j-desktop.local localhost" {
		t.Fatalf("got %+v", issued)
	}
	for _, name := range names {
		if err := verifyFor(t, folder, name, now); err != nil {
			t.Fatalf("doesn't verify for %s: %v", name, err)
		}
	}
	if authority := readCertificate(t, filepath.Join(folder, AuthorityFile)); authority.Subject.CommonName != "Recipes on j-desktop" {
		t.Fatalf("the authority calls itself %q", authority.Subject.CommonName)
	}
}

// TestIssueCoversNoOtherName covers a name the certificate wasn't made for, which must not verify.
func TestIssueCoversNoOtherName(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	if _, err := Issue(folder, "Recipes on j-desktop", names, now); err != nil {
		t.Fatal(err)
	}

	// Act.
	err := verifyFor(t, folder, "example.com", now)

	// Assert.
	if err == nil {
		t.Fatal("verified for a name it wasn't made for")
	}
}

// TestIssueStaysUnderApplesLimit covers how long the site certificate lasts: under the 825 days Apple
// accepts from an authority a person installed, and good until then.
func TestIssueStaysUnderApplesLimit(t *testing.T) {
	// Arrange.
	folder := t.TempDir()

	// Act.
	issued, err := Issue(folder, "Recipes on j-desktop", names, now)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	site := readCertificate(t, filepath.Join(folder, SiteFile))
	lifetime := site.NotAfter.Sub(site.NotBefore)
	if lifetime > 825*24*time.Hour || issued.Expires.Equal(site.NotAfter) == false {
		t.Fatalf("lasts %v and says it expires %v, against %v", lifetime, issued.Expires, site.NotAfter)
	}
	if err := verifyFor(t, folder, "recipes.local", now.Add(799*24*time.Hour)); err != nil {
		t.Fatalf("stopped verifying before 800 days: %v", err)
	}
}

// TestIssueKeepsTheAuthorityWhenRenewing covers a second run, which issues a new site certificate under
// the same authority, so devices that trust it need nothing new.
func TestIssueKeepsTheAuthorityWhenRenewing(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	if _, err := Issue(folder, "Recipes on j-desktop", names, now); err != nil {
		t.Fatal(err)
	}
	authorityBefore, _ := os.ReadFile(filepath.Join(folder, AuthorityFile))
	siteBefore, _ := os.ReadFile(filepath.Join(folder, SiteFile))

	// Act.
	issued, err := Issue(folder, "Recipes on j-desktop", names, now.Add(700*24*time.Hour))

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	authorityAfter, _ := os.ReadFile(filepath.Join(folder, AuthorityFile))
	siteAfter, _ := os.ReadFile(filepath.Join(folder, SiteFile))
	if issued.MadeAuthority || bytes.Equal(authorityBefore, authorityAfter) == false {
		t.Fatal("made a new authority when renewing")
	}
	if bytes.Equal(siteBefore, siteAfter) {
		t.Fatal("kept the old site certificate")
	}
	if err := verifyFor(t, folder, "recipes.local", now.Add(1400*24*time.Hour)); err != nil {
		t.Fatalf("the renewed certificate doesn't verify: %v", err)
	}
}

// TestIssueKeepsThePrivateKeysPrivate covers the keys' permissions: only their owner can read them, while
// the certificates stay readable.
func TestIssueKeepsThePrivateKeysPrivate(t *testing.T) {
	// Arrange.
	folder := t.TempDir()

	// Act.
	_, err := Issue(folder, "Recipes on j-desktop", names, now)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string]os.FileMode{"ca.key": 0o600, "site.key": 0o600, "ca.crt": 0o644, "site.crt": 0o644}
	for file, permissions := range expected {
		info, err := os.Stat(filepath.Join(folder, file))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != permissions {
			t.Fatalf("%s is %v, expected %v", file, info.Mode().Perm(), permissions)
		}
	}
}

// TestIssueRefusesHalfAnAuthority covers an authority certificate whose key has gone missing, which must
// be refused rather than replaced, since devices may trust it.
func TestIssueRefusesHalfAnAuthority(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	if _, err := Issue(folder, "Recipes on j-desktop", names, now); err != nil {
		t.Fatal(err)
	}
	authorityBefore, _ := os.ReadFile(filepath.Join(folder, AuthorityFile))
	if err := os.Remove(filepath.Join(folder, "ca.key")); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := Issue(folder, "Recipes on j-desktop", names, now)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "half a certificate authority") == false {
		t.Fatalf("got %v, expected a refusal", err)
	}
	authorityAfter, _ := os.ReadFile(filepath.Join(folder, AuthorityFile))
	if bytes.Equal(authorityBefore, authorityAfter) == false {
		t.Fatal("replaced the authority")
	}
}

// TestIssueFailsOnAnAuthorityItCantRead covers an authority file that isn't a certificate.
func TestIssueFailsOnAnAuthorityItCantRead(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	if _, err := Issue(folder, "Recipes on j-desktop", names, now); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, AuthorityFile), []byte("not a certificate"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := Issue(folder, "Recipes on j-desktop", names, now)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "doesn't hold a CERTIFICATE") == false {
		t.Fatalf("got %v, expected a complaint about the authority", err)
	}
}

// TestExpiryReadsTheSiteCertificate covers the date the server prints when it starts.
func TestExpiryReadsTheSiteCertificate(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	issued, err := Issue(folder, "Recipes on j-desktop", names, now)
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	expires, err := Expiry(folder)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if expires.Equal(issued.Expires) == false || expires.Format("2006-01-02") != "2028-12-22" {
		t.Fatalf("got %v, expected %v", expires, issued.Expires)
	}
}

// TestExpiryFailsWithoutACertificate covers a folder with nothing in it yet.
func TestExpiryFailsWithoutACertificate(t *testing.T) {
	// Arrange.
	folder := t.TempDir()

	// Act.
	_, err := Expiry(folder)

	// Assert.
	if err == nil {
		t.Fatal("expected an error for a missing certificate")
	}
}
