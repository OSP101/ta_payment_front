"use client";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardCheck,
  FileCheck2,
  Download,
  Megaphone,
  Settings,
  ScrollText,
  Bell,
  CalendarOff,
  Route,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";

const nav: NavSection[] = [
  {
    title: "ภาพรวม",
    items: [{ label: "แดชบอร์ด", href: "/staff", icon: LayoutDashboard }],
  },
  {
    title: "จัดการ",
    items: [
      { label: "จัดการผู้ใช้", href: "/staff/users", icon: Users },
      { label: "วิชาที่เปิดสอน", href: "/staff/teaching", icon: BookOpen },
    ],
  },
  {
    title: "การอนุมัติ",
    items: [
      { label: "ตรวจสอบเอกสาร", href: "/staff/review", icon: FileCheck2 },
      { label: "รายการคำขอ TA", href: "/staff/approvals", icon: ClipboardCheck },
    ],
  },
  {
    title: "ปฏิบัติงาน",
    items: [
      { label: "ส่งออกเอกสาร", href: "/staff/exports", icon: Download },
      { label: "อัปเดตความคืบหน้า", href: "/staff/progress", icon: Route },
      { label: "ประชาสัมพันธ์", href: "/staff/announce", icon: Megaphone },
    ],
  },
  {
    title: "ระบบ",
    items: [
      { label: "วันหยุดราชการ", href: "/staff/holidays", icon: CalendarOff },
      { label: "ตั้งค่า", href: "/staff/settings", icon: Settings },
      { label: "Audit Log", href: "/staff/audit", icon: ScrollText },
    ],
  },
];

const userMenuItems: UserMenuItem[] = [
  { id: "announce", label: "ประกาศ",   href: "/announcements",  icon: Megaphone },
  { id: "notif",    label: "การเตือน", href: "/notifications",  icon: Bell },
];

export default function StaffShell({ me, children }: { me: Me; children: React.ReactNode }) {
  return (
    <Shell
      me={me}
      brandTitle="TA Payment"
      nav={nav}
      userMenuItems={userMenuItems}
      topBarAccessory={<NotificationBell />}
    >
      {children}
    </Shell>
  );
}
