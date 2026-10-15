// Package trust is the plain-http side of a site that runs on https. It sends every visitor to https,
// except for the two things a new device needs before https can work for it: the page that walks it through
// trusting the site's certificate authority, and the authority itself to download. Those have to stay on
// plain http, since a device that doesn't trust the authority yet can't open anything over https.
package trust

import (
	"crypto/x509"
	_ "embed"
	"encoding/pem"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

//go:embed trust.html
var pageSource string

// page is the trust page. It's a single file with everything inline, since anything it linked to would be
// sent to https, which the device reading it can't open yet.
var page = template.Must(template.New("trust").Parse(pageSource))

// pageData is what the trust page fills in: the authority's name as each device's settings will list it,
// and the https address to open once it's trusted.
type pageData struct {
	AuthorityName string
	SecureAddress string
}

// Routes returns the plain-http side of the site: the trust page at /trust, the authority at /ca.crt, and
// a temporary redirect to https for everything else. The redirect is temporary on purpose: browsers keep
// permanent ones forever, and if https ever broke, plain http would then be unreachable too.
func Routes(authorityFile string, securePort string) (http.Handler, error) {
	authority, err := os.ReadFile(authorityFile)
	if err != nil {
		return nil, fmt.Errorf("couldn't read the certificate authority: %w", err)
	}
	name, err := commonName(authority)
	if err != nil {
		return nil, fmt.Errorf("couldn't read %s: %w", authorityFile, err)
	}

	routes := http.NewServeMux()
	routes.HandleFunc("GET /trust", func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-cache")
		data := pageData{AuthorityName: name, SecureAddress: secureAddress(request, securePort, "/")}
		if err := page.Execute(writer, data); err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
		}
	})
	routes.HandleFunc("GET /ca.crt", func(writer http.ResponseWriter, request *http.Request) {
		// this type is what makes an iPhone offer to install it as a profile, rather than show it as text.
		writer.Header().Set("Content-Type", "application/x-x509-ca-cert")
		writer.Header().Set("Content-Disposition", `attachment; filename="recipes-ca.crt"`)
		writer.Write(authority)
	})
	routes.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		target := secureAddress(request, securePort, request.URL.Path)
		if request.URL.RawQuery != "" {
			target += "?" + request.URL.RawQuery
		}
		http.Redirect(writer, request, target, http.StatusTemporaryRedirect)
	})
	return routes, nil
}

// secureAddress is the https address for a path, on whatever name the visitor used to get here, so
// someone who typed j-desktop.local stays on j-desktop.local. The https port only appears when it isn't
// https's usual 443.
func secureAddress(request *http.Request, securePort string, path string) string {
	host := request.Host
	if name, _, err := net.SplitHostPort(host); err == nil {
		host = name
	}
	if securePort != "443" {
		host = net.JoinHostPort(host, securePort)
	} else if strings.Contains(host, ":") {
		// an IPv6 address needs its brackets back once the port is gone.
		host = "[" + host + "]"
	}
	address := url.URL{Scheme: "https", Host: host, Path: path}
	return address.String()
}

// commonName reads the name an authority calls itself, which is how a device's settings list it.
func commonName(authority []byte) (string, error) {
	block, _ := pem.Decode(authority)
	if block == nil {
		return "", fmt.Errorf("it doesn't hold a certificate")
	}
	certificate, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return "", err
	}
	return certificate.Subject.CommonName, nil
}
