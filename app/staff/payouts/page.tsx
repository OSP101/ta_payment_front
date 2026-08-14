"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck, Lock, ChevronRight, AlertTriangle,
  Check, CircleDashed, Minus, CalendarClock,
} from "lucide-react";
import { useTerm, useTermKey } from "../TermContext";
import { PageHeader, Panel, EmptyState, Chip, Spinner, type ChipTone } from "../../components/ui";
import { roundRangeLabel, type FiscalSplitInfo } from "../../components/monthScope";
import { CertifierPicker } from "./CertifierPicker";

/**
 * ตรวจและส่งออกเอกสาร — the merged staff steps 3 and 4.
 *
 * They used to be two menu entries, and the split cost more than a click. The
 * work is one errand ("get this month's money out to the TAs") but the screens
 * were organised around the DATA's state instead: the review screen led with the
 * one group an officer can do nothing about, one TA blocked on one lecturer
 * produced five near-identical cards, and finishing a review told you nothing
 * about where to go next.
 *
 * The row is a COURSE, and it carries what an officer decides with:
 *
 *   - the code and the LECTURER, because the lecturer is who they talk to when a
 *     row is stuck. TA names were here first and were the wrong unit — a course
 *     with four TAs printed one name and "+3", which named nobody useful and ate
 *     the width the budget now uses;
 *   - money: spent against the ceiling, which is what the whole screen exists to
 *     move;
 *   - the month strip, so a course that stalled in September is visible without
 *     opening anything.
 *
 * There are no action buttons. There were two — "ตรวจ N รายการ" and
 * "ตรวจยอด & ส่งออก" — and both opened the same page, so two different labels
 * promised a difference that did not exist. The whole row is the link, a status
 * chip says what the course needs, and the actions live where they are actually
 * performed: one level in.
 *
 * TWO ROUNDS (13/08/2026)
 *
 * A term teaching มิ.ย.–ต.ค. crosses the 30 กันยายน budget year, so its money is
 * claimed on TWO documents against two appropriations. The screen used to know
 * nothing about this: a course that had shipped round 1 landed in "ส่งออกแล้ว"
 * and read as finished while a second file was still owed. A single amber chip
 * was tried first and was not enough — it said what was missing but not what
 * was done, so the pair still had to be inferred.
 *
 * So the round is now structural rather than annotative:
 *
 *   - a banner states the split ONCE, at the top, because it is a fact about
 *     the term rather than about any course, and repeating it on every row
 *     would be repeating the same sentence a hundred times;
 *   - every row in a crossing term carries both rounds side by side, always,
 *     including the round that is finished. Showing only what is outstanding
 *     is what made the old chip ambiguous: absence read as "no second round"
 *     and as "second round done" at the same time;
 *   - courses owing round 2 get their own section, so they are not buried in a
 *     bucket named for the thing they have already done.
 *
 * A term that does NOT cross the boundary renders exactly as it did before —
 * no banner, no round bar, no "รอบ" language anywhere. That is why the server
 * sends the fiscal split with the rows: without it, "this term has one round"
 * and "this course has no round-2 work" look identical.
 */

interface ReviewRow {
  period_id: string;
  ta_id: string;
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  status: string;
  approved_hours: number;
  approved_baht: number;
  open_rows: number;
  waiting_ta: number;
  waiting_lecturer: number;
  row_count: number;
  needs_staff: boolean;
}

interface CourseSummary {
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  lecturer_names: string;
  per_course_max_baht: number;
  used_baht: number;
  over_budget: boolean;
  ta_count: number;
  export_eligible: boolean;
  last_export_at?: string | null;
  /** This course's standing in each half of a term that crosses the budget
   *  year, in round order. Absent for a term that does not cross — there is
   *  one document and last_export_at already describes it. */
  rounds?: CourseRound[];
}

/** One course × one fiscal round. Both facts are needed: "not exported" says
 *  nothing without "has work", since every course in a crossing term falls
 *  inside both rounds' month ranges whether or not anyone taught in them. */
