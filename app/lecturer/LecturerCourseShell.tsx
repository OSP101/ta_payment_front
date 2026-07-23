"use client";
import { LayoutDashboard, Calculator, Send, ClipboardCheck, Settings, ArrowLeft, ExternalLink, Megaphone, Bell, ShieldAlert, CalendarOff } from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import { Alert } from "../components/ui";

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
        { label: "วันหยุดและวันชดเชย", href: `/lecturer/courses/${tcId}/holidays`, icon: CalendarOff },
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
  const userMenuItems: UserMenuItem[] = [
    { id: "announce", label: "ประกาศ",   href: "/announcements",  icon: Megaphone },
    { id: "notif",    label: "การเตือน", href: "/notifications",  icon: Bell },
  ];

  // Staff can jump into a lecturer's course view from the staff teaching page
  // to manage on the lecturer's behalf. Surface that clearly so actions taken
  // here aren't confused with actions the lecturer took themselves.
  const impersonating = me.roles.includes("admin") || me.roles.includes("staff");

  return (
    <Shell
      me={me}
      brandTitle={brandTitle}
      nav={nav}
      userMenuItems={userMenuItems}
      topBarAccessory={<NotificationBell />}
    >
      {impersonating && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<ShieldAlert size={16} />}
            title="กำลังเข้าใช้งานด้วยสิทธิ์เจ้าหน้าที่/ผู้ดูแลระบบ"
            description="คุณเข้ามาในหน้ามุมมองของอาจารย์เพื่อจัดการแทน — การกระทำใด ๆ จะถูกบันทึกในนามผู้ใช้ปัจจุบัน"
          />
        </div>
      )}
      {children}
    </Shell>
  );
}
