package cards

import (
	"fmt"
	"html"
	"regexp"
	"strings"
)

// The format that lets a recipe page change the batch size and show amounts inside its steps. An
// ingredient line may end in a key, like "3 cups water {water}". A step, a note or a paragraph may then
// point at that ingredient, as {water} or {half water}, or put an amount of its own in braces, like
// {2/3 cup}, so the page can scale it with everything else. On a card that says scales: true, every
// amount the text writes out has to be one of those, or say it's per piece, since the page can't scale an
// amount it can't see.

// ingredientKeyAtEnd finds a key at the end of an ingredient line: the line, a space, then braces.
var ingredientKeyAtEnd = regexp.MustCompile(`^(.*\S)\s+\{([^{}]*)\}$`)

// keyName is what a key may look like: words of letters and digits joined by single hyphens. Capitals are
// allowed for names, so {Sichuan-pepper} reads "the Sichuan pepper".
var keyName = regexp.MustCompile(`^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`)

// braced finds each pair of braces in a card's text, with what it holds.
var braced = regexp.MustCompile(`\{([^{}]*)\}`)

// linkTarget finds where a markdown link points. Braces there are part of an address, not a token.
var linkTarget = regexp.MustCompile(`\]\([^)]*\)`)

// numberText is a number the way the cards write one: 5, 1.5, 1/2 or 1 1/2, with the mixed fraction tried
// first so "1 1/2" isn't read as a 1 and a stray half.
const numberText = `(?:\d+ \d+/\d+|\d+/\d+|\d+(?:\.\d+)?)`

// bracedAmount is an amount in braces: a number or a range, then what it measures or counts, like
// {2/3 cup}, {about 1 tbsp}, {6 to 8 oz} or {4 portions}.
var bracedAmount = regexp.MustCompile(`^(?:about )?` + numberText + `(?: to ` + numberText + `)? [A-Za-z][A-Za-z .]*$`)

// bracedPointer is a pointer at an ingredient: its key, after an optional portion, like {water},
// {half water} or {1/8 broth}.
var bracedPointer = regexp.MustCompile(`^(?:(half|third|quarter|eighth|double|rest|\d+/\d+) )?([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$`)

// portionFractions turns each portion word into the share of the ingredient it means.
var portionFractions = map[string]string{"half": "1/2", "third": "1/3", "quarter": "1/4", "eighth": "1/8", "double": "2"}

// fractionPhrases is how the usual shares read in front of an ingredient's name.
var fractionPhrases = map[string]string{
	"1/2": "half the",
	"1/3": "a third of the",
	"2/3": "two thirds of the",
	"1/4": "a quarter of the",
	"3/4": "three quarters of the",
	"1/8": "an eighth of the",
	"2":   "double the",
}

// writtenAmount finds an amount written out in a card's text: a number or a range, a space, then a measure
// or one of the counts a recipe grows by, like "6 cups", "2 tbsp" or "3 eggs". A size joined by a hyphen,
// like a "6-quart pot" or "1/2-inch cubes", describes a pan or a cut, so it never matches, and neither do
// times or temperatures.
var writtenAmount = regexp.MustCompile(`(?i)(?:^|[^\w/.])(` + numberText + `(?: to ` + numberText + `)? ` +
	`(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|pounds?|lbs?|ounces?|oz|grams?|g|kg|ml|liters?|litres?|quarts?|` +
	`pints?|gallons?|cloves?|eggs?|yolks?|sticks?|cans?|blocks?))\b`)

// perPiece finds a sentence that says its amount is for each piece, or goes in a little at a time, which
// stays the same however big the batch is.
var perPiece = regexp.MustCompile(`(?i)\b(?:per|each|apiece|at a time)\b`)

// markdownLink finds a whole markdown link, whose label may be a recipe's title, like "10 oz. Steak".
var markdownLink = regexp.MustCompile(`\[[^\]]*\]\([^)]*\)`)

// sentenceEnd finds where one sentence stops and the next starts.
var sentenceEnd = regexp.MustCompile(`[.!?]\s+`)

// opensSentence finds text that ends where a sentence begins: nothing at all, or a full stop and a space.
var opensSentence = regexp.MustCompile(`(?:^|[.!?]["')]?\s+)$`)

// markerOpen and markerClose hold a token's place while the markdown around it renders. They're U+E000
// and U+E001, from Unicode's private use area, which no card uses, and markdown passes them through
// untouched. Built from their code points so the source never holds an invisible character.
const (
	markerOpen  = string(rune(0xE000))
	markerClose = string(rune(0xE001))
)

// token is one pair of braces, read: an amount, or a pointer at an ingredient's key with the share of it
// meant, as a fraction like "1/2", "rest" for whatever is left, or empty for all of it.
type token struct {
	amount  string
	key     string
	portion string
}

// place is a piece of a card's text where braces may go, with how a message names it.
type place struct {
	name string
	text string
}

