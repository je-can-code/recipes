import { describe, expect, it } from 'vitest';
import {
  byUrgency,
  formatClock,
  isRinging,
  loadTimers,
  saveTimers,
  secondsLeft,
  startTimer,
  stopTimer,
} from '../../src/services/timers';
import type { Timer } from '../../src/services/timers';
import { hour, lockedStorage, memoryStorage, noon } from '../helpers/storage';

/**
 * A timer for the tests, ending at the given moment.
 * @param {string} id The timer's id.
 * @param {number} endsAt When it goes off.
 * @returns {Timer} The timer.
 */
const timerEnding = (id: string, endsAt: number): Timer =>
{
  return { id, slug: 'test-stew', title: 'Test Stew', name: 'Simmer the vegetables.', label: '8 to 10 minutes', endsAt };
};

/*
 * startTimer and stopTimer owe the tracker exactly the timers a cook asked for: a new one alongside the
 * ones already running, and a stopped one gone without taking a neighbor with it.
 */
describe('startTimer', () =>
{
  it('adds a timer that ends after its seconds, keeping the ones already running', () =>
  {
    // Arrange.
    const running = [ timerEnding('earlier', noon + hour) ];

    // Act.
    const timers = startTimer(running, { slug: 'test-mochi', title: 'Test Mochi' }, 'Boil the mochi.', '3 to 5 minutes', 180, noon);

    // Assert.
    expect(timers)
      .toEqual([
        timerEnding('earlier', noon + hour),
        { id: `${noon}-1`, slug: 'test-mochi', title: 'Test Mochi', name: 'Boil the mochi.', label: '3 to 5 minutes', endsAt: noon + 180000 },
      ]);
  });
});

describe('stopTimer', () =>
{
  it('takes away the one timer, leaving the rest', () =>
  {
    // Arrange.
    const timers = [ timerEnding('soup', noon), timerEnding('mochi', noon) ];

    // Act.
    const left = stopTimer(timers, 'soup');

    // Assert.
    expect(left)
      .toEqual([ timerEnding('mochi', noon) ]);
  });
});

/*
 * byUrgency owes a narrow screen its most urgent timer up front: whatever rang first, then whatever rings
 * next, never the order they happened to be started in.
 */
describe('byUrgency', () =>
{
  it('puts the rung timer first, then the rest by when they ring', () =>
  {
    // Arrange- started soup, then rice, then mochi; the mochi has already rung.
    const timers = [ timerEnding('soup', noon + 9000), timerEnding('rice', noon + 2000), timerEnding('mochi', noon - 5000) ];

    // Act.
    const ordered = byUrgency(timers);

    // Assert.
    expect(ordered.map((timer) => timer.id))
      .toEqual([ 'mochi', 'rice', 'soup' ]);
  });

  it('leaves the list it was given in its own order', () =>
  {
    // Arrange.
    const timers = [ timerEnding('soup', noon + 9000), timerEnding('mochi', noon - 5000) ];

    // Act.
    byUrgency(timers);

    // Assert.
    expect(timers.map((timer) => timer.id))
      .toEqual([ 'soup', 'mochi' ]);
  });
});

/*
 * secondsLeft and isRinging owe the clock an honest count: never 0:00 while time is left, never below
 * zero after, and ringing from the very moment the timer ends.
 */
describe('secondsLeft', () =>
{
  it('rounds a part of a second up', () =>
  {
    // Arrange.
    const timer = timerEnding('soup', noon + 4001);

    // Act.
    const left = secondsLeft(timer, noon);

    // Assert.
    expect(left)
      .toBe(5);
  });

  it('stops at zero once the timer has ended', () =>
  {
    // Arrange.
    const timer = timerEnding('soup', noon - 9000);

    // Act.
    const left = secondsLeft(timer, noon);

    // Assert.
    expect(left)
      .toBe(0);
  });
});

