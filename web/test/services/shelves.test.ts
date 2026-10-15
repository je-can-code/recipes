import { describe, expect, it } from 'vitest';
import { buildShelves, claimOrder, courses, findShelf, groupByCourse, hueOf, placeOf } from '../../src/services/shelves';
import type { Catalog, Game, RecipeSummary } from '../../src/types';

/**
 * Builds a recipe summary with the fields shelves read, and placeholders for the rest.
 * @param {string} slug The recipe's name.
 * @param {string} collection The recipe's collection, or an empty string for the top level.
 * @param {string[]} tags The recipe's tags.
 * @returns {RecipeSummary} The summary.
 */
const recipe = (slug: string, collection: string, tags: string[]): RecipeSummary =>
{
  return { slug, title: slug, collection, tags, serves: '2', makes: '', time: 'about 10 minutes' };
};

/**
 * Builds a catalog of the given recipes and games, with no problems.
 * @param {RecipeSummary[]} recipes The recipes, in the order to show them.
 * @param {Game[]} games The games with shelves, in the games file's order.
 * @returns {Catalog} The catalog.
 */
const catalogOf = (recipes: RecipeSummary[], games: Game[]): Catalog =>
{
  return { recipes, games, problems: [] };
};

/**
 * The slugs on each shelf, in order, for comparing whole shelves at once.
 * @param {ReturnType<typeof buildShelves>} shelves The shelves.
 * @returns {string[][]} Each shelf's recipe names.
 */
const slugsOn = (shelves: ReturnType<typeof buildShelves>): string[][] =>
{
  return shelves.map((shelf) => shelf.recipes.map((member) => member.slug));
};

/**
 * Two games, listed out of name order so the order kept can only be the file's own.
 */
const games: Game[] = [
  { tag: 'so2', label: 'SO2', name: 'Star Ocean: The Second Story' },
  { tag: 'so1', label: 'SO1', name: 'Star Ocean: First Departure' },
];

/*
 * buildShelves owes the home page every shelf in a fixed order, Home Cooking first, and each shelf exactly
 * the recipes that belong on it. Home Cooking leaves out games' dishes, since those live on their games'
 * shelves, and a game's shelf takes a dish from anywhere, as long as it carries the game's tag.
 */
describe('buildShelves', () =>
{
  it('keeps games\' dishes and collections off Home Cooking', () =>
  {
    // Arrange- a dish of the top level's own, a game's dish beside it, and a collection's recipe.
    const recipes = [
      recipe('chorizo-gravy', '', [ 'brunch', 'pork' ]),
      recipe('sukiyaki', '', [ 'dinner', 'game', 'so4' ]),
      recipe('mojito', 'cocktails', [ 'drink' ]),
    ];

    // Act.
    const [ home ] = buildShelves(catalogOf(recipes, []));

    // Assert.
    expect(home)
      .toEqual({ address: '/', label: 'Home Cooking', name: 'Home Cooking', recipes: [ recipes[0] ] });
  });

  it('gives each collection a shelf, by name, after Home Cooking', () =>
  {
    // Arrange- the collections arrive out of name order.
    const recipes = [
      recipe('mojito', 'cocktails', [ 'drink' ]),
      recipe('scones', 'baking', [ 'baking' ]),
      recipe('chorizo-gravy', '', [ 'brunch' ]),
      recipe('margarita', 'cocktails', [ 'drink' ]),
    ];

    // Act.
    const shelves = buildShelves(catalogOf(recipes, []));

    // Assert.
    expect(shelves.map((shelf) => [ shelf.address, shelf.label, shelf.name ]))
      .toEqual([
        [ '/', 'Home Cooking', 'Home Cooking' ],
        [ '/?collection=baking', 'Baking', 'Baking' ],
        [ '/?collection=cocktails', 'Cocktails', 'Cocktails' ],
      ]);
    expect(slugsOn(shelves))
      .toEqual([ [ 'chorizo-gravy' ], [ 'scones' ], [ 'mojito', 'margarita' ] ]);
  });

  it('gives each game a shelf, in the games file\'s order, holding every dish with its tag', () =>
  {
    // Arrange- a dish from both games, one from a collection, and so22, which only looks like so2.
    const recipes = [
      recipe('fruit-punch', '', [ 'drink', 'game', 'so1' ]),
      recipe('rice-omelet', '', [ 'dinner', 'game', 'so1', 'so2' ]),
      recipe('sake-spritz', 'cocktails', [ 'drink', 'game', 'so2' ]),
      recipe('mystery-stew', '', [ 'dinner', 'game', 'so22' ]),
    ];

    // Act.
    const shelves = buildShelves(catalogOf(recipes, games));

    // Assert.
    expect(shelves.map((shelf) => [ shelf.address, shelf.label, shelf.name ]))
      .toEqual([
        [ '/', 'Home Cooking', 'Home Cooking' ],
        [ '/?collection=cocktails', 'Cocktails', 'Cocktails' ],
        [ '/?game=so2', 'SO2', 'Star Ocean: The Second Story' ],
        [ '/?game=so1', 'SO1', 'Star Ocean: First Departure' ],
      ]);
    expect(slugsOn(shelves))
      .toEqual([ [], [ 'sake-spritz' ], [ 'rice-omelet', 'sake-spritz' ], [ 'fruit-punch', 'rice-omelet' ] ]);
  });
});

