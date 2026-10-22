package cards

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// lookEvery is how long a library stands after a look at the folder before the next request looks again.
// A phone opening the site asks for the catalog and then for any recipes it's missing, hundreds at once
// the first time, and one look covers them all. A card saved on disk shows up a second later at most.
const lookEvery = time.Second

// Shelf holds the latest Library and loads it again whenever a card changes, so a new or edited card
// shows up on the next page load without restarting anything. Checking costs one look at each file's
// size and modified time, which is nothing next to reading every card on every request, and the shelf
// takes that look at most once a second.
type Shelf struct {
	folder string

	// load reads the folder. It is Load everywhere but the tests, which count how often it runs.
	load func(folder string) (Library, error)

	// now is the time now. It is time.Now everywhere but the tests, which move the clock themselves.
	now func() time.Time

	mutex    sync.Mutex
	loaded   bool
	lookedAt time.Time
	stamp    string
	library  Library
}

// NewShelf returns a shelf over the given recipes folder. Nothing is read until the first Library call.
func NewShelf(folder string) *Shelf {
	return &Shelf{folder: folder, load: Load, now: time.Now}
}

// Library returns the current library, loading it again first if any card has been added, changed,
// moved or removed since the last look at the folder. A call within a second of that look gets the
// library it found without looking again.
func (shelf *Shelf) Library() (Library, error) {
	shelf.mutex.Lock()
	defer shelf.mutex.Unlock()

	// a look a moment ago still stands, so a burst of requests costs one look rather than one each. Until
	// a load works, lookedAt is the zero time, ages ago, so a shelf with nothing loaded always looks.
	now := shelf.now()
	if now.Sub(shelf.lookedAt) < lookEvery {
		return shelf.library, nil
	}

	stamp, err := fingerprint(shelf.folder)
	if err != nil {
		return Library{}, err
	}

	// only a look that worked counts as one, so a failed one is tried again on the next request.
	if shelf.loaded && stamp == shelf.stamp {
		shelf.lookedAt = now
		return shelf.library, nil
	}

	library, err := shelf.load(shelf.folder)
	if err != nil {
		return Library{}, err
	}
	shelf.loaded = true
	shelf.lookedAt = now
	shelf.stamp = stamp
	shelf.library = library
	return library, nil
}

// fingerprint describes every card and folder under the recipes folder by path, size and modified time.
// Two fingerprints match exactly when nothing a load would read has changed.
func fingerprint(folder string) (string, error) {
	lines := []string{}
	err := filepath.WalkDir(folder, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		extension := filepath.Ext(path)
		if entry.IsDir() == false && extension != ".yaml" && extension != ".yml" {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		lines = append(lines, fmt.Sprintf("%s|%d|%d", path, info.Size(), info.ModTime().UnixNano()))
		return nil
	})
	return strings.Join(lines, "\n"), err
}
