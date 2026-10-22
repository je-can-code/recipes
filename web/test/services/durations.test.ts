import { describe, expect, it } from 'vitest';
import { addTimers, findDurations, withTimers } from '../../src/services/durations';
import type { RecipeDetail } from '../../src/types';

/*
 * findDurations owes the method every length of time a cook would want a timer for, and none of the
 * amounts that only look like one. A missing timer costs a burnt pan; a timer on "4 cups" teaches everyone
 * to ignore the buttons. Ranges run to their low end, which is when to go and check.
 */
describe('findDurations', () =>
{
  it('finds minutes, with where the phrase sits and how long it runs', () =>
  {
    // Arrange.
    const text = 'Simmer for 5 minutes.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found)
      .toEqual([ { start: 11, end: 20, label: '5 minutes', seconds: 300 } ]);
  });

  it('runs a range to its low end', () =>
  {
    // Arrange.
    const text = 'Cook for 5 to 6 minutes, until golden.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found)
      .toEqual([ { start: 9, end: 23, label: '5 to 6 minutes', seconds: 300 } ]);
  });

  it('reads ranges written with "or" and with a hyphen', () =>
  {
    // Arrange.
    const text = 'Rest 5 or 6 minutes, then bake 2-3 minutes more.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => [ duration.label, duration.seconds ]))
      .toEqual([ [ '5 or 6 minutes', 300 ], [ '2-3 minutes', 120 ] ]);
  });

  it('finds seconds and hours', () =>
  {
    // Arrange.
    const text = 'Steep for 30 seconds. Marinate for 2 to 8 hours.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => [ duration.label, duration.seconds ]))
      .toEqual([ [ '30 seconds', 30 ], [ '2 to 8 hours', 7200 ] ]);
  });

  it('reads hours and minutes together as one timer, not two', () =>
  {
    // Arrange.
    const text = 'Braise for 1 hour 15 minutes, or 2 hours and 30 minutes for a bigger cut.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => [ duration.label, duration.seconds ]))
      .toEqual([ [ '1 hour 15 minutes', 4500 ], [ '2 hours and 30 minutes', 9000 ] ]);
  });

  it('reads "a minute" and "an hour" as one of each', () =>
  {
    // Arrange.
    const text = 'Let it bubble for about a minute, then rest an hour.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => [ duration.label, duration.seconds ]))
      .toEqual([ [ 'a minute', 60 ], [ 'an hour', 3600 ] ]);
  });

  it('reads fractions of an hour', () =>
  {
    // Arrange.
    const text = 'Roast for 1 1/2 hours, or 1/2 hour for the small one.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => [ duration.label, duration.seconds ]))
      .toEqual([ [ '1 1/2 hours', 5400 ], [ '1/2 hour', 1800 ] ]);
  });

  it('ignores capitals', () =>
  {
    // Arrange.
    const text = 'Rest 5 Minutes.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found.map((duration) => duration.seconds))
      .toEqual([ 300 ]);
  });

  it('leaves amounts of anything but time alone, and "a few minutes" too', () =>
  {
    // Arrange.
    const text = 'Heat to 160°F, open a 10 oz jar, cut 1 inch pieces, add 4 cups of water and wait a few minutes.';

    // Act.
    const found = findDurations(text);

    // Assert.
    expect(found)
      .toEqual([]);
  });
});

/*
 * addTimers owes the page a button on every time in a piece of server HTML, and owes the HTML nothing else:
 * tags stay exactly as they were, and text inside a link or a button stays plain, since a button can't sit
 * inside either.
 */
