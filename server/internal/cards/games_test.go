package cards

import (
	"strings"
	"testing"
)

// The games file owes the home page one shelf per game, in the order it lists them, and owes the person
// editing it a plain report of anything wrong. A game's dish that no shelf takes is the same failure as a
// card that doesn't load: it goes missing from the home page without a word, so that gets reported too.

// twoGames is a games file listing two games, in an order that isn't alphabetical by name.
const twoGames = `# The game shelves.
- tag: so2
  label: SO2
  name: "Star Ocean: The Second Story"
- tag: so1
  label: SO1
  name: Star Ocean
`

// gameDish returns the complete card retagged as a game's dish, with the given tags.
func gameDish(t *testing.T, tags string) string {
	t.Helper()

	return cardWithLine(t, "tags: [ brunch, pork ]", "tags: [ "+tags+" ]")
}

// assertGames checks a library's games match exactly, in order.
func assertGames(t *testing.T, library Library, expected []Game) {
	t.Helper()

	if library.Games == nil || len(library.Games) != len(expected) {
		t.Fatalf("got games %+v, expected %+v", library.Games, expected)
	}
	for index := range expected {
		if library.Games[index] != expected[index] {
			t.Fatalf("got games %+v, expected %+v", library.Games, expected)
		}
	}
}

// TestLoadReadsTheGames covers the plain case: the games in the file's own order, and the file itself
// never mistaken for a card.
func TestLoadReadsTheGames(t *testing.T) {
	// Arrange.
	files := map[string]string{"_games.yaml": twoGames, "test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	assertGames(t, library, []Game{
		{Tag: "so2", Label: "SO2", Name: "Star Ocean: The Second Story"},
		{Tag: "so1", Label: "SO1", Name: "Star Ocean"},
	})
}

// TestLoadNeedsNoGamesFile covers a folder without one, which has no game shelves and nothing wrong.
func TestLoadNeedsNoGamesFile(t *testing.T) {
	// Arrange.
	files := map[string]string{"test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertGames(t, library, []Game{})
}

// TestLoadReadsAGamesFileOfOnlyComments covers a games file with nothing listed yet.
func TestLoadReadsAGamesFileOfOnlyComments(t *testing.T) {
	// Arrange.
	files := map[string]string{"_games.yaml": "# No games yet.\n", "test-gravy.yaml": completeCard}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertGames(t, library, []Game{})
}

// TestLoadNamesAFieldNoGameHas covers a misspelled field, which is reported in the games file's own terms
// rather than the card format's, and leaves the file listing no games.
func TestLoadNamesAFieldNoGameHas(t *testing.T) {
	// Arrange.
	files := map[string]string{"_games.yaml": "- tag: so1\n  lable: SO1\n  name: Star Ocean\n"}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{
		{File: "_games.yaml", Message: `Line 2: "lable" isn't part of a game, which has a tag, a label and a name.`},
	})
	assertGames(t, library, []Game{})
}

// TestLoadReportsAGamesFileItCantRead covers a games file that can't be read, here because it's a folder.
func TestLoadReportsAGamesFileItCantRead(t *testing.T) {
	// Arrange.
	files := map[string]string{"_games.yaml/inside.txt": "not a games file"}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	if len(library.Problems) != 1 || library.Problems[0].File != "_games.yaml" ||
		strings.HasPrefix(library.Problems[0].Message, "Couldn't read the file: ") == false {
		t.Fatalf("got problems %+v, expected one about reading _games.yaml", library.Problems)
	}
	assertGames(t, library, []Game{})
}

// TestLoadNeedsATagOnEveryGame covers a game without a tag, which is reported and left off, while the
// game after it keeps its shelf.
func TestLoadNeedsATagOnEveryGame(t *testing.T) {
	// Arrange.
	games := "- label: SO1\n  name: Star Ocean\n- tag: so2\n  label: SO2\n  name: Star Ocean 2\n"
	files := map[string]string{"_games.yaml": games}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_games.yaml", Message: "Game 1 needs a tag."}})
	assertGames(t, library, []Game{{Tag: "so2", Label: "SO2", Name: "Star Ocean 2"}})
}

// TestLoadNeedsALabelOnEveryGame covers a game without the label its chip shows.
func TestLoadNeedsALabelOnEveryGame(t *testing.T) {
	// Arrange.
	games := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so2\n  name: Star Ocean 2\n"
	files := map[string]string{"_games.yaml": games}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_games.yaml", Message: "Game 2 needs a label."}})
	assertGames(t, library, []Game{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}

// TestLoadNeedsANameOnEveryGame covers a game without the name its list goes under.
func TestLoadNeedsANameOnEveryGame(t *testing.T) {
	// Arrange.
	games := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so2\n  label: SO2\n  name: \" \"\n"
	files := map[string]string{"_games.yaml": games}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{File: "_games.yaml", Message: "Game 2 needs a name."}})
	assertGames(t, library, []Game{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}

// TestLoadGivesATagOneShelf covers two games sharing a tag: the first keeps the shelf, and the second is
// reported.
func TestLoadGivesATagOneShelf(t *testing.T) {
	// Arrange.
	games := "- tag: so1\n  label: SO1\n  name: Star Ocean\n- tag: so1\n  label: FD\n  name: First Departure\n"
	files := map[string]string{"_games.yaml": games}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{
		{File: "_games.yaml", Message: "Game 2 has the same tag as game 1, so1. Each tag gets one shelf."},
	})
	assertGames(t, library, []Game{{Tag: "so1", Label: "SO1", Name: "Star Ocean"}})
}

// TestLoadReportsAGameDishWithNoShelf covers a top-level card tagged as a game's dish when its game isn't
// listed. It's reported, and it still loads, since search can still find it.
func TestLoadReportsAGameDishWithNoShelf(t *testing.T) {
	// Arrange- the games file lists another game, so the file being there isn't enough.
	files := map[string]string{
		"_games.yaml":     twoGames,
		"test-gravy.yaml": gameDish(t, "dinner, game, tales-of-arise"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{{
		File: "test-gravy.yaml",
		Message: "Tagged game, but none of its tags is a game in _games.yaml, so it's on no shelf. " +
			"Add its game there.",
	}})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
}

// TestLoadAcceptsAGameDishOnAShelf covers a dish from two games where only one of them is listed, which is
// enough for it to have a shelf.
func TestLoadAcceptsAGameDishOnAShelf(t *testing.T) {
	// Arrange.
	files := map[string]string{
		"_games.yaml":     twoGames,
		"test-gravy.yaml": gameDish(t, "dinner, game, star-ocean, so1, so9"),
	}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
}

// TestLoadLeavesAGameDishInACollectionAlone covers a game's dish in a collection, which sits on its
// collection's shelf whether or not its game has one.
func TestLoadLeavesAGameDishInACollectionAlone(t *testing.T) {
	// Arrange- there are no games at all.
	files := map[string]string{"drinks/test-gravy.yaml": gameDish(t, "drink, game, tales-of-arise")}

	// Act.
	library := loadFolder(t, files)

	// Assert.
	assertProblems(t, library, []Problem{})
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
}
