"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  Check, X, Eye, AlertTriangle, Users, FileCheck2, CalendarCheck2, BookOpenCheck,
  Clock, CheckCircle2, XCircle, ListFilter,
} from "lucide-react";
import { Tabs } from "@heroui/react";
import { api, type Term } from "../../lib/api";
import {
  PageHeader, Panel, Button, Modal, TextArea, FieldGroup, Alert, Chip, TabLabel,
} from "../../components/ui";
import { DataTable, type DataColumn, type DataFilter } from "../../components/DataTable";

interface Item {
  id: string; course_code: string; course_name: string;
  status: string; submitted_at?: string; decided_at?: string;
  reject_reason?: string;
  teaching_course_id: string;
  lecturer_name: string; ta_count: number;
  term_id: string;
  academic_year: number;
  semester: number;
}

const SEMESTER_LABEL: Record<number, string> = { 1: "ภาคต้น", 2: "ภาคปลาย", 3: "ภาคฤดูร้อน" };
const STATUS_META: Record<string, { tone: "success" | "warn" | "danger" | "info" | "neutral"; label: string }> = {
  submitted: { tone: "info",    label: "รออนุมัติ" },
  approved:  { tone: "success", label: "อนุมัติแล้ว" },
  rejected:  { tone: "danger",  label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
  draft:     { tone: "neutral", label: "ฉบับร่าง" },
};

interface AssignmentDetail {
  section_no: string;
  ta_id: string;
  ta_name: string;
  email: string;
  student_id?: string;
  level: string;
  total_hrs: number;
  profile_status: string;
  has_schedule: boolean;
  approved_course_count: number;
  warnings: string[];
}

interface RequestDetail extends Item {
  reimburse_scope: string;
  counts: { section_no: string; undergrad_count: number; graduate_count: number }[] | null;
  assignments: AssignmentDetail[] | null;
}

const LEVEL_LABEL: Record<string, string> = { undergrad: "ป.ตรี", master: "ป.โท", phd: "ป.เอก" };
const SCOPE_LABEL: Record<string, string> = { lecture: "เฉพาะบรรยาย", lab: "เฉพาะปฏิบัติการ", both: "บรรยาย + ปฏิบัติการ" };

export default function ApprovalsPage() {
  // Staff view: fetch everything so decided requests stay visible as history;
  // the status filter (default "รออนุมัติ") narrows the day-to-day workload.
  const { data } = useSWR<Item[]>("/ta-requests");
  const { data: terms } = useSWR<Term[]>("/terms");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Tab-based status filter — replaces the dropdown so the counts + queue are
  // obvious at a glance.
  const [statusTab, setStatusTab] = useState<"submitted" | "approved" | "rejected" | "all">("submitted");

  // Distinct academic years / semesters that actually appear in the pending
  // list. If none appear (empty queue) we still show the active term as a
  // default so the filters aren't empty on first load.
  const activeTerm = terms?.find(t => t.is_active);
  const rows = data ?? [];
  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.academic_year));
    if (activeTerm) set.add(activeTerm.academic_year);
    return [...set].sort((a, b) => b - a);
  }, [rows, activeTerm]);
  const semesterOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.semester));
    if (activeTerm) set.add(activeTerm.semester);
    return [...set].sort();
  }, [rows, activeTerm]);

  const filters = useMemo<DataFilter<Item>[]>(() => [
    {
      id: "year",
      placeholder: "ทุกปีการศึกษา",
      options: [
        { id: "", label: "ทุกปีการศึกษา" },
        ...yearOptions.map(y => ({
          id: String(y),
          label: `${y}${activeTerm?.academic_year === y ? " (active)" : ""}`,
        })),
      ],
      predicate: (r, v) => String(r.academic_year) === v,
    },
    {
      id: "semester",
      placeholder: "ทุกภาคเรียน",
      options: [
        { id: "", label: "ทุกภาคเรียน" },
        ...semesterOptions.map(s => ({
          id: String(s),
          label: `${SEMESTER_LABEL[s] ?? `ภาค ${s}`}${activeTerm?.semester === s ? " (active)" : ""}`,
        })),
      ],
      predicate: (r, v) => String(r.semester) === v,
    },
  ], [yearOptions, semesterOptions, activeTerm]);

  // Default the filters to the active term the first time we know what it is,
  // per the user's requirement. If the staff later clears them, we leave them
  // alone — no clobbering after the first apply.
  const [initialFilterValues, setInitialFilterValues] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (initialFilterValues || !activeTerm) return;
    setInitialFilterValues({
      year: String(activeTerm.academic_year),
      semester: String(activeTerm.semester),
    });
  }, [activeTerm, initialFilterValues]);

  // Per-tab counts so the tab labels double as a queue indicator.
  const counts = useMemo(() => ({
    submitted: rows.filter(r => r.status === "submitted").length,
    approved:  rows.filter(r => r.status === "approved").length,
    rejected:  rows.filter(r => r.status === "rejected").length,
    all:       rows.length,
  }), [rows]);

  const visibleRows = useMemo(
    () => statusTab === "all" ? rows : rows.filter(r => r.status === statusTab),
    [rows, statusTab],
  );

  async function approve(id: string) {
    setErr(null); setBusyId(id);
    try {
      await api.post(`/ta-requests/${id}/approve`);
      setDetailId(null);
      mutate("/ta-requests");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ");
    } finally { setBusyId(null); }
  }
  async function confirmReject(id: string, reason: string) {
    setErr(null); setBusyId(id);
    try {
      await api.post(`/ta-requests/${id}/reject`, { reason });
      setRejectId(null); setDetailId(null);
      mutate("/ta-requests");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปฏิเสธไม่สำเร็จ");
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader
        title="อนุมัติคำขอ TA"
        description={(() => {
          if (!data) return "กำลังโหลด…";
          const pending = data.filter(r => r.status === "submitted").length;
          return pending > 0
            ? `รอ ${pending} คำขอ · ทั้งหมด ${data.length} รายการ`
            : `ทั้งหมด ${data.length} รายการ (ไม่มีที่รออนุมัติ)`;
        })()}
      />

      {err && (
        <div className="mb-4">
          <Alert status="danger" icon={<AlertTriangle size={16} />} title="ดำเนินการไม่สำเร็จ" description={err} />
        </div>
      )}

      <Panel padded={false}>
        <Tabs
          selectedKey={statusTab}
          onSelectionChange={k => setStatusTab(k as typeof statusTab)}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="กรองตามสถานะ" className="px-4 pt-2">
              <Tabs.Tab id="submitted">
                <TabLabel icon={<Clock size={14} />} count={counts.submitted} active={statusTab === "submitted"}>
                  รออนุมัติ
                </TabLabel>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="approved">
                <TabLabel icon={<CheckCircle2 size={14} />} count={counts.approved} active={statusTab === "approved"}>
                  อนุมัติแล้ว
                </TabLabel>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="rejected">
                <TabLabel icon={<XCircle size={14} />} count={counts.rejected} active={statusTab === "rejected"}>
                  ปฏิเสธ
                </TabLabel>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="all">
                <TabLabel icon={<ListFilter size={14} />} count={counts.all} active={statusTab === "all"}>
                  ทั้งหมด
                </TabLabel>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="p-4">
          <DataTable
            ariaLabel={`คำขอ TA — ${statusTab === "all" ? "ทั้งหมด" : STATUS_META[statusTab]?.label ?? statusTab}`}
            rows={data ? visibleRows : undefined}
            loading={!data}
            rowKey={r => r.id}
            searchFn={r => `${r.course_code} ${r.course_name} ${r.lecturer_name}`}
            searchPlaceholder="ค้นหารหัสวิชา / ชื่อวิชา / อาจารย์…"
            filters={filters}
            initialFilterValues={initialFilterValues ?? undefined}
            initialSort={{ column: "submitted_at", direction: statusTab === "submitted" ? "ascending" : "descending" }}
            emptyTitle={
              statusTab === "submitted" ? "ไม่มีคำขอที่รออนุมัติ"
              : statusTab === "approved" ? "ยังไม่มีคำขอที่อนุมัติ"
              : statusTab === "rejected" ? "ยังไม่มีคำขอที่ถูกปฏิเสธ"
              : "ยังไม่มีคำขอ"
            }
            emptyDescription={
              statusTab === "submitted"
                ? "เมื่ออาจารย์ส่งคำขอ TA จะแสดงที่นี่"
                : undefined
            }
            columns={approvalColumns(setDetailId, setRejectId, statusTab === "all")}
          />
        </div>
      </Panel>

      <DetailModal
        id={detailId}
        busy={busyId === detailId}
        onClose={() => setDetailId(null)}
        onApprove={approve}
        onReject={id => setRejectId(id)}
      />

      <RejectModal
        id={rejectId}
        busy={busyId === rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function approvalColumns(
  onDetail: (id: string) => void,
  onReject: (id: string) => void,
  showStatus: boolean,
): DataColumn<Item>[] {
  const cols: DataColumn<Item>[] = [
    {
      id: "course_code", label: "รหัสวิชา", sortable: true, isRowHeader: true,
      sortValue: r => r.course_code,
      className: "font-medium tabular-nums",
      render: r => r.course_code,
    },
    {
      id: "course_name", label: "ชื่อวิชา", sortable: true,
      sortValue: r => r.course_name,
      render: r => r.course_name,
    },
    {
      id: "lecturer", label: "อาจารย์", sortable: true,
      sortValue: r => r.lecturer_name,
      className: "text-(--ink-3)",
      render: r => r.lecturer_name,
    },
    {
      id: "term", label: "ปีการศึกษา / ภาคเรียน", sortable: true,
      sortValue: r => r.academic_year * 10 + r.semester,
      className: "whitespace-nowrap tabular text-(--ink-3)",
      render: r => `${r.academic_year} · ${SEMESTER_LABEL[r.semester] ?? `ภาค ${r.semester}`}`,
    },
    {
      id: "ta_count", label: "TA",
      render: r => <Chip tone="brand">{r.ta_count} คน</Chip>,
    },
    {
      id: "submitted_at", label: "ส่งเมื่อ", sortable: true,
      sortValue: r => r.submitted_at ?? "",
      className: "text-(--ink-3) text-xs whitespace-nowrap",
      render: r => r.submitted_at ? new Date(r.submitted_at).toLocaleString("th-TH") : "-",
    },
    {
      id: "actions", label: <span className="sr-only">การจัดการ</span>,
      className: "text-right",
      render: r => (
        <div className="inline-flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onDetail(r.id)}>
            <Eye size={14} /> {r.status === "submitted" ? "ตรวจสอบ" : "ดู"}
          </Button>
          {r.status === "submitted" && (
            <Button variant="danger-soft" size="sm" onClick={() => onReject(r.id)}>
              <X size={14} /> ปฏิเสธ
            </Button>
          )}
        </div>
      ),
    },
  ];
  if (showStatus) {
    // Insert the status column only on the "ทั้งหมด" tab — otherwise the tab
    // itself already tells the reader what status they're looking at.
    cols.splice(cols.length - 2, 0, {
      id: "status", label: "สถานะ", sortable: true,
      sortValue: r => STATUS_META[r.status]?.label ?? r.status,
      render: r => {
        const m = STATUS_META[r.status] ?? { tone: "neutral" as const, label: r.status };
        return <Chip tone={m.tone}>{m.label}</Chip>;
      },
    });
  }
  return cols;
}

/* -------------------------------------------------------------------------- */
/* Detail modal — full review before approving                                 */
/* -------------------------------------------------------------------------- */

function DetailModal({
  id, busy, onClose, onApprove, onReject,
}: {
  id: string | null;
  busy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { data: d, isLoading } = useSWR<RequestDetail>(id ? `/ta-requests/${id}` : null);
  const assignments = d?.assignments ?? [];
  const hasBlockers = assignments.some(a => a.warnings.length > 0);
  const decidable = d?.status === "submitted";

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={decidable ? "ตรวจสอบคำขอ TA" : "ประวัติคำขอ TA"}
      icon={<BookOpenCheck size={18} />}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="text-xs text-(--ink-3)">
            {decidable && hasBlockers && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertTriangle size={12} /> มีเงื่อนไขไม่ผ่าน — อนุมัติไม่ได้
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>ปิด</Button>
            {decidable && (
              <>
                <Button variant="danger-soft" onClick={() => id && onReject(id)} disabled={busy}>
                  <X size={14} /> ปฏิเสธ
                </Button>
                <Button
                  variant="primary"
                  onClick={() => id && onApprove(id)}
                  disabled={busy || isLoading || hasBlockers}
                  isPending={busy}
                >
                  <Check size={14} /> อนุมัติ
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {!d ? (
        <div className="py-10 text-center text-sm text-(--ink-3)">กำลังโหลด…</div>
      ) : (
        <div className="space-y-4">
          {/* Course header */}
          <div className="rounded-lg border border-(--hairline) bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{d.course_code} — {d.course_name}</span>
              {(() => {
                const m = STATUS_META[d.status] ?? { tone: "neutral" as const, label: d.status };
                return <Chip tone={m.tone}>{m.label}</Chip>;
              })()}
            </div>
            <div className="text-xs text-(--ink-3) mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>อาจารย์: {d.lecturer_name}</span>
              <span>ปีการศึกษา: {d.academic_year} · {SEMESTER_LABEL[d.semester] ?? `ภาค ${d.semester}`}</span>
              <span>เบิก: {SCOPE_LABEL[d.reimburse_scope] ?? d.reimburse_scope}</span>
              {d.submitted_at && <span>ส่งเมื่อ: {new Date(d.submitted_at).toLocaleString("th-TH")}</span>}
              {d.decided_at && <span>พิจารณาเมื่อ: {new Date(d.decided_at).toLocaleString("th-TH")}</span>}
            </div>
            {d.reject_reason && (
              <div className="mt-2 text-xs rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                <b>เหตุผลปฏิเสธ:</b> {d.reject_reason}
              </div>
            )}
            {(d.counts?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.counts!.map(c => (
                  <Chip key={c.section_no} tone="neutral">
                    Sec {c.section_no}: ตรี {c.undergrad_count} · โท/เอก {c.graduate_count}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* Per-TA cards */}
          <div>
            <div className="text-xs font-medium text-(--ink-2) mb-2 flex items-center gap-1.5">
              <Users size={13} /> รายชื่อผู้ช่วยสอน ({assignments.length})
            </div>
            <div className="space-y-2">
              {assignments.map((a, i) => (
                <TaCard key={`${a.ta_id}-${a.section_no}-${i}`} a={a} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TaCard({ a }: { a: AssignmentDetail }) {
  const blocked = a.warnings.length > 0;
  const overLimit = a.approved_course_count >= 3;
  return (
    <div className={
      "rounded-lg border px-3 py-2.5 " +
      (blocked ? "border-red-200 bg-red-50/50" : "border-(--hairline) bg-white")
    }>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{a.ta_name}</span>
        <span className="text-xs text-(--ink-3)">{a.email}{a.student_id ? ` · ${a.student_id}` : ""}</span>
        <Chip tone="neutral">Sec {a.section_no}</Chip>
        <Chip tone={a.level === "undergrad" ? "neutral" : "brand"}>{LEVEL_LABEL[a.level] ?? a.level}</Chip>
        <Chip tone="neutral">{a.total_hrs.toFixed(1)} ชม./สัปดาห์</Chip>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <StatusBadge
          ok={a.profile_status === "approved"}
          icon={<FileCheck2 size={11} />}
          okText="เอกสารผ่านแล้ว"
          badText="เอกสารยังไม่ผ่าน"
        />
        <StatusBadge
          ok={a.has_schedule}
          icon={<CalendarCheck2 size={11} />}
          okText="บันทึกตารางเรียนแล้ว"
          badText="ยังไม่บันทึกตารางเรียน"
        />
        <span className={
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
          (overLimit
            ? "bg-red-50 text-red-700 border-red-200 font-medium"
            : "bg-slate-50 text-slate-600 border-slate-200")
        }>
          <BookOpenCheck size={11} /> เป็น TA แล้ว {a.approved_course_count}/3 วิชา
        </span>
      </div>

      {blocked && (
        <ul className="mt-2 space-y-1">
          {a.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({
  ok, icon, okText, badText,
}: { ok: boolean; icon: React.ReactNode; okText: string; badText: string }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
      (ok
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-700 border-red-200 font-medium")
    }>
      {icon} {ok ? okText : badText}
    </span>
  );
}

function RejectModal({
  id, busy, onClose, onConfirm,
}: { id: string | null; busy: boolean; onClose: () => void; onConfirm: (id: string, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!id} onClose={onClose} title="ระบุเหตุผลการปฏิเสธ"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={() => id && onConfirm(id, reason)}
          disabled={!reason.trim() || busy} isPending={busy}>ยืนยัน</Button>
      </>}
    >
      <FieldGroup label="เหตุผล (บังคับ)">
        <TextArea rows={4} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="อธิบายเหตุผลให้อาจารย์เข้าใจ…" />
      </FieldGroup>
    </Modal>
  );
}
