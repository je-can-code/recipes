/**
 * Reading, scaling and writing the amounts on a recipe: "1 1/4 lb", "6 to 8", "about 2/3 cup". Every amount
 * the page shows passes through here, whether it leads an ingredient line, sits in braces in a step, or rides
 * along with a pointer at an ingredient, so the kitchen fractions, the plurals and the metric conversions come
 * out the same wherever an amount appears.
 */

/**
 * The measuring system the page shows amounts in. US is how the cards are written. Metric is milliliters,
 * grams, Celsius and centimeters, keeping teaspoons and tablespoons, since Japan's 小さじ and 大さじ are the same
 * 5 and 15 ml, and keeping rice cooker cups, since a gō is the same 180 ml there.
 */
type MeasureSystem = 'us' | 'metric';

/**
 * What a measuring word measures. Each kind rounds its own way and turns into its own thing in metric. A
 * pinch stands for the measures too small to scale: pinches, dashes, splashes and drops. A handful is counted
 * instead, like a head or a bunch, since a handful of greens grows with the batch.
 */
type UnitKind =
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'floz'
  | 'pint'
  | 'quart'
  | 'gallon'
  | 'oz'
  | 'lb'
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'ricecup'
  | 'inch'
  | 'cm'
  | 'mm'
  | 'pinch';

/**
 * An amount as a card writes it: a number or a range, with "about" in front or not, and its measuring word.
 * Kind is null for a count of something, like the 2 in "2 onions". Written is the measuring word exactly as
 * the card has it, like "cups" or "rice cooker cups", or '' for a count.
 */
interface Amount
{
  low: number;
  high: number;
  isAbout: boolean;
  kind: UnitKind | null;
  written: string;
}

/**
 * An amount found at the start of some text, and how many characters of the text it took.
 */
interface FoundAmount
{
  amount: Amount;
  length: number;
}

/**
 * A number the way the cards write one: 5, 1.5, 1/2 or 1 1/2, the mixed fraction first so "1 1/2" isn't
 * read as a 1 with a stray half after it. A fraction's bottom is one a measuring cup or spoon has, so a
 * ratio like the 80/20 in ground beef is never read as an amount of 4.
 */
const numberPattern = String.raw`\d+\s+\d+/(?:2|3|4|8|16)|\d+/(?:2|3|4|8|16)|\d+(?:\.\d+)?`;

/**
 * Where a number found inside a longer line may start: not in the middle of another number, word or ratio,
 * so the 20 in 80/20 is never an amount of its own.
 */
const numberStart = String.raw`(?<![\w/.])`;

/**
 * Every measuring word the cards use, longest first, so "rice cooker cups" wins over "cups" and "fl oz"
 * over "oz".
 */
const unitPattern = [
  'rice[- ]cooker cups?',
  String.raw`fl\.? oz`,
  'tablespoons?',
  'tbsp',
  'teaspoons?',
  'tsp',
  'cups?',
  'ounces?',
  'oz',
  'pounds?',
  'lbs?',
  'pints?',
  'quarts?',
  'gallons?',
  'kilograms?',
  'kg',
  'grams?',
  'g',
  'milliliters?',
  'millilitres?',
  'ml',
  'liters?',
  'litres?',
  'inch(?:es)?',
  'cm',
  'mm',
  'pinch(?:es)?',
  'dash(?:es)?',
  'splash(?:es)?',
  'drops?',
].join('|');

/**
 * An amount at the very start of some text: "about" or not, a number or a range, and a measuring word when
 * one follows. It has to end where a word ends, so the 12 in "12-inch skillet" is a size, not an amount, and
 * the g never comes out of "garlic".
 */
const leadingAmount = new RegExp(
  String.raw`^(about\s+)?(${numberPattern})(?:\s+(?:to|or)\s+(${numberPattern}))?(?:\s+(${unitPattern}))?(?=[\s,.;:)]|$)`,
  'i',
);

/**
 * What each measuring word measures, tried in order.
 */
const unitKinds: [ RegExp, UnitKind ][] = [
  [ /^rice[- ]cooker cups?$/i, 'ricecup' ],
  [ /^fl\.? oz$/i, 'floz' ],
  [ /^(?:tablespoons?|tbsp)$/i, 'tbsp' ],
  [ /^(?:teaspoons?|tsp)$/i, 'tsp' ],
  [ /^cups?$/i, 'cup' ],
  [ /^(?:ounces?|oz)$/i, 'oz' ],
  [ /^(?:pounds?|lbs?)$/i, 'lb' ],
  [ /^pints?$/i, 'pint' ],
  [ /^quarts?$/i, 'quart' ],
  [ /^gallons?$/i, 'gallon' ],
  [ /^(?:kilograms?|kg)$/i, 'kg' ],
  [ /^(?:grams?|g)$/i, 'g' ],
  [ /^(?:milliliters?|millilitres?|ml)$/i, 'ml' ],
  [ /^(?:liters?|litres?)$/i, 'l' ],
  [ /^inch(?:es)?$/i, 'inch' ],
  [ /^cm$/i, 'cm' ],
  [ /^mm$/i, 'mm' ],
  [ /^(?:pinch(?:es)?|dash(?:es)?|splash(?:es)?|drops?)$/i, 'pinch' ],
];

