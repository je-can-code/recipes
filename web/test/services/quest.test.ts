import { describe, expect, it } from 'vitest';
import {
  countIngredients,
  isCooking,
  questDetail,
  questLabel,
  questPercent,
  restartLabel,
  timerChipLines,
  timerChipText,
} from '../../src/services/quest';
import { emptyProgress } from '../../src/services/progress';
import { noon } from '../helpers/storage';

/**
 * Four steps' leads, the way the server renders them.
 */
const leads = [ 'Soak the kombu.', 'Cut the vegetables.', 'Heat the broth <em>gently</em>.', 'Season.' ];

/*
 * countIngredients owes the tracker the size of the shopping list, across every group.
 */
describe('countIngredients', () =>
{
  it('counts every item in every group', () =>
  {
    // Arrange.
    const groups = [
      { name: 'Broth', items: [ 'water', 'kombu', 'bonito' ], keys: [ '', '', '' ], after: '' },
      { name: '', items: [], keys: [], after: '' },
      { name: 'Bowls', items: [ 'oysters', 'mochi' ], keys: [ '', '' ], after: '' },
    ];

    // Act.
    const count = countIngredients(groups);

    // Assert.
    expect(count)
      .toBe(5);
  });
});

/*
 * isCooking owes the screen-on lock its window: from the first checkmark to the last step, and not a
 * moment either side, so a finished recipe lets the phone sleep.
 */
describe('isCooking', () =>
{
  it('is false before anything is checked', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const cooking = isCooking(progress, 4);

    // Assert.
    expect(cooking)
      .toBe(false);
  });

  it('is true with steps still left', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0' ], steps: [ 0, 1, 2 ] };

    // Act.
    const cooking = isCooking(progress, 4);

    // Assert.
    expect(cooking)
      .toBe(true);
  });

  it('is false once every step is done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 1, 2, 3 ] };

    // Act.
    const cooking = isCooking(progress, 4);

    // Assert.
    expect(cooking)
      .toBe(false);
  });
});

/*
 * questPercent owes the bar its fill: the share of steps done, in whole percent, and an empty bar for a
 * recipe with no steps rather than a division by zero.
 */
describe('questPercent', () =>
{
  it('is the share of steps done, rounded', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0', '0-1' ], steps: [ 2 ] };

    // Act.
    const percent = questPercent(progress, 3);

    // Assert.
    expect(percent)
      .toBe(33);
  });

  it('is empty for a recipe with no steps', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0' ], steps: [] };

    // Act.
    const percent = questPercent(progress, 0);

    // Assert.
    expect(percent)
      .toBe(0);
  });
});

/*
 * questLabel and questDetail owe the tracker the quest's state in a glance: what's ahead before it starts,
 * the step number and its lead midway, and the win at the end. The gathered count shows up only once a
 * cook has started gathering.
 */
describe('questLabel', () =>
{
  it('sizes up a quest that hasn\'t started', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const label = questLabel(progress, 4, 12);

    // Assert.
    expect(label)
      .toBe('New quest · 12 ingredients · 4 steps');
  });

  it('names the next step once steps are done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 1 ] };

    // Act.
    const label = questLabel(progress, 4, 12);

    // Assert.
    expect(label)
      .toBe('Step 3 of 4');
  });

  it('counts the ingredients gathered once there are any', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0', '1-2', '1-3' ], steps: [] };

    // Act.
    const label = questLabel(progress, 4, 12);

    // Assert.
    expect(label)
      .toBe('Step 1 of 4 · 3/12 gathered');
  });

  it('calls the quest complete once every step is done', () =>
  {
    // Arrange.
    const progress = { ingredients: [ '0-0' ], steps: [ 0, 1, 2, 3 ] };

    // Act.
    const label = questLabel(progress, 4, 12);

    // Assert.
    expect(label)
      .toBe('Quest complete · 1/12 gathered');
  });
});