// splitKey separates an ingredient line from the key at its end: "3 cups water {water}" is the line "3 cups
// water" and the key "water". The third result says whether the line ended in braces at all, so an empty or
// malformed key gets reported rather than shown as part of the line.
func splitKey(item string) (string, string, bool) {
	match := ingredientKeyAtEnd.FindStringSubmatch(strings.TrimSpace(item))
	if match == nil {
		return item, "", false
	}
	return match[1], match[2], true
}

// readToken reads what one pair of braces holds. A pointer wins when its key is one of the card's, which is
// how {1/2 milk} means half the milk while {1/2 tbsp} is an amount.
func readToken(raw string, keys map[string]bool) (token, bool) {
	if match := bracedPointer.FindStringSubmatch(raw); match != nil && keys[match[2]] {
		portion := match[1]
		if fraction, isWord := portionFractions[portion]; isWord {
			portion = fraction
		}
		return token{key: match[2], portion: portion}, true
	}
	if bracedAmount.MatchString(raw) {
		return token{amount: raw}, true
	}
	return token{}, false
}

// pointerPhrase is how a pointer reads on the page: "the water", "half the water", "the rest of the water",
// with the key's hyphens read as spaces.
func pointerPhrase(portion string, key string) string {
	name := strings.ReplaceAll(key, "-", " ")
	if portion == "" {
		return "the " + name
	}
	if portion == "rest" {
		return "the rest of the " + name
	}
	if phrase, isUsual := fractionPhrases[portion]; isUsual {
		return phrase + " " + name
	}
	return portion + " of the " + name
}

// tokenSpan is the HTML a token becomes: an amount in a span that carries it for the page to scale, or a
// pointer's words in a span that carries its key and share, capitalized when the pointer opens a sentence.
// Both read correctly as they are, before the page adds anything.
func tokenSpan(found token, isOpening bool) string {
	if found.amount != "" {
		amount := html.EscapeString(found.amount)
		return fmt.Sprintf(`<span class="amount" data-amount="%s">%s</span>`, amount, amount)
	}
	phrase := pointerPhrase(found.portion, found.key)
	if isOpening {
		phrase = strings.ToUpper(phrase[:1]) + phrase[1:]
	}
	return fmt.Sprintf(`<span class="ref" data-ref="%s" data-portion="%s">%s</span>`, found.key, found.portion, html.EscapeString(phrase))
}

// markTokens swaps each pair of braces in a card's text for a numbered marker, returning the marked text
// and each marker's span, in order. Braces inside a link's address stay as they are, and so do braces that
// read as neither an amount nor a pointer, which the check has already turned away.
func markTokens(source string, keys map[string]bool) (string, []string) {
	targets := linkTarget.FindAllStringIndex(source, -1)
	spans := []string{}
	marked := strings.Builder{}
	from := 0
	for _, match := range braced.FindAllStringSubmatchIndex(source, -1) {
		found, isToken := readToken(source[match[2]:match[3]], keys)
		if isToken == false || isInside(match[0], targets) {
			continue
		}

		// a pointer that starts a sentence starts with a capital, like any other word would.
		isOpening := opensSentence.MatchString(strings.TrimLeft(source[:match[0]], " \n"))
		marked.WriteString(source[from:match[0]])
		marked.WriteString(fmt.Sprintf("%s%d%s", markerOpen, len(spans), markerClose))
		spans = append(spans, tokenSpan(found, isOpening))
		from = match[1]
	}
	marked.WriteString(source[from:])
	return marked.String(), spans
}

// fillTokens puts each span where its marker landed in the rendered HTML.
func fillTokens(rendered string, spans []string) string {
	for index, span := range spans {
		rendered = strings.Replace(rendered, fmt.Sprintf("%s%d%s", markerOpen, index, markerClose), span, 1)
	}
	return rendered
}

// isInside reports whether a position falls within any of the given ranges.
func isInside(position int, ranges [][]int) bool {
	for _, bounds := range ranges {
		if position >= bounds[0] && position < bounds[1] {
			return true
		}
	}
	return false
}

// cardKeys collects the keys on a card's ingredient lines, which is what tells a pointer from an amount.
func cardKeys(groups []IngredientGroup) map[string]bool {
	keys, _ := checkKeys(groups)
	return keys
}

