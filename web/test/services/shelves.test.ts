import { describe, expect, it } from 'vitest';
import {
  barBackground,
  buildShelves,
  chipCount,
  claimOrder,
  courseBodyId,
  courses,
  describeCount,
  groupByCourse,
  headingFor,
  homeAddress,
  homeParameters,
  hueOf,
  isSearching,
  litShelves,
  offersEverything,
  pageTitle,
  recipesOn,
  toggleCourse,
  toggleShelf,
} from '../../src/services/shelves';
import type { Shelf } from '../../src/services/shelves';
import type { Catalog, Collection, RecipeSummary } from '../../src/types';

/**
 * Builds a recipe summary with the fields shelves read, and placeholders for the rest.
 * @param {string} slug The recipe's name, which is also its title.
 * @param {string} folder The folder the card sits in, or an empty string for the top level.
 * @param {string[]} tags The recipe's tags.
 * @returns {RecipeSummary} The summary.
 */
const recipe = (slug: string, folder: string, tags: string[]): RecipeSummary =>
{
  return { slug, title: slug, folder, tags, serves: '2', makes: '', time: 'about 10 minutes' };
};

/**
 * Builds a catalog of the given recipes and collections, with no problems.
 * @param {RecipeSummary[]} recipes The recipes, in the order to show them.
 * @param {Collection[]} collections The collections with shelves, in the collections file's order.
 * @returns {Catalog} The catalog.
 */
const catalogOf = (recipes: RecipeSummary[], collections: Collection[]): Catalog =>
{
  return { recipes, collections, problems: [] };
};

/**
 * The slugs in a list of recipes, in order.
 * @param {RecipeSummary[]} recipes The recipes.
 * @returns {string[]} Their names.
 */
const slugsOf = (recipes: RecipeSummary[]): string[] =>
{
  return recipes.map((member) => member.slug);
};

/**
 * Two collections, listed out of name order so the order kept can only be the file's own.
 */
const collections: Collection[] = [
  { tag: 'so2', label: 'SO2', name: 'Star Ocean: The Second Story' },
  { tag: 'so1', label: 'SO1', name: 'Star Ocean: First Departure' },
];

/**
 * A small cookbook: a dish in no collection, a dish from each game, one from both, and one only tagged like
 * a game, since so22 is not so2, so the chips run Home Cooking, SO2, SO1.
 */
const cookbook = [
  recipe('chorizo-gravy', '', [ 'brunch', 'pork' ]),
  recipe('fruit-punch', '', [ 'drink', 'game', 'so1' ]),
  recipe('mystery-stew', '', [ 'dinner', 'game', 'so22' ]),
  recipe('rice-omelet', '', [ 'dinner', 'egg', 'game', 'so1', 'so2' ]),
  recipe('sukiyaki', '', [ 'dinner', 'egg', 'game', 'so2' ]),
];

/**
 * The cookbook's shelves: Home Cooking, SO2 and SO1, in that order.
 */
const shelves = buildShelves(catalogOf(cookbook, collections));
const [ home, so2, so1 ] = shelves;

/*
 * buildShelves owes the home page every shelf in a fixed order, Home Cooking first, and each shelf exactly
 * the recipes that belong on it. A collection's shelf takes a recipe from anywhere, as long as it carries
 * the collection's tag, and Home Cooking takes every recipe in no collection, so none can go missing.
 */
describe('buildShelves', () =>
{
  it('puts every recipe in no collection on Home Cooking, wherever its card sits', () =>
  {
    // Arrange- a card in a folder, a collection's dish, and one tagged like a collection but in none.
    const recipes = [
      recipe('chorizo-gravy', '', [ 'brunch', 'pork' ]),
      recipe('mojito', 'cocktails', [ 'drink' ]),
      recipe('sukiyaki', '', [ 'dinner', 'game', 'so2' ]),
      recipe('mystery-stew', '', [ 'dinner', 'game', 'so22' ]),
    ];

    // Act.
    const [ first ] = buildShelves(catalogOf(recipes, collections));

    // Assert.
    expect(first)
      .toEqual({ key: 'home', label: 'Home Cooking', name: 'Home Cooking', recipes: [ recipes[0], recipes[1], recipes[3] ] });
  });

  it('gives each collection a shelf, in the collections file\'s order, holding every recipe with its tag', () =>
  {
    // Arrange- a card in a folder, tagged for SO2, joins the cookbook.
    const recipes = [ ...cookbook, recipe('sake-spritz', 'cocktails', [ 'drink', 'game', 'so2' ]) ];

    // Act.
    const built = buildShelves(catalogOf(recipes, collections));

    // Assert.
    expect(built.map((shelf) => [ shelf.key, shelf.label, shelf.name, slugsOf(shelf.recipes) ]))
      .toEqual([
        [ 'home', 'Home Cooking', 'Home Cooking', [ 'chorizo-gravy', 'mystery-stew' ] ],
        [ 'so2', 'SO2', 'Star Ocean: The Second Story', [ 'rice-omelet', 'sukiyaki', 'sake-spritz' ] ],
        [ 'so1', 'SO1', 'Star Ocean: First Departure', [ 'fruit-punch', 'rice-omelet' ] ],
      ]);
  });

  it('keeps Home Cooking when every recipe is in a collection', () =>
  {
    // Arrange.
    const recipes = [ recipe('sukiyaki', '', [ 'dinner', 'so2' ]) ];

    // Act.
    const built = buildShelves(catalogOf(recipes, collections));

    // Assert.
    expect(built.map((shelf) => [ shelf.key, slugsOf(shelf.recipes) ]))
      .toEqual([ [ 'home', [] ], [ 'so2', [ 'sukiyaki' ] ], [ 'so1', [] ] ]);
  });
});

