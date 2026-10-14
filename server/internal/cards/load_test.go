package cards

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Load owes the site the whole recipes folder, read the same way every time: top-level cards and one
// level of collections, nothing hidden or underscored, and every problem reported instead of swallowed.
// A card quietly missing from the site is the failure that matters most here, because nobody goes
// looking for a recipe they don't know is gone.

// TestLoadReadsATopLevelCard covers the plain case: a card at the top level, with no collection.
func TestLoadReadsATopLevelCard(t *testing.T) {
	// Arrange.
	files := map[string]string{"test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	recipe := library.Recipes[0]
	if recipe.Collection != "" || recipe.File != "test-gravy.yaml" || recipe.Card.Title != "Test Gravy" {
		t.Fatalf("got collection %q, file %q, title %q", recipe.Collection, recipe.File, recipe.Card.Title)
	}
}

// TestLoadNamesACollectionAfterItsFolder covers a card one folder down.
func TestLoadNamesACollectionAfterItsFolder(t *testing.T) {
	// Arrange.
	files := map[string]string{"star-ocean/au-gratin-climax.yaml": cardTitled("Au Gratin Climax")}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	recipe := library.Recipes[0]
	if recipe.Collection != "star-ocean" || recipe.File != "star-ocean/au-gratin-climax.yaml" {
		t.Fatalf("got collection %q, file %q", recipe.Collection, recipe.File)
	}
}

// TestLoadPassesOverWhatIsntACard covers the template, hidden files, underscored folders and the old
// markdown cards, none of which are read or reported, while the real card beside them still loads.
func TestLoadPassesOverWhatIsntACard(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"_template.yaml":   completeCard,
		".draft.yaml":      completeCard,
		"_drafts/one.yaml": completeCard,
		"test-gravy.md":    "# Test Gravy",
		"test-gravy.yaml":  completeCard,
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
}

// TestLoadReportsAYmlFile covers a card saved with the wrong ending, which is reported rather than read.
func TestLoadReportsAYmlFile(t *testing.T) {
	// Arrange.
	files := map[string]string{"test-gravy.yml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{})
	assertProblems(t, library, []Problem{
		{File: "test-gravy.yml", Message: "Cards end in .yaml, not .yml. Rename it so it gets read."},
	})
}

// TestLoadReportsACardTooDeep covers a folder inside a collection, whose cards are never read, beside a
// card at the right depth that still is.
func TestLoadReportsACardTooDeep(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"star-ocean/so2/au-gratin-climax.yaml": cardTitled("Au Gratin Climax"),
		"star-ocean/lords-ozoni.yaml":          cardTitled("Lord's Ozoni"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"lords-ozoni"})
	assertProblems(t, library, []Problem{{
		File:    "star-ocean/so2/au-gratin-climax.yaml",
		Message: "Cards sit at the top level or one folder down, in a collection. Move this one up so it gets read.",
	}})
}

// TestLoadKeepsTheFirstCardWithAName covers two cards sharing a file name: the top-level one wins, and
// the collection one is reported, since a link could only ever reach one of them.
func TestLoadKeepsTheFirstCardWithAName(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"gravy.yaml":        cardTitled("Top-Level Gravy"),
		"brunch/gravy.yaml": cardTitled("Collection Gravy"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"gravy"})
	if library.Recipes[0].Card.Title != "Top-Level Gravy" {
		t.Fatalf("kept %q, expected the top-level card", library.Recipes[0].Card.Title)
	}
	assertProblems(t, library, []Problem{{
		File: "brunch/gravy.yaml",
		Message: "Another card already has this name: gravy.yaml. Links find recipes by name, so each name " +
			"has to be unique.",
	}})
}

// TestLoadReportsABrokenCardAndLoadsTheRest covers one bad card among good ones.
func TestLoadReportsABrokenCardAndLoadsTheRest(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"broken.yaml":     cardWithLine(t, "serves: 2", "servings: 2"),
		"test-gravy.yaml": completeCard,
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	assertProblems(t, library, []Problem{
		{File: "broken.yaml", Message: `Line 4: "servings" isn't part of the card format.`},
	})
}

// TestLoadReportsACardThatBreaksARule covers a card that decodes but fails a rule.
func TestLoadReportsACardThatBreaksARule(t *testing.T) {
	// Arrange.
	files := map[string]string{"test-gravy.yaml": cardWithLine(t, "time: about 10 minutes", "")}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{})
	assertProblems(t, library, []Problem{{File: "test-gravy.yaml", Message: "Needs a time."}})
}

// TestLoadReportsALinkToAMissingRecipe covers a link whose recipe doesn't exist: the card still loads,
// and the missing name is reported once however often it's linked.
func TestLoadReportsALinkToAMissingRecipe(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "  A gravy for testing.", "  A gravy for [Nope](nope), then [Nope again](nope).")
	files := map[string]string{"test-gravy.yaml": content}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	assertProblems(t, library, []Problem{
		{File: "test-gravy.yaml", Message: `Links to "nope", which isn't a recipe.`},
	})
}

// TestLoadAcceptsALinkToAnotherCard covers a link between two cards that both exist.
func TestLoadAcceptsALinkToAnotherCard(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "  A gravy for testing.", "  Goes with [Biscuits](biscuits).")
	files := map[string]string{"test-gravy.yaml": content, "biscuits.yaml": cardTitled("Biscuits")}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	recipe, _ := library.Find("test-gravy")
	if recipe.Page.Intro != `<p>Goes with <a href="/recipes/biscuits">Biscuits</a>.</p>` {
		t.Fatalf("intro rendered as %q", recipe.Page.Intro)
	}
}

