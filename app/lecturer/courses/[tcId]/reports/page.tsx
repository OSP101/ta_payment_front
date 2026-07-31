"use client";
import useSWR, { mutate } from "swr";
import { Fragment, use, useMemo, useState } from "react";
import {
  Check, X, CircleAlert, ChevronDown, History, Link2, Users, CalendarCheck,
} from "lucide-react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, TextArea, FieldGroup, Alert, Spinner,
  Chip, StatusChip, type ChipTone,
} from "../../../../components/ui";

/**
 * One row of /reports/pending — an ASSIGNMENT (a TA on one section) that has
 * work-log rows awaiting review. A TA helping with two sections produces two
 * rows, which is why this screen groups by person before it shows anything.
 */
interface PendingRow {
  id: string;                    // assignment id
  ta_id: string;
  ta_name: string;
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
  first_date?: string;
  last_date?: string;
}
interface Course { id: string; code: string; name_th: string; }

// ApprovalHistoryEntry matches /teaching-courses/:id/approval-history — one
// approve/reject action the current lecturer has performed on a TA's
// worklog batch within this course.
interface ApprovalHistoryEntry {
  id: number;
  at: string;                     // ISO timestamp
  action: "worklog.approve" | "worklog.reject";
  assignment_id: string;
  ta_name: string;
  sec_no: string;
  track: string;
  note?: string;                  // reject reason; empty for approvals
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

function sittingKey(r: WorkLog, group: number | null | undefined): string {
  // Only rows in the same co-taught group may merge. Two sections that merely
  // happen to meet at the same hour are two sittings and two payments.
  return group == null
    ? `solo:${r.id}`
    : `g${group}|${r.work_date}|${r.start_time}|${r.end_time}`;
}

function mergeSittings(rows: WorkLog[], secOf: Map<string, PendingRow>): Sitting[] {
  const out = new Map<string, Sitting>();
  for (const r of rows) {
    const meta = secOf.get(r.assignment_id);
    const k = sittingKey(r, meta?.cotaught_group);
    const found = out.get(k);
    if (found) {
      if (meta?.sec_no && !found.sections.includes(meta.sec_no)) found.sections.push(meta.sec_no);
      if (!found.assignmentIds.includes(r.assignment_id)) found.assignmentIds.push(r.assignment_id);
      // A merged sitting counts as awaiting review while ANY of its copies is.
      // Approving one section and not the other leaves the day half-decided,
      // and the reviewer must still see it.
      if (r.status === "submitted") found.status = "submitted";
      continue;
    }
    out.set(k, {
      ...r,
      sections: meta?.sec_no ? [meta.sec_no] : [],
      assignmentIds: [r.assignment_id],
    });
  }
  return Array.from(out.values()).sort((a, b) =>
    a.work_date !== b.work_date
      ? a.work_date.localeCompare(b.work_date)
      : (a.start_time ?? "").localeCompare(b.start_time ?? ""));
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
  rows: PendingRow[];       // one per section
  /** Pending hours counted ONCE per sitting — what the payout will settle. */
  pendingHours: number;
  firstDate?: string;
  lastDate?: string;
  /** Section numbers that share a sitting, e.g. [["1","2"]]. */
  coTaught: string[][];
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
    const groups = new Map<string, number>();
    for (const r of list) {
      const k = r.cotaught_group == null ? `solo:${r.id}` : `g${r.cotaught_group}`;
      groups.set(k, r.group_hours ?? r.total_hours ?? 0);
    }
    const coTaught = new Map<number, string[]>();
    for (const r of list) {
      if (r.cotaught_group == null) continue;
      const arr = coTaught.get(r.cotaught_group) ?? [];
      arr.push(r.sec_no);
      coTaught.set(r.cotaught_group, arr);
    }
    const dates = list.flatMap(r => [r.first_date, r.last_date]).filter(Boolean) as string[];
    return {
      taId,
      name: list[0].ta_name,
      rows: [...list].sort((a, b) => a.sec_no.localeCompare(b.sec_no, undefined, { numeric: true })),
      pendingHours: Array.from(groups.values()).reduce((s, h) => s + h, 0),
      firstDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : undefined,
      lastDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
      coTaught: Array.from(coTaught.values())
        .filter(secs => secs.length > 1)
        .map(secs => secs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))),
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
  const { data: history, isLoading: historyLoading } = useSWR<ApprovalHistoryEntry[]>(historyKey);

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
      // One call per assignment: the endpoint is per-assignment, and a co-taught
      // month lives on two of them. Sequential rather than parallel so a refusal
      // on the second does not race the first's cache invalidation.
      for (const id of assignmentIds) {
        await api.post(`/assignments/${id}/worklog/${kind}`,
          kind === "approve" ? { year_month: ym } : { reason, year_month: ym });
      }
      notify.success(
        kind === "approve"
          ? `อนุมัติบันทึกเวลาเดือน${formatMonthTH(ym)} ของ ${g.name} แล้ว`
          : `ส่งกลับให้ ${g.name} แก้ไขเดือน${formatMonthTH(ym)} แล้ว`,
      );
      await Promise.all([
        mutate(PENDING_KEY),
        mutate(historyKey),
        // MonthRows fans out over its sections behind ONE composite key
        // (["worklogs", ...paths]), so invalidating the individual
        // /assignments/:id/worklog paths reaches nothing: the queue total and
        // the card header refreshed while the open table still showed every row
        // as "รอตรวจ". Match the composite keys instead.
        mutate(k => Array.isArray(k) && k[0] === "worklogs"),
      ]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  const totalHours = groups.reduce((s, g) => s + g.pendingHours, 0);

  return (
    <div>
      <PageHeader
        title="อนุมัติรายงานบันทึกเวลา TA"
        description={course ? `${course.code} — ${course.name_th}` : "รายการที่ TA กดส่งขออนุมัติ"}
      />

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
        <Panel>
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted">
            <Spinner />
            <div className="text-xs">กำลังโหลดข้อมูล…</div>
          </div>
        </Panel>
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
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Users size={14} className="text-muted" />
              รอคุณตรวจ {groups.length} คน
            </span>
            <span className="tabular text-muted">รวม {totalHours.toFixed(1)} ชม.</span>
          </div>

          <div className="flex flex-col gap-3">
            {groups.map(g => (
              <TACard
                key={g.taId}
                group={g}
                pendingKey={pendingKey}
                onDecide={(ym, ids, kind, reason) => decideMonth(g, ym, ids, kind, reason)}
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
          title="คาบเดียวกันถูกบันทึกไว้ทั้งสองเซคชัน ระบบจ่ายครั้งเดียว — ชั่วโมงจึงไม่บวกกัน"
        >
          <Link2 size={12} />
          sec {secs.join(" กับ ")} สอนพร้อมกัน — ชั่วโมงไม่บวกกัน
        </span>
      ))}
    </div>
  );
}

function TACard({
  group, pendingKey, onDecide,
}: {
  group: TAGroup;
  pendingKey: string | null;
  onDecide: (ym: string, assignmentIds: string[], kind: "approve" | "reject", reason?: string) => void;
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{group.name}</div>
          <div className="mt-1.5">
            <SectionChips group={group} />
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          <div className="tabular font-medium text-foreground">
            รอพิจารณา {group.pendingHours.toFixed(1)} ชม.
          </div>
          {group.firstDate && (
            <div className="mt-0.5">ส่งช่วง {dateRangeTH(group.firstDate, group.lastDate)}</div>
          )}
        </div>
      </div>

      <MonthRows
        group={group}
        openMonth={openMonth}
        onToggleMonth={k => setOpenMonth(openMonth === k ? null : k)}
        pendingKey={pendingKey}
        onDecide={onDecide}
      />
    </Panel>
  );
}

/**
 * The months of one TA, each its own decision.
 *
 * Every section's work-log is fetched (a TA on two sections has two), then the
 * co-taught copies are merged back into single sittings — see mergeSittings.
 */
function MonthRows({
  group, openMonth, onToggleMonth, pendingKey, onDecide,
}: {
  group: TAGroup;
  openMonth: string | null;
  onToggleMonth: (key: string) => void;
  pendingKey: string | null;
  onDecide: (ym: string, assignmentIds: string[], kind: "approve" | "reject", reason?: string) => void;
}) {
  // One SWR key per assignment. Hooks cannot be called in a loop, so the keys
  // are joined into one request through a fetcher that fans out.
  const keys = group.rows.map(r => `/assignments/${r.id}/worklog`);
  const { data: perAssignment, isLoading } = useSWR<WorkLog[][]>(
    keys.length ? ["worklogs", ...keys] : null,
    async ([, ...ks]: string[]) => Promise.all(ks.map(k => api.get<WorkLog[]>(k))),
  );

  const secOf = useMemo(() => {
    const m = new Map<string, PendingRow>();
    group.rows.forEach(r => m.set(r.id, r));
    return m;
  }, [group.rows]);

  const [rejectYm, setRejectYm] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const months = useMemo(() => {
    const sittings = mergeSittings((perAssignment ?? []).flat(), secOf);
    const buckets = new Map<string, Sitting[]>();
    for (const r of sittings) {
      const k = monthKey(r.work_date);
      if (!k) continue;
      const arr = buckets.get(k);
      if (arr) arr.push(r);
      else buckets.set(k, [r]);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => {
        const submitted = items.filter(i => i.status === "submitted");
        return {
          key,
          weeks: groupByWeek(items),
          count: items.length,
          submittedHours: submitted.reduce((s, i) => s + (i.hours || 0), 0),
          submittedCount: submitted.length,
          // Only the assignments that actually have something waiting this
          // month get a decision call — approving a section with nothing
          // submitted would be a no-op request and a confusing audit entry.
          assignmentIds: Array.from(new Set(submitted.flatMap(i => i.assignmentIds))),
        };
      });
  }, [perAssignment, secOf]);

  if (isLoading && !perAssignment) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-(--hairline) py-6 text-xs text-muted">
        <Spinner size="sm" /> กำลังโหลดรายการ…
      </div>
    );
  }
  if (months.length === 0) {
    return (
      <div className="border-t border-(--hairline) px-4 py-6 text-center text-xs text-muted">
        ยังไม่มีบันทึกเวลาของ TA คนนี้
      </div>
    );
  }

  return (
    <div className="border-t border-(--hairline)">
      {months.map(mo => {
        const busy = pendingKey === `${group.taId}|${mo.key}`;
        const actionable = mo.submittedCount > 0;
        const open = openMonth === mo.key;
        return (
          <div key={mo.key} className="border-b border-(--hairline) last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              {/* The month name is the disclosure; the buttons sit beside it so
                  a decision never needs the detail to be opened first.
                  basis-full below `sm`: squeezed onto one line on a phone the
                  label shrank under the buttons instead of wrapping, and the
                  hours ended up printed underneath "ส่งกลับ". */}
              <button
                type="button"
                onClick={() => onToggleMonth(mo.key)}
                aria-expanded={open}
                className="-mx-1 flex min-w-0 basis-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-secondary sm:flex-1 sm:basis-auto sm:flex-nowrap"
              >
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
                />
                <span className="text-sm font-medium">{formatMonthTH(mo.key)}</span>
                <span className="tabular whitespace-nowrap text-xs text-muted">
                  {actionable
                    ? `รอพิจารณา ${mo.submittedHours.toFixed(1)} ชม. · ${mo.submittedCount} คาบ`
                    : `${mo.count} คาบ · ตรวจครบแล้ว`}
                </span>
              </button>

              {actionable ? (
                <div className="ms-auto flex shrink-0 items-center gap-2">
                  <Button
                    variant="danger-soft" size="sm" disabled={busy}
                    onClick={() => { setRejectYm(rejectYm === mo.key ? null : mo.key); setReason(""); }}
                  >
                    <X size={14} /> ส่งกลับ
                  </Button>
                  <Button
                    variant="primary" size="sm" disabled={busy} isPending={busy}
                    onClick={() => onDecide(mo.key, mo.assignmentIds, "approve")}
                  >
                    <Check size={14} /> อนุมัติ
                  </Button>
                </div>
              ) : (
                <span className="ms-auto shrink-0">
                  <Chip tone="success">
                    <Check size={12} /> อนุมัติแล้ว
                  </Chip>
                </span>
              )}
            </div>

            {rejectYm === mo.key && (
              <div className="border-t border-(--hairline) bg-surface-secondary px-4 py-3">
                <FieldGroup label={`เหตุผลที่ส่งกลับ — ${formatMonthTH(mo.key)}`}>
                  <TextArea
                    rows={2}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="เช่น ชั่วโมงวันที่ 5 ไม่ตรงกับตารางสอน"
                  />
                </FieldGroup>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectYm(null)}>ยกเลิก</Button>
                  <Button
                    variant="danger" size="sm"
                    disabled={!reason.trim() || busy}
                    isPending={busy}
                    onClick={() => {
                      onDecide(mo.key, mo.assignmentIds, "reject", reason.trim());
                      setRejectYm(null);
                    }}
                  >
                    ส่งกลับให้แก้ไข
                  </Button>
                </div>
              </div>
            )}

            {open && <MonthTable weeks={mo.weeks} showSections={group.coTaught.length > 0 || group.rows.length > 1} />}
          </div>
        );
      })}
    </div>
  );
}

