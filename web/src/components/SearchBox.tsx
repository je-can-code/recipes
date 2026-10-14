import { useEffect, useRef } from 'react';

/**
 * What the search box shows, what to do as it changes, and whether it takes focus when it appears.
 */
interface SearchBoxProps
{
  value: string;
  onChange: (text: string) => void;
  autoFocus: boolean;
}

/**
 * The search box. It never submits anything: searching happens as the typing does.
 * @param {SearchBoxProps} props The value, the change handler, and whether to take focus.
 * @returns {React.JSX.Element} The search box.
 */
const SearchBox = ({ value, onChange, autoFocus }: SearchBoxProps): React.JSX.Element =>
{
  const input = useRef<HTMLInputElement>(null);

  // arriving from the home page mid-word, the cursor belongs after what was already typed, not before it.
  useEffect(() =>
  {
    const element = input.current;
    if (autoFocus === false || element === null)
    {
      return;
    }
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [ autoFocus ]);

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
        placeholder="Search by name, tag or collection"
        aria-label="Search recipes"
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) =>
        {
          onChange(event.target.value);
        }}
      />
    </form>
  );
};

export { SearchBox };
