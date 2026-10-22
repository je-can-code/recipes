import type { Catalog, RecipeSummary } from '../types';
import { searchRecipes } from './search';

/**
 * The shelf for every recipe in no collection, which is where a new card lands until a collection takes it.
 */
const homeLabel = 'Home Cooking';

/**
 * The key Home Cooking goes by in the address. A collection goes by its tag, so a collection tagged home
 * would light up with it, which does no harm.
 */
const homeKey = 'home';

/**
 * The name over the list when no shelf is lit, and every recipe is showing.
 */
const everythingName = 'Everything';

/**
 * One shelf on the home page: Home Cooking or a collection. The key is how the address names it, the label
 * goes on its chip, and the name goes over its list.
 */
interface Shelf
{
  key: string;
  label: string;
  name: string;
  recipes: RecipeSummary[];
}

/**
 * One course on the home page: its heading, its rainbow color, and its recipes.
 */
interface CourseGroup
{
  heading: string;
  hue: number;
  recipes: RecipeSummary[];
}

/**
 * The courses the list is split into, in the order they're shown: through the day first, then the dishes
 * that go alongside, then the sweets and the drinks. A course can gather more than one tag: breakfast and
 * brunch share one, since a cook looking for a morning dish wants both.
 */
const courses = [
  { tags: [ 'breakfast', 'brunch' ], heading: 'Breakfast & Brunch' },
  { tags: [ 'lunch' ], heading: 'Lunch' },
  { tags: [ 'dinner' ], heading: 'Dinner' },
  { tags: [ 'soup' ], heading: 'Soups' },
  { tags: [ 'salad' ], heading: 'Salads' },
  { tags: [ 'side' ], heading: 'Sides' },
  { tags: [ 'sauce' ], heading: 'Sauces' },
  { tags: [ 'snack' ], heading: 'Snacks' },
  { tags: [ 'baking' ], heading: 'Baking' },
  { tags: [ 'dessert' ], heading: 'Desserts' },
  { tags: [ 'drink' ], heading: 'Drinks' },
];

/**
 * Which course claims a recipe tagged with more than one, first to last. Each recipe is listed once, so
 * the particular kind of dish wins over the meal it's eaten at: a ramen tagged dinner and soup is found
 * with the soups, a juice tagged breakfast and drink with the drinks, and a tart tagged baking and dessert
 * with the desserts. A sauce or a bake is usually part of a meal, so those two claim last and give way to
 * the meal: biscuits tagged baking and brunch are found under Breakfast & Brunch, and a pizza tagged dinner
 * and baking under Dinner. A bread tagged only baking still has a course of its own.
 */
const claimOrder = [
  'drink', 'dessert', 'soup', 'salad', 'side', 'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'baking', 'sauce',
];

/**
 * The heading for recipes with no course tag at all, which come last rather than going missing.
 */
const otherHeading = 'Everything else';

/**
 * Builds every shelf for the home page: Home Cooking first, then each collection in the order the
 * collections file lists them. A collection's shelf holds every recipe carrying its tag, wherever the card
 * sits, and a recipe in several collections is on each of their shelves. Home Cooking holds every recipe in
 * no collection at all, so no card can go missing from the home page, and it's always there, even empty.
 * @param {Catalog} catalog The recipes and the collections, with the recipes already in the order to show them.
 * @returns {Shelf[]} Every shelf, each with its recipes in that same order.
 */
const buildShelves = (catalog: Catalog): Shelf[] =>
{
  const { recipes, collections } = catalog;
  const collected = new Set(collections.map((collection) => collection.tag));

  const home: Shelf = {
    key: homeKey,
    label: homeLabel,
    name: homeLabel,
    recipes: recipes.filter((recipe) => recipe.tags.some((tag) => collected.has(tag)) === false),
  };

  const shelves = collections.map((collection): Shelf =>
  {
    return {
      key: collection.tag,
      label: collection.label,
      name: collection.name,
      recipes: recipes.filter((recipe) => recipe.tags.includes(collection.tag)),
    };
  });

  return [ home, ...shelves ];
};

