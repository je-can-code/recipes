import { useEffect, useState } from 'react';

/**
 * Keeps the screen from dimming while wanted is true, wherever the browser allows it. Browsers only allow
 * it on a secure page (https, or localhost), so over plain http it does nothing and the screen behaves as
 * it always does. The browser drops the lock whenever the page is hidden, so it's asked for again each time
 * the page comes back.
 * @param {boolean} wanted Whether the screen should stay on right now.
 * @returns {boolean} Whether the screen is actually being kept on.
 */
const useWakeLock = (wanted: boolean): boolean =>
{
  const [ isHeld, setIsHeld ] = useState(false);

  useEffect(() =>
  {
    if (wanted === false || ('wakeLock' in navigator) === false)
    {
      return undefined;
    }

    let lock: WakeLockSentinel | null = null;
    let isOver = false;

    /**
     * Asks for the lock, letting go of it at once if it arrives after the screen stopped needing it.
     */
    const ask = (): void =>
    {
      navigator.wakeLock.request('screen')
        .then((granted) =>
        {
          if (isOver)
          {
            void granted.release();
            return;
          }
          lock = granted;
          setIsHeld(true);
          granted.addEventListener('release', () => setIsHeld(false));
        })
        .catch(() => setIsHeld(false));
    };

    /**
     * Asks again when the page comes back into view without a lock.
     */
    const askOnReturn = (): void =>
    {
      if (document.visibilityState === 'visible' && (lock === null || lock.released))
      {
        ask();
      }
    };

    ask();
    document.addEventListener('visibilitychange', askOnReturn);
    return () =>
    {
      isOver = true;
      document.removeEventListener('visibilitychange', askOnReturn);
      if (lock !== null)
      {
        void lock.release();
      }
      setIsHeld(false);
    };
  }, [ wanted ]);

  return isHeld;
};

export { useWakeLock };
