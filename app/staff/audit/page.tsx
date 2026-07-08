"use client";
import useSWR from "swr";
import { PageHeader, Panel, EmptyState, Chip } from "../../components/ui";

interface Row {
  id: number; at: string;
  actor_id?: string; actor_role?: string;
  action: string; entity: string; entity_id?: string;
  ip?: string; note?: string;
}

export default function AuditPage() {
  const { data } = useSWR<Row[]>("/audit-logs?limit=200");
  return (
    <div>
      <PageHeader title="Audit Log" description={`${data?.length ?? 0} รายการล่าสุด`} />
      <Panel padded={false}>
        {(!data || data.length === 0) ? (
          <EmptyState title="ไม่มี log" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้กระทำ</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {data.map(r => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{new Date(r.at).toLocaleString("th-TH")}</td>
                    <td>
                      {r.actor_role
                        ? <Chip tone="neutral">{r.actor_role}</Chip>
                        : <span className="text-[var(--ink-4)]">-</span>}
                      {r.actor_id && <span className="ml-2 text-[var(--ink-3)]">{r.actor_id.slice(0, 8)}</span>}
                    </td>
                    <td className="text-[var(--brand)]">{r.action}</td>
                    <td>{r.entity} <span className="text-[var(--ink-4)]">{r.entity_id?.slice(0, 8) ?? ""}</span></td>
                    <td className="text-[var(--ink-3)]">{r.ip ?? "-"}</td>
                    <td className="text-[var(--ink-3)]">{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
