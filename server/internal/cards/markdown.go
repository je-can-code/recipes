package cards

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// Page is a recipe as the site shows it, with every markdown field rendered to HTML. The title, times,
// tags and group names stay plain text, since the site only ever shows those as they are. Scales says
// whether the page may offer other batch sizes.
type Page struct {
	Intro       string      `json:"intro"`
	Scales      bool        `json:"scales"`
	Ingredients []PageGroup `json:"ingredients"`
	Method      PageMethod  `json:"method"`
	Notes       []PageEntry `json:"notes"`
}

// PageGroup is an ingredient group with its items and closing paragraph rendered. Keys runs alongside
// Items, holding each line's key with its braces taken off, or "" for a line without one.
type PageGroup struct {
	Name  string   `json:"name"`
	Items []string `json:"items"`
	Keys  []string `json:"keys"`
	After string   `json:"after"`
}

// PageMethod is the method with every step and both paragraphs rendered.
type PageMethod struct {
	Before string      `json:"before"`
	Steps  []PageEntry `json:"steps"`
	After  string      `json:"after"`
}

// PageEntry is a rendered step or note.
type PageEntry struct {
	Lead string `json:"lead"`
	Text string `json:"text"`
}

// missingRecipesKey is where the link rewriter leaves the names it couldn't find, for the render that
// asked for them.
var missingRecipesKey = parser.NewContextKey()

// renderer turns card markdown into HTML. Tables are allowed, raw HTML is not, and links written as a
// bare recipe name, like [Chimichurri](chimichurri), are pointed at that recipe's page.
type renderer struct {
	markdown goldmark.Markdown
}

// newRenderer builds a renderer that knows which recipe names exist, so it can report links to any that
// don't.
func newRenderer(known map[string]bool) renderer {
	links := recipeLinks{known: known}
	markdown := goldmark.New(
		goldmark.WithExtensions(extension.Table),
		goldmark.WithParserOptions(parser.WithASTTransformers(util.Prioritized(links, 100))),
	)
	return renderer{markdown: markdown}
}

// renderCard renders every markdown field on a card. Alongside the page it returns the recipe names the
// card links to that have no card behind them.
func (renderer renderer) renderCard(card Card) (Page, []string, error) {
	render := &pageRender{renderer: renderer, missing: []string{}}
	keys := cardKeys(card.Ingredients)

	page := Page{
		Intro:       render.block(card.Intro),
		Scales:      card.Scales,
		Ingredients: []PageGroup{},
		Method: PageMethod{
			Before: render.measuredBlock(card.Method.Before, keys),
			Steps:  render.entries(card.Method.Steps, keys),
			After:  render.measuredBlock(card.Method.After, keys),
		},
		Notes: render.entries(card.Notes, keys),
	}
	for _, group := range card.Ingredients {
		items := []string{}
		itemKeys := []string{}
		for _, item := range group.Items {
			// the key is for steps to point at, so the line itself shows without it.
			text, key, _ := splitKey(item)
			items = append(items, render.inline(text))
			itemKeys = append(itemKeys, key)
		}
		page.Ingredients = append(page.Ingredients, PageGroup{
			Name:  group.Name,
			Items: items,
			Keys:  itemKeys,
			After: render.measuredBlock(group.After, keys),
		})
	}

	return page, render.missing, render.err
}

// pageRender renders the fields of one card, collecting every missing recipe name and keeping the first
// error, so renderCard can read top to bottom without checking after every field.
type pageRender struct {
	renderer renderer
	missing  []string
	err      error
}

// block renders markdown that may hold several paragraphs or a table.
func (render *pageRender) block(source string) string {
	// once something has failed, the page is thrown away, so there's no point rendering the rest.
	if render.err != nil || source == "" {
		return ""
	}

	context := parser.NewContext()
	html := bytes.Buffer{}
	if err := render.renderer.markdown.Convert([]byte(source), &html, parser.WithContext(context)); err != nil {
		render.err = err
		return ""
	}

	// the link rewriter leaves its findings in the context of this one render.
	if missing, found := context.Get(missingRecipesKey).([]string); found {
		render.missing = append(render.missing, missing...)
	}
	return strings.TrimSpace(html.String())
}

// inline renders a single line, like a lead or an ingredient, without the paragraph wrapped around it.
// Markdown that turns out to hold more than one paragraph is returned whole rather than mangled.
func (render *pageRender) inline(source string) string {
	html := render.block(source)
	isOneParagraph := strings.HasPrefix(html, "<p>") &&
		strings.HasSuffix(html, "</p>") &&
		strings.Count(html, "<p>") == 1
	if isOneParagraph == false {
		return html
	}
	return strings.TrimSuffix(strings.TrimPrefix(html, "<p>"), "</p>")
}

// entries renders a list of steps or notes, with the braces in each one's text turned into spans.
func (render *pageRender) entries(entries []LeadText, keys map[string]bool) []PageEntry {
	rendered := []PageEntry{}
	for _, entry := range entries {
		rendered = append(rendered, PageEntry{
			Lead: render.inline(entry.Lead),
			Text: render.measuredInline(entry.Text, keys),
		})
	}
	return rendered
}

// measuredBlock renders markdown that may hold braces, as block does, with each pair of braces turned into
// a span the page can scale.
func (render *pageRender) measuredBlock(source string, keys map[string]bool) string {
	marked, spans := markTokens(source, keys)
	return fillTokens(render.block(marked), spans)
}

// measuredInline is measuredBlock for a single line, like a step's text.
func (render *pageRender) measuredInline(source string, keys map[string]bool) string {
	marked, spans := markTokens(source, keys)
	return fillTokens(render.inline(marked), spans)
}

// recipeLinks points every link written as a bare recipe name at that recipe's page. Web addresses,
// absolute paths and anchors are left alone; any other link is meant to be a recipe, and a name with
// no card behind it is recorded as missing.
type recipeLinks struct {
	known map[string]bool
}

// Transform rewrites the recipe links in one parsed document and records the missing ones in the
// render's context.
func (links recipeLinks) Transform(document *ast.Document, reader text.Reader, context parser.Context) {
	missing := []string{}
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		link, isLink := node.(*ast.Link)
		if entering == false || isLink == false {
			return ast.WalkContinue, nil
		}

		destination := string(link.Destination)
		if pointsElsewhere(destination) {
			return ast.WalkContinue, nil
		}

		// a recipe link: send it to that recipe's page, and note it if nothing is there.
		if links.known[destination] == false {
			missing = append(missing, destination)
		}
		link.Destination = []byte("/recipes/" + destination)
		return ast.WalkContinue, nil
	})
	context.Set(missingRecipesKey, missing)
}

// pointsElsewhere reports whether a link leads somewhere other than a recipe: a web address, an email,
// an absolute path, or an anchor on the same page.
func pointsElsewhere(destination string) bool {
	return strings.Contains(destination, "://") ||
		strings.HasPrefix(destination, "mailto:") ||
		strings.HasPrefix(destination, "/") ||
		strings.HasPrefix(destination, "#")
}
