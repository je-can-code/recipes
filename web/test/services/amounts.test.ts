import { describe, expect, it } from 'vitest';
import { countRest, findLeadingAmount, formatAmount, isIndivisible, kitchenNumber, metricWords, roundingFractions } from '../../src/services/amounts';
import type { Amount } from '../../src/services/amounts';

/**
 * An amount for the tests, written the way a card would have it.
 * @param {number} low The amount, or the low end of a range.
 * @param {Amount['kind']} kind What it measures, or null for a count.
 * @param {string} written The measuring word as written.
 * @param {number} high The high end, when it's a range.
 * @returns {Amount} The amount.
 */
const amountOf = (low: number, kind: Amount['kind'], written: string, high: number = low): Amount =>
{
  return { low, high, isAbout: false, kind, written };
};

/*
 * findLeadingAmount owes the page the amount an ingredient line starts with, and nothing from a line that
 * starts with a size, a word, or a word that only begins like a unit.
 */
describe('findLeadingAmount', () =>
{
  it('reads a mixed number and its unit', () =>
  {
    // Arrange.
    const text = '1 1/4 lb boneless chicken thighs';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 1.25, high: 1.25, isAbout: false, kind: 'lb', written: 'lb' }, length: 8 });
  });

  it('reads a range of a counted thing', () =>
  {
    // Arrange.
    const text = '6 to 8 amaebi (sweet shrimp)';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 6, high: 8, isAbout: false, kind: null, written: '' }, length: 6 });
  });

  it('reads "about" and a fraction', () =>
  {
    // Arrange.
    const text = 'about 2/3 cup';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 2 / 3, high: 2 / 3, isAbout: true, kind: 'cup', written: 'cup' }, length: 13 });
  });

  it('reads a rice cooker cup as its own measure', () =>
  {
    // Arrange.
    const text = '2 rice cooker cups Japanese short-grain rice';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 2, high: 2, isAbout: false, kind: 'ricecup', written: 'rice cooker cups' }, length: 18 });
  });

  it('counts garlic rather than reading its g as grams', () =>
  {
    // Arrange.
    const text = '2 garlic cloves, grated';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 2, high: 2, isAbout: false, kind: null, written: '' }, length: 1 });
  });

  it('counts a handful, like a head or a bunch', () =>
  {
    // Arrange.
    const text = '2 handfuls spinach';

    // Act.
    const found = findLeadingAmount(text);

    // Assert.
    expect(found)
      .toEqual({ amount: { low: 2, high: 2, isAbout: false, kind: null, written: '' }, length: 1 });
  });

  it('finds nothing in a size or a line without a number', () =>
  {
    // Arrange.
    const lines = [ '12-inch oven-safe skillet', 'Salt, to taste' ];

    // Act.
    const found = lines.map(findLeadingAmount);

    // Assert.
    expect(found)
      .toEqual([ null, null ]);
  });
});

/*
 * kitchenNumber owes every amount a number a cook can measure: the nearest fraction a drawer of spoons and cups
 * has, a whole number from 10 up, and never nothing for something that's there.
 */
describe('kitchenNumber', () =>
{
  it('writes a mixed number', () =>
  {
    // Arrange.
    const value = 1.5;

    // Act.
    const written = kitchenNumber(value, roundingFractions.cup);

    // Assert.
    expect(written)
      .toBe('1 1/2');
  });

  it('rounds to the nearest cup fraction on each side of the quarter and third', () =>
  {
    // Arrange.
    const values = [ 0.29, 0.3 ];

    // Act.
    const written = values.map((value) => kitchenNumber(value, roundingFractions.cup));

    // Assert.
    expect(written)
      .toEqual([ '1/4', '1/3' ]);
  });

  it('keeps an eighth among spoons, and never rounds a little down to nothing among cups', () =>
  {
    // Arrange.
    const value = 0.125;

    // Act.
    const written = [ kitchenNumber(value, roundingFractions.tsp), kitchenNumber(value, roundingFractions.cup) ];

    // Assert.
    expect(written)
      .toEqual([ '1/8', '1/4' ]);
  });

  it('rounds up into the next whole number, and writes whole numbers from 10', () =>
  {
    // Arrange.
    const values = [ 9.9, 12.4 ];

    // Act.
    const written = values.map((value) => kitchenNumber(value, roundingFractions.count));

    // Assert.
    expect(written)
      .toEqual([ '10', '12' ]);
  });
});

