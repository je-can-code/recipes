import { describe, expect, it } from 'vitest';
import {
  appAddresses,
  changedPaths,
  entityTag,
  forgottenPaths,
  isAway,
  isOldAppCache,
  isRefreshDue,
  kindOf,
  recipePaths,
} from '../../src/worker/policy';
import { catalogOf, origin } from '../helpers/caches';

/*
 * kindOf owes the service worker the right answer for every request: the recipes and the app from its
 * copy when it has to, and everything else left alone. Taking on a request that isn't this site's, or a
 * write, would answer it with the wrong thing; missing a recipe would leave it unopenable away from home.
 */
describe('kindOf', () =>
{
  it('leaves anything but reading to the browser', () =>
  {
    // Arrange.
    const address = new URL('/api/recipes', origin);

    // Act.
    const kind = kindOf(address, origin, 'POST', 'cors');

    // Assert.
    expect(kind)
      .toBe('other');
  });

  it('leaves other websites to the browser', () =>
  {
    // Arrange.
    const address = new URL('https://example.com/api/recipes');

    // Act.
    const kind = kindOf(address, origin, 'GET', 'cors');

    // Assert.
    expect(kind)
      .toBe('other');
  });

  it('knows the catalog, even when it\'s opened as a page', () =>
  {
    // Arrange.
    const address = new URL('/api/recipes', origin);

    // Act.
    const kinds = [ kindOf(address, origin, 'GET', 'cors'), kindOf(address, origin, 'GET', 'navigate') ];

    // Assert.
    expect(kinds)
      .toEqual([ 'catalog', 'catalog' ]);
  });

  it('knows a recipe', () =>
  {
    // Arrange.
    const address = new URL('/api/recipes/chimichurri', origin);

    // Act.
    const kind = kindOf(address, origin, 'GET', 'cors');

    // Assert.
    expect(kind)
      .toBe('recipe');
  });

  it('leaves the rest of the API to the browser, near misses included', () =>
  {
    // Arrange- each of these is one character or one folder away from the catalog or a recipe.
    const paths = [ '/api/recipes/', '/api/recipesx', '/api/recipes/chimichurri/more', '/api/cards' ];

    // Act.
    const kinds = paths.map((path) => kindOf(new URL(path, origin), origin, 'GET', 'navigate'));

    // Assert.
    expect(kinds)
      .toEqual([ 'other', 'other', 'other', 'other' ]);
  });

  it('answers any page with the app', () =>
  {
    // Arrange.
    const address = new URL('/recipes/chimichurri', origin);

    // Act.
    const kind = kindOf(address, origin, 'GET', 'navigate');

    // Assert.
    expect(kind)
      .toBe('page');
  });

  it('counts everything else as one of the website\'s files', () =>
  {
    // Arrange.
    const address = new URL('/assets/index-abc123.js', origin);

    // Act.
    const kind = kindOf(address, origin, 'GET', 'cors');

    // Assert.
    expect(kind)
      .toBe('file');
  });
});

/*
 * recipePaths owes the refresh the same address the recipe page asks for, or the refresh saves recipes
 * under addresses nothing ever looks up.
 */
describe('recipePaths', () =>
{
  it('writes each recipe\'s address, escaping its name', () =>
  {
    // Arrange.
    const catalog = catalogOf([ 'chimichurri', 'a b' ]);

    // Act.
    const paths = recipePaths(catalog);

    // Assert.
    expect(paths)
      .toEqual([ '/api/recipes/chimichurri', '/api/recipes/a%20b' ]);
  });
});

/*
 * entityTag owes the refresh the exact form the desktop sends a revision in. Any other form makes every
 * saved recipe look changed, and every visit downloads the whole cookbook again.
 */
describe('entityTag', () =>
{
  it('writes a revision inside double quotes, the way the desktop sends an ETag', () =>
  {
    // Arrange.
    const revision = 'a1b2c3d4e5f6';

    // Act.
    const tag = entityTag(revision);

    // Assert.
    expect(tag)
      .toBe('"a1b2c3d4e5f6"');
  });
});

