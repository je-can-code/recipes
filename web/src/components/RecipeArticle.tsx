import { Link } from 'react-router-dom';
import { collectionLabel } from '../services/collections';
import type { RecipeDetail, RecipeEntry } from '../types';

/**
 * The recipe to show.
 */
interface RecipeArticleProps
{
  recipe: RecipeDetail;
}

/**
 * One recipe laid out for cooking from a phone: what it is and how long it takes up top, then the
 * ingredients, the numbered steps with their bold leads, and the notes. Every text field arrives as HTML
 * the server rendered from the card, so it goes in as HTML rather than being escaped.
 * @param {RecipeArticleProps} props The recipe.
 * @returns {React.JSX.Element} The recipe page's content.
 */
const RecipeArticle = ({ recipe }: RecipeArticleProps): React.JSX.Element =>
{
  const yieldText = recipe.serves === '' ? `Makes ${recipe.makes}` : `Serves ${recipe.serves}`;

  return (
    <article className="recipe">
      <header className="recipe-header">
        <p className="recipe-collection">{collectionLabel(recipe.collection)}</p>
        <h1>{recipe.title}</h1>
        <div className="rich recipe-intro" dangerouslySetInnerHTML={{ __html: recipe.intro }} />
        <p className="recipe-meta">
          <span>{yieldText}</span>
          <span>{recipe.time}</span>
        </p>
        {recipe.tags.length > 0 && (
          <ul className="tags">
            {recipe.tags.map((tag) =>
            {
              return (
                <li key={tag}>
                  <Link to={`/search?q=${encodeURIComponent(tag)}`}>{tag}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </header>

      <section>
        <h2>Ingredients</h2>
        {recipe.ingredients.map((group, groupIndex) =>
        {
          return (
            <div key={groupIndex} className="ingredient-group">
              {group.name !== '' && <h3>{group.name}</h3>}
              <ul className="ingredients">
                {group.items.map((item, itemIndex) =>
                {
                  return <li key={itemIndex} dangerouslySetInnerHTML={{ __html: item }} />;
                })}
              </ul>
              {group.after !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: group.after }} />}
            </div>
          );
        })}
      </section>

      <section>
        <h2>Method</h2>
        {recipe.method.before !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: recipe.method.before }} />}
        <ol className="steps">
          {recipe.method.steps.map((step, index) =>
          {
            return <li key={index}><Entry entry={step} /></li>;
          })}
        </ol>
        {recipe.method.after !== '' && <div className="rich" dangerouslySetInnerHTML={{ __html: recipe.method.after }} />}
      </section>

      {recipe.notes.length > 0 && (
        <section>
          <h2>Notes</h2>
          <ul className="notes">
            {recipe.notes.map((note, index) =>
            {
              return <li key={index}><Entry entry={note} /></li>;
            })}
          </ul>
        </section>
      )}
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

export { RecipeArticle };
