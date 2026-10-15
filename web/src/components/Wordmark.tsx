import { Link } from 'react-router-dom';

/**
 * The site's name, one letter at a time. "Recipes" has seven letters, so each gets one color of the
 * rainbow, in order.
 */
const letters = [ 'R', 'e', 'c', 'i', 'p', 'e', 's' ];

/**
 * How big the name is drawn: large on the home page, small in the header of every other page.
 */
interface WordmarkProps
{
  size: 'large' | 'small';
}

/**
 * The site's name in rainbow letters, linking home.
 * @param {WordmarkProps} props How big to draw it.
 * @returns {React.JSX.Element} The name.
 */
const Wordmark = ({ size }: WordmarkProps): React.JSX.Element =>
{
  return (
    <Link
      to="/"
      className={`wordmark wordmark-${size}`}
      aria-label="Recipes, home"
    >
      {letters.map((letter, index) =>
      {
        return (
          <span key={index} className={`rainbow-${index}`}>{letter}</span>
        );
      })}
    </Link>
  );
};

export { Wordmark };
