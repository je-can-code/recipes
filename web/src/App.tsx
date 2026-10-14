import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RecipePage } from './pages/RecipePage';
import { SearchPage } from './pages/SearchPage';

/**
 * Every page on the site, by address. The Go server answers each of these paths with this same app, so
 * this table is the one place that decides what an address shows.
 * @returns {React.JSX.Element} The page for the current address.
 */
const App = (): React.JSX.Element =>
{
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/recipes/:slug" element={<RecipePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export { App };
