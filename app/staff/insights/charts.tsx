"use client";
// Hand-rolled SVG charts for the question-led dashboard. The bundle has no
// chart library and every chart here is a handful of shapes, so each one
// stays small and fully under our control: colours encode meaning (never
// rank), every mark has a hover label, and each chart has an aria-label that
// says what it shows.
//
// Text: charts that hold text are drawn at their measured pixel width
// (useWidth) rather than scaled from a fixed viewBox, so a 12px label is 12px
// on a phone too — a viewBox scaled into 360px shrank labels to ~6px.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CourseStaffing, MonthFlow, PlanRatios, StaffingStatus } from "../types";
import { STAFFING_META, FLOW_BUCKETS, money, num1, thMonth, type BudgetView } from "./analysis";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

interface Tip { x: number; y: number; content: React.ReactNode }

export function useTip() {
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
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--panel-bg,#fff)] px-3 py-2 text-xs text-[var(--ink-1)] shadow-lg"
      style={{
        left: Math.max(0, Math.min(tip.x + 14, (ref.current?.clientWidth ?? 400) - 220)),
        top: tip.y + 14,
      }}
    >
      {tip.content}
    </div>
  );
  return { ref, show, hide, node };
}

/** The element's content width in CSS pixels, tracked on resize. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Enter/Space act like a click — for SVG marks and table rows made focusable. */
export const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

export function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