// checkKeys reads the key at the end of each ingredient line, returning every good key along with the
// problems: braces before the end of a line, a key that isn't one, and a key used twice.
func checkKeys(groups []IngredientGroup) (map[string]bool, []string) {
	keys := map[string]bool{}
	messages := []string{}
	for groupIndex, group := range groups {
		for itemIndex, item := range group.Items {
			where := fmt.Sprintf("Ingredient group %d, item %d", groupIndex+1, itemIndex+1)
			text, key, hasKey := splitKey(item)
			if strings.ContainsAny(text, "{}") {
				messages = append(messages, where+" has braces before its end. A key goes last on the line, like 3 cups water {water}.")
			}
			if hasKey == false {
				continue
			}
			if keyName.MatchString(key) == false {
				messages = append(messages, fmt.Sprintf("%s ends in {%s}, which isn't a key. Keys are words joined by hyphens, like {olive-oil}.", where, key))
				continue
			}
			if keys[key] {
				messages = append(messages, fmt.Sprintf("%s uses the key {%s} again. Each key names one ingredient.", where, key))
				continue
			}
			keys[key] = true
		}
	}
	return keys, messages
}

// measuredPlaces lists every piece of a card's text where braces may go, in the order the page shows them.
func measuredPlaces(card Card) []place {
	places := []place{}
	for index, group := range card.Ingredients {
		places = append(places, place{name: fmt.Sprintf("Ingredient group %d's paragraph", index+1), text: group.After})
	}
	places = append(places, place{name: "The method's opening paragraph", text: card.Method.Before})
	for index, step := range card.Method.Steps {
		places = append(places, place{name: fmt.Sprintf("Step %d", index+1), text: step.Text})
	}
	places = append(places, place{name: "The method's closing paragraph", text: card.Method.After})
	for index, note := range card.Notes {
		places = append(places, place{name: fmt.Sprintf("Note %d", index+1), text: note.Text})
	}
	return places
}

// checkMeasures applies the rules for keys and braces: good keys, braces that each read as an amount or a
// pointer at a real key, none where the page doesn't look for them, and, on a card that scales, no amount
// written out where the page can't scale it.
func checkMeasures(card Card) []string {
	keys, messages := checkKeys(card.Ingredients)

	// the intro and the leads are shown as they are, so braces there would show too.
	if strings.ContainsAny(card.Intro, "{}") {
		messages = append(messages, "The intro has braces. Amounts and keys go in the steps and notes.")
	}
	messages = append(messages, checkLeads("Step", card.Method.Steps)...)
	messages = append(messages, checkLeads("Note", card.Notes)...)

	for _, where := range measuredPlaces(card) {
		messages = append(messages, checkBraces(where, keys)...)
		if card.Scales == false {
			continue
		}
		for _, amount := range writtenAmounts(where.text) {
			messages = append(messages, fmt.Sprintf("%s writes out %q. A card that scales puts it in braces, {%s}, "+
				"or points at its ingredient by key, so the amount changes with the batch.", where.name, amount, amount))
		}
	}
	return messages
}

// checkLeads reports braces in a step's or note's lead, which the page shows as it is.
func checkLeads(kind string, entries []LeadText) []string {
	messages := []string{}
	for index, entry := range entries {
		if strings.ContainsAny(entry.Lead, "{}") {
			messages = append(messages, fmt.Sprintf("%s %d's lead has braces. Amounts and keys go in the text after the lead.", kind, index+1))
		}
	}
	return messages
}

// checkBraces reads every pair of braces in one piece of text, reporting any that is neither an amount nor a
// pointer at one of the card's keys, and any brace left without its pair.
func checkBraces(where place, keys map[string]bool) []string {
	messages := []string{}
	for _, match := range braced.FindAllStringSubmatch(where.text, -1) {
		raw := match[1]
		if _, isToken := readToken(raw, keys); isToken {
			continue
		}
		if pointer := bracedPointer.FindStringSubmatch(raw); pointer != nil {
			messages = append(messages, fmt.Sprintf("%s points at {%s}, but no ingredient has the key %q.", where.name, raw, pointer[2]))
			continue
		}
		messages = append(messages, fmt.Sprintf("%s has {%s}, which is neither an amount like {2 tbsp} nor a key like {water}.", where.name, raw))
	}
	if strings.ContainsAny(braced.ReplaceAllString(where.text, ""), "{}") {
		messages = append(messages, where.name+" has a brace without its pair.")
	}
	return messages
}

// writtenAmounts lists the amounts a piece of text writes out, leaving out braces, links, and any sentence
// that says its amount is per piece, like "1/3 cup of rice per ball" or "1 tbsp at a time".
func writtenAmounts(text string) []string {
	plain := markdownLink.ReplaceAllString(braced.ReplaceAllString(text, " "), " ")
	found := []string{}
	for _, sentence := range sentencesOf(plain) {
		if perPiece.MatchString(sentence) {
			continue
		}
		for _, match := range writtenAmount.FindAllStringSubmatch(sentence, -1) {
			found = append(found, match[1])
		}
	}
	return found
}

// sentencesOf splits text into its sentences, each keeping the stop that ends it.
func sentencesOf(text string) []string {
	sentences := []string{}
	start := 0
	for _, bounds := range sentenceEnd.FindAllStringIndex(text, -1) {
		sentences = append(sentences, text[start:bounds[1]])
		start = bounds[1]
	}
	return append(sentences, text[start:])
}
