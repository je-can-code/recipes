import { describe, expect, it } from 'vitest';
import { toAppPath } from '../../src/services/links';

/*
 * toAppPath owes the recipe page a clean split: links to this site move between pages without reloading,
 * and everything else is left to the browser. Keeping an outside link in the app would send it to the
 * not-found page; letting an inside one go would reload the whole site for nothing.
 */
describe('toAppPath', () =>
{
  it('keeps a path on this site', () =>
  {
    // Arrange.
    const href = '/recipes/chimichurri';

    // Act.
    const path = toAppPath(href);

    // Assert.
    expect(path)
      .toBe('/recipes/chimichurri');
  });

  it('leaves a web address to the browser', () =>
  {
    // Arrange.
    const href = 'https://example.com/gravy';

    // Act.
    const path = toAppPath(href);

    // Assert.
    expect(path)
      .toBeNull();
  });

  it('leaves an address on another site without its https: to the browser', () =>
  {
    // Arrange- it starts with a slash, like a path here, but it isn't one.
    const href = '//example.com/gravy';

    // Act.
    const path = toAppPath(href);

    // Assert.
    expect(path)
      .toBeNull();
  });

  it('leaves an anchor on the same page to the browser', () =>
  {
    // Arrange.
    const href = '#notes';

    // Act.
    const path = toAppPath(href);

    // Assert.
    expect(path)
      .toBeNull();
  });

  it('has nowhere to go for a link without an address', () =>
  {
    // Arrange- the element had no href at all.
    const href = null;

    // Act.
    const path = toAppPath(href);

    // Assert.
    expect(path)
      .toBeNull();
  });
});
