// Package cards reads the recipe folder: it decodes every YAML card, checks it against the card format,
// renders its markdown for the site, and reports anything wrong in words the person fixing it can use.
//
// The format itself is documented in _template.yaml inside the recipes folder. The types here are that
// format as Go sees it.
package cards

// Card is one recipe file exactly as written on disk. Every text field holds markdown.
//
// Decoding is strict on purpose. A key the format doesn't define is an error, and so is a value of the
// wrong shape, which is how a sentence with an unquoted colon gets caught: YAML reads it as a key and a
// value, so a mapping turns up where text belongs.
//
// Scales says the card is written for the page's batch sizes: every amount its text names outside the
// ingredients is in braces, points at an ingredient by key, or says it's per piece. It's opt-in, and the
// check holds a card that says it to that promise.
type Card struct {
	Title       string            `yaml:"title"`
	Intro       string            `yaml:"intro"`
	Serves      string            `yaml:"serves"`
	Makes       string            `yaml:"makes"`
	Time        string            `yaml:"time"`
	Scales      bool              `yaml:"scales"`
	Tags        []string          `yaml:"tags"`
	Ingredients []IngredientGroup `yaml:"ingredients"`
	Method      Method            `yaml:"method"`
	Notes       []LeadText        `yaml:"notes"`
}

// IngredientGroup is one list of ingredients, with an optional heading above it and an optional paragraph
// under it. A recipe with one plain list has a single group with no name.
type IngredientGroup struct {
	Name  string   `yaml:"name"`
	Items []string `yaml:"items"`
	After string   `yaml:"after"`
}

// Method is the steps in order, with optional text before the first and after the last.
type Method struct {
	Before string     `yaml:"before"`
	Steps  []LeadText `yaml:"steps"`
	After  string     `yaml:"after"`
}

// LeadText is a step or a note: a short bold lead the cook can find at a glance, then the rest of it.
type LeadText struct {
	Lead string `yaml:"lead"`
	Text string `yaml:"text"`
}
