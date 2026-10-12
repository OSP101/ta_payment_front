"use client";
import { Tip } from "./ui";
import { useI18n } from "../lib/i18n/client";
import { monthName as coreMonthName } from "../lib/i18n/core";
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
  /** false while the month still has work waiting on a TA, a lecturer, or the
   *  finance step. Only ปะหน้าจ่ายตรง sets it — its figures are keyed straight
   *  into the university's ERP, so a month that is still moving must not be
   *  selectable at all. Undefined elsewhere, which reads as "no such gate". */
  ready?: boolean;
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
export function roundRangeLabel(
  yms: string[],
  /** Short month name, 1-based — pass useI18n().monthName so the label
   *  follows the reader's language. Defaults to Thai. */
  monthName: (m: number) => string = m => coreMonthName("th", m),
): string {
  if (!yms.length) return "";
  const name = (ym: string) => {
    const m = Number(ym.split("-")[1]);
    return m >= 1 && m <= 12 ? monthName(m) : ym;
  };
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
  const { t } = useI18n();
  function toggle(ym: string) {
    onChange(selected.includes(ym) ? selected.filter(m => m !== ym) : [...selected, ym]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {months.map(m => {
        const on = selected.includes(m.year_month);
        // ready === false is a hard no: the document's figures go into ERP, so a
        // month still waiting on somebody cannot be part of one. Left clickable
        // it would only be refused on press, which is a worse way to find out.
        const blocked = m.ready === false;
        return (
          <Tip key={m.year_month} content={blocked ? t("ยังอนุมัติ/ส่งออกใบเบิกจ่ายไม่ครบ จึงยังออกเอกสารเดือนนี้ไม่ได้") : undefined}><button
            type="button"
            disabled={blocked}
            onClick={() => toggle(m.year_month)}
            aria-pressed={on}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
              (blocked
                ? "cursor-not-allowed border-border bg-surface-secondary text-ink-4"
                : on
                  ? "border-accent bg-accent-soft text-accent-soft-foreground"
                  : "border-border text-ink-2 hover:border-accent")
            }
          >
            {m.label /* month label from the API */}
            {blocked && <span className="text-[10px] text-ink-4">{t("ยังไม่พร้อม")}</span>}
            {/* An already-issued month is not forbidden — reissuing to correct a
                file is normal — but it must never be picked by accident. */}
            {m.issued && <span className="text-[10px] text-ink-4">{t("ออกแล้ว")}</span>}
          </button></Tip>
        );
      })}
    </div>
  );
}
