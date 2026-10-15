import { Link } from 'react-router-dom';
import { placeOf } from '../services/shelves';
import type { RecipeSummary } from '../types';

/**
 * The recipes to list, and whether each row also names where the recipe lives, which search results need
 * and the home page, already sorted onto shelves, doesn't.
 */
interface RecipeLinksProps
{
  recipes: RecipeSummary[];
  showCollection: boolean;
}

/**
 * A list of recipes, each a large tap target with its time and tags underneath.
 * @param {RecipeLinksProps} props The recipes, and whether to name where they live.
 * @returns {React.JSX.Element} The list.
 */
const RecipeLinks = ({ recipes, showCollection }: RecipeLinksProps): React.JSX.Element =>
{
  return (
    <ul className="recipe-links">
      {recipes.map((recipe) =>
      {
        const details = [ recipe.time, ...recipe.tags ];
        const place = placeOf(recipe);
        if (showCollection && place !== '')
        {
          details.unshift(place);
        }

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
