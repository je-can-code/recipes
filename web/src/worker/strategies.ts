import type { Catalog } from '../types';
import {
  awayFor,
  catalogPath,
  changedPaths,
  desktopPatience,
  forgottenPaths,
  isAway,
  isRefreshDue,
  recipePaths,
} from './policy';

/**
 * A browser cache, as much of one as the service worker uses. Everything in it is filed by its full
 * address, like https://recipes.local/api/recipes.
 */
interface SavedCopy
{
  match(address: string): Promise<Response | undefined>;
  put(address: string, response: Response): Promise<void>;
  delete(address: string): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
}

/**
 * What the service worker remembers about the desktop between requests. The browser stops an idle worker
 * whenever it likes, and a restarted one starts again from knowing nothing, which only costs one wait.
 */
interface DesktopState
{
  /**
   * When the desktop stops counting as out of reach, in milliseconds. 0 when it's answering.
   */
  awayUntil: number;

  /**
   * When every saved recipe was last refreshed, in milliseconds. 0 when they haven't been yet.
   */
  refreshedAt: number;
}

/**
 * Everything an answer depends on, handed in so the tests can stand in for each piece.
 */
interface Surroundings
{
  /**
   * The website's own origin, like https://recipes.local.
   */
  origin: string;

  /**
   * This build's files, the app's page among them.
   */
  app: SavedCopy;

  /**
   * The saved catalog and recipes.
   */
  recipes: SavedCopy;

  /**
   * What the worker remembers about the desktop.
   */
  desktop: DesktopState;

  /**
   * Asks the desktop. It fails when the desktop can't be reached at all.
   */
  fetch: (request: Request | string) => Promise<Response>;

  /**
   * Resolves once the given number of milliseconds has passed.
   */
  wait: (milliseconds: number) => Promise<void>;

  /**
   * The time now, in milliseconds.
   */
  now: () => number;

  /**
   * Keeps the worker running until some work finishes, even after the page has its answer.
   */
  keepAlive: (work: Promise<unknown>) => void;
}

/**
 * What a recipe page says when the desktop can't be reached and the recipe was never saved.
 */
const notSavedYet = 'Your desktop can\'t be reached, and this isn\'t saved on this device yet. Open the site '
  + 'once at home, and every recipe will be.';

/**
 * Answers a page, the catalog or a recipe from the desktop when the desktop answers in time, and from the
 * saved copy when it doesn't. At home that means everything is as fresh as the cards on disk, and
 * anywhere else the site still opens.
 * @param {Request} request The request to answer.
 * @param {'page' | 'catalog' | 'recipe'} kind What the request is for.
 * @param {Surroundings} surroundings Everything the answer depends on.
 * @returns {Promise<Response>} The answer.
 */
const askDesktopFirst = async (
  request: Request,
  kind: 'page' | 'catalog' | 'recipe',
  surroundings: Surroundings,
): Promise<Response> =>
{
  const { desktop, keepAlive, now, wait } = surroundings;
  const copy = savedCopyOf(request, kind, surroundings);

  // the desktop is always asked, even when the copy answers, so a late answer still refreshes the copy
  // and says the desktop is back.
  const answer = askDesktop(request, kind, surroundings);
  keepAlive(answer.catch(() => undefined));

  // once the desktop is known to be out of reach, the copy answers at once, so only the first request
  // after leaving home has to wait.
  if (isAway(desktop.awayUntil, now()))
  {
    const saved = await copy;
    if (saved !== undefined)
    {
      return saved;
    }
  }

  // the desktop gets a little while to answer. Failing outright and running out of time both count as
  // being out of reach.
  const timeUp = wait(desktopPatience).then(() => null);
  const fresh = await Promise.race([ answer, timeUp ]).catch(() => null);
  if (fresh !== null)
  {
    return fresh;
  }

  desktop.awayUntil = now() + awayFor;
  const saved = await copy;
  if (saved !== undefined)
  {
    return saved;
  }
  return nothingSaved(kind);
};

