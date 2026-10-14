// Package certs makes the certificates that let the site run on https: a certificate authority of the
// site's own, which each device trusts once, and the site's certificate, which that authority signs.
//
// Browsers only treat an https page as secure when they trust whoever signed its certificate, and no
// public authority will sign for a name like recipes.local. So the site signs its own, and each device is
// told once to trust the authority that did it.
package certs

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

const (
	// AuthorityFile is the certificate authority devices download and trust.
	AuthorityFile = "ca.crt"

	// SiteFile and SiteKeyFile are the site's certificate and its private key, which the server loads.
	SiteFile    = "site.crt"
	SiteKeyFile = "site.key"

	// authorityKeyFile is the authority's private key. It never leaves this machine.
	authorityKeyFile = "ca.key"

	// siteLifetime is how long a site certificate lasts. Apple refuses one signed by an authority a person
	// installed if it lasts longer than 825 days, so this stays a little under.
	siteLifetime = 800 * 24 * time.Hour

	// authorityLifetime is how long the authority lasts. Each device trusts it by hand, so it lasts long.
	authorityLifetime = 10 * 365 * 24 * time.Hour
)

// Issued says what Issue did: whether it had to make a new authority, which names the site certificate
// covers, and when that certificate runs out.
type Issued struct {
	MadeAuthority bool
	Names         []string
	Expires       time.Time
}

// Issue makes the certificate authority in folder if there isn't one yet, then issues the site a new
// certificate for names, replacing any old one. The authority is kept from one run to the next, so
// renewing the site's certificate never asks a device to trust anything new. Half an authority, a
// certificate without its key or the other way round, is refused rather than replaced, since devices may
// already trust it.
func Issue(folder string, authorityName string, names []string, now time.Time) (Issued, error) {
	if err := os.MkdirAll(folder, 0o700); err != nil {
		return Issued{}, err
	}

	authority, authorityKey, made, err := loadOrMakeAuthority(folder, authorityName, now)
	if err != nil {
		return Issued{}, err
	}

	siteKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return Issued{}, err
	}
	serial, err := serialNumber()
	if err != nil {
		return Issued{}, err
	}
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: names[0]},
		DNSNames:     names,
		NotBefore:    now.Add(-time.Hour),
		NotAfter:     now.Add(siteLifetime),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, authority, &siteKey.PublicKey, authorityKey)
	if err != nil {
		return Issued{}, err
	}
	if err := writePEM(filepath.Join(folder, SiteFile), "CERTIFICATE", der, 0o644); err != nil {
		return Issued{}, err
	}
	if err := writeKey(filepath.Join(folder, SiteKeyFile), siteKey); err != nil {
		return Issued{}, err
	}
	return Issued{MadeAuthority: made, Names: names, Expires: template.NotAfter}, nil
}

// loadOrMakeAuthority reads the authority from folder, or makes one when neither of its files is there.
// It returns the authority's certificate and key, and whether it was made just now.
func loadOrMakeAuthority(folder string, name string, now time.Time) (*x509.Certificate, *ecdsa.PrivateKey, bool, error) {
	certificatePath := filepath.Join(folder, AuthorityFile)
	keyPath := filepath.Join(folder, authorityKeyFile)
	hasCertificate := exists(certificatePath)
	hasKey := exists(keyPath)

	if hasCertificate && hasKey {
		certificate, key, err := loadAuthority(certificatePath, keyPath)
		return certificate, key, false, err
	}
	if hasCertificate || hasKey {
		return nil, nil, false, fmt.Errorf("%s holds half a certificate authority: %s and %s go together. Put the missing one back, or remove both to start over and trust the new one on every device", folder, AuthorityFile, authorityKeyFile)
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, false, err
	}
	serial, err := serialNumber()
	if err != nil {
		return nil, nil, false, err
	}
	template := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: name, Organization: []string{"Recipes"}},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.Add(authorityLifetime),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLenZero:        true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return nil, nil, false, err
	}
	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, nil, false, err
	}
	if err := writePEM(certificatePath, "CERTIFICATE", der, 0o644); err != nil {
		return nil, nil, false, err
	}
	if err := writeKey(keyPath, key); err != nil {
		return nil, nil, false, err
	}
	return certificate, key, true, nil
}

// loadAuthority reads an authority's certificate and private key.
func loadAuthority(certificatePath string, keyPath string) (*x509.Certificate, *ecdsa.PrivateKey, error) {
	certificateDER, err := readPEM(certificatePath, "CERTIFICATE")
	if err != nil {
		return nil, nil, err
	}
	certificate, err := x509.ParseCertificate(certificateDER)
	if err != nil {
		return nil, nil, fmt.Errorf("couldn't read %s: %w", certificatePath, err)
	}

	keyDER, err := readPEM(keyPath, "PRIVATE KEY")
	if err != nil {
		return nil, nil, err
	}
	parsed, err := x509.ParsePKCS8PrivateKey(keyDER)
	if err != nil {
		return nil, nil, fmt.Errorf("couldn't read %s: %w", keyPath, err)
	}
	key, isECDSA := parsed.(*ecdsa.PrivateKey)
	if isECDSA == false {
		return nil, nil, fmt.Errorf("%s isn't the kind of key this makes", keyPath)
	}
	return certificate, key, nil
}

// Expiry reads when the site certificate in folder runs out, so the server can say so when it starts.
func Expiry(folder string) (time.Time, error) {
	der, err := readPEM(filepath.Join(folder, SiteFile), "CERTIFICATE")
	if err != nil {
		return time.Time{}, err
	}
	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		return time.Time{}, err
	}
	return certificate.NotAfter, nil
}

// serialNumber makes a random 128-bit serial number, which is how certificates tell themselves apart.
func serialNumber() (*big.Int, error) {
	return rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
}

// writeKey saves a private key, readable only by its owner.
func writeKey(path string, key *ecdsa.PrivateKey) error {
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return err
	}
	return writePEM(path, "PRIVATE KEY", der, 0o600)
}

// writePEM saves one PEM block, with the given permissions even when the file was already there.
func writePEM(path string, kind string, der []byte, permissions fs.FileMode) error {
	content := pem.EncodeToMemory(&pem.Block{Type: kind, Bytes: der})
	if err := os.WriteFile(path, content, permissions); err != nil {
		return err
	}
	return os.Chmod(path, permissions)
}

// readPEM reads the first PEM block of the given kind from a file.
func readPEM(path string, kind string) ([]byte, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(content)
	if block == nil || block.Type != kind {
		return nil, fmt.Errorf("%s doesn't hold a %s", path, kind)
	}
	return block.Bytes, nil
}

// exists reports whether there's a file at path.
func exists(path string) bool {
	_, err := os.Stat(path)
	return errors.Is(err, fs.ErrNotExist) == false
}
