import type { Catalog } from '../types';

/**
 * What a request is asking for, which decides how the service worker answers it:
 * - page: an address being opened, tapped or reloaded, which the app's page answers.
 * - catalog: the list of every recipe.
 * - recipe: one recipe.
 * - file: one of the files the website is built from, like its script, its styles and its icons.
 * - other: anything the worker leaves to the browser, like another website or the rest of the API.
 */
type RequestKind = 'page' | 'catalog' | 'recipe' | 'file' | 'other';

/**
 * How long a request waits for the desktop before settling for the saved copy, in milliseconds. At home the
 * desktop answers in a few hundredths of a second. Away from home, looking up recipes.local can hang for far
 * longer than this before it gives up, so the wait has to be cut short rather than left to fail on its own.
 */
const desktopPatience = 2000;

/**
 * How long the desktop counts as out of reach once it has failed to answer, in milliseconds. Until then
 * every request goes straight to the saved copy, so a phone away from home waits once, not on every tap.
 * It can be generous, because the desktop is still asked behind every answer, and the first time it
 * replies it counts as back. Coming home costs one answer from the copy, and the next one is fresh.
 */
const awayFor = 5 * 60 * 1000;

/**
 * The least time between two refreshes of the saved recipes, in milliseconds. Opening the list refreshes
 * them, and going back and forth between the list and a few recipes shouldn't look over the whole
 * cookbook every time.
 */
const refreshEvery = 60 * 1000;

/**
 * The cache the recipes are saved in. Unlike the website's own files, the recipes outlive a new build.
 */
const recipesCacheName = 'recipes-data';

/**
 * The start of the name of every cache holding the website's own files. Each build gets its own cache.
 */
const appCachePrefix = 'recipes-app-';

/**
 * The address of the list of every recipe.
 */
const catalogPath = '/api/recipes';

/**
 * Sorts a request into the kind that decides how it's answered.
 * @param {URL} address Where the request is going.
 * @param {string} origin The website's own origin, like https://recipes.local.
 * @param {string} method The request's method, like GET.
 * @param {RequestMode} mode How the request was made. "navigate" means a page is being opened.
 * @returns {RequestKind} The kind of request.
 */
const kindOf = (address: URL, origin: string, method: string, mode: RequestMode): RequestKind =>
{
  // only reading this website's own addresses can be answered from a copy.
  if (method !== 'GET' || address.origin !== origin)
  {
    return 'other';
  }

  // the API comes before pages, so opening an API address as a page still gets its JSON.
  if (address.pathname === catalogPath)
  {
    return 'catalog';
  }
  if (isRecipePath(address.pathname))
  {
    return 'recipe';
  }
  if (address.pathname.startsWith('/api/'))
  {
    return 'other';
  }

  // every page is the same app, which works out what the address shows once it's running.
  if (mode === 'navigate')
  {
    return 'page';
  }
  return 'file';
};

/**
 * Whether an address is one recipe's, like /api/recipes/chimichurri.
 * @param {string} path The address, without the origin.
 * @returns {boolean} True when it's one recipe's address.
 */
const isRecipePath = (path: string): boolean =>
{
  return /^\/api\/recipes\/[^/]+$/.test(path);
};

/**
 * The address of one recipe, written the way the recipe page asks for it.
 * @param {string} slug The recipe's name.
 * @returns {string} Its address, without the origin.
 */
const recipePath = (slug: string): string =>
{
  return `${catalogPath}/${encodeURIComponent(slug)}`;
};

/**
 * The address of every recipe in a catalog, written the way the recipe page asks for them.
 * @param {Catalog} catalog The catalog listing the recipes.
 * @returns {string[]} One address per recipe, without the origin.
 */
const recipePaths = (catalog: Catalog): string[] =>
{
  return catalog.recipes.map((recipe) =>
  {
    return recipePath(recipe.slug);
  });
};

/**
 * Writes a recipe's revision the way the desktop sends it as the ETag of the recipe's answer, inside
 * double quotes, so the catalog's revision and a saved recipe's ETag can be compared.
 * @param {string} revision The revision, as the catalog lists it.
 * @returns {string} The revision written as an ETag.
 */
const entityTag = (revision: string): string =>
{
  return `"${revision}"`;
};

