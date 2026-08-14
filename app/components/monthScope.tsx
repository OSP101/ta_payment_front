"use client";
/**
 * Shared vocabulary for the fiscal-year month split (10/08/2026).
 *
 * งบแผ่นดิน closes 30 กันยายน but ภาคต้น teaches มิ.ย.–ต.ค., so the two halves
 * draw on different appropriations and must be claimed on separate documents.
 * Both payout documents — the per-course claim ZIP (ใบเบิก) and ปะหน้าจ่ายตรง —
 * therefore let staff choose which months a file covers, and both need the same
 * three things: the month list with its Thai labels, which months already have
 * a document, and a sensible default.
 *
 * Kept here rather than in either screen so the two can never drift on what a
 * month key means or which half gets preselected.
 */

/** Gregorian "2026-06" — what every baht figure is keyed by server-side. */
export interface TermMonth {
  year_month: string;
  /** submission_periods' own Buddhist key, "2569-06". */
  period_year_month: string;
  label: string; // "มิถุนายน 2569"
}

export interface TermMonthStatus extends TermMonth {
  /** A document covering this month has already been generated. */
  issued: boolean;
}

export interface FiscalSplitInfo {
  crosses: boolean;
  before: string[]; // the budget year closing 30 ก.ย.
  after: string[];  // the one opening 1 ต.ค.
}

export interface MonthCoverage {
  months: TermMonthStatus[];
  fiscal_split: FiscalSplitInfo;
}

export const monthsQuery = (months: string[], prefix = "?") =>
  months.length ? `${prefix}months=${months.join(",")}` : "";

export const monthLabels = (all: TermMonth[], yms: string[]) =>
  yms.map(ym => all.find(m => m.year_month === ym)?.label ?? ym);

const MONTH_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * Names a fiscal round by the span it covers — "มิ.ย.–ก.ย.", or "ต.ค." when the
 * round is a single month.
 *
 * Takes Gregorian "YYYY-MM" keys, which is what FiscalSplitInfo carries, and
 * needs no month list to look labels up in: a round is always a contiguous run
 * (that is what a budget year cut produces), so its first and last months say
 * everything. Lives beside the split it describes so the several screens that
 * now speak about rounds cannot drift on how a round is named.
 */
export function roundRangeLabel(yms: string[]): string {
  if (!yms.length) return "";
  const name = (ym: string) => MONTH_TH_SHORT[Number(ym.split("-")[1]) - 1] ?? ym;
  const first = name(yms[0]);
  const last = name(yms[yms.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

/**
 * Which months to preselect: the fiscal half that still has work to issue,
 * so the common case is one click. A term that does not cross the boundary
 * gets everything — exactly the whole-term behaviour that existed before the
 * split, so ภาคปลาย is untouched.
 */
export function suggestMonths(all: TermMonthStatus[], split?: FiscalSplitInfo): string[] {
  if (!all.length) return [];
  if (!split?.crosses) return all.map(m => m.year_month);
  const pending = (set: string[]) => set.some(ym => !all.find(m => m.year_month === ym)?.issued);
  if (pending(split.before)) return split.before;
  if (pending(split.after)) return split.after;
  return split.before;
}

/**
 * Toggle chips rather than a checkbox list: the set is small and fixed, and
 * staff pick a contiguous run far more often than an arbitrary subset, so the
 * presets do most of the work and the chips exist for the exceptions.
 */
export function MonthChips({
  months, selected, onChange,
}: {
  months: TermMonthStatus[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(ym: string) {
    onChange(selected.includes(ym) ? selected.filter(m => m !== ym) : [...selected, ym]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {months.map(m => {
        const on = selected.includes(m.year_month);
        return (
          <button
            key={m.year_month}
            type="button"
            onClick={() => toggle(m.year_month)}
            aria-pressed={on}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
              (on
                ? "border-accent bg-accent-soft text-accent-soft-foreground"
                : "border-border text-ink-2 hover:border-accent")
            }
          >
            {m.label}
            {/* An already-issued month is not forbidden — reissuing to correct a
                file is normal — but it must never be picked by accident. */}
            {m.issued && <span className="text-[10px] text-ink-4">ออกแล้ว</span>}
          </button>
        );
      })}
    </div>
  );
}
