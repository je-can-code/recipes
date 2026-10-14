import type { BrowserStorage } from './storage';

/**
 * How far along a recipe is: the ingredients gathered and the steps done. Ingredients are known by their
 * group and their place in it, like "0-3"; steps by their place in the method.
 */
interface Progress
{
  ingredients: string[];
  steps: number[];
}

/**
 * How long saved progress counts. A half-cooked recipe from yesterday is still worth picking up; one from
 * last week is a new cook, and old checkmarks would only be in the way.
 */
const staleAfter = 24 * 60 * 60 * 1000;

/**
 * Progress with nothing checked off.
 * @returns {Progress} Fresh progress.
 */
const emptyProgress = (): Progress =>
{
  return { ingredients: [], steps: [] };
};

/**
 * Checks off an ingredient, or unchecks it if it was checked.
 * @param {Progress} progress The progress so far.
 * @param {string} id The ingredient, like "0-3".
 * @returns {Progress} The new progress.
 */
const toggleIngredient = (progress: Progress, id: string): Progress =>
{
  const ingredients = progress.ingredients.includes(id)
    ? progress.ingredients.filter((checked) => checked !== id)
    : [ ...progress.ingredients, id ];
  return { ...progress, ingredients };
};

/**
 * Marks a step done, or not done if it was. Steps can be done in any order, since cooks skip around.
 * @param {Progress} progress The progress so far.
 * @param {number} index The step's place in the method, from 0.
 * @returns {Progress} The new progress.
 */
const toggleStep = (progress: Progress, index: number): Progress =>
{
  const steps = progress.steps.includes(index)
    ? progress.steps.filter((done) => done !== index)
    : [ ...progress.steps, index ];
  return { ...progress, steps };
};

/**
 * The step to do next: the first one not done yet.
 * @param {Progress} progress The progress so far.
 * @param {number} stepCount How many steps the recipe has.
 * @returns {number} The step's place in the method, or -1 once every step is done.
 */
const currentStep = (progress: Progress, stepCount: number): number =>
{
  for (let index = 0; index < stepCount; index++)
  {
    if (progress.steps.includes(index) === false)
    {
      return index;
    }
  }
  return -1;
};

/**
 * Whether every step is done, which is what finishes the quest. Gathering ingredients helps but doesn't
 * count, since plenty of cooks never check those off.
 * @param {Progress} progress The progress so far.
 * @param {number} stepCount How many steps the recipe has.
 * @returns {boolean} True when there are steps and every one is done.
 */
const isComplete = (progress: Progress, stepCount: number): boolean =>
{
  return stepCount > 0 && currentStep(progress, stepCount) === -1;
};

/**
 * Whether anything at all has been checked off yet.
 * @param {Progress} progress The progress so far.
 * @returns {boolean} True once any ingredient or step is checked.
 */
const isStarted = (progress: Progress): boolean =>
{
  return progress.ingredients.length > 0 || progress.steps.length > 0;
};

/**
 * The key one recipe's progress is saved under.
 * @param {string} slug The recipe's name.
 * @returns {string} The storage key.
 */
const progressKey = (slug: string): string =>
{
  return `recipes.progress.${slug}`;
};

/**
 * Reads a recipe's saved progress. Anything missing, older than a day, unreadable or shaped wrong comes back
 * as fresh progress, and so does storage the browser won't open, as in some private windows.
 * @param {BrowserStorage} storage Where progress is kept.
 * @param {string} slug The recipe's name.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {Progress} The saved progress, or fresh progress.
 */
const loadProgress = (storage: BrowserStorage, slug: string, now: number): Progress =>
{
  try
  {
    const saved = storage.getItem(progressKey(slug));
    if (saved === null)
    {
      return emptyProgress();
    }

    // this is the one place outside data comes in, so its shape is checked rather than trusted.
    const parsed = JSON.parse(saved);
    const isShaped = Array.isArray(parsed.ingredients) && Array.isArray(parsed.steps) && typeof parsed.savedAt === 'number';
    if (isShaped === false || now - parsed.savedAt > staleAfter)
    {
      storage.removeItem(progressKey(slug));
      return emptyProgress();
    }
    return { ingredients: parsed.ingredients, steps: parsed.steps };
  }
  catch
  {
    return emptyProgress();
  }
};

/**
 * Saves a recipe's progress, stamped with the time so it can go stale. Progress with nothing checked is
 * removed instead of saved. Storage the browser won't write to just means progress lasts as long as the
 * page does.
 * @param {BrowserStorage} storage Where progress is kept.
 * @param {string} slug The recipe's name.
 * @param {Progress} progress The progress to save.
 * @param {number} now The time, in milliseconds since 1970.
 */
const saveProgress = (storage: BrowserStorage, slug: string, progress: Progress, now: number): void =>
{
  try
  {
    if (isStarted(progress) === false)
    {
      storage.removeItem(progressKey(slug));
      return;
    }
    storage.setItem(progressKey(slug), JSON.stringify({ ...progress, savedAt: now }));
  }
  catch
  {
    // a full or locked storage loses nothing the page itself doesn't still hold.
  }
};

export {
  currentStep,
  emptyProgress,
  isComplete,
  isStarted,
  loadProgress,
  saveProgress,
  toggleIngredient,
  toggleStep,
};
export type { Progress };
