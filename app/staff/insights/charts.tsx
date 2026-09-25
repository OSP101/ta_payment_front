"use client";
// Hand-rolled SVG charts for the question-led dashboard. The bundle has no
// chart library (see BudgetAnalytics' MonthlyChart note) and every chart here
// is a handful of shapes, so each one stays small and fully under our control:
// colours encode meaning (never rank), every mark has a hover label, and each
// chart has an aria-label that says what it shows.

import { useMemo, useRef, useState } from "react";
import type { CourseStaffing, MonthFlow, PlanRatios, StaffingStatus } from "../types";
import { STAFFING_META, FLOW_BUCKETS, baht, num1, thMonth, type BudgetView } from "./analysis";

/* -------------------------------------------------------------------------- */
/* Shared hover tooltip                                                       */
/* -------------------------------------------------------------------------- */

interface Tip { x: number; y: number; content: React.ReactNode }

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.MouseEvent, content: React.ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <div
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--panel-bg,#fff)] dark:bg-zinc-900 dark:border-zinc-700 px-3 py-2 text-xs shadow-lg"
      style={{
        left: Math.min(tip.x + 14, (ref.current?.clientWidth ?? 400) - 200),
        top: tip.y + 14,
      }}
    >
      {tip.content}
    </div>
  );
  return { ref, show, hide, node };
}

/* -------------------------------------------------------------------------- */
/* Budget gauge — a half ring: used, forecast, and a tick for time elapsed    */
/* -------------------------------------------------------------------------- */

export function BudgetGauge({ b }: { b: BudgetView }) {
  const R = 78, CX = 100, CY = 96, SW = 16;
  const arc = (from: number, to: number) => {
    const f = Math.max(0, Math.min(1, from)), t = Math.max(0, Math.min(1, to));
    if (t <= f) return "";
    const a0 = Math.PI * (1 - f), a1 = Math.PI * (1 - t);
    const x0 = CX + R * Math.cos(a0), y0 = CY - R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1), y1 = CY - R * Math.sin(a1);
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
  };
  const used = b.base > 0 ? b.used / b.base : 0;
  const fc = b.base > 0 ? b.forecast / b.base : 0;
  const hi = b.base > 0 ? b.projectedHigh / b.base : 0;
  const tone = b.verdict === "over" ? "#dc2626" : b.verdict === "tight" ? "#d97706" : "#0776BC";
  const tick = b.elapsedPct != null ? b.elapsedPct / 100 : null;
  const tickPos = (f: number, r: number) => {
    const a = Math.PI * (1 - f);
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  };
  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[260px]" role="img"
         aria-label={`ใช้งบไป ${Math.round(b.usedPct)}% ของงบรวม`}>
      <path d={arc(0, 1)} stroke="var(--hairline,#eef0f3)" strokeWidth={SW} fill="none" strokeLinecap="round" />
      {hi > fc && <path d={arc(fc, hi)} stroke={tone} strokeOpacity={0.18} strokeWidth={SW} fill="none" />}
      {fc > used && <path d={arc(used, fc)} stroke={tone} strokeOpacity={0.45} strokeWidth={SW} fill="none" />}
      <path d={arc(0, used)} stroke={tone} strokeWidth={SW} fill="none" strokeLinecap="round" />
      {tick != null && (() => {
        const p0 = tickPos(tick, R - SW / 2 - 4), p1 = tickPos(tick, R + SW / 2 + 4);
        return <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="var(--ink-1,#0f172a)" strokeWidth={2.5} strokeLinecap="round" />;
      })()}
      <text x={CX} y={CY - 18} textAnchor="middle" fontSize="28" fontWeight="600" fill="var(--ink-1,#0f172a)" className="tabular-nums">
        {Math.round(b.usedPct)}%
      </text>
      <text x={CX} y={CY + 2} textAnchor="middle" fontSize="10.5" fill="var(--ink-3,#64748b)">
        ใช้ไปแล้ว{tick != null ? ` · เวลา ${Math.round(tick * 100)}%` : ""}
      </text>
      <text x={CX - R} y={CY + 18} textAnchor="middle" fontSize="9.5" fill="var(--ink-4,#94a3b8)">0</text>
      <text x={CX + R} y={CY + 18} textAnchor="middle" fontSize="9.5" fill="var(--ink-4,#94a3b8)">100%</text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Budget stack — where every baht of the base sits right now                 */
