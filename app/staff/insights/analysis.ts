// analysis.ts — turns /dashboard/analytics into answers.
//
// The dashboard is organised around three questions management actually asks
// (งบพอไหม / ขอ TA สมเหตุสมผลไหม / งานค้างอยู่ที่ไหน). Each section opens with a
// one-line answer computed here, so the sentence and the chart under it can
// never be worked out two different ways. Pure functions only: no React, no
// fetching, easy to reason about and to test by eye.

import type {
  TermAnalytics, CourseStaffing, StaffingStatus, PipelineKey, CourseSpendStat, MonthFlow,
  DocStatusCounts,
} from "../types";

/* -------------------------------------------------------------------------- */
/* Rules — every judgement line on the page, in one place (26/09/2026)        */
/* -------------------------------------------------------------------------- */
//
// A colour or a warning on this page means one of these lines was crossed.
// Anything without a line here is drawn in a neutral colour.
//
// "ใกล้เพดาน" is deliberately NOT here: it is the server's NearCapRatio
// (dashboard_analytics.go), sent as near_cap_ratio, so the page, the table
// and the Excel export read one number. NEAR_CAP_FALLBACK only covers a
// response from an older server.

export const RULES = {
  /** used% − elapsed% above this reads as "spending ahead of the calendar".
   *  Claims arrive in monthly batches: one claim month is ~20–25% of a
   *  four-month term, so a gap under ~8 points is the normal lumpiness of a
   *  batch landing, not a trend. */
  paceAheadPts: 8,
  /** Below this share of the term elapsed, a run-rate is noise (one claim
   *  month would be extrapolated to the whole term). */
  runRateMinElapsedPct: 10,
  /** A queue item this old is flagged as stuck. One week is the working
   *  rhythm of the office — anything older has missed a weekly pass. */
  staleDays: 7,
  /** Staffing scatter needs this many courses to show a relationship; with
   *  fewer the dots are just a list drawn badly, so a list is shown instead. */
  scatterMinPoints: 6,
  /** Month flow is charted only when at least this many months have claims… */
  flowMinMonths: 2,
  /** …and some bucket's share differs between months by more than this. If
   *  every month has the same split, one sentence says it all. */
  flowMinShareSpread: 0.1,
  /** TA document donut: at least this many people and at least two statuses,
   *  otherwise a ring is a single colour and a sentence reads faster. */
  donutMinPeople: 5,
  donutMinStatuses: 2,
  /** Answer sentences name at most this many courses, then "และอีก n วิชา". */
  maxNamedCourses: 3,
} as const;

export const NEAR_CAP_FALLBACK = 0.9;
export const nearCapRatio = (a: TermAnalytics) => a.near_cap_ratio ?? NEAR_CAP_FALLBACK;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export type Tone = "good" | "info" | "warn" | "danger" | "muted";

// color fills marks; ink is the same hue dark enough for text on a 10% tint of
// itself or on white (WCAG AA ≥ 4.5:1) — the fill colours are not.
export const STAFFING_META: Record<StaffingStatus, {
  label: string; short: string; tone: Tone; color: string; ink: string; rank: number;
}> = {
  over_ceiling: { label: "เกินเพดานต่อนักศึกษา", short: "เกินเพดาน", tone: "danger", color: "#dc2626", ink: "#b91c1c", rank: 0 },
  above_guide:  { label: "ขอมากกว่าที่แนะนำ",     short: "เกินแนะนำ", tone: "warn",   color: "#d97706", ink: "#92400e", rank: 1 },
  no_students:  { label: "ยังไม่มีจำนวนนักศึกษา",   short: "ไม่มีจำนวน นศ.", tone: "warn", color: "#a16207", ink: "#854d0e", rank: 2 },
  under:        { label: "ขอน้อยกว่าที่แนะนำ",      short: "น้อยกว่าแนะนำ", tone: "info", color: "#0ea5e9", ink: "#0369a1", rank: 3 },
  match:        { label: "ตามที่แนะนำ",           short: "ตามแนะนำ",   tone: "good",   color: "#16a34a", ink: "#15803d", rank: 4 },
  no_request:   { label: "ยังไม่ขอ TA",           short: "ไม่ขอ TA",   tone: "muted",  color: "#94a3b8", ink: "#475569", rank: 5 },
};