function MonthTable({ weeks, showSections }: { weeks: WeekGroup[]; showSections: boolean }) {
  const cols = showSections ? 7 : 6;
  return (
    <div className="overflow-x-auto border-t border-(--hairline)">
      <table className="w-full text-sm">
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

// ApprovalHistoryPanel shows the lecturer's own approve/reject actions for
// this course, newest first. Purely informational — the row isn't clickable
// (the underlying assignment might no longer have those exact rows anymore).
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

  return (
    <Panel padded={false}>
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
            {loading ? "กำลังโหลด…" : count > 0 ? `${count} รายการล่าสุด` : "ยังไม่มี"}
          </span>
        </button>
      </div>
      {show && !loading && count > 0 && (
        <ul className="divide-y divide-(--hairline) border-t border-(--hairline)">
          {history!.map(h => {
            const approved = h.action === "worklog.approve";
            const trackTH = h.track === "special" ? "พิเศษ" : "ปกติ";
            return (
              <li key={h.id} className="flex items-start gap-3 px-4 py-3">
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
                  </div>
                  {!approved && h.note && (
                    <div className="mt-1 whitespace-pre-wrap rounded border border-warning-soft-border bg-warning-soft px-2 py-1 text-xs text-warning-soft-foreground">
                      เหตุผล: {h.note}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted" title={new Date(h.at).toLocaleString("th-TH")}>
                  {formatHistoryAt(h.at)}
                </div>
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
