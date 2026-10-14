package cards

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"sync"
)

// Shelf holds the latest Library and loads it again whenever a card changes, so a new or edited card
// shows up on the next page load without restarting anything. Checking costs one look at each file's
// size and modified time, which is nothing next to reading every card on every request.
type Shelf struct {
	folder string

	// load reads the folder. It is Load everywhere but the tests, which count how often it runs.
	load func(folder string) (Library, error)

	mutex   sync.Mutex
	loaded  bool
	stamp   string
	library Library
}

// NewShelf returns a shelf over the given recipes folder. Nothing is read until the first Library call.
func NewShelf(folder string) *Shelf {
	return &Shelf{folder: folder, load: Load}
}

// Library returns the current library, loading it again first if any card has been added, changed,
// moved or removed since the last call.
func (shelf *Shelf) Library() (Library, error) {
	shelf.mutex.Lock()
	defer shelf.mutex.Unlock()

	stamp, err := fingerprint(shelf.folder)
	if err != nil {
		return Library{}, err
	}
	if shelf.loaded && stamp == shelf.stamp {
		return shelf.library, nil
	}

	library, err := shelf.load(shelf.folder)
	if err != nil {
		return Library{}, err
	}
	shelf.loaded = true
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
