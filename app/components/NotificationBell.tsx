"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown } from "@heroui/react";
import { Bell, BellRing, Check } from "lucide-react";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { IconButton } from "./ui";

interface Notif {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
}

// Shared bell used in every role shell. Onboarding state (for un-approved TAs)
// is intentionally *not* driven by this component — that lives in the inline
// OnboardingChecklistCard on the TA home so the two signals don't compete.
export default function NotificationBell({
  seeAllHref = "/notifications",
}: {
  seeAllHref?: string;
}) {
  const router = useRouter();
  const { data } = useSWR<Notif[]>("/me/notifications?limit=10");
  const list = data ?? [];

  const unread = list.filter(n => !n.read_at);
  const show = unread.length > 0;

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
    <Dropdown>
      <IconButton
        variant="ghost"
        size="sm"
        label={show ? `การเตือน ${unread.length} รายการ` : "การเตือน"}
        className="relative"
      >
        {show ? <BellRing size={18} /> : <Bell size={18} />}
        {show && (
          <span
            aria-hidden
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none"
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </IconButton>

      <Dropdown.Popover className="w-[calc(100vw-1.5rem)] max-w-[380px] sm:w-auto sm:min-w-[320px]">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">การเตือน</div>
          <div className="flex items-center gap-1">
            {show && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-accent hover:underline inline-flex items-center gap-1"
              >
                <Check size={11} /> อ่านทั้งหมด
              </button>
            )}
            <Link href={seeAllHref} className="text-xs text-accent hover:underline ms-2">
              ดูทั้งหมด
            </Link>
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">ยังไม่มีการเตือน</div>
          ) : (
            list.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read_at) markRead(n.id);
                  // Only in-app paths go through the router; guard against
                  // absolute/external URLs which router.push rejects.
                  if (n.link) {
                    if (n.link.startsWith("/")) router.push(n.link);
                    else window.open(n.link, "_blank", "noopener");
                  }
                }}
                className="w-full text-start px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div
                    className={
                      "w-2 h-2 rounded-full mt-1.5 shrink-0 " +
                      (n.read_at ? "bg-transparent" : "bg-accent")
                    }
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className={"text-sm text-foreground " + (n.read_at ? "" : "font-medium")}>
                      {n.title}
                    </div>
                    <div className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</div>
                    <div className="text-[10px] text-muted mt-1">
                      {new Date(n.created_at).toLocaleString("th-TH", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </Dropdown.Popover>
    </Dropdown>
  );
}