/*
 * litShelves owes the page the shelves the address lights, in chip order whatever order the address
 * names them in, and passes quietly over a key that names nothing.
 */
describe('litShelves', () =>
{
  it('lights the shelves the keys name, in chip order', () =>
  {
    // Arrange- the keys come in the opposite order to the chips.
    const keys = [ 'so1', 'home' ];

    // Act.
    const lit = litShelves(shelves, keys);

    // Assert.
    expect(lit)
      .toEqual([ home, so1 ]);
  });

  it('passes over a key that names no shelf', () =>
  {
    // Arrange- so is the start of both games' tags, but neither game's tag.
    const keys = [ 'so', 'so2' ];

    // Act.
    const lit = litShelves(shelves, keys);

    // Assert.
    expect(lit)
      .toEqual([ so2 ]);
  });
});

/*
 * toggleShelf owes a chip's tap the keys to light next: the tapped shelf flipped, everything else as it
 * was, and the result always in chip order, so one choice of shelves has one address.
 */
describe('toggleShelf', () =>
{
  it('lights a shelf that was out, keeping chip order', () =>
  {
    // Arrange.
    const keys = [ 'so1' ];

    // Act.
    const next = toggleShelf(shelves, keys, 'home');

    // Assert.
    expect(next)
      .toEqual([ 'home', 'so1' ]);
  });

  it('puts out a shelf that was lit, leaving the rest lit', () =>
  {
    // Arrange.
    const keys = [ 'home', 'so2' ];

    // Act.
    const next = toggleShelf(shelves, keys, 'home');

    // Assert.
    expect(next)
      .toEqual([ 'so2' ]);
  });

  it('drops a key that names no shelf', () =>
  {
    // Arrange.
    const keys = [ 'nope', 'so1' ];

    // Act.
    const next = toggleShelf(shelves, keys, 'so2');

    // Assert.
    expect(next)
      .toEqual([ 'so2', 'so1' ]);
  });
});

/*
 * recipesOn owes the list everything when no shelf is lit, and otherwise the recipes the lit shelves hold
 * between them, each once, in the catalog's order rather than the shelves'.
 */
describe('recipesOn', () =>
{
  it('shows every recipe when no shelf is lit', () =>
  {
    // Arrange.
    const lit: Shelf[] = [];

    // Act.
    const shown = recipesOn(cookbook, lit);

    // Assert.
    expect(slugsOf(shown))
      .toEqual([ 'chorizo-gravy', 'fruit-punch', 'mystery-stew', 'rice-omelet', 'sukiyaki' ]);
  });

  it('shows each recipe on any lit shelf once, in the catalog\'s order', () =>
  {
    // Arrange- both games hold the rice omelet, and SO1 is listed first.
    const lit = [ so1, so2 ];

    // Act.
    const shown = recipesOn(cookbook, lit);

    // Assert.
    expect(slugsOf(shown))
      .toEqual([ 'fruit-punch', 'rice-omelet', 'sukiyaki' ]);
  });
});

/*
 * headingFor owes the list a name that says what's showing.
 */
