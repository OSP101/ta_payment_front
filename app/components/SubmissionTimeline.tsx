"use client";
import { Check, Clock } from "lucide-react";
import type { ReactNode } from "react";

// Timeline shape returned by GET /submission-periods/:id/courses/:tcId/tas/:taId/timeline
// (kept lax on unused fields so callers can hand in any superset).
export interface SubmissionTimelineData {
  period_id: string;
  period_label: string;
  year_month?: string;
  due_date: string;
  is_closed?: boolean;
  ta_id?: string;
  ta_name?: string;
  teaching_course_id?: string;
  course_code?: string;
  course_name_th?: string;
  status: "pending" | "exported" | "finance_sent" | "skipped";
  worklog_total?: number;
  worklog_unapproved?: number;
  exported_at?: string | null;
  exported_name?: string | null;
  finance_sent_at?: string | null;
  finance_sent_name?: string | null;
  finance_note?: string | null;
  // Latest "ตีกลับ" (send-back) event, if any.
  sent_back_at?: string | null;
  sent_back_name?: string | null;
  sent_back_reason?: string | null;
}

// Rank the monthly progress 0..3. The first step ("อาจารย์อนุมัติงานครบ") is
// derived from worklog readiness — there are no digital signatures; the daily
// approval IS the review.
function rankOf(d: SubmissionTimelineData): number {
  if (d.status === "finance_sent") return 3;
  if (d.status === "exported") return 2;
  const ready = (d.worklog_total ?? 0) > 0 && (d.worklog_unapproved ?? 0) === 0;
  return ready ? 1 : 0;
}

interface Step {
  key: string;
  label: string;
  signer?: string | null;
  at?: string | null;
  comment?: string | null;
}

function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // dd/mm/yyyy HH:MM:SS to match the mockup (Buddhist year like the rest of
  // the app is applied elsewhere; here we keep the raw calendar year).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SubmissionTimeline({
  data,
  title,
}: {
  data: SubmissionTimelineData;
  title?: ReactNode;
}) {
  const rank = rankOf(data);
  const steps: Step[] = [
    {
      key: "approved",
      label: "อาจารย์อนุมัติบันทึกเวลาครบทุกรายการ",
    },
    {
      key: "exported",
      label: "เจ้าหน้าที่ตรวจสอบและส่งออกไฟล์เบิกจ่าย",
      signer: data.exported_name,
      at: data.exported_at,
    },
    {
      key: "finance_sent",
      label: "ส่งเบิกจ่ายที่การเงิน",
      signer: data.finance_sent_name,
      at: data.finance_sent_at,
      comment: data.finance_note,
    },
  ];

  return (
    <section className="rounded-xl border border-hairline bg-white/60 dark:bg-slate-900/40">
      {title != null && (
        <header className="px-4 pt-3 pb-1 text-sm font-medium text-ink-1">
          {title}
        </header>
      )}
      {data.sent_back_at && (
        <div className="mx-4 mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="font-medium">
            ตีกลับโดย {data.sent_back_name ?? "-"}
            {data.sent_back_at && (
              <span className="ml-2 font-normal tabular">{fmt(data.sent_back_at)}</span>
            )}
          </div>
          {data.sent_back_reason && (
            <div className="mt-1 whitespace-pre-wrap">เหตุผล: {data.sent_back_reason}</div>
          )}
        </div>
      )}
      <ol className="relative px-4 py-3 space-y-4">
        {steps.map((step, idx) => {
          const done = idx + 1 <= rank;
          const active = idx + 1 === rank + 1;
          const upcoming = !done && !active;
          const isLast = idx === steps.length - 1;
          return (
            <li key={step.key} className="relative pl-9">
              {!isLast && (
                <span
                  aria-hidden
                  className={
                    "absolute left-3 top-6 -bottom-4 w-px " +
                    (done ? "bg-emerald-500" : "bg-hairline")
                  }
                />
              )}
              <span
                aria-hidden
                className={
                  "absolute left-0 top-0 grid place-items-center w-6 h-6 rounded-full " +
                  (done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-brand text-white"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400")
                }
              >
                {done ? (
                  <Check size={14} strokeWidth={3} />
                ) : active ? (
                  <Clock size={12} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className={upcoming ? "opacity-60" : ""}>
                <div className="text-sm text-ink-1">{step.label}</div>
                {done && step.signer && (
                  <div className="mt-1 text-xs text-ink-2">
                    <span className="text-muted">โดย </span>
                    <span className="font-medium text-ink-1">{step.signer}</span>
                    {step.at && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span className="tabular text-muted">{fmt(step.at)}</span>
                      </>
                    )}
                  </div>
                )}
                {done && step.comment && (
                  <div className="mt-2 rounded-md border border-hairline bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs text-ink-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">
                      ความคิดเห็น
                    </div>
                    <div className="whitespace-pre-wrap">{step.comment}</div>
                  </div>
                )}
                {active && !done && (
                  <div className="mt-1 text-xs text-muted">รอดำเนินการ</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
