import { createContext, useContext } from 'react';
import type { TimerControls } from './useKitchenTimers';

/**
 * Where the app's one set of timers is shared, filled in by TimersProvider.
 */
const TimersContext = createContext<TimerControls | null>(null);

/**
 * The kitchen's timers, shared by every page. Without a TimersProvider around the app there are none to share,
 * which is a wiring mistake, so it fails loudly rather than quietly starting a second set.
 * @returns {TimerControls} The timers, and the ways to start and stop them.
 */
const useTimers = (): TimerControls =>
{
  const controls = useContext(TimersContext);
  if (controls === null)
  {
    throw new Error('useTimers needs a TimersProvider around the app.');
  }
  return controls;
};

export { TimersContext, useTimers };
