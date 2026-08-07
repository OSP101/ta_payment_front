"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Download, TrendingUp, Wallet, Clock3, Users } from "lucide-react";
import { Panel, Chip, Button, Select, StatCard } from "../components/ui";
import { api, type Term } from "../lib/api";
import { type TermAnalytics, curriculumTH } from "./types";

/* -------------------------------------------------------------------------- */
/* มุมบริหาร: เงินไปไหน เร็วแค่ไหน หลักสูตรไหนใช้เยอะ                            */
/* -------------------------------------------------------------------------- */
//
// Shared between /staff (below the officer's queues) and /executive (the
// read-only page for management). Every figure comes from /dashboard/analytics
// — the settle-based numbers that also price the printed claim — so this
// section, the Excel export and the claim documents always agree.

export default function BudgetAnalytics({ termId }: { termId: string }) {
  const key = termId ? `/dashboard/analytics?term_id=${termId}` : "/dashboard/analytics";
  const { data: a } = useSWR<TermAnalytics>(key);

  // เทียบกับเทอมอื่น — only offered when another term actually exists. The
  // second request fires only after a term is picked.
  const { data: terms } = useSWR<Term[]>("/terms");
  const [compareId, setCompareId] = useState("");
  const compareOptions = (terms ?? []).filter(t => t.id !== (a?.term_id ?? termId));
  const { data: b } = useSWR<TermAnalytics>(
    compareId ? `/dashboard/analytics?term_id=${compareId}` : null,
  );

  const [downloading, setDownloading] = useState(false);
  const downloadXlsx = async () => {
    setDownloading(true);
    try {
      const blob = await api.get<Blob>(`/dashboard/analytics.xlsx?term_id=${a?.term_id ?? termId}`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `ta-budget-${(a?.term_label ?? "").replace("/", "-") || "analytics"}.xlsx`;
      el.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!a) {
    return <div className="mt-4 h-64 rounded-xl border border-border bg-surface animate-pulse" />;
  }

  const remaining = Math.max(0, a.budget_allocated - a.budget_used);
  const usedPct = a.budget_allocated > 0 ? (a.budget_used / a.budget_allocated) * 100 : 0;
  const avgPerHour = a.approved_hours > 0 ? a.budget_used / a.approved_hours : 0;
  const avgPerHourB = b && b.approved_hours > 0 ? b.budget_used / b.approved_hours : null;

  // Pace: ahead = spending faster than the calendar. Only meaningful when the
  // term has dates and a cap.
  const hasPace = a.elapsed_pct >= 0 && a.budget_allocated > 0;
  const aheadPts = usedPct - a.elapsed_pct;

  return (
    <div className="mt-6" data-tour="dash-analytics">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink-1)]">สรุปการใช้งบประมาณ</h2>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">
            ยอดเบิกจ่ายจริงของแต่ละเดือน ตรงกับเอกสารเบิกจ่าย
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compareOptions.length > 0 && (
            <Select
              aria-label="เทียบกับเทอม"
              value={compareId}
              onChange={e => setCompareId(e.target.value)}
              className="text-sm"
            >
              <option value="">ไม่เปรียบเทียบ</option>
              {compareOptions.map(t => (
                <option key={t.id} value={t.id}>
                  เทียบกับ {t.academic_year}/{t.semester}
                </option>
              ))}
            </Select>
          )}
          <Button variant="primary" size="sm" onClick={downloadXlsx} disabled={downloading}>
            <Download size={15} className="me-1.5" />
            {downloading ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด Excel"}
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="เบิกจ่ายแล้ว" value={`${baht(a.budget_used)} บ.`} icon={<Wallet size={18} />} tone="brand"
                  hint={b ? deltaText(a.budget_used, b.budget_used, b.term_label) : `${usedPct.toFixed(1)}% ของเพดานรวม`} />
        <StatCard label="งบทั้งหมด / คงเหลือ" value={`${baht(a.budget_allocated)} / ${baht(remaining)} บ.`}
                  icon={<TrendingUp size={18} />}
                  hint={`จาก ${a.courses_with_ta} วิชาที่ขอใช้ TA`} />
        <StatCard label="ค่าใช้จ่ายเฉลี่ยต่อชั่วโมง" value={avgPerHour > 0 ? `${avgPerHour.toFixed(1)} บ.` : "—"}
                  icon={<Clock3 size={18} />}
                  hint={avgPerHourB != null && avgPerHour > 0
                    ? deltaText(avgPerHour, avgPerHourB, b!.term_label, 1)
                    : `${fmtNum(a.approved_hours)} ชม.อนุมัติ`} />
        <StatCard label="TA และวิชาที่ใช้ TA" value={`${a.total_tas} คน · ${a.courses_with_ta} วิชา`}
                  icon={<Users size={18} />}
                  hint={a.courses_open > 0 ? `${((a.courses_with_ta / a.courses_open) * 100).toFixed(0)}% ของ ${a.courses_open} วิชาที่เปิด` : undefined} />
      </div>

      {/* Pace */}
      {hasPace && (
        <Panel title="การใช้งบเทียบกับเวลาของเทอม"
               description="แถบสีน้ำเงินคืองบที่เบิกไปแล้ว ขีดสีส้มคือเวลาที่ผ่านไปของเทอม"
               className="mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--ink-3)] tabular shrink-0">0</span>
            <div className="relative h-2.5 flex-1 rounded-full bg-[var(--surface-2,#eef1f5)] overflow-visible">
              <span className="absolute inset-y-0 start-0 rounded-full bg-[var(--brand)]"
                    style={{ width: `${Math.min(100, usedPct)}%` }} />
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-amber-500"
                    style={{ left: `${a.elapsed_pct}%` }} />
            </div>
            <span className="text-xs text-[var(--ink-3)] tabular shrink-0">{baht(a.budget_allocated)} บ.</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs">
            <span className="text-[var(--ink-2)]">เบิกแล้ว <b className="tabular">{usedPct.toFixed(1)}%</b></span>
            <span className="text-[var(--ink-2)]">เวลาผ่านไป <b className="tabular">{a.elapsed_pct.toFixed(0)}%</b> ของเทอม</span>
            {aheadPts > 5 ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                ใช้งบเร็วกว่าปกติ งบอาจไม่พอถึงสิ้นเทอม
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">การใช้งบยังปกติ</span>
            )}
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-5 mb-4">
        {/* Monthly disbursement */}
        <Panel title="การเบิกจ่ายรายเดือน"
               description="กราฟแท่งคือยอดแต่ละเดือน เส้นสีเขียวคือยอดรวมสะสม"
               className="min-w-0 lg:col-span-3">
          <MonthlyChart a={a} b={b ?? undefined} />
        </Panel>

        {/* Per-curriculum */}
        <Panel title="การใช้งบรายหลักสูตร"
               description="วิชาที่เปิดให้หลายหลักสูตร นับรวมในหลักสูตรหลักของวิชานั้น"
               className="min-w-0 lg:col-span-2">
          <CurriculumBars a={a} />
        </Panel>
      </div>

      {/* Per-course table */}
      <Panel title="วิชาที่ใช้ TA เรียงตามยอดเบิกจ่าย"
             description="แถวสีส้มคือใช้งบเกิน 80% แล้ว แถวสีแดงคือเกินเพดานของวิชา">
        <CourseTable a={a} />
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function baht(v: number) {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
function fmtNum(v: number) {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 1 });
}
function deltaText(now: number, prev: number, prevLabel: string, digits = 0) {
  if (prev <= 0) return `เทอม ${prevLabel} ไม่มีข้อมูล`;
  const d = now - prev;
  const word = d > 0 ? "เพิ่มขึ้น" : d < 0 ? "ลดลง" : "เท่ากับ";
  if (d === 0) return `เท่ากับเทอม ${prevLabel}`;
  return `${word} ${Math.abs(d).toLocaleString("th-TH", { maximumFractionDigits: digits })} จากเทอม ${prevLabel}`;
}

/* ---------------------------- monthly bar chart --------------------------- */
//
// Hand-rolled SVG: five-ish bars and a line need no chart library, and the
// existing bundle has none — adding one for this panel would be the heaviest
// dependency in the app.

function MonthlyChart({ a, b }: { a: TermAnalytics; b?: TermAnalytics }) {
  const months = a.monthly ?? [];
  const compare = b?.monthly ?? [];
  const W = 560, H = 230, L = 52, R = 10, T = 16, B = 34;

  const { bars, cumPts, yMax, ticks } = useMemo(() => {
    let cum = 0;
    const cums = months.map(m => (cum += m.baht));
    // The axis must reach the cap (the line's destination) or the cumulative
    // series, whichever is taller — otherwise the story "จะชนเพดานไหม" is cut off.
    const top = Math.max(a.budget_allocated, cums[cums.length - 1] ?? 0, 1);
    const yMax = niceCeil(top);
    const innerW = W - L - R, innerH = H - T - B;
    const slot = innerW / Math.max(1, months.length);
    const bw = Math.min(56, slot * 0.55);
    const bars = months.map((m, i) => ({
      x: L + slot * i + (slot - bw) / 2,
      y: T + innerH * (1 - m.baht / yMax),
      w: bw,
      h: innerH * (m.baht / yMax),
      label: thMonth(m.year_month),
      value: m.baht,
    }));
    const cumPts = months.map((m, i) => ({
      x: L + slot * i + slot / 2,
      y: T + innerH * (1 - cums[i] / yMax),
    }));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
      y: T + innerH * (1 - f),
      label: baht(yMax * f),
    }));
    return { bars, cumPts, yMax, ticks };
  }, [months, a.budget_allocated]);

  if (months.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีการเบิกจ่ายในเทอมนี้</div>;
  }

  const capY = T + (H - T - B) * (1 - a.budget_allocated / yMax);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img"
           aria-label="กราฟการเบิกจ่ายรายเดือน">
        {ticks.map(t => (
          <g key={t.y}>
            <line x1={L} y1={t.y} x2={W - R} y2={t.y} stroke="var(--hairline)" strokeWidth="1" />
            <text x={L - 6} y={t.y + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-3)" className="tabular">
              {t.label}
            </text>
          </g>
        ))}
        {a.budget_allocated > 0 && (
          <g>
            <line x1={L} y1={capY} x2={W - R} y2={capY} stroke="var(--danger,#dc2626)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={W - R} y={capY - 4} textAnchor="end" fontSize="10" fill="var(--danger,#dc2626)">
              เพดาน {baht(a.budget_allocated)}
            </text>
          </g>
        )}
        {bars.map(bar => (
          <g key={bar.x}>
            <rect x={bar.x} y={bar.y} width={bar.w} height={Math.max(1, bar.h)} rx="2" fill="var(--brand)" />
            <text x={bar.x + bar.w / 2} y={bar.y - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)" className="tabular">
              {baht(bar.value)}
            </text>
            <text x={bar.x + bar.w / 2} y={H - 12} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
              {bar.label}
            </text>
          </g>
        ))}
        <polyline fill="none" stroke="var(--success,#059669)" strokeWidth="2"
                  points={cumPts.map(p => `${p.x},${p.y}`).join(" ")} />
        {cumPts.map(p => <circle key={p.x} cx={p.x} cy={p.y} r="3" fill="var(--success,#059669)" />)}
      </svg>
      <div className="flex flex-wrap gap-4 mt-1 text-[11px] text-[var(--ink-3)]">
        <span><i className="inline-block size-2.5 rounded-sm bg-[var(--brand)] me-1.5 align-[-1px]" />ยอดต่อเดือน</span>
        <span><i className="inline-block size-2.5 rounded-sm bg-emerald-600 me-1.5 align-[-1px]" />ยอดสะสม</span>
        <span><i className="inline-block size-2.5 rounded-sm bg-red-600 me-1.5 align-[-1px]" />เพดานรวม</span>
        {b && compare.length > 0 && (
          <span className="text-[var(--ink-2)]">
            เทอม {b.term_label} เบิกรวม {baht(b.budget_used)} บ. ส่วนเทอมนี้ {baht(a.budget_used)} บ.
          </span>
        )}
      </div>
    </div>
  );
}