export const PIPELINE_META: Record<PipelineKey, { label: string; who: string; href: string; step: string }> = {
  requests:      { label: "คำขอแต่งตั้ง",      who: "รอเจ้าหน้าที่อนุมัติคำขอ TA",          href: "/staff/approvals",    step: "1" },
  documents:     { label: "เอกสาร TA",        who: "TA ส่งเอกสารครบ รอเจ้าหน้าที่ตรวจ",     href: "/staff/review",       step: "2" },
  appointments:  { label: "รอออกคำสั่งแต่งตั้ง", who: "อนุมัติแล้ว ยังไม่อยู่ในคำสั่งรอบใด",     href: "/staff/appointments", step: "3" },
  payout_review: { label: "ตรวจเบิกจ่าย",      who: "อาจารย์อนุมัติชั่วโมงแล้ว รอเจ้าหน้าที่ตรวจ", href: "/staff/payouts",      step: "4" },
  export:        { label: "รอส่งออก",          who: "ตรวจแล้ว รอสร้างเอกสารเบิกจ่าย",         href: "/staff/payouts",      step: "5" },
};

/** Who holds a claim month — the MonthFlow buckets, in workflow order.
 *  `phrase` completes "มี n รายการ…" in the one-sentence view. */
export const FLOW_BUCKETS = [
  { key: "with_ta",           label: "TA ยังไม่ส่ง / ต้องแก้", phrase: "ที่ TA ยังไม่ส่งหรือต้องแก้",  color: "#f59e0b", done: false },
  { key: "with_lecturer",     label: "รออาจารย์อนุมัติ",       phrase: "ที่รออาจารย์อนุมัติ",         color: "#a855f7", done: false },
  { key: "await_appointment", label: "รอคำสั่งแต่งตั้ง",        phrase: "ที่ค้างขั้นรอคำสั่งแต่งตั้ง",    color: "#f43f5e", done: false },
  { key: "staff_review",      label: "รอเจ้าหน้าที่ตรวจ",       phrase: "ที่รอเจ้าหน้าที่ตรวจ",         color: "#0ea5e9", done: false },
  { key: "ready_export",      label: "รอส่งออก",              phrase: "ที่ตรวจแล้วรอส่งออก",         color: "#6366f1", done: false },
  { key: "exported",          label: "ส่งออกแล้ว",            phrase: "ที่ส่งออกแล้ว",              color: "#16a34a", done: true },
  { key: "finance_sent",      label: "ส่งการเงินแล้ว",         phrase: "ที่ส่งการเงินแล้ว",           color: "#15803d", done: true },
] as const;

/* -------------------------------------------------------------------------- */
/* Formatting — one formatter for every money figure on the page              */
/* -------------------------------------------------------------------------- */

export const baht = (v: number) => Math.round(v).toLocaleString("th-TH");
/** Every money figure a reader sees: "32,959 บาท". */
export const money = (v: number) => `${baht(v)} บาท`;
export const num1 = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 1 });
export const pct0 = (v: number) => `${Math.round(v)}%`;

const TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-06" or "2569-06" → "มิ.ย." */
export const thMonth = (ym: string) => TH_MONTHS[Number(ym.slice(5, 7))] ?? ym;

export function thDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** "CP1, CP2, CP3 และอีก 2 วิชา" */
export function namedCourses(codes: string[]) {
  const shown = codes.slice(0, RULES.maxNamedCourses).join(", ");
  return codes.length > RULES.maxNamedCourses ? `${shown} และอีก ${codes.length - RULES.maxNamedCourses} วิชา` : shown;
}

/* -------------------------------------------------------------------------- */
/* Course money state — one rule, used by every part of the page              */
/* -------------------------------------------------------------------------- */

export type CapState = "over" | "near" | "ok" | "none";

/** over = logged work the course cap cannot pay; near = forecast at or past
 *  the near-cap line; none = no cap to measure against (no request). */
