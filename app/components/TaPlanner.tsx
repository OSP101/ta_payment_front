"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Calculator, ChevronDown, CircleCheck, TriangleAlert, Sparkles, Users, Wallet, Plus, Info,
} from "lucide-react";
import { Panel, Chip, Button } from "./ui";

/* -------------------------------------------------------------------------- */
/* TA planner — the calculator on the request page.                            */
/*                                                                            */
/* Everything is read from the course: how many times each section really     */
/* meets this term (holidays and exam weeks already taken out), the two       */
/* budget pools, and what approved TAs already commit. The lecturer's only    */
/* levers are the ones they actually control — how many TAs of which kind,    */
/* and how many ตรวจงาน hours a week each gets.                                */
/*                                                                            */
/* The cost model is the one the claim form bills by: a class period is one   */
/* sitting no matter how many sections sit in it, hours a TA works on both    */
/* tracks at the same clock time draw on the regular pool only (B2), a        */
/* graduate on ภาคพิเศษ is a flat term lump, and ป.ตรี ภาคพิเศษ is capped per   */
/* month. Calibrated against SC362005 2569/1, where it reproduces the ledger. */
/* -------------------------------------------------------------------------- */

export interface PlanSection {
  section_id: string;
  sec_no: string;
  track: "regular" | "special" | string;
  num_students: number;
  lecture_hours_weekly: number;
  lab_hours_weekly: number;
  lecture_periods: number;
  lab_periods: number;
  class_weeks: number;
  skipped_holiday: number;
  skipped_exam: number;
  months: { year_month: string; lecture_periods: number; lab_periods: number; class_weeks: number }[];
}

interface PlanTrack {
  track: string;
  cap_baht: number;
  existing_baht: number;
  existing_lump_baht: number;
  existing_tas: number;
  num_students: number;
}

export interface PlanFacts {
  starts_on: string;
  ends_on: string;
  weeks_total: number;
  class_weeks: number;
  sections: PlanSection[];
  tracks: { regular: PlanTrack; special: PlanTrack };
  existing: {
    ta_id: string; name: string; level: string; tracks: string[];
    regular_baht: number; special_baht: number; lump_baht: number;
    regular_paid: number; special_paid: number;
  }[];
  rates: {
    undergrad_regular: number;
    undergrad_special: number;
    graduate_regular_hourly: number;
    graduate_special_lumpsum: number;
    ug_special_monthly_cap: number;
    term_months: number;
    grad_review_hour_cap: number;
    plan_students_per_ta: number;
    plan_min_students_per_ta: number;
    plan_suggested_ta_cap: number;
  };
}

/** The shape the request form keeps per (assignment, section). */
export interface PlanWorkload {
  help_teach_hrs: number; help_teach_desc: string;
  prep_hrs: number; prep_desc: string;
  grade_hrs: number; grade_desc: string;
  other_hrs: number; other_desc: string;
  check_work_hrs: number; attendance_hrs: number; ug_other_hrs: number; ug_other_desc: string;
  lab_hrs: number; lab_other_hrs: number; lab_other_desc: string;
}

/** One draft assignment from the form, as the planner needs it. */
export interface PlanDraft {
  ta_id: string;
  ta_name?: string;
  level: string;
  section_ids: string[];
  workloads: Record<string, PlanWorkload | undefined>;
}

/** One line of a plan the lecturer can push into the form. */
export interface PlanItem {
  level: "undergrad" | "master";
  section_ids: string[];
  workloads: Record<string, PlanWorkload>;
}

type Track = "regular" | "special";
type Scope = "lecture" | "lab" | "both";

const isGradLevel = (l: string) => l === "master" || l === "phd";
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const hrs1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");

/* -------------------------------------------------------------------------- */
/* Cost model                                                                 */
/* -------------------------------------------------------------------------- */

/** Sections that meet at the same time form one sitting. Same rule the form uses. */
function sittingGroups(
  sections: PlanSection[], schedulesOf: (id: string) => { day_of_week: number; start_time: string; end_time: string }[],
): Map<string, number> {
  const overlaps = (a: string, b: string) =>
    schedulesOf(a).some(x => schedulesOf(b).some(y =>
      x.day_of_week === y.day_of_week && x.start_time < y.end_time && y.start_time < x.end_time));
  const groups = new Map<string, number>();
  let next = 0;
  for (const s of sections) {
    if (groups.has(s.section_id)) continue;
    next += 1;
    groups.set(s.section_id, next);
    for (const o of sections) {
      if (o.section_id === s.section_id || groups.has(o.section_id)) continue;
      if (overlaps(s.section_id, o.section_id)) groups.set(o.section_id, next);
    }
  }
  return groups;
}

interface PersonCost {
  regular: number;
  special: number;
  /** Graduate on ภาคพิเศษ: flat lump, committed off the top of the special pool. */
  lump: number;
  hoursRegular: number;
  hoursSpecial: number;
}

/**
 * What one TA's declared duties cost over the term. Class periods are counted
 * once per sitting group; hours on a special section that shares its sitting
 * with a regular one bill to the regular pool (B2). Weekly duties (ตรวจงาน,
 * อื่น ๆ) are per section — each is its own timetable slot.
 */
