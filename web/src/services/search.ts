import type { RecipeSummary } from '../types';

/**
 * Finds the recipes matching what was typed. Every word has to turn up somewhere in a recipe's title,
 * tags or collection, ignoring capitals, so each extra word narrows the list: "beef dinner" means beef
 * and dinner, not either. Words match partway through too, so results keep up while the typing does.
 * An empty search matches everything.
 * @param {RecipeSummary[]} recipes Every recipe, in the order they should be shown.
 * @param {string} query What was typed into the search box.
 * @returns {RecipeSummary[]} The matching recipes, in the same order.
 */
const searchRecipes = (recipes: RecipeSummary[], query: string): RecipeSummary[] =>
{
  const words = toWords(query);
  return recipes.filter((recipe) =>
  {
    const text = searchableText(recipe);
    return words.every((word) => text.includes(word));
  });
};

/**
 * Splits a search into lowercase words, dropping the empty ones that extra spaces leave behind.
 * @param {string} query What was typed.
 * @returns {string[]} The words to match.
 */
const toWords = (query: string): string[] =>
{
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
};

/**
 * Everything search looks at for one recipe, lowercased and joined with spaces, so no word can match
 * across the join between two fields.
 * @param {RecipeSummary} recipe The recipe.
 * @returns {string} The text to search.
 */
const searchableText = (recipe: RecipeSummary): string =>
{
  return [ recipe.title, recipe.collection, ...recipe.tags ]
    .join(' ')
    .toLowerCase();
};

export { searchRecipes };
