import { useProgress } from '../hooks/useProgress';
import { useTimers } from '../hooks/useTimers';
import { useWakeLock } from '../hooks/useWakeLock';
import { countIngredients, isCooking } from '../services/quest';
import type { RecipeDetail } from '../types';
import { Confetti } from './Confetti';
import { QuestTracker } from './QuestTracker';
import { RecipeArticle } from './RecipeArticle';

/**
 * The recipe to cook.
 */
interface CookingRecipeProps
{
  recipe: RecipeDetail;
}

/**
 * A recipe to cook along with: the recipe itself, checking off as it's tapped, the quest tracker following
 * along at the bottom, kitchen timers, the screen kept on mid-cook wherever the browser allows it, and
 * confetti for the last step. Give it a key per recipe, so moving to another recipe starts that recipe's
 * own quest rather than carrying this one's over.
 * @param {CookingRecipeProps} props The recipe.
 * @returns {React.JSX.Element} The recipe, the tracker, and any party in progress.
 */
const CookingRecipe = ({ recipe }: CookingRecipeProps): React.JSX.Element =>
{
  const stepCount = recipe.method.steps.length;
  const cooking = useProgress(recipe.slug, stepCount);
  const kitchen = useTimers(recipe.slug);
  const isScreenKeptOn = useWakeLock(isCooking(cooking.progress, stepCount) || kitchen.timers.length > 0);

  return (
    <>
      <RecipeArticle
        recipe={recipe}
        progress={cooking.progress}
        onCheckIngredient={cooking.checkIngredient}
        onCheckStep={cooking.checkStep}
        onStartTimer={kitchen.start}
      />
      <QuestTracker
        stepLeads={recipe.method.steps.map((step) => step.lead)}
        ingredientCount={countIngredients(recipe.ingredients)}
        progress={cooking.progress}
        timers={kitchen.timers}
        now={kitchen.now}
        isScreenKeptOn={isScreenKeptOn}
        onJumpToStep={jumpToStep}
        onStopTimer={kitchen.stop}
        onStartOver={cooking.startOver}
      />
      {cooking.isCelebrating && <Confetti onDone={cooking.stopCelebrating} />}
    </>
  );
};

/**
 * Brings a step to the middle of the screen, gliding there unless the device asks for less motion.
 * @param {number} index The step's place in the method, from 0.
 */
const jumpToStep = (index: number): void =>
{
  const step = document.getElementById(`step-${index + 1}`);
  if (step === null)
  {
    return;
  }
  const isCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  step.scrollIntoView({ behavior: isCalm ? 'auto' : 'smooth', block: 'center' });
};

export { CookingRecipe };