describe('addTimers', () =>
{
  it('wraps a time in a timer button that knows its seconds', () =>
  {
    // Arrange.
    const html = '<p>Simmer for 5 minutes.</p>';

    // Act.
    const timed = addTimers(html);

    // Assert.
    expect(timed)
      .toBe('<p>Simmer for <button type="button" class="timer" data-seconds="300">5 minutes</button>.</p>');
  });

  it('wraps a time inside formatting', () =>
  {
    // Arrange.
    const html = 'then <strong>rest 2 minutes</strong>';

    // Act.
    const timed = addTimers(html);

    // Assert.
    expect(timed)
      .toBe('then <strong>rest <button type="button" class="timer" data-seconds="120">2 minutes</button></strong>');
  });

  it('leaves a link\'s text alone, and wraps the time after it', () =>
  {
    // Arrange.
    const html = '<a href="/recipes/rest">rest 5 minutes</a> then wait 2 minutes';

    // Act.
    const timed = addTimers(html);

    // Assert.
    expect(timed)
      .toBe('<a href="/recipes/rest">rest 5 minutes</a> then wait <button type="button" class="timer" data-seconds="120">2 minutes</button>');
  });

  it('never touches a time inside a tag', () =>
  {
    // Arrange.
    const html = '<span title="5 minutes">wait 2 minutes</span>';

    // Act.
    const timed = addTimers(html);

    // Assert.
    expect(timed)
      .toBe('<span title="5 minutes">wait <button type="button" class="timer" data-seconds="120">2 minutes</button></span>');
  });

  it('returns HTML with no times exactly as it came', () =>
  {
    // Arrange.
    const html = '<p>Salt to taste, and serve with <em>4 cups</em> of rice.</p>';

    // Act.
    const timed = addTimers(html);

    // Assert.
    expect(timed)
      .toBe('<p>Salt to taste, and serve with <em>4 cups</em> of rice.</p>');
  });
});

/**
 * A recipe with a time in every field, so a test can see which ones gained a timer.
 * @returns {RecipeDetail} The recipe.
 */
const timelyRecipe = (): RecipeDetail =>
{
  return {
    slug: 'test-stew',
    title: 'Test Stew',
    folder: '',
    tags: [],
    serves: '2',
    makes: '',
    time: 'about 1 hour',
    revision: 'test-stew-1',
    intro: '<p>Ready in 30 minutes.</p>',
    scales: false,
    ingredients: [ { name: '', items: [ 'Beef soaked for 5 minutes' ], keys: [ '' ], after: '<p>Rinse it for 1 minute.</p>' } ],
    method: {
      before: '<p>Start 2 hours ahead.</p>',
      steps: [ { lead: 'Rest 3 minutes.', text: 'Let it rest 3 minutes.' } ],
      after: '<p>Keeps 4 hours.</p>',
    },
    notes: [ { lead: 'Simmer 6 minutes', text: 'longer for 6 minutes.' } ],
  };
};

/*
 * withTimers owes the method and notes their timer buttons, and owes everything else the server's HTML as
 * it was: leads, the intro and the ingredients describe a dish, they don't ask anyone to wait.
 */
describe('withTimers', () =>
{
  it('adds timers to the method and the notes', () =>
  {
    // Arrange.
    const recipe = timelyRecipe();

    // Act.
    const timed = withTimers(recipe);

    // Assert.
    expect([ timed.method.before, timed.method.steps[0].text, timed.method.after, timed.notes[0].text ])
      .toEqual([
        '<p>Start <button type="button" class="timer" data-seconds="7200">2 hours</button> ahead.</p>',
        'Let it rest <button type="button" class="timer" data-seconds="180">3 minutes</button>.',
        '<p>Keeps <button type="button" class="timer" data-seconds="14400">4 hours</button>.</p>',
        'longer for <button type="button" class="timer" data-seconds="360">6 minutes</button>.',
      ]);
  });

  it('leaves the leads, the intro and the ingredients alone', () =>
  {
    // Arrange.
    const recipe = timelyRecipe();

    // Act.
    const timed = withTimers(recipe);

    // Assert.
    expect([ timed.method.steps[0].lead, timed.notes[0].lead, timed.intro, timed.ingredients ])
      .toEqual([
        'Rest 3 minutes.',
        'Simmer 6 minutes',
        '<p>Ready in 30 minutes.</p>',
        [ { name: '', items: [ 'Beef soaked for 5 minutes' ], keys: [ '' ], after: '<p>Rinse it for 1 minute.</p>' } ],
      ]);
  });
});
