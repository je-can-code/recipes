import type { RecipeSummary } from '../types';

/**
 * The heading for recipes at the top level of the recipes folder, which have no collection folder to
 * name them after.
 */
const topLevelLabel = 'Home Cooking';

/**
 * One group of recipes on the home page: a collection folder, or the top level.
 */
interface CollectionGroup
{
  name: string;
  label: string;
  recipes: RecipeSummary[];
}

/**
 * Turns a collection's folder name into a heading, so star-ocean reads as Star Ocean: hyphens become
 * spaces and every word gets a capital.
 * @param {string} name The collection's folder name, or an empty string for the top level.
 * @returns {string} The heading to show.
 */
const collectionLabel = (name: string): string =>
{
  if (name === '')
  {
    return topLevelLabel;
  }

  return name
    .split('-')
    .filter((word) => word !== '')
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

/**
 * Groups recipes for the home page: the top level first, then each collection by name, with the recipes
 * in each group kept in the order they arrived.
 * @param {RecipeSummary[]} recipes Every recipe, already in the order to show them.
 * @returns {CollectionGroup[]} One group per collection that has at least one recipe.
 */
const groupByCollection = (recipes: RecipeSummary[]): CollectionGroup[] =>
{
  // gather each collection's recipes, keeping their order.
  const groups = new Map<string, RecipeSummary[]>();
  recipes.forEach((recipe) =>
  {
    const members = groups.get(recipe.collection) ?? [];
    members.push(recipe);
    groups.set(recipe.collection, members);
  });

  // the top level sorts first because the empty name sorts before every other.
  const sorted = [ ...groups.entries() ].sort(([ left ], [ right ]) => left.localeCompare(right));
  return sorted.map(([ name, members ]) =>
  {
    return { name, label: collectionLabel(name), recipes: members };
  });
};

export { collectionLabel, groupByCollection, topLevelLabel };
export type { CollectionGroup };
