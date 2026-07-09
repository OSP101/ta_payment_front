"use client";
import { IdCard, CalendarDays, FileText, Bell, Megaphone } from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";

// The TA shell has no left sidebar on any page — feature nav (dashboard,
// worklog) is a shallow tree, and personal items live in the top-right
// user dropdown. Keeping every page consistent with the /ta home layout
// avoids "which page has the sidebar?" surprises.
const nav: NavSection[] = [];

const userMenuItems: UserMenuItem[] = [
  { id: "profile",   label: "โปรไฟล์",         href: "/ta/profile",       icon: IdCard },
  { id: "schedule",  label: "ตารางเรียนของฉัน", href: "/ta/schedule",      icon: CalendarDays },
  { id: "docs",      label: "เอกสารของฉัน",     href: "/ta/documents",     icon: FileText },
  { id: "announce",  label: "ประกาศ",            href: "/announcements",    icon: Megaphone },
  { id: "notif",     label: "การเตือน",         href: "/ta/notifications", icon: Bell },
];

export default function TAShell({
  me,
  children,
}: {
  me: Me;
  children: React.ReactNode;
}) {
  return (
    <Shell
      me={me}
      brandTitle="TA Payment"
      nav={nav}
      userMenuItems={userMenuItems}
      topBarAccessory={<NotificationBell seeAllHref="/ta/notifications" />}
      hideSidebar
    >
      {children}
    </Shell>
  );
}