// TestLoadReportsAFileNameLinksCantSpell covers a file name with spaces and capitals. It still loads,
// but gets reported, since no link can reach it.
func TestLoadReportsAFileNameLinksCantSpell(t *testing.T) {
	// Arrange.
	files := map[string]string{"Test Gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"Test Gravy"})
	assertProblems(t, library, []Problem{{
		File:    "Test Gravy.yaml",
		Message: "File names are lowercase words joined by hyphens, like chorizo-biscuits-and-gravy.yaml, so links can reach them.",
	}})
}

// TestLoadSortsRecipesByTitle covers the list order, which ignores capitals the way a person reading the
// list does. Sorting by raw bytes would put "Banana" before "apple".
func TestLoadSortsRecipesByTitle(t *testing.T) {
	// Arrange- file names in the opposite order from the titles.
	files := map[string]string{
		"zeta.yaml":  cardTitled("apple Pie"),
		"mid.yaml":   cardTitled("Banana Bread"),
		"alpha.yaml": cardTitled("cherry Jam"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"zeta", "mid", "alpha"})
}

// TestLoadBreaksATitleTieByName covers two cards with the same title, which list in file name order so
// the list never shuffles between loads.
func TestLoadBreaksATitleTieByName(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"gravy-two.yaml": cardTitled("Gravy"),
		"gravy-one.yaml": cardTitled("Gravy"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertStrings(t, slugsOf(library), []string{"gravy-one", "gravy-two"})
}

// TestLoadReportsAnUnreadableCollection covers a collection folder the server isn't allowed into, beside
// a top-level card that still loads.
func TestLoadReportsAnUnreadableCollection(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{
		"test-gravy.yaml":      completeCard,
		"locked/biscuits.yaml": cardTitled("Biscuits"),
	})
	locked := filepath.Join(folder, "locked")
	if err := os.Chmod(locked, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0755) })

	// Act.
	library, err := Load(folder)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	if len(library.Problems) != 1 || library.Problems[0].File != "locked/" {
		t.Fatalf("got problems %+v, expected one for locked/", library.Problems)
	}
}

// TestLoadReportsAnUnreadableCard covers a card file the server isn't allowed to read.
func TestLoadReportsAnUnreadableCard(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	path := filepath.Join(folder, "test-gravy.yaml")
	if err := os.Chmod(path, 0); err != nil {
		t.Fatal(err)
	}

	// Act.
	library, err := Load(folder)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{})
	if len(library.Problems) != 1 || strings.HasPrefix(library.Problems[0].Message, "Couldn't read the file") == false {
		t.Fatalf("got problems %+v, expected one unreadable file", library.Problems)
	}
}

// TestLoadOnlyReportsCardsFromTooDeep covers what else can sit in a folder that's too deep: notes,
// underscored drafts and hidden folders are passed over there too, so only the real card is reported.
func TestLoadOnlyReportsCardsFromTooDeep(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"star-ocean/so2/au-gratin-climax.yaml": cardTitled("Au Gratin Climax"),
		"star-ocean/so2/notes.md":              "# Notes",
		"star-ocean/so2/_draft.yaml":           completeCard,
		"star-ocean/so2/.hidden/secret.yaml":   completeCard,
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{
		File:    "star-ocean/so2/au-gratin-climax.yaml",
		Message: "Cards sit at the top level or one folder down, in a collection. Move this one up so it gets read.",
	}})
}

// TestLoadFailsWhenTheFolderIsMissing covers a recipes folder that isn't there, the one failure Load
// returns as an error rather than a problem.
func TestLoadFailsWhenTheFolderIsMissing(t *testing.T) {
	// Arrange.
	folder := filepath.Join(t.TempDir(), "nowhere")

	// Act.
	_, err := Load(folder)

	// Assert.
	if err == nil {
		t.Fatal("expected an error for a missing folder")
	}
}

// TestLoadReturnsEmptyListsForAnEmptyFolder covers an empty cookbook, which must still be lists so the
// site gets [] rather than null.
func TestLoadReturnsEmptyListsForAnEmptyFolder(t *testing.T) {
	// Arrange.
	files := map[string]string{}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	if library.Recipes == nil || library.Problems == nil {
		t.Fatalf("got recipes %v and problems %v, expected empty lists", library.Recipes, library.Problems)
	}
	if len(library.Recipes) != 0 || len(library.Problems) != 0 {
		t.Fatalf("got %d recipes and %d problems, expected none", len(library.Recipes), len(library.Problems))
	}
}

// TestLibraryFindReturnsTheNamedRecipe covers finding one recipe among several.
func TestLibraryFindReturnsTheNamedRecipe(t *testing.T) {
	// Arrange.
	library := loadFolder(t, map[string]string{
		"apple-pie.yaml":    cardTitled("Apple Pie"),
		"banana-bread.yaml": cardTitled("Banana Bread"),
	})

	// Act.
	recipe, found := library.Find("banana-bread")

	// Assert.
	if found == false || recipe.Card.Title != "Banana Bread" {
		t.Fatalf("found %v with title %q, expected Banana Bread", found, recipe.Card.Title)
	}
}

// TestLibraryFindReportsAMissingRecipe covers a name with no recipe.
func TestLibraryFindReportsAMissingRecipe(t *testing.T) {
	// Arrange.
	library := loadFolder(t, map[string]string{"apple-pie.yaml": cardTitled("Apple Pie")})

	// Act.
	_, found := library.Find("banana-bread")

	// Assert.
	if found {
		t.Fatal("found a recipe that doesn't exist")
	}
}
