import { Link, useSearchParams } from 'react-router-dom';
import { CourseList } from '../components/CourseList';
import { ProblemsBanner } from '../components/ProblemsBanner';
import { SearchBox } from '../components/SearchBox';
import { ShelfChips } from '../components/ShelfChips';
import { StatusMessage } from '../components/StatusMessage';
import { Wordmark } from '../components/Wordmark';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOpenCourses } from '../hooks/useOpenCourses';
import { searchRecipes } from '../services/search';
import {
  barBackground,
  buildShelves,
  describeCount,
  groupByCourse,
  headingFor,
  homeAddress,
  homeParameters,
  isSearching,
  litShelves,
  offersEverything,
  pageTitle,
  recipesOn,
  toggleShelf,
} from '../services/shelves';
import type { Shelf } from '../services/shelves';
import type { RecipeSummary } from '../types';

/**
 * The home page: the name and the search box, a chip for every shelf, and the recipes the lit shelves hold
 * between them, split into courses. The address holds the lit shelves and the search, so the back button
 * and a shared link land on the same list. Once something is typed, the top of the page shrinks, keeping the
 * results above a phone's keyboard.
 * @returns {React.JSX.Element} The home page.
 */
const HomePage = (): React.JSX.Element =>
{
  const [ parameters, setParameters ] = useSearchParams();
  const query = parameters.get('q') ?? '';
  const state = useCatalog();
  const [ openCourses, toggleCourse ] = useOpenCourses();
  const shelves = state.status === 'ready' ? buildShelves(state.catalog) : [];
  const lit = litShelves(shelves, parameters.getAll('shelf'));
  const litKeys = lit.map((shelf) => shelf.key);
  useDocumentTitle(pageTitle(lit, query));

  // every tap and keystroke replaces the address rather than adding to history, or each would need its
  // own press of the back button.
  const show = (keys: string[], text: string): void =>
  {
    setParameters(homeParameters(keys, text), { replace: true });
  };

  return (
    <main className={query === '' ? 'home' : 'home home-searching'}>
      {state.status === 'ready' && <ProblemsBanner problems={state.catalog.problems} />}
      <div className="home-hero">
        <Wordmark size={query === '' ? 'large' : 'small'} />
        <SearchBox
          value={query}
          onChange={(text) =>
          {
            show(litKeys, text);
          }}
        />
      </div>

      {state.status === 'loading' && <StatusMessage text="Loading the recipes..." isError={false} />}
      {state.status === 'failed' && <StatusMessage text={state.error} isError={true} />}
      {state.status === 'ready' && (
        <ShelfChips
          shelves={shelves}
          lit={lit}
          query={query}
          onToggle={(key) =>
          {
            show(toggleShelf(shelves, litKeys, key), query);
          }}
        />
      )}
      {state.status === 'ready' && (
        <ShelfContents
          shelves={shelves}
          lit={lit}
          query={query}
          recipes={searchRecipes(recipesOn(state.catalog.recipes, lit), query)}
          openCourses={openCourses}
          onToggleCourse={toggleCourse}
        />
      )}
    </main>
  );
};

/**
 * Every shelf, the lit ones, the search, the recipes left to show, and the courses' state.
 */
interface ShelfContentsProps
{
  shelves: Shelf[];
  lit: Shelf[];
  query: string;
  recipes: RecipeSummary[];
  openCourses: string[];
  onToggleCourse: (heading: string) => void;
}

/**
 * The list's name, beside a bar in the lit chips' colors, and its count, then the recipes by course. When
 * the lit shelves have nothing matching the search, a link offers the same search over everything.
 * @param {ShelfContentsProps} props What to show.
 * @returns {React.JSX.Element} The list.
 */
const ShelfContents = (props: ShelfContentsProps): React.JSX.Element =>
{
  const { shelves, lit, query, recipes, openCourses, onToggleCourse } = props;

  return (
    <section className="shelf">
      <header className="shelf-header">
        <span className="shelf-bar" style={{ background: barBackground(shelves, lit) }} aria-hidden="true" />
        <div>
          <h2>{headingFor(lit)}</h2>
          <p className="shelf-count">{describeCount(recipes.length, query)}</p>
          {offersEverything(recipes.length, lit, query) && (
            <Link className="shelf-widen" to={homeAddress([], query)} replace={true}>Search everything</Link>
          )}
        </div>
      </header>

      <CourseList
        groups={groupByCourse(recipes)}
        open={openCourses}
        isSearching={isSearching(query)}
        onToggle={onToggleCourse}
      />
    </section>
  );
};

export { HomePage };
