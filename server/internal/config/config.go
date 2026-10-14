// Package config reads config.yaml: where the recipe cards live, where the site listens, and the name it
// goes by on the local network.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"

	"go.yaml.in/yaml/v3"
)

// DefaultListen is where the site listens when the config doesn't say. 0.0.0.0 means every network the
// machine is on, so a phone or tablet on the same Wi-Fi can reach it.
const DefaultListen = "0.0.0.0:8686"

// localName matches a name devices can look up on the local network: one word of letters, digits and inner
// hyphens, then .local. Linux refuses to look up a .local name with more parts than that, and Apple only
// promises two-part names, so a longer one would be announced to nobody.
var localName = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.local$`)

// Config is what config.yaml holds.
type Config struct {
	// RecipesFolder is where the recipe cards live. A relative path is read from the config file's folder,
	// so the config means the same thing whichever folder the server starts in.
	RecipesFolder string `yaml:"recipesFolder"`

	// Listen is the address the site listens on, like 0.0.0.0:8686.
	Listen string `yaml:"listen"`

	// Name is the name other devices find the site by, like recipes.local, which Avahi answers for while the
	// site runs. It's optional: without it, the site goes by the machine's own name.
	Name string `yaml:"name"`
}

// Load reads the config file at path. Unknown keys are refused, so a typo can't quietly fall back to a
// default, and the recipes folder is required, since without it there is no cookbook to serve. A name no
// device could look up is refused too, rather than announced to nobody.
func Load(path string) (Config, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("couldn't read the config: %w", err)
	}

	decoder := yaml.NewDecoder(bytes.NewReader(content))
	decoder.KnownFields(true)
	config := Config{}
	if err := decoder.Decode(&config); err != nil && errors.Is(err, io.EOF) == false {
		return Config{}, fmt.Errorf("couldn't read %s: %w", path, err)
	}

	if config.RecipesFolder == "" {
		return Config{}, fmt.Errorf("%s needs a recipesFolder: the folder holding the recipe cards", path)
	}
	if config.Name != "" && localName.MatchString(config.Name) == false {
		return Config{}, fmt.Errorf("%s names the site %q, but devices only look up one word and .local, like recipes.local", path, config.Name)
	}

	// anchor a relative folder to the config file, not to wherever the server happened to start.
	if filepath.IsAbs(config.RecipesFolder) == false {
		config.RecipesFolder = filepath.Join(filepath.Dir(path), config.RecipesFolder)
	}
	if config.Listen == "" {
		config.Listen = DefaultListen
	}
	return config, nil
}
