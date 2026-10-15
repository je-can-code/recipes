package cards

import (
	"testing"
)

// decodeCard and checkCard owe the site a card that is either complete or explained. A card that slips
// through half-broken shows up as a page with a hole in it, and a problem worded the way the parser saw
// it ("cannot unmarshal !!map into string") tells the person fixing it nothing. So every rule gets a
// test, and every rewording is pinned to the message it produces.

// decodeComplete decodes the complete card, failing the test if it doesn't decode cleanly.
func decodeComplete(t *testing.T) Card {
	t.Helper()

	card, messages := decodeCard([]byte(completeCard))
	if len(messages) > 0 {
		t.Fatalf("the complete card failed to decode: %q", messages)
	}
	return card
}

// TestDecodeCardReadsANumberAsText covers serves: 2 and makes: 9, which YAML reads as numbers. Both have
// to arrive as text, since the field is free text and most values aren't numbers.
func TestDecodeCardReadsANumberAsText(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "serves: 2", "makes: 9")

	// Act.
	card, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, nil)
	if card.Makes != "9" {
		t.Fatalf("makes is %q, expected \"9\"", card.Makes)
	}
}

// TestDecodeCardExplainsAColonInsideAnItem covers the classic YAML trap: an unquoted colon followed by a
// space turns an ingredient into a key and a value.
func TestDecodeCardExplainsAColonInsideAnItem(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "      - 1/4 cup flour", "      - 1/4 cup: flour")

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{
		"Line 10: expected text but found a key and a value. A colon followed by a space splits a line in two, " +
			"so quote the line or move it into a >- block.",
	})
}

// TestDecodeCardNamesAKeyTheFormatLacks covers a misspelled or invented key, which strict decoding refuses.
func TestDecodeCardNamesAKeyTheFormatLacks(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "serves: 2", "servings: 2")

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{`Line 4: "servings" isn't part of the card format.`})
}

// TestDecodeCardExplainsTextWhereAListBelongs covers a single tag written without the list around it.
func TestDecodeCardExplainsTextWhereAListBelongs(t *testing.T) {
	// Arrange.
	content := cardWithLine(t, "tags: [ brunch, pork ]", "tags: brunch")

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{`Line 6: expected a list, with each entry on its own line starting with "- ".`})
}

// TestDecodeCardFallsBackToTheDecodersWords covers a complaint with no better explanation, which keeps
// the decoder's wording rather than being dropped.
func TestDecodeCardFallsBackToTheDecodersWords(t *testing.T) {
	// Arrange- a list where text belongs, which none of the rewordings cover.
	content := cardWithLine(t, "serves: 2", "serves: [ 2 ]")

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{"Line 4: cannot unmarshal !!seq into string."})
}

// TestDecodeCardReportsAnEmptyFile covers a card saved with nothing in it.
func TestDecodeCardReportsAnEmptyFile(t *testing.T) {
	// Arrange.
	content := ""

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{"The file is empty."})
}

// TestDecodeCardPassesASyntaxErrorThrough covers YAML that can't be parsed at all.
func TestDecodeCardPassesASyntaxErrorThrough(t *testing.T) {
	// Arrange.
	content := "title: [ unclosed"

	// Act.
	_, messages := decodeCard([]byte(content))

	// Assert.
	assertStrings(t, messages, []string{"Line 1: did not find expected ',' or ']'."})
}

// TestCheckCardAcceptsACompleteCard is the baseline every other check test breaks one rule of.
func TestCheckCardAcceptsACompleteCard(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)

	// Act.
	messages := checkCard(card)

	// Assert- clean, and the card really is the one with a title.
	assertStrings(t, messages, []string{})
	if card.Title != "Test Gravy" {
		t.Fatalf("decoded title %q, expected \"Test Gravy\"", card.Title)
	}
}

// TestCheckCardNeedsATitle covers a card with no title.
func TestCheckCardNeedsATitle(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Title = "  "

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs a title."})
}

// TestCheckCardNeedsAnIntro covers a card with no intro.
func TestCheckCardNeedsAnIntro(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Intro = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs an intro."})
}

// TestCheckCardNeedsATime covers a card with no time.
func TestCheckCardNeedsATime(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Time = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs a time."})
}

// TestCheckCardRejectsBothServesAndMakes covers a card that claims both kinds of yield.
func TestCheckCardRejectsBothServesAndMakes(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Makes = "9"

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Has both serves and makes. Keep one."})
}

// TestCheckCardNeedsServesOrMakes covers a card with no yield at all.
func TestCheckCardNeedsServesOrMakes(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Serves = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs serves or makes."})
}

// TestCheckCardAcceptsMakesAlone covers the other half of the yield rule, so makes on its own counts.
func TestCheckCardAcceptsMakesAlone(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Serves = ""
	card.Makes = "9"

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{})
}

// TestCheckCardRejectsABlankTag covers an empty entry in the tag list, naming the one that's blank.
func TestCheckCardRejectsABlankTag(t *testing.T) {
	// Arrange- the first tag is fine, so only the second may be reported.
	card := decodeComplete(t)
	card.Tags = []string{"brunch", " "}

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Tag 2 is blank."})
}

// TestCheckCardNeedsAnIngredientGroup covers a card with no ingredients at all.
func TestCheckCardNeedsAnIngredientGroup(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Ingredients = nil

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs at least one ingredient group."})
}

// TestCheckCardNeedsItemsInEveryGroup covers an empty group after a good one.
func TestCheckCardNeedsItemsInEveryGroup(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Ingredients = append(card.Ingredients, IngredientGroup{Name: "Biscuits"})

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Ingredient group 2 has no items."})
}

// TestCheckCardRejectsABlankItem covers a blank line in an otherwise good list.
func TestCheckCardRejectsABlankItem(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Ingredients[0].Items[1] = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Ingredient group 1, item 2 is blank."})
}

// TestCheckCardNeedsAStep covers a method with no steps.
func TestCheckCardNeedsAStep(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Method.Steps = nil

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Needs at least one step."})
}

// TestCheckCardNeedsALeadOnEveryStep covers a step with text but no lead.
func TestCheckCardNeedsALeadOnEveryStep(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Method.Steps[0].Lead = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Step 1 needs a lead."})
}

// TestCheckCardNeedsTextOnEveryStep covers a step with a lead but no text.
func TestCheckCardNeedsTextOnEveryStep(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Method.Steps[0].Text = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Step 1 needs text after its lead."})
}

// TestCheckCardChecksNotesToo covers a note held to the same lead-and-text rule as a step.
func TestCheckCardChecksNotesToo(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Notes[0].Lead = ""

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Note 1 needs a lead."})
}

// TestCapitalizeLeavesAnEmptyMessageAlone covers the one input with no first letter to raise.
func TestCapitalizeLeavesAnEmptyMessageAlone(t *testing.T) {
	// Arrange- an empty message, beside a real one proving the function does anything at all.
	empty := ""

	// Act.
	result := capitalize(empty)

	// Assert.
	if result != "" || capitalize("line 1") != "Line 1" {
		t.Fatalf("got %q and %q", result, capitalize("line 1"))
	}
}

// TestCheckCardAllowsNoNotes covers notes being optional.
func TestCheckCardAllowsNoNotes(t *testing.T) {
	// Arrange.
	card := decodeComplete(t)
	card.Notes = nil

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{})
}
