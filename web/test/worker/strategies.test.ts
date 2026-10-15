import { describe, expect, it } from 'vitest';
import {
  askDesktopFirst,
  copyFirst,
  notSavedYet,
  refreshEverything,
  refreshEveryRecipe,
} from '../../src/worker/strategies';
import {
  catalogOf,
  desktopAnswering,
  desktopAnsweringLater,
  origin,
  rig,
  unreachable,
} from '../helpers/caches';

/**
 * The full address of the catalog.
 */
const catalogAddress = `${origin}/api/recipes`;

/**
 * The full address of a recipe.
 * @param {string} slug The recipe's name.
 * @returns {string} Its address.
 */
const recipeAddress = (slug: string): string =>
{
  return `${origin}/api/recipes/${slug}`;
};

/*
 * askDesktopFirst owes every page, the catalog and every recipe the freshest answer there is: the
 * desktop's when it answers in time, saved for later, and the saved copy when it doesn't. Getting that
 * wrong either shows stale recipes at home, or a blank page away from it. Every test's clock reads 500000.
 */
describe('askDesktopFirst', () =>
{
  it('answers a recipe from the desktop, and saves it', async () =>
  {
    // Arrange- the recipes are due a refresh, which only a catalog may start.
    const { surroundings, recipes } = rig({
      desktop: desktopAnswering({ [recipeAddress('stew')]: [ 200, 'fresh stew' ] }),
      recipes: { [recipeAddress('stew')]: 'old stew' },
    });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('fresh stew');
    expect(recipes.bodies.get(recipeAddress('stew')))
      .toBe('fresh stew');
    expect(surroundings.desktop.refreshedAt)
      .toBe(0);
  });

  it('answers a page from the desktop without saving it', async () =>
  {
    // Arrange.
    const { surroundings, app, recipes } = rig({
      desktop: desktopAnswering({ [`${origin}/recipes/stew`]: [ 200, 'fresh page' ] }),
      app: { [`${origin}/`]: 'saved page' },
    });

    // Act.
    const response = await askDesktopFirst(new Request(`${origin}/recipes/stew`), 'page', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('fresh page');
    expect([ ...app.bodies.values(), ...recipes.bodies.values() ])
      .toEqual([ 'saved page' ]);
  });

  it('passes on a failed answer, keeping the copy it had', async () =>
  {
    // Arrange.
    const { surroundings, recipes } = rig({
      desktop: desktopAnswering({ [recipeAddress('stew')]: [ 500, '{"error":"Couldn\'t read the folder."}' ] }),
      recipes: { [recipeAddress('stew')]: 'old stew' },
    });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(response.status)
      .toBe(500);
    expect(recipes.bodies.get(recipeAddress('stew')))
      .toBe('old stew');
  });

  it('answers from the copy when the desktop can\'t be reached, and counts it away', async () =>
  {
    // Arrange- patience that never runs out proves the failure alone is enough to move on.
    const { surroundings } = rig({
      desktop: unreachable,
      recipes: { [recipeAddress('stew')]: 'old stew' },
      patience: 'lasts forever',
      now: 500000,
    });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('old stew');
    expect(surroundings.desktop.awayUntil)
      .toBe(800000);
  });

  it('answers any page from the saved app when the desktop takes too long', async () =>
  {
    // Arrange- a desktop that never answers, so only running out of patience can end the wait.
    const { surroundings } = rig({
      desktop: desktopAnsweringLater().desktop,
      app: { [`${origin}/`]: 'saved page' },
      patience: 'runs out',
      now: 500000,
    });

    // Act.
    const response = await askDesktopFirst(new Request(`${origin}/recipes/stew`), 'page', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('saved page');
    expect(surroundings.desktop.awayUntil)
      .toBe(800000);
  });

  it('still saves an answer that arrives too late, and counts the desktop back', async () =>
  {
    // Arrange.
    const later = desktopAnsweringLater();
    const { surroundings, recipes, kept } = rig({
      desktop: later.desktop,
      recipes: { [recipeAddress('stew')]: 'old stew' },
      patience: 'runs out',
    });
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Act.
    later.answer(new Response('fresh stew'));
    await Promise.all(kept);

    // Assert.
    expect(await response.text())
      .toBe('old stew');
    expect(recipes.bodies.get(recipeAddress('stew')))
      .toBe('fresh stew');
    expect(surroundings.desktop.awayUntil)
      .toBe(0);
  });

  it('answers from the copy at once while the desktop is away, still asking it', async () =>
  {
    // Arrange- neither the desktop nor the patience ever finishes, so only the copy can answer.
    const { surroundings, asked } = rig({
      desktop: desktopAnsweringLater().desktop,
      recipes: { [recipeAddress('stew')]: 'old stew' },
      awayUntil: 510000,
      patience: 'lasts forever',
      now: 500000,
    });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('old stew');
    expect(asked)
      .toEqual([ recipeAddress('stew') ]);
  });

  it('waits for the desktop while away when nothing is saved, and counts it back', async () =>
  {
    // Arrange.
    const { surroundings } = rig({
      desktop: desktopAnswering({ [recipeAddress('stew')]: [ 200, 'fresh stew' ] }),
      awayUntil: 510000,
      patience: 'lasts forever',
      now: 500000,
    });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(await response.text())
      .toBe('fresh stew');
    expect(surroundings.desktop.awayUntil)
      .toBe(0);
  });

  it('says a recipe isn\'t saved yet when there\'s neither desktop nor copy', async () =>
  {
    // Arrange.
    const { surroundings } = rig({ desktop: unreachable, patience: 'lasts forever' });

    // Act.
    const response = await askDesktopFirst(new Request(recipeAddress('stew')), 'recipe', surroundings);

    // Assert.
    expect(response.status)
      .toBe(503);
    expect(await response.json())
      .toEqual({ error: notSavedYet });
  });

  it('gives the browser\'s own error for a page with neither desktop nor copy', async () =>
  {
    // Arrange.
    const { surroundings } = rig({ desktop: unreachable, patience: 'lasts forever' });

    // Act.
    const response = await askDesktopFirst(new Request(`${origin}/recipes/stew`), 'page', surroundings);

    // Assert.
    expect(response.type)
      .toBe('error');
  });

  it('refreshes every recipe after a fresh catalog, when they\'re due', async () =>
  {
    // Arrange.
    const catalog = JSON.stringify(catalogOf([ 'stew', 'punch' ]));
    const { surroundings, recipes, kept } = rig({
      desktop: desktopAnswering({
        [catalogAddress]: [ 200, catalog ],
        [recipeAddress('stew')]: [ 200, 'fresh stew' ],
        [recipeAddress('punch')]: [ 200, 'fresh punch' ],
      }),
      refreshedAt: 400000,
      now: 500000,
    });

    // Act.
    await askDesktopFirst(new Request(catalogAddress), 'catalog', surroundings);
    await Promise.all(kept);

    // Assert.
    expect(Object.fromEntries(recipes.bodies))
      .toEqual({
        [catalogAddress]: catalog,
        [recipeAddress('stew')]: 'fresh stew',
        [recipeAddress('punch')]: 'fresh punch',
      });
    expect(surroundings.desktop.refreshedAt)
      .toBe(500000);
  });

  it('saves only the catalog when the recipes were refreshed a moment ago', async () =>
  {
    // Arrange.
    const catalog = JSON.stringify(catalogOf([ 'stew' ]));
    const { surroundings, asked, kept } = rig({
      desktop: desktopAnswering({ [catalogAddress]: [ 200, catalog ] }),
      refreshedAt: 499000,
      now: 500000,
    });

    // Act.
    await askDesktopFirst(new Request(catalogAddress), 'catalog', surroundings);
    await Promise.all(kept);

    // Assert.
    expect(asked)
      .toEqual([ catalogAddress ]);
    expect(surroundings.desktop.refreshedAt)
      .toBe(499000);
  });
});

/*
 * copyFirst owes the app its own files without a trip to the desktop, since a built file's name changes
 * with its contents, and the desktop's help only for a file the build never saved.
 */
describe('copyFirst', () =>
{
  it('answers a built file from the copy, without asking the desktop', async () =>
  {
    // Arrange.
    const { surroundings, asked } = rig({
      desktop: unreachable,
      app: { [`${origin}/assets/index-abc123.js`]: 'the app' },
    });

    // Act.
    const response = await copyFirst(new Request(`${origin}/assets/index-abc123.js`), surroundings);

    // Assert.
    expect(await response.text())
      .toBe('the app');
    expect(asked)
      .toEqual([]);
  });

  it('asks the desktop for a file the build didn\'t save', async () =>
  {
    // Arrange.
    const { surroundings } = rig({
      desktop: desktopAnswering({ [`${origin}/favicon.ico`]: [ 200, 'an icon' ] }),
    });

    // Act.
    const response = await copyFirst(new Request(`${origin}/favicon.ico`), surroundings);

    // Assert.
    expect(await response.text())
      .toBe('an icon');
  });
});

/*
 * refreshEveryRecipe owes the copy every listed recipe, fresh, and none of the deleted ones, without ever
 * forgetting a recipe because the desktop dropped out partway.
 */
describe('refreshEveryRecipe', () =>
{
  it('saves every listed recipe and forgets the ones no longer listed', async () =>
  {
    // Arrange.
    const { surroundings, recipes } = rig({
      desktop: desktopAnswering({
        [recipeAddress('stew')]: [ 200, 'fresh stew' ],
        [recipeAddress('punch')]: [ 200, 'fresh punch' ],
      }),
      recipes: {
        [catalogAddress]: 'the catalog',
        [recipeAddress('stew')]: 'old stew',
        [recipeAddress('old-soup')]: 'old soup',
      },
    });

    // Act.
    await refreshEveryRecipe(catalogOf([ 'stew', 'punch' ]), surroundings);

    // Assert.
    expect(Object.fromEntries(recipes.bodies))
      .toEqual({
        [catalogAddress]: 'the catalog',
        [recipeAddress('stew')]: 'fresh stew',
        [recipeAddress('punch')]: 'fresh punch',
      });
  });

  it('keeps the old copy of a recipe the desktop won\'t send', async () =>
  {
    // Arrange.
    const { surroundings, recipes } = rig({
      desktop: desktopAnswering({
        [recipeAddress('stew')]: [ 500, '{"error":"Couldn\'t read the folder."}' ],
        [recipeAddress('punch')]: [ 200, 'fresh punch' ],
      }),
      recipes: { [recipeAddress('stew')]: 'old stew' },
    });

    // Act.
    await refreshEveryRecipe(catalogOf([ 'stew', 'punch' ]), surroundings);

    // Assert.
    expect(Object.fromEntries(recipes.bodies))
      .toEqual({
        [recipeAddress('stew')]: 'old stew',
        [recipeAddress('punch')]: 'fresh punch',
      });
  });

  it('forgets nothing when the desktop drops out partway', async () =>
  {
    // Arrange.
    const { surroundings, recipes } = rig({
      desktop: unreachable,
      recipes: { [recipeAddress('old-soup')]: 'old soup' },
    });

    // Act.
    const refresh = refreshEveryRecipe(catalogOf([ 'stew' ]), surroundings);

    // Assert.
    await expect(refresh)
      .rejects.toThrow('Load failed');
    expect(Object.fromEntries(recipes.bodies))
      .toEqual({ [recipeAddress('old-soup')]: 'old soup' });
  });
});

/*
 * refreshEverything owes a new build a full copy of the cookbook straight away, so a device can leave
 * home right after its first visit, and owes the copy nothing when the desktop won't send a catalog.
 */
describe('refreshEverything', () =>
{
  it('saves the catalog and every recipe', async () =>
  {
    // Arrange.
    const catalog = JSON.stringify(catalogOf([ 'stew' ]));
    const { surroundings, recipes } = rig({
      desktop: desktopAnswering({
        [catalogAddress]: [ 200, catalog ],
        [recipeAddress('stew')]: [ 200, 'fresh stew' ],
      }),
      now: 500000,
    });

    // Act.
    await refreshEverything(surroundings);

    // Assert.
    expect(Object.fromEntries(recipes.bodies))
      .toEqual({ [catalogAddress]: catalog, [recipeAddress('stew')]: 'fresh stew' });
    expect(surroundings.desktop.refreshedAt)
      .toBe(500000);
  });

  it('saves nothing when the desktop won\'t send the catalog', async () =>
  {
    // Arrange.
    const { surroundings, recipes, asked } = rig({
      desktop: desktopAnswering({ [catalogAddress]: [ 500, '{"error":"Couldn\'t read the folder."}' ] }),
    });

    // Act.
    await refreshEverything(surroundings);

    // Assert.
    expect(asked)
      .toEqual([ catalogAddress ]);
    expect(recipes.bodies.size)
      .toBe(0);
  });
});
