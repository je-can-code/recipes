package cards

import (
	"strings"
	"testing"
)

// The braces in a card owe the page amounts it can scale and pointers it can fill in, and owe the person
// writing a card a problem that says what to fix. A brace that slips through unread shows on a phone as
// "{half mlk}"; an amount written out on a card that scales stays the same at 4x while everything around it
// grows. So every rule and every rendering is pinned to its exact words.

// keyedCard is the complete card with a key on both ingredients and the given text as its one step, for
// tests of the braces in a card's text.
func keyedCard(t *testing.T, step string) Card {
	t.Helper()

	card := decodeComplete(t)
	card.Ingredients[0].Items = []string{"1/4 cup flour {flour}", "2 cups milk {milk}"}
	card.Method.Steps[0].Text = step
	return card
}

// renderStep renders a card and returns its first step's text.
func renderStep(t *testing.T, card Card) string {
	t.Helper()

	page, _, err := newRenderer(map[string]bool{}).renderCard(card)
	if err != nil {
		t.Fatal(err)
	}
	return page.Method.Steps[0].Text
}

// TestSplitKeySeparatesTheKeyFromTheLine covers a line ending in a key.
func TestSplitKeySeparatesTheKeyFromTheLine(t *testing.T) {
	// Arrange.
	item := "3 cups water {water}"

	// Act.
	text, key, hasKey := splitKey(item)

	// Assert.
	if text != "3 cups water" || key != "water" || hasKey == false {
		t.Fatalf("got %q, %q, %v", text, key, hasKey)
	}
}

// TestSplitKeyLeavesALineWithoutBraces covers a line with no key.
func TestSplitKeyLeavesALineWithoutBraces(t *testing.T) {
	// Arrange.
	item := "Salt, to taste"

	// Act.
	text, key, hasKey := splitKey(item)

	// Assert.
	if text != "Salt, to taste" || key != "" || hasKey {
		t.Fatalf("got %q, %q, %v", text, key, hasKey)
	}
}

// TestCheckCardAcceptsKeysPointersAndAmounts covers a card using every kind of braces correctly.
func TestCheckCardAcceptsKeysPointersAndAmounts(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk {flour} into {half milk}, then {rest milk}. You should have about {1 1/2 cups}.")

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, nil)
}

// TestCheckCardReportsAKeyThatIsntOne covers braces at the end of a line holding something no key can be.
func TestCheckCardReportsAKeyThatIsntOne(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Ingredients[0].Items = []string{"1/4 cup flour {Flour!}", "2 cups milk"}

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{
		"Ingredient group 1, item 1 ends in {Flour!}, which isn't a key. Keys are words joined by hyphens, like {olive-oil}.",
	})
}

// TestCheckCardReportsAKeyUsedTwice covers two lines claiming the same key.
func TestCheckCardReportsAKeyUsedTwice(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Ingredients[0].Items = []string{"1/4 cup flour {milk}", "2 cups milk {milk}"}

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Ingredient group 1, item 2 uses the key {milk} again. Each key names one ingredient."})
}

// TestCheckCardReportsBracesBeforeTheEndOfALine covers braces in the middle of an ingredient line.
func TestCheckCardReportsBracesBeforeTheEndOfALine(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Ingredients[0].Items = []string{"1/4 {cup} flour", "2 cups milk"}

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{
		"Ingredient group 1, item 1 has braces before its end. A key goes last on the line, like 3 cups water {water}.",
	})
}

// TestCheckCardReportsAPointerAtNoKey covers a pointer with a misspelled key.
func TestCheckCardReportsAPointerAtNoKey(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk in {half mlk}.")

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{`Step 1 points at {half mlk}, but no ingredient has the key "mlk".`})
}

// TestCheckCardReportsBracesThatAreNeither covers braces holding words that are no amount and no key.
func TestCheckCardReportsBracesThatAreNeither(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk in {a splash}.")

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Step 1 has {a splash}, which is neither an amount like {2 tbsp} nor a key like {water}."})
}

// TestCheckCardReportsABraceWithoutItsPair covers an opening brace that never closes.
func TestCheckCardReportsABraceWithoutItsPair(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk in {flour.")

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{"Step 1 has a brace without its pair."})
}

// TestCheckCardReportsBracesInTheIntroAndALead covers the two places braces would show as they are.
func TestCheckCardReportsBracesInTheIntroAndALead(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Intro = "A {flour} gravy."
	card.Method.Steps[0].Lead = "Whisk {flour}."

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{
		"The intro has braces. Amounts and keys go in the steps and notes.",
		"Step 1's lead has braces. Amounts and keys go in the text after the lead.",
	})
}

// TestCheckCardReportsAnAmountWrittenOutOnACardThatScales covers the promise scales: true makes.
func TestCheckCardReportsAnAmountWrittenOutOnACardThatScales(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk in the 2 cups milk.")
	card.Scales = true

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{
		`Step 1 writes out "2 cups". A card that scales puts it in braces, {2 cups}, or points at its ingredient ` +
			"by key, so the amount changes with the batch.",
	})
}

// TestCheckCardAllowsAnAmountWrittenOutWhenTheCardDoesntScale covers the same text without the promise.
func TestCheckCardAllowsAnAmountWrittenOutWhenTheCardDoesntScale(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk in the 2 cups milk.")

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, nil)
}

// TestCheckCardAllowsAmountsPerPiece covers the three ways a sentence says its amount is per piece.
func TestCheckCardAllowsAmountsPerPiece(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Use about 1/3 cup of rice per ball. Add water 1 tbsp at a time. Beat 3 eggs for each omelet.")
	card.Scales = true

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, nil)
}

