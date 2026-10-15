import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserStorage, noStorage } from '../../src/services/storage';
import { memoryStorage } from '../helpers/storage';

afterEach(() =>
{
  vi.unstubAllGlobals();
});

/*
 * browserStorage owes the page somewhere to keep things that never throws: the browser's own storage when
 * it hands it over, and storage that keeps nothing when it won't, as some private windows won't.
 */
describe('browserStorage', () =>
{
  it('hands back the browser\'s localStorage', () =>
  {
    // Arrange.
    const localStorage = memoryStorage();
    vi.stubGlobal('window', { localStorage });

    // Act.
    const storage = browserStorage();

    // Assert.
    expect(storage)
      .toBe(localStorage);
  });

  it('falls back to keeping nothing when the browser refuses its storage', () =>
  {
    // Arrange- Safari throws just for reading window.localStorage when site data is blocked.
    vi.stubGlobal('window', {
      get localStorage(): Storage
      {
        throw new Error('The operation is insecure.');
      },
    });

    // Act.
    const storage = browserStorage();

    // Assert.
    expect(storage)
      .toBe(noStorage);
  });
});

/*
 * noStorage owes its callers the shape of storage and none of the memory: anything put in is gone.
 */
describe('noStorage', () =>
{
  it('keeps nothing it\'s given', () =>
  {
    // Arrange.
    noStorage.setItem('recipes.progress.test-stew', '{}');

    // Act.
    const kept = noStorage.getItem('recipes.progress.test-stew');

    // Assert.
    expect(kept)
      .toBe(null);
  });
});
