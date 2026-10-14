import { describe, expect, it } from 'vitest';
import { collectionLabel, groupByCollection } from '../../src/services/collections';
import type { RecipeSummary } from '../../src/types';

/**
 * Builds a recipe summary in the given collection.
 * @param {string} slug The recipe's name.
 * @param {string} collection The recipe's collection, or an empty string for the top level.
 * @returns {RecipeSummary} The summary.
 */
const inCollection = (slug: string, collection: string): RecipeSummary =>
{
  return { slug, title: slug, collection, tags: [], serves: '2', makes: '', time: 'about 10 minutes' };
};

/*
 * collectionLabel owes the home page a heading a person reads naturally, so a folder named star-ocean
 * shows as Star Ocean, and the top level, which has no folder, still gets a heading of its own.
 */
describe('collectionLabel', () =>
{
  it('names the top level', () =>
  {
    // Arrange- the top level has no folder name.
    const name = '';

    // Act.
    const label = collectionLabel(name);

    // Assert.
    expect(label)
      .toBe('Home Cooking');
  });

  it('turns a hyphenated folder name into capitalized words', () =>
  {
    // Arrange.
    const name = 'star-ocean';

    // Act.
    const label = collectionLabel(name);

    // Assert.
    expect(label)
      .toBe('Star Ocean');
  });

  it('drops the empty word a doubled hyphen leaves', () =>
  {
    // Arrange.
    const name = 'star--ocean';

    // Act.
    const label = collectionLabel(name);

    // Assert.
    expect(label)
      .toBe('Star Ocean');
  });
});

/*
 * groupByCollection owes the home page every recipe exactly once, under its own collection: the top
 * level first, the collections in name order, and each group in the order the recipes arrived, which is
 * already by title.
 */
describe('groupByCollection', () =>
{
  it('puts the top level first and the collections in name order', () =>
  {
    // Arrange- the collections arrive out of order, with the top level last.
    const recipes = [ inCollection('ozoni', 'star-ocean'), inCollection('scones', 'baking'), inCollection('gravy', '') ];

    // Act.
    const groups = groupByCollection(recipes);

    // Assert.
    expect(groups.map((group) => group.label))
      .toEqual([ 'Home Cooking', 'Baking', 'Star Ocean' ]);
  });

  it('keeps each group in the order its recipes arrived', () =>
  {
    // Arrange- two collections interleaved, so a group built in any other order would show it.
    const recipes = [
      inCollection('apple-pie', 'baking'),
      inCollection('au-gratin-climax', 'star-ocean'),
      inCollection('biscuits', 'baking'),
    ];

    // Act.
    const groups = groupByCollection(recipes);

    // Assert.
    expect(groups.map((group) => group.recipes.map((recipe) => recipe.slug)))
      .toEqual([ [ 'apple-pie', 'biscuits' ], [ 'au-gratin-climax' ] ]);
  });

  it('makes no groups when there are no recipes', () =>
  {
    // Arrange- an empty cookbook.
    const recipes: RecipeSummary[] = [];

    // Act.
    const groups = groupByCollection(recipes);

    // Assert.
    expect(groups)
      .toEqual([]);
  });
});