export function capState(r: Pick<CourseStaffing, "cap_baht" | "forecast_baht" | "unfunded_baht">, ratio: number): CapState {
  if (r.unfunded_baht > 0) return "over";
  if (r.cap_baht <= 0) return "none";
  return r.forecast_baht / r.cap_baht >= ratio ? "near" : "ok";
}

export const CAP_META: Record<CapState, { label: string; ink: string; color: string }> = {
  over: { label: "ชนเพดานงบ", ink: "#b91c1c", color: "#dc2626" },
  near: { label: "ใกล้เพดานงบ", ink: "#92400e", color: "#d97706" },
  ok:   { label: "ปกติ", ink: "#334155", color: "#0776BC" },
  none: { label: "–", ink: "#64748b", color: "#94a3b8" },
};

export interface CourseRef { id: string; code: string }

export function courseRisk(a: TermAnalytics) {
  const ratio = nearCapRatio(a);
  const rows = a.staffing ?? [];
  const over = rows.filter(r => capState(r, ratio) === "over").sort((x, y) => y.unfunded_baht - x.unfunded_baht);
  const near = rows.filter(r => capState(r, ratio) === "near")
    .sort((x, y) => y.forecast_baht / y.cap_baht - x.forecast_baht / x.cap_baht);
  return { ratio, over, near, unfunded: over.reduce((s, r) => s + r.unfunded_baht, 0) };
}
export type CourseRisk = ReturnType<typeof courseRisk>;

const refs = (rows: CourseStaffing[]): CourseRef[] => rows.map(r => ({ id: r.teaching_course_id, code: r.code }));

/* -------------------------------------------------------------------------- */
/* Q1 — งบพอถึงสิ้นเทอมไหม                                                      */
/* -------------------------------------------------------------------------- */

export interface BudgetView {
  /** งบรวมของภาคเรียน = Σ budget of the courses that requested TAs. */
  base: number;
  used: number;
  lump: number;
  forecast: number;
  unfunded: number;
  /** Money logged but not yet approved/settled. */
  pipeline: number;
  /** คงเหลือ as TOR 3.13 means it: งบรวม − เบิกจ่ายแล้ว. */
  remaining: number;
  /** ยังไม่ผูกพัน: งบรวม − forecast, what no logged hour has claimed yet. */
  uncommitted: number;
  usedPct: number;
  forecastPct: number;
  elapsedPct: number | null;
  /** used ÷ elapsed — "if the term keeps spending like this". */
  runRate: number | null;
  projectedLow: number;
  projectedHigh: number;
  verdict: "ok" | "tight" | "over" | "unknown";
  paceGap: number | null;
}

export function budgetView(a: TermAnalytics): BudgetView {
  const base = a.budget_allocated;
  const used = a.budget_used;
  const forecast = Math.max(a.budget_forecast ?? used, used);
  const elapsed = a.elapsed_pct >= 0 ? a.elapsed_pct : null;
  const runRate = elapsed != null && elapsed >= RULES.runRateMinElapsedPct && used > 0 ? used / (elapsed / 100) : null;
  const projectedLow = forecast;
  const projectedHigh = Math.max(forecast, runRate ?? 0);

  let verdict: BudgetView["verdict"] = "unknown";
  if (base > 0) {
    if (projectedHigh > base) verdict = "over";
    else if (projectedHigh >= base * nearCapRatio(a)) verdict = "tight";
    else verdict = "ok";
  }
  const usedPct = base > 0 ? (used / base) * 100 : 0;
  return {
    base, used, lump: a.budget_lump ?? 0, forecast,
    unfunded: a.budget_unfunded ?? 0,
    pipeline: Math.max(0, forecast - used),
    remaining: base - used,
    uncommitted: Math.max(0, base - forecast),
    usedPct,
    forecastPct: base > 0 ? (forecast / base) * 100 : 0,
    elapsedPct: elapsed,
    runRate, projectedLow, projectedHigh, verdict,
    paceGap: elapsed != null && base > 0 ? usedPct - elapsed : null,
  };
}

/** An answer sentence. `{courses}` in text marks where the named courses go,
 *  so the page can render them as buttons that jump to the table row. */
export interface Answer { tone: Tone; text: string; courses?: CourseRef[] }

