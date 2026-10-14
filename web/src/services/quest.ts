import type { RecipeGroup } from '../types';
import { currentStep, isComplete, isStarted } from './progress';
import type { Progress } from './progress';
import { formatClock, isRinging, secondsLeft } from './timers';
import type { Timer } from './timers';

/**
 * How many ingredients a recipe has, across every group.
 * @param {RecipeGroup[]} groups The recipe's ingredient groups.
 * @returns {number} The count.
 */
const countIngredients = (groups: RecipeGroup[]): number =>
{
  return groups.reduce((total, group) => total + group.items.length, 0);
};

/**
 * Whether someone is mid-cook: something is checked off, and steps are still left. That's when the screen
 * should stay on.
 * @param {Progress} progress The progress so far.
 * @param {number} stepCount How many steps the recipe has.
 * @returns {boolean} True between the first checkmark and the last step.
 */
const isCooking = (progress: Progress, stepCount: number): boolean =>
{
  return isStarted(progress) && isComplete(progress, stepCount) === false;
};

/**
 * How full the quest bar is: the share of steps done, as a whole percent. Ingredients don't count toward
 * it, since checking them off is optional.
 * @param {Progress} progress The progress so far.
 * @param {number} stepCount How many steps the recipe has.
 * @returns {number} From 0 to 100.
 */
const questPercent = (progress: Progress, stepCount: number): number =>
{
  if (stepCount === 0)
  {
    return 0;
  }
  return Math.round((progress.steps.length / stepCount) * 100);
};

/**
 * The tracker's small top line, saying where the quest stands, with a count of the ingredients gathered
 * once any are.
 * @param {Progress} progress The progress so far.
 * @param {number} stepCount How many steps the recipe has.
 * @param {number} ingredientCount How many ingredients it has.
 * @returns {string} The line.
 */
const questLabel = (progress: Progress, stepCount: number, ingredientCount: number): string =>
{
  const gathered = progress.ingredients.length > 0 ? ` · ${progress.ingredients.length}/${ingredientCount} gathered` : '';
  if (isComplete(progress, stepCount))
  {
    return `Quest complete${gathered}`;
  }
  if (isStarted(progress))
  {
    return `Step ${currentStep(progress, stepCount) + 1} of ${stepCount}${gathered}`;
  }
  return `New quest · ${ingredientCount} ingredients · ${stepCount} steps`;
};

/**
 * The tracker's main line: the next step's lead once cooking has started, and otherwise what to do.
 * @param {Progress} progress The progress so far.
 * @param {string[]} stepLeads Every step's lead, as the HTML the server rendered.
 * @returns {string} The line, as HTML.
 */
const questDetail = (progress: Progress, stepLeads: string[]): string =>
{
  if (isComplete(progress, stepLeads.length))
  {
    return 'Every step done. Dig in!';
  }
  if (isStarted(progress))
  {
    return stepLeads[currentStep(progress, stepLeads.length)];
  }
  return 'Tap ingredients and steps to check them off.';
};

/**
 * What the start-over button says: an invitation once the recipe is done, and a question while it waits for
 * the second tap that confirms it.
 * @param {boolean} isFinished Whether every step is done.
 * @param {boolean} isArmed Whether it's waiting for a second tap.
 * @returns {string} The button's words.
 */
const restartLabel = (isFinished: boolean, isArmed: boolean): string =>
{
  if (isFinished)
  {
    return 'Cook it again';
  }
  return isArmed ? 'Sure?' : 'Start over';
};

/**
 * What a timer's chip says where its clock goes: "Done!" once it rings, "Stop?" while it waits for the
 * second tap that stops it, and otherwise the time left.
 * @param {Timer} timer The timer.
 * @param {number} now The time, in milliseconds since 1970.
 * @param {boolean} isArmed Whether it's waiting for a second tap.
 * @returns {string} The words on the chip.
 */
const timerChipText = (timer: Timer, now: number, isArmed: boolean): string =>
{
  if (isRinging(timer, now))
  {
    return 'Done!';
  }
  return isArmed ? 'Stop?' : formatClock(secondsLeft(timer, now));
};

export { countIngredients, isCooking, questDetail, questLabel, questPercent, restartLabel, timerChipText };
