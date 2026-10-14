import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RecipeArticle } from '../components/RecipeArticle';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRecipe } from '../hooks/useRecipe';
import { toAppPath } from '../services/links';

/**
 * One recipe's page.
 * @returns {React.JSX.Element} The recipe page.
 */
const RecipePage = (): React.JSX.Element =>
{
  const { slug = '' } = useParams();
  const state = useRecipe(slug);
  const navigate = useNavigate();

  // a new recipe starts at its top, and the tab says which recipe it is.
  useEffect(() =>
  {
    window.scrollTo(0, 0);
  }, [ slug ]);
  useDocumentTitle(state.status === 'ready' ? state.recipe.title : 'Recipes');

  // links inside a recipe are plain HTML from the server, so the ones to this site are kept in the app.
  const followLink = (event: React.MouseEvent<HTMLElement>): void =>
  {
    const link = (event.target as HTMLElement).closest('a');
    const path = toAppPath(link === null ? null : link.getAttribute('href'));
    if (path === null || event.metaKey || event.ctrlKey || event.shiftKey)
    {
      return;
    }
    event.preventDefault();
    navigate(path);
  };

  return (
    <div className="page">
      <header className="page-header">
        <Wordmark size="small" />
      </header>

      <main onClick={followLink}>
        {state.status === 'loading' && <StatusMessage text="Loading the recipe..." isError={false} />}
        {state.status === 'failed' && <StatusMessage text={state.error} isError={true} />}
        {state.status === 'missing' && (
          <div className="missing">
            <StatusMessage text={`There's no recipe called "${slug}".`} isError={false} />
            <Link to="/">Back to every recipe</Link>
          </div>
        )}
        {state.status === 'ready' && <RecipeArticle recipe={state.recipe} />}
      </main>
    </div>
  );
};

export { RecipePage };
