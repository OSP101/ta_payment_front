"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Lock, ChevronRight, AlertTriangle } from "lucide-react";
import { useTerm, useTermKey } from "../TermContext";
import { PageHeader, Panel, EmptyState, Chip, Spinner, type ChipTone } from "../../components/ui";
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
}

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PayoutsPage() {
  const router = useRouter();
  const { termId } = useTerm();
  const queueKey = useTermKey("/submission-periods/review-queue");
  const summaryKey = useTermKey("/exports/summary");

  const { data: queue, isLoading: qLoading } =
    useSWR<{ items: ReviewRow[]; awaiting_appointment?: number }>(queueKey);
  const { data: summary, isLoading: sLoading } = useSWR<CourseSummary[]>(summaryKey);

  const cards = useMemo(
    () => buildCards(queue?.items ?? [], summary ?? []),
    [queue, summary],
  );

  // Two groups now: what an officer can move, and what is finished. "Waiting on
  // someone else" was a third, and it was a list of rows carrying no action on a
  // screen whose whole point is the next action. It is a count at the foot
  // instead, and chased from the course page.
  const act = cards.filter(c => bucketOf(c) === "act");
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
                ? `มีงาน ${queue?.awaiting_appointment} รายการที่รออยู่ แต่ยังไม่ได้ออกคำสั่งแต่งตั้งทีเอ — ออกคำสั่งที่เมนู “ใบแต่งตั้งทีเอ” แล้วรายการจะขึ้นที่นี่`
                : "เมื่ออาจารย์อนุมัติบันทึกเวลาของ TA แล้ว วิชาจะขึ้นที่นี่"
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          <Section
            tourId="payouts-act"
            icon={<ClipboardCheck size={14} />}
            title={`รอคุณดำเนินการ (${act.length})`}
            // The chip beside each course name already says exactly what that
            // course needs. The old hint described the sort order instead —
            // a mechanic the officer can see for themselves, and which answers
            // no question they came here with.
            hint="ป้ายท้ายชื่อวิชาบอกว่าต้องทำอะไรต่อ"
            empty="ไม่มีวิชาที่รอคุณอยู่ — เคลียร์หมดแล้ว"
            count={act.length}
          >
            {act.map(c => <CourseRow key={c.id} card={c} onOpen={() => open(c)} />)}
          </Section>

          <Section
            tourId="payouts-done"
            icon={<Lock size={14} />}
            title={`ส่งออกแล้ว (${done.length})`}
            hint="ดาวน์โหลดซ้ำได้ · เดือนที่ส่งออกไปแล้วถูกล็อกไม่ให้แก้"
            empty="ยังไม่มีวิชาที่ส่งออก"
            count={done.length}
          >
            {done.map(c => <CourseRow key={c.id} card={c} onOpen={() => open(c)} muted />)}
          </Section>

          {/* A footnote, not a section. These courses are real and the count is
              worth knowing, but they hold no action and they used to lead the
              page. */}
          {waiting > 0 && (
            <p className="px-1 text-xs text-muted">
              อีก {waiting} วิชายังไม่ถึงคิวคุณ — รอ TA ลงเวลา รออาจารย์อนุมัติ หรือยังไม่ได้ออกคำสั่งแต่งตั้ง
            </p>
          )}
        </div>
      )}
    </>
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
  if (c.exportedAt) return { tone: "success", label: `ส่งออกแล้ว ${c.exportedAt.slice(0, 10)}` };
  if (c.ready.length > 0) return { tone: "warn", label: `รอตรวจ ${c.ready.length} รายการ` };
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
function CourseRow({ card, onOpen, muted }: { card: CourseCard; onOpen: () => void; muted?: boolean }) {
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

type Bucket = "act" | "waiting" | "done";

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
  if (c.exportedAt) return "done";
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
        exportable: false, exportedAt: null,
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
