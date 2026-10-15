/**
 * Small line icons, drawn in whatever color the text around them is, at the size of that text.
 */

/**
 * The paths that draw each icon, on a 24 by 24 grid.
 */
const paths = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 5.5l6.5 6.5L9 18.5',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  close: 'M6 6l12 12M18 6L6 18',
  restart: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
};

/**
 * Which icon to draw.
 */
interface IconProps
{
  name: keyof typeof paths;
}

/**
 * One icon. It's decoration, so screen readers skip it; whatever it sits on carries the words.
 * @param {IconProps} props Which icon.
 * @returns {React.JSX.Element} The icon.
 */
const Icon = ({ name }: IconProps): React.JSX.Element =>
{
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
};

export { Icon };
