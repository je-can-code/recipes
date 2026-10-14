import type { Problem } from '../types';

/**
 * The problems to show.
 */
interface ProblemsBannerProps
{
  problems: Problem[];
}

/**
 * A red banner listing every problem with the recipe cards, so a broken card is noticed rather than
 * quietly missing from the list.
 * @param {ProblemsBannerProps} props The problems.
 * @returns {React.JSX.Element | null} The banner, or nothing when every card is fine.
 */
const ProblemsBanner = ({ problems }: ProblemsBannerProps): React.JSX.Element | null =>
{
  if (problems.length === 0)
  {
    return null;
  }

  const heading = problems.length === 1
    ? 'A problem with the recipe cards'
    : `${problems.length} problems with the recipe cards`;
  return (
    <aside className="problems" role="alert">
      <strong>{heading}</strong>
      <ul>
        {problems.map((problem, index) =>
        {
          return (
            <li key={index}>
              <code>{problem.file}</code> {problem.message}
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export { ProblemsBanner };
