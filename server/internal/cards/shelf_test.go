package cards

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Shelf owes the site a library that is never stale and never reread for nothing: a card added or edited
// on disk shows up on the next request, and a request with nothing changed costs no reading at all.

// countingShelf returns a shelf over the folder that counts how many times it loads.
func countingShelf(folder string) (*Shelf, *int) {
	loads := 0
	shelf := NewShelf(folder)
	shelf.load = func(folder string) (Library, error) {
		loads++
		return Load(folder)
	}
	return shelf, &loads
}

// TestShelfLoadsOnTheFirstCall covers the first request, which reads the folder.
func TestShelfLoadsOnTheFirstCall(t *testing.T) {
	// Arrange.
	shelf, loads := countingShelf(writeFolder(t, map[string]string{"test-gravy.yaml": completeCard}))

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

// TestShelfReusesTheLibraryWhileNothingChanges covers a second request with the folder untouched.
func TestShelfReusesTheLibraryWhileNothingChanges(t *testing.T) {
	// Arrange.
	shelf, loads := countingShelf(writeFolder(t, map[string]string{"test-gravy.yaml": completeCard}))
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}

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

// TestShelfLoadsAgainWhenACardChanges covers an edit on disk between two requests.
func TestShelfLoadsAgainWhenACardChanges(t *testing.T) {
	// Arrange- edit the card, and move its modified time so the change can't hide inside one tick.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, loads := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "test-gravy.yaml")
	if err := os.WriteFile(path, []byte(cardTitled("Edited Gravy")), 0644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Minute)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}

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

// TestShelfLoadsAgainWhenACardIsAdded covers a new card dropped into the folder between two requests.
func TestShelfLoadsAgainWhenACardIsAdded(t *testing.T) {
	// Arrange.
	folder := writeFolder(t, map[string]string{"test-gravy.yaml": completeCard})
	shelf, _ := countingShelf(folder)
	if _, err := shelf.Library(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "apple-pie.yaml"), []byte(cardTitled("Apple Pie")), 0644); err != nil {
		t.Fatal(err)
	}

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
	shelf, loads := countingShelf(filepath.Join(t.TempDir(), "nowhere"))

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