/** Q1's answer. Money cannot move between courses, so the term total alone
 *  says almost nothing: a course at its cap is checked FIRST, and the term
 *  can only be "good" when no course is over or near its cap either. */
export function budgetAnswer(b: BudgetView, risk: CourseRisk): Answer {
  if (b.base <= 0) return { tone: "muted", text: "ยังไม่มีวิชาที่ส่งคำขอ TA จึงยังไม่มีงบรวมให้เทียบ" };
  const nearPct = pct0(risk.ratio * 100);
  const time = b.elapsedPct != null ? ` เทอมผ่านไป ${pct0(b.elapsedPct)}` : "";
  const overTail = risk.over.length > 0
    ? ` ${risk.over.length} วิชาชนเพดานแล้ว ({courses}) มีงาน ${money(risk.unfunded)}ที่ยังจ่ายไม่ได้`
    : "";

  if (b.verdict === "over") {
    return {
      tone: "danger",
      text: `งบรวมอาจไม่พอ ถ้าใช้ในอัตรานี้จะใช้ถึง ${money(b.projectedHigh)} เกินงบรวม ${money(b.projectedHigh - b.base)}${overTail ? ` และ${overTail}` : ""}`,
      courses: refs(risk.over),
    };
  }
  if (risk.over.length > 0) {
    // No option is offered after "ต้องตัดสินใจ": the course cap is derived
    // from the workload formula (budget.go), not a stored figure anyone can
    // raise, and there is no in-system action on unpaid hours — naming one
    // would promise something the system cannot do.
    return {
      tone: "danger",
      text: `งบรวมยังเหลือ ${pct0(100 - b.usedPct)} แต่${overTail} ต้องตัดสินใจ`,
      courses: refs(risk.over),
    };
  }
  if (risk.near.length > 0) {
    return {
      tone: "warn",
      text: `งบรวมยังพอ แต่ ${risk.near.length} วิชาใช้ถึง ${nearPct} ของเพดานวิชาแล้ว ({courses}) งานที่เพิ่มเข้ามาอาจจ่ายไม่ได้`,
      courses: refs(risk.near),
    };
  }
  if (b.verdict === "tight") {
    return { tone: "warn", text: `งบรวมตึง คาดว่าสิ้นเทอมใช้ ${money(b.projectedHigh)} (${pct0((b.projectedHigh / b.base) * 100)} ของงบรวม)` };
  }
  if (b.paceGap != null && b.paceGap > RULES.paceAheadPts) {
    return { tone: "warn", text: `ใช้งบเร็วกว่าเวลา ใช้ไป ${pct0(b.usedPct)} ขณะที่เทอมผ่านไป ${pct0(b.elapsedPct!)}` };
  }
  return { tone: "good", text: `งบพอทุกวิชา ใช้ไป ${pct0(b.usedPct)} ของงบรวม${time} ไม่มีวิชาใดใช้ถึง ${nearPct} ของเพดาน` };
}

/** Pareto: how few courses take most of the money. */
export function concentration(courses: CourseSpendStat[]) {
  const sorted = [...courses].filter(c => c.spent_baht > 0).sort((x, y) => y.spent_baht - x.spent_baht);
  const total = sorted.reduce((s, c) => s + c.spent_baht, 0);
  if (total <= 0 || sorted.length < 3) return null;
  let acc = 0, n = 0;
  for (const c of sorted) {
    acc += c.spent_baht; n++;
    if (acc / total >= 0.8) break;
  }
  return { n, of: sorted.length, share: (acc / total) * 100, top: sorted[0], topShare: (sorted[0].spent_baht / total) * 100 };
}

/** Baht per enrolled student, and the courses far above the term's median
 *  (robust: median and median absolute deviation, so one huge course does
 *  not hide the rest). */
export function costPerStudent(rows: CourseStaffing[]) {
  const pts = rows.filter(r => r.spent_baht > 0 && r.students > 0)
    .map(r => ({ row: r, v: r.spent_baht / r.students }));
  if (pts.length === 0) return { median: 0, outliers: [] as { row: CourseStaffing; v: number; x: number }[], pts };
  const vs = pts.map(p => p.v).sort((a, b) => a - b);
  const median = vs[Math.floor(vs.length / 2)];
  const mad = [...vs.map(v => Math.abs(v - median))].sort((a, b) => a - b)[Math.floor(vs.length / 2)] || median * 0.25;
  const outliers = pts.length >= 4
    ? pts.filter(p => (p.v - median) / (1.4826 * mad) > 2.5 && p.v > median * 1.5)
        .map(p => ({ ...p, x: p.v / median })).sort((a, b) => b.x - a.x)
    : [];
  return { median, outliers, pts };
}

