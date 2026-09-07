"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AlertCircle, Eye, Ban } from "lucide-react";
import { Tooltip, Button } from "@heroui/react";
import { Chip, Modal, ConfirmDialog } from "../components/ui";
import { DataTable, type DataColumn } from "../components/DataTable";
import { api } from "../lib/api";
import { notify } from "../lib/notify";

export interface TARequestRow {
  id: string;
  course_code: string;
  course_name: string;
  teaching_course_id?: string;
  status: string;
  reject_reason?: string;
  submitted_at?: string;
  decided_at?: string;
  ta_count?: number;
  is_late?: boolean;
  /** Sections whose sessions partly clash with the TA's own timetable. */
  trimmed_count?: number;
  /** Sections the TA lost entirely for the same reason. */
  dropped_count?: number;
  /** Server's own verdict on whether Cancel would currently succeed. */
  can_cancel?: boolean;
}

/** One row of /ta-requests/:id — who was actually sent in this round. */
interface RequestAssignmentDetail {
  section_no: string;
  ta_name: string;
  email: string;
  level: string;
  total_hrs: number;
  state: string;
  state_reason?: string;
}
interface RequestDetail extends TARequestRow {
  reimburse_scope: string;
  assignments: RequestAssignmentDetail[] | null;
}

const STATUS_MAP: Record<string, { tone: "success" | "warn" | "danger" | "info" | "neutral"; label: string }> = {
  approved:  { tone: "success", label: "อนุมัติแล้ว" },
  submitted: { tone: "info",    label: "ส่งแล้ว · รออนุมัติ" },
  pending:   { tone: "warn",    label: "รอดำเนินการ" },
  draft:     { tone: "neutral", label: "ฉบับร่าง" },
  rejected:  { tone: "danger",  label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([k, v]) => [k, v.label]),
);

