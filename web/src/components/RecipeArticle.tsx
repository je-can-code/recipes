import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { MeasureSystem } from '../services/amounts';
import { withTimers } from '../services/durations';
import { withMeasures } from '../services/measures';
import type { Measure, Stop } from '../services/measures';
import { currentStep } from '../services/progress';
import type { Progress } from '../services/progress';
import { homeAddress } from '../services/shelves';
import type { RecipeDetail, RecipeEntry } from '../types';
import { Icon } from './Icons';
import { MeasureBar } from './MeasureBar';

/**
 * The recipe to show, how far along it is, the batch size and measuring system it's shown at, and what a tap
 * on an ingredient, a step, a time or a measure does.
 */
interface RecipeArticleProps
{
  recipe: RecipeDetail;
  progress: Progress;
  measure: Measure;
  stops: Stop[];
  onCheckIngredient: (id: string) => void;
  onCheckStep: (index: number) => void;
  onStartTimer: (name: string, label: string, seconds: number) => void;
  onChooseFactor: (factor: number) => void;
  onChooseSystem: (system: MeasureSystem) => void;
}

/**
 * One recipe laid out for cooking from a phone: what it is and how long it takes up top, then the
 * ingredients, the numbered steps with their bold leads, and the notes. On a wide screen like a tablet,
 * the ingredients sit in a column beside the steps and stay put while the steps scroll. Tapping an
 * ingredient or a step checks it off, the next step to do is highlighted, and every time in the method
 * is a button that starts a timer. Under the serving line, the batch size and the measuring system rewrite
 * every amount on the page, the steps' pointers included. Every text field arrives as HTML the server
 * rendered from the card, so it goes in as HTML rather than being escaped.
 * @param {RecipeArticleProps} props The recipe, its progress, and what taps do.
 * @returns {React.JSX.Element} The recipe page's content.
 */
