/**
 * The service worker: the part of the site a browser keeps on the device and runs by itself, between the
 * page and the network. It saves the website and every recipe, and answers from that copy whenever the
 * desktop can't, which is what lets the site open away from home. The decisions live in policy.ts and
 * strategies.ts, where they're tested; this file only connects them to the browser's events.
 *
 * scripts/build-worker.ts builds it into the site as sw.js, after Vite has built everything else, and
 * writes in the two values declared below.
 */
import { appCacheName, isOldAppCache, kindOf, recipesCacheName } from './policy';
import { askDesktopFirst, copyFirst, refreshEverything } from './strategies';
import type { DesktopState, Surroundings } from './strategies';

declare const self: ServiceWorkerGlobalScope;

/**
 * The address of every file in this build, which the build writes in.
 */
declare const __APP_FILES__: string[];

/**
 * This build's name, which the build writes in. It changes whenever any of the website's files do, which
 * is what makes a browser notice a new build: browsers only update a worker whose own bytes changed.
 */
declare const __BUILD_ID__: string;

/**
 * What this worker knows about the desktop, for as long as the browser keeps it running.
 */
const desktop: DesktopState = { awayUntil: 0, refreshedAt: 0 };

/**
 * Gathers everything an answer depends on, for one event.
 * @param {ExtendableEvent} event The event being answered, which keeps the worker running for its work.
 * @returns {Promise<Surroundings>} The surroundings.
 */
const surroundingsFor = async (event: ExtendableEvent): Promise<Surroundings> =>
{
  return {
    origin: self.location.origin,
    app: await caches.open(appCacheName(__BUILD_ID__)),
    recipes: await caches.open(recipesCacheName),
    desktop,
    fetch: (request) => fetch(request),
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
    keepAlive: (work) => event.waitUntil(work),
  };
};

/**
 * Answers one request the worker has taken on.
 * @param {FetchEvent} event The request's event.
 * @param {'page' | 'catalog' | 'recipe' | 'file'} kind What the request is for.
 * @returns {Promise<Response>} The answer.
 */
const answer = async (event: FetchEvent, kind: 'page' | 'catalog' | 'recipe' | 'file'): Promise<Response> =>
{
  const surroundings = await surroundingsFor(event);
  if (kind === 'file')
  {
    return copyFirst(event.request, surroundings);
  }
  return askDesktopFirst(event.request, kind, surroundings);
};

/**
 * Saves every file in this build. The page is fetched fresh rather than from the browser's own cache, so
 * the copy is exactly this build.
 * @returns {Promise<void>} Resolves once every file is saved, and fails if any one can't be.
 */
const saveTheApp = async (): Promise<void> =>
{
  const app = await caches.open(appCacheName(__BUILD_ID__));
  await app.addAll(__APP_FILES__.map((address) => new Request(address, { cache: 'reload' })));
};

/**
 * Takes over from the build before: deletes its files, starts answering every open page, then saves the
 * catalog and every recipe.
 * @param {ExtendableEvent} event The activate event.
 * @returns {Promise<void>} Resolves once the takeover is done.
 */
const takeOver = async (event: ExtendableEvent): Promise<void> =>
{
  const names = await caches.keys();
  const oldNames = names.filter((name) => isOldAppCache(name, __BUILD_ID__));
  await Promise.all(oldNames.map((name) => caches.delete(name)));
  await self.clients.claim();

  // a desktop that can't be reached right now only means the recipes get saved on the next visit instead.
  const surroundings = await surroundingsFor(event);
  await refreshEverything(surroundings).catch(() => undefined);
};

// a new build installs by saving its files, then takes over at once rather than waiting for every open
// page to close. A page already open on the old build has everything it needs loaded, so it carries on.
self.addEventListener('install', (event) =>
{
  event.waitUntil(saveTheApp().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) =>
{
  event.waitUntil(takeOver(event));
});

self.addEventListener('fetch', (event) =>
{
  const { request } = event;
  const kind = kindOf(new URL(request.url), self.location.origin, request.method, request.mode);

  // anything that isn't this website's to answer goes to the network as if the worker weren't here.
  if (kind === 'other')
  {
    return;
  }
  event.respondWith(answer(event, kind));
});
