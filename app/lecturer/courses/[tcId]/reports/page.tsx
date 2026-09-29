"use client";
import useSWR, { mutate } from "swr";
import { Fragment, use, useMemo, useState } from "react";
import {
  Check, X, CircleAlert, ChevronDown, History, Link2, Users, CalendarCheck,
  AlertTriangle, ArrowUp, ArrowDown, Settings2,
} from "lucide-react";
import { HoursSplit, hoursSplitText } from "../../../../lib/trackSplit";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, TextArea, FieldGroup, Alert,
  Chip, StatusChip, ConfirmDialog, type ChipTone,
} from "../../../../components/ui";
import { WorkloadEditModal } from "../../../../components/WorkloadEditModal";
import { Skel, SkelRows, SkelValue } from "../../../../components/Skeletons";
import { SectionReview } from "./SectionReview";

/**
 * One row of /reports/pending — an ASSIGNMENT (a TA on one section) that has
 * work-log rows awaiting review. A TA helping with two sections produces two
 * rows, which is why this screen groups by person before it shows anything.
 */
interface PendingRow {
  id: string;                    // assignment id
  ta_id: string;
  ta_name: string;
  /** "undergrad" | "master" | "phd" — reviewed under different rules. */
  study_level: string;
  course_code: string;
  teaching_course_id?: string;
  sec_no: string;
  track: string;                 // 'regular' | 'special'
  /** Sections taught in ONE sitting share this. Their hours are the same hours. */
  cotaught_group?: number | null;
  /** This section's own submitted hours. */
  total_hours?: number;
  /**
   * The whole co-taught group's hours, each shared sitting counted once —
   * identical on every row of the group, and equal to total_hours when there
   * is no group.
   *
   * Comes from the server because it cannot be derived here: co-taught sections
   * are NOT copies of each other. CP321002's pair holds 98 rows but only 82
   * distinct sittings, so neither adding the two totals (196) nor taking the
   * larger (98) gives the 164 that is actually waiting.
   */
  group_hours?: number;
  /** group_hours by the track it is billed on: a sitting any regular section
   *  shares is regular (rule B2); special is what the special section had alone. */
  group_regular_hours?: number;
  group_special_hours?: number;
  first_date?: string;
  last_date?: string;
  /** "YYYY-MM" months holding rows the TA saved but has not sent, period
   *  still open — the queue hides drafts, so this is the only trace of them. */
  draft_months?: string[];
  /** Same, past the period's close: forfeited ("ไม่ประสงค์ลงเวลา"), never coming. */
  forfeited_months?: string[];
}
interface Course { id: string; code: string; name_th: string; }

// ApprovalHistoryEntry matches /teaching-courses/:id/approval-history — one
// approve/reject action on a TA's worklog batch within this course. Not
// necessarily the current viewer's own action: staff/admin can act on a
// course they don't teach, so actor_name/actor_role say who did it.
interface ApprovalHistoryEntry {
  id: number;
  at: string;                     // ISO timestamp
  action: "worklog.approve" | "worklog.reject";
  assignment_id: string;
  ta_name: string;
  sec_no: string;
  track: string;
  note?: string;                  // reject reason; empty for approvals
  actor_name: string;
  actor_role: string;             // "lecturer" | "staff" | "admin" | ""
  // Snapshot of the work_log rows this action moved, frozen at the moment it
  // happened — what "ดูรายละเอียด" expands into. Shaped like WorkLog (minus
  // id/status) so it can feed straight into MonthTable, the SAME detail view
  // the pending queue uses (decided 11/09/2026, not a second custom design).
  // Empty for entries written before this snapshot was captured.
  rows: {
    work_date: string; start_time: string; end_time: string; hours: number;
    activity: string; parent_kind?: "lecture" | "lab" | null; note?: string;
  }[];
}

// WorkLog matches the /assignments/:id/worklog response shape. Kept local so
// this page doesn't reach into the TA-facing worklog page's private types.
interface WorkLog {
  id: string;
  assignment_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: "lecture" | "lab" | null;
  room?: string;
  note?: string;
  status: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
  makeup: "ชดเชย",
  other: "อื่น ๆ",
};
const PARENT_KIND_LABEL: Record<string, string> = {
  lecture: "คู่กับบรรยาย",
  lab: "คู่กับปฏิบัติการ",
};
const TRACK_LABEL: Record<string, string> = { regular: "ภาคปกติ", special: "ภาคพิเศษ" };
const ACTOR_ROLE_TH: Record<string, string> = { staff: "เจ้าหน้าที่", admin: "ผู้ดูแลระบบ" };

const DOW_ABBR_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const MONTH_TH_LONG = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
function formatWorkDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${DOW_ABBR_TH[dt.getDay()]} ${d} ${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}
/** Short Thai date for the "ส่งช่วง …" line. The API used to hand this screen a
 *  pre-formatted "2026-06-22 – 2026-10-18", the only raw ISO date in the app. */