function niceCeil(v: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const step = mag / 2;
  return Math.ceil(v / step) * step;
}

function thMonth(ym: string) {
  const m = Number(ym.slice(5, 7));
  const names = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return names[m] ?? ym;
}

/* --------------------------- per-curriculum bars -------------------------- */

function CurriculumBars({ a }: { a: TermAnalytics }) {
  const rows = a.curricula ?? [];
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีข้อมูลหลักสูตร (นำเข้ารายวิชาอีกครั้งระบบจะดึงหลักสูตรให้เอง)</div>;
  }
  const maxSpend = Math.max(...rows.map(r => r.spent_baht), 1);
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <div key={r.curriculum || "unknown"}
             className="grid grid-cols-[minmax(0,1.2fr)_minmax(60px,1fr)_auto] items-center gap-3 py-1.5 border-b border-dashed border-[var(--hairline)] last:border-0">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--ink-1)] truncate">{curriculumTH(r.curriculum)}</div>
            <div className="text-[11px] text-[var(--ink-3)]">
              เปิด {r.courses_open} วิชา
              {r.courses_with_ta > 0 && <> · ใช้ TA {r.courses_with_ta} วิชา · {r.tas} คน</>}
            </div>
          </div>
          <div className="h-3 rounded bg-[var(--surface-2,#eef1f5)] overflow-hidden">
            <div className="h-full rounded bg-[var(--brand)]"
                 style={{ width: `${(r.spent_baht / maxSpend) * 100}%` }} />
          </div>
          <div className="text-xs text-[var(--ink-2)] tabular text-end whitespace-nowrap">
            <b>{baht(r.spent_baht)}</b>{r.cap_baht > 0 && <> / {baht(r.cap_baht)}</>} บ.
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ course table ------------------------------ */