/* -------------------------------------------------------------------------- */

export function BudgetStack({ b }: { b: BudgetView }) {
  const t = useTip();
  const scale = Math.max(b.base, b.projectedHigh, 1);
  const paid = Math.max(0, b.used - b.lump);
  const segs = [
    { key: "paid", label: "เบิกจ่ายแล้ว (รายชั่วโมง)", v: paid, color: "#0776BC" },
    { key: "lump", label: "เหมาจ่ายบัณฑิต ภาคพิเศษ", v: b.lump, color: "#6366f1" },
    { key: "pipe", label: "บันทึกแล้ว รออนุมัติ/ตรวจ", v: b.pipeline, color: "#7cb9e8", hatch: true },
    { key: "left", label: "งบคงเหลือ", v: Math.max(0, b.base - b.forecast), color: "#cbd5e1" },
  ].filter(s => s.v > 0.5);
  const timeX = b.elapsedPct != null ? (b.elapsedPct / 100) * (b.base / scale) * 100 : null;
  const baseX = (b.base / scale) * 100;
  return (
    <div ref={t.ref} className="relative">
      <div className="relative h-9 w-full rounded-lg bg-[var(--hairline,#eef0f3)] dark:bg-zinc-800">
        <div className="absolute inset-0 flex overflow-hidden rounded-lg">
          {segs.map(s => (
            <div key={s.key}
                 className="h-full border-e-2 border-white/70 dark:border-zinc-900/70 last:border-e-0 transition-opacity hover:opacity-80"
                 style={{
                   width: `${(s.v / scale) * 100}%`,
                   background: s.hatch
                     ? `repeating-linear-gradient(135deg, ${s.color}, ${s.color} 5px, ${s.color}99 5px, ${s.color}99 10px)`
                     : s.color,
                 }}
                 onMouseMove={e => t.show(e, <><b>{s.label}</b><div className="tabular-nums">{baht(s.v)} บาท · {Math.round((s.v / Math.max(b.base, 1)) * 100)}%</div></>)}
                 onMouseLeave={t.hide} />
          ))}
        </div>
        {timeX != null && (
          <div className="absolute -top-2 -bottom-2 w-0.5 rounded bg-[var(--ink-1,#0f172a)] dark:bg-white" style={{ left: `${timeX}%` }}
               title={`เวลาผ่านไป ${Math.round(b.elapsedPct!)}% ของเทอม`} />
        )}
        {b.projectedHigh > b.forecast && (
          <div className="absolute -bottom-1 h-1 rounded-full bg-amber-500/80"
               style={{ left: `${(b.forecast / scale) * 100}%`, width: `${((b.projectedHigh - b.forecast) / scale) * 100}%` }}
               title="ช่วงคาดการณ์ถ้าใช้ในอัตราเดิมจนสิ้นเทอม" />
        )}
        {scale > b.base && (
          <div className="absolute -top-3 -bottom-3 w-0 border-s-2 border-dashed border-red-500" style={{ left: `${baseX}%` }}
               title="งบรวม" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-2)]">
        {segs.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <b className="tabular-nums">{baht(s.v)}</b>
          </span>
        ))}
        {timeX != null && (
          <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
            <i className="inline-block h-3 w-0.5 bg-[var(--ink-1,#0f172a)] dark:bg-white" /> เวลาที่ผ่านไป
          </span>
        )}
        {b.projectedHigh > b.forecast && (
          <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
            <i className="inline-block h-1 w-3 rounded bg-amber-500" /> ช่วงคาดการณ์สิ้นเทอม
          </span>
        )}
      </div>
      {t.node}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Staffing scatter — students (x) against TAs requested (y)                  */
/* -------------------------------------------------------------------------- */

const SHAPES: Record<StaffingStatus, "circle" | "triangle" | "diamond" | "square" | "ring"> = {
  match: "circle", under: "ring", above_guide: "triangle", over_ceiling: "diamond", no_students: "square", no_request: "ring",
};

