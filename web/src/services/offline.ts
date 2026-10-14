/**
 * Asks the browser to keep a copy of the site on this device, by installing the service worker the build
 * puts at /sw.js (see web/src/worker). Only the built site has one. The development server doesn't, and a
 * worker there would fight Vite's reloading.
 * @param {ServiceWorkerContainer | undefined} container The browser's navigator.serviceWorker, which isn't
 * there at all on a page that isn't secure.
 * @param {boolean} isBuilt Whether this is the built site, rather than the development server.
 * @returns {boolean} Whether the worker was asked for.
 */
const keepACopy = (container: ServiceWorkerContainer | undefined, isBuilt: boolean): boolean =>
{
  if (isBuilt === false || container === undefined)
  {
    return false;
  }

  // a browser that won't keep a copy still has the live site, so a refusal is nothing to report.
  container.register('/sw.js').catch(() => undefined);
  return true;
};

export { keepACopy };