function CourseTable({ a }: { a: TermAnalytics }) {
  const rows = a.courses ?? [];
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--ink-3)]">ยังไม่มีวิชาที่ขอใช้ TA ในเทอมนี้</div>;
  }
  return (
    <div className="overflow-x-auto">
      {/* Seven columns do not fit a phone. Without a floor the browser keeps
          the table inside the screen by crushing the course name to one word
          per line — six lines tall and still unreadable. Given a floor it
          scrolls instead, which is the honest trade. */}
      <table className="w-full min-w-[680px] text-sm sm:min-w-0">
        <thead>
          <tr className="text-start text-[11px] uppercase tracking-wide text-[var(--ink-3)] border-b border-[var(--hairline)]">
            <th className="py-2 pe-3 text-start font-semibold">วิชา</th>
            <th className="py-2 pe-3 text-start font-semibold">หลักสูตร</th>
            <th className="py-2 pe-3 text-end font-semibold">TA</th>
            <th className="py-2 pe-3 text-end font-semibold">ชม.อนุมัติ</th>
            <th className="py-2 pe-3 text-end font-semibold">เบิกจ่าย</th>
            <th className="py-2 pe-3 text-end font-semibold">เพดานวิชา</th>
            <th className="py-2 text-start font-semibold">สัดส่วน</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {rows.map(c => {
            const pct = c.cap_baht > 0 ? (c.spent_baht / c.cap_baht) * 100 : 0;
            const tone = c.over_budget || pct >= 100 ? "danger" : pct >= 80 ? "warn" : "brand";
            const barColor = tone === "danger" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-[var(--brand)]";
            return (
              <tr key={c.teaching_course_id}>
                <td className="py-2.5 pe-3">
                  <span className="font-semibold">{c.code}</span>{" "}
                  <span className="text-[var(--ink-2)]">{c.name_th}</span>
                </td>
                <td className="py-2.5 pe-3 whitespace-nowrap text-[var(--ink-2)]">{curriculumTH(c.curriculum)}</td>
                <td className="py-2.5 pe-3 text-end tabular">{c.tas}</td>
                <td className="py-2.5 pe-3 text-end tabular">{fmtNum(c.approved_hours)}</td>
                <td className="py-2.5 pe-3 text-end tabular font-medium">{baht(c.spent_baht)}</td>
                <td className="py-2.5 pe-3 text-end tabular text-[var(--ink-3)]">{c.cap_baht > 0 ? baht(c.cap_baht) : "—"}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2 min-w-[130px]">
                    <div className="h-2 w-20 rounded-full bg-[var(--surface-2,#eef1f5)] overflow-hidden shrink-0">
                      <div className={`h-full rounded-full ${barColor}`}
                           style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    {c.over_budget
                      ? <Chip tone="danger">เกินเพดาน</Chip>
                      : <span className="text-xs tabular text-[var(--ink-2)]">{c.cap_baht > 0 ? `${pct.toFixed(0)}%` : "ยังไม่ตั้งงบ"}</span>}
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
