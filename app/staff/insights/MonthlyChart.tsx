"use client";
// การเบิกจ่ายสะสมเทียบเวลา — two panels on one time axis (26/09/2026).
//
// Top: the running total against a straight reference line from 0 at the
// term's first day to งบรวม at its last ("if every month cost the same"). It
// is a yardstick, not a target: TA work is lumpy (exam months are heavy), so
// the line is labelled as a reference, never as a plan.
//
// Bottom: each month's disbursement on its own axis. The old single-axis
// chart stretched the axis up to งบรวม so the running total had room, which
// flattened the monthly bars into the floor; splitting the panels gives each
// series the scale it needs.
//
// The graduate-special lump is in both (its own colour in the bars), dated by
// the server (MonthSpend.lump_baht), and any lump no month carries yet is a
// final step on the running total — so the line ends on budget_used, the
// KPI's figure, to the baht. The month that contains today is drawn hollow
// and labelled "ถึงวันนี้" so a half-finished month does not read as a drop.

import { useMemo } from "react";
import type { TermAnalytics } from "../types";
import { baht, money, thMonth, thDate } from "./analysis";
import { useTip, useWidth, niceMax } from "./charts";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ymOf = (d: Date) => iso(d).slice(0, 7);
const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00Z`);
const nextMonth = (ym: string) => {
  const d = monthStart(ym);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
};

export default function MonthlyChart({ a, b }: { a: TermAnalytics; b?: TermAnalytics }) {
  const t = useTip();
  const { ref: box, w: W } = useWidth<HTMLDivElement>();
  const months = useMemo(() => a.monthly ?? [], [a.monthly]);
  const undated = a.budget_lump_undated ?? 0;
  const base = a.budget_allocated;
  const today = new Date(`${a.as_of ?? iso(new Date())}T00:00:00Z`);

  const g = useMemo(() => {
    const hasDates = !!(a.starts_on && a.ends_on);
    const dataStart = months.length ? monthStart(months[0].year_month) : null;
    const dataEnd = months.length ? nextMonth(months[months.length - 1].year_month) : null;
    let from = hasDates ? new Date(`${a.starts_on}T00:00:00Z`) : dataStart;
    let to = hasDates ? new Date(Date.parse(`${a.ends_on}T00:00:00Z`) + DAY) : dataEnd;
    if (!from || !to) return null;
    // Money dated outside the term's own dates still has to be on the axis.
    if (dataStart && dataStart < from) from = dataStart;
    if (dataEnd && dataEnd > to) to = dataEnd;

    const byYm = new Map(months.map(m => [m.year_month, m]));
    const bands: { ym: string; s: Date; e: Date; baht: number; lump: number; current: boolean; future: boolean }[] = [];
    for (let ym = ymOf(from); monthStart(ym) < to; ym = ymOf(nextMonth(ym))) {
      const s = new Date(Math.max(monthStart(ym).getTime(), from.getTime()));
      const e = new Date(Math.min(nextMonth(ym).getTime(), to.getTime()));
      const m = byYm.get(ym);
      bands.push({
        ym, s, e, baht: m?.baht ?? 0, lump: m?.lump_baht ?? 0,
        current: today >= monthStart(ym) && today < nextMonth(ym),
        future: monthStart(ym) > today,
      });
    }

    // Running total: a point at each month's end (today, for the month in
    // progress). Future months only when money is already dated in them.
    const cum: { d: Date; v: number; ym: string }[] = [{ d: from, v: 0, ym: "" }];
    let acc = 0;
    for (const bd of bands) {
      if (bd.future && bd.baht === 0) continue;
      acc += bd.baht;
      cum.push({ d: bd.current ? new Date(Math.max(today.getTime(), bd.s.getTime())) : bd.e, v: acc, ym: bd.ym });
    }
    const total = acc + undated;
    return { from, to, bands, cum, total, hasDates };
  }, [a.starts_on, a.ends_on, months, undated, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g || (months.length === 0 && base <= 0)) {
    return <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีการเบิกจ่ายในภาคเรียนนี้</div>;
  }

  const narrow = W < 480;
  const L = narrow ? 52 : 64, R = narrow ? 12 : 20;
  const T1 = 22, H1 = narrow ? 150 : 180;          // running-total panel
  const T2 = T1 + H1 + 30, H2 = narrow ? 100 : 116;  // monthly panel
  const H = T2 + H2 + 42;
  const x = (d: Date) => L + ((d.getTime() - g.from.getTime()) / (g.to.getTime() - g.from.getTime())) * (W - L - R);
  const y1Max = niceMax(Math.max(base, g.total, 1));
  const y1 = (v: number) => T1 + H1 * (1 - v / y1Max);
  const y2Max = niceMax(Math.max(...g.bands.map(bd => bd.baht), 1));
  // 18px of headroom inside the panel for the value label on the tallest bar.
  const y2 = (v: number) => T2 + 18 + (H2 - 18) * (1 - v / y2Max);

  const last = g.cum[g.cum.length - 1];
  const linePts = g.cum.map(p => `${x(p.d)},${y1(p.v)}`).join(" ");
  const areaPts = `${x(g.cum[0].d)},${y1(0)} ${linePts} ${x(last.d)},${y1(0)}`;
  const showToday = today >= g.from && today < g.to;
  const pace = g.hasDates && base > 0;
  // Where the reference line stands today — for the tooltip on the end point.
  const paceToday = pace && showToday
    ? base * ((today.getTime() - Date.parse(`${a.starts_on}T00:00:00Z`)) / (Date.parse(`${a.ends_on}T00:00:00Z`) + DAY - Date.parse(`${a.starts_on}T00:00:00Z`)))
    : null;
  const bandLabels = g.bands.every(bd => x(bd.e) - x(bd.s) >= 64);

  return (
    <div ref={box}>
      <div ref={t.ref} className="relative">
        <svg width={W} height={H} className="block max-w-full" role="img"
             aria-label={`ยอดเบิกจ่ายสะสม ${money(g.total)} จากงบรวม ${money(base)} รายเดือน: ${g.bands.filter(bd => bd.baht > 0).map(bd => `${thMonth(bd.ym)} ${money(bd.baht)}`).join(", ")}`}>
          <defs>
            <pattern id="mc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#0776BC" fillOpacity="0.18" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#0776BC" strokeWidth="2" strokeOpacity="0.55" />
            </pattern>
          </defs>

          {/* ---- top panel: running total vs reference ---- */}
          <text x={L} y={12} fontSize="12" fontWeight={600} fill="var(--ink-2,#334155)"
                display={showToday && x(today) < L + 150 ? "none" : undefined}>ยอดสะสม (บาท)</text>
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y1(y1Max * f)} y2={y1(y1Max * f)} stroke="var(--hairline,#eef0f3)" />
              <text x={L - 6} y={y1(y1Max * f) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3,#64748b)" className="tabular-nums">
                {baht(y1Max * f)}
              </text>
            </g>
          ))}
          {g.bands.map(bd => (
            <line key={`sep${bd.ym}`} x1={x(bd.s)} x2={x(bd.s)} y1={T1} y2={T2 + H2} stroke="var(--hairline,#eef0f3)" />
          ))}
          {base > 0 && (
            <g>
              <line x1={L} x2={W - R} y1={y1(base)} y2={y1(base)} stroke="#b91c1c" strokeWidth="1.5" />
              {/* Above the line, unless that would collide with the panel title
                  at the top — then just below it. */}
              <text x={L + 4} y={y1(base) - 5 < 30 ? y1(base) + 15 : y1(base) - 5} fontSize="12" fill="#b91c1c">งบรวม {money(base)}</text>
            </g>
          )}
          {pace && (
            <line x1={x(new Date(`${a.starts_on}T00:00:00Z`))} y1={y1(0)}
                  x2={x(new Date(Date.parse(`${a.ends_on}T00:00:00Z`) + DAY))} y2={y1(base)}
                  stroke="var(--ink-3,#64748b)" strokeWidth="1.5" strokeDasharray="5 5" />
          )}
          <polygon points={areaPts} fill="#16a34a" fillOpacity={0.1} />
          <polyline points={linePts} fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinejoin="round" />
          {undated > 0 && (
            <line x1={x(last.d)} x2={x(last.d)} y1={y1(last.v)} y2={y1(g.total)} stroke="#6366f1" strokeWidth="2.5" />
          )}
          {g.cum.slice(1).map(p => (
            <circle key={p.ym} cx={x(p.d)} cy={y1(p.v)} r="3.5" fill="#15803d" stroke="white" strokeWidth="1.5"
                    onMouseMove={e => t.show(e, <><b>สะสมถึง{thMonth(p.ym)}</b><div className="tabular-nums">{money(p.v)}</div></>)}
                    onMouseLeave={t.hide} />
          ))}
          <circle cx={x(last.d)} cy={y1(g.total)} r="5" fill="#15803d" stroke="white" strokeWidth="2"
                  onMouseMove={e => t.show(e, <>
                    <b>เบิกจ่ายแล้ว {money(g.total)}</b>
                    {undated > 0 && <div>รวมเหมาจ่ายยังไม่ระบุเดือน {money(undated)}</div>}
                    {paceToday != null && <div className="text-[var(--ink-3)]">เส้นอ้างอิง ณ วันนี้ {money(paceToday)}</div>}
                  </>)}
                  onMouseLeave={t.hide} />
          <text x={Math.min(x(last.d) + 8, W - R)} y={y1(g.total) - 9} fontSize="12" fontWeight={600} fill="#15803d"
                textAnchor={x(last.d) + 120 > W - R ? "end" : "start"} className="tabular-nums">
            {money(g.total)}
          </text>

          {/* ---- today ---- */}
          {showToday && (
            <g>
              <line x1={x(today)} x2={x(today)} y1={17} y2={T2 + H2} stroke="var(--ink-1,#0f172a)" strokeWidth="1" strokeDasharray="2 3" />
              <text x={x(today)} y={12} fontSize="12" fill="var(--ink-1,#0f172a)"
                    textAnchor={x(today) > W - R - 60 ? "end" : x(today) < L + 150 ? "start" : "middle"}>วันนี้ {thDate(iso(today))}</text>
            </g>
          )}

          {/* ---- bottom panel: each month ---- */}
          <text x={L} y={T2 - 12} fontSize="12" fontWeight={600} fill="var(--ink-2,#334155)">ยอดต่อเดือน (บาท)</text>
          <line x1={L} x2={W - R} y1={y2(0)} y2={y2(0)} stroke="var(--border-strong,#d1d5db)" />
          <text x={L - 6} y={y2(y2Max) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3,#64748b)" className="tabular-nums">{baht(y2Max)}</text>
          <text x={L - 6} y={y2(0) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3,#64748b)">0</text>
          {g.bands.map(bd => {
            const cx = (x(bd.s) + x(bd.e)) / 2;
            const bw = Math.min(48, (x(bd.e) - x(bd.s)) * 0.6);
            const hourly = bd.baht - bd.lump;
            const hollow = bd.current;
            return (
              <g key={bd.ym}
                 onMouseMove={e => t.show(e, <>
                   <b>{thMonth(bd.ym)} {String(Number(bd.ym.slice(0, 4)) + 543).slice(2)}{hollow ? " (ถึงวันนี้)" : ""}</b>
                   <div className="tabular-nums">รายชั่วโมง {money(hourly)}</div>
                   {bd.lump > 0 && <div className="tabular-nums">เหมาจ่ายบัณฑิต {money(bd.lump)}</div>}
                   <div className="tabular-nums font-medium">รวม {money(bd.baht)}</div>
                 </>)}
                 onMouseLeave={t.hide}>
                <rect x={x(bd.s)} y={T2} width={Math.max(0, x(bd.e) - x(bd.s))} height={H2} fill="transparent" />
                {bd.baht > 0 && (
                  <>
                    <rect x={cx - bw / 2} y={y2(hourly)} width={bw} height={Math.max(1, y2(0) - y2(hourly))}
                          fill={hollow ? "url(#mc-hatch)" : "#0776BC"} stroke={hollow ? "#0776BC" : "none"} strokeDasharray={hollow ? "3 2" : undefined} />
                    {bd.lump > 0 && (
                      <rect x={cx - bw / 2} y={y2(bd.baht)} width={bw} height={Math.max(1, y2(hourly) - y2(bd.baht))}
                            fill="#6366f1" fillOpacity={hollow ? 0.45 : 1} />
                    )}
                    {bandLabels && (
                      <text x={cx} y={y2(bd.baht) - 5} fontSize="12" textAnchor="middle" fill="var(--ink-2,#334155)" className="tabular-nums">
                        {money(bd.baht)}
                      </text>
                    )}
                  </>
                )}
                <text x={cx} y={T2 + H2 + 18} fontSize="12" textAnchor="middle" fill={hollow ? "var(--ink-1,#0f172a)" : "var(--ink-3,#64748b)"}
                      fontWeight={hollow ? 600 : 400}>
                  {thMonth(bd.ym)}
                </text>
                {hollow && (
                  <text x={cx} y={T2 + H2 + 34} fontSize="12" textAnchor="middle" fill="var(--ink-1,#0f172a)">ถึงวันนี้</text>
                )}
              </g>
            );
          })}
        </svg>
        {t.node}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-[#15803d]" />ยอดสะสม</span>
        {pace && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-[var(--ink-3)]" />เส้นอ้างอิง: ถ้าใช้เท่ากันทุกเดือน (ไม่ใช่เป้าหมาย)</span>}
        {base > 0 && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-[#b91c1c]" />งบรวม</span>}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-3 rounded-sm bg-[#0776BC]" />รายชั่วโมง</span>
        {a.budget_lump > 0 && <span className="inline-flex items-center gap-1.5"><i className="inline-block size-3 rounded-sm bg-[#6366f1]" />เหมาจ่ายบัณฑิต ภาคพิเศษ</span>}
        {g.bands.some(bd => bd.current && bd.baht > 0) && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm border border-dashed border-[#0776BC] bg-[#0776BC]/20" />เดือนปัจจุบัน ยังไม่จบเดือน
          </span>
        )}
      </div>
      {undated > 0 && (
        <p className="mt-1 text-xs text-[var(--ink-3)]">รวมเหมาจ่ายบัณฑิตที่ยังไม่ระบุเดือน {money(undated)} ไว้ที่ปลายเส้นสะสม</p>
      )}
      {b && (b.monthly ?? []).length > 0 && (
        <p className="mt-1 text-xs text-[var(--ink-2)]">
          ภาคเรียน {b.term_label} เบิกรวม {money(b.budget_used)} ส่วนภาคเรียนนี้ {money(a.budget_used)}
        </p>
      )}
    </div>
  );
}
