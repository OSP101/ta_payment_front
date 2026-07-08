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
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection } from "../components/Shell";

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
      { label: "อนุมัติคำขอ TA", href: "/staff/approvals", icon: ClipboardCheck },
    ],
  },
  {
    title: "ปฏิบัติงาน",
    items: [
      { label: "ส่งออกเอกสาร", href: "/staff/exports", icon: Download },
      { label: "ประชาสัมพันธ์", href: "/staff/announce", icon: Megaphone },
    ],
  },
  {
    title: "ระบบ",
    items: [
      { label: "ตั้งค่า", href: "/staff/settings", icon: Settings },
      { label: "Audit Log", href: "/staff/audit", icon: ScrollText },
    ],
  },
];

export default function StaffShell({ me, children }: { me: Me; children: React.ReactNode }) {
  return (
    <Shell me={me} brandTitle="COCO TA Payment" nav={nav}>
      {children}
    </Shell>
  );
}