// TestCheckCardAllowsSizesTimesAndTemperatures covers the numbers that aren't amounts.
func TestCheckCardAllowsSizesTimesAndTemperatures(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Heat a 6-quart pot and a 12-inch skillet for 10 minutes at 350°F, then cut 1/2-inch cubes.")
	card.Scales = true

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, nil)
}

// TestCheckCardIgnoresAmountsInALinkOrInBraces covers a recipe title in a link and a braced amount.
func TestCheckCardIgnoresAmountsInALinkOrInBraces(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Serve with [10 oz. Steak](10-oz-steak) and {2 tbsp} of the sauce.")
	card.Scales = true

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, nil)
}

// TestCheckCardReportsEveryAmountInANote covers two amounts in one sentence of a note.
func TestCheckCardReportsEveryAmountInANote(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Notes[0].Text = "use 2 tsp soy sauce and 1 tsp lemon juice."
	card.Scales = true

	// Act.
	messages := checkCard(card)

	// Assert.
	assertStrings(t, messages, []string{
		`Note 1 writes out "2 tsp". A card that scales puts it in braces, {2 tsp}, or points at its ingredient ` +
			"by key, so the amount changes with the batch.",
		`Note 1 writes out "1 tsp". A card that scales puts it in braces, {1 tsp}, or points at its ingredient ` +
			"by key, so the amount changes with the batch.",
	})
}

// TestRenderCardTurnsPointersAndAmountsIntoSpans covers each kind of token in a step.
func TestRenderCardTurnsPointersAndAmountsIntoSpans(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk {flour} into {half milk}, leaving about {1 1/2 cups}.")

	// Act.
	html := renderStep(t, card)

	// Assert.
	expected := `Whisk <span class="ref" data-ref="flour" data-portion="">the flour</span> into ` +
		`<span class="ref" data-ref="milk" data-portion="1/2">half the milk</span>, leaving about ` +
		`<span class="amount" data-amount="1 1/2 cups">1 1/2 cups</span>.`
	if html != expected {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardWordsEveryPortion covers each portion word and fraction, the usual ones and an unusual one.
func TestRenderCardWordsEveryPortion(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Use {third milk}, {quarter milk}, {eighth milk}, {double milk}, {rest milk}, {2/3 milk}, {3/4 milk} and {5/8 milk}.")

	// Act.
	html := renderStep(t, card)

	// Assert.
	expected := `Use <span class="ref" data-ref="milk" data-portion="1/3">a third of the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="1/4">a quarter of the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="1/8">an eighth of the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="2">double the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="rest">the rest of the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="2/3">two thirds of the milk</span>, ` +
		`<span class="ref" data-ref="milk" data-portion="3/4">three quarters of the milk</span> and ` +
		`<span class="ref" data-ref="milk" data-portion="5/8">5/8 of the milk</span>.`
	if html != expected {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardCapitalizesAPointerThatOpensASentence covers a pointer at the start and after a full stop.
func TestRenderCardCapitalizesAPointerThatOpensASentence(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "{flour} goes first. {half milk} follows.")

	// Act.
	html := renderStep(t, card)

	// Assert.
	expected := `<span class="ref" data-ref="flour" data-portion="">The flour</span> goes first. ` +
		`<span class="ref" data-ref="milk" data-portion="1/2">Half the milk</span> follows.`
	if html != expected {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardTellsAShareOfAKeyFromAnAmount covers the same shape, {1/2 x}, read both ways.
func TestRenderCardTellsAShareOfAKeyFromAnAmount(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Add {1/2 milk} and {1/2 tbsp} more.")

	// Act.
	html := renderStep(t, card)

	// Assert.
	expected := `Add <span class="ref" data-ref="milk" data-portion="1/2">half the milk</span> and ` +
		`<span class="amount" data-amount="1/2 tbsp">1/2 tbsp</span> more.`
	if html != expected {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardTakesKeysOffTheIngredients covers the lines shown without their keys, and the keys sent
// alongside, with "" for a line without one.
func TestRenderCardTakesKeysOffTheIngredients(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Ingredients[0].Items = []string{"1/4 cup flour {flour}", "2 cups milk"}

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertStrings(t, page.Ingredients[0].Items, []string{"1/4 cup flour", "2 cups milk"})
	assertStrings(t, page.Ingredients[0].Keys, []string{"flour", ""})
}

// TestRenderCardLeavesBracesInALinkAddressAlone covers braces that belong to an address, beside a pointer
// that doesn't.
func TestRenderCardLeavesBracesInALinkAddressAlone(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "See [the notes](https://example.com/{milk}) for {milk}.")

	// Act.
	html := renderStep(t, card)

	// Assert- one span, after the link, and none inside it.
	if strings.Count(html, "<span") != 1 || strings.Contains(html, "</a> for <span") == false {
		t.Fatalf("rendered %q", html)
	}
}

// TestRenderCardSendsWhetherTheCardScales covers scales: true reaching the page.
func TestRenderCardSendsWhetherTheCardScales(t *testing.T) {
	// Arrange.
	card := keyedCard(t, "Whisk.")
	card.Scales = true

	// Act.
	page, _, err := newRenderer(map[string]bool{}).renderCard(card)

	// Assert.
	if err != nil || page.Scales == false {
		t.Fatalf("got scales %v and error %v", page.Scales, err)
	}
}
