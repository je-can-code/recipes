import type { MeasureSystem } from '../services/amounts';
import type { Measure, Stop } from '../services/measures';

/**
 * The recipe's batch sizes, the measure in use, and what choosing does.
 */
interface MeasureBarProps
{
  stops: Stop[];
  measure: Measure;
  onChooseFactor: (factor: number) => void;
  onChooseSystem: (system: MeasureSystem) => void;
}

/**
 * The batch size and the measuring system, under the recipe's serving line. A recipe that scales gets a row of
 * sizes, with any that would split an egg greyed out; every recipe gets US and metric.
 * @param {MeasureBarProps} props The sizes, the measure, and what choosing does.
 * @returns {React.JSX.Element} The bar.
 */
const MeasureBar = (props: MeasureBarProps): React.JSX.Element =>
{
  const { stops, measure } = props;

  return (
    <div className="measure-bar">
      {stops.length > 0 && (
        <div className="measure-choices" role="group" aria-label="Batch size">
          {stops.map((stop) =>
          {
            return (
              <button
                key={stop.factor}
                type="button"
                aria-pressed={stop.factor === measure.factor}
                disabled={stop.isOpen === false}
                onClick={() => props.onChooseFactor(stop.factor)}
              >
                {stop.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="measure-choices" role="group" aria-label="Measures">
        <button type="button" aria-pressed={measure.system === 'us'} onClick={() => props.onChooseSystem('us')}>
          US
        </button>
        <button type="button" aria-pressed={measure.system === 'metric'} onClick={() => props.onChooseSystem('metric')}>
          Metric
        </button>
      </div>
    </div>
  );
};

export { MeasureBar };
