package cards

import (
	"testing"
)

// renderCard owes the recipe page HTML it can drop straight in: links between recipes pointed at their
// pages, every other link left alone, single lines without a stray paragraph around them, tables intact,
// and no raw HTML from a card ever reaching the browser.

// renderIntro renders a card whose intro is the given markdown, knowing only the named recipes exist.
func renderIntro(t *testing.T, intro string, known ...string) (string, []string) {
	t.Helper()

	names := map[string]bool{}
	for _, name := range known {
		names[name] = true
	}
	card := decodeComplete(t)
	card.Intro = intro

	page, missing, err := newRenderer(names).renderCard(card)
	if err != nil {
		t.Fatal(err)
	}
	return page.Intro, missing
}

// TestRenderCardPointsARecipeLinkAtItsPage covers a link written as a bare recipe name.
func TestRenderCardPointsARecipeLinkAtItsPage(t *testing.T) {
	// Arrange.
	intro := "Serve with [Chimichurri](chimichurri)."

	// Act.
	html, missing := renderIntro(t, intro, "chimichurri")

	// Assert.
	if html != `<p>Serve with <a href="/recipes/chimichurri">Chimichurri</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{})
}

// TestRenderCardRecordsALinkToNoRecipe covers a recipe name with no card, which is still pointed at its
// page but comes back as missing.
func TestRenderCardRecordsALinkToNoRecipe(t *testing.T) {
	// Arrange- an old markdown-style link, which is no recipe's name.
	intro := "Serve with [Chimichurri](chimichurri.md)."

	// Act.
	html, missing := renderIntro(t, intro, "chimichurri")

	// Assert.
	if html != `<p>Serve with <a href="/recipes/chimichurri.md">Chimichurri</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{"chimichurri.md"})
}

// TestRenderCardLeavesAWebAddressAlone covers a link out to another site.
func TestRenderCardLeavesAWebAddressAlone(t *testing.T) {
	// Arrange.
	intro := "From [a blog](https://example.com/gravy)."

	// Act.
	html, missing := renderIntro(t, intro)

	// Assert.
	if html != `<p>From <a href="https://example.com/gravy">a blog</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{})
}

// TestRenderCardLeavesAnEmailAlone covers a mailto link.
func TestRenderCardLeavesAnEmailAlone(t *testing.T) {
	// Arrange.
	intro := "Ask [me](mailto:cook@example.com)."

	// Act.
	html, missing := renderIntro(t, intro)

	// Assert.
	if html != `<p>Ask <a href="mailto:cook@example.com">me</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{})
}

// TestRenderCardLeavesAnAbsolutePathAlone covers a link already pointing at a page on the site.
func TestRenderCardLeavesAnAbsolutePathAlone(t *testing.T) {
	// Arrange.
	intro := "See [the list](/search?q=gravy)."

	// Act.
	html, missing := renderIntro(t, intro)

	// Assert.
	if html != `<p>See <a href="/search?q=gravy">the list</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{})
}

// TestRenderCardLeavesAnAnchorAlone covers a link to a spot on the same page.
func TestRenderCardLeavesAnAnchorAlone(t *testing.T) {
	// Arrange.
	intro := "See [the notes](#notes)."

	// Act.
	html, missing := renderIntro(t, intro)

	// Assert.
	if html != `<p>See <a href="#notes">the notes</a>.</p>` {
		t.Fatalf("rendered %q", html)
	}
	assertStrings(t, missing, []string{})
}

// TestRenderCardDropsRawHtml covers HTML typed into a card, which never reaches the page.
func TestRenderCardDropsRawHtml(t *testing.T) {
	// Arrange.
	intro := "<script>alert('hi')</script>"

	// Act.
	html, _ := renderIntro(t, intro)

	// Assert.
	if html != "<!-- raw HTML omitted -->" {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardRendersAnItemWithoutAParagraph covers a single-line field, which sits inside a list item
// and must not carry paragraph tags of its own.
func TestRenderCardRendersAnItemWithoutAParagraph(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Ingredients[0].Items[0] = "1/4 cup **cold** butter"

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if page.Ingredients[0].Items[0] != "1/4 cup <strong>cold</strong> butter" {
		t.Fatalf("rendered %q", page.Ingredients[0].Items[0])
	}
}

// TestRenderCardKeepsTwoParagraphsWhole covers single-line text that turns out to hold two paragraphs,
// which comes back as both rather than with one tag torn off each end.
func TestRenderCardKeepsTwoParagraphsWhole(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Method.Steps[0].Text = "First part.\n\nSecond part."

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if page.Method.Steps[0].Text != "<p>First part.</p>\n<p>Second part.</p>" {
		t.Fatalf("rendered %q", page.Method.Steps[0].Text)
	}
}

// TestRenderCardRendersATable covers the doneness table that sits after the steak card's steps.
func TestRenderCardRendersATable(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Method.After = "| Doneness | Pull at |\n| --- | --- |\n| **Medium-rare** | 126°F |"

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := "<table>\n<thead>\n<tr>\n<th>Doneness</th>\n<th>Pull at</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n" +
		"<td><strong>Medium-rare</strong></td>\n<td>126°F</td>\n</tr>\n</tbody>\n</table>"
	if page.Method.After != expected {
		t.Fatalf("rendered %q", page.Method.After)
	}
}

// TestRenderCardLeavesAnEmptyFieldEmpty covers an optional paragraph the card doesn't have.
func TestRenderCardLeavesAnEmptyFieldEmpty(t *testing.T) {
	// Arrange- the complete card has no text before its steps, but does have a step.
	card := decodeComplete(t)

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if page.Method.Before != "" || page.Method.Steps[0].Lead != "Whisk." {
		t.Fatalf("got before %q and first lead %q", page.Method.Before, page.Method.Steps[0].Lead)
	}
}
