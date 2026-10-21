import { useMatch } from 'react-router-dom';
import { useTimers } from '../hooks/useTimers';
import { useWakeLock } from '../hooks/useWakeLock';
import { TimerChips } from './TimerChips';

/**
 * The running timers, pinned to the bottom of every page but a recipe's, where the quest tracker shows them
 * instead. Every chip leads back to its recipe, and the screen stays on while a timer runs.
 * @returns {React.JSX.Element | null} The dock, or nothing while no timer runs or a recipe is open.
 */
const TimerDock = (): React.JSX.Element | null =>
{
  const { timers, now } = useTimers();
  const isOnRecipe = useMatch('/recipes/:slug') !== null;
  const isShowing = isOnRecipe === false && timers.length > 0;
  useWakeLock(isShowing);

  if (isShowing === false)
  {
    return null;
  }
  return (
    <aside className="quest timer-dock" aria-label="Running timers">
      <div className="quest-inner">
        <TimerChips timers={timers} now={now} slug="" armed="" onArm={ignore} onStop={ignore} />
      </div>
    </aside>
  );
};

/**
 * What arming or stopping does in the dock, which is nothing: off a recipe's page every chip is a link back
 * to its recipe, where it can be stopped.
 */
const ignore = (): void =>
{
  // every chip in the dock is a link, so nothing here arms or stops.
};

export { TimerDock };
