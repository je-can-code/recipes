/**
 * Something wrong with one recipe card, worded by the server for whoever has to fix it.
 */
interface Problem
{
  file: string;
  message: string;
}

/**
 * What lists and search need to know about a recipe. The folder is the one the card sits in, or empty at
 * the top level. Serves and makes are free text, and a card has exactly one of the two; the other arrives
 * empty. The revision names this version of the recipe, and moves whenever anything the site shows for it
 * changes, which is how the service worker knows which saved recipes are out of date.
 */
interface RecipeSummary
{
  slug: string;
  title: string;
  folder: string;
  tags: string[];
  serves: string;
  makes: string;
  time: string;
  revision: string;
}

/**
 * A collection with a shelf of its own on the home page: the tag its recipes carry, the short label on the
 * shelf's chip, and the full name over its list.
 */
interface Collection
{
  tag: string;
  label: string;
  name: string;
}

/**
 * Every recipe, the collections with shelves in the order the collections file lists them, and every
 * problem with the cards, as the server read the recipes folder just now.
 */
interface Catalog
{
  recipes: RecipeSummary[];
  collections: Collection[];
  problems: Problem[];
}

/**
 * A step or a note. Both halves are HTML the server rendered from the card's markdown.
 */
interface RecipeEntry
{
  lead: string;
  text: string;
}

/**
 * One group of ingredients. The name is plain text; the items and the closing paragraph are HTML. Keys runs
 * alongside the items: each line's key, which steps point at as {key}, or '' for a line without one.
 */
interface RecipeGroup
{
  name: string;
  items: string[];
  keys: string[];
  after: string;
}

/**
 * The method: the steps, with HTML before the first and after the last when the card has any.
 */
interface RecipeMethod
{
  before: string;
  steps: RecipeEntry[];
  after: string;
}

/**
 * One recipe, everything its page shows. Scales says the card is written for other batch sizes.
 */
interface RecipeDetail extends RecipeSummary
{
  intro: string;
  scales: boolean;
  ingredients: RecipeGroup[];
  method: RecipeMethod;
  notes: RecipeEntry[];
}

export type { Catalog, Collection, Problem, RecipeDetail, RecipeEntry, RecipeGroup, RecipeMethod, RecipeSummary };