export function RequestStatusChip({ status }: { status: string }) {
  const m = STATUS_MAP[status] ?? { tone: "neutral" as const, label: status };
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

function thDate(iso?: string): string {
  return iso
    ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : "-";
}

function buildColumns(
  onDetail: (id: string) => void,
  onCancel: (id: string) => void,
): DataColumn<TARequestRow>[] { return [
  {
    id: "submitted_at", label: "วันที่ยื่นคำขอ", sortable: true, isRowHeader: true,
    sortValue: r => r.submitted_at ?? "",
    className: "whitespace-nowrap",
    render: r => thDate(r.submitted_at),
  },
  {
    id: "ta_count", label: "จำนวน TA",
    render: r => <Chip tone="brand">{r.ta_count ?? 0} คน</Chip>,
  },
  {
    id: "status", label: "สถานะ", sortable: true,
    sortValue: r => STATUS_LABEL[r.status] ?? r.status,
    render: r => (
      <div className="flex flex-wrap items-center gap-1.5">
        <RequestStatusChip status={r.status} />
        {/* การส่งมี 2 แบบเท่านั้น — ทันเวลา หรือ ช้า (ช้า = เบิกจ่ายช้าตาม) */}
        {r.is_late
          ? <Chip tone="warn">ส่งช้า</Chip>
          : <Chip tone="success">ส่งทันเวลา</Chip>}
        {/* "อนุมัติแล้ว" on its own would hide the fact that the TA's own
            timetable removed some sessions. Say it on the row. */}
        {(r.trimmed_count ?? 0) > 0 && (
          <Chip tone="warn">ตัดบางคาบ {r.trimmed_count} กลุ่ม</Chip>
        )}
        {(r.dropped_count ?? 0) > 0 && (
          <Chip tone="danger">ตัดออก {r.dropped_count} กลุ่ม</Chip>
        )}
      </div>
    ),
  },
  {
    id: "decided_at", label: "วันที่พิจารณา",
    className: "whitespace-nowrap text-muted",
    render: r => thDate(r.decided_at),
  },
  {
    id: "reason", label: "หมายเหตุ",
    className: "w-16 text-center",
    render: r => r.reject_reason
      ? (
        <Tooltip delay={0}>
          <Button
            isIconOnly
            variant="tertiary"
            size="sm"
            aria-label="ดูเหตุผล"
            className="text-red-600 hover:bg-red-50"
          >
            <AlertCircle size={16} />
          </Button>
          <Tooltip.Content className="max-w-xs text-xs whitespace-pre-line">
            {r.reject_reason}
          </Tooltip.Content>
        </Tooltip>
      )
      : <span className="text-xs text-muted">-</span>,
  },
  {
    id: "actions", label: "", className: "w-20 text-center",
    render: r => (
      <div className="flex items-center justify-center gap-1">
        <Tooltip delay={0}>
          <Button
            isIconOnly variant="tertiary" size="sm" aria-label="ดูรายละเอียด"
            onPress={() => onDetail(r.id)}
          >
            <Eye size={16} />
          </Button>
          <Tooltip.Content className="text-xs">ดูรายละเอียด — ใครถูกส่งไปในรอบนี้บ้าง</Tooltip.Content>
        </Tooltip>
        {r.can_cancel && (
          <Tooltip delay={0}>
            <Button
              isIconOnly variant="tertiary" size="sm" aria-label="ยกเลิกคำขอ"
              className="text-red-600 hover:bg-red-50"
              onPress={() => onCancel(r.id)}
            >
              <Ban size={16} />
            </Button>
            <Tooltip.Content className="text-xs">ยกเลิกคำขอนี้</Tooltip.Content>
          </Tooltip>
        )}
      </div>
    ),
  },
]; }

const LEVEL_LABEL: Record<string, string> = {
  undergrad: "ปริญญาตรี", master: "ปริญญาโท", phd: "ปริญญาเอก",
};

const STATE_LABEL: Record<string, { tone: "success" | "warn" | "danger"; label: string }> = {
  active:  { tone: "success", label: "ทำงานได้ตามปกติ" },
  trimmed: { tone: "warn",    label: "ตัดบางคาบ" },
  dropped: { tone: "danger",  label: "ตัดออกทั้งกลุ่ม" },
};

/** One TA plus every section they were sent on, grouped from the flat per-section rows. */
interface GroupedAssignment {
  ta_name: string;
  email: string;
  level: string;
  sections: RequestAssignmentDetail[];
}

/** The API returns one row per (TA, section) — group by TA so a person who
 * covers several sections shows up once, with their sections listed inside,
 * instead of repeating their name once per section. */
function groupByTa(list: RequestAssignmentDetail[]): GroupedAssignment[] {
  const byEmail = new Map<string, GroupedAssignment>();
  for (const a of list) {
    const key = a.email || a.ta_name;
    const g = byEmail.get(key);
    if (g) g.sections.push(a);
    else byEmail.set(key, { ta_name: a.ta_name, email: a.email, level: a.level, sections: [a] });
  }
  return [...byEmail.values()];
}

/** Who was actually sent in this round — opened from the history table. */
function RequestDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: d } = useSWR<RequestDetail>(id ? `/ta-requests/${id}` : null);
  const grouped = d?.assignments?.length ? groupByTa(d.assignments) : [];
  return (
    <Modal open={!!id} onClose={onClose} title="รายละเอียดคำขอ" icon={<Eye size={18} />} size="lg">
      {!d ? (
        <div className="text-sm text-muted py-6 text-center">กำลังโหลด…</div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestStatusChip status={d.status} />
            <span className="text-muted">{thDate(d.submitted_at)}</span>
          </div>
          {d.reject_reason && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 whitespace-pre-line">
              {d.reject_reason}
            </div>
          )}
          {!grouped.length ? (
            <div className="text-xs text-muted text-center py-6">ไม่มีรายชื่อ TA ในคำขอนี้</div>
          ) : (
            <ul className="space-y-2">
              {grouped.map((g, i) => (
                <li key={i} className="rounded-lg border border-hairline p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-ink-1">{g.ta_name}</div>
                    <Chip tone="neutral">{LEVEL_LABEL[g.level] ?? g.level}</Chip>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{g.email}</div>
                  <ul className="mt-2 space-y-1.5">
                    {g.sections.map((a, j) => {
                      const st = STATE_LABEL[a.state];
                      return (
                        <li key={j} className="rounded-md bg-slate-50 border border-hairline px-2.5 py-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-ink-2">
                              กลุ่ม {a.section_no} · {a.total_hrs.toFixed(1)} ชม./สัปดาห์
                            </span>
                            {st && <Chip tone={st.tone}>{st.label}</Chip>}
                          </div>
                          {a.state_reason && (
                            <div className="text-xs text-amber-700 mt-1">{a.state_reason}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function RequestsTable({
  rows, loading, emptyDescription = "เริ่มจากปุ่ม 'ส่งคำขอ TA'",
}: {
  rows: TARequestRow[] | undefined;
  loading?: boolean;
  emptyDescription?: string;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function doCancel() {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await api.post(`/ta-requests/${cancelId}/cancel`);
      notify.success("ยกเลิกคำขอเรียบร้อยแล้ว");
      mutate("/ta-requests");
      mutate(`/ta-requests/${cancelId}`);
      // Cancelling frees the TA's slot on this course — the candidates list
      // (already_in_course/at_quota) is keyed by teaching_course_id, which
      // this table doesn't know, so match every candidates key rather than
      // one. Otherwise the picker keeps showing the TA as blocked until some
      // unrelated fetch happens to revalidate it.
      mutate(key => typeof key === "string" && key.startsWith("/ta-requests/candidates"));
      setCancelId(null);
    } catch (e) {
      notify.error(e);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <DataTable
        ariaLabel="ประวัติคำขอ TA"
        rows={rows}
        loading={loading}
        rowKey={r => r.id}
        searchFn={r => `${STATUS_LABEL[r.status] ?? r.status} ${r.reject_reason ?? ""}`}
        searchPlaceholder="ค้นหาสถานะ / เหตุผล…"
        filters={[{
          id: "status",
          placeholder: "ทุกสถานะ",
          // Derive from the full STATUS_MAP so every status (incl. cancelled /
          // pending) is filterable — not just a hardcoded subset.
          options: [
            { id: "", label: "ทุกสถานะ" },
            ...Object.entries(STATUS_MAP).map(([id, v]) => ({ id, label: v.label })),
          ],
          predicate: (r, v) => r.status === v,
        }]}
        initialSort={{ column: "submitted_at", direction: "descending" }}
        pageSize={10}
        emptyTitle="ยังไม่มีคำขอ"
        emptyDescription={emptyDescription}
        columns={buildColumns(setDetailId, setCancelId)}
      />
      <RequestDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={!!cancelId}
        onClose={() => { if (!cancelling) setCancelId(null); }}
        onConfirm={doCancel}
        title="ยกเลิกคำขอ TA นี้?"
        message="โควตาของ TA ในคำขอนี้จะถูกคืน และคำขอนี้จะยกเลิกถาวร หากต้องการ TA คนเดิมอีกครั้ง ต้องส่งคำขอใหม่"
        confirmLabel="ยืนยันยกเลิก"
        danger
        isPending={cancelling}
      />
    </>
  );
}
