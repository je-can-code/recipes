package cards

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v3"
)

// recipeName matches a recipe's name the way links use it: lowercase letters and digits in words joined
// by single hyphens, which is the file name without .yaml.
var recipeName = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// The decoder's complaints worth rewording, each one matched against its exact wording.
var (
	// line 12: cannot unmarshal !!map into string
	mappingWhereTextBelongs = regexp.MustCompile(`^line (\d+): cannot unmarshal !!map into string$`)

	// line 5: field serving not found in type cards.Card
	unknownKey = regexp.MustCompile(`^line (\d+): field (\S+) not found in type \S+$`)

	// line 3: cannot unmarshal !!str `beef` into []string
	textWhereListBelongs = regexp.MustCompile("^line (\\d+): cannot unmarshal !!str `.*` into \\[\\]")
)

// decodeCard reads one card's YAML strictly. When anything is wrong it returns every complaint the
// decoder had, reworded to say what to change rather than what the parser saw.
func decodeCard(content []byte) (Card, []string) {
	decoder := yaml.NewDecoder(bytes.NewReader(content))
	decoder.KnownFields(true)

	card := Card{}
	err := decoder.Decode(&card)
	if errors.Is(err, io.EOF) {
		return card, []string{"The file is empty."}
	}
	if err != nil {
		return card, describeDecodeError(err, "the card format")
	}
	return card, nil
}

// describeDecodeError turns the decoder's error into one message per complaint. The shape names what the
// file holds, like "the card format", for the complaint about a key it doesn't have.
func describeDecodeError(err error, shape string) []string {
	var typeError *yaml.TypeError
	if errors.As(err, &typeError) == false {
		// a syntax error stops the decoder where it happens, so there is only ever one to report.
		message := strings.TrimPrefix(err.Error(), "yaml: ")
		return []string{capitalize(message) + "."}
	}

	messages := []string{}
	for _, complaint := range typeError.Errors {
		messages = append(messages, describeComplaint(complaint, shape))
	}
	return messages
}

// describeComplaint rewords one of the decoder's complaints, falling back to its own words for any
// complaint without a better explanation.
func describeComplaint(complaint string, shape string) string {
	if match := mappingWhereTextBelongs.FindStringSubmatch(complaint); match != nil {
		return fmt.Sprintf("Line %s: expected text but found a key and a value. A colon followed by a space "+
			"splits a line in two, so quote the line or move it into a >- block.", match[1])
	}
	if match := unknownKey.FindStringSubmatch(complaint); match != nil {
		return fmt.Sprintf("Line %s: %q isn't part of %s.", match[1], match[2], shape)
	}
	if match := textWhereListBelongs.FindStringSubmatch(complaint); match != nil {
		return fmt.Sprintf("Line %s: expected a list, with each entry on its own line starting with \"- \".",
			match[1])
	}
	return capitalize(complaint) + "."
}

// checkCard applies the rules decoding can't: the fields every card needs, exactly one of serves or
// makes, no empty lists or blank entries, and the rules for keys and braces in measures.go. It returns one
// message per broken rule.
func checkCard(card Card) []string {
	messages := []string{}

	// every card has these, whatever else it does.
	if isBlank(card.Title) {
		messages = append(messages, "Needs a title.")
	}
	if isBlank(card.Intro) {
		messages = append(messages, "Needs an intro.")
	}
	if isBlank(card.Time) {
		messages = append(messages, "Needs a time.")
	}

	// a recipe yields servings or an amount, so it says one or the other and never both.
	hasServes := isBlank(card.Serves) == false
	hasMakes := isBlank(card.Makes) == false
	if hasServes && hasMakes {
		messages = append(messages, "Has both serves and makes. Keep one.")
	}
	if hasServes == false && hasMakes == false {
		messages = append(messages, "Needs serves or makes.")
	}

	// a blank tag would match every search, so it can't be left in.
	for index, tag := range card.Tags {
		if isBlank(tag) {
			messages = append(messages, fmt.Sprintf("Tag %d is blank.", index+1))
		}
	}

	messages = append(messages, checkIngredients(card.Ingredients)...)
	messages = append(messages, checkMethod(card.Method)...)
	messages = append(messages, checkEntries("Note", card.Notes)...)
	messages = append(messages, checkMeasures(card)...)
	return messages
}

// checkIngredients requires at least one group, and an item in every group with nothing blank.
func checkIngredients(groups []IngredientGroup) []string {
	if len(groups) == 0 {
		return []string{"Needs at least one ingredient group."}
	}

	messages := []string{}
	for groupIndex, group := range groups {
		where := fmt.Sprintf("Ingredient group %d", groupIndex+1)
		if len(group.Items) == 0 {
			messages = append(messages, where+" has no items.")
		}
		for itemIndex, item := range group.Items {
			if isBlank(item) {
				messages = append(messages, fmt.Sprintf("%s, item %d is blank.", where, itemIndex+1))
			}
		}
	}
	return messages
}

// checkMethod requires at least one step, each with a lead and text.
func checkMethod(method Method) []string {
	if len(method.Steps) == 0 {
		return []string{"Needs at least one step."}
	}
	return checkEntries("Step", method.Steps)
}

// checkEntries requires a lead and text on every step or note, naming each by its position.
func checkEntries(kind string, entries []LeadText) []string {
	messages := []string{}
	for index, entry := range entries {
		if isBlank(entry.Lead) {
			messages = append(messages, fmt.Sprintf("%s %d needs a lead.", kind, index+1))
		}
		if isBlank(entry.Text) {
			messages = append(messages, fmt.Sprintf("%s %d needs text after its lead.", kind, index+1))
		}
	}
	return messages
}

// isBlank reports whether text holds nothing but whitespace.
func isBlank(text string) bool {
	return strings.TrimSpace(text) == ""
}

// capitalize raises the first letter of a message so every problem reads as a sentence.
func capitalize(message string) string {
	if message == "" {
		return message
	}
	return strings.ToUpper(message[:1]) + message[1:]
}
