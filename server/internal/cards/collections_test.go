package cards

import (
	"strings"
	"testing"
)

// The collections file owes the home page one shelf per collection, in the order it lists them, and owes the
// person editing it a plain report of anything wrong with it.

// twoCollections is a collections file listing two collections, in an order that isn't alphabetical by name.
const twoCollections = `# The collection shelves.
- tag: so2
  label: SO2
  name: "Star Ocean: The Second Story"
- tag: so1
  label: SO1
  name: Star Ocean
`

// assertCollections checks a library's collections match exactly, in order.
func assertCollections(t *testing.T, library Library, expected []Collection) {
	t.Helper()

	if library.Collections == nil || len(library.Collections) != len(expected) {
		t.Fatalf("got collections %+v, expected %+v", library.Collections, expected)
	}
	for index := range expected {
		if library.Collections[index] != expected[index] {
			t.Fatalf("got collections %+v, expected %+v", library.Collections, expected)
		}
	}
}

// TestLoadReadsTheCollections covers the plain case: the collections in the file's own order, and the file
// itself never mistaken for a card.
func TestLoadReadsTheCollections(t *testing.T) {
	// Arrange.
	files := map[string]string{"_collections.yaml": twoCollections, "test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	assertCollections(t, library, []Collection{
		{Tag: "so2", Label: "SO2", Name: "Star Ocean: The Second Story"},
		{Tag: "so1", Label: "SO1", Name: "Star Ocean"},
	})
}

// TestLoadNeedsNoCollectionsFile covers a folder without one, which has no collection shelves and nothing
// wrong.
func TestLoadNeedsNoCollectionsFile(t *testing.T) {
	// Arrange.
	files := map[string]string{"test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertCollections(t, library, []Collection{})
}

// TestLoadReadsACollectionsFileOfOnlyComments covers a collections file with nothing listed yet.
func TestLoadReadsACollectionsFileOfOnlyComments(t *testing.T) {
	// Arrange.
	files := map[string]string{"_collections.yaml": "# No collections yet.\n", "test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertCollections(t, library, []Collection{})
}

// TestLoadNamesAFieldNoCollectionHas covers a misspelled field, which is reported in the collections file's
// own terms rather than the card format's, and leaves the file listing no collections.
func TestLoadNamesAFieldNoCollectionHas(t *testing.T) {
	// Arrange.
	files := map[string]string{"_collections.yaml": "- tag: so1\n  lable: SO1\n  name: Star Ocean\n"}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{
		{File: "_collections.yaml", Message: `Line 2: "lable" isn't part of a collection, which has a tag, a label and a name.`},
	})
	assertCollections(t, library, []Collection{})
}

// TestLoadReportsACollectionsFileItCantRead covers a collections file that can't be read, here because it's
// a folder.
func TestLoadReportsACollectionsFileItCantRead(t *testing.T) {
	// Arrange.
	files := map[string]string{"_collections.yaml/inside.txt": "not a collections file"}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	if len(library.Problems) != 1 || library.Problems[0].File != "_collections.yaml" ||
		strings.HasPrefix(library.Problems[0].Message, "Couldn't read the file: ") == false {
		t.Fatalf("got problems %+v, expected one about reading _collections.yaml", library.Problems)
	}
	assertCollections(t, library, []Collection{})
}

// TestLoadNeedsATagOnEveryCollection covers a collection without a tag, which is reported and left off,
// while the collection after it keeps its shelf.
func TestLoadNeedsATagOnEveryCollection(t *testing.T) {
	// Arrange.
	collections := "- label: SO1\n  name: Star Ocean\n- tag: so2\n  label: SO2\n  name: Star Ocean 2\n"
	files := map[string]string{"_collections.yaml": collections}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_collections.yaml", Message: "Collection 1 needs a tag."}})
	assertCollections(t, library, []Collection{{Tag: "so2", Label: "SO2", Name: "Star Ocean 2"}})
}

// TestLoadNeedsALabelOnEveryCollection covers a collection without the label its chip shows.
func TestLoadNeedsALabelOnEveryCollection(t *testing.T) {
	// Arrange.
	collections := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so2\n  name: Star Ocean 2\n"
	files := map[string]string{"_collections.yaml": collections}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_collections.yaml", Message: "Collection 2 needs a label."}})
	assertCollections(t, library, []Collection{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}

// TestLoadNeedsANameOnEveryCollection covers a collection without the name its list goes under.
func TestLoadNeedsANameOnEveryCollection(t *testing.T) {
	// Arrange.
	collections := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so2\n  label: SO2\n  name: \" \"\n"
	files := map[string]string{"_collections.yaml": collections}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_collections.yaml", Message: "Collection 2 needs a name."}})
	assertCollections(t, library, []Collection{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}

// TestLoadGivesATagOneShelf covers two collections sharing a tag: the first keeps the shelf, and the second
// is reported.
func TestLoadGivesATagOneShelf(t *testing.T) {
	// Arrange.
	collections := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so1\n  label: FD\n  name: First Departure\n"
	files := map[string]string{"_collections.yaml": collections}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{
		{File: "_collections.yaml", Message: "Collection 2 has the same tag as collection 1, so1. Each tag gets one shelf."},
	})
	assertCollections(t, library, []Collection{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}