/*
 * formatAmount owes the page an amount a cook reads at a glance: in US, the tidiest spoon, cup or pound, only
 * moving when the new measure lands on something real; in metric, rounded milliliters, grams and
 * centimeters, with spoons and rice cooker cups left alone.
 */
describe('formatAmount', () =>
{
  it('moves teaspoons to tablespoons only when they land on one', () =>
  {
    // Arrange.
    const amounts = [ amountOf(6, 'tsp', 'tsp'), amountOf(4, 'tsp', 'tsp') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'us'));

    // Assert.
    expect(written)
      .toEqual([ '2 tbsp', '4 tsp' ]);
  });

  it('moves tablespoons to a quarter cup, and leaves six alone', () =>
  {
    // Arrange.
    const amounts = [ amountOf(4, 'tbsp', 'tbsp'), amountOf(6, 'tbsp', 'tbsp') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'us'));

    // Assert.
    expect(written)
      .toEqual([ '1/4 cup', '6 tbsp' ]);
  });

  it('moves small cups to spoons, and half a spoon to teaspoons', () =>
  {
    // Arrange.
    const amounts = [ amountOf(1 / 8, 'cup', 'cup'), amountOf(1 / 2, 'tbsp', 'tbsp') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'us'));

    // Assert.
    expect(written)
      .toEqual([ '2 tbsp', '1 1/2 tsp' ]);
  });

  it('moves a sliver of a pound to ounces, and a pound and a half of ounces to pounds', () =>
  {
    // Arrange.
    const amounts = [ amountOf(0.15, 'lb', 'lb'), amountOf(24, 'oz', 'oz') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'us'));

    // Assert.
    expect(written)
      .toEqual([ '2 1/2 oz', '1 1/2 lb' ]);
  });

  it('scales, keeps "about", and makes the word plural only above one', () =>
  {
    // Arrange.
    const amount: Amount = { low: 2 / 3, high: 2 / 3, isAbout: true, kind: 'cup', written: 'cup' };

    // Act.
    const written = [ formatAmount(amount, 0.5, 'us'), formatAmount(amount, 2, 'us') ];

    // Assert.
    expect(written)
      .toEqual([ 'about 1/3 cup', 'about 1 1/3 cups' ]);
  });

  it('scales a range of a count to a range of numbers', () =>
  {
    // Arrange.
    const amount = amountOf(6, null, '', 8);

    // Act.
    const written = formatAmount(amount, 0.5, 'us');

    // Assert.
    expect(written)
      .toBe('3 to 4');
  });

  it('converts cups to milliliters, to the nearest 5 under 100 and 10 above, and to liters', () =>
  {
    // Arrange- 0.2 cup is 47.3 ml, where the nearest 5 and the nearest 10 disagree.
    const amounts = [ amountOf(1, 'cup', 'cup'), amountOf(1 / 4, 'cup', 'cup'), amountOf(0.2, 'cup', 'cup'), amountOf(6, 'cup', 'cups') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'metric'));

    // Assert.
    expect(written)
      .toEqual([ '240 ml', '60 ml', '45 ml', '1.4 L' ]);
  });

  it('writes one of a measure in the singular, keeping the card\'s long word', () =>
  {
    // Arrange.
    const amount = amountOf(1, 'cup', 'cups');

    // Act.
    const written = formatAmount(amount, 1, 'us');

    // Assert.
    expect(written)
      .toBe('1 cup');
  });

  it('converts pounds and ounces to grams, and a range sharing its unit', () =>
  {
    // Arrange.
    const amounts = [ amountOf(1.25, 'lb', 'lb'), amountOf(12, 'oz', 'oz'), amountOf(0.25, 'oz', 'oz'), amountOf(14, 'oz', 'oz', 16) ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'metric'));

    // Assert.
    expect(written)
      .toEqual([ '570 g', '340 g', '7 g', '400 to 450 g' ]);
  });

  it('keeps spoons and rice cooker cups in metric', () =>
  {
    // Arrange.
    const amounts = [ amountOf(3, 'tbsp', 'tbsp'), amountOf(2, 'ricecup', 'rice cooker cups') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 1, 'metric'));

    // Assert.
    expect(written)
      .toEqual([ '3 tbsp', '2 rice cooker cups' ]);
  });

  it('writes enough spoonfuls to fill a cup in milliliters in metric, since metric never says cups', () =>
  {
    // Arrange- 2 tbsp at 2x is 4 tbsp, which US writes as 1/4 cup.
    const amount = amountOf(2, 'tbsp', 'tbsp');

    // Act.
    const written = [ formatAmount(amount, 2, 'us'), formatAmount(amount, 2, 'metric') ];

    // Assert.
    expect(written)
      .toEqual([ '1/4 cup', '60 ml' ]);
  });

  it('converts inches to centimeters and millimeters, and never scales a size', () =>
  {
    // Arrange.
    const amounts = [ amountOf(1 / 2, 'inch', 'inch'), amountOf(1 / 8, 'inch', 'inch'), amountOf(12, 'inch', 'inch') ];

    // Act.
    const written = amounts.map((amount) => formatAmount(amount, 2, 'metric'));

    // Assert.
    expect(written)
      .toEqual([ '1.5 cm', '3 mm', '30 cm' ]);
  });

  it('leaves a pinch as it was written, whatever the size', () =>
  {
    // Arrange.
    const amount = amountOf(1, 'pinch', 'dash');

    // Act.
    const written = formatAmount(amount, 4, 'metric');

    // Assert.
    expect(written)
      .toBe('1 dash');
  });
});

