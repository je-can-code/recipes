import { useEffect, useState } from 'react';

/**
 * How long a button waits for its second tap before it gives up asking.
 */
const confirmWindow = 3000;

/**
 * Remembers which button is waiting for a second tap to confirm it, and forgets after a few seconds. The
 * buttons that throw something away use it, so a stray tap from a messy hand never costs anything.
 * @returns {[ string, (id: string) => void ]} The armed button's id, or '' for none, and the way to arm one.
 */
const useArmed = (): [ string, (id: string) => void ] =>
{
  const [ armed, setArmed ] = useState('');

  useEffect(() =>
  {
    if (armed === '')
    {
      return undefined;
    }
    const timeout = window.setTimeout(() => setArmed(''), confirmWindow);
    return () => window.clearTimeout(timeout);
  }, [ armed ]);

  return [ armed, setArmed ];
};

export { useArmed };
