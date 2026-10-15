import { useRef } from 'react';
import { Icon } from './Icons';

/**
 * What the search box shows, and what to do as it changes.
 */
interface SearchBoxProps
{
  value: string;
  onChange: (text: string) => void;
}

/**
 * The search box: a pill with a rainbow rim that flows and glows while it's in use. It never submits
 * anything, since searching happens as the typing does, and once something is typed, a cross clears it.
 * @param {SearchBoxProps} props The value, and the change handler.
 * @returns {React.JSX.Element} The search box.
 */
const SearchBox = ({ value, onChange }: SearchBoxProps): React.JSX.Element =>
{
  const input = useRef<HTMLInputElement>(null);

  // clearing hands the cursor straight back, so the next search can start without another tap.
  const clear = (): void =>
  {
    onChange('');
    const element = input.current;
    if (element !== null)
    {
      element.focus();
    }
  };

  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(event) =>
      {
        event.preventDefault();
      }}
    >
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
      <input
        ref={input}
        type="search"
        value={value}
        placeholder="What are we cooking?"
        aria-label="Search recipes"
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) =>
        {
          onChange(event.target.value);
        }}
      />
      {value !== '' && (
        <button type="button" className="search-clear" aria-label="Clear the search" onClick={clear}>
          <Icon name="close" />
        </button>
      )}
    </form>
  );
};

export { SearchBox };
