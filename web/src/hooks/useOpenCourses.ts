import { useState } from 'react';
import { toggleCourse } from '../services/shelves';

/**
 * The courses open on the home page, kept for as long as the site stays open. Coming back from a recipe
 * finds the same courses open and so the page the same height, which is what lets the browser put the
 * scroll back where it was.
 */
let remembered: string[] = [];

/**
 * The open courses, and a way to open or close one. Every home page shares the same list, so switching
 * shelves keeps a course open: open the desserts, and each collection's desserts are waiting.
 * @returns {[ string[], (heading: string) => void ]} The open courses' headings, and the toggle.
 */
const useOpenCourses = (): [ string[], (heading: string) => void ] =>
{
  const [ open, setOpen ] = useState<string[]>(remembered);

  const toggle = (heading: string): void =>
  {
    remembered = toggleCourse(remembered, heading);
    setOpen(remembered);
  };

  return [ open, toggle ];
};

export { useOpenCourses };
