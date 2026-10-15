import { useEffect } from 'react';

/**
 * Names the browser tab after the page, so a tab parked on a recipe says which one.
 * @param {string} title What the tab should say.
 */
const useDocumentTitle = (title: string): void =>
{
  useEffect(() =>
  {
    document.title = title;
  }, [ title ]);
};

export { useDocumentTitle };
