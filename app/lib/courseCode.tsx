/**
 * A course can be open under more than one registrar code (staff merged them
 * at import — the budget is one, the codes are many). Wherever the course is
 * named, every code is shown, primary first: "CP353301 / SC313302".
 */
export interface HasCodes { code: string; alt_codes?: string[] | null }

export function courseCodes(c: HasCodes): string[] {
  return [c.code, ...(c.alt_codes ?? [])];
}

export function courseCodeLabel(c: HasCodes): string {
  return courseCodes(c).join(" / ");
}

/** Primary code in full weight, the merged codes after it in a quieter tone. */
export function CourseCode({ c, className = "" }: { c: HasCodes; className?: string }) {
  const alt = c.alt_codes ?? [];
  return (
    <span className={`tabular ${className}`}>
      {c.code}
      {alt.map(a => (
        <span key={a} className="text-muted font-normal"> / {a}</span>
      ))}
    </span>
  );
}

/**
 * Which of a course's codes prints on the documents. The college is mid-way
 * through renumbering: CP is the new curriculum, SC the previous one, bare six
 * digits the oldest (kept open for students retaking). Newest wins — same
 * rule as the backend's codeRank.
 */
export function codeRank(code: string): number {
  if (code.startsWith("CP")) return 0;
  if (code.startsWith("SC")) return 1;
  if (/^\d{6}$/.test(code)) return 2;
  return 3;
}

export function pickPrimaryCode(codes: string[]): string {
  return [...codes].sort((a, b) => codeRank(a) - codeRank(b))[0] ?? "";
}