/**
 * Asks the desktop, saving what it says about the recipes. It's the desktop's answer that's saved, not
 * the page's: the page's comes from this build's own files, which only a new build replaces. A fresh
 * catalog also brings the saved recipes up to date when they're due, downloading only the ones that changed.
 * @param {Request} request The request to pass on.
 * @param {'page' | 'catalog' | 'recipe'} kind What the request is for.
 * @param {Surroundings} surroundings Everything the answer depends on.
 * @returns {Promise<Response>} The desktop's answer. It fails when the desktop can't be reached.
 */
const askDesktop = async (
  request: Request,
  kind: 'page' | 'catalog' | 'recipe',
  surroundings: Surroundings,
): Promise<Response> =>
{
  const { desktop, keepAlive, now, recipes } = surroundings;
  const response = await surroundings.fetch(request);
  desktop.awayUntil = 0;

  // only a good answer replaces the copy. A missing recipe or a broken card is the desktop's to report,
  // and isn't worth keeping.
  if (kind === 'page' || response.ok === false)
  {
    return response;
  }
  await recipes.put(request.url, response.clone());

  if (kind === 'catalog' && isRefreshDue(desktop.refreshedAt, now()))
  {
    desktop.refreshedAt = now();
    const refresh = response.clone().json()
      .then((catalog: Catalog) => refreshChangedRecipes(catalog, surroundings));

    // a desktop that drops out halfway leaves the rest of the copy as it was, which is all that's needed.
    keepAlive(refresh.catch(() => undefined));
  }
  return response;
};

/**
 * Looks up the saved answer to a request: the app's page for any page, and the request's own address for
 * the catalog and the recipes.
 * @param {Request} request The request to look up.
 * @param {'page' | 'catalog' | 'recipe'} kind What the request is for.
 * @param {Surroundings} surroundings Where the copies are.
 * @returns {Promise<Response | undefined>} The saved answer, or undefined when nothing was saved.
 */
const savedCopyOf = (
  request: Request,
  kind: 'page' | 'catalog' | 'recipe',
  surroundings: Surroundings,
): Promise<Response | undefined> =>
{
  if (kind === 'page')
  {
    return surroundings.app.match(`${surroundings.origin}/`);
  }
  return surroundings.recipes.match(request.url);
};

/**
 * The answer when the desktop can't be reached and nothing was saved. A page gets the browser's own
 * "can't open this page", and the API gets a sentence the recipe page shows in place of the recipe.
 * @param {'page' | 'catalog' | 'recipe'} kind What the request was for.
 * @returns {Response} The answer.
 */