const RecipeArticle = (props: RecipeArticleProps): React.JSX.Element =>
{
  const { recipe, progress, measure, stops, onCheckIngredient, onCheckStep, onStartTimer } = props;
  const measured = useMemo(() => withMeasures(recipe, measure), [ recipe, measure ]);
  const timed = useMemo(() => withTimers(measured), [ measured ]);
  const yieldText = measured.serves === '' ? `Makes ${measured.makes}` : `Serves ${measured.serves}`;
  const current = currentStep(progress, recipe.method.steps.length);

  return (
    <article className="recipe" onClick={(event) => startTimerFromTap(event, onStartTimer)}>
      <header className="recipe-header">
        <h1>{recipe.title}</h1>
        <div className="rich recipe-intro" dangerouslySetInnerHTML={{ __html: measured.intro }} />
        <p className="recipe-meta">
          <span>{yieldText}</span>
          <span>{recipe.time}</span>
        </p>
        <MeasureBar stops={stops} measure={measure} onChooseFactor={props.onChooseFactor} onChooseSystem={props.onChooseSystem} />
        {recipe.tags.length > 0 && (
          <ul className="tags">
            {recipe.tags.map((tag) =>
            {
              return (
                <li key={tag}>
                  <Link to={homeAddress([], tag)}>{tag}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </header>

      <div className="recipe-body">
        <section className="recipe-ingredients">
          <h2>Ingredients</h2>
          {measured.ingredients.map((group, groupIndex) =>
          {
            return (
              <div key={groupIndex} className="ingredient-group">
                {group.name !== '' && <h3>{group.name}</h3>}
                <ul className="ingredients">
                  {group.items.map((item, itemIndex) =>
                  {
                    const id = `${groupIndex}-${itemIndex}`;
                    const isChecked = progress.ingredients.includes(id);
                    return (
                      <li
                        key={itemIndex}
                        className={isChecked ? 'ingredient-checked' : undefined}
                        role="checkbox"
                        aria-checked={isChecked}
                        tabIndex={0}
                        onClick={(event) =>
                        {
                          if (isOnControl(event) === false)
                          {
                            onCheckIngredient(id);
                          }
                        }}
                        onKeyDown={(event) =>
                        {
                          if (event.key === ' ' || event.key === 'Enter')
                          {
                            event.preventDefault();
                            onCheckIngredient(id);
                          }
                        }}
                        dangerouslySetInnerHTML={{ __html: item }}
                      />
                    );
                  })}
                </ul>
                {group.after !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: group.after }} />}
              </div>
            );
          })}
        </section>

        <div className="recipe-method">
          <section>
            <h2>Method</h2>
            {timed.method.before !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: timed.method.before }} />}
            <ol className="steps">
              {timed.method.steps.map((step, index) =>
              {
                const isDone = progress.steps.includes(index);
                return (
                  <li
                    key={index}
                    id={`step-${index + 1}`}
                    className={stepClass(isDone, index === current)}
                    onClick={(event) =>
                    {
                      if (isOnControl(event) === false)
                      {
                        onCheckStep(index);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="step-number"
                      aria-pressed={isDone}
                      aria-label={`Step ${index + 1} done`}
                      onClick={() => onCheckStep(index)}
                    >
                      {isDone ? <Icon name="check" /> : index + 1}
                    </button>
                    <Entry entry={step} />
                  </li>
                );
              })}
            </ol>
            {timed.method.after !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: timed.method.after }} />}
          </section>

          {timed.notes.length > 0 && (
            <section>
              <h2>Notes</h2>
              <ul className="notes">
                {timed.notes.map((note, index) =>
                {
                  return <li key={index}><Entry entry={note} /></li>;
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
};

/**
 * The step or note to show.
 */
interface EntryProps
{
  entry: RecipeEntry;
}

/**
 * A step or a note: its bold lead, then the rest of it.
 * @param {EntryProps} props The step or note.
 * @returns {React.JSX.Element} The lead and the text.
 */
const Entry = ({ entry }: EntryProps): React.JSX.Element =>
{
  return (
    <>
      <strong dangerouslySetInnerHTML={{ __html: entry.lead }} />{' '}
      <span dangerouslySetInnerHTML={{ __html: entry.text }} />
    </>
  );
};

/**
 * The classes for a step: done, next up, or neither.
 * @param {boolean} isDone Whether it's done.
 * @param {boolean} isCurrent Whether it's the next one to do.
 * @returns {string | undefined} The classes, or none.
 */
const stepClass = (isDone: boolean, isCurrent: boolean): string | undefined =>
{
  if (isDone)
  {
    return 'step-done';
  }
  return isCurrent ? 'step-current' : undefined;
};

/**
 * Whether a tap landed on a link or a button inside an ingredient or step. Those do their own thing, so
 * the tap shouldn't also check the ingredient or step off.
 * @param {React.MouseEvent<HTMLElement>} event The tap.
 * @returns {boolean} True when the tap was on a link or a button.
 */
const isOnControl = (event: React.MouseEvent<HTMLElement>): boolean =>
{
  return (event.target as HTMLElement).closest('a, button') !== null;
};

/**
 * Starts a timer when a tap lands on one of the time buttons in the method or notes. The timer is named
 * after the lead of the step or note it's in, so a running timer says what it's for, or after the time
 * itself when it sits in a plain paragraph.
 * @param {React.MouseEvent<HTMLElement>} event The tap.
 * @param {(name: string, label: string, seconds: number) => void} onStartTimer What starts a timer.
 */
const startTimerFromTap = (
  event: React.MouseEvent<HTMLElement>,
  onStartTimer: (name: string, label: string, seconds: number) => void,
): void =>
{
  const button = (event.target as HTMLElement).closest<HTMLElement>('button.timer');
  if (button === null)
  {
    return;
  }

  const label = button.textContent ?? '';
  const item = button.closest('li');
  const lead = item === null ? null : item.querySelector('strong');
  const name = lead === null || lead.textContent === null ? label : lead.textContent;
  onStartTimer(name, label, Number(button.dataset.seconds));
};

export { RecipeArticle };
