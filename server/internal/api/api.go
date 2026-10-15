// Package api serves the recipes as JSON for the website, and hands every other path to the website.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"recipes/server/internal/cards"
)

// Summary is what the home page and search need to know about a recipe.
type Summary struct {
	Slug   string   `json:"slug"`
	Title  string   `json:"title"`
	Folder string   `json:"folder"`
	Tags   []string `json:"tags"`
	Serves string   `json:"serves"`
	Makes  string   `json:"makes"`
	Time   string   `json:"time"`
}

// Catalog answers GET /api/recipes: every recipe, the collections the home page gives shelves to, and
// every problem with the cards, so the site can show a broken card instead of quietly leaving it out.
type Catalog struct {
	Recipes     []Summary          `json:"recipes"`
	Collections []cards.Collection `json:"collections"`
	Problems    []cards.Problem    `json:"problems"`
}

// Detail answers GET /api/recipes/{slug}: the summary, plus the page with its markdown rendered.
type Detail struct {
	Summary
	cards.Page
}

// errorBody is how the API says something went wrong.
type errorBody struct {
	Error string `json:"error"`
}

// Routes builds the whole site: the recipe API under /api, and the built website for everything else.
func Routes(shelf *cards.Shelf, website http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /api/recipes", listRecipes(shelf))
	mux.Handle("GET /api/recipes/{slug}", showRecipe(shelf))

	// anything else under /api is a wrong address, so it gets a JSON answer rather than the website's page.
	mux.HandleFunc("/api/", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusNotFound, errorBody{Error: fmt.Sprintf("There's nothing at %s.", request.URL.Path)})
	})

	mux.Handle("/", website)
	return mux
}

// listRecipes answers with every recipe's summary and every problem, as of this moment on disk.
func listRecipes(shelf *cards.Shelf) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		library, err := shelf.Library()
		if err != nil {
			writeUnreadable(writer, err)
			return
		}

		catalog := Catalog{Recipes: []Summary{}, Collections: library.Collections, Problems: library.Problems}
		for _, recipe := range library.Recipes {
			catalog.Recipes = append(catalog.Recipes, summarize(recipe))
		}
		writeJSON(writer, http.StatusOK, catalog)
	})
}

// showRecipe answers with one recipe, rendered for its page.
func showRecipe(shelf *cards.Shelf) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		library, err := shelf.Library()
		if err != nil {
			writeUnreadable(writer, err)
			return
		}

		slug := request.PathValue("slug")
		recipe, found := library.Find(slug)
		if found == false {
			writeJSON(writer, http.StatusNotFound, errorBody{Error: fmt.Sprintf("There's no recipe named %q.", slug)})
			return
		}
		writeJSON(writer, http.StatusOK, Detail{Summary: summarize(recipe), Page: recipe.Page})
	})
}

// summarize picks out what lists of recipes show.
func summarize(recipe cards.Recipe) Summary {
	// tags are optional on a card, but the site always gets a list, never null.
	tags := recipe.Card.Tags
	if tags == nil {
		tags = []string{}
	}

	return Summary{
		Slug:   recipe.Slug,
		Title:  recipe.Card.Title,
		Folder: recipe.Folder,
		Tags:   tags,
		Serves: recipe.Card.Serves,
		Makes:  recipe.Card.Makes,
		Time:   recipe.Card.Time,
	}
}

// writeUnreadable answers when the recipes folder itself can't be read, which no card fix can solve.
func writeUnreadable(writer http.ResponseWriter, err error) {
	writeJSON(writer, http.StatusInternalServerError, errorBody{Error: "Couldn't read the recipes folder: " + err.Error()})
}

// writeJSON sends body as JSON with the given status. Recipes change on disk at any moment, so nothing
// the API sends may be kept and reused by the browser.
func writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)

	// the rendered HTML stays readable this way, which helps when reading the API by hand.
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(body)
}
