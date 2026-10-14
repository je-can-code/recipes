import type { RecipeDetail, RecipeEntry } from '../types';

/**
 * One length of time found in a recipe's text, like "5 to 6 minutes". Start and end are where the phrase
 * sits in the text, end being one past its last character. Seconds is how long a timer for it runs: the
 * low end of a range, since that's when to go and check.
 */
interface Duration
{
  start: number;
  end: number;
  label: string;
  seconds: number;
}

/**
 * A number the way the cards write one: 5, 1.5, 1/2 or 1 1/2. The mixed fraction comes first, so "1 1/2"
 * isn't read as a 1 with a stray half after it.
 */
const amount = String.raw`\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?`;

/**
 * Every way the cards write a length of time, longest first, so "1 hour 15 minutes" becomes one timer
 * rather than two:
 *
 *   1 hour 15 minutes, 2 hours and 30 minutes     (groups 1 and 2: hours, then minutes)
 *   5 minutes, 5 to 6 minutes, 30 or 40 seconds   (group 3: the low end, group 4: the unit)
 *   a minute, an hour                             (group 5: the unit)
 *
 * "a few minutes" says no number, so it's left alone, and so are amounts of anything else: 160°F, a 10 oz
 * jar, 1 inch and 4 cups.
 */
const durationPattern = new RegExp(
  [
    String.raw`\b(${amount})\s+hours?\s+(?:and\s+)?(${amount})\s+minutes?\b`,
    String.raw`\b(${amount})(?:\s*(?:to|or|-)\s*(?:${amount}))?\s+(seconds?|minutes?|hours?)\b`,
    String.raw`\ban?\s+(minute|hour)\b`,
  ].join('|'),
  'gi',
);

/**
 * How many seconds each unit holds, by its singular name.
 */
const secondsPer: Record<string, number> = { second: 1, minute: 60, hour: 3600 };

/**
 * Finds every length of time in a piece of plain text.
 * @param {string} text The text to search.
 * @returns {Duration[]} Each length of time, in the order it appears.
 */
const findDurations = (text: string): Duration[] =>
{
  return [ ...text.matchAll(durationPattern) ].map((match) =>
  {
    const [ label, hours, minutes, low, unit, singleUnit ] = match;
    const start = match.index;
    return { start, end: start + label.length, label, seconds: toSeconds(hours, minutes, low, unit, singleUnit) };
  });
};

/**
 * Works out a match's length in seconds from whichever of the pattern's three shapes it matched; the
 * groups of the other two arrive undefined.
 * @param {string | undefined} hours The hours of an hours-and-minutes phrase.
 * @param {string | undefined} minutes The minutes of an hours-and-minutes phrase.
 * @param {string | undefined} low The amount, or the low end of a range, of a plain phrase.
 * @param {string | undefined} unit The unit of a plain phrase.
 * @param {string | undefined} singleUnit The unit of "a minute" or "an hour".
 * @returns {number} The length in whole seconds.
 */
const toSeconds = (
  hours: string | undefined,
  minutes: string | undefined,
  low: string | undefined,
  unit: string | undefined,
  singleUnit: string | undefined,
): number =>
{
  if (hours !== undefined && minutes !== undefined)
  {
    return Math.round(toNumber(hours) * 3600 + toNumber(minutes) * 60);
  }
  if (low !== undefined && unit !== undefined)
  {
    return Math.round(toNumber(low) * secondsPer[singular(unit)]);
  }
  return secondsPer[singular(singleUnit ?? '')];
};

/**
 * Turns a written amount into a number: "1 1/2" is 1.5, "1/2" is 0.5 and "5" is 5.
 * @param {string} written The amount as written.
 * @returns {number} Its value.
 */
const toNumber = (written: string): number =>
{
  return written
    .trim()
    .split(/\s+/)
    .reduce((total, part) =>
    {
      const [ top, bottom ] = part.split('/');
      return total + (bottom === undefined ? Number(top) : Number(top) / Number(bottom));
    }, 0);
};

/**
 * A unit's singular, lowercase name, which is how secondsPer knows it.
 * @param {string} unit The unit as written, like "Minutes".
 * @returns {string} Its singular name, like "minute".
 */
const singular = (unit: string): string =>
{
  return unit.toLowerCase().replace(/s$/, '');
};

/**
 * Turns every length of time in a piece of server-rendered HTML into a button that starts a timer for it.
 * Only the text between tags changes, never a tag. Text inside a link or a button is left alone, since a
 * button can't sit inside either. The text arrives already escaped, and a length of time is only digits,
 * letters and spaces, so it goes back in exactly as it came.
 * @param {string} html The HTML, like a step's text.
 * @returns {string} The same HTML, with a timer button around each length of time.
 */
const addTimers = (html: string): string =>
{
  let isInsideControl = false;
  return html
    .split(/(<[^>]+>)/)
    .map((chunk) =>
    {
      if (chunk.startsWith('<'))
      {
        if (/^<(a|button)\b/i.test(chunk))
        {
          isInsideControl = true;
        }
        else if (/^<\/(a|button)>/i.test(chunk))
        {
          isInsideControl = false;
        }
        return chunk;
      }
      return isInsideControl ? chunk : wrapDurations(chunk);
    })
    .join('');
};

/**
 * Wraps each length of time in one piece of text in a timer button.
 * @param {string} text Text from between two tags.
 * @returns {string} The text, with each length of time wrapped.
 */
const wrapDurations = (text: string): string =>
{
  const durations = findDurations(text);
  let wrapped = '';
  let from = 0;
  durations.forEach((duration) =>
  {
    wrapped += text.slice(from, duration.start);
    wrapped += `<button type="button" class="timer" data-seconds="${duration.seconds}">${duration.label}</button>`;
    from = duration.end;
  });
  return wrapped + text.slice(from);
};

/**
 * A copy of a recipe with a timer button on every length of time in its method and notes. Ingredients and
 * the intro are left alone, since "ready in 30 minutes" in an intro describes the dish rather than asking
 * anyone to wait.
 * @param {RecipeDetail} recipe The recipe, as the server sent it.
 * @returns {RecipeDetail} The same recipe, with timers.
 */
const withTimers = (recipe: RecipeDetail): RecipeDetail =>
{
  /**
   * Adds timers to a step or a note, leaving its lead alone.
   * @param {RecipeEntry} entry The step or note.
   * @returns {RecipeEntry} The same entry, with timers in its text.
   */
  const timeEntry = (entry: RecipeEntry): RecipeEntry =>
  {
    return { ...entry, text: addTimers(entry.text) };
  };

  return {
    ...recipe,
    method: {
      before: addTimers(recipe.method.before),
      steps: recipe.method.steps.map(timeEntry),
      after: addTimers(recipe.method.after),
    },
    notes: recipe.notes.map(timeEntry),
  };
};

export { addTimers, findDurations, withTimers };
export type { Duration };
