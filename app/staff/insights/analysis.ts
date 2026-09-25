// analysis.ts — turns /dashboard/analytics into answers.
//
// The dashboard is organised around three questions management actually asks
// (งบพอไหม / ขอ TA สมเหตุสมผลไหม / งานค้างอยู่ที่ไหน). Each section opens with a
// one-line answer computed here, so the sentence and the chart under it can
// never be worked out two different ways. Pure functions only: no React, no
// fetching, easy to reason about and to test by eye.

import type {
  TermAnalytics, CourseStaffing, StaffingStatus, PipelineKey, CourseSpendStat,
} from "../types";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export type Tone = "good" | "info" | "warn" | "danger" | "muted";

export const STAFFING_META: Record<StaffingStatus, {
  label: string; short: string; tone: Tone; color: string; rank: number;
}> = {
  over_ceiling: { label: "เกินเพดานต่อนักศึกษา", short: "เกินเพดาน", tone: "danger", color: "#dc2626", rank: 0 },
  above_guide:  { label: "ขอมากกว่าที่แนะนำ",     short: "เกินแนะนำ", tone: "warn",   color: "#d97706", rank: 1 },
  no_students:  { label: "ยังไม่มีจำนวนนักศึกษา",   short: "ไม่มีจำนวน นศ.", tone: "warn", color: "#a16207", rank: 2 },
  under:        { label: "ขอน้อยกว่าที่แนะนำ",      short: "น้อยกว่าแนะนำ", tone: "info", color: "#0ea5e9", rank: 3 },
  match:        { label: "ตามที่แนะนำ",           short: "ตามแนะนำ",   tone: "good",   color: "#16a34a", rank: 4 },
  no_request:   { label: "ยังไม่ขอ TA",           short: "ไม่ขอ TA",   tone: "muted",  color: "#94a3b8", rank: 5 },
};

export const PIPELINE_META: Record<PipelineKey, { label: string; who: string; href: string; step: string }> = {
  requests:      { label: "คำขอแต่งตั้ง",      who: "รอเจ้าหน้าที่อนุมัติคำขอ TA",          href: "/staff/approvals",    step: "1" },
  documents:     { label: "เอกสาร TA",        who: "TA ส่งเอกสารครบ รอเจ้าหน้าที่ตรวจ",     href: "/staff/review",       step: "2" },
  appointments:  { label: "รอออกคำสั่งแต่งตั้ง", who: "อนุมัติแล้ว ยังไม่อยู่ในคำสั่งรอบใด",     href: "/staff/appointments", step: "3" },
  payout_review: { label: "ตรวจเบิกจ่าย",      who: "อาจารย์อนุมัติชั่วโมงแล้ว รอเจ้าหน้าที่ตรวจ", href: "/staff/payouts",      step: "4" },
  export:        { label: "รอส่งออก",          who: "ตรวจแล้ว รอสร้างเอกสารเบิกจ่าย",         href: "/staff/payouts",      step: "5" },
};

/** Who holds a claim month — the MonthFlow buckets, in workflow order. */
export const FLOW_BUCKETS = [
  { key: "with_ta",           label: "TA ยังไม่ส่ง / ต้องแก้", color: "#f59e0b" },
  { key: "with_lecturer",     label: "รออาจารย์อนุมัติ",       color: "#a855f7" },
  { key: "await_appointment", label: "รอคำสั่งแต่งตั้ง",        color: "#f43f5e" },
  { key: "staff_review",      label: "รอเจ้าหน้าที่ตรวจ",       color: "#0ea5e9" },
  { key: "ready_export",      label: "รอส่งออก",              color: "#6366f1" },
  { key: "exported",          label: "ส่งออกแล้ว",            color: "#16a34a" },
  { key: "finance_sent",      label: "ส่งการเงินแล้ว",         color: "#15803d" },
] as const;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export const baht = (v: number) => Math.round(v).toLocaleString("th-TH");
export const num1 = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 1 });
export const pct0 = (v: number) => `${Math.round(v)}%`;

