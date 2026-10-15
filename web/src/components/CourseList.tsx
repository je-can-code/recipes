import { courseBodyId } from '../services/shelves';
import type { CourseGroup } from '../services/shelves';
import { Icon } from './Icons';
import { RecipeLinks } from './RecipeLinks';

/**
 * The courses to list, which are open, whether a search is on, and what a tap on a course does.
 */
interface CourseListProps
{
  groups: CourseGroup[];
  open: string[];
  isSearching: boolean;
  onToggle: (heading: string) => void;
}

/**
 * The courses, each in its own color of the rainbow. Normally each one is an accordion, closed until it's
 * tapped, so a long list reads as a short menu. During a search, every course listed has a match in it, so
 * they all show open, with no toggle that would close them.
 * @param {CourseListProps} props The courses and how to show them.
 * @returns {React.JSX.Element} The courses.
 */
const CourseList = ({ groups, open, isSearching, onToggle }: CourseListProps): React.JSX.Element =>
{
  return (
    <div className="courses">
      {groups.map((group) =>
      {
        const hue = `hue-${group.hue}`;
        if (isSearching)
        {
          return (
            <section key={group.heading} className={`course ${hue}`}>
              <h3 className="course-heading course-row">
                <span className="course-name">{group.heading}</span>
                <span className="course-count">{group.recipes.length}</span>
              </h3>
              <RecipeLinks recipes={group.recipes} />
            </section>
          );
        }

        const isOpen = open.includes(group.heading);
        const bodyId = courseBodyId(group.heading);
        return (
          <section key={group.heading} className={`course ${hue}`}>
            <h3 className="course-heading">
              <button
                type="button"
                className="course-row course-toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() =>
                {
                  onToggle(group.heading);
                }}
              >
                <span className="course-name">{group.heading}</span>
                <span className="course-count">{group.recipes.length}</span>
                <Icon name="chevron" />
              </button>
            </h3>
            <div id={bodyId} className={isOpen ? 'course-body course-body-open' : 'course-body'} inert={isOpen === false}>
              <div className="course-body-inner">
                <RecipeLinks recipes={group.recipes} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export { CourseList };