/**
 * The measuring words written out in full, which a card's amount keeps when its kind stays the same.
 */
const longWord = /^(?:cups?|tablespoons?|teaspoons?|ounces?|pounds?|pints?|quarts?|gallons?|kilograms?|grams?|milliliters?|millilitres?|liters?|litres?|rice[- ]cooker cups?|inch(?:es)?)$/i;

/**
 * Each kind's short words, singular and plural, used when an amount moves to a new kind or was written short.
 */
const shortForms: Record<UnitKind, [ string, string ]> = {
  tsp: [ 'tsp', 'tsp' ],
  tbsp: [ 'tbsp', 'tbsp' ],
  cup: [ 'cup', 'cups' ],
  floz: [ 'fl oz', 'fl oz' ],
  pint: [ 'pint', 'pints' ],
  quart: [ 'quart', 'quarts' ],
  gallon: [ 'gallon', 'gallons' ],
  oz: [ 'oz', 'oz' ],
  lb: [ 'lb', 'lb' ],
  g: [ 'g', 'g' ],
  kg: [ 'kg', 'kg' ],
  ml: [ 'ml', 'ml' ],
  l: [ 'L', 'L' ],
  ricecup: [ 'rice cooker cup', 'rice cooker cups' ],
  inch: [ 'inch', 'inches' ],
  cm: [ 'cm', 'cm' ],
  mm: [ 'mm', 'mm' ],
  pinch: [ 'pinch', 'pinches' ],
};

/**
 * Each kind's words written out in full, singular and plural.
 */
const longForms: Record<UnitKind, [ string, string ]> = {
  ...shortForms,
  tsp: [ 'teaspoon', 'teaspoons' ],
  tbsp: [ 'tablespoon', 'tablespoons' ],
  oz: [ 'ounce', 'ounces' ],
  lb: [ 'pound', 'pounds' ],
  g: [ 'gram', 'grams' ],
  kg: [ 'kilogram', 'kilograms' ],
  ml: [ 'milliliter', 'milliliters' ],
  l: [ 'liter', 'liters' ],
};

/**
 * The fractions each kind rounds to under 10, by what a drawer of spoons and cups can actually measure.
 * Counts round the way people cut things: halves, thirds and quarters.
 */
const roundingFractions: Record<UnitKind | 'count', number[]> = {
  tsp: [ 1 / 8, 1 / 4, 1 / 2, 3 / 4 ],
  tbsp: [ 1 / 4, 1 / 2, 3 / 4 ],
  cup: [ 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4 ],
  floz: [ 1 / 2 ],
  pint: [ 1 / 4, 1 / 2, 3 / 4 ],
  quart: [ 1 / 4, 1 / 2, 3 / 4 ],
  gallon: [ 1 / 4, 1 / 2, 3 / 4 ],
  oz: [ 1 / 2 ],
  lb: [ 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4 ],
  g: [ 1 / 2 ],
  kg: [ 1 / 4, 1 / 2, 3 / 4 ],
  ml: [ 1 / 2 ],
  l: [ 1 / 4, 1 / 2, 3 / 4 ],
  ricecup: [ 1 / 4, 1 / 2, 3 / 4 ],
  inch: [ 1 / 8, 1 / 4, 1 / 2, 3 / 4 ],
  cm: [ 1 / 2 ],
  mm: [ 1 / 2 ],
  pinch: [ 1 / 2 ],
  count: [ 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4 ],
};

/**
 * How each fraction is written.
 */
const fractionNames: [ number, string ][] = [
  [ 1 / 8, '1/8' ],
  [ 1 / 4, '1/4' ],
  [ 1 / 3, '1/3' ],
  [ 1 / 2, '1/2' ],
  [ 2 / 3, '2/3' ],
  [ 3 / 4, '3/4' ],
];

/**
 * What one of each US measure, and each metric one, is in the metric base it's shown in: milliliters for
 * volume, grams for weight and centimeters for length. Spoons, rice cooker cups and pinches aren't here,
 * since metric shows them as they are.
 */
const metricFactors: Partial<Record<UnitKind, [ number, 'ml' | 'g' | 'cm' ]>> = {
  cup: [ 236.588, 'ml' ],
  floz: [ 29.5735, 'ml' ],
  pint: [ 473.176, 'ml' ],
  quart: [ 946.353, 'ml' ],
  gallon: [ 3785.41, 'ml' ],
  ml: [ 1, 'ml' ],
  l: [ 1000, 'ml' ],
  oz: [ 28.3495, 'g' ],
  lb: [ 453.592, 'g' ],
  g: [ 1, 'g' ],
  kg: [ 1000, 'g' ],
  inch: [ 2.54, 'cm' ],
  cm: [ 1, 'cm' ],
  mm: [ 0.1, 'cm' ],
};

