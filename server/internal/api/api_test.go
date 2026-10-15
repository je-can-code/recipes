package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"recipes/server/internal/cards"
)

// Routes owes the website a JSON answer for every /api address, the website itself for every other
// path, and lists that are always lists. A null where the app expects a list, or the website's page
// where it expects JSON, is a blank screen on a phone in the middle of cooking.

// gravyCard is a complete card, tagged, linking to the biscuits card.
const gravyCard = `title: Test Gravy
intro: >-
  Goes with [Biscuits](biscuits).
serves: 2
time: about 10 minutes
tags: [ brunch, pork ]
ingredients:
  - items:
      - 1/4 cup flour
method:
  steps:
    - lead: Whisk.
      text: >-
        Whisk it.
`

// biscuitsCard is a complete card with no tags, in no collection's way.
const biscuitsCard = `title: Biscuits
intro: >-
  Biscuits.
makes: 9
time: about 1 hour
ingredients:
  - items:
      - 2 cups flour
method:
  steps:
    - lead: Bake.
      text: >-
        Bake them.
`

// stubWebsite stands in for the built website, answering every request with "website".
var stubWebsite = http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
	_, _ = writer.Write([]byte("website"))
})

// serveFolder writes a recipes folder from the given files and returns the routes over it.
func serveFolder(t *testing.T, files map[string]string) http.Handler {
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
	return Routes(cards.NewShelf(folder), stubWebsite)
}

// request sends a GET for path and returns the response.
func request(t *testing.T, routes http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	routes.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

// decode reads a JSON response body into target.
func decode(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()

	if err := json.Unmarshal(response.Body.Bytes(), target); err != nil {
		t.Fatalf("couldn't decode %q: %v", response.Body.String(), err)
	}
}

// TestListRecipesReturnsEverySummaryAndProblem covers the catalog: recipes in title order with their
// collection and tags, and the broken card reported beside them.
func TestListRecipesReturnsEverySummaryAndProblem(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{
		"test-gravy.yaml":     gravyCard,
		"bakes/biscuits.yaml": biscuitsCard,
		"broken.yaml":         "title: Broken\n",
	})

	// Act.
	response := request(t, routes, "/api/recipes")

	// Assert.
	if response.Code != http.StatusOK {
		t.Fatalf("got %d", response.Code)
	}
	catalog := Catalog{}
	decode(t, response, &catalog)
	if len(catalog.Recipes) != 2 {
		t.Fatalf("got %d recipes, expected 2", len(catalog.Recipes))
	}
	biscuits := catalog.Recipes[0]
	gravy := catalog.Recipes[1]
	if biscuits.Slug != "biscuits" || biscuits.Collection != "bakes" || biscuits.Makes != "9" {
		t.Fatalf("got first recipe %+v", biscuits)
	}
	if gravy.Slug != "test-gravy" || gravy.Serves != "2" || strings.Join(gravy.Tags, ",") != "brunch,pork" {
		t.Fatalf("got second recipe %+v", gravy)
	}
	if len(catalog.Problems) == 0 || catalog.Problems[0].File != "broken.yaml" {
		t.Fatalf("got problems %+v, expected broken.yaml's", catalog.Problems)
	}
}

// TestListRecipesSendsAnEmptyTagList covers a card with no tags, which must arrive as [] and not null.
func TestListRecipesSendsAnEmptyTagList(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/api/recipes")

	// Assert.
	if strings.Contains(response.Body.String(), `"tags":[]`) == false {
		t.Fatalf("got %s, expected an empty tag list", response.Body.String())
	}
}

// TestListRecipesSendsTheGames covers the games the home page gives shelves to, in the games file's order.
func TestListRecipesSendsTheGames(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{
		"_games.yaml":   "- tag: so2\n  label: SO2\n  name: Star Ocean 2\n- tag: so1\n  label: SO1\n  name: Star Ocean\n",
		"biscuits.yaml": biscuitsCard,
	})

	// Act.
	response := request(t, routes, "/api/recipes")

	// Assert.
	catalog := Catalog{}
	decode(t, response, &catalog)
	expected := []cards.Game{{Tag: "so2", Label: "SO2", Name: "Star Ocean 2"}, {Tag: "so1", Label: "SO1", Name: "Star Ocean"}}
	if len(catalog.Games) != 2 || catalog.Games[0] != expected[0] || catalog.Games[1] != expected[1] {
		t.Fatalf("got games %+v, expected %+v", catalog.Games, expected)
	}
}