function shortDateTH(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}
function dateRangeTH(first?: string, last?: string): string {
  if (!first) return "";
  if (!last || first === last) return shortDateTH(first);
  return `${shortDateTH(first)} – ${shortDateTH(last)}`;
}
/** Postgres hands back "13:00:00"; nobody schedules to the second. */
function hhmm(t?: string): string {
  return (t ?? "").slice(0, 5);
}
function monthKey(iso: string): string {
  return (iso ?? "").slice(0, 7);
}
function formatMonthShortTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}
function formatMonthTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_TH_LONG[m - 1]} ${y + 543}`;
}

/** สัปดาห์เริ่มวันจันทร์ — คืนคีย์เป็นวันจันทร์ของสัปดาห์นั้น (YYYY-MM-DD) */
function weekStart(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return iso ?? "";
  const dt = new Date(y, m - 1, d);
  const shift = (dt.getDay() + 6) % 7; // อา.=6, จ.=0
  dt.setDate(dt.getDate() - shift);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/* -------------------------------------------------------------------------- */
/* Sittings — the unit the lecturer is actually approving                      */
/* -------------------------------------------------------------------------- */

/**
 * A row as the reviewer should read it: one SITTING, with the sections it was
 * taught to.
 *
 * The generator writes a co-taught hour against every section it belongs to, so
 * "09:00–11:00, 2 ชม." arrives twice for a sec 1 + sec 2 pair. Adding those up
 * says four hours are waiting; export rule B2 pays two, once, at the regular
 * rate. This screen therefore shows the sitting once and names both sections.
 */
interface Sitting extends WorkLog {
  sections: string[];        // sec numbers this sitting was taught to
  assignmentIds: string[];   // every assignment the approve/reject must reach
}

interface WeekGroup { key: string; label: string; hours: number; items: Sitting[] }

/** จัดรายการในเดือนหนึ่งเป็นสัปดาห์ — ใช้เป็นตัวคั่นสายตาเบา ๆ ในตาราง */
function groupByWeek(items: Sitting[]): WeekGroup[] {
  const buckets = new Map<string, Sitting[]>();
  for (const r of items) {
    const k = weekStart(r.work_date);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const first = list[0]?.work_date ?? key;
      const last = list[list.length - 1]?.work_date ?? key;
      const dayOf = (iso: string) => Number(iso.split("-")[2]);
      const monthOf = (iso: string) => MONTH_TH_SHORT[Number(iso.split("-")[1]) - 1] ?? "";
      const label = first === last
        ? `สัปดาห์ ${dayOf(first)} ${monthOf(first)}`
        : `สัปดาห์ ${dayOf(first)}–${dayOf(last)} ${monthOf(last)}`;
      return { key, label, hours: list.reduce((s, i) => s + (i.hours || 0), 0), items: list };
    });
}

/* -------------------------------------------------------------------------- */
/* Grouping the queue by person                                                */
/* -------------------------------------------------------------------------- */

interface TAGroup {
  taId: string;
  name: string;
  studyLevel: string;
  rows: PendingRow[];       // one per section
  /** Pending hours counted ONCE per sitting — what the payout will settle. */
  pendingHours: number;
  pendingRegular: number;
  pendingSpecial: number;
  firstDate?: string;
  lastDate?: string;
  /** Section numbers that share a sitting, e.g. [["1","2"]]. */
  coTaught: string[][];
  /** Months with unsent drafts (period open) / forfeited drafts, across sections. */
  draftMonths: string[];
  forfeitedMonths: string[];
}

function groupByTA(rows: PendingRow[]): TAGroup[] {
  const byTA = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const arr = byTA.get(r.ta_id);
    if (arr) arr.push(r);
    else byTA.set(r.ta_id, [r]);
  }
  return Array.from(byTA.entries()).map(([taId, list]) => {
    // A co-taught group contributes group_hours ONCE, not once per section —
    // every row of the group repeats the same figure.
    const groups = new Map<string, { all: number; regular: number; special: number }>();
    for (const r of list) {
      const k = r.cotaught_group == null ? `solo:${r.id}` : `g${r.cotaught_group}`;
      const all = r.group_hours ?? r.total_hours ?? 0;
      groups.set(k, {
        all,
        regular: r.group_regular_hours ?? (r.track === "regular" ? all : 0),
        special: r.group_special_hours ?? (r.track === "special" ? all : 0),
      });
    }
    const coTaught = new Map<number, string[]>();
    for (const r of list) {
      if (r.cotaught_group == null) continue;
      const arr = coTaught.get(r.cotaught_group) ?? [];
      arr.push(r.sec_no);
      coTaught.set(r.cotaught_group, arr);
    }
    const dates = list.flatMap(r => [r.first_date, r.last_date]).filter(Boolean) as string[];
    const months = (pick: (r: PendingRow) => string[] | undefined) =>
      Array.from(new Set(list.flatMap(r => pick(r) ?? []))).sort();
    return {
      taId,
      name: list[0].ta_name,
      studyLevel: list[0].study_level,
      rows: [...list].sort((a, b) => a.sec_no.localeCompare(b.sec_no, undefined, { numeric: true })),
      pendingHours: Array.from(groups.values()).reduce((s, h) => s + h.all, 0),
      pendingRegular: Array.from(groups.values()).reduce((s, h) => s + h.regular, 0),
      pendingSpecial: Array.from(groups.values()).reduce((s, h) => s + h.special, 0),
      firstDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : undefined,
      lastDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
      coTaught: Array.from(coTaught.values())
        .filter(secs => secs.length > 1)
        .map(secs => secs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))),
      draftMonths: months(r => r.draft_months),
      forfeitedMonths: months(r => r.forfeited_months),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

const PENDING_KEY = "/reports/pending";

/* -------------------------------------------------------------------------- */

export default function ReportsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);

  const { data: course } = useSWR<Course>(`/teaching-courses/${tcId}`);
  const { data: all, error, isLoading } = useSWR<PendingRow[]>(PENDING_KEY);
  const historyKey = `/teaching-courses/${tcId}/approval-history`;
  // MonthlyPayPanel and BudgetNotice both read this; an approval changes what
  // the course has spent, so both must refresh with the queue.
  const settlementKey = `/teaching-courses/${tcId}/budget-settlement`;
  const { data: history, isLoading: historyLoading } = useSWR<ApprovalHistoryEntry[]>(historyKey);
  // This page is shared by lecturer/admin/staff (app/lecturer/layout.tsx's
  // requireRole), but the workload-correction feature is staff/admin only on
  // the backend (see router.go's adminOrStaff) — hide the button for a
  // lecturer viewer rather than let them hit a 403 on click.
  const { data: me } = useSWR<{ roles: string[] }>("/me");
  const canEditWorkload = !!me?.roles?.some(r => r === "admin" || r === "staff");

  const rows = useMemo(
    () => (all ?? []).filter(a => a.teaching_course_id === tcId || a.course_code === course?.code),
    [all, tcId, course?.code],
  );
  const groups = useMemo(() => groupByTA(rows), [rows]);

  // key = `${taId}|${YYYY-MM}` — a decision covers one person's whole month,
  // across every section they help with, because that is the unit the payout
  // and the submission period both work in.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function decideMonth(
    g: TAGroup, ym: string, assignmentIds: string[],
    kind: "approve" | "reject", reason?: string,
  ) {
    setPendingKey(`${g.taId}|${ym}`);
    try {
      // Approval of a section block (a co-taught set is several assignments)
      // goes through approve-batch: one transaction, so a refusal on one
      // section cannot leave the sitting approved on the other. Send-back has
      // no batch endpoint; sequential so a refusal does not race the first's
      // cache invalidation.
      if (kind === "approve") {
        await api.post("/worklog/approve-batch", { assignment_ids: assignmentIds, year_month: ym });
      } else {
        for (const id of assignmentIds) {
          await api.post(`/assignments/${id}/worklog/reject`, { reason, year_month: ym });
        }
      }
      notify.success(
        kind === "approve"
          ? `อนุมัติบันทึกเวลาเดือน${formatMonthTH(ym)} ของ ${g.name} แล้ว`
          : `ส่งกลับให้ ${g.name} แก้ไขเดือน${formatMonthTH(ym)} แล้ว`,
      );
      await Promise.all([
        mutate(PENDING_KEY),
        mutate(historyKey),
        // SectionReview fans out over its sections behind ONE composite key
        // (["worklogs", ...paths]), so invalidating the individual
        // /assignments/:id/worklog paths reaches nothing: the queue total and
        // the card header refreshed while the open table still showed every row
        // as "รอตรวจ". Match the composite keys instead.
        mutate(k => Array.isArray(k) && k[0] === "worklogs"),
        mutate(settlementKey),
      ]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  // After a lecturer correction (edit/cut): the queue totals, what each TA is
  // paid and the budget all move.
  async function refreshAfterCorrection() {
    await Promise.all([
      mutate(PENDING_KEY),
      mutate(k => Array.isArray(k) && (k[0] === "worklogs" || k[0] === "worklog-changes")),
      mutate(settlementKey),
    ]);
  }

  /**
   * Approve everything this TA still has waiting, across every month and every
   * section they help with.
   *
   * The endpoint means "all submitted rows" when year_month is absent, so this
   * needs no month list — which is what lets a FOLDED card offer the button at
   * all.
   *
   * One request covering every section, not one per section: /worklog/approve-batch
   * runs them in a single transaction. Looping left the TA half-approved whenever
   * the second call was refused — the lecturer saw an error for something that
   * had partly happened. It also lets the server weigh the whole batch against
   * the course budget at once, which per-section calls cannot.
   */
  async function approveAll(g: TAGroup) {
    setPendingKey(`${g.taId}|ALL`);
    try {
      await api.post("/worklog/approve-batch", { assignment_ids: g.rows.map(r => r.id) });
      notify.success(`อนุมัติบันทึกเวลาที่รออยู่ทั้งหมดของ ${g.name} แล้ว`);
      await Promise.all([
        mutate(PENDING_KEY),
        mutate(historyKey),
        mutate(k => Array.isArray(k) && k[0] === "worklogs"),
        mutate(settlementKey),
      ]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  const totalRegular = groups.reduce((s, g) => s + g.pendingRegular, 0);
  const totalSpecial = groups.reduce((s, g) => s + g.pendingSpecial, 0);

  return (
    <div>
      <PageHeader
        title="อนุมัติรายงานบันทึกเวลา TA"
        description={course ? `${course.code} ${course.name_th}` : "รายการที่ TA กดส่งขออนุมัติ"}
      />

      {/* Always on screen, queue or no queue: what each TA will actually be
          paid, month by month. The shortfall panels below only appear when the
          budget is short, but "เด็กจะได้เดือนละเท่าไหร่" is a question the
          lecturer has either way. */}
      <MonthlyPayPanel tcId={tcId} />

      {error && all === undefined ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดรายการรออนุมัติไม่สำเร็จ"
            description={(error as Error).message || "กรุณาลองใหม่อีกครั้ง"}
            action={
              <Button variant="secondary" size="sm" onPress={() => mutate(PENDING_KEY)}>
                ลองใหม่
              </Button>
            }
          />
        </Panel>
      ) : isLoading && all === undefined ? (
        <QueueSkeleton />
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CalendarCheck size={28} />}
            title="ไม่มีรายการรออนุมัติ"
            description="เมื่อ TA ในวิชานี้ส่งบันทึกเวลา จะปรากฏที่นี่"
          />
        </Panel>
      ) : (
        <>
          {/* What is waiting, before any of it is opened. The old page opened on
              a bare list and the reviewer had to expand rows to learn the size
              of the job. */}
          {/* The budget warning sits above the queue, not inside a dialog:
              the lecturer needs it while deciding, and it applies to every
              person below rather than to one approval. */}
          <BudgetNotice tcId={tcId} />

          <div data-tour="rep-summary" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Users size={14} className="text-muted" />
              รอตรวจ {groups.length} คน
            </span>
            <span className="text-muted">รวม <HoursSplit regular={totalRegular} special={totalSpecial} /></span>
          </div>

          <div data-tour="rep-list" className="flex flex-col gap-3">
            {groups.map(g => (
              <TACard
                key={g.taId}
                group={g}
                tcId={tcId}
                canEditWorkload={canEditWorkload}
                // One person waiting is not a list to scan — folding the only
                // card would just cost a click before any work can start.
                defaultOpen={groups.length === 1}
                pendingKey={pendingKey}
                onDecide={(ym, ids, kind, reason) => decideMonth(g, ym, ids, kind, reason)}
                onApproveAll={() => approveAll(g)}
                onChanged={refreshAfterCorrection}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-6">
        <ApprovalHistoryPanel
          history={history}
          loading={historyLoading && history === undefined}
        />
      </div>
    </div>
  );
}

/** The pending queue while it loads: the summary line, then collapsed TA cards. */
function QueueSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">กำลังโหลด</span>
      <div className="mb-3 flex items-center gap-4">
        <Skel className="h-4 w-24" />
        <Skel className="h-4 w-32" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1].map(i => (
          <Panel key={i} padded={false}>
            <div className="flex items-start gap-2 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skel className="h-4 w-48" />
                <Skel className="h-6 w-36 rounded-full" />
              </div>
              <Skel className="h-8 w-32 rounded-lg" />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One TA — every section they help with, then a row per month                */
/* -------------------------------------------------------------------------- */

function SectionChips({ group }: { group: TAGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {group.rows.map(r => (
        <Chip key={r.id} tone={(r.track === "special" ? "brand" : "neutral") as ChipTone}>
          sec {r.sec_no} · {TRACK_LABEL[r.track] ?? r.track}
        </Chip>
      ))}
      {group.coTaught.map(secs => (
        <span
          key={secs.join("-")}
          className="inline-flex items-center gap-1 text-xs text-muted"
          title="คาบเดียวกันบันทึกไว้ทุกเซคชันที่สอนพร้อมกัน ระบบนับและจ่ายครั้งเดียว"
        >
          <Link2 size={12} />
          sec {secs.join(", ")} สอนพร้อมกัน นับชั่วโมงครั้งเดียว
        </span>
      ))}
    </div>
  );
}

function TACard({
  group, tcId, canEditWorkload, defaultOpen, pendingKey, onDecide, onApproveAll, onChanged,
}: {
  group: TAGroup;
  tcId: string;
  canEditWorkload: boolean;
  defaultOpen: boolean;
  pendingKey: string | null;
  onDecide: (ym: string, assignmentIds: string[], kind: "approve" | "reject", reason?: string) => Promise<void>;
  onApproveAll: () => void;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirmAll, setConfirmAll] = useState(false);
  // True while one of this person's months has its send-back reason box open.
  const [rejecting, setRejecting] = useState(false);
  const [workloadEditOpen, setWorkloadEditOpen] = useState(false);
  const bodyId = `ta-${group.taId}`;
  const busyAll = pendingKey === `${group.taId}|ALL`;

  return (
    <Panel padded={false}>
      {/* The disclosure and the approve-all button are SIBLINGS, not nested — a
          button inside a button is invalid HTML, and in practice pressing
          "อนุมัติทุกเดือน" would have folded the card on its way out. */}
      <div className="flex flex-wrap items-start gap-2 px-4 py-3">
        {/* Five TAs with every month laid out measured 2,557px — three screens,
            25 month rows and 51 buttons, with only the first person and a half
            visible without scrolling. Folded, the same queue is one screen of
            names and the reviewer opens the one they are working on. */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="-mx-1 flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-surface-secondary"
        >
          <ChevronDown
            size={15}
            className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{group.name}</span>
              <Chip tone={group.studyLevel === "undergrad" ? "neutral" : "brand"}>
                {group.studyLevel === "undergrad" ? "ป.ตรี" : "บัณฑิตศึกษา"}
              </Chip>
            </div>
            <div className="mt-1.5">
              <SectionChips group={group} />
            </div>
            {/* The queue below never lists drafts, so a month the TA filled in
                but has not sent would otherwise just be missing. Informational
                only: there is nothing here to approve until it is sent. */}
            {group.draftMonths.length > 0 && (
              <div className="mt-1.5 flex items-start gap-1 text-xs text-warning">
                <CircleAlert size={13} className="mt-px shrink-0" />
                <span>
                  มีฉบับร่างที่ TA ยังไม่ส่ง: {group.draftMonths.map(formatMonthShortTH).join(", ")}
                </span>
              </div>
            )}
            {group.forfeitedMonths.length > 0 && (
              <div className="mt-1 text-xs text-muted">
                ไม่ได้ส่งภายในกำหนด (ไม่ประสงค์ลงเวลา): {group.forfeitedMonths.map(formatMonthShortTH).join(", ")}
              </div>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right text-xs text-muted">
            <div className="font-medium text-foreground">
              รอพิจารณา <HoursSplit regular={group.pendingRegular} special={group.pendingSpecial} />
            </div>
            {group.firstDate && (
              <div className="mt-0.5">ส่งช่วง {dateRangeTH(group.firstDate, group.lastDate)}</div>
            )}
          </div>
          {canEditWorkload && (
            <Button
              variant="ghost" size="sm"
              onPress={() => setWorkloadEditOpen(true)}
            >
              <Settings2 size={14} /> แก้ไขภาระงาน
            </Button>
          )}
          <Button
            variant="primary" size="sm"
            disabled={busyAll || rejecting} isPending={busyAll}
            onPress={() => setConfirmAll(true)}
          >
            <Check size={14} /> อนุมัติทุกเดือน
          </Button>
        </div>
      </div>

      {canEditWorkload && (
        <WorkloadEditModal
          open={workloadEditOpen}
          onClose={() => setWorkloadEditOpen(false)}
          tcId={tcId}
          taId={group.taId}
          taName={group.name}
        />
      )}

      {/* Confirmed rather than immediate: this covers months the reviewer may
          not have opened, so it has to be a deliberate act rather than a
          mis-aimed click on the row they meant to expand. */}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => { setConfirmAll(false); onApproveAll(); }}
        title="อนุมัติทุกเดือนที่รออยู่"
        icon={<Check size={18} />}
        confirmLabel="อนุมัติทั้งหมด"
        isPending={busyAll}
        message={
          <div className="space-y-2 text-sm">
            <p>
              อนุมัติบันทึกเวลาที่รออยู่<b>ทุกเดือน</b>ของ{" "}
              <b className="text-foreground">{group.name}</b> รวม{" "}
              {hoursSplitText(group.pendingRegular, group.pendingSpecial)}
              {group.rows.length > 1 && ` (${group.rows.length} เซคชัน)`}
            </p>
            {group.draftMonths.length > 0 && (
              <p className="text-muted">
                ไม่รวมฉบับร่างที่ TA ยังไม่ส่ง ({group.draftMonths.map(formatMonthShortTH).join(", ")})
              </p>
            )}
            <p className="text-muted">
              หลังอนุมัติ TA จะแก้ไขไม่ได้ หากต้องแก้ ให้ส่งกลับเป็นรายเดือน
            </p>
          </div>
        }
      />

      {/* Mounted only when open, so a folded card costs no work-log request
          either — five collapsed TAs fetch nothing until one is opened. */}
      {open && (
        <div id={bodyId}>
          <SectionReview
            taId={group.taId}
            taName={group.name}
            sections={group.rows}
            tcId={tcId}
            onDecide={onDecide}
            onChanged={onChanged}
            onRejectingChange={setRejecting}
          />
        </div>
      )}
    </Panel>
  );
}

/** One month of one budget pool, as the settlement priced it. */
interface MonthSettlement { year_month: string; baht: number; paid_baht: number; paid: boolean }
/** One TA inside one pool: their own months, and their lump if they hold one. */
interface PersonSettlement {
  ta_id: string;
  name: string;
  level: string; // "undergrad" | "master" | "phd"
  months: MonthSettlement[];
  baht: number;
  paid_baht: number;
  /** Graduate-special flat term lump — off the top of the pool, never cut. */
  lump_baht?: number;
}
interface TrackSettlement { months?: MonthSettlement[]; people?: PersonSettlement[] }
/** What the budget can and cannot pay for, from the server's own settlement. */
interface Settlement {
  regular?: TrackSettlement;
  special?: TrackSettlement;
  unpaid_months?: string[];
  partial_months?: string[];
  /** Months inside partial_months where a WHOLE budget pool was paid nothing
   *  while another was paid — "ได้บางส่วน" is true of the course and a lie to
   *  everyone on the empty pool, so those months get named per pool. */
  track_unpaid_months?: { year_month: string; zero_tracks: string[] }[];
  dropped_baht: number;
  spilled_baht?: number;
  over_budget: boolean;
}
/** committed = what approval has already spent · forecast = plus everything logged. */
interface SettlementView {
  committed: Settlement;
  forecast: Settlement;
  /** Which cutting rule the figures above were produced under. */
  settlement_mode: "chronological" | "spread";
  /** The same forecast under the OTHER rule — so the choice can be compared
   *  before it is made rather than after. */
  alternative_forecast?: Settlement;
  can_change_mode: boolean;
  locked_months?: string[];
  /** "finance_sent" = nobody may change it · "staff_reviewed" = staff only. */
  lock_reason?: "finance_sent" | "staff_reviewed";
  /** Exported months whose claim documents would need downloading again. */
  reexport_months?: string[];
}

/** Total paid per month across both pools — what a TA on this course actually
 *  sees arrive, which is the number the lecturer is choosing between. */
const MODE_LABEL: Record<string, string> = {
  chronological: "จ่ายเรียงตามวัน",
  spread: "เฉลี่ยทุกเดือน",
};
const MODE_BLURB: Record<string, string> = {
  chronological: "จ่ายเต็มไล่ตามเดือนจนงบหมด ส่วนที่ขาดตกอยู่ที่เดือนท้ายเทอม",
  spread: "หักทุกเดือนเป็นสัดส่วนเท่ากัน ส่วนที่ขาดกระจายทุกเดือน",
};

const bahtOf = (n: number) => `฿${Math.round(n).toLocaleString()}`;

/** "2026-06" → "มิ.ย. 69". The comparison table has four columns and the delta
 *  is the one worth reading; full month names pushed it off a phone screen. */
function shortMonthTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_TH_SHORT[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

const LEVEL_LABEL: Record<string, string> = { undergrad: "ป.ตรี", master: "ป.โท", phd: "ป.เอก" };

/** One TA's figures merged across both pools, month by month. */
interface PersonMonthly {
  ta_id: string;
  name: string;
  levels: string[];
  /** year_month → { paid, work } summed over pools. */
  months: Map<string, { paid: number; work: number }>;
  /** Per pool, for the expanded row. */
  tracks: { track: string; label: string; person: PersonSettlement }[];
  lump: number;
  paid: number;
  work: number;
}

/** Merge the two pools' people lists into one row per TA. */
function peopleOf(s?: Settlement): PersonMonthly[] {
  const byTA = new Map<string, PersonMonthly>();
  for (const [track, label] of [["regular", "ภาคปกติ"], ["special", "ภาคพิเศษ"]] as const) {
    const t = track === "regular" ? s?.regular : s?.special;
    for (const p of t?.people ?? []) {
      let row = byTA.get(p.ta_id);
      if (!row) {
        row = { ta_id: p.ta_id, name: p.name, levels: [], months: new Map(), tracks: [], lump: 0, paid: 0, work: 0 };
        byTA.set(p.ta_id, row);
      }
      if (p.level && !row.levels.includes(p.level)) row.levels.push(p.level);
      row.tracks.push({ track, label, person: p });
      for (const m of p.months ?? []) {
        const cur = row.months.get(m.year_month) ?? { paid: 0, work: 0 };
        cur.paid += m.paid_baht;
        cur.work += m.baht;
        row.months.set(m.year_month, cur);
      }
      row.lump += p.lump_baht ?? 0;
      row.paid += p.paid_baht + (p.lump_baht ?? 0);
      row.work += p.baht + (p.lump_baht ?? 0);
    }
  }
  return [...byTA.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

/** How many months leave somebody (in either pool) with nothing. */
function strandedMonths(people: PersonMonthly[], months: string[]): number {
  let n = 0;
  for (const m of months) {
    const stranded = people.some(p => p.tracks.some(({ person }) => {
      const row = person.months?.find(x => x.year_month === m);
      return !!row && row.baht > 0 && row.paid_baht <= 0;
    }));
    if (stranded) n++;
  }
  return n;
}

/** ควรได้ / เบิกได้ of one pool, lumps included — the figures the choice is about. */
function poolTotals(t?: TrackSettlement): { work: number; paid: number } {
  let work = 0, paid = 0;
  for (const p of t?.people ?? []) {
    work += p.baht + (p.lump_baht ?? 0);
    paid += p.paid_baht + (p.lump_baht ?? 0);
  }
  return { work, paid };
}

/**
 * What every TA on the course will be paid, per month — the ONE table on this
 * page about money, and, when the budget is short, the place the lecturer
 * chooses the rule as well.
 *
 * It used to be two tables: this one, and a "ส่วนที่ขาดตกอยู่ที่เดือนใด" month
 * table inside the rule-choice panel. Two tables of the same months with
 * different rows left the lecturer unsure which to read (11/09/2026), so the
 * choice moved in here: the rule cards switch what this table shows, and the
 * table answers "แต่ละคนขาดยังไง ถ้าเลือกแบบเฉลี่ยแล้วเป็นยังไง" directly.
 *
 * Reads the same settlement the payout and the claim documents are built from,
 * so nothing here can differ from the figure that reaches the TA. Each row
 * opens to show the pool split (ภาคปกติ / ภาคพิเศษ / เหมาจ่าย), because a TA on
 * both tracks is paid from two budgets that can run out at different points.
 */
function MonthlyPayPanel({ tcId }: { tcId: string }) {
  const key = tcId ? `/teaching-courses/${tcId}/budget-settlement` : null;
  const { data, mutate: refresh } = useSWR<SettlementView>(key);
  // "approved" = money the approvals have already committed; "forecast" = plus
  // everything still logged. Forecast by default: it is the number the
  // lecturer is deciding on while approving.
  const [basis, setBasis] = useState<"forecast" | "committed">("forecast");
  // The rule the table is showing. null = the rule the course is set to.
  const [viewMode, setViewMode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Loading: the panel's own title with placeholder rows, so the queue below
  // doesn't get pushed down when the figures land. (A course with no one to
  // pay still ends with no panel — that is decided by the data.)
  if (!data) {
    return (
      <Panel className="mb-3" title="ค่าตอบแทน TA รายเดือน" description={<SkelValue className="h-3 w-56" />}>
        <SkelRows rows={3} columns={5} />
      </Panel>
    );
  }

  const current = data.settlement_mode;
  const other = current === "spread" ? "chronological" : "spread";
  const shortForecast = !!data.forecast?.over_budget && !!data.alternative_forecast;
  const showing = viewMode && viewMode !== current && shortForecast ? other : current;
  // The alternative is only computed as a forecast; viewing "approved only"
  // under the other rule is not on offer, so the toggle falls back.
  const source: Settlement | undefined =
    showing === other ? data.alternative_forecast
    : basis === "committed" ? data.committed : data.forecast;
  const people = peopleOf(source);
  if (!people.length) return null;
  const months = Array.from(new Set(people.flatMap(p => [...p.months.keys()]))).sort();
  const short = !!source?.over_budget;
  const totalPaid = people.reduce((t, p) => t + p.paid, 0);
  const totalWork = people.reduce((t, p) => t + p.work, 0);

  // Both rules against the same bill, for the cards: whose month goes to zero
  // and how much is short. The bill is identical under both — the same hours
  // at the same rates — which is exactly why it is on screen: without it the
  // two payouts look like two ways of paying everybody, and the shortfall is
  // nowhere.
  const peopleNow = peopleOf(data.forecast);
  const peopleThen = peopleOf(data.alternative_forecast);
  const forecastMonths = Array.from(new Set(peopleNow.flatMap(p => [...p.months.keys()]))).sort();
  const forecastWork = peopleNow.reduce((t, p) => t + p.work, 0);
  // The shortfall by pool. ภาคปกติ and ภาคพิเศษ are separate budgets, so "ขาด
  // ฿600" on its own hides which one ran out — and on SC362005 it is the special
  // pool alone, while the regular one has room to spare.
  const pools = [
    { label: "ภาคปกติ", ...poolTotals(data.forecast?.regular) },
    { label: "ภาคพิเศษ", ...poolTotals(data.forecast?.special) },
  ].filter(x => x.work > 0);
  const paidUnder = { [current]: peopleNow.reduce((t, p) => t + p.paid, 0), [other]: peopleThen.reduce((t, p) => t + p.paid, 0) };
  const zeroUnder = { [current]: strandedMonths(peopleNow, forecastMonths), [other]: strandedMonths(peopleThen, forecastMonths) };

  async function apply() {
    setBusy(true);
    try {
      await api.patch(`/teaching-courses/${tcId}/settlement-mode`, { settlement_mode: other });
      notify.success(
        data?.reexport_months?.length
          ? `เปลี่ยนเป็น “${MODE_LABEL[other]}” แล้ว กรุณาดาวน์โหลดใบเบิกใหม่`
          : `เปลี่ยนเป็น “${MODE_LABEL[other]}” แล้ว`,
      );
      setViewMode(null);
      await refresh();
    } catch (e) {
      notify.error(e, "เปลี่ยนวิธีแบ่งงบไม่สำเร็จ");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const cell = (paid: number, work: number, muted = false) => (
    <>
      <div className={`tabular-nums ${muted ? "text-muted" : ""}`}>
        {work <= 0 ? <span className="text-muted">–</span> : paid <= 0 ? <span className="text-red-700">ไม่ได้รับ</span> : bahtOf(paid)}
      </div>
      {work > 0 && work - paid >= 0.5 && (
        <div className="text-[11px] text-red-700">ควรได้ {bahtOf(work)}</div>
      )}
    </>
  );

  const seg = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  // One card per rule, the live one first. Clicking a card shows the table
  // under that rule; the button on the other card makes it the course's rule.
  const card = (mode: string) => {
    const inUse = mode === current;
    const viewing = mode === showing;
    return (
      <div
        key={mode}
        role="button"
        tabIndex={0}
        aria-pressed={viewing}
        onClick={() => setViewMode(mode)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewMode(mode); } }}
        className={`flex cursor-pointer flex-col rounded-xl border p-3.5 transition ${
          viewing ? "border-accent bg-accent-soft/40" : "border-(--hairline) bg-surface hover:bg-surface-secondary/60"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{MODE_LABEL[mode]}</span>
          {inUse && <Chip tone="info">ใช้อยู่</Chip>}
          {viewing && !inUse && <Chip tone="neutral">กำลังดู</Chip>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{MODE_BLURB[mode]}</p>
        <div className="mt-2.5 mb-auto text-sm">
          {zeroUnder[mode] > 0 ? (
            <span className="font-semibold text-red-700">มี {zeroUnder[mode]} เดือนที่บางคนไม่ได้รับค่าตอบแทน</span>
          ) : (
            <span className="font-semibold text-emerald-700">ทุกคนได้รับค่าตอบแทนทุกเดือน</span>
          )}
          <div className="mt-0.5 text-xs text-muted">
            เบิกได้รวม <span className="tabular-nums font-medium text-foreground">{bahtOf(paidUnder[mode])}</span>
            {" · "}ขาด <span className="tabular-nums font-medium text-red-700">{bahtOf(forecastWork - paidUnder[mode])}</span>
          </div>
        </div>
        {!inUse && data.can_change_mode && (
          // Wrapped so the press does not also count as a click on the card.
          <div className="mt-3 self-stretch" onClick={e => e.stopPropagation()}>
            <Button size="sm" fullWidth disabled={busy} onPress={() => setConfirming(true)}>
              ใช้วิธีนี้
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Panel
      className="mb-3"
      title="ค่าตอบแทน TA รายเดือน"
      description={
        short
          ? `ยอดที่แต่ละคนจะได้รับจริงในแต่ละเดือน ตามวิธี “${MODE_LABEL[showing]}”${showing !== current ? " (กำลังดูเปรียบเทียบ ยังไม่ได้ใช้)" : ""}`
          : "งบพอ ทุกคนได้รับเต็มตามชั่วโมงที่อนุมัติ"
      }
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {seg(basis === "forecast" && showing === current, () => { setBasis("forecast"); setViewMode(null); }, "รวมที่รอพิจารณา")}
          {seg(basis === "committed" && showing === current, () => { setBasis("committed"); setViewMode(null); }, "เฉพาะที่อนุมัติแล้ว")}
          {shortForecast && seg(showing === other, () => setViewMode(other), `ถ้าใช้ “${MODE_LABEL[other]}”`)}
        </div>
      }
    >
      {shortForecast && (
        <div className="mb-4 border-b border-(--hairline) pb-4">
          <div className="mb-2 text-sm font-semibold">วิธีแบ่งงบให้ TA</div>
          {/* The shortfall, pool by pool. The two budgets run out at different
              points, so the total alone cannot say which one is short. */}
          <div className="mb-3 overflow-x-auto rounded-lg bg-surface-secondary px-3.5 py-2.5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 pr-3 text-left font-medium">งบ</th>
                  <th className="py-1 pr-3 text-right font-medium">ควรได้</th>
                  <th className="py-1 pr-3 text-right font-medium">เบิกได้</th>
                  <th className="py-1 text-right font-medium">ขาด</th>
                </tr>
              </thead>
              <tbody>
                {pools.map(x => (
                  <tr key={x.label}>
                    <td className="py-1 pr-3">{x.label}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{bahtOf(x.work)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{bahtOf(x.paid)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {x.work - x.paid >= 0.5
                        ? <span className="font-semibold text-red-700">{bahtOf(x.work - x.paid)}</span>
                        : <span className="text-emerald-700">พอ</span>}
                    </td>
                  </tr>
                ))}
                {pools.length > 1 && (
                  <tr className="border-t border-(--hairline) font-semibold">
                    <td className="py-1 pr-3">รวม</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{bahtOf(forecastWork)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{bahtOf(paidUnder[current])}</td>
                    <td className="py-1 text-right tabular-nums text-red-700">{bahtOf(forecastWork - paidUnder[current])}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-1.5 text-xs text-muted">
              การเปลี่ยนวิธีไม่ทำให้ส่วนที่ขาดลดลง เลือกได้เพียงว่าจะให้ตกอยู่ที่เดือนใด — กดที่วิธีเพื่อดูตารางตามวิธีนั้น
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {card(current)}
            {card(other)}
          </div>

          {/* Two different closures with two different answers: one the lecturer
              can act on by asking staff, one nobody can act on without the
              administrator. */}
          {!data.can_change_mode && (
            <p className="mt-3 rounded-lg bg-surface-secondary px-3 py-2 text-xs text-muted">
              {data.lock_reason === "staff_reviewed" ? (
                <>เจ้าหน้าที่ตรวจสอบเดือน {(data.locked_months ?? []).join(", ")} แล้ว จึงเปลี่ยนวิธีไม่ได้
                หากต้องการเปลี่ยน กรุณาติดต่อเจ้าหน้าที่</>
              ) : (
                <>เดือน {(data.locked_months ?? []).join(", ")} ส่งการเงินแล้ว จึงเปลี่ยนวิธีไม่ได้
                หากจำเป็น กรุณาให้ผู้ดูแลระบบปลดล็อกก่อน</>
              )}
            </p>
          )}

          <ConfirmDialog
            open={confirming}
            title={`เปลี่ยนเป็น “${MODE_LABEL[other]}”?`}
            message={
              (data.reexport_months?.length
                ? `เดือน ${data.reexport_months.join(", ")} ส่งออกใบเบิกแล้ว หลังเปลี่ยนต้องดาวน์โหลดใบเบิกใหม่ — `
                : "") +
              "TA ทุกคนในวิชานี้จะได้รับแจ้งเตือน ยอดรายเดือนจะเปลี่ยนตามตารางด้านล่าง " +
              "เปลี่ยนกลับได้จนกว่าจะมีเดือนใดส่งการเงิน"
            }
            confirmLabel="เปลี่ยน"
            isPending={busy}
            onConfirm={apply}
            onClose={() => setConfirming(false)}
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1.5 pr-3 text-left font-medium">TA</th>
              {months.map(m => (
                <th key={m} className="py-1.5 pr-3 text-right font-medium whitespace-nowrap">{shortMonthTH(m)}</th>
              ))}
              <th className="py-1.5 text-right font-medium">รวม</th>
            </tr>
          </thead>
          <tbody>
            {people.map(p => {
              // A person on one pool is one line. On two, the pools are shown
              // under the total rather than folded away: which budget a month
              // came from is the thing the lecturer is here to see.
              const split = p.tracks.length > 1 || p.tracks.some(t => t.person.lump_baht);
              return (
                <Fragment key={p.ta_id}>
                  <tr className="border-t border-(--hairline) align-top">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{p.name || "TA"}</span>
                        {p.levels.map(l => <Chip key={l} tone="neutral">{LEVEL_LABEL[l] ?? l}</Chip>)}
                        {!split && p.tracks[0] && (
                          <span className="text-xs text-muted">{p.tracks[0].label}</span>
                        )}
                      </div>
                    </td>
                    {months.map(m => {
                      const v = p.months.get(m);
                      return <td key={m} className="py-2 pr-3 text-right">{cell(v?.paid ?? 0, v?.work ?? 0)}</td>;
                    })}
                    <td className="py-2 text-right font-semibold">{cell(p.paid, p.work)}</td>
                  </tr>
                  {split && p.tracks.map(({ track, label, person }) => (
                    <tr key={track} className="text-xs align-top">
                      <td className="py-1 pl-6 pr-3 text-muted">
                        {label}
                        {person.lump_baht ? " · เหมาจ่ายรายเทอม" : ""}
                      </td>
                      {months.map(m => {
                        const mm = person.months?.find(x => x.year_month === m);
                        return (
                          <td key={m} className="py-1 pr-3 text-right">
                            {mm ? cell(mm.paid_baht, mm.baht, true) : <span className="text-muted">–</span>}
                          </td>
                        );
                      })}
                      <td className="py-1 text-right">
                        {person.lump_baht
                          ? <span className="tabular-nums">{bahtOf(person.lump_baht)}</span>
                          : cell(person.paid_baht, person.baht, true)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-(--hairline) font-semibold align-top">
              <td className="py-2 pr-3">รวมทุกคน</td>
              {months.map(m => {
                const paid = people.reduce((t, p) => t + (p.months.get(m)?.paid ?? 0), 0);
                const work = people.reduce((t, p) => t + (p.months.get(m)?.work ?? 0), 0);
                return <td key={m} className="py-2 pr-3 text-right">{cell(paid, work)}</td>;
              })}
              <td className="py-2 text-right">{cell(totalPaid, totalWork)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        ยอดตรงกับช่อง “ขอเบิกจ่ายเพียง” ในใบเบิก
        {short && " · เมื่องบไม่พอ ทุกคนถูกหักเป็นสัดส่วนเท่ากัน ปัดลงเป็นบาทเต็ม"}
      </p>

    </Panel>
  );
}

/**
 * Budget state for the course, in the lecturer's own terms.
 *
 * Approving no longer refuses when the money runs out — the budget decides
 * which MONTHS get paid instead (budget_settlement.go). That makes an early,
 * plain warning the only thing standing between the lecturer and a TA who
 * finds out on payday, so it names the months rather than quoting a shortfall.
 */
function BudgetNotice({ tcId }: { tcId: string }) {
  const key = tcId ? `/teaching-courses/${tcId}/budget-settlement` : null;
  const { data } = useSWR<SettlementView>(key);
  // Read the FORECAST, not the settled figure. By the time approved spending
  // crosses the line the lecturer has already approved months that will not be
  // paid — warning then is warning after the fact.
  if (!data) return null;
  const view = data.forecast;
  if (!view?.over_budget) return null;
  const unpaid = view.unpaid_months ?? [];
  const zeroed = view.track_unpaid_months ?? [];
  // Months whose only trouble is "paid part of their worth" — the ones named
  // per pool below say something sharper and would otherwise be said twice.
  const zeroedMonths = new Set(zeroed.map(z => z.year_month));
  const partial = (view.partial_months ?? []).filter(m => !zeroedMonths.has(m));
  if (!unpaid.length && !partial.length && !zeroed.length) return null;
  // Three different pieces of news, and saying the wrong one is how a TA finds
  // out on payday that the screen lied to them. "ไม่ได้รับเลย" is the whole
  // course; "ภาคพิเศษไม่ได้รับเลย" is one pool emptied while the other was paid
  // in full; "ได้ไม่เต็มจำนวน" is everyone short by the same proportion.
  const what = [
    partial.length ? `${partial.map(formatMonthTH).join(", ")} ได้ไม่เต็มจำนวน` : "",
    ...zeroed.map(z =>
      `${formatMonthTH(z.year_month)} ${z.zero_tracks.map(t => TRACK_LABEL[t] ?? t).join("และ")}ไม่ได้รับเลย`),
    unpaid.length ? `${unpaid.map(formatMonthTH).join(", ")} ไม่ได้รับค่าตอบแทน` : "",
  ].filter(Boolean).join(" และ");
  // Already committed vs still avoidable changes what the lecturer can do about
  // it, so the two are worded differently rather than sharing one alarm.
  const committed = data?.committed?.over_budget;
  // The concurrent-section rule already moved what it could from the special
  // pool into the regular one. Saying so keeps the lecturer from asking whether
  // the other pool's leftover was overlooked.
  const spilled = view.spilled_baht ?? 0;
  return (
    <>
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-900">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold">
            {committed
              ? `งบรายวิชาไม่พอแล้ว ${what}`
              : `ถ้าอนุมัติครบตามที่ TA ลงไว้ งบจะไม่พอ ${what}`}
          </div>
          <div className="mt-0.5 text-red-900/85">
            อนุมัติได้ตามปกติ ชั่วโมงบันทึกไว้ครบ แต่ส่วนที่เกินงบ ฿{Math.round(view.dropped_baht).toLocaleString()} จะไม่ถูกนำไปเบิก
            {spilled > 0 && (
              <> (นำงบภาคพิเศษที่เหลือ ฿{Math.round(spilled).toLocaleString()} มาช่วยคาบที่สอนร่วมกันแล้ว)</>
            )}
          </div>
        </div>
      </div>
      {/* The choice of rule lives with the per-person table above (MonthlyPayPanel):
          one table, switchable between the two rules, is the whole decision. */}
    </>
  );
}

function MonthTable({ weeks, showSections }: { weeks: WeekGroup[]; showSections: boolean }) {
  const cols = showSections ? 7 : 6;
  return (
    <div className="overflow-x-auto border-t border-(--hairline)">
      <table className="w-full min-w-[560px] text-sm sm:min-w-0">
        <thead className="border-b border-(--hairline) text-xs text-muted">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 text-left font-medium">วันที่</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">เวลา</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">ชม.</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">กิจกรรม</th>
            {showSections && (
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Sec</th>
            )}
            <th className="px-3 py-2 text-left font-medium">หมายเหตุ</th>
            <th className="whitespace-nowrap px-4 py-2 text-left font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--hairline)">
          {weeks.map(wk => (
            <Fragment key={wk.key}>
              {/* ป้ายสัปดาห์ — จงใจให้จาง เป็นตัวคั่นสายตา ไม่ใช่หัวข้อเด่น */}
              <tr>
                <td colSpan={cols} className="px-4 pt-2 pb-0.5 text-[11px] text-muted">
                  {wk.label} · <span className="tabular">{wk.hours.toFixed(1)} ชม.</span>
                </td>
              </tr>
              {wk.items.map(r => {
                const activityLabel = ACTIVITY_LABEL[r.activity] ?? r.activity;
                const parentKindLabel =
                  r.activity === "other" && (r.parent_kind === "lecture" || r.parent_kind === "lab")
                    ? ` (${PARENT_KIND_LABEL[r.parent_kind]})`
                    : "";
                // แถวที่ไม่ได้อยู่ในรอบพิจารณานี้ทำให้จาง เพื่อให้สายตาไปที่รายการที่กำลังตัดสิน
                const dim = r.status !== "submitted";
                return (
                  <tr key={r.id} className={dim ? "text-muted" : ""}>
                    <td className="whitespace-nowrap px-4 py-2">{formatWorkDate(r.work_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular">{hhmm(r.start_time)}–{hhmm(r.end_time)}</td>
                    <td className="px-3 py-2 text-right tabular">{r.hours.toFixed(1)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{activityLabel}{parentKindLabel}</td>
                    {showSections && (
                      <td className="whitespace-nowrap px-3 py-2 tabular text-xs">
                        {r.sections.join(", ")}
                      </td>
                    )}
                    <td className="px-3 py-2">{r.note ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <StatusChip status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ประวัติการอนุมัติ                                                            */
/* -------------------------------------------------------------------------- */

// ApprovalHistoryPanel shows every approve/reject action taken on this
// course, newest first — not just the viewer's own (see actor_name/role).
// Each entry expands to the frozen row snapshot the server captured at the
// moment of the action (ApprovalHistoryEntry.rows), so "ดูรายละเอียด" shows
// what was actually approved/rejected even if the live work_logs have since
// changed — it isn't a live re-query into the assignment.
function formatHistoryAt(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const diff = Date.now() - t.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  // Older than a week — show the calendar date instead of a stale relative.
  const d = t.getDate();
  const m = t.getMonth() + 1;
  const y = t.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

/** "ดูรายละเอียด" body for one history entry — literally MonthTable, the
 *  same detail view the pending queue already uses (decided 11/09/2026: one
 *  detail design on this page, not a second one that looks different). The
 *  snapshot rows just need reshaping into the Sitting[] that view expects. */
function HistoryRowDetail({
  entry,
}: { entry: ApprovalHistoryEntry }) {
  const status = entry.action === "worklog.approve" ? "approved" : "rejected";
  const sittings: Sitting[] = entry.rows.map((r, i) => ({
    id: `${entry.id}-${i}`,
    assignment_id: entry.assignment_id,
    work_date: r.work_date,
    start_time: r.start_time,
    end_time: r.end_time,
    hours: r.hours,
    activity: r.activity,
    parent_kind: r.parent_kind,
    note: r.note,
    status,
    sections: [],
    assignmentIds: [entry.assignment_id],
  }));
  // One "อนุมัติทุกเดือน" batch spans however many months the TA had waiting
  // — for CP410872 that was June through October in one entry. Dropping all
  // of it straight into week groups left the reader with no month anchor at
  // all, just an unbroken run of weeks. Same two-level split the review table uses
  // for the pending queue: month first, then MonthTable's own week grouping
  // inside each one.
  const byMonth = new Map<string, Sitting[]>();
  for (const s of sittings) {
    const k = monthKey(s.work_date);
    const arr = byMonth.get(k);
    if (arr) arr.push(s);
    else byMonth.set(k, [s]);
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="divide-y divide-(--hairline)">
      {months.map(([mk, items]) => {
        const hours = items.reduce((s, i) => s + (i.hours || 0), 0);
        return (
          <div key={mk}>
            <div className="flex items-baseline gap-2 bg-surface-secondary px-4 py-1.5">
              <span className="text-xs font-semibold">{formatMonthTH(mk)}</span>
              <span className="tabular text-xs text-muted">
                {items.length} รายการ · {hours.toFixed(1)} ชม.
              </span>
            </div>
            <MonthTable weeks={groupByWeek(items)} showSections={false} />
          </div>
        );
      })}
    </div>
  );
}

function ApprovalHistoryPanel({
  history, loading,
}: {
  history: ApprovalHistoryEntry[] | undefined;
  loading: boolean;
}) {
  const count = history?.length ?? 0;
  // Folded away when there is nothing in it — an empty history used to occupy
  // half the screen underneath the queue that is the reason for the visit. Once
  // there IS history it opens, because "what did I already decide" is the
  // question this panel exists to answer.
  //
  // null means "nobody has said" — the default then follows the data, and a
  // click pins it either way. A plain boolean could not express that, and would
  // have to guess before the fetch lands.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const show = userOpen ?? count > 0;
  // Which single entry's row snapshot is expanded, if any.
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <Panel padded={false} data-tour="rep-history">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setUserOpen(!show)}
          aria-expanded={show}
          className="-mx-1 flex flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-surface-secondary"
        >
          <ChevronDown
            size={14}
            className={`shrink-0 text-muted transition-transform ${show ? "" : "-rotate-90"}`}
          />
          <History size={15} className="text-muted" />
          <span className="text-sm font-medium">ประวัติการอนุมัติ</span>
          <span className="text-xs text-muted">
            {loading ? <SkelValue className="h-3 w-20" /> : count > 0 ? `${count} รายการล่าสุด` : "ยังไม่มี"}
          </span>
        </button>
      </div>
      {show && !loading && count > 0 && (
        <ul className="divide-y divide-(--hairline) border-t border-(--hairline)">
          {history!.map(h => {
            const approved = h.action === "worklog.approve";
            const trackTH = h.track === "special" ? "พิเศษ" : "ปกติ";
            const hasRows = h.rows.length > 0;
            const rowsOpen = openId === h.id;
            const rowsHours = h.rows.reduce((s, r) => s + (r.hours || 0), 0);
            return (
              <li key={h.id}>
                <div
                  role={hasRows ? "button" : undefined}
                  tabIndex={hasRows ? 0 : undefined}
                  onClick={hasRows ? () => setOpenId(rowsOpen ? null : h.id) : undefined}
                  onKeyDown={hasRows ? e => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(rowsOpen ? null : h.id); }
                  } : undefined}
                  className={`flex items-start gap-3 px-4 py-3 ${hasRows ? "cursor-pointer hover:bg-surface-secondary" : ""}`}
                >
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                      approved
                        ? "bg-success-soft text-success-soft-foreground border border-success-soft-border"
                        : "bg-danger-soft text-danger-soft-foreground border border-danger-soft-border"
                    }`}
                  >
                    {approved ? <Check size={12} /> : <X size={12} />}
                    {approved ? "อนุมัติ" : "ส่งกลับ"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{h.ta_name}</span>
                      <span className="text-muted"> · sec {h.sec_no} ({trackTH})</span>
                      {hasRows && (
                        <span className="text-muted"> · {h.rows.length} รายการ ({rowsHours.toFixed(1)} ชม.)</span>
                      )}
                    </div>
                    {/* Who did it — not necessarily the viewer. Staff/admin can
                        act on a course they don't teach, so this is the only
                        place the lecturer learns it happened at all. */}
                    {h.actor_name && (
                      <div className="mt-0.5 text-xs text-muted">
                        โดย {h.actor_name}
                        {h.actor_role && h.actor_role !== "lecturer" && (
                          <span className="ml-1 rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium">
                            {ACTOR_ROLE_TH[h.actor_role] ?? h.actor_role}
                          </span>
                        )}
                      </div>
                    )}
                    {!approved && h.note && (
                      <div className="mt-1 whitespace-pre-wrap rounded border border-warning-soft-border bg-warning-soft px-2 py-1 text-xs text-warning-soft-foreground">
                        เหตุผล: {h.note}
                      </div>
                    )}
                    {hasRows && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <ChevronDown size={12} className={`transition-transform ${rowsOpen ? "" : "-rotate-90"}`} />
                        ดูรายละเอียด
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted" title={new Date(h.at).toLocaleString("th-TH")}>
                    {formatHistoryAt(h.at)}
                  </div>
                </div>
                {/* The frozen snapshot from the moment of the action — not a
                    live re-query, so it stays correct even if these work_log
                    rows are later edited or deleted. Same MonthTable the
                    pending queue uses, not a second detail design. */}
                {rowsOpen && hasRows && (
                  <HistoryRowDetail entry={h} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {show && !loading && count === 0 && (
        <div className="border-t border-(--hairline) px-4 py-6 text-center text-xs text-muted">
          เมื่อคุณกดอนุมัติหรือส่งกลับให้ TA แก้ไข รายการจะปรากฏที่นี่
        </div>
      )}
    </Panel>
  );
}