/**
 * The things the cards count, singular and plural, which is how "2 onions" becomes "1 onion" at half size.
 * A word that isn't here is left as the card wrote it, since a wrong plural reads worse than none.
 */
const countNouns: [ string, string ][] = [
  [ 'apple', 'apples' ],
  [ 'avocado', 'avocados' ],
  [ 'bag', 'bags' ],
  [ 'baguette', 'baguettes' ],
  [ 'ball', 'balls' ],
  [ 'banana', 'bananas' ],
  [ 'bar', 'bars' ],
  [ 'basket', 'baskets' ],
  [ 'batch', 'batches' ],
  [ 'bean', 'beans' ],
  [ 'berry', 'berries' ],
  [ 'biscuit', 'biscuits' ],
  [ 'block', 'blocks' ],
  [ 'bomb', 'bombs' ],
  [ 'bottle', 'bottles' ],
  [ 'bowl', 'bowls' ],
  [ 'box', 'boxes' ],
  [ 'breast', 'breasts' ],
  [ 'bulb', 'bulbs' ],
  [ 'bun', 'buns' ],
  [ 'bunch', 'bunches' ],
  [ 'bundle', 'bundles' ],
  [ 'camembert', 'camemberts' ],
  [ 'can', 'cans' ],
  [ 'cantaloupe', 'cantaloupes' ],
  [ 'carrot', 'carrots' ],
  [ 'cherry', 'cherries' ],
  [ 'chestnut', 'chestnuts' ],
  [ 'chile', 'chiles' ],
  [ 'chili', 'chilies' ],
  [ 'chive', 'chives' ],
  [ 'chop', 'chops' ],
  [ 'chopstick', 'chopsticks' ],
  [ 'circle', 'circles' ],
  [ 'clove', 'cloves' ],
  [ 'collar', 'collars' ],
  [ 'container', 'containers' ],
  [ 'cookie', 'cookies' ],
  [ 'crepe', 'crepes' ],
  [ 'croquette', 'croquettes' ],
  [ 'cube', 'cubes' ],
  [ 'cucumber', 'cucumbers' ],
  [ 'cup', 'cups' ],
  [ 'date', 'dates' ],
  [ 'dish', 'dishes' ],
  [ 'duck', 'ducks' ],
  [ 'dumpling', 'dumplings' ],
  [ 'ear', 'ears' ],
  [ 'egg', 'eggs' ],
  [ 'eggplant', 'eggplants' ],
  [ 'envelope', 'envelopes' ],
  [ 'fillet', 'fillets' ],
  [ 'flag', 'flags' ],
  [ 'glass', 'glasses' ],
  [ 'green', 'greens' ],
  [ 'half', 'halves' ],
  [ 'handful', 'handfuls' ],
  [ 'head', 'heads' ],
  [ 'heart', 'hearts' ],
  [ 'hen', 'hens' ],
  [ 'hollow', 'hollows' ],
  [ 'jalapeño', 'jalapeños' ],
  [ 'jar', 'jars' ],
  [ 'kiwi', 'kiwis' ],
  [ 'leaf', 'leaves' ],
  [ 'leek', 'leeks' ],
  [ 'leg', 'legs' ],
  [ 'lemon', 'lemons' ],
  [ 'lime', 'limes' ],
  [ 'loaf', 'loaves' ],
  [ 'mango', 'mangoes' ],
  [ 'marshmallow', 'marshmallows' ],
  [ 'melon', 'melons' ],
  [ 'mug', 'mugs' ],
  [ 'mushroom', 'mushrooms' ],
  [ 'nest', 'nests' ],
  [ 'nut', 'nuts' ],
  [ 'one', 'ones' ],
  [ 'onion', 'onions' ],
  [ 'orange', 'oranges' ],
  [ 'oval', 'ovals' ],
  [ 'oyster', 'oysters' ],
  [ 'pack', 'packs' ],
  [ 'package', 'packages' ],
  [ 'packet', 'packets' ],
  [ 'pair', 'pairs' ],
  [ 'pancake', 'pancakes' ],
  [ 'pat', 'pats' ],
  [ 'patty', 'patties' ],
  [ 'peach', 'peaches' ],
  [ 'pear', 'pears' ],
  [ 'pepper', 'peppers' ],
  [ 'peppercorn', 'peppercorns' ],
  [ 'person', 'people' ],
  [ 'piece', 'pieces' ],
  [ 'pineapple', 'pineapples' ],
  [ 'plate', 'plates' ],
  [ 'pod', 'pods' ],
  [ 'pomegranate', 'pomegranates' ],
  [ 'portion', 'portions' ],
  [ 'potato', 'potatoes' ],
  [ 'rabbit', 'rabbits' ],
  [ 'rack', 'racks' ],
  [ 'radish', 'radishes' ],
  [ 'ramekin', 'ramekins' ],
  [ 'raspberry', 'raspberries' ],
  [ 'rib', 'ribs' ],
  [ 'ribeye', 'ribeyes' ],
  [ 'rind', 'rinds' ],
  [ 'roll', 'rolls' ],
  [ 'root', 'roots' ],
  [ 'rosebud', 'rosebuds' ],
  [ 'russet', 'russets' ],
  [ 'sac', 'sacs' ],
  [ 'sapodilla', 'sapodillas' ],
  [ 'sausage', 'sausages' ],
  [ 'scallion', 'scallions' ],
  [ 'scallop', 'scallops' ],
  [ 'scoop', 'scoops' ],
  [ 'shallot', 'shallots' ],
  [ 'sheet', 'sheets' ],
  [ 'shell', 'shells' ],
  [ 'skewer', 'skewers' ],
  [ 'slice', 'slices' ],
  [ 'soybean', 'soybeans' ],
  [ 'spear', 'spears' ],
  [ 'spoonful', 'spoonfuls' ],
  [ 'sprig', 'sprigs' ],
  [ 'sprout', 'sprouts' ],
  [ 'square', 'squares' ],
  [ 'stalk', 'stalks' ],
  [ 'steak', 'steaks' ],
  [ 'stick', 'sticks' ],
  [ 'straw', 'straws' ],
  [ 'strawberry', 'strawberries' ],
  [ 'strip', 'strips' ],
  [ 'tablespoon', 'tablespoons' ],
  [ 'tail', 'tails' ],
  [ 'tangerine', 'tangerines' ],
  [ 'thigh', 'thighs' ],
  [ 'thread', 'threads' ],
  [ 'tomato', 'tomatoes' ],
  [ 'toothpick', 'toothpicks' ],
  [ 'tortilla', 'tortillas' ],
  [ 'tray', 'trays' ],
  [ 'triangle', 'triangles' ],
  [ 'turnip', 'turnips' ],
  [ 'wedge', 'wedges' ],
  [ 'wheel', 'wheels' ],
  [ 'white', 'whites' ],
  [ 'wing', 'wings' ],
  [ 'wonton', 'wontons' ],
  [ 'wrapper', 'wrappers' ],
  [ 'yolk', 'yolks' ],
];

