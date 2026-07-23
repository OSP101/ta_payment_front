"use client";
import {
  ArrowLeft, LayoutDashboard, Clock, CalendarOff,
  IdCard, CalendarDays, FileText, Bell, Megaphone, CalendarClock,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import { TAApprovalBanner } from "./TAGate";

// Per-course sidebar for TAs — same app-level Shell pattern as the lecturer's
// per-course view, so the sidebar sits flush against the viewport edge.
export default function TACourseShell({
  me, tcId, courseCode, children,
}: {
  me: Me;
  tcId: string;
  courseCode?: string;
  children: React.ReactNode;
}) {
  const nav: NavSection[] = [
    {
      items: [
        { label: "กลับหน้ารายวิชา", href: "/ta", icon: ArrowLeft, exact: true },
      ],
    },
    {
      title: courseCode ? `รายวิชา ${courseCode}` : "รายวิชา",
      items: [
        { label: "ภาพรวม", href: `/ta/courses/${tcId}`, icon: LayoutDashboard, exact: true },
        { label: "ลงเวลาปฏิบัติงาน", href: `/ta/courses/${tcId}/worklog`, icon: Clock },
        { label: "วันหยุดและวันชดเชย", href: `/ta/courses/${tcId}/holidays`, icon: CalendarOff },
      ],
    },
  ];

  const userMenuItems: UserMenuItem[] = [
    { id: "profile",   label: "โปรไฟล์",           href: "/ta/profile",       icon: IdCard },
    { id: "schedule",  label: "ตารางเรียนของฉัน",   href: "/ta/schedule",      icon: CalendarDays },
    { id: "docs",      label: "เอกสารของฉัน",       href: "/ta/documents",     icon: FileText },
    { id: "reminders", label: "แจ้งเตือนรายเดือน",   href: "/ta/reminders",     icon: CalendarClock },
    { id: "announce",  label: "ประกาศ",              href: "/announcements",    icon: Megaphone },
    { id: "notif",     label: "การเตือน",           href: "/ta/notifications", icon: Bell },
  ];

  return (
    <Shell
      me={me}
      brandTitle="TA Payment"
      nav={nav}
      userMenuItems={userMenuItems}
      topBarAccessory={<NotificationBell seeAllHref="/ta/notifications" />}
    >
      <TAApprovalBanner />
      {children}
    </Shell>
  );
}