function ticks(max: number, n: number) {
  const step = niceMax(max / n);
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
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
    { key: "left", label: "ยังไม่ผูกพัน", v: b.uncommitted, color: "#dfe4ea" },
  ].filter(s => s.v > 0.5);
  const timeX = b.elapsedPct != null ? (b.elapsedPct / 100) * (b.base / scale) * 100 : null;
  const baseX = (b.base / scale) * 100;
  return (
    <div ref={t.ref} className="relative">
      <div className="relative h-9 w-full rounded-lg bg-[var(--hairline,#eef0f3)]" role="img"
           aria-label={segs.map(s => `${s.label} ${money(s.v)}`).join(", ")}>
        <div className="absolute inset-0 flex overflow-hidden rounded-lg">
          {segs.map(s => (
            <div key={s.key}
                 className="h-full border-e-2 border-white/70 last:border-e-0 transition-opacity hover:opacity-80"
                 style={{
                   width: `${(s.v / scale) * 100}%`,
                   background: s.hatch
                     ? `repeating-linear-gradient(135deg, ${s.color}, ${s.color} 5px, ${s.color}99 5px, ${s.color}99 10px)`
                     : s.color,
                 }}
                 onMouseMove={e => t.show(e, <><b>{s.label}</b><div className="tabular-nums">{money(s.v)} · {Math.round((s.v / Math.max(b.base, 1)) * 100)}% ของงบรวม</div></>)}
                 onMouseLeave={t.hide} />
          ))}
        </div>
        {timeX != null && (
          <div className="absolute -top-2 -bottom-2 w-0.5 rounded bg-[var(--ink-1,#0f172a)]" style={{ left: `${timeX}%` }}
               title={`เวลาผ่านไป ${Math.round(b.elapsedPct!)}% ของเทอม`} />
        )}
        {scale > b.base && (
          <div className="absolute -top-3 -bottom-3 w-0 border-s-2 border-dashed border-red-600" style={{ left: `${baseX}%` }}
               title="งบรวม" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-2)]">
        {segs.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm border border-black/10" style={{ background: s.color }} />
            {s.label} <b className="tabular-nums">{money(s.v)}</b>
          </span>
        ))}
        {timeX != null && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-0.5 bg-[var(--ink-1,#0f172a)]" /> เวลาที่ผ่านไปของเทอม
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

function courseTip(r: CourseStaffing) {
  const m = STAFFING_META[r.status];
  return (
    <>
      <div className="font-semibold">{r.code}</div>
      <div className="text-[var(--ink-3)] line-clamp-1">{r.name_th}</div>
      <div className="mt-1 tabular-nums">นักศึกษา {r.students} คน · {r.sittings} กลุ่มเรียน</div>
      <div className="tabular-nums">ขอ <b>{r.requested}</b> · แนะนำ {r.recommended} · เพดาน {r.ceiling}</div>
      <div className="tabular-nums">{num1(r.students_per_ta)} คนต่อ TA</div>
      <div className="mt-1 font-medium" style={{ color: m.ink }}>{m.label}</div>
    </>
  );
}

export function StaffingScatter({
  rows, plan, selected, onSelect,
}: {
  rows: CourseStaffing[]; plan: PlanRatios; selected?: string | null; onSelect?: (id: string) => void;
}) {
  const t = useTip();
  const { ref: box, w: W } = useWidth<HTMLDivElement>();
  const narrow = W < 480;
  const H = narrow ? 260 : 300, L = 40, R = 14, T = 14, B = 42;
  const pts = rows.filter(r => r.requested > 0 && r.students > 0);
  const xMax = niceMax(Math.max(60, ...pts.map(r => r.students)));
  const yMax = Math.max(4, Math.ceil(Math.max(...pts.map(r => r.requested), xMax / plan.min_students_per_ta * 0.6) + 1));
  const sx = (v: number) => L + (v / xMax) * (W - L - R);
  const sy = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const xticks = ticks(xMax, narrow ? 3 : 5);
  const yticks = Array.from({ length: yMax + 1 }, (_, i) => i).filter(i => yMax <= 8 || i % 2 === 0);

  // Jitter identical points a little so two courses of the same size and ask
  // do not hide one another.
  const placed = useMemo(() => {
    const seen = new Map<string, number>();
    return pts.map(r => {
      const k = `${r.students}:${r.requested}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { r, dx: n * 7 };
    });
  }, [pts]);

  const line = (per: number) => {
    const x2 = Math.min(xMax, yMax * per);
    return { x1: sx(0), y1: sy(0), x2: sx(x2), y2: sy(x2 / per) };
  };
  const above = (per: number) => {
    const xEnd = Math.min(xMax, yMax * per);
    const ps = [[0, 0], [xEnd, xEnd / per]];
    if (xEnd >= xMax) ps.push([xMax, yMax]);
    ps.push([0, yMax]);
    return "M " + ps.map(([x, y]) => `${sx(x)} ${sy(y)}`).join(" L ") + " Z";
  };
  const guide = line(plan.students_per_ta);
  const ceil = line(plan.min_students_per_ta);

  return (
    <div ref={box}>
      {pts.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--ink-3)]">ยังไม่มีวิชาที่ขอ TA และมีจำนวนนักศึกษา</div>
      ) : (
        <div ref={t.ref} className="relative">
          <svg width={W} height={H} className="block" role="group"
               aria-label={`กราฟจำนวนนักศึกษาเทียบจำนวน TA ที่ขอ ${pts.length} วิชา พร้อมเส้นเกณฑ์ 1 ต่อ ${plan.students_per_ta} และเพดาน 1 ต่อ ${plan.min_students_per_ta}`}>
            <path d={above(plan.students_per_ta)} fill="#d97706" fillOpacity={0.06} />
            <path d={above(plan.min_students_per_ta)} fill="#dc2626" fillOpacity={0.07} />
            {yticks.map(v => (
              <g key={`y${v}`}>
                <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--hairline,#eef0f3)" />
                <text x={L - 8} y={sy(v) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3,#64748b)">{v}</text>
              </g>
            ))}
            {xticks.map(v => (
              <text key={`x${v}`} x={sx(v)} y={H - B + 18} fontSize="12" textAnchor="middle" fill="var(--ink-3,#64748b)">{v}</text>
            ))}
            <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke="var(--border-strong,#d1d5db)" />
            <text x={(L + W - R) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill="var(--ink-3,#64748b)">จำนวนนักศึกษาในวิชา</text>
            <text x={13} y={(T + H - B) / 2} fontSize="12" textAnchor="middle" fill="var(--ink-3,#64748b)"
                  transform={`rotate(-90 13 ${(T + H - B) / 2})`}>TA ที่ขอ (คน)</text>

            <line {...guide} stroke="#16a34a" strokeWidth={1.75} />
            <LineLabel l={guide} at={0.42} color="#15803d" text={`แนะนำ 1:${plan.students_per_ta}`} />
            <line {...ceil} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 4" />
            <LineLabel l={ceil} at={0.3} color="#b91c1c" text={`เพดาน 1:${plan.min_students_per_ta}`} />

            {placed.map(({ r, dx }) => {
              const m = STAFFING_META[r.status];
              const active = selected === r.teaching_course_id;
              return (
                <g key={r.teaching_course_id} className="cursor-pointer focus:outline-none [&:focus-visible>*]:stroke-[var(--brand)]"
                   tabIndex={0} role="button"
                   aria-label={`${r.code} นักศึกษา ${r.students} คน ขอ ${r.requested} แนะนำ ${r.recommended} ${m.label}`}
                   onClick={() => onSelect?.(r.teaching_course_id)}
                   onKeyDown={onActivate(() => onSelect?.(r.teaching_course_id))}
                   onMouseMove={e => t.show(e, courseTip(r))}
                   onMouseLeave={t.hide}>
                  <Mark shape={SHAPES[r.status]} x={sx(r.students) + dx} y={sy(r.requested)} r={active ? 7.5 : 6} color={m.color} active={active} />
                </g>
              );
            })}
          </svg>
          {t.node}
        </div>
      )}
    </div>
  );
}

/** A label laid along a reference line, on a small surface-coloured pill so
 *  it stays legible over gridlines, placed part-way so it clears the points
 *  that crowd the line's far end. */
function LineLabel({ l, at, color, text }: { l: { x1: number; y1: number; x2: number; y2: number }; at: number; color: string; text: string }) {
  const x = l.x1 + (l.x2 - l.x1) * at, y = l.y1 + (l.y2 - l.y1) * at;
  const angle = (Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI;
  const w = text.length * 6.8 + 12;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-w / 2} y={-20} width={w} height={17} rx={8} fill="var(--panel-bg,#fff)" fillOpacity={0.92} />
      <text x={0} y={-7.5} fontSize="12" textAnchor="middle" fill={color} fontWeight={500}>{text}</text>
    </g>
  );
}

/** The scatter's small-data form: one row per course with a bullet bar —
 *  the bar is what was asked, the green tick the recommendation, the red
 *  dashed tick the ceiling. */
export function StaffingRows({ rows, selected, onSelect }: {
  rows: CourseStaffing[]; selected?: string | null; onSelect?: (id: string) => void;
}) {
  const pts = rows.filter(r => r.requested > 0)
    .sort((a, b) => STAFFING_META[a.status].rank - STAFFING_META[b.status].rank || b.students - a.students);
  if (pts.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--ink-3)]">ยังไม่มีวิชาที่ส่งคำขอ TA</div>;
  }
  const max = Math.max(...pts.map(r => Math.max(r.ceiling, r.requested)), 1) + 1;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <ul className="divide-y divide-[var(--hairline)]">
      {pts.map(r => {
        const m = STAFFING_META[r.status];
        const on = selected === r.teaching_course_id;
        return (
          <li key={r.teaching_course_id}>
            <button type="button" onClick={() => onSelect?.(r.teaching_course_id)}
                    className={`grid w-full grid-cols-1 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-2.5 text-start hover:bg-slate-50 ${on ? "bg-[var(--brand-soft,#e7f3fb)]" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink-1)]">
                  {r.code} <span className="ms-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${m.color}1a`, color: m.ink }}>{m.short}</span>
                </div>
                <div className="text-xs text-[var(--ink-3)] tabular-nums">
                  นศ. {r.students} คน · ขอ {r.requested} · แนะนำ {r.recommended} · เพดาน {r.ceiling}
                </div>
              </div>
              <div className="relative h-4" aria-hidden>
                <div className="absolute inset-y-1 start-0 end-0 rounded-full bg-[var(--hairline,#eef0f3)]" />
                <div className="absolute inset-y-1 start-0 rounded-full" style={{ width: pct(r.requested), background: m.color }} />
                <i className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[#15803d]" style={{ left: pct(r.recommended) }} />
                <i className="absolute -top-1 -bottom-1 w-0 border-s-2 border-dashed border-[#b91c1c]" style={{ left: pct(r.ceiling) }} />
              </div>
            </button>
          </li>
        );
      })}
      <li className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded-full bg-[#0776BC]" />TA ที่ขอ (สีตามผลการเทียบ)</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-[#15803d]" />ที่ระบบแนะนำ</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-0 border-s-2 border-dashed border-[#b91c1c]" />เพดานต่อนักศึกษา</span>
      </li>
    </ul>
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
          <button key={k} type="button" onClick={() => onPick?.(on ? "" : k)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-[var(--ink-2)] bg-[var(--ink-1)] text-white" : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--ink-2)]"}`}>
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
             className="h-full border-e-2 border-white/80 last:border-e-0"
             style={{ width: `${(counts[k] / total) * 100}%`, background: STAFFING_META[k].color }} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Claim-month flow — who is holding each month's claims                      */
/* -------------------------------------------------------------------------- */

export function FlowChart({ months }: { months: MonthFlow[] }) {
  const t = useTip();
  const max = Math.max(1, ...months.map(f => f.total));
  if (months.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีการบันทึกเวลาในภาคเรียนนี้</div>;
  }
  return (
    <div ref={t.ref} className="relative">
      <div className="space-y-2.5">
        {months.map(f => {
          const done = f.exported + f.finance_sent;
          return (
            <div key={f.year_month} className="grid grid-cols-[68px_minmax(0,1fr)_72px] items-center gap-3"
                 role="img" aria-label={`${f.label}: ${FLOW_BUCKETS.filter(bk => f[bk.key as keyof MonthFlow]).map(bk => `${bk.label} ${f[bk.key as keyof MonthFlow]}`).join(", ")}`}>
              <div className="text-xs">
                <div className="font-medium text-[var(--ink-1)]">{thMonth(f.year_month)} {f.year_month.slice(2, 4)}</div>
                <div className="text-[var(--ink-3)]">ปิด {f.due_date.slice(8, 10)}/{f.due_date.slice(5, 7)}</div>
              </div>
              <div className="flex h-6 overflow-hidden rounded-md bg-[var(--hairline,#eef0f3)]"
                   style={{ width: `${Math.max(8, (f.total / max) * 100)}%` }}>
                {FLOW_BUCKETS.map(bk => {
                  const v = f[bk.key as keyof MonthFlow] as number;
                  if (!v) return null;
                  return (
                    <div key={bk.key} className="h-full border-e border-white/70 last:border-e-0 hover:opacity-80"
                         style={{ width: `${(v / f.total) * 100}%`, background: bk.color }}
                         onMouseMove={e => t.show(e, <><b>{f.label}</b><div>{bk.label}: <b className="tabular-nums">{v}</b> รายการ</div>
                           {f.codes?.[bk.key]?.length ? <div className="text-[var(--ink-3)]">{f.codes[bk.key].join(", ")}</div> : null}</>)}
                         onMouseLeave={t.hide} />
                  );
                })}
              </div>
              <div className="text-end text-xs tabular-nums text-[var(--ink-2)]">
                {done}/{f.total} <span className="text-[var(--ink-3)]">เสร็จ</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--ink-3)]">
        {FLOW_BUCKETS.map(bk => (
          <span key={bk.key} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm" style={{ background: bk.color }} />{bk.label}
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
      <text x="60" y="62" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--ink-1,#0f172a)" className="tabular-nums">{center}</text>
      {sub && <text x="60" y="80" textAnchor="middle" fontSize="12" fill="var(--ink-3,#64748b)">{sub}</text>}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Small bar                                                                  */
/* -------------------------------------------------------------------------- */

/** value/max as a bar; amber at warnAt (pass the page's near-cap ratio), red
 *  past 100%. Colour follows capState's line, so it never disagrees with it. */
export function MiniBar({ value, max, warnAt, over }: { value: number; max: number; warnAt: number; over?: boolean }) {
  const p = max > 0 ? value / max : 0;
  const c = over || p > 1 ? "#dc2626" : p >= warnAt ? "#d97706" : "#0776BC";
  return (
    <div className="h-2 w-full min-w-[56px] overflow-hidden rounded-full bg-[var(--hairline,#eef0f3)]">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, background: c }} />
    </div>
  );
}