/**
 * The counted things that hold or measure out something else, like the bunch in "1 bunch scallions" or the
 * strip in "1 strip orange peel". When one comes first, it's what the count counts, whatever follows it.
 */
const containerNouns = [
  'bag',
  'bar',
  'basket',
  'block',
  'bottle',
  'bowl',
  'box',
  'bunch',
  'bundle',
  'can',
  'clove',
  'container',
  'cup',
  'ear',
  'envelope',
  'glass',
  'handful',
  'head',
  'jar',
  'leaf',
  'loaf',
  'mug',
  'pack',
  'package',
  'packet',
  'pair',
  'piece',
  'plate',
  'rack',
  'sac',
  'scoop',
  'sheet',
  'slice',
  'spoonful',
  'sprig',
  'square',
  'stalk',
  'stick',
  'strip',
  'tablespoon',
  'tray',
  'wedge',
];

/**
 * The counted things that can't be split: half an egg isn't something a cook can measure.
 */
const indivisibleNouns = [ 'egg', 'yolk', 'white' ];

/**
 * Where the words naming a counted thing end: a parenthesis, a comma or semicolon, or an "or", "and", "for" or
 * "of" that starts another thought. So "2 of the oranges" counts nothing the page needs to change, and "2 heads
 * of garlic" counts the heads.
 */
