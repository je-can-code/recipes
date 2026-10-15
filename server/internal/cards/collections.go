package cards

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"go.yaml.in/yaml/v3"
)

// collectionsFile lists the collections that get a shelf of their own on the home page. It sits in the
// recipes folder beside the cards, and its underscore keeps it from being read as one, the same as the
// template's.
const collectionsFile = "_collections.yaml"

// Collection is a group of recipes with a shelf on the home page, like the dishes from one game or every
// cocktail: the tag its recipes carry, the short label on the shelf's chip, and the full name over its
// list. A recipe carrying several collections' tags is on each of their shelves.
type Collection struct {
	Tag   string `yaml:"tag" json:"tag"`
	Label string `yaml:"label" json:"label"`
	Name  string `yaml:"name" json:"name"`
}

// loadCollections reads the collections file, when there is one. No file just means no collection shelves,
// which is no problem at all. Anything wrong is reported against the file, and a collection that breaks a
// rule is left off the home page rather than shown half right, while the collections around it still get
// their shelves.
func loadCollections(folder string) ([]Collection, []Problem) {
	content, err := os.ReadFile(filepath.Join(folder, collectionsFile))
	if errors.Is(err, fs.ErrNotExist) {
		return []Collection{}, []Problem{}
	}
	if err != nil {
		return []Collection{}, []Problem{{File: collectionsFile, Message: "Couldn't read the file: " + err.Error()}}
	}

	collections, messages := decodeCollections(content)
	if len(messages) > 0 {
		return []Collection{}, appendProblems([]Problem{}, collectionsFile, messages)
	}
	return checkCollections(collections)
}

// decodeCollections reads the collections file as strictly as a card, so a misspelled field is caught rather
// than quietly dropped. A file holding nothing but comments lists no collections.
func decodeCollections(content []byte) ([]Collection, []string) {
	decoder := yaml.NewDecoder(bytes.NewReader(content))
	decoder.KnownFields(true)

	collections := []Collection{}
	err := decoder.Decode(&collections)
	if errors.Is(err, io.EOF) {
		return []Collection{}, nil
	}
	if err != nil {
		return []Collection{}, describeDecodeError(err, "a collection, which has a tag, a label and a name")
	}
	return collections, nil
}

// checkCollections applies the rules decoding can't: every collection needs all three fields, and a tag
// gets one shelf, so a second collection with the same tag is a mistake. It returns the collections that
// passed, in order, and one problem per broken rule.
func checkCollections(collections []Collection) ([]Collection, []Problem) {
	kept := []Collection{}
	problems := []Problem{}
	owners := map[string]int{}
	for index, collection := range collections {
		where := fmt.Sprintf("Collection %d", index+1)
		messages := []string{}
		if isBlank(collection.Tag) {
			messages = append(messages, where+" needs a tag.")
		}
		if isBlank(collection.Label) {
			messages = append(messages, where+" needs a label.")
		}
		if isBlank(collection.Name) {
			messages = append(messages, where+" needs a name.")
		}
		if owner, taken := owners[collection.Tag]; taken {
			messages = append(messages, fmt.Sprintf("%s has the same tag as collection %d, %s. Each tag gets one shelf.",
				where, owner, collection.Tag))
		}

		if len(messages) > 0 {
			problems = appendProblems(problems, collectionsFile, messages)
			continue
		}
		owners[collection.Tag] = index + 1
		kept = append(kept, collection)
	}
	return kept, problems
}
