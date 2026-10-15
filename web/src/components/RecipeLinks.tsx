import { Link } from 'react-router-dom';
import type { RecipeSummary } from '../types';

/**
 * The recipes to list.
 */
interface RecipeLinksProps
{
  recipes: RecipeSummary[];
}

/**
 * A list of recipes, each a large tap target with its time and tags underneath.
 * @param {RecipeLinksProps} props The recipes.
 * @returns {React.JSX.Element} The list.
 */
const RecipeLinks = ({ recipes }: RecipeLinksProps): React.JSX.Element =>
{
  return (
    <ul className="recipe-links">
      {recipes.map((recipe) =>
      {
        const details = [ recipe.time, ...recipe.tags ];
        return (
          <li key={recipe.slug}>
            <Link to={`/recipes/${recipe.slug}`}>
              <span className="recipe-link-title">{recipe.title}</span>
              <span className="recipe-link-details">{details.join(' · ')}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export { RecipeLinks };
