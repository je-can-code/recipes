import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProblemsBanner } from '../components/ProblemsBanner';
import { RecipeLinks } from '../components/RecipeLinks';
import { SearchBox } from '../components/SearchBox';
import { ShelfChips } from '../components/ShelfChips';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { buildShelves, findShelf, groupByCourse, hueOf } from '../services/shelves';
import type { Shelf } from '../services/shelves';

/**
 * The home page: the name and a search box in the middle of a quiet page, then a chip for every shelf, and
 * the recipes on the shelf showing, split into courses. The address says which shelf is showing, and no
 * shelf named means Home Cooking.
 * @returns {React.JSX.Element} The home page.
 */
const HomePage = (): React.JSX.Element =>
{
  const navigate = useNavigate();
  const [ parameters ] = useSearchParams();
  const state = useCatalog();
  const shelves = state.status === 'ready' ? buildShelves(state.catalog) : [];
  const current = findShelf(shelves, parameters);
  useDocumentTitle(titleFor(current));

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
      {state.status === 'ready' && <ShelfChips shelves={shelves} current={current} />}
      {state.status === 'ready' && current === null && <StatusMessage text={noShelf} isError={false} />}
      {current !== null && <ShelfContents shelf={current} hue={hueOf(shelves.indexOf(current))} />}
    </main>
  );
};

/**
 * The tab's title: the site's name on Home Cooking, and the shelf's name first on any other, so a tab or
 * a bookmark says which shelf it holds.
 * @param {Shelf | null} shelf The shelf showing, or null when the address names one that doesn't exist.
 * @returns {string} The title.
 */
const titleFor = (shelf: Shelf | null): string =>
{
  if (shelf === null || shelf.address === '/')
  {
    return 'Recipes';
  }
  return `${shelf.name} · Recipes`;
};

/**
 * What an address naming a shelf that doesn't exist gets instead, with the chips still above it to pick
 * from.
 */
const noShelf = "There's no shelf at this address. Pick one above.";

/**
 * The shelf to show, and the rainbow color of its chip.
 */
interface ShelfContentsProps
{
  shelf: Shelf;
  hue: number;
}

/**
 * The shelf's name and count, then its recipes under a heading for each course.
 * @param {ShelfContentsProps} props The shelf, and its color.
 * @returns {React.JSX.Element} The shelf's recipes.
 */
const ShelfContents = ({ shelf, hue }: ShelfContentsProps): React.JSX.Element =>
{
  const count = shelf.recipes.length === 1 ? '1 recipe' : `${shelf.recipes.length} recipes`;
  return (
    <section className="shelf">
      <header className={`shelf-header hue-${hue}`}>
        <h2>{shelf.name}</h2>
        <p className="shelf-count">{count}</p>
      </header>

      {groupByCourse(shelf.recipes).map((group) =>
      {
        return (
          <section key={group.heading} className="course">
            <h3>{group.heading}</h3>
            <RecipeLinks recipes={group.recipes} showCollection={false} />
          </section>
        );
      })}
    </section>
  );
};

export { HomePage };
