import type { RecipeDetail, RecipeGroup } from '../types';
import {
  countedNoun,
  countRest,
  findLeadingAmount,
  formatAmount,
  isIndivisible,
  metricWords,
  numberPattern,
  numberStart,
  readNumber,
  scalesWithBatch,
  unitPattern,
} from './amounts';
import type { Amount, MeasureSystem } from './amounts';
import type { BrowserStorage } from './storage';

/**
 * What the page does to a recipe's amounts: the batch size, as a factor like 0.5 or 2, and the measuring
 * system to show them in.
 */
interface Measure
{
  factor: number;
  system: MeasureSystem;
}

/**
 * A keyed ingredient's amount, read and exactly as the card wrote it, with the words after it, which name what
 * a count counts.
 */
interface KeyedAmount
{
  amount: Amount;
  written: string;
  rest: string;
}

/**
 * One button on the batch size bar: its factor, what it says, and whether the recipe can be made at that size.
 */
interface Stop
{
  factor: number;
  label: string;
  isOpen: boolean;
}

/**
 * Every batch size the page offers, with what its button says: a quarter, a half, as written, one and a half,
 * double, triple and quadruple.
 */
const batchSizes: [ number, string ][] = [
  [ 0.25, '¼×' ],
  [ 0.5, '½×' ],
  [ 1, '1×' ],
  [ 1.5, '1½×' ],
  [ 2, '2×' ],
  [ 3, '3×' ],
  [ 4, '4×' ],
];

/**
 * How long a chosen batch size counts. Like progress, a choice from yesterday's cook still helps, and one from
 * last week would only surprise.
 */
const staleAfter = 24 * 60 * 60 * 1000;

/**
 * Where the measuring system is kept. It's one choice for the whole site, not one per recipe.
 */
const systemKey = 'recipes.system';

/**
 * The server's span around an amount in braces, carrying the amount as written.
 */
const amountSpan = /<span class="amount" data-amount="([^"]*)">[^<]*<\/span>/g;

/**
 * The server's span around a pointer at an ingredient, carrying its key, the share of it meant, and its words.
 */
