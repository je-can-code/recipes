import type { BrowserStorage } from './storage';

/**
 * One kitchen timer. Slug and title are the recipe it belongs to, so its chip can say whose it is and lead
 * back there from any page. Name is what it's for, like a step's lead ("Simmer the vegetables."), and label
 * is the time as the recipe wrote it ("8 to 10 minutes"). It's kept as the moment it goes off rather than as
 * a countdown, so a phone that slept through it still knows exactly when it rang.
 */
interface Timer
{
  id: string;
  slug: string;
  title: string;
  name: string;
  label: string;
  endsAt: number;
}

/**
 * The recipe a timer is started from.
 */
interface TimerRecipe
{
  slug: string;
  title: string;
}

/**
 * How long a timer that has gone off is kept, waiting to be dismissed, before a visit forgets it.
 */
const forgetAfter = 60 * 60 * 1000;

/**
 * Starts a timer alongside any already running, from any recipe.
 * @param {Timer[]} timers The timers already running.
 * @param {TimerRecipe} recipe The recipe it's for.
 * @param {string} name What the timer is for.
 * @param {string} label The time as the recipe wrote it.
 * @param {number} seconds How long it runs.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {Timer[]} Every timer, with the new one last.
 */
const startTimer = (timers: Timer[], recipe: TimerRecipe, name: string, label: string, seconds: number, now: number): Timer[] =>
{
  const timer = { id: `${now}-${timers.length}`, slug: recipe.slug, title: recipe.title, name, label, endsAt: now + seconds * 1000 };
  return [ ...timers, timer ];
};

/**
 * Takes one timer away, whether it's running or ringing.
 * @param {Timer[]} timers Every timer.
 * @param {string} id The timer to take away.
 * @returns {Timer[]} The rest.
 */
const stopTimer = (timers: Timer[], id: string): Timer[] =>
{
  return timers.filter((timer) => timer.id !== id);
};

/**
 * Lines timers up by urgency: the one that rang first comes first, then the rest in the order they'll go
 * off. A narrow screen shows the start of the line, so whatever needs a cook soonest is never scrolled out
 * of sight.
 * @param {Timer[]} timers Every timer, in the order they were started.
 * @returns {Timer[]} The same timers, soonest first.
 */
const byUrgency = (timers: Timer[]): Timer[] =>
{
  return [ ...timers ].sort((first, second) => first.endsAt - second.endsAt);
};

/**
 * Whole seconds left on a timer, rounded up so it never shows 0:00 while there's still time on it.
 * @param {Timer} timer The timer.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {number} The seconds left, never below 0.
 */
const secondsLeft = (timer: Timer, now: number): number =>
{
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
};

/**
 * Whether a timer has gone off.
 * @param {Timer} timer The timer.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {boolean} True from the moment it ends.
 */
const isRinging = (timer: Timer, now: number): boolean =>
{
  return now >= timer.endsAt;
};

/**
 * Writes seconds the way a kitchen timer shows them: 4:05, or 1:02:03 past an hour.
 * @param {number} seconds Whole seconds.
 * @returns {string} The time on the clock.
 */
const formatClock = (seconds: number): string =>
{
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  if (hours > 0)
  {
    return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
  }
  return `${minutes}:${rest}`;
};

/**
 * The key every timer is saved under. There's one list for the whole site, so a timer keeps running, and
 * ringing, whichever page is open.
 */
const timersKey = 'recipes.timers';

/**
 * Reads the saved timers, so leaving a page, or the site, and coming back doesn't lose them. Timers that went
 * off more than an hour ago are forgotten, and so is anything unreadable, including a timer that doesn't say
 * which recipe it belongs to, since its chip would have nowhere to lead.
 * @param {BrowserStorage} storage Where timers are kept.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {Timer[]} The timers still worth showing.
 */
const loadTimers = (storage: BrowserStorage, now: number): Timer[] =>
{
  try
  {
    const saved = storage.getItem(timersKey);
    if (saved === null)
    {
      return [];
    }

    // this is the one place outside data comes in, so its shape is checked rather than trusted.
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) === false)
    {
      return [];
    }
    return parsed.filter((timer: Timer) =>
    {
      return typeof timer.endsAt === 'number' && typeof timer.slug === 'string' && now - timer.endsAt <= forgetAfter;
    });
  }
  catch
  {
    return [];
  }
};

/**
 * Saves every timer, removing the entry once none are left.
 * @param {BrowserStorage} storage Where timers are kept.
 * @param {Timer[]} timers Every timer.
 */
const saveTimers = (storage: BrowserStorage, timers: Timer[]): void =>
{
  try
  {
    if (timers.length === 0)
    {
      storage.removeItem(timersKey);
      return;
    }
    storage.setItem(timersKey, JSON.stringify(timers));
  }
  catch
  {
    // a full or locked storage loses nothing the page itself doesn't still hold.
  }
};

export { byUrgency, formatClock, isRinging, loadTimers, saveTimers, secondsLeft, startTimer, stopTimer };
export type { Timer, TimerRecipe };