function Mark({ shape, x, y, r, color, active }: { shape: string; x: number; y: number; r: number; color: string; active?: boolean }) {
  const sw = active ? 2.5 : 1.5;
  const stroke = active ? "var(--ink-1,#0f172a)" : "white";
  switch (shape) {
    case "triangle":
      return <path d={`M ${x} ${y - r * 1.2} L ${x + r * 1.1} ${y + r * 0.8} L ${x - r * 1.1} ${y + r * 0.8} Z`} fill={color} stroke={stroke} strokeWidth={sw} />;
    case "diamond":
      return <path d={`M ${x} ${y - r * 1.3} L ${x + r * 1.1} ${y} L ${x} ${y + r * 1.3} L ${x - r * 1.1} ${y} Z`} fill={color} stroke={stroke} strokeWidth={sw} />;
    case "square":
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} fill={color} stroke={stroke} strokeWidth={sw} />;
    case "ring":
      return <circle cx={x} cy={y} r={r} fill="var(--panel-bg,#fff)" stroke={active ? "var(--ink-1,#0f172a)" : color} strokeWidth={2.2} />;
    default:
      return <circle cx={x} cy={y} r={r} fill={color} stroke={stroke} strokeWidth={sw} />;
  }
}

export function StaffingScatter({
  rows, plan, selected, onSelect,
}: {
  rows: CourseStaffing[]; plan: PlanRatios; selected?: string | null; onSelect?: (id: string) => void;
}) {
  const t = useTip();
  const W = 640, H = 300, L = 40, R = 16, T = 14, B = 38;
  const pts = rows.filter(r => r.requested > 0 && r.students > 0);
  const xMax = niceMax(Math.max(60, ...pts.map(r => r.students)));
  const yMax = Math.max(4, Math.ceil(Math.max(...pts.map(r => r.requested), xMax / plan.min_students_per_ta * 0.6) + 1));
  const sx = (v: number) => L + (v / xMax) * (W - L - R);
  const sy = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const xticks = ticks(xMax, 5);
  const yticks = Array.from({ length: yMax + 1 }, (_, i) => i).filter(i => yMax <= 8 || i % 2 === 0);

  // Jitter identical points a little so two courses of the same size and ask
  // do not hide one another.
  const placed = useMemo(() => {
    const seen = new Map<string, number>();
    return pts.map(r => {
      const k = `${r.students}:${r.requested}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { r, dx: n * 7, dy: 0 };
    });
  }, [pts]);

  // Reference lines, clipped to the plot.
  const line = (per: number) => {
    const x2 = Math.min(xMax, yMax * per);
    return { x1: sx(0), y1: sy(0), x2: sx(x2), y2: sy(x2 / per) };
  };
  // The plot region above y = x / per, as a closed path.
  const above = (per: number) => {
    const xEnd = Math.min(xMax, yMax * per);
    const pts = [[0, 0], [xEnd, xEnd / per]];
    if (xEnd >= xMax) pts.push([xMax, yMax]);
    pts.push([0, yMax]);
    return "M " + pts.map(([x, y]) => `${sx(x)} ${sy(y)}`).join(" L ") + " Z";
  };
  const guide = line(plan.students_per_ta);
  const ceil = line(plan.min_students_per_ta);

  if (pts.length === 0) {
    return <div className="py-12 text-center text-sm text-[var(--ink-3)]">ยังไม่มีวิชาที่ขอ TA และมีจำนวนนักศึกษา</div>;
  }
  return (
    <div ref={t.ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`กราฟจำนวนนักศึกษาเทียบจำนวน TA ที่ขอ ${pts.length} วิชา พร้อมเส้นเกณฑ์ 1 ต่อ ${plan.students_per_ta} และเพดาน 1 ต่อ ${plan.min_students_per_ta}`}>
        {/* zones: above the guide line is "เกินแนะนำ", above the ceiling "เกินเพดาน" */}
        <path d={above(plan.students_per_ta)} fill="#d97706" fillOpacity={0.06} />
        <path d={above(plan.min_students_per_ta)} fill="#dc2626" fillOpacity={0.07} />
        {yticks.map(v => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--hairline,#eef0f3)" />
            <text x={L - 8} y={sy(v) + 3.5} fontSize="10" textAnchor="end" fill="var(--ink-3,#64748b)">{v}</text>
          </g>
        ))}
        {xticks.map(v => (
          <text key={`x${v}`} x={sx(v)} y={H - B + 16} fontSize="10" textAnchor="middle" fill="var(--ink-3,#64748b)">{v}</text>
        ))}
        <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke="var(--border-strong,#d1d5db)" />
        <text x={(L + W - R) / 2} y={H - 4} fontSize="10.5" textAnchor="middle" fill="var(--ink-3,#64748b)">จำนวนนักศึกษาในวิชา</text>
        <text x={12} y={(T + H - B) / 2} fontSize="10.5" textAnchor="middle" fill="var(--ink-3,#64748b)"
              transform={`rotate(-90 12 ${(T + H - B) / 2})`}>TA ที่ขอ (คน)</text>

        <line {...guide} stroke="#16a34a" strokeWidth={1.75} />
        <LineLabel l={guide} at={0.42} color="#15803d" text={`แนะนำ 1:${plan.students_per_ta}`} />
        <line {...ceil} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 4" />
        <LineLabel l={ceil} at={0.3} color="#b91c1c" text={`เพดาน 1:${plan.min_students_per_ta}`} />

        {placed.map(({ r, dx }) => {
          const m = STAFFING_META[r.status];
          const active = selected === r.teaching_course_id;
          return (
            <g key={r.teaching_course_id} className="cursor-pointer"
               onClick={() => onSelect?.(r.teaching_course_id)}
               onMouseMove={e => t.show(e, (
                 <>
                   <div className="font-semibold">{r.code}</div>
                   <div className="text-[var(--ink-3)] line-clamp-1">{r.name_th}</div>
                   <div className="mt-1 tabular-nums">นักศึกษา {r.students} คน · {r.sittings} กลุ่มเรียน</div>
                   <div className="tabular-nums">ขอ <b>{r.requested}</b> · แนะนำ {r.recommended} · เพดาน {r.ceiling}</div>
                   <div className="tabular-nums">{num1(r.students_per_ta)} คนต่อ TA</div>
                   <div className="mt-1 font-medium" style={{ color: m.color }}>{m.label}</div>
                 </>
               ))}
               onMouseLeave={t.hide}>
              <Mark shape={SHAPES[r.status]} x={sx(r.students) + dx} y={sy(r.requested)} r={active ? 7.5 : 6} color={m.color} active={active} />
            </g>
          );
        })}
      </svg>
      {t.node}
    </div>
  );
}

/** A label laid along a reference line, on a small surface-coloured pill so
 *  it stays legible over gridlines, placed part-way so it clears the points
 *  that crowd the line's far end. */
function LineLabel({ l, at, color, text }: { l: { x1: number; y1: number; x2: number; y2: number }; at: number; color: string; text: string }) {
  const x = l.x1 + (l.x2 - l.x1) * at, y = l.y1 + (l.y2 - l.y1) * at;
  const angle = (Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI;
  const w = text.length * 5.6 + 10;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-w / 2} y={-17} width={w} height={14} rx={7} fill="var(--panel-bg,#fff)" fillOpacity={0.9} />
      <text x={0} y={-7} fontSize="10" textAnchor="middle" fill={color} fontWeight={500}>{text}</text>
    </g>
  );
}

export function StatusLegend({ counts, onPick, picked }: {
  counts: Record<StaffingStatus, number>; onPick?: (s: StaffingStatus | "") => void; picked?: string;
}) {
  const order: StaffingStatus[] = ["over_ceiling", "above_guide", "match", "under", "no_students", "no_request"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.filter(k => counts[k] > 0).map(k => {
        const m = STAFFING_META[k];
        const on = picked === k;
        return (
          <button key={k} type="button" onClick={() => onPick?.(on ? "" : k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-[var(--ink-2)] bg-[var(--ink-1)] text-white dark:bg-white dark:text-zinc-900" : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--ink-2)]"}`}>
            <svg width="12" height="12" viewBox="-7 -7 14 14" aria-hidden><Mark shape={SHAPES[k]} x={0} y={0} r={4.5} color={m.color} /></svg>
            {m.short} <b className="tabular-nums">{counts[k]}</b>
          </button>
        );
      })}
    </div>
  );
}

