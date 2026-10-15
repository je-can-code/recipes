import type { Catalog, RecipeSummary } from '../types';
import { collectionLabel, topLevelLabel } from './collections';

/**
 * The tag every dish from a game carries. Those dishes sit on their game's shelf, so Home Cooking leaves
 * them out.
 */
const gameTag = 'game';

/**
 * One shelf on the home page: Home Cooking, a collection, or a game. The address is where its chip leads,
 * and it's also how the page finds the shelf again, so the back button and a shared link both land on it.
 */
interface Shelf
{
  address: string;
  label: string;
  name: string;
  recipes: RecipeSummary[];
}

/**
 * One course on a shelf, under its heading.
 */
interface CourseGroup
{
  heading: string;
  recipes: RecipeSummary[];
}

/**
 * The courses a shelf is split into, in the order they're shown: through the day first, then the dishes
 * that go alongside, then the sweets and the drinks.
 */
const courses = [
  { tag: 'breakfast', heading: 'Breakfast' },
  { tag: 'brunch', heading: 'Brunch' },
  { tag: 'lunch', heading: 'Lunch' },
  { tag: 'dinner', heading: 'Dinner' },
  { tag: 'soup', heading: 'Soups' },
  { tag: 'salad', heading: 'Salads' },
  { tag: 'side', heading: 'Sides' },
  { tag: 'sauce', heading: 'Sauces' },
  { tag: 'snack', heading: 'Snacks' },
  { tag: 'baking', heading: 'Baking' },
  { tag: 'dessert', heading: 'Desserts' },
  { tag: 'drink', heading: 'Drinks' },
];

/**
 * Which course claims a recipe tagged with more than one, first to last. Each recipe is listed once, so
 * the particular kind of dish wins over the meal it's eaten at: a ramen tagged dinner and soup is found
 * with the soups, a juice tagged breakfast and drink with the drinks, and a tart tagged baking and dessert
 * with the desserts.
 */
const claimOrder = [
  'drink', 'dessert', 'soup', 'salad', 'sauce', 'baking', 'side', 'breakfast', 'brunch', 'lunch', 'dinner', 'snack',
];

/**
 * The heading for recipes with no course tag at all, which come last rather than going missing.
 */
const otherHeading = 'Everything else';

/**
 * Builds every shelf for the home page: Home Cooking first, then each collection by name, then each game
 * in the order the games file lists them. Home Cooking is the top level minus the games' dishes, and it's
 * always there, even empty, since the home page opens on it. A game's shelf holds every recipe carrying
 * its tag, wherever the card sits, and a dish from several games is on each of their shelves.
 * @param {Catalog} catalog The recipes and the games, with the recipes already in the order to show them.
 * @returns {Shelf[]} Every shelf, each with its recipes in that same order.
 */
const buildShelves = (catalog: Catalog): Shelf[] =>
{
  const { recipes, games } = catalog;

  const home: Shelf = {
    address: '/',
    label: topLevelLabel,
    name: topLevelLabel,
    recipes: recipes.filter((recipe) => recipe.collection === '' && recipe.tags.includes(gameTag) === false),
  };

  const collections = collectionNames(recipes).map((folder): Shelf =>
  {
    const label = collectionLabel(folder);
    return {
      address: `/?collection=${encodeURIComponent(folder)}`,
      label,
      name: label,
      recipes: recipes.filter((recipe) => recipe.collection === folder),
    };
  });

  const gameShelves = games.map((game): Shelf =>
  {
    return {
      address: `/?game=${encodeURIComponent(game.tag)}`,
      label: game.label,
      name: game.name,
      recipes: recipes.filter((recipe) => recipe.tags.includes(game.tag)),
    };
  });

  return [ home, ...collections, ...gameShelves ];
};

/**
 * Every collection the recipes sit in, once each, by name.
 * @param {RecipeSummary[]} recipes Every recipe.
 * @returns {string[]} The collections' folder names, leaving out the top level.
 */
const collectionNames = (recipes: RecipeSummary[]): string[] =>
{
  const names = new Set(recipes.map((recipe) => recipe.collection));
  names.delete('');
  return [ ...names ].sort((left, right) => left.localeCompare(right));
};

/**
 * Finds the shelf the address asks for. No shelf named means Home Cooking, and a game named wins over a
 * collection, since only an address typed by hand could name both.
 * @param {Shelf[]} shelves Every shelf.
 * @param {URLSearchParams} parameters The query part of the home page's address.
 * @returns {Shelf | null} The shelf, or null when the address names one that doesn't exist.
 */
const findShelf = (shelves: Shelf[], parameters: URLSearchParams): Shelf | null =>
{
  const address = addressFor(parameters);
  return shelves.find((shelf) => shelf.address === address) ?? null;
};

/**
 * The address of the shelf a query names, written the way the shelves write their own.
 * @param {URLSearchParams} parameters The query part of the home page's address.
 * @returns {string} The address of the shelf it names.
 */
const addressFor = (parameters: URLSearchParams): string =>
{
  const game = parameters.get('game');
  if (game !== null)
  {
    return `/?game=${encodeURIComponent(game)}`;
  }

  const collection = parameters.get('collection');
  if (collection !== null)
  {
    return `/?collection=${encodeURIComponent(collection)}`;
  }

  return '/';
};

/**
 * Splits a shelf's recipes into courses, in menu order, each recipe under the one course that claims it.
 * Recipes with no course tag go under a last heading of their own, and empty courses are left out.
 * @param {RecipeSummary[]} recipes A shelf's recipes, in the order to show them.
 * @returns {CourseGroup[]} The courses that have recipes, each keeping that order.
 */
const groupByCourse = (recipes: RecipeSummary[]): CourseGroup[] =>
{
  const sections = [ ...courses, { tag: '', heading: otherHeading } ];
  return sections
    .map((section) =>
    {
      return { heading: section.heading, recipes: recipes.filter((recipe) => courseOf(recipe) === section.tag) };
    })
    .filter((group) => group.recipes.length > 0);
};

/**
 * The rainbow color for the shelf at a position, counting through the rainbow's seven colors and around
 * again, so neighboring chips never share one.
 * @param {number} position Where the shelf sits in the row, from 0.
 * @returns {number} The color's number, from 0 (red) to 6 (violet).
 */
const hueOf = (position: number): number =>
{
  return position % 7;
};

/**
 * Where a recipe lives, for the line above its title and its row in search results: its collection, or
 * Home Cooking for the top level. A game's dish at the top level lives on its game's shelf instead, and
 * its tags already name the game, so it gets no line at all.
 * @param {RecipeSummary} recipe The recipe.
 * @returns {string} The place to name, or an empty string when there's none to name.
 */
const placeOf = (recipe: RecipeSummary): string =>
{
  if (recipe.collection === '' && recipe.tags.includes(gameTag))
  {
    return '';
  }
  return collectionLabel(recipe.collection);
};

/**
 * The course that claims a recipe: the first of its tags in claim order.
 * @param {RecipeSummary} recipe The recipe.
 * @returns {string} The course's tag, or an empty string when the recipe has no course tag.
 */
const courseOf = (recipe: RecipeSummary): string =>
{
  return claimOrder.find((tag) => recipe.tags.includes(tag)) ?? '';
};

export { buildShelves, claimOrder, courses, findShelf, groupByCourse, hueOf, placeOf };
export type { CourseGroup, Shelf };
