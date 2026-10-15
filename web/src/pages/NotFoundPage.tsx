import { Link } from 'react-router-dom';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * The page for an address the site doesn't have.
 * @returns {React.JSX.Element} The not-found page.
 */
const NotFoundPage = (): React.JSX.Element =>
{
  useDocumentTitle('Recipes');

  return (
    <div className="page">
      <header className="page-header">
        <Wordmark size="small" />
      </header>
      <main className="missing">
        <StatusMessage text="There's nothing at this address." isError={false} />
        <Link to="/">Back to every recipe</Link>
      </main>
    </div>
  );
};

export { NotFoundPage };
