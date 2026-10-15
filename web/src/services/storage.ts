/**
 * Where the page keeps things between visits, like how far along a recipe is. It's the browser's
 * localStorage everywhere but the tests.
 */
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Storage that keeps nothing, for a browser that won't hand over its own.
 */
const noStorage: BrowserStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * The browser's localStorage, or storage that keeps nothing when the browser won't hand it over. Just
 * reading window.localStorage throws in some private windows and wherever site data is blocked.
 * @returns {BrowserStorage} Somewhere to keep things.
 */
const browserStorage = (): BrowserStorage =>
{
  try
  {
    return window.localStorage;
  }
  catch
  {
    return noStorage;
  }
};

export { browserStorage, noStorage };
export type { BrowserStorage };
