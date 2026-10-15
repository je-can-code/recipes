/**
 * The heading for recipes at the top level of the recipes folder, which have no collection folder to
 * name them after.
 */
const topLevelLabel = 'Home Cooking';

/**
 * Turns a collection's folder name into a heading, so star-ocean reads as Star Ocean: hyphens become
 * spaces and every word gets a capital.
 * @param {string} name The collection's folder name, or an empty string for the top level.
 * @returns {string} The heading to show.
 */
const collectionLabel = (name: string): string =>
{
  if (name === '')
  {
    return topLevelLabel;
  }

  return name
    .split('-')
    .filter((word) => word !== '')
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

export { collectionLabel, topLevelLabel };
