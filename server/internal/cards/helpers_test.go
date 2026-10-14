package cards

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// completeCard is a card that passes every rule, for tests to load as it is or break one line at a time.
const completeCard = `title: Test Gravy
intro: >-
  A gravy for testing.
serves: 2
time: about 10 minutes
tags: [ brunch, pork ]
ingredients:
  - name: Gravy
    items:
      - 1/4 cup flour
      - 2 cups milk
method:
  steps:
    - lead: Whisk.
      text: >-
        Whisk the flour into the milk.
notes:
  - lead: "Too thick:"
    text: >-
      add milk.
`

// cardTitled returns the complete card under a different title, for tests that need several valid cards.
func cardTitled(title string) string {
	return strings.Replace(completeCard, "title: Test Gravy", "title: "+title, 1)
}

// cardWithLine returns the complete card with one line swapped for another. The swap must find its line,
// so a test can never pass because the card it meant to break was left whole.
func cardWithLine(t *testing.T, line string, replacement string) string {
	t.Helper()

	if strings.Contains(completeCard, line) == false {
		t.Fatalf("the complete card has no line %q to replace", line)
	}
	return strings.Replace(completeCard, line, replacement, 1)
}

// writeFolder writes a recipes folder holding the given files, keyed by their path inside it.
func writeFolder(t *testing.T, files map[string]string) string {
	t.Helper()

	folder := t.TempDir()
	for name, content := range files {
		path := filepath.Join(folder, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return folder
}

// loadFolder writes a recipes folder and loads it, failing the test if the folder can't be read.
func loadFolder(t *testing.T, files map[string]string) Library {
	t.Helper()

	library, err := Load(writeFolder(t, files))
	if err != nil {
		t.Fatal(err)
	}
	return library
}

// slugsOf lists a library's recipe names in order.
func slugsOf(library Library) []string {
	slugs := []string{}
	for _, recipe := range library.Recipes {
		slugs = append(slugs, recipe.Slug)
	}
	return slugs
}

// assertStrings checks two lists of strings match exactly, in order.
func assertStrings(t *testing.T, actual []string, expected []string) {
	t.Helper()

	if strings.Join(actual, "\n") != strings.Join(expected, "\n") || len(actual) != len(expected) {
		t.Fatalf("got %q, expected %q", actual, expected)
	}
}

// assertProblems checks a library reported exactly the given problems, in order.
func assertProblems(t *testing.T, library Library, expected []Problem) {
	t.Helper()

	if len(library.Problems) != len(expected) {
		t.Fatalf("got problems %+v, expected %+v", library.Problems, expected)
	}
	for index := range expected {
		if library.Problems[index] != expected[index] {
			t.Fatalf("got problems %+v, expected %+v", library.Problems, expected)
		}
	}
}
