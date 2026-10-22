import { describe, expect, it } from 'vitest';
import { batchStops, effectiveMeasure, loadFactor, loadSystem, saveFactor, saveSystem, withMeasures } from '../../src/services/measures';
import type { RecipeDetail } from '../../src/types';
import { hour, lockedStorage, memoryStorage, noon } from '../helpers/storage';

/**
 * A small gravy recipe for the tests, changed as each test needs: it scales, serves 2, and has keyed flour
 * and milk.
 * @param {Partial<RecipeDetail>} changes What this test's recipe does differently.
 * @returns {RecipeDetail} The recipe.
 */
const gravy = (changes: Partial<RecipeDetail> = {}): RecipeDetail =>
{
  return {
    slug: 'test-gravy',
    title: 'Test Gravy',
    folder: '',
    tags: [],
    serves: '2',
    makes: '',
    time: 'about 10 minutes',
    revision: 'test-gravy-1',
    intro: '<p>A gravy.</p>',
    scales: true,
    ingredients: [ { name: '', items: [ '1/4 cup flour', '2 cups milk' ], keys: [ 'flour', 'milk' ], after: '' } ],
    method: { before: '', steps: [ { lead: 'Whisk.', text: 'Whisk.' } ], after: '' },
    notes: [],
    ...changes,
  };
};

/**
 * A recipe whose one step has the given text.
 * @param {RecipeDetail} recipe The recipe.
 * @param {string} text The step's text, as the server would render it.
 * @returns {RecipeDetail} The recipe with that step.
 */
const withStep = (recipe: RecipeDetail, text: string): RecipeDetail =>
{
  return { ...recipe, method: { ...recipe.method, steps: [ { lead: 'Whisk.', text } ] } };
};

/**
 * A recipe whose one ingredient group holds the given lines, with no keys.
 * @param {string[]} items The lines.
 * @param {Partial<RecipeDetail>} changes Anything else this recipe does differently.
 * @returns {RecipeDetail} The recipe.
 */
const withItems = (items: string[], changes: Partial<RecipeDetail> = {}): RecipeDetail =>
{
  return gravy({ ingredients: [ { name: '', items, keys: items.map(() => ''), after: '' } ], ...changes });
};

/**
 * The server's span for a pointer.
 * @param {string} key The ingredient's key.
 * @param {string} portion The share, as the server writes it.
 * @param {string} words The pointer's words.
 * @returns {string} The span's HTML.
 */
const pointer = (key: string, portion: string, words: string): string =>
{
  return `<span class="ref" data-ref="${key}" data-portion="${portion}">${words}</span>`;
};

/**
 * The server's span for an amount in braces.
 * @param {string} amount The amount as written.
 * @returns {string} The span's HTML.
 */
const braced = (amount: string): string =>
{
  return `<span class="amount" data-amount="${amount}">${amount}</span>`;
};

/*
 * batchStops owes the bar every size, in order, closed exactly where the recipe can't go: below one person,
 * or anywhere an egg or a whole thing would split. A recipe that doesn't scale gets no bar at all.
 */
describe('batchStops', () =>
{
  it('offers no sizes for a recipe that doesn\'t scale', () =>
  {
    // Arrange.
    const recipe = gravy({ scales: false });

    // Act.
    const stops = batchStops(recipe);

    // Assert.
    expect(stops)
      .toEqual([]);
  });

  it('labels every size, closing the ones that serve less than one person', () =>
  {
    // Arrange- serves 2, so a quarter batch serves half a person.
    const recipe = gravy();

    // Act.
    const stops = batchStops(recipe);

    // Assert.
    expect(stops.map((stop) => [ stop.label, stop.isOpen ]))
      .toEqual([ [ '¼×', false ], [ '½×', true ], [ '1×', true ], [ '1½×', true ], [ '2×', true ], [ '3×', true ], [ '4×', true ] ]);
  });

  it('closes the sizes that would split an egg', () =>
  {
    // Arrange- serves 4, so only the egg closes anything.
    const recipe = withItems([ '1 egg', '2 cups milk' ], { serves: '4' });

    // Act.
    const stops = batchStops(recipe);

    // Assert.
    expect(stops.map((stop) => stop.isOpen))
      .toEqual([ false, false, true, true, true, true, true ]);
  });

  it('treats anything written whole like an egg', () =>
  {
    // Arrange.
    const recipe = withItems([ '2 whole trout, cleaned' ], { serves: '4' });

    // Act.
    const stops = batchStops(recipe);

    // Assert.
    expect(stops.map((stop) => stop.isOpen))
      .toEqual([ false, true, true, true, true, true, true ]);
  });

  it('opens every size for a recipe that makes an amount and splits nothing', () =>
  {
    // Arrange.
    const recipe = gravy({ serves: '', makes: 'about 2 cups' });

    // Act.
    const stops = batchStops(recipe);

    // Assert.
    expect(stops.every((stop) => stop.isOpen))
      .toBe(true);
  });
});

