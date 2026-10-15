import { useEffect, useState } from 'react';
import { fetchCatalog } from '../services/api';
import type { Catalog } from '../types';

/**
 * Where the catalog stands: still on its way, here, or failed with the reason why.
 */
type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: Catalog }
  | { status: 'failed'; error: string };

/**
 * The last catalog fetched. A page shows it straight away while a fresh one loads, so moving from the
 * home page to the results never flashes a loading message, and a card added on disk still shows up.
 */
let lastCatalog: Catalog | null = null;

/**
 * Loads the catalog every time a page using it appears, starting from the last one fetched when there
 * is one.
 * @returns {CatalogState} The catalog's current state.
 */
const useCatalog = (): CatalogState =>
{
  const [ state, setState ] = useState<CatalogState>(startingState);

  useEffect(() =>
  {
    // a page that has gone away by the time the answer arrives must not be updated.
    let isShowing = true;

    fetchCatalog()
      .then((catalog) =>
      {
        lastCatalog = catalog;
        if (isShowing)
        {
          setState({ status: 'ready', catalog });
        }
      })
      .catch((error: Error) =>
      {
        if (isShowing)
        {
          setState({ status: 'failed', error: error.message });
        }
      });

    return () =>
    {
      isShowing = false;
    };
  }, []);

  return state;
};

/**
 * The state a page starts in: the last catalog fetched when there is one, or loading.
 * @returns {CatalogState} The starting state.
 */
const startingState = (): CatalogState =>
{
  if (lastCatalog === null)
  {
    return { status: 'loading' };
  }
  return { status: 'ready', catalog: lastCatalog };
};

export { useCatalog };
export type { CatalogState };
