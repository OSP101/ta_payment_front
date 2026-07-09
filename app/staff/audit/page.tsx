"use client";
import useSWR from "swr";
import { useMemo } from "react";
import { PageHeader, Chip } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

interface Row {
  id: number; at: string;
  actor_id?: string; actor_role?: string;
  action: string; entity: string; entity_id?: string;
  ip?: string; note?: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้บริหาร",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
};

const columns: DataColumn<Row>[] = [
  {
    id: "at", label: "เวลา", sortable: true, isRowHeader: true,
    sortValue: r => r.at,
    className: "whitespace-nowrap font-mono text-xs",
    render: r => new Date(r.at).toLocaleString("th-TH"),
  },
  {
    id: "actor", label: "ผู้กระทำ",
    render: r => (
      <span className="font-mono text-xs">
        {r.actor_role
          ? <Chip tone="neutral">{ROLE_LABEL[r.actor_role] ?? r.actor_role}</Chip>
          : <span className="text-(--ink-4)">-</span>}
        {r.actor_id && <span className="ml-2 text-(--ink-3)">{r.actor_id.slice(0, 8)}</span>}
      </span>
    ),
  },
  {
    id: "action", label: "Action", sortable: true,
    sortValue: r => r.action,
    className: "font-mono text-xs text-(--brand)",
    render: r => r.action,
  },
  {
    id: "entity", label: "Entity",
    className: "font-mono text-xs",
    render: r => <>{r.entity} <span className="text-(--ink-4)">{r.entity_id?.slice(0, 8) ?? ""}</span></>,
  },
  {
    id: "ip", label: "IP",
    className: "font-mono text-xs text-(--ink-3)",
    render: r => r.ip ?? "-",
  },
  {
    id: "note", label: "Note",
    className: "font-mono text-xs text-(--ink-3)",
    render: r => r.note ?? "",
  },
];

export default function AuditPage() {
  const { data } = useSWR<Row[]>("/audit-logs?limit=200");

  const entityOptions = useMemo(() => {
    const entities = [...new Set((data ?? []).map(r => r.entity))].sort();
    return [
      { id: "", label: "ทุก entity" },
      ...entities.map(e => ({ id: e, label: e })),
    ];
  }, [data]);

  return (
    <div>
      <PageHeader title="Audit Log" description={`${data?.length ?? 0} รายการล่าสุด`} />
      <DataTable
        ariaLabel="Audit log"
        rows={data}
        loading={!data}
        rowKey={r => r.id}
        searchFn={r => `${r.action} ${r.entity} ${r.entity_id ?? ""} ${r.actor_id ?? ""} ${r.ip ?? ""} ${r.note ?? ""}`}
        searchPlaceholder="ค้นหา action / entity / IP / note…"
        filters={[
          {
            id: "role",
            placeholder: "ทุกบทบาท",
            options: [
              { id: "", label: "ทุกบทบาท" },
              { id: "admin", label: "ผู้บริหาร" },
              { id: "staff", label: "เจ้าหน้าที่" },
              { id: "lecturer", label: "อาจารย์" },
              { id: "ta", label: "ผู้ช่วยสอน" },
            ],
            predicate: (r, v) => r.actor_role === v,
          },
          {
            id: "entity",
            placeholder: "ทุก entity",
            options: entityOptions,
            predicate: (r, v) => r.entity === v,
          },
        ]}
        initialSort={{ column: "at", direction: "descending" }}
        pageSize={20}
        emptyTitle="ไม่มี log"
        columns={columns}
      />
    </div>
  );
}