/* -------------------------------------------------------------------------- */
/* Q2 — ขอ TA สมเหตุสมผลไหม                                                    */
/* -------------------------------------------------------------------------- */

export function staffingStats(rows: CourseStaffing[]) {
  const counts = Object.fromEntries(Object.keys(STAFFING_META).map(k => [k, 0])) as Record<StaffingStatus, number>;
  for (const r of rows) counts[r.status]++;
  const withReq = rows.filter(r => r.requested > 0);
  const students = withReq.reduce((s, r) => s + r.students, 0);
  const requested = withReq.reduce((s, r) => s + r.requested, 0);
  const recommended = withReq.reduce((s, r) => s + r.recommended, 0);
  const excess = withReq.reduce((s, r) => s + Math.max(0, r.requested - r.recommended), 0);
  const shortfall = withReq.reduce((s, r) => s + Math.max(0, r.recommended - r.requested), 0);
  const review = rows.filter(r => r.status === "over_ceiling" || r.status === "above_guide")
    .sort((a, b) => STAFFING_META[a.status].rank - STAFFING_META[b.status].rank
      || (b.requested - b.recommended) - (a.requested - a.recommended));
  const under = rows.filter(r => r.status === "under")
    .sort((a, b) => (b.recommended - b.requested) - (a.recommended - a.requested));
  // Big courses without a request: worth a nudge before the window closes.
  const bigNoTA = rows.filter(r => r.status === "no_request" && r.students > 0)
    .sort((a, b) => b.students - a.students);
  const judged = withReq.filter(r => r.status !== "no_students").length;
  const onGuide = withReq.filter(r => r.status === "match" || r.status === "under").length;
  return {
    counts, withReq: withReq.length, students, requested, recommended, excess, shortfall,
    ratio: requested > 0 ? students / requested : 0,
    review, under, bigNoTA, judged,
    compliance: judged > 0 ? (onGuide / judged) * 100 : null,
  };
}

export function staffingAnswer(s: ReturnType<typeof staffingStats>, perTA: number): Answer {
  if (s.withReq === 0) return { tone: "muted", text: "ภาคเรียนนี้ยังไม่มีวิชาที่ส่งคำขอ TA" };
  const over = s.counts.over_ceiling, above = s.counts.above_guide;
  const ratio = s.ratio > 0 ? ` ภาพรวม ${num1(s.ratio)} คนต่อ TA (เกณฑ์ ${perTA})` : "";
  if (over > 0) {
    return { tone: "danger", text: `${over} วิชาขอ TA เกินเพดานต่อจำนวนนักศึกษา${above ? ` และอีก ${above} วิชาขอมากกว่าที่แนะนำ` : ""}${ratio}` };
  }
  if (above > 0) {
    return { tone: "warn", text: `${above} วิชาขอ TA มากกว่าที่ระบบแนะนำ แต่ยังไม่เกินเพดาน รวมเกินแนะนำ ${s.excess} คน${ratio}` };
  }
  return { tone: "good", text: `ไม่มีวิชาใดขอ TA เกินที่แนะนำ${s.counts.under ? ` มี ${s.counts.under} วิชาขอน้อยกว่าที่แนะนำ` : ""}${ratio}` };
}

/* -------------------------------------------------------------------------- */
/* Q3 — งานค้างอยู่ขั้นไหน                                                      */
/* -------------------------------------------------------------------------- */