const nothingSaved = (kind: 'page' | 'catalog' | 'recipe'): Response =>
{
  if (kind === 'page')
  {
    return Response.error();
  }

  // built by hand rather than with Response.json, which older iPads don't have.
  return new Response(JSON.stringify({ error: notSavedYet }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

/**
 * Answers one of the website's own files from this build's copy, and asks the desktop only for a file the
 * build didn't save. A built file's name changes whenever its contents do, so a saved one is never out of
 * date.
 * @param {Request} request The request to answer.
 * @param {Surroundings} surroundings Everything the answer depends on.
 * @returns {Promise<Response>} The answer.
 */
const copyFirst = async (request: Request, surroundings: Surroundings): Promise<Response> =>
{
  const saved = await surroundings.app.match(request.url);
  if (saved !== undefined)
  {
    return saved;
  }
  return surroundings.fetch(request);
};

/**
 * Brings the saved recipes in line with a catalog the desktop just sent: downloads each listed recipe whose
 * saved copy is missing or was saved at another revision, then forgets the saved ones it no longer lists.
 * Keeping every recipe, rather than only the ones opened at home, is what lets any recipe open anywhere,
 * and on a visit where no card has changed, it downloads nothing at all.
 * @param {Catalog} catalog The catalog the desktop just sent.
 * @param {Surroundings} surroundings Everything the refresh depends on.
 * @returns {Promise<void>} Resolves when every changed recipe is saved. It fails, forgetting nothing, when
 * the desktop drops out partway.
 */
const refreshChangedRecipes = async (catalog: Catalog, surroundings: Surroundings): Promise<void> =>
{
  const listed = recipePaths(catalog);
  const savedTags = await savedTagsOf(listed, surroundings);
  await Promise.all(changedPaths(catalog, savedTags).map((path) => saveRecipe(path, surroundings)));
  await forgetUnlisted(listed, surroundings);
};

/**
 * Saves every recipe the catalog lists, fresh from the desktop whatever revision each was saved at, then
 * forgets the saved ones it no longer lists. A new build does this once as it takes over, because the
 * desktop may have been updated along with it, in a way that answers an unchanged card differently.
 * @param {Catalog} catalog The catalog the desktop just sent.
 * @param {Surroundings} surroundings Everything the refresh depends on.
 * @returns {Promise<void>} Resolves when every recipe is saved. It fails, forgetting nothing, when the
 * desktop drops out partway.
 */
const refreshEveryRecipe = async (catalog: Catalog, surroundings: Surroundings): Promise<void> =>
{
  const listed = recipePaths(catalog);
  await Promise.all(listed.map((path) => saveRecipe(path, surroundings)));
  await forgetUnlisted(listed, surroundings);
};

/**
 * Reads the ETag each listed recipe was saved with, for the ones that are saved and came with one.
 * @param {string[]} listed The address of every recipe the catalog lists, without the origin.
 * @param {Surroundings} surroundings Where the saved recipes are.
 * @returns {Promise<Map<string, string>>} Each saved recipe's ETag, by address without the origin.
 */
const savedTagsOf = async (listed: string[], surroundings: Surroundings): Promise<Map<string, string>> =>
{
  const { origin, recipes } = surroundings;
  const savedTags = new Map<string, string>();
  await Promise.all(listed.map(async (path) =>
  {
    // a recipe never saved has no copy to compare.
    const saved = await recipes.match(`${origin}${path}`);
    if (saved === undefined)
    {
      return;
    }

    // a recipe saved by a build from before revisions came without an ETag.
    const tag = saved.headers.get('ETag');
    if (tag !== null)
    {
      savedTags.set(path, tag);
    }
  }));
  return savedTags;
};

/**
 * Forgets the saved recipes a catalog no longer lists, because their cards were deleted or renamed.
 * @param {string[]} listed The address of every recipe the catalog lists, without the origin.
 * @param {Surroundings} surroundings Where the saved recipes are.
 * @returns {Promise<void>} Resolves once they're forgotten.
 */
const forgetUnlisted = async (listed: string[], surroundings: Surroundings): Promise<void> =>
{
  const { origin, recipes } = surroundings;
  const saved = (await recipes.keys()).map((request) => new URL(request.url).pathname);
  await Promise.all(forgottenPaths(saved, listed).map((path) => recipes.delete(`${origin}${path}`)));
};

/**
 * Saves one recipe, fresh from the desktop, along with the ETag naming its revision. A recipe that's gone
 * or broken by now keeps whatever copy it had; the next catalog stops listing a gone one, and that's when
 * it's forgotten.
 * @param {string} path The recipe's address, without the origin.
 * @param {Surroundings} surroundings Everything the refresh depends on.
 * @returns {Promise<void>} Resolves once the recipe is saved, or turned out not to be worth saving.
 */
const saveRecipe = async (path: string, surroundings: Surroundings): Promise<void> =>
{
  const address = `${surroundings.origin}${path}`;
  const response = await surroundings.fetch(address);
  if (response.ok)
  {
    await surroundings.recipes.put(address, response);
  }
};

/**
 * Saves the catalog and every recipe, fresh from the desktop, the way a new build does once it takes
 * over. Until then nothing is saved at all, so this is what lets a device leave home straight after its
 * first visit.
 * @param {Surroundings} surroundings Everything the refresh depends on.
 * @returns {Promise<void>} Resolves when everything is saved. It fails when the desktop can't be reached.
 */
const refreshEverything = async (surroundings: Surroundings): Promise<void> =>
{
  const { desktop, now, origin, recipes } = surroundings;
  const address = `${origin}${catalogPath}`;
  const response = await surroundings.fetch(address);
  if (response.ok === false)
  {
    return;
  }

  await recipes.put(address, response.clone());
  desktop.refreshedAt = now();
  await refreshEveryRecipe(await response.json(), surroundings);
};

export { askDesktopFirst, copyFirst, notSavedYet, refreshChangedRecipes, refreshEverything, refreshEveryRecipe };
export type { DesktopState, SavedCopy, Surroundings };