/**
 * The listed recipes worth downloading again: each one whose saved copy is missing, or was saved at another
 * revision than the catalog gives it now. Every other saved recipe is already exactly what the desktop
 * would send, so asking for it again would only cost the desktop's time and the device's battery.
 * @param {Catalog} catalog The catalog the desktop just sent.
 * @param {Map<string, string>} savedTags The ETag each saved recipe came with, by address without the
 * origin. A recipe saved by a build from before revisions has none, and counts as changed.
 * @returns {string[]} The address of each recipe to download, without the origin.
 */
const changedPaths = (catalog: Catalog, savedTags: Map<string, string>): string[] =>
{
  return catalog.recipes
    .filter((recipe) =>
    {
      return savedTags.get(recipePath(recipe.slug)) !== entityTag(recipe.revision);
    })
    .map((recipe) =>
    {
      return recipePath(recipe.slug);
    });
};

/**
 * The saved recipes the catalog no longer lists, because their cards were deleted or renamed. Only
 * recipes are ever forgotten; the catalog itself stays.
 * @param {string[]} savedPaths The address of everything saved, without the origin.
 * @param {string[]} listedPaths The address of every recipe the catalog lists.
 * @returns {string[]} The saved recipes to forget.
 */
const forgottenPaths = (savedPaths: string[], listedPaths: string[]): string[] =>
{
  const listed = new Set(listedPaths);
  return savedPaths.filter((path) =>
  {
    return isRecipePath(path) && listed.has(path) === false;
  });
};

/**
 * Whether the desktop still counts as out of reach.
 * @param {number} awayUntil When the desktop stops counting as out of reach, in milliseconds. 0 means it
 * never failed to answer, or answered since.
 * @param {number} now The time now, in milliseconds.
 * @returns {boolean} True while the desktop counts as out of reach.
 */
const isAway = (awayUntil: number, now: number): boolean =>
{
  return now < awayUntil;
};

/**
 * Whether it's time to refresh every saved recipe again.
 * @param {number} refreshedAt When they were last refreshed, in milliseconds. 0 means never.
 * @param {number} now The time now, in milliseconds.
 * @returns {boolean} True when the last refresh is old enough to repeat.
 */
const isRefreshDue = (refreshedAt: number, now: number): boolean =>
{
  return now - refreshedAt >= refreshEvery;
};

/**
 * The name of the cache holding one build's files.
 * @param {string} buildId The build, as the build names it.
 * @returns {string} The cache's name.
 */
const appCacheName = (buildId: string): string =>
{
  return `${appCachePrefix}${buildId}`;
};

/**
 * Whether a cache holds the files of a build that has been replaced, and can go.
 * @param {string} name The cache's name.
 * @param {string} buildId The build running now.
 * @returns {boolean} True for another build's files; false for this build's, and for the recipes.
 */
const isOldAppCache = (name: string, buildId: string): boolean =>
{
  return name.startsWith(appCachePrefix) && name !== appCacheName(buildId);
};

/**
 * Whether a file in the built website is part of the app. Two aren't: the placeholder that lets Go
 * compile, and the service worker itself, which the browser keeps by itself.
 * @param {string} file The file, relative to the built website's folder, like assets/index.js.
 * @returns {boolean} True for a file the app is made of.
 */
const isAppFile = (file: string): boolean =>
{
  return file !== '.gitkeep' && file !== 'sw.js';
};

/**
 * The addresses of the files a build is made of, from the files the build wrote. The page itself goes by
 * the site's root, which is where the app is opened from.
 * @param {string[]} files Every file in the built website, relative to its folder, like assets/index.js.
 * @returns {string[]} The address of each file in the app, in order.
 */
const appAddresses = (files: string[]): string[] =>
{
  return files
    .filter(isAppFile)
    .map((file) =>
    {
      return file === 'index.html' ? '/' : `/${file}`;
    })
    .sort();
};

export {
  appAddresses,
  appCacheName,
  awayFor,
  catalogPath,
  changedPaths,
  desktopPatience,
  entityTag,
  forgottenPaths,
  isAppFile,
  isAway,
  isOldAppCache,
  isRecipePath,
  isRefreshDue,
  kindOf,
  recipePaths,
  recipesCacheName,
  refreshEvery,
};
export type { RequestKind };