export function pipelineAnswer(a: TermAnalytics): Answer & { bottleneck?: PipelineKey } {
  const p = a.pipeline;
  if (!p) return { tone: "muted", text: "ยังไม่มีข้อมูล" };
  const total = p.stages.reduce((s, x) => s + x.count, 0);
  const top = [...p.stages].sort((x, y) => y.count - x.count)[0];
  const dl = a.deadline;
  const due = dl
    ? dl.days_left === 0
      ? ` วันนี้ปิดรอบส่งบันทึกเวลา (${dl.labels.join(", ")})`
      : ` ปิดรอบส่งบันทึกเวลาอีก ${dl.days_left} วัน (${thDate(dl.due_date)})`
    : "";
  if (total === 0) return { tone: "good", text: `ไม่มีงานค้างในขั้นตอนของเจ้าหน้าที่${due}` };
  const stale = p.stages.some(x => x.count > 0 && (x.oldest_days ?? 0) >= RULES.staleDays);
  return {
    // Items in a queue are normal work; only an item past staleDays is a warning.
    tone: stale ? "warn" : "info",
    text: `ค้างรวม ${total} รายการ มากที่สุดที่ขั้น “${PIPELINE_META[top.key].label}” ${top.count} รายการ${due}`,
    bottleneck: top.key,
  };
}

/* -------------------------------------------------------------------------- */
/* Progressive disclosure — chart or sentence                                 */
/* -------------------------------------------------------------------------- */

type FlowKey = typeof FLOW_BUCKETS[number]["key"];

/** The claim months worth showing, and whether their split varies enough to
 *  be worth a chart. */
export function flowShape(flow: MonthFlow[]) {
  const months = flow.filter(f => f.total > 0);
  let spread = 0;
  for (const bk of FLOW_BUCKETS) {
    const shares = months.map(f => (f[bk.key as FlowKey] as number) / f.total);
    if (shares.length) spread = Math.max(spread, Math.max(...shares) - Math.min(...shares));
  }
  return { months, spread, chart: months.length >= RULES.flowMinMonths && spread > RULES.flowMinShareSpread };
}

/** One line per bucket for months too uniform to chart:
 *  "ทุกเดือน (5 เดือน) มี 1 รายการค้างที่ขั้นรอคำสั่งแต่งตั้ง (CP410872)". */
export function flowSentences(months: MonthFlow[]) {
  const out: { key: string; color: string; done: boolean; text: string }[] = [];
  for (const bk of FLOW_BUCKETS) {
    const counts = months.map(f => f[bk.key as FlowKey] as number);
    if (counts.every(c => c === 0)) continue;
    const codes = [...new Set(months.flatMap(f => f.codes?.[bk.key] ?? []))].sort();
    const lo = Math.min(...counts), hi = Math.max(...counts);
    const when = months.length === 1
      ? `เดือน${thMonth(months[0].year_month)}`
      : counts.every(c => c > 0) ? `ทุกเดือน (${months.length} เดือน)` : `${counts.filter(c => c > 0).length} จาก ${months.length} เดือน`;
    // Same count every month: "ทุกเดือน มี 1 รายการที่…"; otherwise a range per month.
    const same = lo === hi;
    const n = same || counts.some(c => c === 0) ? `${hi}` : `${lo}–${hi}`;
    const perMonth = months.length > 1 && !same ? "ต่อเดือน" : "";
    out.push({
      key: bk.key, color: bk.color, done: bk.done,
      text: `${when} มี ${n} รายการ${perMonth}${bk.phrase}${codes.length ? ` (${namedCourses(codes)})` : ""}`,
    });
  }
  return out;
}

export const DOC_PARTS = [
  { key: "approved", label: "ตรวจผ่าน", color: "#16a34a" },
  { key: "submitted", label: "รอตรวจ", color: "#0ea5e9" },
  { key: "needs_fix", label: "ต้องแก้ไข", color: "#f59e0b" },
  { key: "rejected", label: "ไม่ผ่าน", color: "#dc2626" },
  { key: "not_submitted", label: "ยังไม่ส่ง / ไม่ครบ", color: "#cbd5e1" },
] as const;

