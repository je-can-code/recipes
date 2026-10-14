import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, fetchRecipe } from '../../src/services/api';

/**
 * Replaces fetch with one that answers every request with the given status and JSON body, and records
 * the addresses asked for.
 * @param {number} status The status to answer with.
 * @param {unknown} body The JSON body to answer with.
 * @returns {string[]} The addresses requested, filled in as requests arrive.
 */
const answerWith = (status: number, body: unknown): string[] =>
{
  const requested: string[] = [];
  vi.stubGlobal('fetch', async (address: string): Promise<Response> =>
  {
    requested.push(address);
    return new Response(JSON.stringify(body), { status });
  });
  return requested;
};

afterEach(() =>
{
  vi.unstubAllGlobals();
});

/*
 * fetchCatalog owes the pages the server's catalog as it is, and a failure carrying the server's own
 * explanation when there isn't one, since "couldn't read the recipes folder" is the sentence that tells
 * someone what to fix.
 */
describe('fetchCatalog', () =>
{
  it('returns the catalog the server sent', () =>
  {
    // Arrange.
    const catalog = { recipes: [], problems: [ { file: 'broken.yaml', message: 'Needs a time.' } ] };
    const requested = answerWith(200, catalog);

    // Act.
    const result = fetchCatalog();

    // Assert.
    return result.then((received) =>
    {
      expect(received)
        .toEqual(catalog);
      expect(requested)
        .toEqual([ '/api/recipes' ]);
    });
  });

  it('fails with the server\'s explanation', () =>
  {
    // Arrange.
    answerWith(500, { error: 'Couldn\'t read the recipes folder.' });

    // Act.
    const result = fetchCatalog();

    // Assert.
    return expect(result)
      .rejects.toThrow('Couldn\'t read the recipes folder.');
  });

  it('fails with the status when the server gave no explanation', () =>
  {
    // Arrange.
    answerWith(502, {});

    // Act.
    const result = fetchCatalog();

    // Assert.
    return expect(result)
      .rejects.toThrow('The server answered 502.');
  });
});

/*
 * fetchRecipe owes the recipe page one recipe, or null when there is no recipe by that name, which is a
 * page to show rather than an error to report.
 */
describe('fetchRecipe', () =>
{
  it('returns the recipe the server sent, asking for it by name', () =>
  {
    // Arrange.
    const recipe = { slug: 'chimichurri', title: 'Chimichurri' };
    const requested = answerWith(200, recipe);

    // Act.
    const result = fetchRecipe('chimichurri');

    // Assert.
    return result.then((received) =>
    {
      expect(received)
        .toEqual(recipe);
      expect(requested)
        .toEqual([ '/api/recipes/chimichurri' ]);
    });
  });

  it('returns null for a name with no recipe', () =>
  {
    // Arrange- a name that needs escaping, to prove it's sent safely.
    const requested = answerWith(404, { error: 'There\'s no recipe named "a b".' });

    // Act.
    const result = fetchRecipe('a b');

    // Assert.
    return result.then((received) =>
    {
      expect(received)
        .toBeNull();
      expect(requested)
        .toEqual([ '/api/recipes/a%20b' ]);
    });
  });
});