/**
 * The lit shelves, in the order their chips sit, from the keys in the address. A key that names no shelf
 * is passed over, so a mistyped or out-of-date link still shows whatever else it names.
 * @param {Shelf[]} shelves Every shelf.
 * @param {string[]} keys The keys the address names.
 * @returns {Shelf[]} The lit shelves.
 */
const litShelves = (shelves: Shelf[], keys: string[]): Shelf[] =>
{
  return shelves.filter((shelf) => keys.includes(shelf.key));
};

/**
 * The keys to put in the address after a chip is tapped: its shelf lit when it wasn't, and put out when it
 * was. They come back in chip order, so one choice of shelves always has one address, whatever order the
 * taps came in, and any key naming no shelf is dropped on the way.
 * @param {Shelf[]} shelves Every shelf.
 * @param {string[]} keys The keys lit now.
 * @param {string} key The tapped chip's key.
 * @returns {string[]} The keys to light.
 */
const toggleShelf = (shelves: Shelf[], keys: string[], key: string): string[] =>
{
  const wanted = keys.includes(key) ? keys.filter((other) => other !== key) : [ ...keys, key ];
  return litShelves(shelves, wanted).map((shelf) => shelf.key);
};

/**
 * The recipes the lit shelves hold between them: every recipe when none is lit, and otherwise each recipe
 * on any lit shelf, once, in the catalog's own order.
 * @param {RecipeSummary[]} recipes Every recipe, in the order to show them.
 * @param {Shelf[]} lit The lit shelves.
 * @returns {RecipeSummary[]} The recipes to show.
 */
const recipesOn = (recipes: RecipeSummary[], lit: Shelf[]): RecipeSummary[] =>
{
  if (lit.length === 0)
  {
    return recipes;
  }
  return recipes.filter((recipe) => lit.some((shelf) => shelf.recipes.includes(recipe)));
};

/**
 * The name over the list: Everything when no shelf is lit, the shelf's full name when one is, and the lit
 * chips' labels joined when several are, which keeps the line short.
 * @param {Shelf[]} lit The lit shelves.
 * @returns {string} The name.
 */
const headingFor = (lit: Shelf[]): string =>
{
  if (lit.length === 0)
  {
    return everythingName;
  }
  if (lit.length === 1)
  {
    return lit[0].name;
  }
  return lit.map((shelf) => shelf.label).join(' + ');
};

/**
 * The number on a shelf's chip: how many of its recipes match the search, which is all of them when
 * nothing has been typed. So the chips answer "how many egg dishes are in each game?" before any is tapped.
 * @param {Shelf} shelf The shelf.
 * @param {string} query What's in the search box.
 * @returns {number} How many of its recipes match.
 */
const chipCount = (shelf: Shelf, query: string): number =>
{
  return searchRecipes(shelf.recipes, query).length;
};

/**
 * Whether anything has been typed into the search box, other than spaces.
 * @param {string} query What's in the search box.
 * @returns {boolean} True when there's a search.
 */
const isSearching = (query: string): boolean =>
{
  return query.trim() !== '';
};

/**
 * The line under the list's name: how many recipes it holds, or, during a search, how many match.
 * @param {number} count How many recipes are showing.
 * @param {string} query What's in the search box.
 * @returns {string} The line.
 */
const describeCount = (count: number, query: string): string =>
{
  const words = query.trim();
  if (words === '')
  {
    return count === 1 ? '1 recipe' : `${count} recipes`;
  }
  if (count === 0)
  {
    return `No recipes match “${words}”`;
  }
  return count === 1 ? `1 recipe matches “${words}”` : `${count} recipes match “${words}”`;
};

/**
 * Whether to offer the same search over everything: only when lit shelves found nothing for a search,
 * since with none lit, everything was already searched.
 * @param {number} count How many recipes matched.
 * @param {Shelf[]} lit The lit shelves.
 * @param {string} query What's in the search box.
 * @returns {boolean} True when the offer belongs under the count.
 */
const offersEverything = (count: number, lit: Shelf[], query: string): boolean =>
{
  return count === 0 && lit.length > 0 && isSearching(query);
};

