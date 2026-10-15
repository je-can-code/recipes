import { chipCount, hueOf } from '../services/shelves';
import type { Shelf } from '../services/shelves';
import { Icon } from './Icons';

/**
 * Every shelf, the lit ones, what's in the search box, and what a tap on a chip does.
 */
interface ShelfChipsProps
{
  shelves: Shelf[];
  lit: Shelf[];
  query: string;
  onToggle: (key: string) => void;
}

/**
 * A row of chips, one per shelf, each in its own color of the rainbow and carrying how many of its recipes
 * match the search, which is all of them until something is typed. A tap lights a chip up, filled with its
 * color and wearing a little cross, and another tap puts it out. Lit chips combine, and with none lit,
 * everything shows.
 * @param {ShelfChipsProps} props The shelves, the lit ones, the search, and the toggle.
 * @returns {React.JSX.Element} The chips.
 */
const ShelfChips = ({ shelves, lit, query, onToggle }: ShelfChipsProps): React.JSX.Element =>
{
  return (
    <nav className="shelf-chips" aria-label="Shelves">
      {shelves.map((shelf, position) =>
      {
        const isLit = lit.includes(shelf);
        return (
          <button
            key={shelf.key}
            type="button"
            className={`shelf-chip hue-${hueOf(position)}`}
            aria-pressed={isLit}
            onClick={() =>
            {
              onToggle(shelf.key);
            }}
          >
            <span>{shelf.label}</span>
            <span className="shelf-chip-count">{chipCount(shelf, query)}</span>
            {isLit && <Icon name="close" />}
          </button>
        );
      })}
    </nav>
  );
};

export { ShelfChips };
