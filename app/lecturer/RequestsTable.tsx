"use client";
import { AlertCircle } from "lucide-react";
import { Tooltip, Button } from "@heroui/react";
import { Chip } from "../components/ui";
import { DataTable, type DataColumn } from "../components/DataTable";

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

const columns: DataColumn<TARequestRow>[] = [
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
];

export function RequestsTable({
  rows, loading, emptyDescription = "เริ่มจากปุ่ม 'ส่งคำขอ TA'",
}: {
  rows: TARequestRow[] | undefined;
  loading?: boolean;
  emptyDescription?: string;
}) {
  return (
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
      columns={columns}
    />
  );
}