function personCost(
  level: string, sectionIds: string[], wlOf: (sid: string) => PlanWorkload | undefined,
  f: PlanFacts, groups: Map<string, number>, scope: Scope,
): PersonCost {
  const out: PersonCost = { regular: 0, special: 0, lump: 0, hoursRegular: 0, hoursSpecial: 0 };
  const byId = new Map(f.sections.map(s => [s.section_id, s]));
  const grad = isGradLevel(level);
  const picked = sectionIds.map(id => byId.get(id)).filter((s): s is PlanSection => !!s);
  if (picked.length === 0) return out;

  // Class hours, once per sitting group. The group bills regular if any of its
  // sections is regular — the special hours overlap and fall off (B2).
  const seen = new Set<number>();
  const hoursByTrack: Record<Track, number> = { regular: 0, special: 0 };
  // Special-track hours by calendar month too: the ป.ตรี ภาคพิเศษ cap is monthly.
  const specialByMonth = new Map<string, number>();
  const addSpecialMonth = (ym: string, h: number) => specialByMonth.set(ym, (specialByMonth.get(ym) ?? 0) + h);
  for (const s of picked) {
    const g = groups.get(s.section_id) ?? -1;
    if (seen.has(g)) continue;
    seen.add(g);
    const mates = picked.filter(p => (groups.get(p.section_id) ?? -2) === g);
    const track: Track = mates.some(m => m.track === "regular") ? "regular" : "special";
    // The largest declaration in the group is the sitting's duty.
    let lecPerPeriod = 0, labPerPeriod = 0;
    for (const m of mates) {
      const w = wlOf(m.section_id);
      if (!w) continue;
      if (grad) {
        // help_teach is a combined weekly ceiling; the generator bills one
        // attendance hour per lecture and the full lab, bounded by it.
        const lecDuty = Math.min(1, m.lecture_hours_weekly);
        const total = Math.min(w.help_teach_hrs, lecDuty + m.lab_hours_weekly);
        lecPerPeriod = Math.max(lecPerPeriod, Math.min(lecDuty, total));
        labPerPeriod = Math.max(labPerPeriod, Math.max(0, total - lecDuty));
      } else {
        lecPerPeriod = Math.max(lecPerPeriod, Math.min(w.attendance_hrs, m.lecture_hours_weekly));
        labPerPeriod = Math.max(labPerPeriod, Math.min(w.lab_hrs + w.lab_other_hrs, m.lab_hours_weekly));
      }
    }
    if (scope === "lab") lecPerPeriod = 0;
    if (scope === "lecture") labPerPeriod = 0;
    // Periods of the section with the most surviving meetings in the group.
    const lecPeriods = Math.max(...mates.map(m => m.lecture_periods));
    const labPeriods = Math.max(...mates.map(m => m.lab_periods));
    hoursByTrack[track] += lecPerPeriod * lecPeriods + labPerPeriod * labPeriods;
    if (track === "special") {
      const lead = mates.reduce((a, b) => (b.lecture_periods + b.lab_periods > a.lecture_periods + a.lab_periods ? b : a));
      for (const m of lead.months ?? []) addSpecialMonth(m.year_month, lecPerPeriod * m.lecture_periods + labPerPeriod * m.lab_periods);
    }
  }
  // Weekly duties, per section.
  for (const s of picked) {
    const w = wlOf(s.section_id);
    if (!w) continue;
    const weekly = grad
      ? Math.min(w.grade_hrs, f.rates.grad_review_hour_cap)
      : w.check_work_hrs + w.ug_other_hrs;
    hoursByTrack[s.track === "special" ? "special" : "regular"] += weekly * s.class_weeks;
    if (s.track === "special") for (const m of s.months ?? []) addSpecialMonth(m.year_month, weekly * m.class_weeks);
  }

  out.hoursRegular = hoursByTrack.regular;
  out.hoursSpecial = hoursByTrack.special;
  const r = f.rates;
  if (grad) {
    out.regular = hoursByTrack.regular * r.graduate_regular_hourly;
    if (picked.some(p => p.track === "special")) out.lump = r.graduate_special_lumpsum;
  } else {
    out.regular = hoursByTrack.regular * r.undergrad_regular;
    // ประกาศ: "50 ฿/ชม. หรือ 2,000 ฿/เดือน" — the cap bites month by month, so a
    // five-week month or one with clustered makeups is cut while a short month
    // is not. Summed per month when the calendar is known; term-level fallback
    // otherwise.
    if (r.ug_special_monthly_cap > 0 && specialByMonth.size > 0) {
      let total = 0;
      for (const h of specialByMonth.values()) total += Math.min(h * r.undergrad_special, r.ug_special_monthly_cap);
      out.special = total;
    } else {
      const raw = hoursByTrack.special * r.undergrad_special;
      const cap = r.ug_special_monthly_cap > 0 ? r.ug_special_monthly_cap * (r.term_months || 4) : Infinity;
      out.special = Math.min(raw, cap);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Duty templates — what a plan puts in the form                              */
/* -------------------------------------------------------------------------- */

const emptyWorkload = (): PlanWorkload => ({
  help_teach_hrs: 0, help_teach_desc: "",
  prep_hrs: 0, prep_desc: "",
  grade_hrs: 0, grade_desc: "",
  other_hrs: 0, other_desc: "",
  check_work_hrs: 0, attendance_hrs: 0, ug_other_hrs: 0, ug_other_desc: "",
  lab_hrs: 0, lab_other_hrs: 0, lab_other_desc: "",
});

interface Template {
  /** ตรวจงาน hours a week, per section. */
  reviewHrs: number;
  /** เช็คชื่อ for the whole lecture rather than the last hour. */
  fullLecture: boolean;
  label: string;
}

/**
 * The duty ladder. Each rung is a legitimate, form-valid workload; the
 * optimiser climbs it while the pool allows, so a richer course pays each TA
 * for more of the work they actually do instead of leaving money unspent, and
 * a poor course steps down before it drops a person. Only the three duties a
 * request normally carries — เช็คชื่อ, แลบ, ตรวจงาน — are on it (12/09/2026).
 */
const DUTY_LADDER: Template[] = [
  { reviewHrs: 1, fullLecture: false, label: "เช็คชื่อ 1 ชม. + แลบ + ตรวจงาน 1 ชม." },
  { reviewHrs: 2, fullLecture: false, label: "เช็คชื่อ 1 ชม. + แลบ + ตรวจงาน 2 ชม." },
  { reviewHrs: 2, fullLecture: true, label: "เช็คชื่อทั้งคาบ + แลบ + ตรวจงาน 2 ชม." },
];
/** The rung a course with no budget pressure either way starts from. */
const DUTY_STANDARD = 1;

/**
 * @param noReview — leave ตรวจงาน at 0 on this section. Used for a special
 *   section whose pool cannot pay for it: declaring the hours would only put
 *   unpaid work on the TA's timetable.
 */
function templateWorkload(level: "undergrad" | "master", s: PlanSection, t: Template, scope: Scope, noReview = false): PlanWorkload {
  const w = emptyWorkload();
  const lec = scope === "lab" ? 0 : (t.fullLecture ? s.lecture_hours_weekly : Math.min(1, s.lecture_hours_weekly));
  const lab = scope === "lecture" ? 0 : s.lab_hours_weekly;
  const review = noReview ? 0 : t.reviewHrs;
  if (level === "undergrad") {
    w.attendance_hrs = lec;
    w.lab_hrs = lab;
    w.check_work_hrs = s.lecture_hours_weekly > 0 ? Math.min(review, s.lecture_hours_weekly) : 0;
  } else {
    w.help_teach_hrs = lec + lab;
    w.grade_hrs = review;
    w.grade_desc = review > 0 ? "ตรวจการบ้าน" : "";
    // Regulation total for a graduate is 10–12 h/week; the rest is
    // preparation, which is administrative and not billed.
    w.prep_hrs = Math.max(0, 10 - (w.help_teach_hrs + w.grade_hrs));
    w.prep_desc = w.prep_hrs > 0 ? "เตรียมการสอน" : "";
  }
  return w;
}

/* -------------------------------------------------------------------------- */
/* Recommendation                                                             */
/* -------------------------------------------------------------------------- */

interface Option {
  key: string;
  title: string;
  detail: string;
  ug: number;
  grad: number;
  cost: PersonCost;
  /** Pool that decides the verdict for this option. */
  regularLeft: number;
  specialLeft: number;
  fits: boolean;
  items: PlanItem[];
  recommended?: boolean;
  /** "แนะนำ", "มีบัณฑิต", "ตามเกณฑ์" — what this card is an answer to. */
  tag: string;
  /** The duty rung each TA is planned at, in words. */
  duty: string;
  /** Who sits where: one entry per sitting, e.g. "sec 1: 3 คน". */
  split: string[];
  /** Per-TA pay per month (the figure a TA actually reasons in). */
  perMonthUg: number;
  perMonthGrad: number;
}


/* -------------------------------------------------------------------------- */

/** sessionStorage key a plan travels under from the budget page to the form. */
export const planHandoffKey = (tcId: string) => `ta-plan-handoff:${tcId}`;

/** What the form's current rows would cost — handed to the page so the confirm
 *  dialog can show each person's money before the lecturer commits. */
export interface DraftEstimate {
  people: { index: number; owed: number; share: number; perMonth: number; hours: number }[];
  regularTotal: number; regularCap: number;
  specialTotal: number; specialCap: number; hasSpecial: boolean;
  verdict: "ok" | "tight" | "over";
  over: number;
  months: number;
}

export function TaPlanner({
  tcId, schedules, drafts, scope, onApplyPlan, onDraftEstimate, variant = "request",
}: {
  tcId: string;
  /** Section timetables from /teaching-courses/:id — to detect shared sittings. */
  schedules: Record<string, { day_of_week: number; start_time: string; end_time: string }[]>;
  drafts: PlanDraft[];
  scope: Scope;
  onApplyPlan?: (items: PlanItem[]) => void;
  onDraftEstimate?: (est: DraftEstimate | null) => void;
  /**
   * "request": collapsible card above the form, evaluates the form's drafts.
   * "budget": the standalone budget page — always open, also lists the
   * approved TAs with what each will actually be paid.
   */
  variant?: "request" | "budget";
}) {
  const { data: f } = useSWR<PlanFacts>(tcId ? `/teaching-courses/${tcId}/ta-plan` : null);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"plan" | "manual">("plan");
  const collapsible = variant === "request";

  const groups = useMemo(
    () => f ? sittingGroups(f.sections, id => schedules[id] ?? []) : new Map<string, number>(),
    [f, schedules],
  );

  const model = useMemo(() => f ? buildModel(f, groups, scope, drafts) : null, [f, groups, scope, drafts]);

  useEffect(() => {
    if (!onDraftEstimate) return;
    if (!f || !model) { onDraftEstimate(null); return; }
    const months = f.rates.term_months || 4;
    const ev = model.draftEval;
    onDraftEstimate({
      people: ev.people.map(p => {
        const owed = p.cost.regular + p.cost.special + p.cost.lump;
        return { index: p.index, owed, share: p.share, perMonth: p.share / months, hours: p.cost.hoursRegular + p.cost.hoursSpecial };
      }),
      regularTotal: ev.regularTotal, regularCap: model.regular.cap,
      specialTotal: ev.specialTotal, specialCap: model.special.cap, hasSpecial: model.hasSpecial,
      verdict: ev.verdict, over: ev.overRegular + ev.overSpecial, months,
    });
  }, [f, model, onDraftEstimate]);

  if (!f || !model) {
    return <div className="mb-4 h-28 rounded-xl bg-surface-secondary animate-pulse" />;
  }

  const { regular, special, hasSpecial, options, specialOptions, draftEval } = model;
  const headline = draftEval.people.length > 0 ? draftEval.verdict : (options.find(o => o.recommended)?.fits ? "ok" : "tight");

  return (
    <Panel className="mb-4" padded={false}>
      <button type="button" onClick={() => collapsible && setOpen(o => !o)}
        className={"flex w-full items-center gap-2 px-4 py-3 text-left " + (collapsible ? "" : "cursor-default")}>
        {collapsible && <ChevronDown size={16} className={"text-muted transition-transform " + (open ? "" : "-rotate-90")} />}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <Calculator size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {variant === "budget" ? "งบ TA ของวิชานี้" : "วางแผน TA ให้พอดีงบ"}{" "}
            <span className="font-normal text-muted">(ประมาณการจากตารางสอนจริง)</span>
          </div>
          <div className="text-xs text-muted">
            สอนจริง {f.class_weeks} สัปดาห์ จาก {hrs1(f.weeks_total)} สัปดาห์ของเทอม
            {" · "}งบภาคปกติ {baht(regular.cap)}{hasSpecial && <> · ภาคพิเศษ {baht(special.cap)}</>}
          </div>
        </div>
        {!open && (
          <span className="shrink-0">
            {headline === "over"
              ? <Chip tone="danger"><TriangleAlert size={12} /> เกินงบ</Chip>
              : headline === "ok"
              ? <Chip tone="success"><CircleCheck size={12} /> พอดีงบ</Chip>
              : <Chip tone="warn">งบตึง</Chip>}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-hairline px-4 py-4 space-y-4">
          {/* 1. The two pools — what there is to plan with */}
          <div className={"grid gap-3 " + (hasSpecial ? "sm:grid-cols-2" : "")}>
            <PoolCard label="ภาคปกติ" tone="brand" pool={regular} weeks={f.class_weeks} />
            {hasSpecial && <PoolCard label="ภาคพิเศษ" tone="warn" pool={special} weeks={f.class_weeks} />}
          </div>

          {variant === "budget" && f.existing.length > 0 && <ExistingCard f={f} />}

          {/* Two ways in: the plan the system works out, or the lecturer's own
              numbers on the same cost model. The plan comes first. */}
          <div className="flex gap-1 rounded-lg bg-surface-secondary p-1 text-xs w-fit" role="tablist">
            {([["plan", "แผนที่แนะนำ"], ["manual", "คำนวณเอง"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={"rounded-md px-3 py-1 transition-colors " + (tab === k ? "bg-panel font-semibold shadow-sm" : "text-muted hover:text-ink-1")}>
                {label}
              </button>
            ))}
          </div>

          {tab === "manual" && <ManualCalculator f={f} regular={regular} special={special} hasSpecial={hasSpecial} scope={scope} groups={groups} />}

          {tab === "plan" && <>

          {/* 2. What the form currently costs, when there is anything in it */}
          {draftEval.people.length > 0 && <DraftCard ev={draftEval} regular={regular} special={special} hasSpecial={hasSpecial} months={f.rates.term_months || 4} />}

          {/* 3. Options that fit — or the plain fact that nothing more fits */}
          {regular.free <= 0 && (!hasSpecial || special.free <= 0) ? (
            <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger-soft-foreground">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                <b>งบของวิชานี้ถูกใช้เต็มแล้ว</b> โดย TA ที่อนุมัติไปก่อนหน้า — TA ที่ขอเพิ่มจะทำให้ทุกคนถูกตัดตามสัดส่วน
                ถ้ายังจำเป็นต้องขอเพิ่ม ให้ลดชั่วโมงของทุกคนลง หรือปรึกษาเจ้าหน้าที่เรื่องงบก่อนส่ง
              </span>
            </div>
          ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles size={14} className="text-accent" />
                {variant === "budget" && regular.existingTAs > 0 ? "ถ้าจะขอ TA เพิ่ม" : "แผนที่แนะนำสำหรับวิชานี้"}
              </div>
              <span className="text-[11px] text-muted">
                ปรับตามงบของวิชานี้ — ให้ครบตามเกณฑ์ก่อน แล้วเพิ่มชั่วโมงต่อคน แล้วค่อยเพิ่มคน
              </span>
            </div>
            {/* One framed group per budget pool, each with its own colour, name
                and money, so nobody has to read the cards to tell which pool a
                plan spends. A single-pool course gets a single frame. */}
            <PoolGroup
              tone="brand"
              label="ภาคปกติ"
              sublabel={model.specialCoSits
                ? `รวม sec ภาคพิเศษที่สอนพร้อมกัน · งบปกติ ${baht(regular.cap)}`
                : `sec ${f.sections.filter(x => x.track === "regular").map(x => x.sec_no).join(", ")} · นศ. ${regular.students} คน · งบปกติ ${baht(regular.cap)}`}
            >
              {options.slice(0, 4).map(o => (
                <OptionCard key={o.key} o={o} hasSpecial={hasSpecial}
                  applyLabel={variant === "budget" ? "ไปกรอกคำขอด้วยแผนนี้" : "ใส่แผนนี้ลงฟอร์ม"}
                  onApply={onApplyPlan ? () => onApplyPlan(o.items) : undefined} />
              ))}
            </PoolGroup>
            {specialOptions.length > 0 && (
              <PoolGroup
                tone="warn"
                label="ภาคพิเศษ"
                sublabel={`sec ${f.sections.filter(x => x.track === "special").map(x => x.sec_no).join(", ")} สอนคนละเวลา ต้องมี TA ของตัวเอง · นศ. ${special.students} คน · งบพิเศษ ${baht(special.cap)} (แยกจากงบปกติ)`}
              >
                {specialOptions.map(o => (
                  <OptionCard key={o.key} o={o} hasSpecial={hasSpecial} specialOnly
                    applyLabel={variant === "budget" ? "ไปกรอกคำขอด้วยแผนนี้" : "ใส่แผนนี้ลงฟอร์ม"}
                    onApply={onApplyPlan ? () => onApplyPlan(o.items) : undefined} />
                ))}
              </PoolGroup>
            )}
            {model.advice.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {model.advice.map((a, i) => (
                  <li key={i} className="flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-accent" /><span>{a}</span></li>
                ))}
              </ul>
            )}
          </div>

          )}

          </>}

          <div className="text-[11px] text-muted border-t border-hairline pt-2">
            คิดจากคาบที่เหลือจริงหลังหักวันหยุดและช่วงสอบ (sec {f.sections.map(s => `${s.sec_no}: ${s.lecture_periods}+${s.lab_periods} คาบ`).join(", ")})
            {" · "}คาบที่สอนพร้อมกันคิดครั้งเดียว · ชั่วโมง sec พิเศษที่ทับเวลา sec ปกติ เบิกจากงบปกติ
            {" · "}ตัวเลขจริงขึ้นกับที่ TA ลงเวลาและอาจารย์อนุมัติ
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

interface Pool {
  cap: number;
  existing: number;
  existingTAs: number;
  students: number;
  /** cap − existing, floored at 0. */
  free: number;
}

interface DraftEval {
  /** index = position in the drafts array, so the form can line these up with its rows. */
  people: { index: number; name: string; level: string; cost: PersonCost; share: number }[];
  regularTotal: number;
  specialTotal: number;
  lumpTotal: number;
  verdict: "ok" | "tight" | "over";
  overRegular: number;
  overSpecial: number;
}

function buildModel(f: PlanFacts, groups: Map<string, number>, scope: Scope, drafts: PlanDraft[]) {
  const mkPool = (t: PlanTrack): Pool => {
    const existing = t.existing_baht + t.existing_lump_baht;
    return { cap: t.cap_baht, existing, existingTAs: t.existing_tas, students: t.num_students, free: Math.max(0, t.cap_baht - existing) };
  };
  const regular = mkPool(f.tracks.regular);
  const special = mkPool(f.tracks.special);
  const specialSecs = f.sections.filter(s => s.track === "special");
  const hasSpecial = specialSecs.length > 0;

  const rates = f.rates;
  const perTA = rates.plan_students_per_ta > 0 ? rates.plan_students_per_ta : 25;
  const minPerTA = rates.plan_min_students_per_ta > 0 ? rates.plan_min_students_per_ta : 15;
  const guideCap = rates.plan_suggested_ta_cap;
  const months = rates.term_months || 4;
  const guideFor = (students: number) => {
    const n = students > 0 ? Math.ceil(students / perTA) : 0;
    return guideCap > 0 ? Math.min(guideCap, n) : n;
  };
  const ceilingFor = (students: number) => students > 0 ? Math.ceil(students / minPerTA) : 0;

  // The unit of planning is a SITTING — the sections that meet in one room at
  // one time. A TA is placed on one sitting, never spread over the timetable,
  // so a two-section course gets two lots of TAs instead of every TA doing
  // both timetables at double the cost.
  interface Sitting {
    id: number;
    secs: PlanSection[];
    label: string;
    students: number;
    /** Which pool pays the class hours: regular if any regular section sits. */
    pool: "regular" | "special";
    /** Special sections whose ตรวจงาน the special pool can no longer pay. */
    noReview: Set<string>;
  }
  const specialExhausted = special.free <= 0.5;
  const sittings: Sitting[] = [];
  for (const s of f.sections) {
    const g = groups.get(s.section_id) ?? -1;
    let sit = sittings.find(x => x.id === g);
    if (!sit) {
      sit = { id: g, secs: [], label: "", students: 0, pool: "special", noReview: new Set() };
      sittings.push(sit);
    }
    sit.secs.push(s);
    sit.students += s.num_students;
    if (s.track === "regular") sit.pool = "regular";
  }
  for (const sit of sittings) {
    sit.label = "sec " + sit.secs.map(x => x.sec_no).join("+");
    if (sit.pool === "regular" && specialExhausted) {
      for (const x of sit.secs) if (x.track === "special") sit.noReview.add(x.section_id);
    }
  }
  const regularSittings = sittings.filter(x => x.pool === "regular");
  const specialSittings = sittings.filter(x => x.pool === "special");
  const specialCoSits = hasSpecial && specialSittings.length === 0;

  const costOn = (level: "undergrad" | "master", sit: Sitting, t: Template) => {
    const wl: Record<string, PlanWorkload> = {};
    for (const x of sit.secs) wl[x.section_id] = templateWorkload(level, x, t, scope, sit.noReview.has(x.section_id));
    const cost = personCost(level, sit.secs.map(x => x.section_id), id => wl[id], f, groups, scope);
    return { cost, wl, baht: cost.regular + cost.special + cost.lump };
  };
  const sumCost = (parts: [PersonCost, number][]): PersonCost => {
    const cost: PersonCost = { regular: 0, special: 0, lump: 0, hoursRegular: 0, hoursSpecial: 0 };
    for (const [c, k] of parts) {
      cost.regular += c.regular * k; cost.special += c.special * k; cost.lump += c.lump * k;
      cost.hoursRegular += c.hoursRegular * k; cost.hoursSpecial += c.hoursSpecial * k;
    }
    return cost;
  };
  const weeklyOf = (c: PersonCost) => (c.hoursRegular + c.hoursSpecial) / Math.max(1, f.class_weeks);

  /**
   * Distribute one pool over its sittings.
   *
   * Order of concerns:
   *   1. every sitting gets one TA, then the guideline (นศ./perTA) is met,
   *      biggest sittings first;
   *   2. each TA is paid at the highest rung the pool carries — never below the
   *      standard rung while the guideline is unmet, because a TA who grades two
   *      hours a week and is paid for one is being cheated, not budgeted;
   *   3. leftover money buys more people, densest-need sitting first, up to one
   *      TA per minPerTA students;
   *   4. only when a single TA at the standard rung does not fit does the plan
   *      step down to the bottom rung, and only when even that does not fit is
   *      the shortfall shown as over budget.
   * `existingTAs` already on the pool are taken off the guideline of the
   * largest sittings first (the pool does not say which sitting they sit on).
   */
  type Alloc = { heads: Map<number, { ug: number; grad: number }>; rung: number; fits: boolean; cost: PersonCost; spent: number };
  const planPool = (pool: Pool, sits: Sitting[], allowGrad: boolean) => {
    if (sits.length === 0) return null;
    const bySize = [...sits].sort((a, b) => b.students - a.students);
    const guide = new Map<number, number>();
    const ceiling = new Map<number, number>();
    for (const sit of sits) {
      guide.set(sit.id, Math.max(1, guideFor(sit.students)));
      ceiling.set(sit.id, Math.max(guide.get(sit.id)!, ceilingFor(sit.students)));
    }
    // Existing TAs already cover part of the guideline.
    let ex = pool.existingTAs;
    for (const sit of bySize) {
      while (ex > 0 && guide.get(sit.id)! > 0) { guide.set(sit.id, guide.get(sit.id)! - 1); ex--; }
    }
    for (const sit of sits) ceiling.set(sit.id, Math.max(guide.get(sit.id)!, ceiling.get(sit.id)! - pool.existingTAs));
    const spentOf = (c: PersonCost) => pool === regular ? c.regular : c.special + c.lump;
    const otherOk = (c: PersonCost) => {
      const other = pool === regular ? c.special + c.lump : c.regular;
      const otherPool = pool === regular ? special : regular;
      return other <= 0.5 || other <= otherPool.free + 0.5;
    };
    const build = (rung: number, gradsOn: number[] = []): Alloc => {
      const t = DUTY_LADDER[rung];
      const heads = new Map<number, { ug: number; grad: number }>();
      const parts: [PersonCost, number][] = [];
      let spent = 0;
      const place = (sit: Sitting, level: "undergrad" | "master") => {
        const c = costOn(level, sit, t);
        const h = heads.get(sit.id) ?? { ug: 0, grad: 0 };
        if (level === "master") h.grad++; else h.ug++;
        heads.set(sit.id, h);
        parts.push([c.cost, 1]);
        spent += spentOf(c.cost);
        return c.cost;
      };
      const total = () => sumCost(parts);
      // 1) guideline, largest sitting first, one round at a time.
      let round = 0;
      let placedAny = true;
      while (placedAny) {
        placedAny = false;
        for (const sit of bySize) {
          if ((heads.get(sit.id)?.ug ?? 0) + (heads.get(sit.id)?.grad ?? 0) <= round && round < guide.get(sit.id)!) {
            const useGrad = gradsOn.length > 0 && gradsOn[0] === sit.id && allowGrad;
            if (useGrad) gradsOn = gradsOn.slice(1);
            place(sit, useGrad ? "master" : "undergrad");
            placedAny = true;
          }
        }
        round++;
      }
      const guideFits = spent <= pool.free + 0.5 && otherOk(total());
      if (!guideFits) return { heads, rung, fits: false, cost: total(), spent };
      // 3) leftover buys more, where students-per-TA is worst, up to the ceiling.
      for (;;) {
        let pick: Sitting | null = null;
        let worst = 0;
        for (const sit of sits) {
          const h = heads.get(sit.id)!;
          const n = h.ug + h.grad;
          if (n >= ceiling.get(sit.id)!) continue;
          const ratio = sit.students / (n + 1);
          if (ratio > worst) { worst = ratio; pick = sit; }
        }
        if (!pick) break;
        const c = costOn("undergrad", pick, t);
        const next = sumCost([...parts, [c.cost, 1]]);
        if (spent + spentOf(c.cost) > pool.free + 0.5 || !otherOk(next)) break;
        place(pick, "undergrad");
      }
      return { heads, rung, fits: true, cost: total(), spent };
    };
    // 2) highest rung whose guideline fits; else the standard rung's best
    //    effort; else the bottom rung; else 1 TA over budget.
    let best: Alloc | null = null;
    for (let rung = DUTY_LADDER.length - 1; rung >= DUTY_STANDARD; rung--) {
      const a = build(rung);
      if (a.fits) { best = a; break; }
    }
    if (!best) {
      // Guideline unaffordable: keep the standard rung, cover as many sittings
      // as the money allows (largest first), never below one TA per sitting
      // unless even that fails.
      const partial = (rung: number): Alloc => {
        const t = DUTY_LADDER[rung];
        const heads = new Map<number, { ug: number; grad: number }>();
        const parts: [PersonCost, number][] = [];
        let spent = 0;
        for (const sit of bySize) {
          const c = costOn("undergrad", sit, t);
          if (spent + spentOf(c.cost) > pool.free + 0.5) continue;
          heads.set(sit.id, { ug: 1, grad: 0 });
          parts.push([c.cost, 1]);
          spent += spentOf(c.cost);
        }
        // Second pass toward the guideline while it still fits.
        for (const sit of bySize) {
          while ((heads.get(sit.id)?.ug ?? 0) < guide.get(sit.id)!) {
            const c = costOn("undergrad", sit, t);
            if (spent + spentOf(c.cost) > pool.free + 0.5) break;
            const h = heads.get(sit.id) ?? { ug: 0, grad: 0 };
            h.ug++; heads.set(sit.id, h);
            parts.push([c.cost, 1]);
            spent += spentOf(c.cost);
          }
        }
        return { heads, rung, fits: heads.size > 0, cost: sumCost(parts), spent };
      };
      const std = partial(DUTY_STANDARD);
      if (std.fits) best = std;
      else {
        const low = partial(0);
        if (low.fits) best = low;
        else {
          const sit = bySize[0];
          const c = costOn("undergrad", sit, DUTY_LADDER[0]);
          best = { heads: new Map([[sit.id, { ug: 1, grad: 0 }]]), rung: 0, fits: false, cost: c.cost, spent: spentOf(c.cost) };
        }
      }
    }
    // Graduate mixes: the same plan with the largest sitting's first seat(s)
    // taken by graduates, kept only when they still fit.
    const mixes: Alloc[] = [];
    if (allowGrad && best.fits) {
      for (const g of [1, 2]) {
        const on = bySize.slice(0, g).map(x => x.id);
        if (on.length < g) on.push(...Array(g - on.length).fill(bySize[0].id));
        const a = build(best.rung, on);
        if (a.fits) mixes.push(a);
      }
    }
    return { best, mixes, guide, ceiling, build };
  };

  const toOption = (a: Alloc, sits: Sitting[], tag: string): Option => {
    let ug = 0, grad = 0;
    const split: string[] = [];
    const items: PlanItem[] = [];
    const t = DUTY_LADDER[a.rung];
    let ugEach = 0, gradEach = 0, ugWeekly = 0, gradWeekly = 0;
    for (const sit of sits) {
      const h = a.heads.get(sit.id);
      if (!h || h.ug + h.grad === 0) continue;
      ug += h.ug; grad += h.grad;
      split.push(`${sit.label}: ${h.ug + h.grad} คน`);
      const uc = costOn("undergrad", sit, t);
      const gc = costOn("master", sit, t);
      ugEach = Math.max(ugEach, uc.baht); gradEach = Math.max(gradEach, gc.baht);
      ugWeekly = Math.max(ugWeekly, weeklyOf(uc.cost)); gradWeekly = Math.max(gradWeekly, weeklyOf(gc.cost));
      for (let i = 0; i < h.ug; i++) items.push({ level: "undergrad", section_ids: sit.secs.map(x => x.section_id), workloads: { ...uc.wl } });
      for (let i = 0; i < h.grad; i++) items.push({ level: "master", section_ids: sit.secs.map(x => x.section_id), workloads: { ...gc.wl } });
    }
    const parts: string[] = [];
    if (ug) parts.push(`ป.ตรี ${ug} คน`);
    if (grad) parts.push(`ป.โท/เอก ${grad} คน`);
    const detail = [
      ug ? `ป.ตรี คนละ ${hrs1(ugWeekly)} ชม./สัปดาห์ ≈ ${baht(ugEach)}/เทอม` : "",
      grad ? `บัณฑิต คนละ ${hrs1(gradWeekly)} ชม./สัปดาห์ ≈ ${baht(gradEach)}/เทอม` : "",
    ].filter(Boolean).join(" · ");
    return {
      key: `${tag}-${ug}-${grad}-${a.rung}-${sits.map(x => x.id).join(".")}`,
      title: parts.join(" + "), detail, tag, duty: t.label, split: sits.length > 1 ? split : [],
      perMonthUg: ugEach / months, perMonthGrad: gradEach / months,
      ug, grad, cost: a.cost,
      regularLeft: regular.free - a.cost.regular, specialLeft: special.free - a.cost.special - a.cost.lump, fits: a.fits,
      items,
    };
  };

  const R = planPool(regular, regularSittings, true);
  const options: Option[] = [];
  if (R) {
    options.push({ ...toOption(R.best, regularSittings, "แนะนำ"), recommended: true });
    for (const m of R.mixes) options.push(toOption(m, regularSittings, "มีบัณฑิต"));
    // The plain guideline at the standard rung, when it differs — the cheaper
    // plan most courses have run so far.
    if (R.best.rung !== DUTY_STANDARD || [...R.best.heads.values()].some((h, i) => h.ug + h.grad !== [...R.guide.values()][i])) {
      const plain = R.build(DUTY_STANDARD);
      // build() tops up to the ceiling; strip back to the guideline for this card.
      for (const sit of regularSittings) plain.heads.set(sit.id, { ug: R.guide.get(sit.id)!, grad: 0 });
      const parts: [PersonCost, number][] = regularSittings.map(sit => [costOn("undergrad", sit, DUTY_LADDER[DUTY_STANDARD]).cost, R.guide.get(sit.id)!]);
      plain.cost = sumCost(parts);
      plain.spent = plain.cost.regular;
      plain.fits = plain.spent <= regular.free + 0.5;
      const o = toOption(plain, regularSittings, "ตามเกณฑ์");
      if (!options.some(x => x.ug === o.ug && x.grad === o.grad && x.duty === o.duty)) options.push(o);
    }
  }
  const S = planPool(special, specialSittings, false);
  const specialOptions: Option[] = [];
  if (S) {
    specialOptions.push({ ...toOption(S.best, specialSittings, "แนะนำ"), recommended: true });
  }

  // Capacity summary at the standard rung, for the advice line.
  const stdUgEach = regularSittings.length ? Math.max(...regularSittings.map(sit => costOn("undergrad", sit, DUTY_LADDER[DUTY_STANDARD]).baht)) : 0;
  const stdGradEach = regularSittings.length ? Math.max(...regularSittings.map(sit => costOn("master", sit, DUTY_LADDER[DUTY_STANDARD]).baht)) : 0;
  const ugEach = stdUgEach, gradEach = stdGradEach;
  const maxUgWith = (grad: number) =>
    ugEach > 0 ? Math.max(0, Math.floor((regular.free - grad * gradEach + 0.5) / ugEach)) : 0;
  const capacity: { grad: number; ug: number; left: number }[] = [];
  for (let grad = 0; grad <= 2; grad++) {
    if (grad * gradEach > regular.free + 0.5) break;
    const ug = maxUgWith(grad);
    capacity.push({ grad, ug, left: regular.free - grad * gradEach - ug * ugEach });
  }
  const ugSpecialOnly = specialSittings.length
    ? costOn("undergrad", specialSittings[0], DUTY_LADDER[DUTY_STANDARD])
    : { cost: { regular: 0, special: 0, lump: 0, hoursRegular: 0, hoursSpecial: 0 } as PersonCost, wl: {}, baht: 0 };
  const idealUg = R ? [...R.guide.values()].reduce((a, b) => a + b, 0) : 0;
  const regularStudents = regularSittings.reduce((a, s) => a + s.students, 0);

  // Plain-language advice — the things a careful colleague would point out.
  const advice: string[] = [];
  if (regular.existingTAs > 0) {
    advice.push(`วิชานี้มี TA ที่อนุมัติแล้ว ${regular.existingTAs} คน ใช้งบไปแล้ว ≈ ${baht(regular.existing)} จาก ${baht(regular.cap)} แผนข้างบนคิดจากงบที่เหลือ`);
  }
  if (regularSittings.length > 1) {
    advice.push(`วิชานี้มี ${regularSittings.length} กลุ่มเรียนคนละเวลา (${regularSittings.map(x => x.label).join(", ")}) แผนจึงแบ่ง TA ประจำแต่ละกลุ่ม ไม่ให้คนเดียววิ่งสองตาราง`);
  }
  if (regular.free > 0 && ugEach > 0) {
    const mixes = capacity.filter(c => c.grad > 0)
      .map(c => `บัณฑิต ${c.grad} คน (≈ ${baht(c.grad * gradEach)}) + ป.ตรีได้อีก ${c.ug} คน`).join(" · ");
    advice.push(
      `งบปกติที่เหลือ ${baht(regular.free)} ที่ภาระงานมาตรฐาน (${DUTY_LADDER[DUTY_STANDARD].label}) รับ TA ป.ตรีได้สูงสุด ${maxUgWith(0)} คน (คนละ ≈ ${baht(ugEach)} ≈ ${baht(ugEach / months)}/เดือน)` +
      (mixes ? ` · ${mixes}` : ""),
    );
  }
  const wantUg = guideFor(regularStudents);
  if (wantUg > regular.existingTAs + maxUgWith(0) && ugEach > 0) {
    const need = wantUg - regular.existingTAs;
    const perHead = regular.free / need;
    advice.push(
      `นศ. ${regularStudents} คน ตามเกณฑ์ 1 ต่อ ${perTA} ควรมี TA ป.ตรี ${wantUg} คน แต่ที่ภาระงานมาตรฐานงบรับได้ ${maxUgWith(0) + regular.existingTAs} คน ` +
      `ระบบไม่ลดค่าตอบแทนต่อคนต่ำกว่ามาตรฐานเพื่อแลกจำนวน — ถ้าต้องการ ${wantUg} คน แต่ละคนจะได้ไม่เกิน ≈ ${baht(perHead)}/เทอม (≈ ${baht(perHead / months)}/เดือน) ` +
      `ซึ่งต่ำกว่างานที่ทำจริง ควรปรึกษาเจ้าหน้าที่เรื่องงบก่อน`,
    );
  }
  if (R && !R.best.fits) {
    advice.push(`งบปกติที่เหลือ ${baht(regular.free)} ไม่พอแม้ TA 1 คนที่ภาระงานขั้นต่ำ (≈ ${baht(R.best.spent)}) — ถ้าส่งคำขอ TA จะถูกตัดตามสัดส่วน`);
  }
  if (hasSpecial) {
    if (specialCoSits) {
      if (specialExhausted) {
        advice.push(
          `sec ภาคพิเศษ (${specialSecs.map(s => s.sec_no).join(", ")}) สอนเวลาเดียวกับ sec ปกติ แต่งบพิเศษ ${baht(special.cap)} ถูกใช้เต็มแล้ว` +
          (f.tracks.special.existing_lump_baht > 0 ? ` (เหมาจ่ายบัณฑิต ${baht(f.tracks.special.existing_lump_baht)})` : "") +
          ` — แผนจึงตั้งตรวจงานฝั่งพิเศษเป็น 0 เพราะจะไม่ได้เงิน คาบเรียนยังดูแลไปพร้อมกันได้โดยเบิกจากงบปกติ`,
        );
      } else {
        advice.push(
          `sec ภาคพิเศษ (${specialSecs.map(s => s.sec_no).join(", ")}) สอนเวลาเดียวกับ sec ปกติ — ให้ TA ภาคปกติดูแลไปพร้อมกัน ` +
          `คาบเรียนไม่คิดเงินซ้ำ งบพิเศษ ${baht(special.cap)} จะถูกใช้เฉพาะตรวจงานฝั่งพิเศษ`,
        );
      }
    } else if (special.free <= 0 && f.tracks.special.existing_lump_baht > 0) {
      advice.push(
        `งบภาคพิเศษ ${baht(special.cap)} ถูกใช้เต็มแล้วด้วยเหมาจ่ายของ TA บัณฑิตที่อนุมัติไว้ (${baht(f.tracks.special.existing_lump_baht)}) ` +
        `— TA ป.ตรีที่เพิ่มใน sec ภาคพิเศษจะเบิกชั่วโมงไม่ได้เลย`,
      );
    } else if (ugSpecialOnly.cost.special > special.free) {
      const maxHrsWeek = special.free / f.rates.undergrad_special / Math.max(1, f.class_weeks);
      advice.push(
        `งบภาคพิเศษที่เหลือ ${baht(special.free)} ไม่พอสำหรับ TA ป.ตรี 1 คนที่ภาระงานมาตรฐาน (≈ ${baht(ugSpecialOnly.cost.special)}) ` +
        `ต้องจำกัดชั่วโมงฝั่งพิเศษไม่เกิน ≈ ${hrs1(maxHrsWeek)} ชม./สัปดาห์ หรือคาดว่าเบิกได้ไม่ครบ`,
      );
    }
    if (f.rates.graduate_special_lumpsum > special.free) {
      advice.push(
        `อย่าใส่ TA ป.โท/เอก ใน sec ภาคพิเศษ${special.existingTAs > 0 ? "เพิ่ม" : "ของวิชานี้"} — เหมาจ่าย ${baht(f.rates.graduate_special_lumpsum)}/คน/เทอม ` +
        `มากกว่างบพิเศษที่${special.existingTAs > 0 ? "เหลือ" : "มี"} (${baht(special.free)}) และจะทำให้ TA ป.ตรีใน sec นั้นเบิกไม่ได้เลย`,
      );
    }
  }

  // The form as it stands.
  const people = drafts
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => d.section_ids.length > 0)
    .map(({ d, index }) => ({
      index,
      name: d.ta_name || "ยังไม่เลือกชื่อ",
      level: d.level,
      cost: personCost(d.level, d.section_ids, sid => d.workloads[sid], f, groups, scope),
      share: 0,
    }));
  const regularTotal = regular.existing + people.reduce((s, p) => s + p.cost.regular, 0);
  const lumpTotal = special.existing + people.reduce((s, p) => s + p.cost.lump, 0);
  const specialTotal = lumpTotal + people.reduce((s, p) => s + p.cost.special, 0);
  // Only the shortfall THIS request adds is the request's fault: a pool that
  // approved TAs already overran stays red in the pool card, not here.
  const overRegular = Math.max(0, regularTotal - regular.cap) - Math.max(0, regular.existing - regular.cap);
  const overSpecial = hasSpecial
    ? Math.max(0, specialTotal - special.cap) - Math.max(0, special.existing - special.cap)
    : 0;
  // Proportional cut, as the settlement does, so each person sees roughly what
  // they would actually get.
  const regRatio = regularTotal > regular.cap && regularTotal > 0 ? regular.cap / regularTotal : 1;
  const spFree = Math.max(0, special.cap - lumpTotal);
  const spHourly = people.reduce((s, p) => s + p.cost.special, 0) + f.tracks.special.existing_baht;
  const spRatio = spHourly > spFree && spHourly > 0 ? spFree / spHourly : 1;
  for (const p of people) {
    p.share = p.cost.regular * regRatio + p.cost.special * spRatio + p.cost.lump;
  }
  const slack = regular.cap - regularTotal;
  const verdict: DraftEval["verdict"] =
    overRegular > 0 || overSpecial > 0 ? "over" : slack < regular.cap * 0.05 ? "tight" : "ok";
  const draftEval: DraftEval = { people, regularTotal, specialTotal, lumpTotal, verdict, overRegular, overSpecial };

  return { regular, special, hasSpecial, specialCoSits, options, specialOptions, capacity, ugEach, gradEach, advice, draftEval, guide: idealUg };
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function PoolCard({ label, tone, pool, weeks }: { label: string; tone: "brand" | "warn"; pool: Pool; weeks: number }) {
  const pct = pool.cap > 0 ? Math.min(100, Math.round((pool.existing / pool.cap) * 100)) : 0;
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <Chip tone={tone}>{label}</Chip>
        <span className="text-[11px] text-muted">นศ. {pool.students} คน · {weeks} สัปดาห์</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">งบทั้งเทอม</span>
        <span className="text-sm font-semibold tabular-nums">{baht(pool.cap)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
        <div className={"h-full " + (pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted">
          {pool.existingTAs > 0 ? `TA เดิม ${pool.existingTAs} คน ใช้ ≈ ${baht(pool.existing)}` : "ยังไม่มี TA ที่อนุมัติ"}
        </span>
        <span className={"font-semibold tabular-nums " + (pool.free <= 0 ? "text-danger" : "text-ink-1")}>
          เหลือ {baht(pool.free)}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Manual calculator — the lecturer's own numbers on the same cost model      */
/* -------------------------------------------------------------------------- */

interface ManualPoolInput {
  students: number;
  ugCount: number;
  ugHrs: number;
  gradCount: number;
  gradHrs: number;
}

function ManualCalculator({ f, regular, special, hasSpecial, scope, groups }: {
  f: PlanFacts; regular: Pool; special: Pool; hasSpecial: boolean; scope: Scope; groups: Map<string, number>;
}) {
  const months = f.rates.term_months || 4;
  const weeks = Math.max(1, f.class_weeks);
  // Typical weekly duty per person from the timetable: เช็คชื่อ 1 + full lab + ตรวจงาน 2,
  // on the course's biggest sitting.
  const typical = (() => {
    let best = 0;
    const seen = new Set<number>();
    for (const s of f.sections) {
      const g = groups.get(s.section_id) ?? -1;
      if (seen.has(g)) continue;
      seen.add(g);
      const lab = scope === "lecture" ? 0 : s.lab_hours_weekly;
      const lec = scope === "lab" ? 0 : Math.min(1, s.lecture_hours_weekly);
      best = Math.max(best, lec + lab + (s.lecture_hours_weekly > 0 ? 2 : 0));
    }
    return best || 5;
  })();
  // A graduate's 10–12 h/week includes preparation, which is not billed: only
  // class time plus ≤ 2 h grading is — the same ceiling the plan uses.
  const gradBillable = typical;
  const seed = (pool: Pool): ManualPoolInput => ({
    students: pool.students, ugCount: 0, ugHrs: typical, gradCount: 0, gradHrs: Math.max(typical, 10),
  });
  const [reg, setReg] = useState<ManualPoolInput>(() => seed(regular));
  const [spc, setSpc] = useState<ManualPoolInput>(() => seed(special));

  // Cap scales linearly with students (budget.go): cap × students / students₀.
  const capFor = (pool: Pool, students: number) =>
    pool.students > 0 ? pool.cap * (students / pool.students) : pool.cap;
  const perMonthWeeks = weeks / months;

  const evalPool = (track: Track, inp: ManualPoolInput, pool: Pool) => {
    const r = f.rates;
    const cap = capFor(pool, inp.students);
    const free = Math.max(0, cap - pool.existing);
    // ป.ตรี: hourly; special capped per month.
    const ugHourly = track === "regular" ? r.undergrad_regular : r.undergrad_special;
    const ugMonthRaw = inp.ugHrs * perMonthWeeks * ugHourly;
    const ugMonth = track === "special" && r.ug_special_monthly_cap > 0 ? Math.min(ugMonthRaw, r.ug_special_monthly_cap) : ugMonthRaw;
    const ugEach = ugMonth * months;
    // บัณฑิต: hourly on regular, only ≤2 h of grading beyond class counts; flat lump on special.
    const gradEach = track === "regular"
      ? Math.min(inp.gradHrs, gradBillable) * weeks * r.graduate_regular_hourly
      : r.graduate_special_lumpsum;
    const total = inp.ugCount * ugEach + inp.gradCount * gradEach;
    return { cap, free, ugEach, gradEach, total, left: free - total, ugCapped: track === "special" && ugMonthRaw > ugMonth };
  };
  const R = evalPool("regular", reg, regular);
  const S = evalPool("special", spc, special);

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted">
        ใส่ตัวเลขเอง ระบบคิดให้ด้วยสูตรเดียวกับแผนแนะนำ: ชั่วโมง/สัปดาห์ × {weeks} สัปดาห์ที่สอนจริง × อัตราตามประกาศ
        {" · "}เปลี่ยนจำนวน นศ. แล้วเพดานงบจะเลื่อนตามสูตร
      </div>
      <div className={"grid gap-3 " + (hasSpecial ? "lg:grid-cols-2" : "")}>
        <ManualPoolCard label="ภาคปกติ" tone="brand" inp={reg} onChange={setReg} res={R} months={months} rateNote={`ป.ตรี ${baht(f.rates.undergrad_regular)}/ชม. · บัณฑิต ${baht(f.rates.graduate_regular_hourly)}/ชม. (10–12 ชม./สัปดาห์)`} gradHrsEditable />
        {hasSpecial && (
          <ManualPoolCard label="ภาคพิเศษ" tone="warn" inp={spc} onChange={setSpc} res={S} months={months}
            rateNote={`ป.ตรี ${baht(f.rates.undergrad_special)}/ชม. ไม่เกิน ${baht(f.rates.ug_special_monthly_cap)}/เดือน · บัณฑิต เหมาจ่าย ${baht(f.rates.graduate_special_lumpsum)}/คน/เทอม`} />
        )}
      </div>
    </div>
  );
}

function ManualPoolCard({ label, tone, inp, onChange, res, months, rateNote, gradHrsEditable }: {
  label: string; tone: "brand" | "warn"; inp: ManualPoolInput; onChange: (v: ManualPoolInput) => void;
  res: { cap: number; free: number; ugEach: number; gradEach: number; total: number; left: number; ugCapped: boolean };
  months: number; rateNote: string; gradHrsEditable?: boolean;
}) {
  const set = (patch: Partial<ManualPoolInput>) => onChange({ ...inp, ...patch });
  const num = (v: string, min: number, max: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  };
  const over = res.left < 0;
  const field = "w-full rounded-md border border-border bg-panel px-2 py-1 text-sm tabular-nums";
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <Chip tone={tone}>{label}</Chip>
        <span className="text-[11px] text-muted">{rateNote}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 items-end">
        <label className="block text-[11px] text-muted">นศ. (คน)
          <input className={field} type="number" min={0} value={inp.students} onChange={e => set({ students: num(e.target.value, 0, 2000) })} />
        </label>
        <Stat label="งบตามสูตร/เทอม" value={baht(res.cap)} />
        <Stat label="เหลือให้วางแผน" value={baht(res.free)} />
      </div>
      <div className="mt-3 grid grid-cols-[6rem_1fr_1fr] gap-x-2 gap-y-2 items-center text-xs">
        <span>ป.ตรี</span>
        <label className="text-[11px] text-muted">จำนวน (คน)
          <input className={field} type="number" min={0} max={20} value={inp.ugCount} onChange={e => set({ ugCount: num(e.target.value, 0, 20) })} />
        </label>
        <label className="text-[11px] text-muted">ชม./สัปดาห์/คน
          <input className={field} type="number" min={0} max={35} value={inp.ugHrs} onChange={e => set({ ugHrs: num(e.target.value, 0, 35) })} />
        </label>
        <span />
        <div className="col-span-2 text-[11px] text-muted">
          คนละ ≈ {baht(res.ugEach)}/เทอม (≈ {baht(res.ugEach / months)}/เดือน){res.ugCapped && " · ชนเพดาน/เดือนตามประกาศ"}
        </div>
        <span>ป.โท/เอก</span>
        <label className="text-[11px] text-muted">จำนวน (คน)
          <input className={field} type="number" min={0} max={5} value={inp.gradCount} onChange={e => set({ gradCount: num(e.target.value, 0, 5) })} />
        </label>
        <label className="text-[11px] text-muted">ชม./สัปดาห์/คน
          <input className={field} type="number" min={0} max={12} value={inp.gradHrs} disabled={!gradHrsEditable}
            onChange={e => set({ gradHrs: num(e.target.value, 0, 12) })} />
        </label>
        <span />
        <div className="col-span-2 text-[11px] text-muted">
          คนละ ≈ {baht(res.gradEach)}/เทอม (≈ {baht(res.gradEach / months)}/เดือน)
          {gradHrsEditable ? " · คิดเงินเฉพาะคาบสอน + ตรวจงาน ≤ 2 ชม. ส่วนเตรียมสอนไม่คิด" : " · เหมาจ่าย ไม่ขึ้นกับชั่วโมง"}
        </div>
      </div>
      <div className="mt-3 space-y-0.5 border-t border-hairline pt-2 text-xs">
        <Row label="รวมต้องจ่ายทั้งเทอม" value={baht(res.total)} strong />
        <Row label={over ? "เกินงบ" : "เหลืองบ"} value={baht(Math.abs(res.left))} tone={over ? "danger" : undefined} />
      </div>
      <div className={
        "mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] " +
        (res.total === 0 ? "bg-surface-secondary text-muted" : over ? "bg-danger-soft text-danger-soft-foreground" : "bg-success-soft text-success-soft-foreground")
      }>
        {res.total === 0 ? <><Users size={12} /> ใส่จำนวน TA เพื่อดูว่างบพอไหม</>
          : over ? <><TriangleAlert size={12} /> เกินงบ — จะถูกตัดตามสัดส่วน</>
          : <><CircleCheck size={12} /> พอดีงบ — เบิกได้เต็ม</>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PoolGroup({ tone, label, sublabel, children }: {
  tone: "brand" | "warn"; label: string; sublabel: string; children: React.ReactNode;
}) {
  const frame = tone === "warn"
    ? "border-warning/40 bg-warning-soft/20"
    : "border-accent/30 bg-accent-soft/10";
  return (
    <section className={"mt-2 rounded-xl border-2 p-3 " + frame} aria-label={label}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Chip tone={tone}>{label}</Chip>
        <span className="text-[11px] text-muted">{sublabel}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function OptionCard({ o, hasSpecial, onApply, applyLabel, specialOnly }: {
  o: Option; hasSpecial: boolean; onApply?: () => void; applyLabel: string;
  /** A special-pool plan: only that pool's balance is meaningful. */
  specialOnly?: boolean;
}) {
  const total = o.cost.regular + o.cost.special + o.cost.lump;
  return (
    <div className={
      "flex flex-col rounded-xl border p-3 " +
      (o.recommended ? "border-accent bg-accent-soft/30" : "border-border bg-panel")
    }>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold leading-tight">{o.title}</div>
        <Chip tone={o.recommended ? "brand" : "neutral"}>{o.recommended ? <><Sparkles size={11} /> {o.tag}</> : o.tag}</Chip>
      </div>
      {o.split.length > 0 && <div className="mt-1 text-[11px] text-ink-2">{o.split.join(" · ")}</div>}
      <div className="mt-1 text-[11px] text-ink-2">{o.duty}</div>
      <div className="mt-0.5 text-[11px] text-muted">{o.detail}</div>
      <div className="mt-0.5 text-[11px] text-muted">
        TA จะได้ {o.ug > 0 && <>ป.ตรี ≈ <b className="text-ink-1">{baht(o.perMonthUg)}/เดือน</b></>}
        {o.ug > 0 && o.grad > 0 && " · "}
        {o.grad > 0 && <>บัณฑิต ≈ <b className="text-ink-1">{baht(o.perMonthGrad)}/เดือน</b></>}
      </div>
      <div className="mt-2 space-y-0.5 text-xs">
        <Row label="ใช้งบรวม" value={baht(total)} strong />
        {!specialOnly && <Row label="เหลืองบปกติ" value={baht(o.regularLeft)} tone={o.regularLeft < 0 ? "danger" : undefined} />}
        {hasSpecial && (specialOnly || o.cost.special > 0 || o.cost.lump > 0 || o.specialLeft < 0) && (
          <Row label="เหลืองบพิเศษ" value={baht(o.specialLeft)} tone={o.specialLeft < 0 ? "danger" : undefined} />
        )}
      </div>
      <div className={
        "mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] " +
        (o.fits ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground")
      }>
        {o.fits ? <CircleCheck size={12} /> : <TriangleAlert size={12} />}
        {o.fits ? "พอดีงบ — เบิกได้เต็ม" : `เกินงบ ${baht(Math.max(0, -o.regularLeft) + Math.max(0, -o.specialLeft))} — จะถูกตัดตามสัดส่วน`}
      </div>
      {onApply && (
        <div className="mt-2">
          <Button size="sm" variant={o.recommended ? "primary" : "secondary"} onClick={onApply} fullWidth>
            <Plus size={14} /> {applyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function DraftCard({ ev, regular, special, hasSpecial, months }: { ev: DraftEval; regular: Pool; special: Pool; hasSpecial: boolean; months: number }) {
  const tone = ev.verdict === "over" ? "danger" : ev.verdict === "tight" ? "warn" : "success";
  return (
    <div className={
      "rounded-xl border p-3 " +
      (tone === "danger" ? "border-danger/30 bg-danger-soft/40" : tone === "warn" ? "border-warning/30 bg-warning-soft/40" : "border-success/30 bg-success-soft/40")
    }>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Users size={14} /> TA ที่กำลังจะขอ ({ev.people.length} คน) — ประมาณการ
        </div>
        <Chip tone={tone === "danger" ? "danger" : tone === "warn" ? "warn" : "success"}>
          {ev.verdict === "over" ? <><TriangleAlert size={12} /> เกินงบ</> : ev.verdict === "tight" ? "งบตึง" : <><CircleCheck size={12} /> พอดีงบ</>}
        </Chip>
      </div>
      <ul className="mt-2 divide-y divide-hairline text-xs">
        {ev.people.map((p, i) => {
          const owed = p.cost.regular + p.cost.special + p.cost.lump;
          return (
            <li key={i} className="flex items-baseline justify-between gap-2 py-1">
              <span className="min-w-0 truncate">
                {p.name} <span className="text-muted">· {isGradLevel(p.level) ? "บัณฑิต" : "ป.ตรี"} · {hrs1(p.cost.hoursRegular + p.cost.hoursSpecial)} ชม./เทอม</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {p.share < owed - 0.5
                  ? <><s className="text-muted">{baht(owed)}</s> → <b>{baht(p.share)}</b></>
                  : <b>{baht(owed)}</b>}
                <span className="text-muted"> (≈ {baht(p.share / months)}/เดือน)</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        <Row label="ภาคปกติ: ใช้ทั้งหมด (รวม TA เดิม)" value={`${baht(ev.regularTotal)} / ${baht(regular.cap)}`} tone={ev.overRegular > 0 ? "danger" : undefined} />
        {hasSpecial && <Row label="ภาคพิเศษ: ใช้ทั้งหมด" value={`${baht(ev.specialTotal)} / ${baht(special.cap)}`} tone={ev.overSpecial > 0 ? "danger" : undefined} />}
      </div>
      {ev.verdict === "over" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-danger-soft-foreground">
          <Wallet size={12} className="mt-0.5 shrink-0" />
          <span>
            เกินงบ {baht(ev.overRegular + ev.overSpecial)} — ระบบจะจ่ายตามสัดส่วนที่แต่ละคนทำ (ตัวเลขหลังลูกศร) ส่งได้ แต่ควรแจ้ง TA ล่วงหน้า
            หรือลดจำนวนคน/ชั่วโมงตรวจงานให้พอดี
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The approved TAs and what each will actually be paid — the settlement's own
 * per-person figure, so a lecturer reading this page and a TA reading their
 * payslip see the same number. A struck-through figure is the cost of the work
 * before the pool ran short.
 */
function ExistingCard({ f }: { f: PlanFacts }) {
  const totalOwed = f.existing.reduce((s, p) => s + p.regular_baht + p.special_baht + p.lump_baht, 0);
  const totalPaid = f.existing.reduce((s, p) => s + p.regular_paid + p.special_paid + p.lump_baht, 0);
  const short = totalPaid < totalOwed - 0.5;
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Users size={14} /> TA ที่อนุมัติแล้ว ({f.existing.length} คน) — เงินที่แต่ละคนจะได้
        </div>
        <span className="text-[11px] text-muted">จากงานที่ลงเวลาไว้ถึงตอนนี้ (รวมที่รออนุมัติ)</span>
      </div>
      <ul className="mt-2 divide-y divide-hairline text-xs">
        {f.existing.map(p => {
          const owed = p.regular_baht + p.special_baht + p.lump_baht;
          const paid = p.regular_paid + p.special_paid + p.lump_baht;
          const cut = paid < owed - 0.5;
          return (
            <li key={p.ta_id} className="flex items-baseline justify-between gap-2 py-1">
              <span className="min-w-0 truncate">
                {p.name}
                <span className="text-muted">
                  {" · "}{isGradLevel(p.level) ? "บัณฑิต" : "ป.ตรี"}
                  {" · "}{p.tracks.map(t => t === "special" ? "พิเศษ" : "ปกติ").join("+")}
                  {p.lump_baht > 0 && " · เหมาจ่าย"}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {cut ? <><s className="text-muted">{baht(owed)}</s> → <b>{baht(paid)}</b></> : <b>{baht(owed)}</b>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-2 text-xs font-semibold">
        <span>รวม</span>
        <span className="tabular-nums">
          {short ? <><s className="font-normal text-muted">{baht(totalOwed)}</s> → {baht(totalPaid)}</> : baht(totalOwed)}
        </span>
      </div>
      {short && (
        <div className="mt-1 text-[11px] text-muted">
          งบไม่พอสำหรับงานทั้งหมด ระบบแบ่งตามสัดส่วนที่แต่ละคนทำ — เลือกว่าจะให้ส่วนที่ขาดตกเดือนไหนได้ในหน้า “อนุมัติรายงาน TA”
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" }) {
  return (
    <div className={"flex items-baseline justify-between gap-3 " + (strong ? "font-semibold " : "") + (tone === "danger" ? "text-danger" : "")}>
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
