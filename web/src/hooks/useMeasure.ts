import { useMemo, useState } from 'react';
import type { MeasureSystem } from '../services/amounts';
import { loadFactor, loadSystem, saveFactor, saveSystem } from '../services/measures';
import type { Measure } from '../services/measures';
import { browserStorage } from '../services/storage';

/**
 * One recipe's batch size and the site's measuring system, and the ways to change them.
 */
interface MeasureControls
{
  measure: Measure;
  chooseFactor: (factor: number) => void;
  chooseSystem: (system: MeasureSystem) => void;
}

/**
 * Remembers the batch size a cook chose for one recipe, for a day, and the measuring system chosen for the
 * whole site, saving each change as it's made. The measure keeps its identity until one of them changes, so
 * the recipe isn't measured again on every tick of a timer.
 * @param {string} slug The recipe's name.
 * @returns {MeasureControls} The measure, and the ways to change it.
 */
const useMeasure = (slug: string): MeasureControls =>
{
  const [ factor, setFactor ] = useState(() => loadFactor(browserStorage(), slug, Date.now()));
  const [ system, setSystem ] = useState<MeasureSystem>(() => loadSystem(browserStorage()));
  const measure = useMemo(() => ({ factor, system }), [ factor, system ]);

  return {
    measure,
    chooseFactor: (next: number): void =>
    {
      setFactor(next);
      saveFactor(browserStorage(), slug, next, Date.now());
    },
    chooseSystem: (next: MeasureSystem): void =>
    {
      setSystem(next);
      saveSystem(browserStorage(), next);
    },
  };
};

export { useMeasure };
export type { MeasureControls };