/**
 * The tab's title: the search during one, the lit shelves when there are some, and the site's name
 * otherwise, so a tab or a bookmark says what it holds.
 * @param {Shelf[]} lit The lit shelves.
 * @param {string} query What's in the search box.
 * @returns {string} The title.
 */
const pageTitle = (lit: Shelf[], query: string): string =>
{
  if (isSearching(query))
  {
    return `${query.trim()} · Recipes`;
  }
  if (lit.length > 0)
  {
    return `${headingFor(lit)} · Recipes`;
  }
  return 'Recipes';
};

/**
 * The home page's address parameters: one shelf parameter per lit shelf, in chip order, then the search
 * when there is one. Repeating the shelf parameter, rather than joining keys with commas, keeps the address
 * readable, since commas would be written out as %2C.
 * @param {string[]} keys The lit shelves' keys, in chip order.
 * @param {string} query What's in the search box.
 * @returns {[ string, string ][]} The parameters, in order.
 */
const homeParameters = (keys: string[], query: string): [ string, string ][] =>
{
  const parameters = keys.map((key): [ string, string ] => [ 'shelf', key ]);
  if (query !== '')
  {
    parameters.push([ 'q', query ]);
  }
  return parameters;
};

/**
 * The home page's address for a choice of shelves and a search, for links into it from elsewhere, like a
 * recipe's tags.
 * @param {string[]} keys The shelves to light, in chip order.
 * @param {string} query The search.
 * @returns {string} The address.
 */
const homeAddress = (keys: string[], query: string): string =>
{
  const search = new URLSearchParams(homeParameters(keys, query)).toString();
  return search === '' ? '/' : `/?${search}`;
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
 * The bar beside the list's name, as a CSS background: the lit chips' colors top to bottom, one color
 * solid, and the whole rainbow when no shelf is lit, since then everything is showing.
 * @param {Shelf[]} shelves Every shelf, in chip order, which is what decides each one's color.
 * @param {Shelf[]} lit The lit shelves.
 * @returns {string} The background.
 */
const barBackground = (shelves: Shelf[], lit: Shelf[]): string =>
{
  const hues = lit.length === 0 ? [ 0, 1, 2, 3, 4, 5, 6 ] : lit.map((shelf) => hueOf(shelves.indexOf(shelf)));

  // a gradient needs two colors, so one lit shelf names its color twice.
  const stops = hues.length === 1 ? [ hues[0], hues[0] ] : hues;
  return `linear-gradient(to bottom, ${stops.map((hue) => `var(--rainbow-${hue})`).join(', ')})`;
};

/**
 * Splits recipes into courses, in menu order, each recipe under the one course that claims it. Recipes
 * with no course tag go under a last heading of their own, and empty courses are left out. Each course
 * takes its color from its place on the whole menu, so Dinner is the same color however few courses a
 * search leaves.
 * @param {RecipeSummary[]} recipes The recipes, in the order to show them.
 * @returns {CourseGroup[]} The courses that have recipes, each keeping that order.
 */
const groupByCourse = (recipes: RecipeSummary[]): CourseGroup[] =>
{
  const sections = [ ...courses, { tags: [ '' ], heading: otherHeading } ];
  return sections
    .map((section, position) =>
    {
      const members = recipes.filter((recipe) => section.tags.includes(courseOf(recipe)));
      return { heading: section.heading, hue: hueOf(position), recipes: members };
    })
    .filter((group) => group.recipes.length > 0);
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

/**
 * The open courses after one is tapped: opened when it was closed, and closed when it was open.
 * @param {string[]} open The headings of the courses open now.
 * @param {string} heading The tapped course's heading.
 * @returns {string[]} The headings to have open.
 */
const toggleCourse = (open: string[], heading: string): string[] =>
{
  return open.includes(heading) ? open.filter((other) => other !== heading) : [ ...open, heading ];
};

/**
 * The id of the part of the page a course opens and closes, so its toggle can say which part it controls.
 * @param {string} heading The course's heading, like Everything else.
 * @returns {string} The id, like course-everything-else.
 */
const courseBodyId = (heading: string): string =>
{
  return `course-${heading.toLowerCase().split(' ').join('-')}`;
};

export {
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
};
export type { CourseGroup, Shelf };