/** One bar per verdict, as a share of courses that asked. */
export function VerdictBar({ counts }: { counts: Record<StaffingStatus, number> }) {
  const order: StaffingStatus[] = ["match", "under", "above_guide", "over_ceiling", "no_students"];
  const total = order.reduce((s, k) => s + counts[k], 0);
  if (total === 0) return null;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--hairline,#eef0f3)]" role="img"
         aria-label={order.map(k => `${STAFFING_META[k].short} ${counts[k]}`).join(", ")}>
      {order.filter(k => counts[k] > 0).map(k => (
        <div key={k} title={`${STAFFING_META[k].label} ${counts[k]} วิชา`}
             className="h-full border-e-2 border-white/80 dark:border-zinc-900/70 last:border-e-0"
             style={{ width: `${(counts[k] / total) * 100}%`, background: STAFFING_META[k].color }} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Claim-month flow — who is holding each month's claims                      */
/* -------------------------------------------------------------------------- */

export function FlowChart({ flow }: { flow: MonthFlow[] }) {
  const t = useTip();
  const months = flow.filter(f => f.total > 0 || !f.is_closed);
  const max = Math.max(1, ...months.map(f => f.total));
  if (months.length === 0 || months.every(f => f.total === 0)) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีการบันทึกเวลาในภาคเรียนนี้</div>;
  }
  return (
    <div ref={t.ref} className="relative">
      <div className="space-y-2.5">
        {months.map(f => {
          const done = f.exported + f.finance_sent;
          return (
            <div key={f.year_month} className="grid grid-cols-[64px_minmax(0,1fr)_76px] items-center gap-3">
              <div className="text-xs">
                <div className="font-medium text-[var(--ink-1)]">{thMonth(f.year_month)} {f.year_month.slice(2, 4)}</div>
                <div className="text-[10.5px] text-[var(--ink-4)]">ปิด {f.due_date.slice(8, 10)}/{f.due_date.slice(5, 7)}</div>
              </div>
              <div className="flex h-6 overflow-hidden rounded-md bg-[var(--hairline,#eef0f3)] dark:bg-zinc-800"
                   style={{ width: `${Math.max(8, (f.total / max) * 100)}%` }}>
                {FLOW_BUCKETS.map(bk => {
                  const v = f[bk.key as keyof MonthFlow] as number;
                  if (!v) return null;
                  return (
                    <div key={bk.key} className="h-full border-e border-white/70 dark:border-zinc-900/60 last:border-e-0 hover:opacity-80"
                         style={{ width: `${(v / f.total) * 100}%`, background: bk.color }}
                         onMouseMove={e => t.show(e, <><b>{f.label}</b><div>{bk.label}: <b className="tabular-nums">{v}</b> รายการ</div></>)}
                         onMouseLeave={t.hide} />
                  );
                })}
              </div>
              <div className="text-end text-xs tabular-nums text-[var(--ink-2)]">
                {done}/{f.total} <span className="text-[var(--ink-4)]">เสร็จ</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--ink-3)]">
        {FLOW_BUCKETS.map(bk => (
          <span key={bk.key} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: bk.color }} />{bk.label}
          </span>
        ))}
      </div>
      {t.node}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut — TA document status                                                 */
/* -------------------------------------------------------------------------- */

export function Donut({ parts, center, sub, size = 132 }: {
  parts: { label: string; value: number; color: string }[]; center: React.ReactNode; sub?: string; size?: number;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img"
         aria-label={parts.map(p => `${p.label} ${p.value}`).join(", ")}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--hairline,#eef0f3)" strokeWidth="14" />
      {total > 0 && parts.filter(p => p.value > 0).map(p => {
        const len = (p.value / total) * C;
        const el = (
          <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="14"
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc}
                  transform="rotate(-90 60 60)">
            <title>{`${p.label} ${p.value}`}</title>
          </circle>
        );
        acc += len;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--ink-1,#0f172a)" className="tabular-nums">{center}</text>
      {sub && <text x="60" y="76" textAnchor="middle" fontSize="9.5" fill="var(--ink-3,#64748b)">{sub}</text>}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline + small bar                                                      */
/* -------------------------------------------------------------------------- */

export function Spark({ values, color = "#0776BC", w = 96, h = 28 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - (v / max) * (h - 6)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={`2,${h - 2} ${pts.join(" ")} ${w - 2},${h - 2}`} fill={color} fillOpacity={0.1} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill={color} />
    </svg>
  );
}

export function MiniBar({ value, max, color = "#0776BC", warnAt = 0.8 }: { value: number; max: number; color?: string; warnAt?: number }) {
  const p = max > 0 ? value / max : 0;
  const c = p > 1 ? "#dc2626" : p >= warnAt ? "#d97706" : color;
  return (
    <div className="h-1.5 w-full min-w-[56px] overflow-hidden rounded-full bg-[var(--hairline,#eef0f3)] dark:bg-zinc-800">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, background: c }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function niceMax(v: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

function ticks(max: number, n: number) {
  const step = niceMax(max / n);
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}
