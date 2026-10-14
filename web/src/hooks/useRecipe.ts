import { useEffect, useState } from 'react';
import { fetchRecipe } from '../services/api';
import type { RecipeDetail } from '../types';

/**
 * Where one recipe stands: on its way, here, not a recipe at all, or failed with the reason why.
 */
type RecipeState =
  | { status: 'loading' }
  | { status: 'ready'; recipe: RecipeDetail }
  | { status: 'missing' }
  | { status: 'failed'; error: string };

/**
 * Loads one recipe, and loads again whenever the page moves to a different one.
 * @param {string} slug The recipe's name, from the page's address.
 * @returns {RecipeState} The recipe's current state.
 */
const useRecipe = (slug: string): RecipeState =>
{
  const [ state, setState ] = useState<RecipeState>({ status: 'loading' });

  useEffect(() =>
  {
    // an answer for a recipe the page has already moved on from must not replace the new one.
    let isShowing = true;
    setState({ status: 'loading' });

    fetchRecipe(slug)
      .then((recipe) =>
      {
        if (isShowing)
        {
          setState(recipe === null ? { status: 'missing' } : { status: 'ready', recipe });
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
  }, [ slug ]);

  return state;
};

export { useRecipe };
export type { RecipeState };
