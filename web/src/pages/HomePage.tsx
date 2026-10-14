import { useNavigate } from 'react-router-dom';
import { ProblemsBanner } from '../components/ProblemsBanner';
import { RecipeLinks } from '../components/RecipeLinks';
import { SearchBox } from '../components/SearchBox';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { groupByCollection } from '../services/collections';

/**
 * The home page: the name and a search box in the middle of a quiet page, with every recipe listed
 * underneath, grouped by collection.
 * @returns {React.JSX.Element} The home page.
 */
const HomePage = (): React.JSX.Element =>
{
  const navigate = useNavigate();
  const state = useCatalog();
  useDocumentTitle('Recipes');

  // the first letter typed moves to the results page, which carries on filtering as the typing does.
  const startSearch = (text: string): void =>
  {
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };

  return (
    <main className="home">
      {state.status === 'ready' && <ProblemsBanner problems={state.catalog.problems} />}
      <div className="home-hero">
        <Wordmark size="large" />
        <SearchBox value="" onChange={startSearch} autoFocus={false} />
      </div>

      {state.status === 'loading' && <StatusMessage text="Loading the recipes..." isError={false} />}
      {state.status === 'failed' && <StatusMessage text={state.error} isError={true} />}
      {state.status === 'ready' && groupByCollection(state.catalog.recipes).map((group) =>
      {
        return (
          <section key={group.name} className="collection">
            <h2>{group.label}</h2>
            <RecipeLinks recipes={group.recipes} showCollection={false} />
          </section>
        );
      })}
    </main>
  );
};

export { HomePage };