interface CourseRound {
  round: number;
  billable: boolean;
  exported: boolean;
}

/** The list endpoint's envelope — rows plus where the budget year cuts. */
interface PayoutDashboard {
  courses: CourseSummary[];
  fiscal_split: FiscalSplitInfo;
}

interface CourseCard {
  id: string;
  code: string;
  nameTH: string;
  lecturers: string;
  maxBaht: number;
  usedBaht: number;
  overBudget: boolean;
  /** Months settled by the lecturer and awaiting sign-off. */
  ready: ReviewRow[];
  /** Months still open with the TA or lecturer. */
  blocked: ReviewRow[];
  waitingTA: number;
  waitingLecturer: number;
  exportable: boolean;
  exportedAt?: string | null;
  /** Empty for a non-crossing term — the row then shows no round language. */
  rounds: CourseRound[];
}

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PayoutsPage() {
  const router = useRouter();
  const { termId } = useTerm();
  const queueKey = useTermKey("/submission-periods/review-queue");
  const summaryKey = useTermKey("/exports/summary");

  const { data: queue, isLoading: qLoading } =
    useSWR<{ items: ReviewRow[]; awaiting_appointment?: number }>(queueKey);
  const { data: summary, isLoading: sLoading } = useSWR<PayoutDashboard>(summaryKey);

  const split = summary?.fiscal_split;
  const crosses = !!split?.crosses && split.after.length > 0;

  const cards = useMemo(
    () => buildCards(queue?.items ?? [], summary?.courses ?? []),
    [queue, summary],
  );

  // Three groups: what an officer can move, what is exported for round 1 but
  // still owes round 2, and what is finished. "Waiting on someone else" was a
  // fourth, and it was a list of rows carrying no action on a screen whose whole
  // point is the next action. It is a count at the foot instead, and chased from
  // the course page.
  const act = cards.filter(c => bucketOf(c) === "act");
  const round2 = cards.filter(c => bucketOf(c) === "round2");
  const done = cards.filter(c => bucketOf(c) === "done");
  const waiting = cards.filter(c => bucketOf(c) === "waiting").length;

  const loading = qLoading || sLoading || !summary;
  const open = (c: CourseCard) => router.push(`/staff/payouts/${c.id}`);

  return (
    <>
      <PageHeader
        title="ตรวจและส่งออกเอกสาร"
        description="กดที่วิชาเพื่อตรวจชั่วโมงรายเดือน แล้วส่งออกเอกสารเบิกจ่าย"
        // Term-wide, so it belongs beside the title rather than inside any one
        // course's export panel.
        actions={termId ? <CertifierPicker termId={termId} /> : null}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner size="sm" /> กำลังโหลด…
        </div>
      ) : act.length === 0 && done.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ClipboardCheck size={24} />}
            title="ยังไม่มีวิชาที่ต้องดำเนินการ"
            description={
              (queue?.awaiting_appointment ?? 0) > 0
                ? `มีงาน ${queue?.awaiting_appointment} รายการที่รออยู่ แต่ยังไม่ได้ออกคำสั่งแต่งตั้งทีเอ ออกคำสั่งที่เมนู “ใบแต่งตั้งทีเอ” แล้วรายการจะขึ้นที่นี่`
                : "เมื่ออาจารย์อนุมัติบันทึกเวลาของ TA แล้ว วิชาจะขึ้นที่นี่"
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {/* Stated once, as a fact about the TERM. Every row below then only
              has to show where it stands, not re-explain why there are two
              columns to stand in. */}
          {crosses && <FiscalSplitNotice split={split!} owed={round2.length} />}

          <Section
            tourId="payouts-act"
            icon={<ClipboardCheck size={14} />}
            title={`รอคุณดำเนินการ (${act.length})`}
            // The chip beside each course name already says exactly what that
            // course needs. The old hint described the sort order instead —
            // a mechanic the officer can see for themselves, and which answers
            // no question they came here with.
            hint="ป้ายท้ายชื่อวิชาบอกว่าต้องทำอะไรต่อ"
            empty="ไม่มีวิชาที่รอคุณอยู่ เคลียร์หมดแล้ว"
            count={act.length}
          >
            {act.map(c => <CourseRow key={c.id} card={c} split={split} onOpen={() => open(c)} />)}
          </Section>

          {/* Its own section, not a chip in "ส่งออกแล้ว". These courses HAVE
              work left; filing them under the name of the thing they already
              finished is what made the second document easy to miss. Rendered
              only for a crossing term — otherwise it is a section that can
              never have a member. */}
          {crosses && (
            <Section
              tourId="payouts-round2"
              icon={<CalendarClock size={14} />}
              title={`รอบ 2 (${roundRangeLabel(split!.after)}) ยังไม่ได้ส่ง (${round2.length})`}
              hint="ส่งรอบแรกครบแล้ว แต่ยังต้องออกอีกใบสำหรับปีงบใหม่"
              empty="ไม่มีวิชาที่ค้างรอบ 2"
              count={round2.length}
            >
              {round2.map(c => <CourseRow key={c.id} card={c} split={split} onOpen={() => open(c)} />)}
            </Section>
          )}

          <Section
            tourId="payouts-done"
            icon={<Lock size={14} />}
            title={`${crosses ? "ส่งออกครบทุกรอบ" : "ส่งออกแล้ว"} (${done.length})`}
            hint="ดาวน์โหลดซ้ำได้ · เดือนที่ส่งออกไปแล้วถูกล็อกไม่ให้แก้"
            empty="ยังไม่มีวิชาที่ส่งออก"
            count={done.length}
          >
            {done.map(c => <CourseRow key={c.id} card={c} split={split} onOpen={() => open(c)} muted />)}
          </Section>

          {/* A footnote, not a section. These courses are real and the count is
              worth knowing, but they hold no action and they used to lead the
              page. */}
          {waiting > 0 && (
            <p className="px-1 text-xs text-muted">
              อีก {waiting} วิชายังไม่ถึงคิวคุณ รอ TA ลงเวลา รออาจารย์อนุมัติ หรือยังไม่ได้ออกคำสั่งแต่งตั้ง
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Why this term has two of everything — said once, in the term's own words.
 *
 * Not an alert: nothing is wrong, and dressing a normal fact about the calendar
 * in warning colours would make every ภาคต้น look broken for five months. It is
 * a quiet explanatory band that names the two rounds in the same words the row
 * bars and the section heading use, so the vocabulary is learned in one place.
 */
function FiscalSplitNotice({ split, owed }: { split: FiscalSplitInfo; owed: number }) {
  return (
    <Panel>
      <div className="flex items-start gap-2.5 text-xs">
        <CalendarClock size={15} className="mt-px shrink-0 text-muted" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">ภาคเรียนนี้คร่อมสิ้นปีงบประมาณ (30 ก.ย.) — ต้องออกเอกสาร 2 รอบ</p>
          <p className="text-muted">
            <b className="font-medium">รอบ 1 ({roundRangeLabel(split.before)})</b> เบิกจากงบปีที่กำลังจะปิด ·{" "}
            <b className="font-medium">รอบ 2 ({roundRangeLabel(split.after)})</b> เบิกจากงบปีใหม่
            {" "}— คนละใบ คนละก้อนงบ วิชาหนึ่งจึงส่งรอบแรกครบแล้วแต่ยังค้างรอบสองได้
          </p>
          {owed > 0 && (
            <p className="text-amber-700">
              ตอนนี้มี {owed} วิชาที่ส่งรอบ 1 ไปแล้วและยังค้างรอบ 2 อยู่
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** What one round slot is showing. Kept as a named state rather than two loose
 *  booleans so the icon, the wording and the colour are decided together and
 *  cannot drift into saying different things. */
type RoundState = "exported" | "owed" | "empty";

function roundStateOf(r: CourseRound): RoundState {
  if (!r.billable) return "empty";
  return r.exported ? "exported" : "owed";
}

const ROUND_STATE: Record<RoundState, {
  icon: typeof Check; word: string; cls: string;
}> = {
  // Icon AND word, never colour alone: green-vs-amber is the first thing lost
  // to a monochrome print-out, a dim screen, or red-green colour blindness, and
  // this pair is the whole point of the row.
  //
  // No dark: variants. This app has no dark theme — globals.css defines no dark
  // token set and the surfaces stay light even when the OS asks for dark — so a
  // dark: colour here would either never fire (dead weight) or, if a dark
  // variant is ever switched on, paint dark text on a still-light card. Measured
  // against the surfaces these actually sit on: 7.2:1 and 8.7:1, both past AA.
  exported: { icon: Check, word: "ส่งแล้ว", cls: "border-emerald-600/30 bg-emerald-50 text-emerald-800" },
  owed:     { icon: CircleDashed, word: "ยังไม่ส่ง", cls: "border-amber-600/40 bg-amber-50 text-amber-900" },
  empty:    { icon: Minus, word: "ไม่มีงาน", cls: "border-[var(--hairline)] text-muted" },
};

/**
 * Both halves of a crossing term, side by side, always — including the half
 * that is done.
 *
 * The previous version showed a chip only when round 2 was outstanding, which
 * made its absence carry two opposite meanings at once ("no second round
 * exists" and "the second round is finished"). A fixed pair of slots has no
 * absent state to misread: every course shows two, and each says which it is.
 */
function RoundBar({ rounds, split }: { rounds: CourseRound[]; split?: FiscalSplitInfo }) {
  if (!rounds.length) return null;
  const range = (n: number) =>
    n === 1 ? roundRangeLabel(split?.before ?? []) : roundRangeLabel(split?.after ?? []);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {rounds.map(r => {
        const s = ROUND_STATE[roundStateOf(r)];
        const Icon = s.icon;
        const span = range(r.round);
        return (
          <span
            key={r.round}
            // text-xs (12px), not the 11px this started at: Thai stacks สระ and
            // วรรณยุกต์ above and below the baseline, and they are the first
            // thing to close up at small sizes — "ส่งแล้ว" and "ยังไม่ส่ง"
            // differ by exactly such marks.
            className={
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-5 " + s.cls
            }
          >
            <Icon size={12} aria-hidden="true" className="shrink-0" />
            รอบ {r.round}
            {span && <span className="opacity-70">({span})</span>}
            <span className="font-medium">{s.word}</span>
          </span>
        );
      })}
    </div>
  );
}

function Section({
  icon, title, hint, empty, count, children, tourId,
}: {
  icon: React.ReactNode; title: string; hint: string; empty: string;
  count: number; children: React.ReactNode; tourId?: string;
}) {
  return (
    <Panel padded={false} data-tour={tourId}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">{icon} {title}</span>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      {count === 0 ? (
        <p className="border-t border-[var(--hairline)] px-4 py-3 text-xs text-muted">{empty}</p>
      ) : (
        <div className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {children}
        </div>
      )}
    </Panel>
  );
}

/**
 * What this course needs next — a label, not a control.
 *
 * "ส่งออกได้บางส่วน" is not a nicety. Export eligibility asks whether any month
 * has been signed off and none with APPROVED work is still waiting; a TA whose
 * rows the lecturer has never approved has no approved work at all, so they
 * never enter that test. CP321002 was the real case: one TA signed off, another
 * with 98 rows still in the lecturer's queue, and the row said "พร้อมส่งออก".
 * The download would have shipped one TA and silently left the other out.
 */
function statusOf(c: CourseCard): { tone: ChipTone; label: string } {
  // Review first: a course with months still to sign off has work here whatever
  // its export history says, and saying "ส่งออกแล้ว" over the top of it would
  // hide the only thing on the row an officer can act on.
  if (c.ready.length > 0) return { tone: "warn", label: `รอตรวจ ${c.ready.length} รายการ` };
  // In a crossing term the round bar already carries export state per round,
  // and a flat "ส่งออกแล้ว" beside it is at best redundant and at worst a
  // contradiction — it was the exact wording that made a course owing round 2
  // look finished.
  if (c.rounds.length > 0) {
    const owed = c.rounds.filter(r => r.billable && !r.exported);
    if (owed.length > 0) {
      return { tone: "warn", label: `ยังต้องส่งอีก ${owed.length} รอบ` };
    }
    if (c.exportedAt) return { tone: "success", label: "ส่งครบทุกรอบ" };
  } else if (c.exportedAt) {
    return { tone: "success", label: `ส่งออกแล้ว ${c.exportedAt.slice(0, 10)}` };
  }
  if (c.exportable && c.blocked.length > 0) return { tone: "info", label: "ส่งออกได้บางส่วน" };
  if (c.exportable) return { tone: "brand", label: "พร้อมส่งออก" };
  return { tone: "neutral", label: "ยังไม่ถึงคิว" };
}

/** Who is holding the rest of the course up, when someone is. */
function blockedHint(c: CourseCard): string {
  const parts: string[] = [];
  if (c.waitingLecturer > 0) parts.push(`${c.waitingLecturer} รายการรออาจารย์อนุมัติ`);
  if (c.waitingTA > 0) parts.push(`${c.waitingTA} รายการ TA ยังไม่ส่ง`);
  return parts.join(" · ");
}

/**
 * One course. The whole row is the link — there is one destination, so there is
 * one target, and nothing on the row pretends otherwise.
 */
function CourseRow({ card, split, onOpen, muted }: {
  card: CourseCard; split?: FiscalSplitInfo; onOpen: () => void; muted?: boolean;
}) {
  const st = statusOf(card);
  const hint = blockedHint(card);
  const pct = card.maxBaht > 0 ? (card.usedBaht / card.maxBaht) * 100 : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      // `group` + cursor-pointer: a <button> defaults to the arrow cursor in
      // every browser (only <a> gets the hand), so a whole-row target that looks
      // like a list row gave no sign it could be clicked at all.
      className="group flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
    >
      <div className="min-w-0 flex-1">
        {/* Status sits with the name, not out at the margin. It answers "what is
            this course?" — the same question the code and title answer — so it
            belongs in the same breath, and the eye stops travelling the width of
            the row to pair a label with its subject. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Code and title are ONE underline target — two spans with a flex gap
              between them would draw two stubs with a break in the middle, which
              reads as a rendering fault rather than a link. */}
          <span
            className={
              "min-w-0 truncate text-sm font-medium underline-offset-4 group-hover:underline " +
              (muted ? "text-muted" : "")
            }
          >
            {card.code} <span className="text-xs font-normal text-muted">{card.nameTH}</span>
          </span>
          <Chip tone={st.tone}>{st.label}</Chip>
        </div>
        <RoundBar rounds={card.rounds} split={split} />
        <div className="mt-0.5 truncate text-xs text-muted">
          {card.lecturers || "ยังไม่มีอาจารย์ผู้สอนในระบบ"}
        </div>
        {hint && <div className="mt-0.5 truncate text-xs text-amber-700">{hint}</div>}
      </div>

      {/* Money, right-aligned and tabular so a column of courses can be scanned
          down rather than read one at a time. */}
      <div className="hidden w-40 shrink-0 text-right sm:block">
        <div className="tabular text-sm font-medium">{baht(card.usedBaht)}</div>
        <div className="tabular text-xs text-muted">จากงบ {baht(card.maxBaht)}</div>
        {card.overBudget ? (
          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle size={11} /> เกินงบ
          </div>
        ) : card.maxBaht > 0 ? (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--hairline)]">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.min(100, Math.round(pct))}%` }}
            />
          </div>
        ) : null}
      </div>

      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

type Bucket = "act" | "waiting" | "round2" | "done";

/** Rounds this course owes a document for: work exists, nothing covers it. */
function roundsOwed(c: CourseCard): CourseRound[] {
  return c.rounds.filter(r => r.billable && !r.exported);
}

/**
 * Which group a course belongs in — decided by what the officer can DO, never by
 * the data's own state. A course with one reviewable month and four blocked ones
 * is actionable: the officer has work, and burying it under the blocked months
 * is exactly what the first version of this screen did.
 */
function bucketOf(c: CourseCard): Bucket {
  if (c.ready.length > 0) return "act";
  if (c.exportable && !c.exportedAt) return "act";
  // Checked before anything about blocked months: a course can be exported and
  // still have a later month open, and it belongs under "done" — the money for
  // the months that were ready has already left.
  if (c.exportedAt) {
    // ...unless a later fiscal round still owes a document of its own. This is
    // the whole reason the round bucket exists: "exported" was true and led the
    // course into a section named for being finished, while a second file
    // against next year's appropriation had never been issued.
    return roundsOwed(c).length > 0 ? "round2" : "done";
  }
  return "waiting";
}

function buildCards(rows: ReviewRow[], summary: CourseSummary[]): CourseCard[] {
  const byId = new Map<string, CourseCard>();

  const ensure = (id: string, code: string, nameTH: string): CourseCard => {
    let c = byId.get(id);
    if (!c) {
      c = {
        id, code, nameTH, lecturers: "", maxBaht: 0, usedBaht: 0, overBudget: false,
        ready: [], blocked: [], waitingTA: 0, waitingLecturer: 0,
        exportable: false, exportedAt: null, rounds: [],
      };
      byId.set(id, c);
    }
    return c;
  };

  for (const r of rows) {
    const c = ensure(r.teaching_course_id, r.course_code, r.course_name_th);
    if (r.status !== "pending") continue; // already signed off — nothing to show
    // needs_staff comes from the server so this screen and the per-course grid
    // cannot disagree about what is actionable. A month whose rows were all
    // forfeited is neither ready nor blocked: nothing to sign, nothing to pay.
    if (!r.needs_staff && r.open_rows === 0) continue;
    if (r.open_rows > 0) {
      c.blocked.push(r);
      c.waitingTA += r.waiting_ta;
      c.waitingLecturer += r.waiting_lecturer;
    } else {
      c.ready.push(r);
    }
  }

  // Summary supplies the course-level facts. A course can be exportable with
  // nothing in the queue (every month already signed off), so it has to be able
  // to create a card of its own — otherwise "ready to download" would be
  // invisible here.
  for (const s of summary) {
    // Courses with no TA at all are the bulk of a term's 127 rows and have
    // nothing to do with payouts. Skip unless the queue already knows them.
    if (s.ta_count === 0 && !byId.has(s.teaching_course_id)) continue;
    const c = ensure(s.teaching_course_id, s.course_code, s.course_name_th);
    c.lecturers = s.lecturer_names;
    c.maxBaht = s.per_course_max_baht;
    c.usedBaht = s.used_baht;
    c.overBudget = s.over_budget;
    c.exportable = s.export_eligible;
    // last_export_at, not teaching_courses.exported_at: the course LIST endpoint
    // does not select that column, so the old screen's "ส่งออกแล้ว" chip was
    // reading undefined and could never light up. This value comes from
    // export_batches, which is where the fact actually lives.
    c.exportedAt = s.last_export_at ?? null;
    c.rounds = s.rounds ?? [];
  }

  const out = [...byId.values()];
  // Most work first inside a bucket; code order for ties so the list is stable
  // between refreshes.
  out.sort((a, b) => {
    const w = (c: CourseCard) => c.ready.length * 1000 + c.blocked.length;
    return w(b) - w(a) || a.code.localeCompare(b.code);
  });
  return out;
}
