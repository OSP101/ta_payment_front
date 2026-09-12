/**
 * Hours and money are paid from two budgets at two rates — ภาคปกติ and
 * ภาคพิเศษ — so a single total tells the reader nothing about what will be
 * paid. Every screen that shows a figure covering both tracks names the split
 * (12/09/2026), with the same words in the same order everywhere.
 */

export const TRACK_SHORT: Record<string, string> = { regular: "ปกติ", special: "พิเศษ" };

const num = (n: number, digits: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * "ปกติ 3.0 · พิเศษ 1.0 ชม." — or just the one track when the other is empty,
 * still named, so a lone figure never has to be guessed at. Nothing at all is
 * plain "0.0 ชม.": there is no track to name.
 */
export function hoursSplitText(regular: number, special: number, digits = 1): string {
  if (regular <= 0 && special <= 0) return `${num(0, digits)} ชม.`;
  const parts: string[] = [];
  if (regular > 0 || special <= 0) parts.push(`ปกติ ${num(regular, digits)}`);
  if (special > 0) parts.push(`พิเศษ ${num(special, digits)}`);
  return `${parts.join(" · ")} ชม.`;
}

/** "ปกติ ฿80 · พิเศษ ฿50" — same rule as the hours. */
export function bahtSplitText(regular: number, special: number): string {
  const b = (n: number) => `฿${Math.round(n).toLocaleString()}`;
  if (regular <= 0 && special <= 0) return b(0);
  const parts: string[] = [];
  if (regular > 0 || special <= 0) parts.push(`ปกติ ${b(regular)}`);
  if (special > 0) parts.push(`พิเศษ ${b(special)}`);
  return parts.join(" · ");
}

/**
 * The split as inline markup: track names muted, figures tabular. Used where
 * the figure is the thing on the line, so the names do not compete with it.
 */
export function HoursSplit({
  regular, special, digits = 1, unit = "ชม.", className = "", stacked = false,
}: {
  regular: number; special: number; digits?: number; unit?: string; className?: string;
  /** One track per line, for a narrow cell where the inline form breaks at the dot. */
  stacked?: boolean;
}) {
  if (regular <= 0 && special <= 0) {
    return <span className={`tabular ${className}`}>{num(0, digits)}{unit && <span className="text-muted"> {unit}</span>}</span>;
  }
  const items: [string, number][] = [];
  if (regular > 0 || special <= 0) items.push(["ปกติ", regular]);
  if (special > 0) items.push(["พิเศษ", special]);
  if (stacked) {
    return (
      <span className={`inline-flex flex-col leading-tight ${className}`}>
        {items.map(([label, v]) => (
          <span key={label} className="whitespace-nowrap">
            <span className="text-muted">{label} </span>
            <span className="tabular">{num(v, digits)}</span>
            {unit && <span className="text-muted"> {unit}</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 ${className}`}>
      {items.map(([label, v], i) => (
        <span key={label} className="whitespace-nowrap">
          {i > 0 && <span className="text-muted"> · </span>}
          <span className="text-muted">{label} </span>
          <span className="tabular">{num(v, digits)}</span>
        </span>
      ))}
      {unit && <span className="text-muted">{unit}</span>}
    </span>
  );
}
