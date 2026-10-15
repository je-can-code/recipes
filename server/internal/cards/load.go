package cards

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Problem is something wrong with one file in the recipes folder, worded for the person who has to fix
// it. File is relative to the recipes folder, with forward slashes.
type Problem struct {
	File    string `json:"file"`
	Message string `json:"message"`
}

// Recipe is a card that loaded, with where it lives and its markdown rendered for the site.
type Recipe struct {
	// Slug is the recipe's name: its file name without .yaml, and what links use to reach it.
	Slug string

	// Folder is the folder the card sits in, or empty for a card at the top level. A folder only keeps
	// cards tidy; shelves come from collections.
	Folder string

	// File is where the card lives, relative to the recipes folder, for messages.
	File string

	Card Card
	Page Page
}

// Library is the recipes folder at one moment: every recipe that loaded, sorted by title, the collections
// with shelves on the home page, in the collections file's order, and every problem found along the way.
// All three are always lists, never nil, so the site can show them as they are.
type Library struct {
	Recipes     []Recipe
	Collections []Collection
	Problems    []Problem
}

// Find returns the recipe with the given name, and whether there is one.
func (library Library) Find(slug string) (Recipe, bool) {
	for _, recipe := range library.Recipes {
		if recipe.Slug == slug {
			return recipe, true
		}
	}
	return Recipe{}, false
}

// cardFile is a card waiting to be read.
type cardFile struct {
	path   string
	name   string
	folder string
}

// Load reads every card in the folder, at the top level and one folder down, and the collections file. It
// only fails when the folder itself can't be read, since then there is no cookbook to show. Every other
// problem, from a card that won't decode to a link to a recipe that doesn't exist, lands in Problems while
// everything else still loads.
func Load(folder string) (Library, error) {
	files, problems, err := findCardFiles(folder)
	if err != nil {
		return Library{}, err
	}

	// read every card, keeping the first one with each name, since links need names to be unique.
	recipes := []Recipe{}
	owners := map[string]string{}
	for _, file := range files {
		recipe, messages := readCard(file)
		if len(messages) > 0 {
			problems = appendProblems(problems, file.name, messages)
			continue
		}
		if owner, taken := owners[recipe.Slug]; taken {
			problems = append(problems, Problem{
				File: file.name,
				Message: fmt.Sprintf("Another card already has this name: %s. Links find recipes by name, so "+
					"each name has to be unique.", owner),
			})
			continue
		}
		owners[recipe.Slug] = file.name

		// a name links can't spell still loads, but it gets reported so it can be fixed.
		if recipeName.MatchString(recipe.Slug) == false {
			problems = append(problems, Problem{
				File: file.name,
				Message: "File names are lowercase words joined by hyphens, like chorizo-biscuits-and-gravy.yaml, " +
					"so links can reach them.",
			})
		}
		recipes = append(recipes, recipe)
	}

	// render the markdown now that every name is known, so links to missing recipes can be reported.
	recipes, problems = renderRecipes(recipes, problems)

	// list the recipes by title, the way a person scans for one.
	sort.SliceStable(recipes, func(left int, right int) bool {
		leftTitle := strings.ToLower(recipes[left].Card.Title)
		rightTitle := strings.ToLower(recipes[right].Card.Title)
		if leftTitle == rightTitle {
			return recipes[left].Slug < recipes[right].Slug
		}
		return leftTitle < rightTitle
	})

	collections, collectionProblems := loadCollections(folder)
	problems = append(problems, collectionProblems...)

	return Library{Recipes: recipes, Collections: collections, Problems: problems}, nil
}

// findCardFiles lists the cards to read: the top level first, so a top-level card keeps its name over a
// card in a folder that repeats it, then each folder in name order. Anything the recipes folder holds that
// isn't a card is passed over quietly, except the mistakes worth knowing about.
func findCardFiles(folder string) ([]cardFile, []Problem, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, nil, err
	}

	files := []cardFile{}
	problems := []Problem{}
	folders := []string{}
	for _, entry := range entries {
		if isSkipped(entry.Name()) {
			continue
		}
		if entry.IsDir() {
			folders = append(folders, entry.Name())
			continue
		}
		files, problems = classify(files, problems, folder, "", entry.Name())
	}

	for _, inner := range folders {
		innerPath := filepath.Join(folder, inner)
		innerEntries, err := os.ReadDir(innerPath)
		if err != nil {
			problems = append(problems, Problem{File: inner + "/", Message: "Couldn't read this folder: " + err.Error()})
			continue
		}

		for _, entry := range innerEntries {
			if isSkipped(entry.Name()) {
				continue
			}
			if entry.IsDir() {
				problems = append(problems, findTooDeep(innerPath, inner, entry.Name())...)
				continue
			}
			files, problems = classify(files, problems, innerPath, inner, entry.Name())
		}
	}

	return files, problems, nil
}

