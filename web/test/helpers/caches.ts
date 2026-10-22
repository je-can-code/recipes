import type { Catalog } from '../../src/types';
import type { SavedCopy, Surroundings } from '../../src/worker/strategies';

/**
 * The origin every test's site runs at.
 */
const origin = 'https://recipes.local';

/**
 * The headers an answer carries: its ETag when it has one, and nothing otherwise.
 * @param {string | undefined} tag The ETag, if there is one.
 * @returns {Record<string, string>} The headers.
 */
const headersFor = (tag: string | undefined): Record<string, string> =>
{
  return tag === undefined ? {} : { ETag: tag };
};

/**
 * A browser cache kept in memory, standing in for one of the service worker's. It files every answer by
 * its full address, the way the real one does, and keeps each body as text and the ETag it came with, the
 * way the real one keeps headers, so a test can read both back.
 * @param {Record<string, string>} entries What's already saved, by full address.
 * @param {Record<string, string>} tags The ETag each saved entry came with, by full address, for the ones
 * that came with one.
 * @returns {SavedCopy & { bodies: Map<string, string>, tags: Map<string, string> }} The cache, with what it
 * holds in reach.
 */
const memoryCache = (
  entries: Record<string, string> = {},
  tags: Record<string, string> = {},
): SavedCopy & { bodies: Map<string, string>; tags: Map<string, string> } =>
{
  const bodies = new Map(Object.entries(entries));
  const savedTags = new Map(Object.entries(tags));
  return {
    bodies,
    tags: savedTags,
    match: async (address: string) =>
    {
      const body = bodies.get(address);
      return body === undefined ? undefined : new Response(body, { headers: headersFor(savedTags.get(address)) });
    },
    put: async (address: string, response: Response) =>
    {
      bodies.set(address, await response.text());
      const tag = response.headers.get('ETag');
      if (tag === null)
      {
        savedTags.delete(address);
        return;
      }
      savedTags.set(address, tag);
    },
    delete: async (address: string) =>
    {
      savedTags.delete(address);
      return bodies.delete(address);
    },
    keys: async () => [ ...bodies.keys() ].map((address) => new Request(address)),
  };
};

/**
 * A desktop that answers some addresses with a status, a body and maybe an ETag, and every other with a 404.
 * @param {Record<string, [ number, string ] | [ number, string, string ]>} answers The status, body and
 * ETag, if any, for each full address.
 * @returns {(address: string) => Promise<Response>} The desktop.
 */
const desktopAnswering = (
  answers: Record<string, [ number, string ] | [ number, string, string ]>,
): (address: string) => Promise<Response> =>
{
  return async (address: string) =>
  {
    const [ status, body, tag ] = answers[address] ?? [ 404, '{"error":"There\'s nothing here."}' ];
    return new Response(body, { status, headers: headersFor(tag) });
  };
};

/**
 * A desktop that can't be reached at all, failing the way fetch does when there's no network.
 * @returns {Promise<Response>} Never an answer.
 */
const unreachable = async (): Promise<Response> =>
{
  throw new TypeError('Load failed');
};

/**
 * A desktop that answers only when the test says so.
 * @returns {{ desktop: () => Promise<Response>, answer: (response: Response) => void }} The desktop, and
 * the way to make it answer.
 */
const desktopAnsweringLater = (): { desktop: () => Promise<Response>; answer: (response: Response) => void } =>
{
  let answer: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) =>
  {
    answer = resolve;
  });
  return { desktop: () => pending, answer };
};

/**
 * How the stand-in for the service worker is set up for one test.
 */
interface RigOptions
{
  desktop: (address: string) => Promise<Response>;
  app?: Record<string, string>;
  recipes?: Record<string, string>;
  recipeTags?: Record<string, string>;
  awayUntil?: number;
  refreshedAt?: number;
  patience?: 'runs out' | 'lasts forever';
  now?: number;
}

/**
 * The service worker's surroundings, made of stand-ins, with what happened to them in reach.
 */
interface Rig
{
  surroundings: Surroundings;
  app: ReturnType<typeof memoryCache>;
  recipes: ReturnType<typeof memoryCache>;
  asked: string[];
  kept: Promise<unknown>[];
}

/**
 * Builds the service worker's surroundings out of stand-ins: two caches, a desktop, a clock that reads
 * noon, and a wait that either runs out at once or never does.
 * @param {RigOptions} options How to set them up.
 * @returns {Rig} The surroundings, with every address the desktop was asked for and all the work kept
 * running in the background.
 */
const rig = (options: RigOptions): Rig =>
{
  const app = memoryCache(options.app);
  const recipes = memoryCache(options.recipes, options.recipeTags);
  const asked: string[] = [];
  const kept: Promise<unknown>[] = [];
  const surroundings: Surroundings = {
    origin,
    app,
    recipes,
    desktop: { awayUntil: options.awayUntil ?? 0, refreshedAt: options.refreshedAt ?? 0 },
    fetch: (request: Request | string) =>
    {
      const address = new Request(request).url;
      asked.push(address);
      return options.desktop(address);
    },
    wait: () =>
    {
      if (options.patience === 'runs out')
      {
        return Promise.resolve();
      }
      return new Promise(() => undefined);
    },
    now: () => options.now ?? Date.UTC(2026, 9, 14, 19),
    keepAlive: (work: Promise<unknown>) =>
    {
      kept.push(work);
    },
  };
  return { surroundings, app, recipes, asked, kept };
};

/**
 * A catalog listing recipes by name, each at the revision given for it or else at its name and -1, with
 * everything else about them left blank.
 * @param {string[]} slugs The recipes' names.
 * @param {Record<string, string>} revisions The revision of any recipe that isn't at its name and -1.
 * @returns {Catalog} The catalog.
 */
const catalogOf = (slugs: string[], revisions: Record<string, string> = {}): Catalog =>
{
  return {
    recipes: slugs.map((slug) =>
    {
      const revision = revisions[slug] ?? `${slug}-1`;
      return { slug, title: slug, folder: '', tags: [], serves: '', makes: '', time: '', revision };
    }),
    collections: [],
    problems: [],
  };
};

export { catalogOf, desktopAnswering, desktopAnsweringLater, memoryCache, origin, rig, unreachable };
