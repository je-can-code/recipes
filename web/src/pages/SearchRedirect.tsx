import { Navigate, useSearchParams } from 'react-router-dom';
import { homeAddress } from '../services/shelves';

/**
 * Search lives on the home page, so an address like /search?q=egg goes there with the same words, and a
 * link written that way still finds what it was looking for.
 * @returns {React.JSX.Element} The redirect.
 */
const SearchRedirect = (): React.JSX.Element =>
{
  const [ parameters ] = useSearchParams();
  return <Navigate to={homeAddress([], parameters.get('q') ?? '')} replace={true} />;
};

export { SearchRedirect };