// classify adds a file to the cards to read when it is one. A .yml file is reported rather than read,
// since it is almost certainly a card with the wrong ending; every other file is left alone.
func classify(files []cardFile, problems []Problem, path string, folder string, name string) ([]cardFile, []Problem) {
	relative := name
	if folder != "" {
		relative = folder + "/" + name
	}

	switch filepath.Ext(name) {
	case ".yaml":
		files = append(files, cardFile{path: filepath.Join(path, name), name: relative, folder: folder})
	case ".yml":
		problems = append(problems, Problem{File: relative, Message: "Cards end in .yaml, not .yml. Rename it so it gets read."})
	}
	return files, problems
}

// findTooDeep reports every card inside a folder within a folder. Cards are read one folder down at most,
// so these cards are never read, and saying so beats having them silently missing from the site.
func findTooDeep(innerPath string, inner string, nested string) []Problem {
	problems := []Problem{}
	_ = filepath.WalkDir(filepath.Join(innerPath, nested), func(path string, entry fs.DirEntry, err error) error {
		// an unreadable folder has nothing to report, and skipped names stay skipped at any depth.
		if err != nil {
			return nil
		}
		if isSkipped(entry.Name()) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		extension := filepath.Ext(path)
		if entry.IsDir() || (extension != ".yaml" && extension != ".yml") {
			return nil
		}

		inside, _ := filepath.Rel(innerPath, path)
		problems = append(problems, Problem{
			File:    inner + "/" + filepath.ToSlash(inside),
			Message: "Cards sit at the top level or one folder down. Move this one up so it gets read.",
		})
		return nil
	})
	return problems
}

// readCard reads, decodes and checks one card. A card with anything wrong comes back with the messages
// and nothing else, since half a recipe is worse than none.
func readCard(file cardFile) (Recipe, []string) {
	content, err := os.ReadFile(file.path)
	if err != nil {
		return Recipe{}, []string{"Couldn't read the file: " + err.Error()}
	}

	card, messages := decodeCard(content)
	if len(messages) > 0 {
		return Recipe{}, messages
	}
	if messages := checkCard(card); len(messages) > 0 {
		return Recipe{}, messages
	}

	slug := strings.TrimSuffix(filepath.Base(file.path), ".yaml")
	return Recipe{Slug: slug, Folder: file.folder, File: file.name, Card: card}, nil
}

// renderRecipes renders every recipe's page now that all the names are known. A link to a missing recipe
// is reported but keeps its recipe on the site; a card that can't be rendered at all is dropped.
func renderRecipes(recipes []Recipe, problems []Problem) ([]Recipe, []Problem) {
	known := map[string]bool{}
	for _, recipe := range recipes {
		known[recipe.Slug] = true
	}

	links := newRenderer(known)
	rendered := []Recipe{}
	for _, recipe := range recipes {
		page, missing, err := links.renderCard(recipe.Card)
		if err != nil {
			problems = append(problems, Problem{File: recipe.File, Message: "Couldn't render the markdown: " + err.Error()})
			continue
		}

		// report each missing name once, however many times the card links to it.
		reported := map[string]bool{}
		for _, name := range missing {
			if reported[name] {
				continue
			}
			reported[name] = true
			problems = append(problems, Problem{File: recipe.File, Message: fmt.Sprintf("Links to %q, which isn't a recipe.", name)})
		}

		recipe.Page = page
		rendered = append(rendered, recipe)
	}
	return rendered, problems
}

// appendProblems adds one problem per message, all for the same file.
func appendProblems(problems []Problem, file string, messages []string) []Problem {
	for _, message := range messages {
		problems = append(problems, Problem{File: file, Message: message})
	}
	return problems
}

// isSkipped reports whether a name is meant to be passed over: hidden files and folders, and anything
// starting with an underscore, like _template.yaml.
func isSkipped(name string) bool {
	return strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}
