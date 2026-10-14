/**
 * Something wrong with one recipe card, worded by the server for whoever has to fix it.
 */
interface Problem
{
  file: string;
  message: string;
}

/**
 * What lists and search need to know about a recipe. Serves and makes are free text, and a card has
 * exactly one of the two; the other arrives empty.
 */
interface RecipeSummary
{
  slug: string;
  title: string;
  collection: string;
  tags: string[];
  serves: string;
  makes: string;
  time: string;
}

/**
 * Every recipe and every problem with the cards, as the server read the recipes folder just now.
 */
interface Catalog
{
  recipes: RecipeSummary[];
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
 * One group of ingredients. The name is plain text; the items and the closing paragraph are HTML.
 */
interface RecipeGroup
{
  name: string;
  items: string[];
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
 * One recipe, everything its page shows.
 */
interface RecipeDetail extends RecipeSummary
{
  intro: string;
  ingredients: RecipeGroup[];
  method: RecipeMethod;
  notes: RecipeEntry[];
}

export type { Catalog, Problem, RecipeDetail, RecipeEntry, RecipeGroup, RecipeMethod, RecipeSummary };