// TestListRecipesSendsAnEmptyGameList covers a folder with no games file, whose games must arrive as []
// and not null.
func TestListRecipesSendsAnEmptyGameList(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/api/recipes")

	// Assert.
	if strings.Contains(response.Body.String(), `"games":[]`) == false {
		t.Fatalf("got %s, expected an empty game list", response.Body.String())
	}
}

// TestListRecipesExplainsAnUnreadableFolder covers a recipes folder that isn't there.
func TestListRecipesExplainsAnUnreadableFolder(t *testing.T) {
	// Arrange.
	routes := Routes(cards.NewShelf(filepath.Join(t.TempDir(), "nowhere")), stubWebsite)

	// Act.
	response := request(t, routes, "/api/recipes")

	// Assert.
	body := errorBody{}
	decode(t, response, &body)
	if response.Code != http.StatusInternalServerError || strings.HasPrefix(body.Error, "Couldn't read the recipes folder") == false {
		t.Fatalf("got %d %q", response.Code, body.Error)
	}
}

// TestShowRecipeReturnsTheRenderedPage covers one recipe, with its summary and its rendered page together.
func TestShowRecipeReturnsTheRenderedPage(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"test-gravy.yaml": gravyCard, "biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/api/recipes/test-gravy")

	// Assert.
	if response.Code != http.StatusOK {
		t.Fatalf("got %d", response.Code)
	}
	detail := Detail{}
	decode(t, response, &detail)
	if detail.Title != "Test Gravy" || detail.Intro != `<p>Goes with <a href="/recipes/biscuits">Biscuits</a>.</p>` {
		t.Fatalf("got title %q and intro %q", detail.Title, detail.Intro)
	}
	if detail.Method.Steps[0].Lead != "Whisk." || detail.Ingredients[0].Items[0] != "1/4 cup flour" {
		t.Fatalf("got method %+v and ingredients %+v", detail.Method, detail.Ingredients)
	}
}

// TestShowRecipeAnswersAMissingRecipeWith404 covers a name with no recipe behind it.
func TestShowRecipeAnswersAMissingRecipeWith404(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/api/recipes/nope")

	// Assert.
	body := errorBody{}
	decode(t, response, &body)
	if response.Code != http.StatusNotFound || body.Error != `There's no recipe named "nope".` {
		t.Fatalf("got %d %q", response.Code, body.Error)
	}
}

// TestShowRecipeExplainsAnUnreadableFolder covers a recipe asked for after the folder has gone away.
func TestShowRecipeExplainsAnUnreadableFolder(t *testing.T) {
	// Arrange.
	routes := Routes(cards.NewShelf(filepath.Join(t.TempDir(), "nowhere")), stubWebsite)

	// Act.
	response := request(t, routes, "/api/recipes/biscuits")

	// Assert.
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, expected 500", response.Code)
	}
}

// TestUnknownApiAddressAnswersInJson covers a wrong address under /api, which must not fall through to
// the website's page.
func TestUnknownApiAddressAnswersInJson(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/api/nothing")

	// Assert.
	body := errorBody{}
	decode(t, response, &body)
	if response.Code != http.StatusNotFound || body.Error != "There's nothing at /api/nothing." {
		t.Fatalf("got %d %q", response.Code, body.Error)
	}
}

// TestOtherPathsGoToTheWebsite covers a page path, which the website answers.
func TestOtherPathsGoToTheWebsite(t *testing.T) {
	// Arrange.
	routes := serveFolder(t, map[string]string{"biscuits.yaml": biscuitsCard})

	// Act.
	response := request(t, routes, "/recipes/biscuits")

	// Assert.
	if response.Body.String() != "website" {
		t.Fatalf("got %q, expected the website", response.Body.String())
	}
}