/*
 * changedPaths owes the refresh exactly the recipes whose saved copy is missing or out of date. Leaving one
 * out keeps it stale away from home, and adding a current one downloads it for nothing on every visit.
 */
describe('changedPaths', () =>
{
  it('picks the recipes saved at another revision or never saved, by their escaped address', () =>
  {
    // Arrange- stew and "a b" are current, punch is a revision behind, and pie was never saved.
    const catalog = catalogOf([ 'stew', 'punch', 'pie', 'a b' ], { punch: 'punch-2' });
    const savedTags = new Map([
      [ '/api/recipes/stew', '"stew-1"' ],
      [ '/api/recipes/punch', '"punch-1"' ],
      [ '/api/recipes/a%20b', '"a b-1"' ],
    ]);

    // Act.
    const changed = changedPaths(catalog, savedTags);

    // Assert.
    expect(changed)
      .toEqual([ '/api/recipes/punch', '/api/recipes/pie' ]);
  });
});

/*
 * forgottenPaths owes the refresh the recipes whose cards are gone, and only those: forgetting a listed
 * recipe, or the catalog, would leave a hole in the copy that only shows away from home.
 */
describe('forgottenPaths', () =>
{
  it('forgets only the saved recipes the catalog no longer lists', () =>
  {
    // Arrange.
    const saved = [ '/api/recipes', '/api/recipes/chimichurri', '/api/recipes/old-soup' ];
    const listed = [ '/api/recipes/chimichurri' ];

    // Act.
    const forgotten = forgottenPaths(saved, listed);

    // Assert.
    expect(forgotten)
      .toEqual([ '/api/recipes/old-soup' ]);
  });
});

/*
 * isAway owes the worker a clean edge: away up to the moment the wait ends, and back after.
 */
describe('isAway', () =>
{
  it('counts the desktop away until the moment the wait ends', () =>
  {
    // Arrange.
    const awayUntil = 60000;

    // Act.
    const states = [ isAway(awayUntil, 59999), isAway(awayUntil, 60000) ];

    // Assert.
    expect(states)
      .toEqual([ true, false ]);
  });
});

/*
 * isRefreshDue owes the worker a refresh once a minute has passed since the last, and not before.
 */
describe('isRefreshDue', () =>
{
  it('waits a full minute between refreshes', () =>
  {
    // Arrange.
    const refreshedAt = 100000;

    // Act.
    const states = [ isRefreshDue(refreshedAt, 159999), isRefreshDue(refreshedAt, 160000) ];

    // Assert.
    expect(states)
      .toEqual([ false, true ]);
  });
});

/*
 * isOldAppCache owes a new build the caches it may delete: only the old builds' files. Deleting its own
 * would empty the app, and deleting the recipes would empty the cookbook.
 */
describe('isOldAppCache', () =>
{
  it('deletes only the files of other builds', () =>
  {
    // Arrange.
    const names = [ 'recipes-app-0ld0ld0ld0ld', 'recipes-app-n3wn3wn3wn3w', 'recipes-data' ];

    // Act.
    const old = names.map((name) => isOldAppCache(name, 'n3wn3wn3wn3w'));

    // Assert.
    expect(old)
      .toEqual([ true, false, false ]);
  });
});

/*
 * appAddresses owes the worker the address of every file the app is made of, and the page under the
 * address it's opened from. Leave one out and the app can't start away from home.
 */
describe('appAddresses', () =>
{
  it('names every app file by its address, the page by the root', () =>
  {
    // Arrange.
    const files = [ 'sw.js', 'index.html', 'icon-192.png', '.gitkeep', 'assets/index-abc123.js' ];

    // Act.
    const addresses = appAddresses(files);

    // Assert.
    expect(addresses)
      .toEqual([ '/', '/assets/index-abc123.js', '/icon-192.png' ]);
  });
});
