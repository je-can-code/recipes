import { Route, Routes } from 'react-router-dom';
import { TimerDock } from './components/TimerDock';
import { TimersProvider } from './components/TimersProvider';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RecipePage } from './pages/RecipePage';
import { SearchRedirect } from './pages/SearchRedirect';

/**
 * Every page on the site, by address, with the kitchen's timers running around all of them and a dock for the
 * timers on every page but a recipe's. The Go server answers each of these paths with this same app, so this
 * table is the one place that decides what an address shows.
 * @returns {React.JSX.Element} The page for the current address.
 */
const App = (): React.JSX.Element =>
{
  return (
    <TimersProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchRedirect />} />
        <Route path="/recipes/:slug" element={<RecipePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <TimerDock />
    </TimersProvider>
  );
};

export { App };
