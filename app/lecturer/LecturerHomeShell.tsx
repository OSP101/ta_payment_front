"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, Dropdown, Label, Link as HLink } from "@heroui/react";
import { ChevronDown, LogOut, HelpCircle, Megaphone } from "lucide-react";
import type { Me } from "../lib/api";
import { api } from "../lib/api";
import NotificationBell from "../components/NotificationBell";

export default function LecturerHomeShell({
  me, children,
}: { me: Me; children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    try { await api.post("/auth/logout"); } catch {}
    router.push("/login");
    router.refresh();
  }

  const initials = ((me.first_name?.[0] ?? "") + (me.last_name?.[0] ?? "")).toUpperCase() || "U";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border bg-surface flex items-center gap-3 px-4 md:px-8 shrink-0">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="TA Payment — ไปหน้าแรก"
            className="flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-secondary transition-colors"
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-accent-foreground font-bold text-sm bg-accent">
              T
            </div>
            <div className="font-semibold text-[15px] text-foreground leading-tight">
              TA Payment
            </div>
          </Link>
          <span className="hidden md:inline text-xs text-muted ms-2 border-l border-border ps-2">
            อาจารย์ผู้รับผิดชอบรายวิชา
          </span>
        </div>

        <div className="flex-1" />

        <HLink href="/announcements" className="hidden md:inline-flex text-sm">
          <Megaphone size={14} className="me-1" />
          ประกาศ
        </HLink>
        <HLink href="mailto:coco@kku.ac.th" className="hidden md:inline-flex text-sm">
          <HelpCircle size={14} className="me-1" />
          ศูนย์ช่วยเหลือ
        </HLink>

        <NotificationBell />

        <Dropdown>
          <Button variant="ghost" aria-label="User menu" className="!px-1.5 !gap-1.5">
            <Avatar>
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
            <ChevronDown size={14} />
          </Button>
          <Dropdown.Popover>
            <div className="px-3 py-2.5 border-b border-border">
              <div className="text-sm font-medium text-foreground truncate max-w-[220px]">
                {me.first_name} {me.last_name}
              </div>
              <div className="text-xs text-muted truncate max-w-[220px]">{me.email}</div>
            </div>
            <Dropdown.Menu onAction={(key: React.Key) => { if (key === "logout") logout(); }}>
              <Dropdown.Item id="logout" textValue="ออกจากระบบ" variant="danger">
                <LogOut className="size-4 shrink-0 text-danger" />
                <Label>ออกจากระบบ</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-[1200px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
