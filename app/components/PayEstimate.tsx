import { Wallet } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* PayEstimateCard — a rough per-month pay breakdown, presentational only.    */
/*                                                                            */
/* Built for the worklog page's "ส่งอนุมัติ" confirm dialog (hours by activity */
/* then money, per month, before a TA commits to sending a batch), but kept  */
/* free of that page's own state: every number and label arrives pre-computed */
/* and pre-labelled from the caller, so a lecturer-facing screen or a budget  */
/* page can drop in the same card with its own data shape.                   */
/* -------------------------------------------------------------------------- */

/** One activity's hours within a month, already labelled in Thai — "บรรยาย",
 *  "ปฏิบัติการ", etc. Callers filter out zero-hour activities themselves so
 *  this component never has to guess what counts as "nothing to show". */
export interface PayEstimateActivity {
  label: string;
  hours: number;
}

/** One calendar month's worth of a pay estimate. */
export interface PayEstimateMonth {
  /** "YYYY-MM" — used only as the React key, never rendered. */
  ym: string;
  /** Thai calendar label, e.g. "กรกฎาคม 2569" — the caller knows the calendar
   *  (Buddhist year, month names), this component only lays it out. */
  label: string;
  /** In the order the caller wants them shown (e.g. lecture, then lab). */
  activities: PayEstimateActivity[];
  /** Total hours for the month — equals the sum of `activities`, but passed
   *  separately so a caller with no per-activity split can still use this. */
  hours: number;
  baht: number;
}

export interface PayEstimate {
  months: PayEstimateMonth[];
  total: number;
  /** True when at least one month's figure was capped at a monthly ceiling
   *  (e.g. ป.ตรี ภาคพิเศษ's ประกาศ 2,000 บาท/เดือน) — shown as a footnote so
   *  a month that looks "too low" for its hours isn't mistaken for a bug. */
  capped?: boolean;
  /** Freeform caveat under the total — what this estimate does NOT account
   *  for (lecturer approval still pending, course budget could run short). */
  footnote?: React.ReactNode;
}

export function PayEstimateCard({ estimate }: { estimate: PayEstimate }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-secondary px-3 py-2 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5 font-medium text-ink-1">
        <Wallet size={13} /> ประมาณการที่จะได้รับ (คร่าวๆ)
      </div>
      <ul className="space-y-1.5">
        {estimate.months.map(m => (
          <li key={m.ym} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-muted">{m.label}</div>
              {m.activities.length > 0 && (
                <div className="mt-0.5 text-[11px] text-ink-2">
                  {m.activities.map(a => `${a.label} ${hrs1(a.hours)} ชม.`).join(" · ")}
                </div>
              )}
            </div>
            <span className="shrink-0 pt-px tabular-nums">
              {hrs1(m.hours)} ชม. ≈ <b className="text-ink-1">{baht(m.baht)}</b>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-1 font-medium">
        <span>รวม</span>
        <span className="tabular-nums">{baht(estimate.total)}</span>
      </div>
      {(estimate.capped || estimate.footnote) && (
        <div className="mt-1 text-[11px] text-muted">
          {estimate.capped && "แต่ละเดือนไม่เกินเพดานที่ประกาศกำหนดไว้ — "}
          {estimate.footnote}
        </div>
      )}
    </div>
  );
}

// Local formatters — same rounding TaPlanner.tsx uses for the same reason:
// whole baht (a satang means nothing to a TA reading this), one decimal of
// hours (enough for a half-hour ตรวจงาน slot without float noise).
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const hrs1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");
