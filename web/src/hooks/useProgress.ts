import { useState } from 'react';
import { emptyProgress, isComplete, loadProgress, saveProgress, toggleIngredient, toggleStep } from '../services/progress';
import type { Progress } from '../services/progress';
import { browserStorage } from '../services/storage';

/**
 * One recipe's progress, whether it's mid-party, and the ways to change it.
 */
interface ProgressControls
{
  progress: Progress;
  isCelebrating: boolean;
  checkIngredient: (id: string) => void;
  checkStep: (index: number) => void;
  startOver: () => void;
  stopCelebrating: () => void;
}

/**
 * Tracks how far along one recipe is, saving every change, so a reload or a trip to another page picks up
 * where the cook left off. It celebrates the moment the last step is done, and only then: opening a recipe
 * that's already finished shows it finished, without throwing a party every time.
 * @param {string} slug The recipe's name.
 * @param {number} stepCount How many steps it has.
 * @returns {ProgressControls} The progress, and the ways to change it.
 */
const useProgress = (slug: string, stepCount: number): ProgressControls =>
{
  const [ progress, setProgress ] = useState<Progress>(() => loadProgress(browserStorage(), slug, Date.now()));
  const [ isCelebrating, setIsCelebrating ] = useState(false);

  /**
   * Shows new progress and saves it.
   * @param {Progress} next The new progress.
   */
  const keep = (next: Progress): void =>
  {
    setProgress(next);
    saveProgress(browserStorage(), slug, next, Date.now());
  };

  return {
    progress,
    isCelebrating,
    checkIngredient: (id: string): void =>
    {
      keep(toggleIngredient(progress, id));
    },
    checkStep: (index: number): void =>
    {
      // the party is for finishing, so only the tap that completes the last step starts one.
      const next = toggleStep(progress, index);
      if (isComplete(progress, stepCount) === false && isComplete(next, stepCount))
      {
        setIsCelebrating(true);
      }
      keep(next);
    },
    startOver: (): void =>
    {
      setIsCelebrating(false);
      keep(emptyProgress());
    },
    stopCelebrating: (): void =>
    {
      setIsCelebrating(false);
    },
  };
};

export { useProgress };
export type { ProgressControls };
