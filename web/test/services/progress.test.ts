import { describe, expect, it } from 'vitest';
import {
  currentStep,
  emptyProgress,
  isComplete,
  isStarted,
  loadProgress,
  saveProgress,
  toggleIngredient,
  toggleStep,
} from '../../src/services/progress';
import { hour, lockedStorage, memoryStorage, noon } from '../helpers/storage';

/*
 * The toggles owe a cook exactly the checkmark they tapped, and no other: tapping one ingredient or step
 * must never tick or untick its neighbor.
 */
describe('toggleIngredient', () =>
{
  it('checks an unchecked ingredient, keeping the ones already checked', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-1' ], steps: [ 2 ] };

    // Act.
    const next = toggleIngredient(progress, '0-2');

    // Assert.
    expect(next)
      .toEqual({ ingredients: [ '0-1', '0-2' ], steps: [ 2 ] });
  });

  it('unchecks a checked ingredient, leaving its neighbor checked', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-1', '0-2' ], steps: [] };

    // Act.
    const next = toggleIngredient(progress, '0-1');

    // Assert.
    expect(next)
      .toEqual({ ingredients: [ '0-2' ], steps: [] });
  });
});

describe('toggleStep', () =>
{
  it('marks a step done, keeping the steps already done', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '1-0' ], steps: [ 0 ] };

    // Act.
    const next = toggleStep(progress, 1);

    // Assert.
    expect(next)
      .toEqual({ ingredients: [ '1-0' ], steps: [ 0, 1 ] });
  });

  it('marks a done step not done, leaving its neighbor done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 1 ] };

    // Act.
    const next = toggleStep(progress, 0);

    // Assert.
    expect(next)
      .toEqual({ ingredients: [], steps: [ 1 ] });
  });
});

/*
 * currentStep owes the tracker and the highlight the step to do next, which is the first one not done,
 * even when a cook has skipped ahead.
 */
describe('currentStep', () =>
{
  it('is the first step when nothing is done', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const current = currentStep(progress, 4);

    // Assert.
    expect(current)
      .toBe(0);
  });

  it('is the first step left undone, even with later steps done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 2 ] };

    // Act.
    const current = currentStep(progress, 4);

    // Assert.
    expect(current)
      .toBe(1);
  });

  it('is -1 once every step is done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 2, 0, 1 ] };

    // Act.
    const current = currentStep(progress, 3);

    // Assert.
    expect(current)
      .toBe(-1);
  });
});

/*
 * isComplete owes the party one honest answer: every step done. One step short is not done, and a recipe
 * with no steps has nothing to finish.
 */
describe('isComplete', () =>
{
  it('is true when every step is done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 1, 2 ] };

    // Act.
    const complete = isComplete(progress, 3);

    // Assert.
    expect(complete)
      .toBe(true);
  });

  it('is false with one step left', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0' ], steps: [ 0, 1 ] };

    // Act.
    const complete = isComplete(progress, 3);

    // Assert.
    expect(complete)
      .toBe(false);
  });

  it('is false for a recipe with no steps', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const complete = isComplete(progress, 0);

    // Assert.
    expect(complete)
      .toBe(false);
  });
});

describe('isStarted', () =>
{
  it('is false with nothing checked', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const started = isStarted(progress);

    // Assert.
    expect(started)
      .toBe(false);
  });

  it('is true with only an ingredient checked', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0' ], steps: [] };

    // Act.
    const started = isStarted(progress);

    // Assert.
    expect(started)
      .toBe(true);
  });

  it('is true with only a step done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 3 ] };

    // Act.
    const started = isStarted(progress);

    // Assert.
    expect(started)
      .toBe(true);
  });
});

/*
 * loadProgress owes a cook their place in a recipe from earlier today, and a clean slate for anything
 * else: nothing saved, saved too long ago, or saved in a shape it can't trust. Storage the browser won't
 * open is just a clean slate too, never a broken page.
 */
describe('loadProgress', () =>
{
  it('starts fresh when nothing is saved', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [], steps: [] });
  });

  it('returns progress saved earlier today, and not another recipe\'s', () =>
  {
    // Arrange.
    const storage = memoryStorage({
      'recipes.progress.test-stew': JSON.stringify({ ingredients: [ '0-1' ], steps: [ 0 ], savedAt: noon - 3 * hour }),
      'recipes.progress.test-soup': JSON.stringify({ ingredients: [ '9-9' ], steps: [ 9 ], savedAt: noon }),
    });

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [ '0-1' ], steps: [ 0 ] });
  });

  it('forgets progress older than a day', () =>
  {
    // Arrange.
    const storage = memoryStorage({
      'recipes.progress.test-stew': JSON.stringify({ ingredients: [ '0-1' ], steps: [ 0 ], savedAt: noon - 25 * hour }),
    });

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [], steps: [] });
    expect(storage.items.has('recipes.progress.test-stew'))
      .toBe(false);
  });

  it('forgets progress saved in a shape it doesn\'t know', () =>
  {
    // Arrange.
    const storage = memoryStorage({
      'recipes.progress.test-stew': JSON.stringify({ ingredients: '0-1', steps: [ 0 ], savedAt: noon }),
    });

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [], steps: [] });
    expect(storage.items.has('recipes.progress.test-stew'))
      .toBe(false);
  });

  it('starts fresh when what\'s saved isn\'t JSON', () =>
  {
    // Arrange.
    const storage = memoryStorage({ 'recipes.progress.test-stew': '{ not json' });

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [], steps: [] });
  });

  it('starts fresh when the browser won\'t open storage', () =>
  {
    // Arrange.
    const storage = lockedStorage();

    // Act.
    const progress = loadProgress(storage, 'test-stew', noon);

    // Assert.
    expect(progress)
      .toEqual({ ingredients: [], steps: [] });
    expect(storage.attempts)
      .toEqual([ 'getItem' ]);
  });
});

/*
 * saveProgress owes the next visit an exact copy of this one's checkmarks, stamped so they can go stale,
 * and owes a recipe with nothing checked no entry at all.
 */
describe('saveProgress', () =>
{
  it('saves progress with the time it was saved', () =>
  {
    // Arrange.
    const storage = memoryStorage();

    // Act.
    saveProgress(storage, 'test-stew', { ingredients: [ '0-1' ], steps: [ 0, 2 ] }, noon);

    // Assert.
    expect(JSON.parse(storage.items.get('recipes.progress.test-stew') ?? 'null'))
      .toEqual({ ingredients: [ '0-1' ], steps: [ 0, 2 ], savedAt: noon });
  });

  it('removes the entry once nothing is checked, leaving other recipes\' entries', () =>
  {
    // Arrange.
    const storage = memoryStorage({
      'recipes.progress.test-stew': JSON.stringify({ ingredients: [ '0-1' ], steps: [], savedAt: noon }),
      'recipes.progress.test-soup': JSON.stringify({ ingredients: [ '0-1' ], steps: [], savedAt: noon }),
    });

    // Act.
    saveProgress(storage, 'test-stew', emptyProgress(), noon);

    // Assert.
    expect([ ...storage.items.keys() ])
      .toEqual([ 'recipes.progress.test-soup' ]);
  });

  it('carries on when the browser won\'t write to storage', () =>
  {
    // Arrange.
    const storage = lockedStorage();

    // Act.
    saveProgress(storage, 'test-stew', { ingredients: [], steps: [ 0 ] }, noon);

    // Assert- it tried, and the refusal stopped there.
    expect(storage.attempts)
      .toEqual([ 'setItem' ]);
  });
});
