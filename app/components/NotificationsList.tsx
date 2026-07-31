"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bell, Check, CheckCheck } from "lucide-react";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { PageHeader, Panel, EmptyState, Button } from "./ui";

interface Notif {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
}

// Shared UI for the "การเตือน" page — driven by /me/notifications so it works
// for every role. Wrap it in a role-specific page component (e.g. /ta uses
// this with a role-specific banner via `header` prop).
export default function NotificationsList({
  title = "การเตือน",
  description = "ข่าวสารและการแจ้งเตือนสำหรับคุณ",
  header,
}: {
  title?: string;
  description?: string;
  header?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const key = tab === "unread"
    ? "/me/notifications?limit=100&unread=1"
    : "/me/notifications?limit=100";
  const { data } = useSWR<Notif[]>(key);
  const list = data ?? [];

  async function markRead(id: string) {
    try {
      await api.post(`/me/notifications/${id}/read`);
      mutate((k) => typeof k === "string" && k.startsWith("/me/notifications"));
    } catch (e) {
      notify.error(e);
    }
  }

  async function markAll() {
    try {
      await api.post(`/me/notifications/read-all`);
      mutate((k) => typeof k === "string" && k.startsWith("/me/notifications"));
      notify.success("ทำเครื่องหมายอ่านทั้งหมดแล้ว");
    } catch (e) {
      notify.error(e);
    }
  }

  return (
    <div>
      <PageHeader title={title} description={description} />
      {header}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`chip cursor-pointer transition ${tab === "all" ? "chip-brand" : "chip-neutral"}`}
        >
          ทั้งหมด
        </button>
        <button
          type="button"
          onClick={() => setTab("unread")}
          className={`chip cursor-pointer transition ${tab === "unread" ? "chip-brand" : "chip-neutral"}`}
        >
          ยังไม่อ่าน
        </button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onPress={markAll} disabled={list.every(n => n.read_at)}>
          <CheckCheck size={13} /> อ่านทั้งหมด
        </Button>
      </div>

      <Panel padded={false}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Bell size={28} />}
            title={tab === "unread" ? "ไม่มีการเตือนที่ยังไม่อ่าน" : "ยังไม่มีการเตือน"}
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
                    <div className="text-xs text-muted mt-0.5 whitespace-pre-wrap">{n.body}</div>
                    <div className="text-[11px] text-muted mt-1 tabular">
                      {formatDate(n.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.read_at && (
                      <Button variant="ghost" size="sm" onPress={() => markRead(n.id)}>
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
    // An unparseable timestamp does NOT throw: `new Date()` yields an Invalid
    // Date whose toLocaleString returns the literal string "Invalid Date", so
    // the catch below never fires and that text renders straight into the row.
    // Fall back to the raw value instead — it at least shows what arrived.
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("th-TH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