/*
 * countRest owes a scaled count the thing it counts in the right number, keeping its case, and owes words it
 * doesn't know to be left alone.
 */
describe('countRest', () =>
{
  it('makes the thing plural above one and singular at one', () =>
  {
    // Arrange.
    const cases: [ string, number ][] = [ [ ' onion, diced', 2 ], [ ' onions', 1 ] ];

    // Act.
    const words = cases.map(([ rest, value ]) => countRest(rest, value));

    // Assert.
    expect(words)
      .toEqual([ ' onions, diced', ' onion' ]);
  });

  it('counts the last word it knows before a comma or parenthesis', () =>
  {
    // Arrange.
    const cases: [ string, number ][] = [
      [ ' medium Yukon Gold potato, diced', 2 ],
      [ ' potato buns', 1 ],
      [ ' egg whites', 1 ],
      [ ' cans (14.5 oz each) diced tomatoes', 1 ],
    ];

    // Act.
    const words = cases.map(([ rest, value ]) => countRest(rest, value));

    // Assert.
    expect(words)
      .toEqual([ ' medium Yukon Gold potatoes, diced', ' potato bun', ' egg white', ' can (14.5 oz each) diced tomatoes' ]);
  });

  it('counts a container named first, whatever follows it', () =>
  {
    // Arrange.
    const cases: [ string, number ][] = [
      [ ' bunch thick scallions', 2 ],
      [ ' head green leaf lettuce', 2 ],
      [ ' strip orange peel', 2 ],
      [ ' big handful mint leaves', 1 ],
    ];

    // Act.
    const words = cases.map(([ rest, value ]) => countRest(rest, value));

    // Assert.
    expect(words)
      .toEqual([ ' bunches thick scallions', ' heads green leaf lettuce', ' strips orange peel', ' big handful mint leaves' ]);
  });

  it('leaves a hyphenated word and anything after "of", and reads accented letters', () =>
  {
    // Arrange.
    const cases: [ string, number ][] = [ [ ' flat-leaf parsley', 2 ], [ ' of the oranges', 1 ], [ ' jalapeño', 2 ] ];

    // Act.
    const words = cases.map(([ rest, value ]) => countRest(rest, value));

    // Assert.
    expect(words)
      .toEqual([ ' flat-leaf parsley', ' of the oranges', ' jalapeños' ]);
  });

  it('keeps a capital, knows the irregular plurals, and leaves words it doesn\'t know', () =>
  {
    // Arrange.
    const cases: [ string, number ][] = [ [ ' Lemon', 2 ], [ ' shiso leaves', 1 ], [ ' trout, cleaned', 4 ] ];

    // Act.
    const words = cases.map(([ rest, value ]) => countRest(rest, value));

    // Assert.
    expect(words)
      .toEqual([ ' Lemons', ' shiso leaf', ' trout, cleaned' ]);
  });
});

