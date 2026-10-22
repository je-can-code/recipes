import { useArmed } from '../hooks/useArmed';
import { currentStep, isComplete, isStarted } from '../services/progress';
import type { Progress } from '../services/progress';
import { questDetail, questLabel, questPercent, restartLabel } from '../services/quest';
import type { Timer } from '../services/timers';
import { Icon } from './Icons';
import { TimerChips } from './TimerChips';

/**
 * Everything the tracker shows, and what its buttons do.
 */
interface QuestTrackerProps
{
  slug: string;
  stepLeads: string[];
  ingredientCount: number;
  progress: Progress;
  timers: Timer[];
  now: number;
  isScreenKeptOn: boolean;
  onJumpToStep: (index: number) => void;
  onStopTimer: (id: string) => void;
  onStartOver: () => void;
}

/**
 * The quest tracker pinned to the bottom of a recipe: which step is next, a rainbow bar that fills as steps
 * get done, every running timer, from this recipe or any other, and a way to start over. Tapping the
 * objective scrolls to that step. The buttons that throw something away, stopping a running timer or
 * starting over midway, take a second tap.
 * @param {QuestTrackerProps} props What to show, and what the buttons do.
 * @returns {React.JSX.Element} The tracker.
 */
const QuestTracker = (props: QuestTrackerProps): React.JSX.Element =>
{
  const { stepLeads, ingredientCount, progress, timers, now, isScreenKeptOn } = props;
  const stepCount = stepLeads.length;
  const isFinished = isComplete(progress, stepCount);
  const [ armed, arm ] = useArmed();

  return (
    <aside className={isFinished ? 'quest quest-complete' : 'quest'} aria-label="Quest tracker">
      <div className="quest-inner">
        {timers.length > 0 && (
          <TimerChips timers={timers} now={now} slug={props.slug} armed={armed} onArm={arm} onStop={props.onStopTimer} />
        )}

        <div className="quest-row">
          <button
            type="button"
            className="quest-objective"
            disabled={isFinished}
            onClick={() => props.onJumpToStep(currentStep(progress, stepCount))}
          >
            <span className="quest-label">
              {questLabel(progress, stepCount, ingredientCount)}
              {isScreenKeptOn && <span className="quest-awake"><Icon name="sun" /> screen on</span>}
            </span>
            <span className="quest-detail" dangerouslySetInnerHTML={{ __html: questDetail(progress, stepLeads) }} />
          </button>
          {isStarted(progress) && (
            <button
              type="button"
              className={armed === 'start-over' ? 'quest-restart quest-restart-armed' : 'quest-restart'}
              onClick={() =>
              {
                // a finished recipe has nothing left to lose, so it starts over on the first tap.
                if (isFinished || armed === 'start-over')
                {
                  arm('');
                  props.onStartOver();
                  return;
                }
                arm('start-over');
              }}
            >
              <Icon name="restart" />
              <span>{restartLabel(isFinished, armed === 'start-over')}</span>
            </button>
          )}
        </div>

        <div
          className="quest-bar"
          role="progressbar"
          aria-label="Steps done"
          aria-valuemin={0}
          aria-valuemax={stepCount}
          aria-valuenow={progress.steps.length}
        >
          <div className="quest-unfilled" style={{ width: `${100 - questPercent(progress, stepCount)}%` }} />
        </div>
      </div>
    </aside>
  );
};

export { QuestTracker };
