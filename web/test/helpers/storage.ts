import type { BrowserStorage } from '../../src/services/storage';

/**
 * Storage kept in memory, standing in for the browser's localStorage.
 * @param {Record<string, string>} entries What's already saved.
 * @returns {BrowserStorage & { items: Map<string, string> }} The storage, with its items in reach.
 */
const memoryStorage = (entries: Record<string, string> = {}): BrowserStorage & { items: Map<string, string> } =>
{
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) =>
    {
      items.set(key, value);
    },
    removeItem: (key: string) =>
    {
      items.delete(key);
    },
  };
};

/**
 * Storage that refuses everything, the way a locked-down private window does, keeping a list of what it
 * refused.
 * @returns {BrowserStorage & { attempts: string[] }} The storage, with the attempts it refused.
 */
const lockedStorage = (): BrowserStorage & { attempts: string[] } =>
{
  const attempts: string[] = [];

  /**
   * A storage method that records the attempt and throws, as Safari does.
   * @param {string} name The method's name.
   * @returns {() => never} The method.
   */
  const refuse = (name: string): () => never =>
  {
    return () =>
    {
      attempts.push(name);
      throw new Error('The operation is insecure.');
    };
  };

  return { attempts, getItem: refuse('getItem'), setItem: refuse('setItem'), removeItem: refuse('removeItem') };
};

/**
 * Noon in Seattle on 2026-10-14, the time every test's clock reads.
 */
const noon = Date.UTC(2026, 9, 14, 19);

/**
 * One hour, in milliseconds.
 */
const hour = 60 * 60 * 1000;

export { hour, lockedStorage, memoryStorage, noon };