/*
 * effectiveMeasure owes the page a size the recipe can be made at, keeping the system either way.
 */
describe('effectiveMeasure', () =>
{
  it('keeps a saved size that\'s open', () =>
  {
    // Arrange.
    const stops = batchStops(gravy());

    // Act.
    const measure = effectiveMeasure(stops, { factor: 2, system: 'us' });

    // Assert.
    expect(measure)
      .toEqual({ factor: 2, system: 'us' });
  });

  it('falls back to as written when the saved size is closed', () =>
  {
    // Arrange.
    const stops = batchStops(gravy());

    // Act.
    const measure = effectiveMeasure(stops, { factor: 0.25, system: 'metric' });

    // Assert.
    expect(measure)
      .toEqual({ factor: 1, system: 'metric' });
  });
});

/*
 * withMeasures owes the page a recipe it can draw as it is: lines and amounts at the batch size, pointers
 * showing their ingredient's amount, metric where it was asked for, links and pinches untouched, and nothing
 * changed at all on a line shown as written.
 */
describe('withMeasures', () =>
{
  it('keeps the lines\' words as written in US measures, amounts standing out, and fills in a pointer\'s amount', () =>
  {
    // Arrange.
    const recipe = withStep(gravy(), `Whisk ${pointer('flour', '', 'the flour')} in.`);

    // Act.
    const measured = withMeasures(recipe, { factor: 1, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">1/4 cup</span> flour', '<span class="measured">2 cups</span> milk' ]);
    expect(measured.method.steps[0].text)
      .toBe('Whisk <span class="ref">the flour <span class="ref-amount">(1/4 cup)</span></span> in.');
  });

  it('keeps an amount the math would tidy exactly as the card wrote it, as written in US measures', () =>
  {
    // Arrange- the math moves 6 tsp to 2 tbsp, and writes anything from 10 up as a whole number.
    const recipe = withItems([ '6 tsp sugar', '14.5 oz crushed tomatoes' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 1, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">6 tsp</span> sugar', '<span class="measured">14.5 oz</span> crushed tomatoes' ]);
  });

  it('doubles every line at 2x', () =>
  {
    // Arrange.
    const recipe = gravy();

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">1/2 cup</span> flour', '<span class="measured">4 cups</span> milk' ]);
  });

  it('gives a pointer its share of the ingredient at the batch size', () =>
  {
    // Arrange- half of the milk, at half size: 2 cups times a half times a half.
    const recipe = withStep(gravy(), pointer('milk', '1/2', 'half the milk'));

    // Act.
    const measured = withMeasures(recipe, { factor: 0.5, system: 'us' });

    // Assert.
    expect(measured.method.steps[0].text)
      .toBe('<span class="ref">half the milk <span class="ref-amount">(1/2 cup)</span></span>');
  });

  it('shows no amount for the rest of an ingredient, or for one without an amount', () =>
  {
    // Arrange.
    const salted = gravy({ ingredients: [ { name: '', items: [ '2 cups milk', 'Salt, to taste' ], keys: [ 'milk', 'salt' ], after: '' } ] });
    const recipe = withStep(salted, `${pointer('milk', 'rest', 'the rest of the milk')} and ${pointer('salt', '', 'the salt')}`);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.method.steps[0].text)
      .toBe('<span class="ref">the rest of the milk</span> and <span class="ref">the salt</span>');
  });

  it('shows a pointer\'s amount exactly as its line has it as written, and does the math at any other size', () =>
  {
    // Arrange- the math writes anything from 10 up as a whole number, so 14.5 oz would read 15 oz.
    const canned = gravy({ ingredients: [ { name: '', items: [ '14.5 oz crushed tomatoes' ], keys: [ 'tomatoes' ], after: '' } ] });
    const recipe = withStep(canned, pointer('tomatoes', '', 'the tomatoes'));

    // Act.
    const measured = [ withMeasures(recipe, { factor: 1, system: 'us' }), withMeasures(recipe, { factor: 2, system: 'us' }) ];

    // Assert.
    expect(measured.map((each) => each.method.steps[0].text))
      .toEqual([
        '<span class="ref">the tomatoes <span class="ref-amount">(14.5 oz)</span></span>',
        '<span class="ref">the tomatoes <span class="ref-amount">(29 oz)</span></span>',
      ]);
  });

  it('shows a pointer at a line that opens with About in lowercase', () =>
  {
    // Arrange.
    const water = gravy({ ingredients: [ { name: '', items: [ 'About 16 cups water' ], keys: [ 'water' ], after: '' } ] });
    const recipe = withStep(water, pointer('water', '', 'the water'));

    // Act.
    const measured = withMeasures(recipe, { factor: 1, system: 'us' });

    // Assert.
    expect(measured.method.steps[0].text)
      .toBe('<span class="ref">the water <span class="ref-amount">(about 16 cups)</span></span>');
  });

  it('names what a pointer\'s count counts, unless its key already does', () =>
  {
    // Arrange.
    const counted = gravy({ ingredients: [ { name: '', items: [ '3 cloves garlic, minced', '2 onions, sliced' ], keys: [ 'garlic', 'onions' ], after: '' } ] });
    const recipe = withStep(counted, `${pointer('garlic', '', 'the garlic')} and ${pointer('onions', '', 'the onions')}`);

    // Act.
    const measured = [ withMeasures(recipe, { factor: 1, system: 'us' }), withMeasures(recipe, { factor: 0.5, system: 'us' }) ];

    // Assert.
    expect(measured.map((each) => each.method.steps[0].text))
      .toEqual([
        '<span class="ref">the garlic <span class="ref-amount">(3 cloves)</span></span> and <span class="ref">the onions <span class="ref-amount">(2)</span></span>',
        '<span class="ref">the garlic <span class="ref-amount">(1 1/2 cloves)</span></span> and <span class="ref">the onions <span class="ref-amount">(1)</span></span>',
      ]);
  });

  it('leaves a ratio in parentheses alone, like the 80/20 of ground beef', () =>
  {
    // Arrange.
    const recipe = withItems([ '1 1/2 lb ground meat, half beef and half pork (or all 80/20 beef)' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">3 lb</span> ground meat, half beef and half pork (or all 80/20 beef)' ]);
  });

  it('scales an amount in braces, and a count in braces with its thing in the right number', () =>
  {
    // Arrange- a quarter of 2/3 cup is a sixth of a cup, 2 2/3 tbsp, which rounds to the 2 3/4 spoons make.
    const recipe = withStep(gravy(), `${braced('2/3 cup')} of sauce in ${braced('4 portions')}`);

    // Act.
    const measured = [ withMeasures(recipe, { factor: 2, system: 'us' }), withMeasures(recipe, { factor: 0.25, system: 'us' }) ];

    // Assert.
    expect(measured.map((each) => each.method.steps[0].text))
      .toEqual([
        '<span class="amount">1 1/3 cups</span> of sauce in <span class="amount">8 portions</span>',
        '<span class="amount">2 3/4 tbsp</span> of sauce in <span class="amount">1 portion</span>',
      ]);
  });

  it('shows an amount in braces exactly as written in US measures, and tidies it in metric', () =>
  {
    // Arrange- the math moves 6 tsp to 2 tbsp, which is right at any other size but isn't the card's words.
    const recipe = withStep(gravy(), `${braced('6 tsp')} of the sauce`);

    // Act.
    const measured = [ withMeasures(recipe, { factor: 1, system: 'us' }), withMeasures(recipe, { factor: 1, system: 'metric' }) ];

    // Assert.
    expect(measured.map((each) => each.method.steps[0].text))
      .toEqual([ '<span class="amount">6 tsp</span> of the sauce', '<span class="amount">2 tbsp</span> of the sauce' ]);
  });

  it('turns the intro, the lines and the steps metric', () =>
  {
    // Arrange.
    const recipe = withStep(gravy({ intro: '<p>Bake at 350°F.</p>' }), 'Simmer 1 cup broth in a 12-inch skillet.');

    // Act.
    const measured = withMeasures(recipe, { factor: 1, system: 'metric' });

    // Assert.
    expect(measured.intro)
      .toBe('<p>Bake at 175°C.</p>');
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">60 ml</span> flour', '<span class="measured">470 ml</span> milk' ]);
    expect(measured.method.steps[0].text)
      .toBe('Simmer 240 ml broth in a 30 cm skillet.');
  });

  it('never converts a link\'s words', () =>
  {
    // Arrange.
    const recipe = withStep(gravy(), 'Serve with <a href="/recipes/10-oz-steak">10 oz. Steak</a> and 1 cup broth.');

    // Act.
    const measured = withMeasures(recipe, { factor: 1, system: 'metric' });

    // Assert.
    expect(measured.method.steps[0].text)
      .toBe('Serve with <a href="/recipes/10-oz-steak">10 oz. Steak</a> and 240 ml broth.');
  });

  it('shows a recipe that doesn\'t scale as written, whatever size is asked for', () =>
  {
    // Arrange.
    const recipe = withStep(gravy({ scales: false }), pointer('milk', '', 'the milk'));

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">1/4 cup</span> flour', '<span class="measured">2 cups</span> milk' ]);
    expect(measured.method.steps[0].text)
      .toBe('<span class="ref">the milk <span class="ref-amount">(2 cups)</span></span>');
  });

  it('scales the amounts in parentheses, but leaves a size that says each', () =>
  {
    // Arrange.
    const recipe = withItems([ '1 can (14.5 oz each) diced tomatoes', '1/4 cup lime juice (about 2 limes)' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([
        '<span class="measured">2</span> cans (14.5 oz each) diced tomatoes',
        '<span class="measured">1/2 cup</span> lime juice (about 4 limes)',
      ]);
  });

  it('leaves amounts in parentheses that give a rate or a percent', () =>
  {
    // Arrange.
    const recipe = withItems([ '12 large shrimp (16 to 20 per lb)', '4 oz dark chocolate (60 to 70% cacao)' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([
        '<span class="measured">24</span> large shrimp (16 to 20 per lb)',
        '<span class="measured">8 oz</span> dark chocolate (60 to 70% cacao)',
      ]);
  });

  it('counts every word a count in parentheses names, so the right one changes', () =>
  {
    // Arrange.
    const recipe = withItems([ '1/4 cup lime juice (or 2 lemon wedges)' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">1/2 cup</span> lime juice (or 4 lemon wedges)' ]);
  });

  it('converts a size that says each in metric, without scaling it', () =>
  {
    // Arrange.
    const recipe = withItems([ '1 can (14.5 oz each) diced tomatoes' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'metric' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">2</span> cans (410 g each) diced tomatoes' ]);
  });

  it('leaves a time in parentheses alone at any size', () =>
  {
    // Arrange.
    const recipe = withItems([ '1 chicken thigh (rested about 30 minutes)' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 2, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">2</span> chicken thighs (rested about 30 minutes)' ]);
  });

  it('keeps a size\'s words in US measures, and converts it in metric', () =>
  {
    // Arrange.
    const recipe = withItems([ '12 inch oven-safe skillet' ]);

    // Act.
    const measured = [ withMeasures(recipe, { factor: 2, system: 'us' }), withMeasures(recipe, { factor: 2, system: 'metric' }) ];

    // Assert.
    expect(measured.map((each) => each.ingredients[0].items[0]))
      .toEqual([ '<span class="measured">12 inch</span> oven-safe skillet', '<span class="measured">30 cm</span> oven-safe skillet' ]);
  });

  it('rounds eggs to whole ones, and keeps a pinch as written', () =>
  {
    // Arrange.
    const recipe = withItems([ '3 eggs', '1 pinch salt' ]);

    // Act.
    const measured = withMeasures(recipe, { factor: 0.5, system: 'us' });

    // Assert.
    expect(measured.ingredients[0].items)
      .toEqual([ '<span class="measured">2</span> eggs', '<span class="measured">1 pinch</span> salt' ]);
  });

  it('does the math on a serves line, every count in it', () =>
  {
    // Arrange.
    const recipes = [ gravy({ serves: '8 to 10' }), gravy({ serves: '2 as a main, 4 as a side' }) ];

    // Act.
    const serves = recipes.map((recipe) => withMeasures(recipe, { factor: 0.5, system: 'us' }).serves);

    // Assert.
    expect(serves)
      .toEqual([ '4 to 5', '1 as a main, 2 as a side' ]);
  });

  it('does the math on a makes line, in either system', () =>
  {
    // Arrange.
    const recipe = gravy({ serves: '', makes: 'about 9 cups, 8 to 10 glasses' });

    // Act.
    const makes = [ withMeasures(recipe, { factor: 2, system: 'us' }).makes, withMeasures(recipe, { factor: 1, system: 'metric' }).makes ];

    // Assert.
    expect(makes)
      .toEqual([ 'about 18 cups, 16 to 20 glasses', 'about 2.1 L, 8 to 10 glasses' ]);
  });
});

/*
 * loadFactor and saveFactor owe a cook the batch size they chose for this recipe, for a day, and owe as written
 * to anything missing, stale, strange or locked away. loadSystem and saveSystem owe the whole site one
 * measuring system, US unless metric was chosen.
 */
describe('loadFactor', () =>
{
  it('reads a saved size from within the day', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.batch.test-gravy': JSON.stringify({ factor: 2, savedAt: noon - hour }) });

    // Act.
    const factor = loadFactor(storage, 'test-gravy', noon);

    // Assert.
    expect(factor)
      .toBe(2);
  });

  it('forgets a size older than a day', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.batch.test-gravy': JSON.stringify({ factor: 2, savedAt: noon - 25 * hour }) });

    // Act.
    const factor = loadFactor(storage, 'test-gravy', noon);

    // Assert.
    expect(factor)
      .toBe(1);
    expect(storage.items.has('recipes.batch.test-gravy'))
      .toBe(false);
  });

  it('reads as written when nothing is saved, or what\'s saved isn\'t a size', () =>
  {
    // Arrange.
    const storages = [ memoryStorage(), memoryStorage({ 'recipes.batch.test-gravy': JSON.stringify({ factor: 5, savedAt: noon }) }) ];

    // Act.
    const factors = storages.map((storage) => loadFactor(storage, 'test-gravy', noon));

    // Assert.
    expect(factors)
      .toEqual([ 1, 1 ]);
  });

  it('reads as written when what\'s saved isn\'t JSON, or storage is locked', () =>
  {
    // Arrange.
    const storages = [ memoryStorage({ 'recipes.batch.test-gravy': '{ not json' }), lockedStorage() ];

    // Act.
    const factors = storages.map((storage) => loadFactor(storage, 'test-gravy', noon));

    // Assert.
    expect(factors)
      .toEqual([ 1, 1 ]);
  });
});

describe('saveFactor', () =>
{
  it('saves a size with the time', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    saveFactor(storage, 'test-gravy', 0.5, noon);

    // Assert.
    expect(JSON.parse(storage.items.get('recipes.batch.test-gravy') ?? 'null'))
      .toEqual({ factor: 0.5, savedAt: noon });
  });

  it('removes the entry at as written', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.batch.test-gravy': JSON.stringify({ factor: 2, savedAt: noon }) });

    // Act.
    saveFactor(storage, 'test-gravy', 1, noon);

    // Assert.
    expect(storage.items.size)
      .toBe(0);
  });

  it('carries on when the browser won\'t write', () =>
  {
    // Arrange.
    const storage = lockedStorage();

    // Act.
    saveFactor(storage, 'test-gravy', 2, noon);

    // Assert.
    expect(storage.attempts)
      .toEqual([ 'setItem' ]);
  });
});

describe('loadSystem and saveSystem', () =>
{
  it('reads US unless metric was saved', () =>
  {
    // Arrange.
    const storages = [ memoryStorage(), memoryStorage({ 'recipes.system': 'metric' }), memoryStorage({ 'recipes.system': 'imperial' }), lockedStorage() ];

    // Act.
    const systems = storages.map(loadSystem);

    // Assert.
    expect(systems)
      .toEqual([ 'us', 'metric', 'us', 'us' ]);
  });

  it('saves metric, and removes the entry for US', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    saveSystem(storage, 'metric');
    const afterMetric = storage.items.get('recipes.system');
    saveSystem(storage, 'us');

    // Assert.
    expect([ afterMetric, storage.items.has('recipes.system') ])
      .toEqual([ 'metric', false ]);
  });
});
