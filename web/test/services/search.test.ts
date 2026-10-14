import { describe, expect, it } from 'vitest';
import { searchRecipes } from '../../src/services/search';
import type { RecipeSummary } from '../../src/types';

/**
 * Builds a recipe summary with the fields search reads, and placeholders for the rest.
 * @param {string} slug The recipe's name.
 * @param {string} title The recipe's title.
 * @param {string} collection The recipe's collection, or an empty string for the top level.
 * @param {string[]} tags The recipe's tags.
 * @returns {RecipeSummary} The summary.
 */
const summary = (slug: string, title: string, collection: string, tags: string[]): RecipeSummary =>
{
  return { slug, title, collection, tags, serves: '2', makes: '', time: 'about 10 minutes' };
};

const steak = summary('steak', 'Steak, Garlic Mash and Asparagus', '', [ 'beef', 'dinner' ]);
const chorizo = summary('chorizo', 'Chorizo Biscuits and Gravy', '', [ 'brunch', 'pork' ]);
const climax = summary('au-gratin-climax', 'Au Gratin Climax', 'star-ocean', [ 'so2', 'cheese' ]);
const everything = [ climax, chorizo, steak ];

/*
 * searchRecipes owes the results page the recipes a person meant: every word they typed found somewhere
 * in a recipe's title, tags or collection, capitals ignored, in the order the list already had. Matching
 * too much buries the recipe under others; matching too little hides it, and nobody goes looking for a
 * recipe they think isn't there. Each test keeps a near miss beside the match, so "matches this one" can
 * never pass for "matches everything".
 */
describe('searchRecipes', () =>
{
  it('returns every recipe for an empty search', () =>
  {
    // Arrange.
    const query = '';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ climax, chorizo, steak ]);
  });

  it('finds a tag, leaving out the recipe tagged with something else', () =>
  {
    // Arrange- the pork recipe sits right beside the beef one.
    const query = 'beef';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ steak ]);
  });

  it('finds a title whatever the capitals', () =>
  {
    // Arrange.
    const query = 'CHORIZO';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ chorizo ]);
  });

  it('finds part of a word, so the results keep up with the typing', () =>
  {
    // Arrange.
    const query = 'chori';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ chorizo ]);
  });

  it('finds a collection', () =>
  {
    // Arrange- only one recipe is in a collection at all.
    const query = 'star';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ climax ]);
  });

  it('narrows with every word when one recipe has them all', () =>
  {
    // Arrange.
    const query = 'beef dinner';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ steak ]);
  });

  it('finds nothing when the words belong to different recipes', () =>
  {
    // Arrange- beef is the steak's, brunch is the chorizo's, and neither has both.
    const query = 'beef brunch';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([]);
  });

  it('ignores extra spaces', () =>
  {
    // Arrange.
    const query = '   beef    ';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([ steak ]);
  });

  it('never matches a word across two fields', () =>
  {
    // Arrange- the steak's title ends in asparagus and its first tag is beef.
    const query = 'asparagusbeef';

    // Act.
    const results = searchRecipes(everything, query);

    // Assert.
    expect(results)
      .toEqual([]);
  });

  it('keeps the order it was given', () =>
  {
    // Arrange- every title holds an a, and the list arrives in reverse.
    const reversed = [ steak, chorizo, climax ];

    // Act.
    const results = searchRecipes(reversed, 'a');

    // Assert.
    expect(results)
      .toEqual([ steak, chorizo, climax ]);
  });
});