/*
 * findShelf owes the home page the shelf its address names, so a chip's link, the back button and a
 * shared link all land on the same shelf, and owes a plain "nothing" for an address naming no real shelf,
 * rather than quietly showing a different one.
 */
describe('findShelf', () =>
{
  const shelves = buildShelves(catalogOf([ recipe('mojito', 'cocktails', [ 'drink' ]) ], games));

  it('finds Home Cooking when the address names no shelf', () =>
  {
    // Arrange.
    const parameters = new URLSearchParams('');

    // Act.
    const shelf = findShelf(shelves, parameters);

    // Assert.
    expect(shelf)
      .toMatchObject({ name: 'Home Cooking' });
  });

  it('finds a game\'s shelf by its tag', () =>
  {
    // Arrange.
    const parameters = new URLSearchParams('game=so1');

    // Act.
    const shelf = findShelf(shelves, parameters);

    // Assert.
    expect(shelf)
      .toMatchObject({ name: 'Star Ocean: First Departure' });
  });

  it('finds a collection\'s shelf by its folder', () =>
  {
    // Arrange.
    const parameters = new URLSearchParams('collection=cocktails');

    // Act.
    const shelf = findShelf(shelves, parameters);

    // Assert.
    expect(shelf)
      .toMatchObject({ name: 'Cocktails' });
  });

  it('finds nothing when the address names a shelf that doesn\'t exist', () =>
  {
    // Arrange- so is the start of both games' tags, but neither game's tag.
    const parameters = new URLSearchParams('game=so');

    // Act.
    const shelf = findShelf(shelves, parameters);

    // Assert.
    expect(shelf)
      .toBeNull();
  });

  it('takes the game when the address names a game and a collection', () =>
  {
    // Arrange- the collection comes first, so taking whichever comes first would pick it.
    const parameters = new URLSearchParams('collection=cocktails&game=so2');

    // Act.
    const shelf = findShelf(shelves, parameters);

    // Assert.
    expect(shelf)
      .toMatchObject({ name: 'Star Ocean: The Second Story' });
  });
});

/*
 * groupByCourse owes a shelf every recipe exactly once, under the course that claims it, with the courses
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
      .toEqual([ 'Breakfast', 'Dinner', 'Drinks' ]);
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
    expect(groups.map((group) => [ group.heading, group.recipes.map((member) => member.slug) ]))
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
    expect(groups.map((group) => [ group.heading, group.recipes.map((member) => member.slug) ]))
      .toEqual([ [ 'Dinner', [ 'sukiyaki' ] ], [ 'Everything else', [ 'mystery-meat' ] ] ]);
  });

  it('keeps each course in the order its recipes arrived', () =>
  {
    // Arrange- out of alphabetical order, so sorting of any kind would show.
    const recipes = [ recipe('sukiyaki', '', [ 'dinner' ]), recipe('hamburg-steak', '', [ 'dinner' ]) ];

    // Act.
    const groups = groupByCourse(recipes);

    // Assert.
    expect(groups[0].recipes.map((member) => member.slug))
      .toEqual([ 'sukiyaki', 'hamburg-steak' ]);
  });

  it('makes no groups when there are no recipes', () =>
  {
    // Arrange- an empty shelf.
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
    const shown = courses.map((course) => course.tag);

    // Act.
    const sortedShown = [ ...shown ].sort();
    const sortedClaims = [ ...claimOrder ].sort();

    // Assert.
    expect(sortedClaims)
      .toEqual(sortedShown);
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
 * placeOf owes a recipe's page and its search result the place it lives, and never Home Cooking for a
 * game's dish, which the home page keeps off that shelf.
 */
describe('placeOf', () =>
{
  it('names a recipe\'s collection', () =>
  {
    // Arrange.
    const mojito = recipe('mojito', 'cocktails', [ 'drink' ]);

    // Act.
    const place = placeOf(mojito);

    // Assert.
    expect(place)
      .toBe('Cocktails');
  });

  it('names Home Cooking for the top level\'s own dishes', () =>
  {
    // Arrange.
    const gravy = recipe('chorizo-gravy', '', [ 'brunch' ]);

    // Act.
    const place = placeOf(gravy);

    // Assert.
    expect(place)
      .toBe('Home Cooking');
  });

  it('names nothing for a game\'s dish at the top level', () =>
  {
    // Arrange.
    const sukiyaki = recipe('sukiyaki', '', [ 'dinner', 'game', 'so4' ]);

    // Act.
    const place = placeOf(sukiyaki);

    // Assert.
    expect(place)
      .toBe('');
  });

  it('names the collection for a game\'s dish in one', () =>
  {
    // Arrange.
    const spritz = recipe('sake-spritz', 'cocktails', [ 'drink', 'game', 'so2' ]);

    // Act.
    const place = placeOf(spritz);

    // Assert.
    expect(place)
      .toBe('Cocktails');
  });
});
