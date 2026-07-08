"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown } from "@heroui/react";
import { Bell, BellRing } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui";

interface Notif {
  id: string;
  title: string;
  body: string;
  link?: string;
  read_at?: string;
  created_at: string;
}

// Notification bell for TA users. Sits in the top-right header (left of the
// avatar). The red dot only reflects unread system notifications — the
// onboarding reminder ("submit documents / build schedule") lives in the
// persistent bottom-right OnboardingBlocker instead, so those two signals
// don't compete for attention.
export default function NotificationBell() {
  const router = useRouter();
  const { data } = useSWR<Notif[]>("/me/notifications?limit=10");
  const list = data ?? [];

  const unreadCount = list.filter(n => !n.read_at).length;
  const showDot = unreadCount > 0;

  async function markRead(id: string) {
    try {
      await api.post(`/me/notifications/${id}/read`);
      mutate((k: string) => k.startsWith("/me/notifications"));
    } catch {}
  }

  return (
    <Dropdown>
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label={showDot ? `การเตือน ${unreadCount} รายการ` : "การเตือน"}
        className="relative"
      >
        {showDot ? <BellRing size={18} /> : <Bell size={18} />}
        {showDot && (
          <span
            aria-hidden
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none"
          >
            {unreadCount}
          </span>
        )}
      </Button>

      <Dropdown.Popover className="min-w-[320px] max-w-[380px]">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">การเตือน</div>
          <Link href="/ta/notifications" className="text-xs text-accent hover:underline">
            ดูทั้งหมด
          </Link>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">
              ยังไม่มีการเตือน
            </div>
          ) : (
            list.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read_at) markRead(n.id);
                  if (n.link) router.push(n.link);
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