describe('isRinging', () =>
{
  it('rings from the moment the timer ends', () =>
  {
    // Arrange.
    const timer = timerEnding('soup', noon);

    // Act.
    const ringing = isRinging(timer, noon);

    // Assert.
    expect(ringing)
      .toBe(true);
  });

  it('is quiet a moment before', () =>
  {
    // Arrange.
    const timer = timerEnding('soup', noon + 1);

    // Act.
    const ringing = isRinging(timer, noon);

    // Assert.
    expect(ringing)
      .toBe(false);
  });
});

/*
 * formatClock owes the chip the time the way a kitchen timer shows it, minutes and padded seconds, adding
 * hours only once there are some.
 */
describe('formatClock', () =>
{
  it('writes minutes and padded seconds under an hour', () =>
  {
    // Arrange.
    const seconds = [ 5, 299, 3599 ];

    // Act.
    const clocks = seconds.map(formatClock);

    // Assert.
    expect(clocks)
      .toEqual([ '0:05', '4:59', '59:59' ]);
  });

  it('adds hours from an hour up, padding the minutes', () =>
  {
    // Arrange.
    const seconds = [ 3600, 3723 ];

    // Act.
    const clocks = seconds.map(formatClock);

    // Assert.
    expect(clocks)
      .toEqual([ '1:00:00', '1:02:03' ]);
  });
});

/*
 * loadTimers owes a cook who left the page the timers they left running on any recipe, and the ones that rang
 * while they were gone, but not one that rang so long ago it's no news anymore. Anything unreadable is no
 * timers, never a broken page.
 */
describe('loadTimers', () =>
{
  it('finds no timers when none are saved', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([]);
  });

  it('keeps running timers and ones that rang within the hour, forgetting older ones', () =>
  {
    // Arrange.
    const running = timerEnding('running', noon + 60000);
    const recent = timerEnding('recent', noon - hour);
    const old = timerEnding('old', noon - hour - 1);
    const storage = memoryStorage({ 'recipes.timers': JSON.stringify([ running, recent, old ]) });

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([ running, recent ]);
  });

  it('forgets a timer that names no recipe, since its chip would lead nowhere', () =>
  {
    // Arrange- a near-miss beside it that does name one, and has to survive.
    const nameless = { id: 'nameless', name: 'Simmer.', label: '5 minutes', endsAt: noon + 60000 };
    const storage = memoryStorage({ 'recipes.timers': JSON.stringify([ nameless, timerEnding('named', noon + 60000) ]) });

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([ timerEnding('named', noon + 60000) ]);
  });

  it('finds no timers when what\'s saved isn\'t a list', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.timers': JSON.stringify({ endsAt: noon }) });

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([]);
  });

  it('finds no timers when what\'s saved isn\'t JSON', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.timers': '[ not json' });

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([]);
  });

  it('finds no timers when the browser won\'t open storage', () =>
  {
    // Arrange.
    const storage = lockedStorage();

    // Act.
    const timers = loadTimers(storage, noon);

    // Assert.
    expect(timers)
      .toEqual([]);
    expect(storage.attempts)
      .toEqual([ 'getItem' ]);
  });
});

/*
 * saveTimers owes the next visit every timer this one left running, on any recipe, and owes the site no
 * entry at all once none are left.
 */
describe('saveTimers', () =>
{
  it('saves the timers', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    saveTimers(storage,[ timerEnding('soup', noon) ]);

    // Assert.
    expect(JSON.parse(storage.items.get('recipes.timers') ?? 'null'))
      .toEqual([ timerEnding('soup', noon) ]);
  });

  it('removes the entry once no timers are left, leaving everything else', () =>
  {
    // Arrange.
    const storage = memoryStorage({
      'recipes.timers': JSON.stringify([ timerEnding('soup', noon) ]),
      'recipes.progress.test-stew': '{}',
    });

    // Act.
    saveTimers(storage, []);

    // Assert.
    expect([ ...storage.items.keys() ])
      .toEqual([ 'recipes.progress.test-stew' ]);
  });

  it('carries on when the browser won\'t write to storage', () =>
  {
    // Arrange.
    const storage = lockedStorage();

    // Act.
    saveTimers(storage,[ timerEnding('soup', noon) ]);

    // Assert- it tried, and the refusal stopped there.
    expect(storage.attempts)
      .toEqual([ 'setItem' ]);
  });
});
