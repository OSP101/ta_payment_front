"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, Check } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, Panel, EmptyState, Button } from "../../components/ui";
import { useTAApproval } from "../TAGate";

interface Notif {
  id: string;
  title: string;
  body: string;
  link?: string;
  read_at?: string;
  created_at: string;
}

export default function NotificationsPage() {
  const { approved } = useTAApproval();
  const { data } = useSWR<Notif[]>("/me/notifications?limit=100");
  const list = data ?? [];

  async function markRead(id: string) {
    try {
      await api.post(`/me/notifications/${id}/read`);
      mutate((k: string) => k.startsWith("/me/notifications"));
    } catch {}
  }

  return (
    <div>
      <PageHeader
        title="การเตือน"
        description="ข่าวสารและการแจ้งเตือนสำหรับคุณ"
      />

      {!approved && (
        <Panel className="mb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">ยังไม่ได้ส่งเอกสาร</div>
              <div className="text-xs text-muted mt-0.5">
                กรอกข้อมูลและอัปโหลดเอกสารประกอบให้ครบ เพื่อปลดล็อกเมนูอื่น ๆ
              </div>
            </div>
            <Link href="/ta/documents">
              <Button variant="primary" size="sm">
                ไปที่เอกสาร <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </Panel>
      )}

      <Panel padded={false}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Bell size={28} />}
            title="ยังไม่มีการเตือน"
            description="ระบบจะแจ้งเตือนเมื่อมีข่าวสารสำคัญ"
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {list.map(n => (
              <li key={n.id}>
                <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors">
                  <div
                    className={
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 " +
                      (n.read_at
                        ? "bg-slate-100 text-muted"
                        : "bg-accent-soft text-accent-soft-foreground")
                    }
                  >
                    <Bell size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={"text-sm " + (n.read_at ? "text-muted" : "font-medium")}>
                      {n.title}
                    </div>
                    <div className="text-xs text-muted mt-0.5">{n.body}</div>
                    <div className="text-[11px] text-muted mt-1 tabular">
                      {formatDate(n.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.read_at && (
                      <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                        <Check size={13} /> อ่านแล้ว
                      </Button>
                    )}
                    {n.link && (
                      <Link href={n.link}>
                        <Button variant="ghost" size="sm">
                          เปิด <ArrowRight size={13} />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
