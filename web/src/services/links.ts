/**
 * Decides whether a link inside a recipe stays in the app. Recipe text is HTML from the server, so its
 * links are plain anchors; the ones pointing at this site can move between pages without a reload,
 * while web addresses, emails and anchors on the same page are left to the browser.
 * @param {string | null} href The link's href attribute, or null when the element has none.
 * @returns {string | null} The path to move to inside the app, or null when the browser should handle it.
 */
const toAppPath = (href: string | null): string | null =>
{
  // a link without an address has nowhere to go.
  if (href === null)
  {
    return null;
  }

  // only paths on this site stay in the app. A leading // is another site without its https:.
  if (href.startsWith('/') === false || href.startsWith('//'))
  {
    return null;
  }
  return href;
};

export { toAppPath };