const pointerSpan = /<span class="ref" data-ref="([^"]*)" data-portion="([^"]*)">([^<]*)<\/span>/g;

/**
 * Elements whose text is never changed here: links and buttons, which hold names and times, and the amounts
 * this service has already written.
 */
const untouchable = /^<(?:a|button)\b|^<span class="(?:measured|amount|ref)\b/i;

/**
 * Elements with no closing tag, which never hold text.
 */
const voidElement = /^<(?:br|hr|img|input|wbr)\b/i;

/**
 * An amount in an ingredient line's parentheses: "about 2 limes", "14 to 16 oz", "2 sticks".
 */
const bracketedAmount = new RegExp(
  String.raw`${numberStart}(?:about\s+)?(?:${numberPattern})(?:\s+to\s+(?:${numberPattern}))?` +
    String.raw`(?:\s+(?:${unitPattern}|[A-Za-z]+))?(?=[\s,.;:)]|$)`,
  'gi',
);

/**
 * A time, which marks a parenthesis as holding a wait rather than an amount, like "(rested about 30 minutes)".
 */
const timeWord = /\b(?:seconds?|minutes?|hours?|days?)\b/i;

/**
 * A parenthesis and what it holds.
 */
const parenthetical = /\(([^()]*)\)/g;

/**
 * A number or a range in a serves line, like "8 to 10", or the 2 and the 4 in "2 as a main, 4 as a side".
 */
const servedCount = /(\d+)(?:\s+to\s+(\d+))?/g;

/**
 * An amount in a makes line: "about 9 cups", "8 to 10 glasses", "12".
 */
const madeAmount = new RegExp(
  String.raw`${numberStart}(about\s+)?(${numberPattern})(?:\s+to\s+(${numberPattern}))?(?:\s+(${unitPattern}))?(?=[\s,.;:)]|$)`,
  'gi',
);

/**
 * Runs a change over the text between the tags of server-rendered HTML, never over a tag, and never inside a
 * link, a button, or an amount already written.
 * @param {string} html The HTML.
 * @param {(text: string) => string} change What to do to each stretch of text.
 * @returns {string} The HTML with its text changed.
 */
const mapText = (html: string, change: (text: string) => string): string =>
{
  const open: boolean[] = [];
  return html
    .split(/(<[^>]+>)/)
    .map((chunk) =>
    {
      if (chunk.startsWith('</'))
      {
        open.pop();
        return chunk;
      }
      if (chunk.startsWith('<'))
      {
        if (voidElement.test(chunk) === false && chunk.endsWith('/>') === false)
        {
          open.push(untouchable.test(chunk));
        }
        return chunk;
      }
      return open.includes(true) ? chunk : change(chunk);
    })
    .join('');
};

/**
 * An ingredient line's text before its first tag, which is where its amount is.
 * @param {string} html The line, as HTML.
 * @returns {string} The text before the first tag.
 */
const leadingText = (html: string): string =>
{
  return html.split(/<[^>]+>/)[0];
};

/**
 * The amount each keyed ingredient leads with, by its key, which is what a pointer at it shows.
 * @param {RecipeGroup[]} groups The recipe's ingredient groups.
 * @returns {Map<string, KeyedAmount>} Each key's amount and the words after it, for the keyed lines that have one.
 */
const keyedAmounts = (groups: RecipeGroup[]): Map<string, KeyedAmount> =>
{
  const amounts = new Map<string, KeyedAmount>();
  groups.forEach((group) =>
  {
    group.items.forEach((item, index) =>
    {
      const key = group.keys[index];
      const text = leadingText(item);
      const found = findLeadingAmount(text);
      if (key !== '' && found !== null)
      {
        amounts.set(key, { amount: found.amount, written: text.slice(0, found.length), rest: text.slice(found.length) });
      }
    });
  });
  return amounts;
};

/**
 * The counts of everything in a recipe that can't be split: eggs, and anything written as whole.
 * @param {RecipeGroup[]} groups The recipe's ingredient groups.
 * @returns {number[]} Each such line's count, at its low end.
 */
const wholeCounts = (groups: RecipeGroup[]): number[] =>
{
  return groups
    .flatMap((group) => group.items)
    .flatMap((item) =>
    {
      const text = leadingText(item);
      const found = findLeadingAmount(text);
      if (found === null || found.amount.kind !== null || isIndivisible(text.slice(found.length)) === false)
      {
        return [];
      }
      return [ found.amount.low ];
    });
};

/**
 * The fewest people a serves line counts, like the 2 in "2 as a main, 4 as a side", or 0 for a recipe that
 * says what it makes instead.
 * @param {string} serves The serves line, or '' when the recipe has a makes line.
 * @returns {number} The first count in it, or 0.
 */
const fewestServed = (serves: string): number =>
{
  const match = /\d+/.exec(serves);
  return match === null ? 0 : Number(match[0]);
};

/**
 * The batch size bar's buttons for a recipe. A recipe that doesn't scale gets none. A size is closed when it
 * would split an egg or something whole, or serve less than one person.
 * @param {RecipeDetail} recipe The recipe.
 * @returns {Stop[]} Every size, in order, open or closed.
 */
const batchStops = (recipe: RecipeDetail): Stop[] =>
{
  if (recipe.scales === false)
  {
    return [];
  }

  const floors = wholeCounts(recipe.ingredients);
  const fewest = fewestServed(recipe.serves);
  return batchSizes.map(([ factor, label ]) =>
  {
    const keepsWhole = floors.every((count) => count * factor >= 1);
    const servesSomeone = fewest === 0 || fewest * factor >= 1;
    return { factor, label, isOpen: keepsWhole && servesSomeone };
  });
};

/**
 * The measure to cook at: the saved batch size when the recipe can still be made at it, and as written when it
 * can't, as when the card changed since the size was chosen.
 * @param {Stop[]} stops The recipe's batch sizes.
 * @param {Measure} measure The saved choice.
 * @returns {Measure} The measure to use.
 */
const effectiveMeasure = (stops: Stop[], measure: Measure): Measure =>
{
  const isOpen = stops.some((stop) => stop.factor === measure.factor && stop.isOpen);
  return isOpen ? measure : { factor: 1, system: measure.system };
};

/**
 * Whether amounts at a batch size and in a measuring system read exactly as the card wrote them: as written,
 * in US measures. The math would still tidy them, so 6 tsp would read 2 tbsp and 14.5 oz would read 15 oz.
 * @param {number} factor The batch size, times any share of an ingredient.
 * @param {MeasureSystem} system The measuring system.
 * @returns {boolean} True when the card's own words are the answer.
 */
const isAsWritten = (factor: number, system: MeasureSystem): boolean =>
{
  return factor === 1 && system === 'us';
};

/**
 * Writes an amount from braces or parentheses at a batch size and in a measuring system, keeping a counted
 * thing in the right number: "4 portions" at half size is "2 portions". As written in US measures, it's the
 * card's own words.
 * @param {string} written The amount as written, like "2/3 cup" or "about 2 limes".
 * @param {Measure} measure The batch size and system.
 * @returns {string} The amount, measured.
 */
const measureWritten = (written: string, measure: Measure): string =>
{
  const found = findLeadingAmount(written);
  if (found === null || isAsWritten(measure.factor, measure.system))
  {
    return written;
  }

  const rest = written.slice(found.length);
  const amount = formatAmount(found.amount, measure.factor, measure.system);
  if (found.amount.kind === null)
  {
    return amount + countRest(rest, found.amount.high * measure.factor);
  }
  return amount + rest;
};

/**
 * A count of things that can't be split, at a batch size: whole ones, never fewer than one.
 * @param {Amount} amount The count.
 * @param {number} factor The batch size.
 * @returns {Amount} The count, rounded.
 */
const wholeAmount = (amount: Amount, factor: number): Amount =>
{
  return {
    ...amount,
    low: Math.max(1, Math.round(amount.low * factor)),
    high: Math.max(1, Math.round(amount.high * factor)),
  };
};

/**
 * An ingredient line's leading amount at a batch size, in a span the page can show off, with the counted
 * thing in the right number. Eggs and whole things round to whole ones. Pinches stay as written, and so does
 * a size in US measures, like a "12 inch oven-safe skillet", since neither changes with the batch.
 * @param {string} text The line's text before its first tag.
 * @param {Measure} measure The batch size and system.
 * @returns {string} The text, with its amount measured.
 */
const measureLeading = (text: string, measure: Measure): string =>
{
  const found = findLeadingAmount(text);
  if (found === null)
  {
    return text;
  }
  const isFixed = scalesWithBatch(found.amount.kind) === false;
  if (isFixed && (found.amount.kind === 'pinch' || measure.system === 'us'))
  {
    return text;
  }

  const rest = text.slice(found.length);
  const isWhole = found.amount.kind === null && isIndivisible(rest);
  const amount = isWhole ? wholeAmount(found.amount, measure.factor) : found.amount;
  const factor = isWhole ? 1 : measure.factor;
  const written = formatAmount(amount, factor, measure.system);
  const words = amount.kind === null ? countRest(rest, amount.high * factor) : rest;
  return `<span class="measured">${written}</span>${words}`;
};

/**
 * The amounts in an ingredient line's parentheses, at a batch size: "(about 2 limes)" doubles at 2x, while a
 * size that says "each", like "(14.5 oz each)", stays put, since every can is still that big. A size that says
 * each is measured as written, so in US measures it reads exactly as the card has it and in metric it only
 * converts. A parenthesis holding a time is always left alone, since a wait never changes with the batch;
 * metric still converts any measure in it afterward.
 * @param {string} text Plain text from the line.
 * @param {Measure} measure The batch size and system.
 * @returns {string} The text, with its parentheses measured.
 */
const measureParentheses = (text: string, measure: Measure): string =>
{
  return text.replace(parenthetical, (whole: string, inside: string) =>
  {
    // a wait never changes with the batch.
    if (timeWord.test(inside))
    {
      return whole;
    }

    // a size that says each is the same for every can, however many there are.
    const isEach = /\beach\b/i.test(inside);
    const here = isEach ? { factor: 1, system: measure.system } : measure;
    return `(${inside.replace(bracketedAmount, (written: string) => measureWritten(written, here))})`;
  });
};

/**
 * One ingredient line at a batch size and in a measuring system. As written in US measures, it's left exactly
 * alone.
 * @param {string} html The line, as HTML.
 * @param {Measure} measure The batch size and system.
 * @returns {string} The line, measured.
 */
const measureItem = (html: string, measure: Measure): string =>
{
  if (isAsWritten(measure.factor, measure.system))
  {
    return html;
  }

  const [ first, ...others ] = html.split(/(<[^>]+>)/);
  const led = [ measureLeading(first, measure), ...others ].join('');
  const bracketed = mapText(led, (text) => measureParentheses(text, measure));
  return measure.system === 'metric' ? mapText(bracketed, metricWords) : bracketed;
};

/**
 * The counted thing a pointer's amount names, after its number: "the garlic (3 cloves)", "the tofu (1 block)".
 * When the key already says what's counted, like "the onions (2)", the number is enough.
 * @param {KeyedAmount} keyed The ingredient's amount and the words after it.
 * @param {string} key The ingredient's key.
 * @param {number} value The count the pointer shows; above 1 is plural.
 * @returns {string} A space and the counted thing, or ''.
 */
const pointerCount = (keyed: KeyedAmount, key: string, value: number): string =>
{
  const noun = countedNoun(keyed.rest);
  if (noun === null)
  {
    return '';
  }
  const named = key.toLowerCase().split('-').pop();
  if (named === noun.singular || named === noun.plural)
  {
    return '';
  }
  return ` ${value > 1 ? noun.plural : noun.singular}`;
};

/**
 * What a pointer adds after its words: the ingredient's amount, times its share and the batch size, in
 * parentheses. Nothing for the rest of an ingredient, or for one without an amount.
 * @param {KeyedAmount | undefined} keyed The ingredient's amount, or undefined when it has none.
 * @param {string} key The ingredient's key.
 * @param {string} portion The share: '' for all of it, 'rest', or a fraction like '1/2'.
 * @param {Measure} measure The batch size and system.
 * @returns {string} The amount in parentheses, as HTML, or ''.
 */
const pointerAmount = (keyed: KeyedAmount | undefined, key: string, portion: string, measure: Measure): string =>
{
  if (keyed === undefined || portion === 'rest')
  {
    return '';
  }
  const factor = measure.factor * (portion === '' ? 1 : readNumber(portion));
  const counted = keyed.amount.kind === null ? pointerCount(keyed, key, keyed.amount.high * factor) : '';

  // all of an ingredient, as written, reads exactly as its line does.
  const shown = isAsWritten(factor, measure.system) ? keyed.written : formatAmount(keyed.amount, factor, measure.system);
  return ` <span class="ref-amount">(${shown}${counted})</span>`;
};

/**
 * A step, a note or a paragraph at a batch size and in a measuring system: in metric, its temperatures and US
 * measures converted first; then each amount in braces measured, and each pointer given its ingredient's
 * amount.
 * @param {string} html The text, as the server rendered it.
 * @param {Measure} measure The batch size and system.
 * @param {Map<string, KeyedAmount>} amounts Each keyed ingredient's amount.
 * @returns {string} The text, measured.
 */
const measureText = (html: string, measure: Measure, amounts: Map<string, KeyedAmount>): string =>
{
  const converted = measure.system === 'metric' ? mapText(html, metricWords) : html;
  return converted
    .replace(amountSpan, (_whole: string, written: string) =>
    {
      return `<span class="amount">${measureWritten(written, measure)}</span>`;
    })
    .replace(pointerSpan, (_whole: string, key: string, portion: string, words: string) =>
    {
      return `<span class="ref">${words}${pointerAmount(amounts.get(key), key, portion, measure)}</span>`;
    });
};

/**
 * Rounds a count of people to whole ones, never fewer than one.
 * @param {number} count The count.
 * @returns {number} Whole people.
 */
const people = (count: number): number =>
{
  return Math.max(1, Math.round(count));
};

/**
 * Writes a count or a range of whole ones: "4 to 5", or "4" when both ends meet.
 * @param {number} fewest The low end.
 * @param {number} most The high end.
 * @returns {string} The count.
 */
const wholeRange = (fewest: number, most: number): string =>
{
  return fewest === most ? String(fewest) : `${fewest} to ${most}`;
};

/**
 * A serves line at a batch size: every count in it scaled and rounded to whole people.
 * @param {string} serves The serves line, like "8 to 10" or "2 as a main, 4 as a side".
 * @param {number} factor The batch size.
 * @returns {string} The line at that size.
 */
const measureServes = (serves: string, factor: number): string =>
{
  if (factor === 1)
  {
    return serves;
  }
  return serves.replace(servedCount, (_whole: string, low: string, high: string | undefined) =>
  {
    const fewest = people(Number(low) * factor);
    return wholeRange(fewest, high === undefined ? fewest : people(Number(high) * factor));
  });
};

/**
 * A makes line at a batch size and in a measuring system: measured amounts written like any other amount, and
 * counts, like glasses or cookies, rounded to whole ones.
 * @param {string} makes The makes line, like "about 9 cups, 8 to 10 glasses".
 * @param {Measure} measure The batch size and system.
 * @returns {string} The line, measured.
 */
const measureMakes = (makes: string, measure: Measure): string =>
{
  if (isAsWritten(measure.factor, measure.system))
  {
    return makes;
  }
  return makes.replace(madeAmount, (whole: string, about: string | undefined, low: string, high: string | undefined, unit: string | undefined) =>
  {
    if (unit !== undefined)
    {
      return measureWritten(whole, measure);
    }
    const fewest = people(readNumber(low) * measure.factor);
    const most = high === undefined ? fewest : people(readNumber(high) * measure.factor);
    return `${about ?? ''}${wholeRange(fewest, most)}`;
  });
};

/**
 * A recipe at a batch size and in a measuring system, ready to draw: its ingredient lines, steps, notes and
 * paragraphs measured, its intro converted, and its serves or makes line doing the math. A recipe that doesn't
 * scale is shown as written, whatever size is asked for, though it still converts to metric.
 * @param {RecipeDetail} recipe The recipe, as the server sent it.
 * @param {Measure} asked The batch size and system the cook chose.
 * @returns {RecipeDetail} The recipe, measured.
 */
const withMeasures = (recipe: RecipeDetail, asked: Measure): RecipeDetail =>
{
  const measure = { factor: recipe.scales ? asked.factor : 1, system: asked.system };
  const amounts = keyedAmounts(recipe.ingredients);

  /**
   * Measures a step, a note or a paragraph.
   * @param {string} html The text, as the server rendered it.
   * @returns {string} The text, measured.
   */
  const text = (html: string): string =>
  {
    return measureText(html, measure, amounts);
  };

  return {
    ...recipe,
    intro: measure.system === 'metric' ? mapText(recipe.intro, metricWords) : recipe.intro,
    serves: measureServes(recipe.serves, measure.factor),
    makes: measureMakes(recipe.makes, measure),
    ingredients: recipe.ingredients.map((group) =>
    {
      return { ...group, items: group.items.map((item) => measureItem(item, measure)), after: text(group.after) };
    }),
    method: {
      before: text(recipe.method.before),
      steps: recipe.method.steps.map((step) => ({ ...step, text: text(step.text) })),
      after: text(recipe.method.after),
    },
    notes: recipe.notes.map((note) => ({ ...note, text: text(note.text) })),
  };
};

/**
 * The key one recipe's batch size is saved under.
 * @param {string} slug The recipe's name.
 * @returns {string} The storage key.
 */
const batchKey = (slug: string): string =>
{
  return `recipes.batch.${slug}`;
};

/**
 * Reads a recipe's saved batch size. Anything missing, older than a day, not one of the sizes, unreadable, or
 * in storage the browser won't open comes back as 1, as written.
 * @param {BrowserStorage} storage Where choices are kept.
 * @param {string} slug The recipe's name.
 * @param {number} now The time, in milliseconds since 1970.
 * @returns {number} The batch size.
 */
const loadFactor = (storage: BrowserStorage, slug: string, now: number): number =>
{
  try
  {
    const saved = storage.getItem(batchKey(slug));
    if (saved === null)
    {
      return 1;
    }

    // this is the one place outside data comes in, so its shape is checked rather than trusted.
    const parsed = JSON.parse(saved);
    const isSize = batchSizes.some(([ factor ]) => factor === parsed.factor);
    if (isSize === false || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > staleAfter)
    {
      storage.removeItem(batchKey(slug));
      return 1;
    }
    return parsed.factor;
  }
  catch
  {
    return 1;
  }
};

/**
 * Saves a recipe's batch size, stamped with the time so it can go stale. As written is the default, so it's
 * removed rather than saved.
 * @param {BrowserStorage} storage Where choices are kept.
 * @param {string} slug The recipe's name.
 * @param {number} factor The batch size.
 * @param {number} now The time, in milliseconds since 1970.
 */
const saveFactor = (storage: BrowserStorage, slug: string, factor: number, now: number): void =>
{
  try
  {
    if (factor === 1)
    {
      storage.removeItem(batchKey(slug));
      return;
    }
    storage.setItem(batchKey(slug), JSON.stringify({ factor, savedAt: now }));
  }
  catch
  {
    // a full or locked storage loses nothing the page itself doesn't still hold.
  }
};

/**
 * Reads the measuring system, which is US unless metric was chosen.
 * @param {BrowserStorage} storage Where choices are kept.
 * @returns {MeasureSystem} The system.
 */
const loadSystem = (storage: BrowserStorage): MeasureSystem =>
{
  try
  {
    return storage.getItem(systemKey) === 'metric' ? 'metric' : 'us';
  }
  catch
  {
    return 'us';
  }
};

/**
 * Saves the measuring system. US is the default, so it's removed rather than saved.
 * @param {BrowserStorage} storage Where choices are kept.
 * @param {MeasureSystem} system The system.
 */
const saveSystem = (storage: BrowserStorage, system: MeasureSystem): void =>
{
  try
  {
    if (system === 'us')
    {
      storage.removeItem(systemKey);
      return;
    }
    storage.setItem(systemKey, 'metric');
  }
  catch
  {
    // a full or locked storage loses nothing the page itself doesn't still hold.
  }
};

export { batchStops, effectiveMeasure, loadFactor, loadSystem, saveFactor, saveSystem, withMeasures };
export type { Measure, Stop };