describe('headingFor', () =>
{
  it('says Everything when no shelf is lit', () =>
  {
    // Arrange.
    const lit: Shelf[] = [];

    // Act.
    const heading = headingFor(lit);

    // Assert.
    expect(heading)
      .toBe('Everything');
  });

  it('gives one lit shelf\'s full name', () =>
  {
    // Arrange.
    const lit = [ so2 ];

    // Act.
    const heading = headingFor(lit);

    // Assert.
    expect(heading)
      .toBe('Star Ocean: The Second Story');
  });

  it('joins several lit shelves\' labels', () =>
  {
    // Arrange.
    const lit = [ home, so1 ];

    // Act.
    const heading = headingFor(lit);

    // Assert.
    expect(heading)
      .toBe('Home Cooking + SO1');
  });
});

/*
 * chipCount owes each chip how many of its recipes the search would show.
 */
describe('chipCount', () =>
{
  it('counts every recipe on the shelf when nothing is typed', () =>
  {
    // Arrange.
    const query = '';

    // Act.
    const count = chipCount(so2, query);

    // Assert.
    expect(count)
      .toBe(2);
  });

  it('counts only the shelf\'s matches during a search', () =>
  {
    // Arrange- both SO1 dishes are tagged, but only one is an egg dish.
    const query = 'egg';

    // Act.
    const count = chipCount(so1, query);

    // Assert.
    expect(count)
      .toBe(1);
  });
});

/*
 * isSearching owes the page a plain answer to whether a search is on, which spaces alone don't make.
 */
describe('isSearching', () =>
{
  it('is off when the box holds nothing but spaces', () =>
  {
    // Arrange.
    const queries = [ '', '   ' ];

    // Act.
    const answers = queries.map(isSearching);

    // Assert.
    expect(answers)
      .toEqual([ false, false ]);
  });

  it('is on once a word is typed', () =>
  {
    // Arrange.
    const query = ' egg ';

    // Act.
    const answer = isSearching(query);

    // Assert.
    expect(answer)
      .toBe(true);
  });
});

/*
 * describeCount owes the line under the list's name a count that reads as a sentence, singular for one,
 * and during a search, which words it matched.
 */
describe('describeCount', () =>
{
  it('counts one recipe in the singular', () =>
  {
    // Arrange.
    const count = 1;

    // Act.
    const line = describeCount(count, '');

    // Assert.
    expect(line)
      .toBe('1 recipe');
  });

  it('counts several recipes in the plural', () =>
  {
    // Arrange.
    const count = 125;

    // Act.
    const line = describeCount(count, ' ');

    // Assert.
    expect(line)
      .toBe('125 recipes');
  });

  it('says when nothing matches a search', () =>
  {
    // Arrange.
    const count = 0;

    // Act.
    const line = describeCount(count, 'egg');

    // Assert.
    expect(line)
      .toBe('No recipes match “egg”');
  });

  it('says when one recipe matches a search', () =>
  {
    // Arrange.
    const count = 1;

    // Act.
    const line = describeCount(count, 'egg');

    // Assert.
    expect(line)
      .toBe('1 recipe matches “egg”');
  });

  it('says how many recipes match a search, without its stray spaces', () =>
  {
    // Arrange.
    const count = 3;

    // Act.
    const line = describeCount(count, '  egg ');

    // Assert.
    expect(line)
      .toBe('3 recipes match “egg”');
  });
});

/*
 * offersEverything owes a search that found nothing on the lit shelves a way out, and nothing else one.
 */
describe('offersEverything', () =>
{
  it('offers everything when the lit shelves have nothing for a search', () =>
  {
    // Arrange.
    const lit = [ so1 ];

    // Act.
    const offered = offersEverything(0, lit, 'egg');

    // Assert.
    expect(offered)
      .toBe(true);
  });

  it('makes no offer when something matched', () =>
  {
    // Arrange.
    const lit = [ so1 ];

    // Act.
    const offered = offersEverything(1, lit, 'egg');

    // Assert.
    expect(offered)
      .toBe(false);
  });

  it('makes no offer when no shelf is lit, since everything was searched', () =>
  {
    // Arrange.
    const lit: Shelf[] = [];

    // Act.
    const offered = offersEverything(0, lit, 'egg');

    // Assert.
    expect(offered)
      .toBe(false);
  });

  it('makes no offer without a search', () =>
  {
    // Arrange.
    const lit = [ so1 ];

    // Act.
    const offered = offersEverything(0, lit, '  ');

    // Assert.
    expect(offered)
      .toBe(false);
  });
});

/*
 * pageTitle owes a tab a title that says what it holds, the search first, since that's the most specific.
 */
