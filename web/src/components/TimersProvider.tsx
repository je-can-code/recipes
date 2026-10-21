import { useKitchenTimers } from '../hooks/useKitchenTimers';
import { TimersContext } from '../hooks/useTimers';

/**
 * What the provider wraps.
 */
interface TimersProviderProps
{
  children: React.ReactNode;
}

/**
 * Runs the kitchen's timers once, for the whole app, so a timer started on one recipe keeps ticking, and
 * chimes, on every other page.
 * @param {TimersProviderProps} props The app it wraps.
 * @returns {React.JSX.Element} The app, with its timers.
 */
const TimersProvider = ({ children }: TimersProviderProps): React.JSX.Element =>
{
  const controls = useKitchenTimers();
  return <TimersContext value={controls}>{children}</TimersContext>;
};

export { TimersProvider };
