package cards

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"

	"go.yaml.in/yaml/v3"
)

// gamesFile lists the games that get a shelf of their own on the home page. It sits in the recipes folder
// beside the cards, and its underscore keeps it from being read as one, the same as the template's.
const gamesFile = "_games.yaml"

// gameTag marks a recipe as a dish from a game. The home page keeps those off Home Cooking and shows each
// one on its game's shelf instead.
const gameTag = "game"

// Game is one game with a shelf on the home page: the tag its recipes carry, the short label on the
// shelf's chip, and the full name over its list.
type Game struct {
	Tag   string `yaml:"tag" json:"tag"`
	Label string `yaml:"label" json:"label"`
	Name  string `yaml:"name" json:"name"`
}

// loadGames reads the games file, when there is one. No file just means no game shelves, which is no
// problem at all. Anything wrong is reported against the file, and a game that breaks a rule is left off
// the home page rather than shown half right, while the games around it still get their shelves.
func loadGames(folder string) ([]Game, []Problem) {
	content, err := os.ReadFile(filepath.Join(folder, gamesFile))
	if errors.Is(err, fs.ErrNotExist) {
		return []Game{}, []Problem{}
	}
	if err != nil {
		return []Game{}, []Problem{{File: gamesFile, Message: "Couldn't read the file: " + err.Error()}}
	}

	games, messages := decodeGames(content)
	if len(messages) > 0 {
		return []Game{}, appendProblems([]Problem{}, gamesFile, messages)
	}
	return checkGames(games)
}

// decodeGames reads the games file as strictly as a card, so a misspelled field is caught rather than
// quietly dropped. A file holding nothing but comments lists no games.
func decodeGames(content []byte) ([]Game, []string) {
	decoder := yaml.NewDecoder(bytes.NewReader(content))
	decoder.KnownFields(true)

	games := []Game{}
	err := decoder.Decode(&games)
	if errors.Is(err, io.EOF) {
		return []Game{}, nil
	}
	if err != nil {
		return []Game{}, describeDecodeError(err, "a game, which has a tag, a label and a name")
	}
	return games, nil
}

// checkGames applies the rules decoding can't: every game needs all three fields, and a tag gets one shelf,
// so a second game with the same tag is a mistake. It returns the games that passed, in order, and one
// problem per broken rule.
func checkGames(games []Game) ([]Game, []Problem) {
	kept := []Game{}
	problems := []Problem{}
	owners := map[string]int{}
	for index, game := range games {
		where := fmt.Sprintf("Game %d", index+1)
		messages := []string{}
		if isBlank(game.Tag) {
			messages = append(messages, where+" needs a tag.")
		}
		if isBlank(game.Label) {
			messages = append(messages, where+" needs a label.")
		}
		if isBlank(game.Name) {
			messages = append(messages, where+" needs a name.")
		}
		if owner, taken := owners[game.Tag]; taken {
			messages = append(messages, fmt.Sprintf("%s has the same tag as game %d, %s. Each tag gets one shelf.",
				where, owner, game.Tag))
		}

		if len(messages) > 0 {
			problems = appendProblems(problems, gamesFile, messages)
			continue
		}
		owners[game.Tag] = index + 1
		kept = append(kept, game)
	}
	return kept, problems
}

// findShelfless reports every top-level card tagged as a game's dish whose game isn't in the games file.
// The home page shows those dishes only on their game's shelf, so without one the card would sit on no
// shelf at all. A card in a collection still has its collection's shelf, so it's left alone.
func findShelfless(recipes []Recipe, games []Game) []Problem {
	shelved := map[string]bool{}
	for _, game := range games {
		shelved[game.Tag] = true
	}

	problems := []Problem{}
	for _, recipe := range recipes {
		if recipe.Collection != "" || slices.Contains(recipe.Card.Tags, gameTag) == false {
			continue
		}

		// any one of its tags having a shelf is enough, since a dish can come from several games.
		hasShelf := slices.ContainsFunc(recipe.Card.Tags, func(tag string) bool {
			return shelved[tag]
		})
		if hasShelf {
			continue
		}
		problems = append(problems, Problem{
			File: recipe.File,
			Message: fmt.Sprintf("Tagged %s, but none of its tags is a game in %s, so it's on no shelf. "+
				"Add its game there.", gameTag, gamesFile),
		})
	}
	return problems
}