describe('pageTitle', () =>
{
  it('names the search during one, even with shelves lit', () =>
  {
    // Arrange.
    const lit = [ so2 ];

    // Act.
    const title = pageTitle(lit, ' egg ');

    // Assert.
    expect(title)
      .toBe('egg · Recipes');
  });

  it('names the lit shelves without a search', () =>
  {
    // Arrange.
    const lit = [ so2, so1 ];

    // Act.
    const title = pageTitle(lit, '');

    // Assert.
    expect(title)
      .toBe('SO2 + SO1 · Recipes');
  });

  it('is the site\'s name with nothing lit or searched', () =>
  {
    // Arrange.
    const lit: Shelf[] = [];

    // Act.
    const title = pageTitle(lit, '');

    // Assert.
    expect(title)
      .toBe('Recipes');
  });
});

/*
 * homeParameters and homeAddress owe the address one way of writing each choice of shelves and search.
 */
describe('homeParameters', () =>
{
  it('lists a shelf parameter per key, then the search', () =>
  {
    // Arrange.
    const keys = [ 'home', 'so1' ];

    // Act.
    const parameters = homeParameters(keys, 'egg');

    // Assert.
    expect(parameters)
      .toEqual([ [ 'shelf', 'home' ], [ 'shelf', 'so1' ], [ 'q', 'egg' ] ]);
  });

  it('leaves the search out when the box is empty', () =>
  {
    // Arrange.
    const keys = [ 'so1' ];

    // Act.
    const parameters = homeParameters(keys, '');

    // Assert.
    expect(parameters)
      .toEqual([ [ 'shelf', 'so1' ] ]);
  });
});

describe('homeAddress', () =>
{
  it('is the bare home page for no shelves and no search', () =>
  {
    // Arrange.
    const keys: string[] = [];

    // Act.
    const address = homeAddress(keys, '');

    // Assert.
    expect(address)
      .toBe('/');
  });

  it('writes the shelves and the search into the address', () =>
  {
    // Arrange.
    const keys = [ 'so4', 'so5' ];

    // Act.
    const address = homeAddress(keys, 'egg rice');

    // Assert.
    expect(address)
      .toBe('/?shelf=so4&shelf=so5&q=egg+rice');
  });
});

/*
 * hueOf owes the chips a rainbow that never puts one color beside itself, however many shelves there are.
 */
describe('hueOf', () =>
{
  it('counts through the seven colors and starts again after violet', () =>
  {
    // Arrange.
    const positions = [ 0, 1, 6, 7, 9 ];

    // Act.
    const hues = positions.map(hueOf);

    // Assert.
    expect(hues)
      .toEqual([ 0, 1, 6, 0, 2 ]);
  });
});

/*
 * barBackground owes the bar beside the list's name the lit chips' own colors.
 */
describe('barBackground', () =>
{
  it('runs the whole rainbow when no shelf is lit', () =>
  {
    // Arrange.
    const lit: Shelf[] = [];

    // Act.
    const background = barBackground(shelves, lit);

    // Assert.
    expect(background)
      .toBe('linear-gradient(to bottom, var(--rainbow-0), var(--rainbow-1), var(--rainbow-2), var(--rainbow-3), '
        + 'var(--rainbow-4), var(--rainbow-5), var(--rainbow-6))');
  });

  it('is one lit chip\'s color, solid', () =>
  {
    // Arrange- SO1 is the third chip.
    const lit = [ so1 ];

    // Act.
    const background = barBackground(shelves, lit);

    // Assert.
    expect(background)
      .toBe('linear-gradient(to bottom, var(--rainbow-2), var(--rainbow-2))');
  });

  it('runs through several lit chips\' colors in chip order', () =>
  {
    // Arrange.
    const lit = [ home, so1 ];

    // Act.
    const background = barBackground(shelves, lit);

    // Assert.
    expect(background)
      .toBe('linear-gradient(to bottom, var(--rainbow-0), var(--rainbow-2))');
  });
});

/*
 * groupByCourse owes a list every recipe exactly once, under the course that claims it, with the courses
 * in menu order. A recipe tagged with no course at all still has to show up somewhere.
 */
