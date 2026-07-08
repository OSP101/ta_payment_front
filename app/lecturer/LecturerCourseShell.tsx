"use client";
import { LayoutDashboard, Calculator, Send, ClipboardCheck, Settings, ArrowLeft, ExternalLink } from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection } from "../components/Shell";

export default function LecturerCourseShell({
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
        { label: "กลับหน้ารายวิชา", href: "/lecturer", icon: ArrowLeft, exact: true },
      ],
    },
    {
      title: "จัดการวิชา",
      items: [
        { label: "ภาพรวมวิชา", href: `/lecturer/courses/${tcId}`, icon: LayoutDashboard, exact: true },
        { label: "ส่งคำขอ TA", href: `/lecturer/courses/${tcId}/request`, icon: Send },
        { label: "อนุมัติรายงาน TA", href: `/lecturer/courses/${tcId}/reports`, icon: ClipboardCheck },
        { label: "ตั้งค่ารายวิชา", href: `/lecturer/courses/${tcId}/settings`, icon: Settings },
      ],
    },
    {
      title: "อื่น ๆ",
      items: [
        { label: "คำนวณงบ", href: `/lecturer/courses/${tcId}/budget`, icon: Calculator },
        { label: "LabTAS", href: "https://labtas.kku.ac.th", icon: ExternalLink, external: true },
      ],
    },
  ];

  const brandTitle = "TA Payment";

  return (
    <Shell me={me} brandTitle={brandTitle} nav={nav}>
      {children}
    </Shell>
  );
}
