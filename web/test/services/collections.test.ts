import { describe, expect, it } from 'vitest';
import { collectionLabel } from '../../src/services/collections';

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

