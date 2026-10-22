package cards

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Shelf owes the site a library that is never more than a second stale and never reread for nothing: a
// card added or edited on disk shows up on the first request a second after the last look, a look that
// finds nothing changed costs no reading at all, and a request within that second costs not even a look.

// countingShelf returns a shelf over the folder that counts how many times it loads, on a clock that only
// moves when the test moves it.
func countingShelf(folder string) (*Shelf, *int, *time.Time) {
	loads := 0
	clock := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	shelf := NewShelf(folder)
	shelf.load = func(folder string) (Library, error) {
		loads++
		return Load(folder)
	}
	shelf.now = func() time.Time {
		return clock
	}
	return shelf, &loads, &clock
}

// editCard rewrites a card under a new title, and moves its modified time on a minute so the change can't
// hide inside one tick of the file system's clock.
func editCard(t *testing.T, folder string, name string, title string) {
	t.Helper()

	path := filepath.Join(folder, name)
	if err := os.WriteFile(path, []byte(cardTitled(title)), 0644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Minute)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
}

// TestShelfLoadsOnTheFirstCall covers the first request, which reads the folder.
func TestShelfLoadsOnTheFirstCall(t *testing.T) {
	// Arrange.
	shelf, loads, _ := countingShelf(writeFolder(t, map[string]string{"test-gravy.yaml": completeCard}))

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	if *loads != 1 {
		t.Fatalf("loaded %d times, expected 1", *loads)
	}
}

// TestShelfReusesTheLibraryWhileNothingChanges covers a look a second later that finds the folder as it was.
func TestShelfReusesTheLibraryWhileNothingChanges(t *testing.T) {
	// Arrange.
	shelf, loads, clock := countingShelf(writeFolder(t, map[string]string{"test-gravy.yaml": completeCard}))
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	*clock = clock.Add(time.Second)

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
	if *loads != 1 {
		t.Fatalf("loaded %d times, expected 1", *loads)
	}
}

// TestShelfDoesntLookAgainWithinASecond covers a request just under a second after a load, which gets that
// load's library without looking, even though a card has changed since.
func TestShelfDoesntLookAgainWithinASecond(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, loads, clock := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	editCard(t, folder, "test-gravy.yaml", "Edited Gravy")
	*clock = clock.Add(999 * time.Millisecond)

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if library.Recipes[0].Card.Title != "Test Gravy" || *loads != 1 {
		t.Fatalf("got title %q after %d loads, expected Test Gravy after 1", library.Recipes[0].Card.Title, *loads)
	}
}

// TestShelfLoadsAgainWhenACardChanges covers a request exactly a second after a load, which looks, finds
// the edited card, and loads again.
func TestShelfLoadsAgainWhenACardChanges(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, loads, clock := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	editCard(t, folder, "test-gravy.yaml", "Edited Gravy")
	*clock = clock.Add(time.Second)

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if library.Recipes[0].Card.Title != "Edited Gravy" || *loads != 2 {
		t.Fatalf("got title %q after %d loads, expected Edited Gravy after 2", library.Recipes[0].Card.Title, *loads)
	}
}

// TestShelfStartsTheSecondAgainAfterALookThatFindsNothing covers a look that finds the folder unchanged,
// which counts as the latest look: a request just under a second after it doesn't look again.
func TestShelfStartsTheSecondAgainAfterALookThatFindsNothing(t *testing.T) {
	// Arrange- load, then look a second later and find nothing changed, then edit the card.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, loads, clock := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	*clock = clock.Add(time.Second)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	editCard(t, folder, "test-gravy.yaml", "Edited Gravy")
	*clock = clock.Add(999 * time.Millisecond)

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if library.Recipes[0].Card.Title != "Test Gravy" || *loads != 1 {
		t.Fatalf("got title %q after %d loads, expected Test Gravy after 1", library.Recipes[0].Card.Title, *loads)
	}
}

// TestShelfLoadsAgainWhenACardIsAdded covers a new card dropped into the folder between two requests.
func TestShelfLoadsAgainWhenACardIsAdded(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, _, clock := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "apple-pie.yaml"), []byte(cardTitled("Apple Pie")), 0644); err != nil {
		t.Fatal(err)
	}
	*clock = clock.Add(time.Second)

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{"apple-pie", "test-gravy"})
}

// TestShelfFailsWhenTheFolderIsMissing covers a recipes folder that has gone away.
func TestShelfFailsWhenTheFolderIsMissing(t *testing.T) {
	// Arrange.
	shelf, loads, _ := countingShelf(filepath.Join(t.TempDir(), "nowhere"))

	// Act.
	_, err := shelf.Library()

	// Assert- it fails before trying to load anything.
	if err == nil {
		t.Fatal("expected an error for a missing folder")
	}
	if *loads != 0 {
		t.Fatalf("loaded %d times, expected 0", *loads)
	}
}

// TestShelfTriesAgainAfterAFailedLoad covers a load that fails once, which must not be remembered as the
// library: the next request has to try again.
func TestShelfTriesAgainAfterAFailedLoad(t *testing.T) {
	// Arrange- the first load fails, the second works.
	shelf := NewShelf(writeFolder(t, map[string]string{"test-gravy.yaml": completeCard}))
	failed := false
	shelf.load = func(folder string) (Library, error) {
		if failed == false {
			failed = true
			return Library{}, errors.New("disk hiccup")
		}
		return Load(folder)
	}
	if _, err := shelf.Library(); err == nil {
		t.Fatal("expected the first load to fail")
	}

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, slugsOf(library), []string{"test-gravy"})
}

// TestShelfTriesAgainAfterAFailedReload covers a reload that fails after an earlier load worked. The failed
// look doesn't count as one, so the very next request looks and loads again rather than waiting a second.
func TestShelfTriesAgainAfterAFailedReload(t *testing.T) {
	// Arrange- the first load works, the reload after an edit fails once, and the clock then stands still.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, _, clock := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	editCard(t, folder, "test-gravy.yaml", "Edited Gravy")
	*clock = clock.Add(time.Second)
	failed := false
	shelf.load = func(folder string) (Library, error) {
		if failed == false {
			failed = true
			return Library{}, errors.New("disk hiccup")
		}
		return Load(folder)
	}
	if _, err := shelf.Library(); err == nil {
		t.Fatal("expected the reload to fail")
	}

	// Act.
	library, err := shelf.Library()

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if library.Recipes[0].Card.Title != "Edited Gravy" {
		t.Fatalf("got title %q, expected Edited Gravy", library.Recipes[0].Card.Title)
	}
}