export function docsShape(d: DocStatusCounts) {
  const parts = DOC_PARTS.map(p => ({ ...p, value: d[p.key] as number }));
  const nonzero = parts.filter(p => p.value > 0);
  const chart = d.total >= RULES.donutMinPeople && nonzero.length >= RULES.donutMinStatuses;
  let sentence = "";
  if (d.total === 0) sentence = "ยังไม่มี TA ในภาคเรียนนี้";
  else if (nonzero.length === 1) {
    const only = nonzero[0];
    sentence = only.key === "approved" ? `เอกสาร TA ตรวจผ่านครบทั้ง ${d.total} คน` : `เอกสาร TA ทั้ง ${d.total} คน: ${only.label}`;
  } else sentence = `เอกสาร TA ${d.total} คน: ${nonzero.map(p => `${p.label} ${p.value} คน`).join(" · ")}`;
  return { parts, chart, sentence };
}

/* -------------------------------------------------------------------------- */
/* Automatic analysis — the "ข้อสังเกต" list                                    */
/* -------------------------------------------------------------------------- */

export interface Insight {
  tone: Tone;
  title: string;
  detail?: string;
  /** Which section the reader should jump to. */
  target?: "budget" | "staffing" | "work" | "courses";
}

/** Only things that need a decision or a follow-up. "All is well" is each
 *  question's own answer; repeating it here would say the same thing twice. */
