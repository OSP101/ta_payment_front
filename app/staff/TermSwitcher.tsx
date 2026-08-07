"use client";
import TermSelect from "../components/TermSelect";
import { useTerm } from "./TermContext";

/**
 * The one place staff change which academic term they are looking at.
 *
 * Lives in the shell's top bar (`topBarScope`) rather than on each page, next
 * to the CourseSwitcher that already occupies the neighbouring slot for
 * lecturers and TAs — scope controls belong in the chrome, not in the content,
 * because they apply to whatever page happens to be open.
 *
 * The control itself is the shared TermSelect, so the staff top bar and the
 * TA schedule page render the same thing.
 */
export default function TermSwitcher() {
  const { terms, termId, setTermId, loaded } = useTerm();

  // Nothing to switch between: don't put an empty control in the chrome of
  // every page. The pages themselves explain what to do about it (the teaching
  // page has the "create a term first" empty state).
  if (!loaded || !terms || terms.length === 0) return null;

  return (
    <div data-tour="term-switcher" className="shrink-0">
      <TermSelect terms={terms} value={termId} onChange={setTermId} className="w-32 sm:w-44 shrink-0" />
    </div>
  );
}