/** 1,240,000 → "1.24 ล้าน"; 32,959 → "32,959". Headlines only. */
export function bahtShort(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้าน`;
  return baht(v);
}

const TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-06" or "2569-06" → "มิ.ย." */
export const thMonth = (ym: string) => TH_MONTHS[Number(ym.slice(5, 7))] ?? ym;

export function thDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

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
  remaining: number;
  usedPct: number;
  forecastPct: number;
  elapsedPct: number | null;
  /** used ÷ elapsed — "if the term keeps spending like this". */
  runRate: number | null;
  projectedLow: number;
  projectedHigh: number;
  monthsLeft: number | null;
  /** How much a month is left to spend without crossing the base. */
  monthlyRoom: number | null;
  avgMonthly: number;
  verdict: "ok" | "tight" | "over" | "unknown";
  paceGap: number | null;
}

export function budgetView(a: TermAnalytics): BudgetView {
  const base = a.budget_allocated;
  const used = a.budget_used;
  const forecast = Math.max(a.budget_forecast ?? used, used);
  const elapsed = a.elapsed_pct >= 0 ? a.elapsed_pct : null;
  // A run-rate taken in the first fortnight is noise, not a projection.
  const runRate = elapsed != null && elapsed >= 10 && used > 0 ? used / (elapsed / 100) : null;
  const projectedLow = forecast;
  const projectedHigh = Math.max(forecast, runRate ?? 0);

  let monthsLeft: number | null = null;
  if (a.ends_on) {
    const days = (new Date(`${a.ends_on}T23:59:59`).getTime() - Date.now()) / 86_400_000;
    monthsLeft = Math.max(0, days / 30.44);
  }
  const months = (a.monthly ?? []).filter(m => m.baht > 0);
  const avgMonthly = months.length ? months.reduce((s, m) => s + m.baht, 0) / months.length : 0;
  const monthlyRoom = monthsLeft && monthsLeft > 0.25 && base > 0 ? Math.max(0, base - forecast) / monthsLeft : null;

  let verdict: BudgetView["verdict"] = "unknown";
  if (base > 0) {
    if (projectedHigh > base) verdict = "over";
    else if (projectedHigh > base * 0.9) verdict = "tight";
    else verdict = "ok";
  }
  const usedPct = base > 0 ? (used / base) * 100 : 0;
  return {
    base, used, lump: a.budget_lump ?? 0, forecast,
    unfunded: a.budget_unfunded ?? 0,
    pipeline: Math.max(0, forecast - used),
    remaining: base - used,
    usedPct,
    forecastPct: base > 0 ? (forecast / base) * 100 : 0,
    elapsedPct: elapsed,
    runRate, projectedLow, projectedHigh, monthsLeft, monthlyRoom, avgMonthly, verdict,
    paceGap: elapsed != null && base > 0 ? usedPct - elapsed : null,
  };
}

export function budgetAnswer(b: BudgetView): { tone: Tone; text: string } {
  if (b.base <= 0) return { tone: "muted", text: "ยังไม่มีวิชาที่ขอใช้ TA จึงยังไม่มีงบให้เทียบ" };
  const range = b.projectedHigh - b.projectedLow > b.base * 0.02
    ? `${baht(b.projectedLow)}–${baht(b.projectedHigh)} บาท`
    : `${baht(b.projectedHigh)} บาท`;
  const pace = b.elapsedPct != null
    ? ` ใช้ไป ${pct0(b.usedPct)} ขณะที่เทอมผ่านไป ${pct0(b.elapsedPct)}`
    : ` ใช้ไป ${pct0(b.usedPct)}`;
  const ofWhat = "ของงบรวม";
  switch (b.verdict) {
    case "ok":
      return { tone: "good", text: `พอ${pace} คาดว่าสิ้นเทอมใช้ประมาณ ${range} (${pct0((b.projectedHigh / b.base) * 100)} ${ofWhat})` };
    case "tight":
      return { tone: "warn", text: `พอแต่ตึง${pace} คาดว่าสิ้นเทอมใช้ ${range} ใกล้เต็มงบแล้ว` };
    default:
      return { tone: "danger", text: `อาจไม่พอ${pace} ถ้าใช้ในอัตรานี้ต่อไปจะใช้ถึง ${baht(b.projectedHigh)} บาท เกินงบรวม ${baht(b.projectedHigh - b.base)} บาท` };
  }
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

export function staffingAnswer(s: ReturnType<typeof staffingStats>, perTA: number): { tone: Tone; text: string } {
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

export function pipelineAnswer(a: TermAnalytics): { tone: Tone; text: string; bottleneck?: PipelineKey } {
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
  return {
    tone: total > 20 ? "warn" : "info",
    text: `ค้างรวม ${total} รายการ มากที่สุดที่ขั้น “${PIPELINE_META[top.key].label}” ${top.count} รายการ${due}`,
    bottleneck: top.key,
  };
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

export function buildInsights(a: TermAnalytics): Insight[] {
  const out: Insight[] = [];
  const b = budgetView(a);
  const rows = a.staffing ?? [];
  const s = staffingStats(rows);

  // Money
  if (b.verdict === "over") {
    out.push({ tone: "danger", target: "budget", title: `งบอาจไม่พอ คาดว่าจะเกิน ${baht(b.projectedHigh - b.base)} บาท`,
      detail: b.runRate ? `ใช้เฉลี่ยเดือนละ ${baht(b.avgMonthly)} บาท ถ้าอัตรานี้คงที่จะใช้ถึง ${baht(b.runRate)} บาท` : undefined });
  } else if (b.paceGap != null && b.paceGap > 8) {
    out.push({ tone: "warn", target: "budget", title: `ใช้งบเร็วกว่าเวลา ${Math.round(b.paceGap)} จุด`,
      detail: `ใช้ไป ${pct0(b.usedPct)} ขณะที่เทอมผ่านไป ${pct0(b.elapsedPct!)}` });
  } else if (b.base > 0 && b.paceGap != null) {
    out.push({ tone: "good", target: "budget", title: "การใช้งบเป็นไปตามเวลาของเทอม",
      detail: `ใช้ไป ${pct0(b.usedPct)} เทียบเวลา ${pct0(b.elapsedPct!)}${b.monthlyRoom != null ? ` ใช้ได้อีกประมาณเดือนละ ${baht(b.monthlyRoom)} บาท` : ""}` });
  }
  if (b.unfunded > 0) {
    const n = rows.filter(r => r.unfunded_baht > 0).length;
    out.push({ tone: "danger", target: "courses", title: `งานที่ TA บันทึกแล้วแต่เพดานวิชาจ่ายไม่ได้ ${baht(b.unfunded)} บาท`,
      detail: `${n} วิชา ชั่วโมงส่วนนี้จะไม่ได้รับค่าตอบแทนถ้าไม่ปรับแผน` });
  }
  const conc = concentration(a.courses ?? []);
  if (conc && conc.n <= Math.max(1, Math.ceil(conc.of * 0.3))) {
    out.push({ tone: "info", target: "courses", title: `${conc.n} จาก ${conc.of} วิชาใช้เงิน ${pct0(conc.share)} ของยอดเบิก`,
      detail: `สูงสุดคือ ${conc.top.code} (${pct0(conc.topShare)})` });
  }
  const cps = costPerStudent(rows);
  if (cps.outliers.length > 0) {
    const o = cps.outliers[0];
    out.push({ tone: "warn", target: "courses", title: `${o.row.code} ใช้เงินต่อนักศึกษาสูงกว่าค่ากลาง ${num1(o.x)} เท่า`,
      detail: `${baht(o.v)} บาทต่อคน เทียบค่ากลาง ${baht(cps.median)} บาท${cps.outliers.length > 1 ? ` (และอีก ${cps.outliers.length - 1} วิชา)` : ""}` });
  }

  // Staffing
  if (s.counts.over_ceiling > 0) {
    const r = s.review[0];
    out.push({ tone: "danger", target: "staffing", title: `${s.counts.over_ceiling} วิชาขอ TA เกินเพดาน 1 ต่อ ${a.plan.min_students_per_ta} คน`,
      detail: `เช่น ${r.code} นักศึกษา ${r.students} คน ขอ ${r.requested} คน (แนะนำ ${r.recommended})` });
  } else if (s.counts.above_guide > 0) {
    out.push({ tone: "warn", target: "staffing", title: `${s.counts.above_guide} วิชาขอ TA มากกว่าที่แนะนำ`,
      detail: `รวมเกินแนะนำ ${s.excess} คน ยังอยู่ในเพดาน` });
  } else if (s.withReq > 0) {
    out.push({ tone: "good", target: "staffing", title: "ไม่มีวิชาใดขอ TA เกินที่ระบบแนะนำ",
      detail: s.compliance != null ? `${pct0(s.compliance)} ของวิชาที่ขอ อยู่ในเกณฑ์หรือต่ำกว่า` : undefined });
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
        detail: `${dl.labels.join(", ")} · ระบบส่งการแจ้งเตือนอัตโนมัติล่วงหน้า ${dl.remind_days} วัน` });
    }
    const appt = p.stages.find(x => x.key === "appointments");
    if (appt && appt.count > 0) {
      out.push({ tone: "warn", target: "work", title: `${appt.count} รายชื่อรอออกคำสั่งแต่งตั้ง`,
        detail: "TA ที่ยังไม่อยู่ในคำสั่งแต่งตั้งจะผ่านขั้นตรวจเบิกจ่ายไม่ได้" });
    }
    const oldest = p.stages.filter(x => (x.oldest_days ?? 0) >= 7).sort((x, y) => (y.oldest_days ?? 0) - (x.oldest_days ?? 0))[0];
    if (oldest) {
      out.push({ tone: "warn", target: "work", title: `${PIPELINE_META[oldest.key].label} มีรายการรอนาน ${oldest.oldest_days} วัน` });
    }
    const returned = p.docs_returned + p.months_sent_back + p.worklogs_rejected;
    if (returned > 0) {
      out.push({ tone: "info", target: "work", title: `${returned} รายการถูกตีกลับให้แก้ไข`,
        detail: [p.docs_returned && `เอกสาร TA ${p.docs_returned}`, p.months_sent_back && `รอบเบิก ${p.months_sent_back}`,
          p.worklogs_rejected && `บันทึกเวลา ${p.worklogs_rejected}`].filter(Boolean).join(" · ") });
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