const nounWindowEnd = /[(,;]|\s(?:or|and|for|of)\s/;

/**
 * A temperature in Fahrenheit, or a range of them.
 */
const fahrenheit = new RegExp(String.raw`${numberStart}(\d+)(?:\s*(?:to|-)\s*(\d+))?\s?°F\b`, 'g');

/**
 * A US measure written into a sentence, joined by a space or a hyphen: "1 cup of broth", "a 12-inch skillet",
 * "a 6-quart pot". Spoons and rice cooker cups aren't in it, since metric keeps them.
 */
const usMeasure = new RegExp(
  String.raw`${numberStart}(${numberPattern})(?:\s+to\s+(${numberPattern}))?(-|\s+)(cups?|fl\.? oz|ounces?|oz|pounds?|lbs?|pints?|quarts?|gallons?|inch(?:es)?)\b`,
  'gi',
);

/**
 * A pan's size in inches written as a pair, "9 by 13-inch" or "9x5-inch", whose numbers both convert, where
 * converting only the inches next to the unit would leave "9 by 33 cm".
 */
const inchPair = new RegExp(
  String.raw`${numberStart}(${numberPattern})\s*(?:by|x)\s*(${numberPattern})(?:-|\s+)inch(?:es)?\b`,
  'gi',
);

/**
 * "a" or "an" in front of a number, which converting the number can make wrong: "an 8-inch pan" is "a 20 cm
 * pan", and "a 3-inch ring" is "an 8 cm ring".
 */
const articleBeforeNumber = /\b(a|an)(\s+)(\d[\d.]*)/gi;

/**
 * Turns a written number into its value: "1 1/2" is 1.5, "1/2" is 0.5 and "5" is 5.
 * @param {string} written The number as written.
 * @returns {number} Its value.
 */
const readNumber = (written: string): number =>
{
  return written
    .trim()
    .split(/\s+/)
    .reduce((total, part) =>
    {
      const [ top, bottom ] = part.split('/');
      return total + (bottom === undefined ? Number(top) : Number(top) / Number(bottom));
    }, 0);
};

/**
 * What a measuring word measures.
 * @param {string} written The word as the card wrote it, like "Cups" or "rice cooker cup".
 * @returns {UnitKind} Its kind.
 */
const kindOf = (written: string): UnitKind =>
{
  const found = unitKinds.find(([ pattern ]) => pattern.test(written));
  return found === undefined ? 'pinch' : found[1];
};

/**
 * Finds an amount at the very start of some text.
 * @param {string} text The text, like an ingredient line: "1 1/4 lb boneless chicken thighs".
 * @returns {FoundAmount | null} The amount and how much of the text it took, or null when the text doesn't
 * start with one.
 */
const findLeadingAmount = (text: string): FoundAmount | null =>
{
  const match = leadingAmount.exec(text);
  if (match === null)
  {
    return null;
  }

  const [ whole, about, low, high, unit ] = match;
  const amount: Amount = {
    low: readNumber(low),
    high: high === undefined ? readNumber(low) : readNumber(high),
    isAbout: about !== undefined,
    kind: unit === undefined ? null : kindOf(unit),
    written: unit ?? '',
  };
  return { amount, length: whole.length };
};

/**
 * Whether an amount of this kind changes with the batch. Pinches stay pinches, and sizes are of a pan or a
 * cut, not of how much there is.
 * @param {UnitKind | null} kind The amount's kind, or null for a count.
 * @returns {boolean} True when the amount grows and shrinks with the recipe.
 */
const scalesWithBatch = (kind: UnitKind | null): boolean =>
{
  return kind !== 'pinch' && kind !== 'inch' && kind !== 'cm' && kind !== 'mm';
};

/**
 * Rounds a value to the nearest multiple of a step.
 * @param {number} value The value.
 * @param {number} step The step, like 5 or 0.1.
 * @returns {number} The nearest multiple.
 */
const nearest = (value: number, step: number): number =>
{
  return Math.round(value / step) * step;
};

/**
 * Whether a value is a whole number of steps, allowing for floating point.
 * @param {number} value The value.
 * @param {number} step The step.
 * @returns {boolean} True when the value lands on a step.
 */
const isMultipleOf = (value: number, step: number): boolean =>
{
  return Math.abs(value / step - Math.round(value / step)) < 1e-9;
};

/**
 * How a fraction is written.
 * @param {number} fraction One of the fractions in fractionNames.
 * @returns {string} Its written form, like "2/3".
 */
const fractionText = (fraction: number): string =>
{
  const found = fractionNames.find(([ value ]) => Math.abs(value - fraction) < 1e-9);
  return found === undefined ? String(fraction) : found[1];
};

/**
 * Writes a number the way a recipe does: rounded to the nearest of the given fractions under 10, and to a
 * whole number from 10 up. So 1.5 is "1 1/2", 0.3 is "1/3" among cup fractions, and 12.4 is "12". A positive
 * amount never rounds away to nothing; it becomes the smallest fraction allowed instead.
 * @param {number} value The number.
 * @param {number[]} fractions The fractions it may round to, smallest first.
 * @returns {string} The number as a recipe writes it.
 */
const kitchenNumber = (value: number, fractions: number[]): string =>
{
  if (value >= 10)
  {
    return String(Math.round(value));
  }

  const whole = Math.floor(value);
  const part = value - whole;
  const closest = [ 0, ...fractions, 1 ].reduce((best, choice) =>
  {
    return Math.abs(choice - part) < Math.abs(best - part) ? choice : best;
  });
  const wholePart = closest === 1 ? whole + 1 : whole;
  const fractionPart = closest === 1 ? 0 : closest;

  // a positive amount never rounds away to nothing.
  if (wholePart === 0 && fractionPart === 0)
  {
    return fractionText(fractions[0]);
  }

  const pieces = [ wholePart > 0 ? String(wholePart) : '', fractionPart > 0 ? fractionText(fractionPart) : '' ];
  return pieces.filter((piece) => piece !== '').join(' ');
};

/**
 * Moves a US amount to the measure that reads best at its size: 6 tsp is 2 tbsp, 4 tbsp is 1/4 cup, 1/8 cup is
 * 2 tbsp, 1/2 tbsp is 1 1/2 tsp, a tenth of a pound is ounces, and 24 oz is 1 1/2 lb. It only moves when the
 * amount lands on something a drawer of spoons and cups can make, so 4 tsp stays 4 tsp rather than turning
 * into 1 1/3 tbsp.
 * @param {number} value The amount.
 * @param {UnitKind} kind What it measures.
 * @returns {[ number, UnitKind ]} The amount and kind that read best.
 */
const tidyUs = (value: number, kind: UnitKind): [ number, UnitKind ] =>
{
  if (kind === 'tsp' && value >= 3 && isMultipleOf(value / 3, 1 / 2))
  {
    return tidyUs(value / 3, 'tbsp');
  }
  if (kind === 'tbsp' && value >= 4 && isMultipleOf(value / 16, 1 / 4))
  {
    return [ value / 16, 'cup' ];
  }
  if (kind === 'tbsp' && value < 1)
  {
    return [ value * 3, 'tsp' ];
  }
  if (kind === 'cup' && value < 1 / 4)
  {
    return tidyUs(value * 16, 'tbsp');
  }
  if (kind === 'lb' && value < 1 / 4)
  {
    return [ value * 16, 'oz' ];
  }
  if (kind === 'oz' && value >= 16 && isMultipleOf(value / 16, 1 / 4))
  {
    return [ value / 16, 'lb' ];
  }
  return [ value, kind ];
};

/**
 * The word for a measure, singular or plural: the card's own long form when it wrote one and the kind
 * didn't change, and the short form otherwise.
 * @param {UnitKind} kind What it measures.
 * @param {string} written The word the card wrote, or '' when the amount moved to a new kind.
 * @param {number} value The amount the word follows; above 1 is plural.
 * @returns {string} The word.
 */
const unitWord = (kind: UnitKind, written: string, value: number): string =>
{
  const [ singular, plural ] = longWord.test(written) ? longForms[kind] : shortForms[kind];
  return value > 1 ? plural : singular;
};

/**
 * Writes a number the way a metric recipe does, with its unit: milliliters to the nearest 5 under 100 and 10
 * under a liter, then liters to one decimal; grams to the nearest 1 under 20, 5 under 100 and 10 under a
 * kilogram, then kilograms; centimeters to the nearest half under 5 and whole ones above, with millimeters
 * under 1 cm.
 * @param {number} value The amount in its metric base.
 * @param {'ml' | 'g' | 'cm'} base Which base it's in.
 * @returns {string} The amount and its unit, like "240 ml" or "1.4 L".
 */
const metricText = (value: number, base: 'ml' | 'g' | 'cm'): string =>
{
  if (base === 'ml')
  {
    return value >= 1000 ? `${oneDecimal(nearest(value / 1000, 0.1))} L` : `${Math.max(5, nearest(value, milliliterStep(value)))} ml`;
  }
  if (base === 'g')
  {
    return value >= 1000 ? `${oneDecimal(nearest(value / 1000, 0.1))} kg` : `${Math.max(1, nearest(value, gramStep(value)))} g`;
  }
  if (value < 1)
  {
    return `${Math.max(1, Math.round(value * 10))} mm`;
  }
  return `${oneDecimal(nearest(value, value < 5 ? 0.5 : 1))} cm`;
};

/**
 * The step milliliters round to: 5 under 100, then 10.
 * @param {number} value The amount in milliliters.
 * @returns {number} The step.
 */
const milliliterStep = (value: number): number =>
{
  return value < 100 ? 5 : 10;
};

/**
 * The step grams round to: 1 under 20, 5 under 100, then 10.
 * @param {number} value The amount in grams.
 * @returns {number} The step.
 */
const gramStep = (value: number): number =>
{
  if (value < 20)
  {
    return 1;
  }
  return value < 100 ? 5 : 10;
};

/**
 * Writes a number with at most one decimal, and none when it's whole: 1.4 stays "1.4", 2.0 is "2".
 * @param {number} value The number.
 * @returns {string} The number written.
 */
const oneDecimal = (value: number): string =>
{
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * Writes an amount, times a factor, in a measuring system. US amounts move to the tidiest spoon, cup or pound
 * and round to kitchen fractions; metric ones round to the nearest sensible milliliter, gram or centimeter.
 * Metric keeps spoons as spoons until there are enough of them to fill a cup, which it shows in milliliters,
 * since metric never says cups. A count comes back as just its number, since the words after it are the
 * line's business. Pinches and sizes don't change with the factor.
 * @param {Amount} amount The amount as the card wrote it.
 * @param {number} factor The batch size, like 0.5 or 2.
 * @param {MeasureSystem} system The measuring system.
 * @returns {string} The amount, written.
 */
const formatAmount = (amount: Amount, factor: number, system: MeasureSystem): string =>
{
  const times = scalesWithBatch(amount.kind) ? factor : 1;
  const low = amount.low * times;
  const high = amount.high * times;
  const about = amount.isAbout ? 'about ' : '';

  // a count is only a number; the thing counted is in the words after it.
  if (amount.kind === null)
  {
    return `${about}${joinRange(kitchenNumber(low, roundingFractions.count), kitchenNumber(high, roundingFractions.count))}`;
  }

  // a pinch, a dash or a drop keeps the card's own word, since they're all one kind to the page.
  if (amount.kind === 'pinch')
  {
    return `${about}${joinRange(kitchenNumber(low, roundingFractions.pinch), kitchenNumber(high, roundingFractions.pinch))} ${amount.written}`;
  }

  // metric shows volumes, weights and lengths in its own units, and anything a card wrote in metric the same way.
  const metric = metricFactors[amount.kind];
  const isMetricKind = amount.kind === 'g' || amount.kind === 'kg' || amount.kind === 'ml' || amount.kind === 'l' || amount.kind === 'cm' || amount.kind === 'mm';
  if (metric !== undefined && (system === 'metric' || isMetricKind))
  {
    return `${about}${metricRange(low, high, metric)}`;
  }

  // everything else stays in its own measures, moved to the tidiest one.
  const [ tidyLow, kind ] = tidyUs(low, amount.kind);
  const tidyHigh = low === 0 ? high : high * (tidyLow / low);

  // spoonfuls enough to fill a cup are milliliters in metric, which never says cups.
  const tidyFactor = metricFactors[kind];
  if (system === 'metric' && tidyFactor !== undefined)
  {
    return `${about}${metricRange(tidyLow, tidyHigh, tidyFactor)}`;
  }

  const written = kind === amount.kind ? amount.written : '';
  const fractions = roundingFractions[kind];
  const range = joinRange(kitchenNumber(tidyLow, fractions), kitchenNumber(tidyHigh, fractions));
  return `${about}${range} ${unitWord(kind, written, tidyHigh)}`;
};

/**
 * Writes a range in metric: both ends moved into the metric base and rounded, then joined.
 * @param {number} low The low end, in the measure the factor belongs to.
 * @param {number} high The high end, in the same measure.
 * @param {[ number, 'ml' | 'g' | 'cm' ]} factor What one of that measure is in its metric base, and which base.
 * @returns {string} The range, like "400 to 450 g", or one amount when both ends round the same.
 */
const metricRange = (low: number, high: number, factor: [ number, 'ml' | 'g' | 'cm' ]): string =>
{
  const [ toBase, base ] = factor;
  return joinMetric(metricText(low * toBase, base), metricText(high * toBase, base));
};

/**
 * Joins the two ends of a range, or gives one number when both ends are the same.
 * @param {string} low The low end, written.
 * @param {string} high The high end, written.
 * @returns {string} "3 to 4", or "3".
 */
const joinRange = (low: string, high: string): string =>
{
  return low === high ? low : `${low} to ${high}`;
};

/**
 * Joins the two ends of a metric range: "400 to 450 g" when they share a unit, "900 ml to 1.2 L" when the high
 * end crosses into the next one, and one amount when both ends round the same.
 * @param {string} low The low end, with its unit.
 * @param {string} high The high end, with its unit.
 * @returns {string} The range.
 */
const joinMetric = (low: string, high: string): string =>
{
  if (low === high)
  {
    return low;
  }
  const [ lowNumber, lowUnit ] = low.split(' ');
  const [ , highUnit ] = high.split(' ');
  return lowUnit === highUnit ? `${lowNumber} to ${high}` : `${low} to ${high}`;
};

/**
 * Finds the thing a count counts, among the words before the first parenthesis, comma, or "or", "and", "for"
 * or "of": a container the page knows, like the bunch in "1 bunch scallions", when it's one of the first two
 * words, and otherwise the last word it knows how to pluralize, so "2 potato buns" counts buns, "2 egg whites"
 * counts whites, and "2 New York strip steaks" counts steaks. A hyphenated word is read whole, so "flat-leaf"
 * stays as it is.
 * @param {string} rest The words after the count, like " medium Yukon Gold potatoes, diced".
 * @returns {{ index: number, word: string, singular: string, plural: string } | null} Where the word is in
 * rest, the word as written, and its two forms, or null when there isn't one.
 */
const countedNoun = (rest: string): { index: number; word: string; singular: string; plural: string } | null =>
{
  const end = rest.search(nounWindowEnd);
  const window = end === -1 ? rest : rest.slice(0, end);

  // every word the page knows, in order, reading a hyphenated word whole, so "flat-leaf" is never a leaf.
  const known = [ ...window.matchAll(/\p{L}+(?:-\p{L}+)*/gu) ]
    .flatMap((word, place) =>
    {
      const lower = word[0].toLowerCase();
      const forms = countNouns.find(([ singular, plural ]) => singular === lower || plural === lower);
      return forms === undefined ? [] : [ { place, index: word.index, word: word[0], singular: forms[0], plural: forms[1] } ];
    });

  // a container in the first two words is what's counted, like the bunch in "1 bunch scallions" or the handful in
  // "1 big handful mint"; further in, it's part of a name, like the strip in "New York strip steaks".
  const container = known.find((noun) => noun.place < 2 && containerNouns.includes(noun.singular));
  const counted = container ?? known[known.length - 1];
  if (counted === undefined)
  {
    return null;
  }
  return { index: counted.index, word: counted.word, singular: counted.singular, plural: counted.plural };
};

/**
 * Puts the thing a count counts in the right number: "2 onions" at half size is "1 onion". Its first letter
 * keeps its case, and words the page doesn't know are left as written.
 * @param {string} rest The words after the count.
 * @param {number} value The count it now follows; above 1 is plural.
 * @returns {string} The words, with the counted thing singular or plural.
 */
const countRest = (rest: string, value: number): string =>
{
  const noun = countedNoun(rest);
  if (noun === null)
  {
    return rest;
  }
  const wanted = value > 1 ? noun.plural : noun.singular;
  const cased = noun.word[0] === noun.word[0].toUpperCase() ? wanted[0].toUpperCase() + wanted.slice(1) : wanted;
  return rest.slice(0, noun.index) + cased + rest.slice(noun.index + noun.word.length);
};

/**
 * Whether a count is of something that can't be split, an egg or anything the card calls whole.
 * @param {string} rest The words after the count, like " large eggs" or " whole trout, cleaned".
 * @returns {boolean} True when the count has to stay whole.
 */
const isIndivisible = (rest: string): boolean =>
{
  const end = rest.search(nounWindowEnd);
  const window = end === -1 ? rest : rest.slice(0, end);
  const noun = countedNoun(rest);
  return /\bwhole\b/i.test(window) || (noun !== null && indivisibleNouns.includes(noun.singular));
};

/**
 * Converts the temperatures and US measures written into a sentence: 350°F is 175°C, "1 cup of broth" is
 * "240 ml of broth", a "12-inch skillet" is a "30 cm skillet", and a "9 by 13-inch dish" is a "23 by 33 cm
 * dish". Ovens round to 5 degrees and thermometers to 1. Spoons and rice cooker cups stay as they are. A
 * number that changed gets the article it now needs, so "an 8-inch pan" is "a 20 cm pan".
 * @param {string} text Plain text from between two tags.
 * @returns {string} The text in metric.
 */
const metricWords = (text: string): string =>
{
  const converted = text
    .replace(fahrenheit, (_whole: string, low: string, high: string | undefined) =>
    {
      const range = high === undefined ? `${celsius(Number(low))}` : `${celsius(Number(low))} to ${celsius(Number(high))}`;
      return `${range}°C`;
    })
    .replace(inchPair, (_whole: string, first: string, second: string) =>
    {
      return joinPair(inchesInMetric(first), inchesInMetric(second));
    })
    .replace(usMeasure, (_whole: string, low: string, high: string | undefined, _gap: string, unit: string) =>
    {
      const amount: Amount = {
        low: readNumber(low),
        high: high === undefined ? readNumber(low) : readNumber(high),
        isAbout: false,
        kind: kindOf(unit),
        written: unit,
      };
      return formatAmount(amount, 1, 'metric');
    });

  // a number that changed may need the other article.
  return converted.replace(articleBeforeNumber, (_whole: string, article: string, gap: string, number: string) =>
  {
    return `${articleFor(number, article)}${gap}${number}`;
  });
};

/**
 * A length in inches, written in metric: "9" is "23 cm" and "1/8" is "3 mm".
 * @param {string} written The number of inches, as written.
 * @returns {string} The length in metric, with its unit.
 */
const inchesInMetric = (written: string): string =>
{
  const value = readNumber(written);
  return formatAmount({ low: value, high: value, isAbout: false, kind: 'inch', written: 'inch' }, 1, 'metric');
};

/**
 * Joins the two sides of a size the way the card wrote it, "23 by 33 cm", or with both units when they
 * differ, "3 mm by 5 cm".
 * @param {string} first The first side, with its unit.
 * @param {string} second The second side, with its unit.
 * @returns {string} The size.
 */
const joinPair = (first: string, second: string): string =>
{
  const [ firstNumber, firstUnit ] = first.split(' ');
  const [ , secondUnit ] = second.split(' ');
  return firstUnit === secondUnit ? `${firstNumber} by ${second}` : `${first} by ${second}`;
};

/**
 * The article a number takes: "an" for one that's said starting with a vowel sound, like 8, 11, 18 or 80,
 * and "a" for every other, keeping the article's own capital.
 * @param {string} number The number, as written.
 * @param {string} article The article in front of it, "a" or "an" in any case.
 * @returns {string} The article it needs.
 */
const articleFor = (number: string, article: string): string =>
{
  const wanted = /^(?:8|11(?!\d)|18(?!\d))/.test(number) ? 'an' : 'a';
  return article[0] === 'A' ? `A${wanted.slice(1)}` : wanted;
};

/**
 * A Fahrenheit temperature in Celsius, to the nearest 5 for an oven and to the nearest degree under 100°C,
 * where a thermometer's reading matters.
 * @param {number} degrees Degrees Fahrenheit.
 * @returns {number} Degrees Celsius, rounded.
 */
const celsius = (degrees: number): number =>
{
  const value = (degrees - 32) * 5 / 9;
  return value >= 100 ? nearest(value, 5) : Math.round(value);
};

export {
  countedNoun,
  countRest,
  findLeadingAmount,
  formatAmount,
  isIndivisible,
  kitchenNumber,
  metricWords,
  numberPattern,
  numberStart,
  readNumber,
  roundingFractions,
  scalesWithBatch,
  unitPattern,
};
export type { Amount, FoundAmount, MeasureSystem, UnitKind };
