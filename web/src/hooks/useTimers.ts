import { useEffect, useRef, useState } from 'react';
import { chime } from '../services/chime';
import { browserStorage } from '../services/storage';
import { isRinging, loadTimers, saveTimers, startTimer, stopTimer } from '../services/timers';
import type { Timer } from '../services/timers';

/**
 * One recipe's timers, the time they're shown against, and the ways to start and stop them.
 */
interface TimerControls
{
  timers: Timer[];
  now: number;
  start: (name: string, label: string, seconds: number) => void;
  stop: (id: string) => void;
}

/**
 * Runs one recipe's kitchen timers. They're saved as they change, so leaving the page doesn't lose them,
 * and each one chimes once, the first time it's seen finished. A phone that locked can't chime on time,
 * since the browser stops the page while it's hidden, so it chimes the moment the page is looked at again.
 * @param {string} slug The recipe's name.
 * @returns {TimerControls} The timers, and the ways to start and stop them.
 */
const useTimers = (slug: string): TimerControls =>
{
  const [ timers, setTimers ] = useState<Timer[]>(() => loadTimers(browserStorage(), slug, Date.now()));
  const [ now, setNow ] = useState(() => Date.now());
  const rung = useRef(new Set<string>());

  // the clock only ticks while there's a timer to show it on.
  useEffect(() =>
  {
    if (timers.length === 0)
    {
      return undefined;
    }
    const ticker = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(ticker);
  }, [ timers.length ]);

  // a page coming back from the background catches up at once, rather than on the next tick.
  useEffect(() =>
  {
    const catchUp = (): void =>
    {
      if (document.visibilityState === 'visible')
      {
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', catchUp);
    return () => document.removeEventListener('visibilitychange', catchUp);
  }, []);

  // one chime for however many timers finished since the last look, and never twice for the same timer.
  useEffect(() =>
  {
    const finished = timers.filter((timer) => isRinging(timer, now) && rung.current.has(timer.id) === false);
    if (finished.length === 0)
    {
      return;
    }
    finished.forEach((timer) => rung.current.add(timer.id));
    chime.play();
  }, [ timers, now ]);

  /**
   * Shows new timers and saves them.
   * @param {Timer[]} next Every timer.
   */
  const keep = (next: Timer[]): void =>
  {
    setTimers(next);
    saveTimers(browserStorage(), slug, next);
  };

  return {
    timers,
    now,
    start: (name: string, label: string, seconds: number): void =>
    {
      // this runs inside the tap on the timer, which is the only moment iOS lets the chime get ready.
      chime.ready();
      const time = Date.now();
      setNow(time);
      keep(startTimer(timers, name, label, seconds, time));
    },
    stop: (id: string): void =>
    {
      keep(stopTimer(timers, id));
    },
  };
};

export { useTimers };
export type { TimerControls };