describe('groupByCourse', () =>
{
  it('lists the courses in menu order and leaves out empty ones', () =>
  {
    // Arrange- the recipes arrive in the opposite order to the menu's.
    const recipes = [
      recipe('fruit-punch', '', [ 'drink' ]),
      recipe('sukiyaki', '', [ 'dinner' ]),
      recipe('pancakes', '', [ 'breakfast' ]),
    ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups.map((group) => group.heading))
      .toEqual([ 'Breakfast & Brunch', 'Dinner', 'Drinks' ]);
  });

  it('gathers breakfast and brunch on one course', () =>
  {
    // Arrange- a lunch beside them, which has to keep a course of its own.
    const recipes = [
      recipe('pancakes', '', [ 'breakfast' ]),
      recipe('chorizo-gravy', '', [ 'brunch' ]),
      recipe('kids-meal', '', [ 'lunch' ]),
    ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups.map((group) => [ group.heading, slugsOf(group.recipes) ]))
      .toEqual([ [ 'Breakfast & Brunch', [ 'pancakes', 'chorizo-gravy' ] ], [ 'Lunch', [ 'kids-meal' ] ] ]);
  });

  it('lists a recipe with two courses once, under the one that claims it', () =>
  {
    // Arrange- three pairs where the dish wins over the meal, a drink that's also a dessert, and a plain dinner.
    const recipes = [
      recipe('ultimate-ramen', '', [ 'dinner', 'soup' ]),
      recipe('carrot-juice', '', [ 'breakfast', 'drink' ]),
      recipe('lemon-tart', '', [ 'baking', 'dessert' ]),
      recipe('hamburg-steak', '', [ 'dinner' ]),
      recipe('milk-shake', '', [ 'dessert', 'drink' ]),
    ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups.map((group) => [ group.heading, slugsOf(group.recipes) ]))
      .toEqual([
        [ 'Dinner', [ 'hamburg-steak' ] ],
        [ 'Soups', [ 'ultimate-ramen' ] ],
        [ 'Desserts', [ 'lemon-tart' ] ],
        [ 'Drinks', [ 'carrot-juice', 'milk-shake' ] ],
      ]);
  });

  it('puts recipes with no course last, under everything else', () =>
  {
    // Arrange- a recipe tagged only with what it's made of.
    const recipes = [ recipe('mystery-meat', '', [ 'beef' ]), recipe('sukiyaki', '', [ 'dinner' ]) ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups.map((group) => [ group.heading, slugsOf(group.recipes) ]))
      .toEqual([ [ 'Dinner', [ 'sukiyaki' ] ], [ 'Everything else', [ 'mystery-meat' ] ] ]);
  });

  it('keeps each course in the order its recipes arrived', () =>
  {
    // Arrange- out of alphabetical order, so sorting of any kind would show.
    const recipes = [ recipe('sukiyaki', '', [ 'dinner' ]), recipe('hamburg-steak', '', [ 'dinner' ]) ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(slugsOf(groups[0].recipes))
      .toEqual([ 'sukiyaki', 'hamburg-steak' ]);
  });

  it('keeps each course\'s color from its place on the whole menu', () =>
  {
    // Arrange- Dinner is third on the menu and Everything else twelfth, though here they're first and second.
    const recipes = [ recipe('sukiyaki', '', [ 'dinner' ]), recipe('mystery-meat', '', [ 'beef' ]) ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups.map((group) => [ group.heading, group.hue ]))
      .toEqual([ [ 'Dinner', 2 ], [ 'Everything else', 4 ] ]);
  });

  it('makes no groups when there are no recipes', () =>
  {
    // Arrange- an empty list.
    const recipes: RecipeSummary[] = [];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups)
      .toEqual([]);
  });

  it('gives every course a place in the claim order, and nothing else', () =>
  {
    // Arrange- a course missing from the claim order could never claim a recipe.
    const shown = courses.flatMap((course) => course.tags);

    // Act.
    const sortedShown = [ ...shown ].sort();
    const sortedClaims = [ ...claimOrder ].sort();

    // Assert.
    expect(sortedClaims)
      .toEqual(sortedShown);
  });
});

/*
 * toggleCourse owes a course's tap the open courses after it: that one flipped, the rest as they were.
 */
describe('toggleCourse', () =>
{
  it('opens a closed course', () =>
  {
    // Arrange.
    const open = [ 'Dinner' ];

    // Act.
    const next = toggleCourse(open, 'Desserts');

    // Assert.
    expect(next)
      .toEqual([ 'Dinner', 'Desserts' ]);
  });

  it('closes an open course, leaving the rest open', () =>
  {
    // Arrange.
    const open = [ 'Dinner', 'Desserts' ];

    // Act.
    const next = toggleCourse(open, 'Dinner');

    // Assert.
    expect(next)
      .toEqual([ 'Desserts' ]);
  });
});

/*
 * courseBodyId owes each course's toggle an id naming the part of the page it opens.
 */
describe('courseBodyId', () =>
{
  it('turns a heading into an id, a word at a time', () =>
  {
    // Arrange.
    const headings = [ 'Desserts', 'Everything else' ];

    // Act.
    const ids = headings.map(courseBodyId);

    // Assert.
    expect(ids)
      .toEqual([ 'course-desserts', 'course-everything-else' ]);
  });
});
