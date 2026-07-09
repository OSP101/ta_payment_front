"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, Dropdown, Label, Link as HLink } from "@heroui/react";
import { ChevronDown, LogOut, Megaphone } from "lucide-react";
import type { Me } from "../lib/api";
import { api } from "../lib/api";
import NotificationBell from "../components/NotificationBell";
import { roleLabel } from "../components/Shell";

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
  const fullName = [me.title, me.first_name, me.last_name].filter(Boolean).join(" ");
  const roleLbl = roleLabel(me.roles);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border bg-surface flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-8 shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/"
            aria-label="TA Payment — ไปหน้าแรก"
            className="flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-secondary transition-colors"
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-accent-foreground font-bold text-sm bg-accent shrink-0">
              T
            </div>
            <div className="font-semibold text-[15px] text-foreground leading-tight">
              TA Payment
            </div>
          </Link>
        </div>

        <div className="flex-1" />

        <HLink href="/announcements" className="hidden md:inline-flex text-sm">
          <Megaphone size={14} className="me-1" />
          ประกาศ
        </HLink>

        <NotificationBell />

        <Dropdown>
          <Button variant="ghost" aria-label="เมนูผู้ใช้" className="px-1.5! gap-2! h-auto! py-1!">
            <Avatar>
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
            <div className="hidden sm:flex flex-col items-start min-w-0 leading-tight">
              <span className="text-sm font-medium text-foreground truncate max-w-40 md:max-w-56">
                {fullName}
              </span>
              <span className="text-xs text-muted truncate max-w-40 md:max-w-56">
                {roleLbl}
              </span>
            </div>
            <ChevronDown size={14} />
          </Button>
          <Dropdown.Popover>
            <div className="px-3 py-2.5 border-b border-border">
              <div className="text-sm font-medium text-foreground truncate max-w-55">
                {fullName}
              </div>
              <div className="text-xs text-muted truncate max-w-55">{roleLbl}</div>
              <div className="text-xs text-muted truncate max-w-55">{me.email}</div>
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