export function buildInsights(a: TermAnalytics): Insight[] {
  const out: Insight[] = [];
  const b = budgetView(a);
  const risk = courseRisk(a);
  const rows = a.staffing ?? [];
  const s = staffingStats(rows);
  const nearPct = pct0(risk.ratio * 100);

  // Money — the same capState and verdict budgetAnswer uses.
  if (risk.over.length > 0) {
    out.push({ tone: "danger", target: "budget",
      title: `${namedCourses(risk.over.map(r => r.code))} ชนเพดานวิชา งานที่ยังจ่ายไม่ได้ ${money(risk.unfunded)}`,
      detail: "ชั่วโมงส่วนนี้จะไม่ได้รับค่าตอบแทน เงินย้ายข้ามวิชาไม่ได้" });
  }
  if (b.verdict === "over") {
    out.push({ tone: "danger", target: "budget", title: `งบรวมอาจไม่พอ คาดว่าจะเกิน ${money(b.projectedHigh - b.base)}`,
      detail: b.runRate ? `ถ้าใช้ในอัตราเดิมจนสิ้นเทอมจะใช้ถึง ${money(b.runRate)}` : undefined });
  }
  if (risk.near.length > 0) {
    out.push({ tone: "warn", target: "budget",
      title: `${risk.near.length} วิชาใช้ถึง ${nearPct} ของเพดานวิชาแล้ว`,
      detail: namedCourses(risk.near.map(r => r.code)) });
  }
  if (b.verdict === "tight") {
    out.push({ tone: "warn", target: "budget", title: `งบรวมตึง คาดว่าสิ้นเทอมใช้ ${pct0((b.projectedHigh / b.base) * 100)} ของงบรวม` });
  } else if (b.verdict !== "over" && b.paceGap != null && b.paceGap > RULES.paceAheadPts) {
    out.push({ tone: "warn", target: "budget", title: `ใช้งบเร็วกว่าเวลา ${Math.round(b.paceGap)} จุด`,
      detail: `ใช้ไป ${pct0(b.usedPct)} ขณะที่เทอมผ่านไป ${pct0(b.elapsedPct!)}` });
  }
  const conc = concentration(a.courses ?? []);
  if (conc && conc.n <= Math.max(1, Math.ceil(conc.of * 0.3))) {
    out.push({ tone: "info", target: "courses", title: `${conc.n} จาก ${conc.of} วิชาใช้เงิน ${pct0(conc.share)} ของยอดเบิก`,
      detail: `สูงสุดคือ ${conc.top.code} (${pct0(conc.topShare)})` });
  }
  const cps = costPerStudent(rows);
  if (cps.outliers.length > 0) {
    const o = cps.outliers[0];
    out.push({ tone: "info", target: "courses", title: `${o.row.code} ใช้เงินต่อนักศึกษาสูงกว่าค่ากลาง ${num1(o.x)} เท่า`,
      detail: `${money(o.v)}ต่อคน เทียบค่ากลาง ${money(cps.median)}${cps.outliers.length > 1 ? ` (และอีก ${cps.outliers.length - 1} วิชา)` : ""}` });
  }

  // Staffing
  if (s.counts.over_ceiling > 0) {
    const r = s.review[0];
    out.push({ tone: "danger", target: "staffing", title: `${s.counts.over_ceiling} วิชาขอ TA เกินเพดาน 1 ต่อ ${a.plan.min_students_per_ta} คน`,
      detail: `เช่น ${r.code} นักศึกษา ${r.students} คน ขอ ${r.requested} คน (แนะนำ ${r.recommended})` });
  } else if (s.counts.above_guide > 0) {
    out.push({ tone: "warn", target: "staffing", title: `${s.counts.above_guide} วิชาขอ TA มากกว่าที่แนะนำ`,
      detail: `รวมเกินแนะนำ ${s.excess} คน ยังอยู่ในเพดาน` });
  }
  if (s.counts.under > 0) {
    out.push({ tone: "info", target: "staffing", title: `${s.counts.under} วิชามี TA น้อยกว่าที่แนะนำ รวมขาด ${s.shortfall} คน`,
      detail: `เช่น ${s.under[0].code} นักศึกษา ${s.under[0].students} คน มี TA ${s.under[0].requested} คน` });
  }
  if (s.bigNoTA.length > 0) {
    const big = s.bigNoTA.filter(r => r.students >= a.plan.students_per_ta * 2);
    if (big.length > 0) {
      out.push({ tone: "info", target: "staffing", title: `${big.length} วิชาขนาดใหญ่ยังไม่ขอ TA`,
        detail: big.slice(0, 3).map(r => `${r.code} (${r.students} คน)`).join(", ") });
    }
  }

  // Work
  const p = a.pipeline;
  if (p) {
    const dl = a.deadline;
    if (dl && dl.days_left <= Math.max(dl.remind_days, 3) && dl.not_sent > 0) {
      out.push({ tone: "warn", target: "work", title: `อีก ${dl.days_left} วันปิดรอบ ยังมี ${dl.not_sent} รายการที่ TA ยังไม่ส่ง`,
        detail: `${dl.labels.join(", ")} ระบบส่งการแจ้งเตือนอัตโนมัติล่วงหน้า ${dl.remind_days} วัน` });
    }
    const appt = p.stages.find(x => x.key === "appointments");
    if (appt && appt.count > 0) {
      out.push({ tone: "warn", target: "work", title: `${appt.count} รายชื่อรอออกคำสั่งแต่งตั้ง`,
        detail: "TA ที่ยังไม่อยู่ในคำสั่งแต่งตั้งจะผ่านขั้นตรวจเบิกจ่ายไม่ได้" });
    }
    const oldest = p.stages.filter(x => x.count > 0 && (x.oldest_days ?? 0) >= RULES.staleDays)
      .sort((x, y) => (y.oldest_days ?? 0) - (x.oldest_days ?? 0))[0];
    if (oldest) {
      out.push({ tone: "warn", target: "work", title: `${PIPELINE_META[oldest.key].label} มีรายการรอนาน ${oldest.oldest_days} วัน` });
    }
    const returned = p.docs_returned + p.months_sent_back + p.worklogs_rejected;
    if (returned > 0) {
      out.push({ tone: "info", target: "work", title: `${returned} รายการถูกตีกลับให้แก้ไข`,
        detail: [p.docs_returned && `เอกสาร TA ${p.docs_returned}`, p.months_sent_back && `รอบเบิก ${p.months_sent_back}`,
          p.worklogs_rejected && `บันทึกเวลา ${p.worklogs_rejected}`].filter(Boolean).join(", ") });
    }
    if (p.unresolved_makeups > 0) {
      out.push({ tone: "info", target: "work", title: `${p.unresolved_makeups} คาบตรงวันหยุดที่อาจารย์ยังไม่กำหนดวันชดเชย` });
    }
    if (p.missing_students > 0) {
      out.push({ tone: "danger", target: "courses", title: `${p.missing_students} วิชายังไม่มีจำนวนนักศึกษา`, detail: "งบและคำแนะนำจำนวน TA คำนวณไม่ได้ และส่งออกเอกสารไม่ได้" });
    }
  }

  const order: Record<Tone, number> = { danger: 0, warn: 1, info: 2, good: 3, muted: 4 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}
