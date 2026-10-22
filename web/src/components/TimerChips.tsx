import { Link } from 'react-router-dom';
import { timerChipLines, timerChipText } from '../services/quest';
import { byUrgency, isRinging } from '../services/timers';
import type { Timer } from '../services/timers';
import { Icon } from './Icons';

/**
 * The timers to show, the recipe on screen, and what a chip's taps do.
 */
interface TimerChipsProps
{
  timers: Timer[];
  now: number;
  slug: string;
  armed: string;
  onArm: (id: string) => void;
  onStop: (id: string) => void;
}

/**
 * Every running timer as a chip, soonest first, scrolling sideways when there are a lot of them. A timer from
 * the recipe on screen stops on a tap once it rings, and on a second tap while it runs, since a stray tap from
 * a messy hand shouldn't cost a timer. A timer from any other recipe says whose it is, and a tap goes there.
 * @param {TimerChipsProps} props The timers, the recipe on screen, and what taps do.
 * @returns {React.JSX.Element} The chips.
 */
const TimerChips = (props: TimerChipsProps): React.JSX.Element =>
{
  const { timers, now, slug, armed } = props;

  return (
    <ul className="quest-timers">
      {byUrgency(timers).map((timer) =>
      {
        const isRingingNow = isRinging(timer, now);
        const isArmed = armed === timer.id;
        const lines = timerChipLines(timer, slug);
        const face = (
          <>
            <Icon name="clock" />
            <span className="timer-chip-clock">{timerChipText(timer, now, isArmed)}</span>
            <span className={lines.length > 1 ? 'timer-chip-label timer-chip-label-stacked' : 'timer-chip-label'}>
              {lines.map((line, index) => <span key={index} className="timer-chip-name">{line}</span>)}
            </span>
          </>
        );

        // another recipe's timer is a way back to that recipe, where it can be stopped.
        if (timer.slug !== slug)
        {
          return (
            <li key={timer.id}>
              <Link
                to={`/recipes/${timer.slug}`}
                className={timerChipClass(isRingingNow, false)}
                aria-label={`Go to ${timer.title}, for its ${timer.label} timer`}
              >
                {face}
                <Icon name="chevron" />
              </Link>
            </li>
          );
        }

        return (
          <li key={timer.id}>
            <button
              type="button"
              className={timerChipClass(isRingingNow, isArmed)}
              aria-label={isRingingNow ? `Dismiss the ${timer.label} timer` : `Stop the ${timer.label} timer`}
              onClick={() =>
              {
                // a ringing timer goes on the first tap; a running one asks first.
                if (isRingingNow || isArmed)
                {
                  props.onStop(timer.id);
                  return;
                }
                props.onArm(timer.id);
              }}
            >
              {face}
              <Icon name="close" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * The classes for a timer's chip, which change while it rings or waits for a second tap.
 * @param {boolean} isRingingNow Whether it's ringing.
 * @param {boolean} isArmed Whether it's waiting for a second tap.
 * @returns {string} The classes.
 */
const timerChipClass = (isRingingNow: boolean, isArmed: boolean): string =>
{
  if (isRingingNow)
  {
    return 'timer-chip timer-chip-ringing';
  }
  return isArmed ? 'timer-chip timer-chip-armed' : 'timer-chip';
};

export { TimerChips };
