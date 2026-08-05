"use client";
import useSWR from "swr";
import { useMemo } from "react";
import { PageHeader, Chip, TipWrap } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

interface Row {
  id: number; at: string;
  actor_id?: string; actor_role?: string;
  action: string; entity: string; entity_id?: string;
  ip?: string; note?: string;
}

interface UserLite {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้บริหาร",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
};

function buildColumns(resolveActor: (id: string) => string | null): DataColumn<Row>[] {
  return [
    {
      id: "at", label: "เวลา", sortable: true, isRowHeader: true,
      sortValue: r => r.at,
      className: "whitespace-nowrap font-mono text-xs",
      render: r => new Date(r.at).toLocaleString("th-TH"),
    },
    {
      id: "actor", label: "ผู้กระทำ",
      render: r => {
        const name = r.actor_id ? resolveActor(r.actor_id) : null;
        return (
          <span className="text-xs">
            {r.actor_role
              ? <Chip tone="neutral">{ROLE_LABEL[r.actor_role] ?? r.actor_role}</Chip>
              : <span className="text-(--ink-4)">-</span>}
            {r.actor_id && (
              <TipWrap content={r.actor_id} className="ml-2 text-(--ink-3) font-mono">
                {name ?? r.actor_id.slice(0, 8)}
              </TipWrap>
            )}
          </span>
        );
      },
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
}

export default function AuditPage() {
  const { data, error, mutate: revalidate } = useSWR<Row[]>("/audit-logs?limit=200");
  // Best-effort actor resolution: if the users list is available, map the actor
  // UUID to a readable name. Failing that we fall back to the short UUID.
  const { data: users } = useSWR<{ items: UserLite[] }>("/users?limit=500");
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users?.items ?? []) {
      m.set(u.id, `${u.first_name} ${u.last_name}`.trim() || u.email);
    }
    return m;
  }, [users]);

  const columns = useMemo(
    () => buildColumns(id => nameById.get(id) ?? null),
    [nameById],
  );

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
      <div data-tour="audit-table">
      <DataTable
        ariaLabel="Audit log"
        rows={data}
        loading={!data && !error}
        error={error}
        onRetry={() => revalidate()}
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
    </div>
  );
}
