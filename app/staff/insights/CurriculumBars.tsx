"use client";
// การใช้งบรายหลักสูตร — spend per curriculum against the sum of its courses'
// caps, with a per-curriculum course drill-down. Moved here from the retired
// BudgetAnalytics.tsx (26/09/2026) so the page has one money formatter and
// one "ใกล้เพดาน" rule (capState).

import { useState } from "react";
import { Eye } from "lucide-react";
import { Chip, Modal, Tip } from "../../components/ui";
import { type TermAnalytics, type CourseSpendStat, curriculumTH } from "../types";
import { CAP_META, capState, money, num1, nearCapRatio, pct0 } from "./analysis";
import { MiniBar } from "./charts";

export default function CurriculumBars({ a }: { a: TermAnalytics }) {
  const rows = a.curricula ?? [];
  const [detail, setDetail] = useState<string | null>(null);
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีข้อมูลหลักสูตร (นำเข้ารายวิชาอีกครั้งระบบจะดึงหลักสูตรให้เอง)</div>;
  }
  const maxSpend = Math.max(...rows.map(r => r.spent_baht), 1);
  const detailRow = rows.find(r => (r.curriculum || "unknown") === detail);
  const detailCourses = (a.courses ?? []).filter(c => (c.curriculum || "unknown") === detail);
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <div key={r.curriculum || "unknown"} className="py-2 border-b border-dashed border-[var(--hairline)] last:border-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--ink-1)]">{curriculumTH(r.curriculum)}</div>
              <div className="text-xs text-[var(--ink-3)]">
                เปิด {r.courses_open} วิชา
                {r.courses_with_ta > 0 && <> · ใช้ TA {r.courses_with_ta} วิชา · {r.tas} คน</>}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <div className="text-xs text-[var(--ink-2)] tabular-nums text-end whitespace-nowrap">
                <b className="text-sm">{money(r.spent_baht)}</b>
                {r.cap_baht > 0 && <div className="text-[var(--ink-3)]">งบ {money(r.cap_baht)}</div>}
              </div>
              <Tip content="ดูรายละเอียดรายวิชา"><button type="button" onClick={() => setDetail(r.curriculum || "unknown")}
                      aria-label={`ดูรายวิชาของ${curriculumTH(r.curriculum)}`}
                      className="tap-target rounded-md p-1.5 text-[var(--ink-3)] hover:bg-slate-100 hover:text-[var(--ink-1)]">
                <Eye size={16} />
              </button></Tip>
            </div>
          </div>
          <Tip content={`ใช้ไป ${money(r.spent_baht)}\nความยาวแท่งเทียบกับหลักสูตรที่ใช้มากที่สุด`}>
            <div className="mt-1.5 h-2.5 rounded bg-[var(--hairline,#eef0f3)] overflow-hidden">
              <div className="h-full rounded bg-[var(--brand)]" style={{ width: `${(r.spent_baht / maxSpend) * 100}%` }} />
            </div>
          </Tip>
        </div>
      ))}

      <Modal open={!!detail} onClose={() => setDetail(null)}
             title={detailRow ? `การใช้งบ: ${curriculumTH(detailRow.curriculum)}` : ""} size="2xl">
        {detailRow && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <DetailStat label="เปิดสอน" value={`${detailRow.courses_open} วิชา`} />
              <DetailStat label="ใช้ TA" value={`${detailRow.courses_with_ta} วิชา · ${detailRow.tas} คน`} />
              <DetailStat label="เบิกจ่ายแล้ว" value={money(detailRow.spent_baht)} />
              <DetailStat label="งบของหลักสูตร" value={detailRow.cap_baht > 0 ? money(detailRow.cap_baht) : "ยังไม่มีวิชาที่ขอ TA"} />
            </div>
            <CourseTable rows={detailCourses} ratio={nearCapRatio(a)} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-slate-50 px-2.5 py-1.5">
      <div className="text-xs text-[var(--ink-3)]">{label}</div>
      <div className="font-medium tabular-nums text-[var(--ink-1)]">{value}</div>
    </div>
  );
}

function CourseTable({ rows, ratio }: { rows: CourseSpendStat[]; ratio: number }) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--ink-3)]">ยังไม่มีวิชาที่ขอใช้ TA ในหลักสูตรนี้</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm sm:min-w-0">
        <thead>
          <tr className="text-xs text-[var(--ink-3)] border-b border-[var(--hairline)]">
            <th className="py-2 pe-3 text-start font-semibold">วิชา</th>
            <th className="py-2 pe-3 text-end font-semibold">TA</th>
            <th className="py-2 pe-3 text-end font-semibold">ชม.อนุมัติ</th>
            <th className="py-2 pe-3 text-end font-semibold">เบิกจ่าย (บาท)</th>
            <th className="py-2 pe-3 text-end font-semibold">เพดานวิชา (บาท)</th>
            <th className="py-2 text-start font-semibold">คาดการณ์เทียบเพดาน</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {rows.map(c => {
            const st = capState({ cap_baht: c.cap_baht, forecast_baht: c.forecast_baht ?? c.spent_baht, unfunded_baht: c.unfunded_baht ?? 0 }, ratio);
            const fc = c.forecast_baht ?? c.spent_baht;
            return (
              <tr key={c.teaching_course_id}>
                <td className="py-2.5 pe-3">
                  <span className="font-semibold">{c.code}</span>{" "}
                  <span className="text-[var(--ink-2)]">{c.name_th}</span>
                </td>
                <td className="py-2.5 pe-3 text-end tabular-nums">{c.tas}</td>
                <td className="py-2.5 pe-3 text-end tabular-nums">{num1(c.approved_hours)}</td>
                <td className="py-2.5 pe-3 text-end tabular-nums font-medium">{Math.round(c.spent_baht).toLocaleString("th-TH")}</td>
                <td className="py-2.5 pe-3 text-end tabular-nums text-[var(--ink-3)]">{c.cap_baht > 0 ? Math.round(c.cap_baht).toLocaleString("th-TH") : "–"}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2 min-w-[150px]">
                    <div className="w-20 shrink-0"><MiniBar value={fc} max={c.cap_baht} warnAt={ratio} over={st === "over"} /></div>
                    {st === "over" || st === "near"
                      ? <Chip tone={st === "over" ? "danger" : "warn"}>{CAP_META[st].label}</Chip>
                      : <span className="text-xs tabular-nums text-[var(--ink-2)]">{c.cap_baht > 0 ? pct0((fc / c.cap_baht) * 100) : "–"}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
