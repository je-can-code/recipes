import type { Catalog, RecipeDetail } from '../types';

/**
 * Fetches every recipe's summary and every problem with the cards.
 * @returns {Promise<Catalog>} The catalog, as the server read the recipes folder just now.
 */
const fetchCatalog = async (): Promise<Catalog> =>
{
  const response = await fetch('/api/recipes');
  return readJson<Catalog>(response);
};

/**
 * Fetches one recipe, rendered for its page.
 * @param {string} slug The recipe's name, as it appears in the page's address.
 * @returns {Promise<RecipeDetail | null>} The recipe, or null when no recipe has that name.
 */
const fetchRecipe = async (slug: string): Promise<RecipeDetail | null> =>
{
  const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}`);

  // a missing recipe is an answer rather than a failure, so the page can say so plainly.
  if (response.status === 404)
  {
    return null;
  }
  return withMeasureFields(await readJson<RecipeDetail>(response));
};

/**
 * Fills in the two fields a recipe saved by an older build doesn't have, since the service worker can answer
 * with one while the desktop is out of reach: a card without scales doesn't scale, and a line without a key
 * has the empty one.
 * @param {RecipeDetail} recipe The recipe as it arrived.
 * @returns {RecipeDetail} The recipe with both fields present.
 */
const withMeasureFields = (recipe: RecipeDetail): RecipeDetail =>
{
  return {
    ...recipe,
    scales: recipe.scales === true,
    ingredients: recipe.ingredients.map((group) =>
    {
      return { ...group, keys: Array.isArray(group.keys) ? group.keys : group.items.map(() => '') };
    }),
  };
};

/**
 * Reads a JSON answer, turning a failed one into an error carrying the server's own explanation.
 * @param {Response} response The server's answer.
 * @returns {Promise<T>} The body, when the server succeeded.
 */
const readJson = async <T>(response: Response): Promise<T> =>
{
  const body = await response.json();
  if (response.ok === false)
  {
    throw new Error(body.error ?? `The server answered ${response.status}.`);
  }
  return body as T;
};

export { fetchCatalog, fetchRecipe };