/*
 * isIndivisible owes the batch size its floors: eggs, yolks and whites, and anything the card calls whole,
 * but not a line that merely mentions white.
 */
describe('isIndivisible', () =>
{
  it('finds eggs, yolks and whole things', () =>
  {
    // Arrange.
    const rests = [ ' eggs', ' large egg yolks', ' whole trout, cleaned' ];

    // Act.
    const found = rests.map(isIndivisible);

    // Assert.
    expect(found)
      .toEqual([ true, true, true ]);
  });

  it('lets onions be split, white or not', () =>
  {
    // Arrange.
    const rests = [ ' onions', ' white onion' ];

    // Act.
    const found = rests.map(isIndivisible);

    // Assert.
    expect(found)
      .toEqual([ false, false ]);
  });
});

/*
 * metricWords owes a sentence its temperatures and US measures in metric, rounding ovens to 5 degrees and
 * thermometers to 1, and owes it everything else untouched.
 */
describe('metricWords', () =>
{
  it('converts oven temperatures to the nearest 5 degrees, ranges included', () =>
  {
    // Arrange.
    const text = 'Bake at 350°F, or 400°F, 425°F, or 325 to 350°F.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe('Bake at 175°C, or 205°C, 220°C, or 165 to 175°C.');
  });

  it('converts a thermometer reading to the nearest degree', () =>
  {
    // Arrange.
    const text = 'Cook to 140°F, or 165°F for chicken.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe('Cook to 60°C, or 74°C for chicken.');
  });

  it('converts sizes and measures written into a sentence, with or without a hyphen', () =>
  {
    // Arrange.
    const text = 'Ladle about 1 cup of broth into a 12-inch skillet, cut 1/2-inch cubes, and use a 6-quart pot.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe('Ladle about 240 ml of broth into a 30 cm skillet, cut 1.5 cm cubes, and use a 5.7 L pot.');
  });

  it('converts a pan size written as a pair, and gives a changed number the article it needs', () =>
  {
    // Arrange.
    const text = 'Use a 9 by 13-inch dish, an 8-inch square pan, a 9x5-inch loaf pan or a 3-inch ring.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe('Use a 23 by 33 cm dish, a 20 cm square pan, a 23 by 13 cm loaf pan or an 8 cm ring.');
  });

  it('keeps a capital article capital', () =>
  {
    // Arrange.
    const text = 'An 8-inch pan works, and A 3-inch ring too.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe('A 20 cm pan works, and An 8 cm ring too.');
  });

  it('leaves spoons, rice cooker cups and times alone', () =>
  {
    // Arrange.
    const text = 'Add 2 tbsp oil to 2 rice cooker cups of rice for 10 minutes.';

    // Act.
    const converted = metricWords(text);

    // Assert.
    expect(converted)
      .toBe(text);
  });
});