describe('questDetail', () =>
{
  it('says how to play before anything is checked', () =>
  {
    // Arrange.
    const progress = emptyProgress();

    // Act.
    const detail = questDetail(progress, leads);

    // Assert.
    expect(detail)
      .toBe('Tap ingredients and steps to check them off.');
  });

  it('shows the next step\'s lead, skipping the done ones', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 0, 1, 3 ] };

    // Act.
    const detail = questDetail(progress, leads);

    // Assert.
    expect(detail)
      .toBe('Heat the broth <em>gently</em>.');
  });

  it('cheers once every step is done', () =>
  {
    // Arrange.
    const progress = { ingredients: [], steps: [ 3, 2, 1, 0 ] };

    // Act.
    const detail = questDetail(progress, leads);

    // Assert.
    expect(detail)
      .toBe('Every step done. Dig in!');
  });
});

/*
 * restartLabel owes the button its words: an invitation once a recipe is done, and a question while a
 * first tap mid-cook waits for the second.
 */
describe('restartLabel', () =>
{
  it('invites another round once the recipe is done, armed or not', () =>
  {
    // Arrange.
    const states = [ [ true, false ], [ true, true ] ];

    // Act.
    const labels = states.map(([ isFinished, isArmed ]) => restartLabel(isFinished, isArmed));

    // Assert.
    expect(labels)
      .toEqual([ 'Cook it again', 'Cook it again' ]);
  });

  it('asks while it waits for a second tap', () =>
  {
    // Arrange.
    const isArmed = true;

    // Act.
    const label = restartLabel(false, isArmed);

    // Assert.
    expect(label)
      .toBe('Sure?');
  });

  it('offers to start over mid-cook', () =>
  {
    // Arrange.
    const isArmed = false;

    // Act.
    const label = restartLabel(false, isArmed);

    // Assert.
    expect(label)
      .toBe('Start over');
  });
});

/*
 * timerChipText owes the chip what matters most right now: that the timer is done, beating everything,
 * then the stop question, then the time left.
 */
describe('timerChipText', () =>
{
  it('says it\'s done once it rings, even while armed', () =>
  {
    // Arrange.
    const timer = { id: 'soup', slug: 'test-stew', title: 'Test Stew', name: 'Simmer.', label: '5 minutes', endsAt: noon };

    // Act.
    const text = timerChipText(timer, noon, true);

    // Assert.
    expect(text)
      .toBe('Done!');
  });

  it('asks before stopping a running timer', () =>
  {
    // Arrange.
    const timer = { id: 'soup', slug: 'test-stew', title: 'Test Stew', name: 'Simmer.', label: '5 minutes', endsAt: noon + 60000 };

    // Act.
    const text = timerChipText(timer, noon, true);

    // Assert.
    expect(text)
      .toBe('Stop?');
  });

  it('shows the time left', () =>
  {
    // Arrange.
    const timer = { id: 'soup', slug: 'test-stew', title: 'Test Stew', name: 'Simmer.', label: '5 minutes', endsAt: noon + 272500 };

    // Act.
    const text = timerChipText(timer, noon, false);

    // Assert.
    expect(text)
      .toBe('4:33');
  });
});

/*
 * timerChipLines owes a chip on its own recipe the step it's for, and owes a chip anywhere else the recipe
 * it came from as well, on a line of its own above the step.
 */
describe('timerChipLines', () =>
{
  it('names a timer by its step on its own recipe\'s page', () =>
  {
    // Arrange.
    const timer = { id: 'soup', slug: 'test-stew', title: 'Test Stew', name: 'Simmer.', label: '5 minutes', endsAt: noon };

    // Act.
    const lines = timerChipLines(timer, 'test-stew');

    // Assert.
    expect(lines)
      .toEqual([ 'Simmer.' ]);
  });

  it('puts the recipe\'s title on a line above anywhere else', () =>
  {
    // Arrange.
    const timer = { id: 'soup', slug: 'test-stew', title: 'Test Stew', name: 'Simmer.', label: '5 minutes', endsAt: noon };

    // Act.
    const lines = timerChipLines(timer, '');

    // Assert.
    expect(lines)
      .toEqual([ 'Test Stew', 'Simmer.' ]);
  });
});
