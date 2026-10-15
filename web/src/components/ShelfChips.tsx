import { Link } from 'react-router-dom';
import { hueOf } from '../services/shelves';
import type { Shelf } from '../services/shelves';

/**
 * Every shelf, and the one showing, or null when the address names a shelf that doesn't exist.
 */
interface ShelfChipsProps
{
  shelves: Shelf[];
  current: Shelf | null;
}

/**
 * A row of chips, one per shelf, each in its own color of the rainbow and carrying its count of recipes.
 * The shelf showing fills in with its color. A tap swaps the address rather than adding to history, the way
 * switching tabs does, so the back button leaves the home page instead of walking back through every shelf
 * looked at on the way.
 * @param {ShelfChipsProps} props Every shelf, and the one showing.
 * @returns {React.JSX.Element} The chips.
 */
const ShelfChips = ({ shelves, current }: ShelfChipsProps): React.JSX.Element =>
{
  return (
    <nav className="shelf-chips" aria-label="Shelves">
      {shelves.map((shelf, position) =>
      {
        return (
          <Link
            key={shelf.address}
            to={shelf.address}
            replace={true}
            className={`shelf-chip hue-${hueOf(position)}`}
            aria-current={shelf === current ? 'page' : undefined}
          >
            <span>{shelf.label}</span>
            <span className="shelf-chip-count">{shelf.recipes.length}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export { ShelfChips };
