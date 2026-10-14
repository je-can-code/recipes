import { useSearchParams } from 'react-router-dom';
import { ProblemsBanner } from '../components/ProblemsBanner';
import { RecipeLinks } from '../components/RecipeLinks';
import { SearchBox } from '../components/SearchBox';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { searchRecipes } from '../services/search';

/**
 * The results page. The list filters as the typing goes, and the address keeps up with the box, so the
 * back button and a shared link both land on the same results.
 * @returns {React.JSX.Element} The results page.
 */
const SearchPage = (): React.JSX.Element =>
{
  const [ parameters, setParameters ] = useSearchParams();
  const query = parameters.get('q') ?? '';
  const state = useCatalog();
  useDocumentTitle(query === '' ? 'Search · Recipes' : `${query} · Recipes`);

  // replace the address rather than adding to history, or every letter would need its own back press.
  const updateQuery = (text: string): void =>
  {
    setParameters(text === '' ? {} : { q: text }, { replace: true });
  };

  return (
    <div className="page">
      <header className="page-header">
        <Wordmark size="small" />
        <SearchBox value={query} onChange={updateQuery} autoFocus={true} />
      </header>

      <main className="results">
        {state.status === 'loading' && <StatusMessage text="Loading the recipes..." isError={false} />}
        {state.status === 'failed' && <StatusMessage text={state.error} isError={true} />}
        {state.status === 'ready' && <ProblemsBanner problems={state.catalog.problems} />}
        {state.status === 'ready' && <Results query={query} matches={searchRecipes(state.catalog.recipes, query)} />}
      </main>
    </div>
  );
};

/**
 * What was searched for, and what matched.
 */
interface ResultsProps
{
  query: string;
  matches: ReturnType<typeof searchRecipes>;
}

/**
 * The count of matches and the matches themselves, or a plain note when nothing matched.
 * @param {ResultsProps} props The search and its matches.
 * @returns {React.JSX.Element} The results.
 */
const Results = ({ query, matches }: ResultsProps): React.JSX.Element =>
{
  if (matches.length === 0)
  {
    return <StatusMessage text={`No recipes match "${query}".`} isError={false} />;
  }

  return (
    <>
      <p className="result-count">{matches.length === 1 ? '1 recipe' : `${matches.length} recipes`}</p>
      <RecipeLinks recipes={matches} showCollection={true} />
    </>
  );
};

export { SearchPage };
