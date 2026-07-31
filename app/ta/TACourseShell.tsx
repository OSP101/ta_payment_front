"use client";
import useSWR from "swr";
import {
  ArrowLeft, LayoutDashboard, Clock, CalendarOff,
  IdCard, CalendarDays, FileText, Bell, Megaphone, CalendarClock,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import CourseSwitcher from "../components/CourseSwitcher";
import { TAApprovalBanner } from "./TAGate";

// Only the fields the badge needs; the worklog page owns the full shape.
interface AssignmentTally { id: string; unsent_count: number }

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
  // Rows not yet sent for approval, summed across EVERY section the TA holds on
  // this course. A TA assisting two sections has two separate piles and can only
  // see one of them at a time on the worklog screen, so the count that matters
  // is the one that spans them — visible before they even open the page.
  const { data: assignments } = useSWR<AssignmentTally[]>(
    tcId ? `/me/assignments?teaching_course_id=${tcId}` : null,
  );
  const unsentTotal = (assignments ?? []).reduce((n, a) => n + (a.unsent_count ?? 0), 0);

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
        {
          label: "ลงเวลาปฏิบัติงาน",
          href: `/ta/courses/${tcId}/worklog`,
          icon: Clock,
          badge: unsentTotal,
          badgeLabel: "ยังไม่ได้ส่งอนุมัติ",
        },
        { label: "วันหยุดและวันชดเชย", href: `/ta/courses/${tcId}/holidays`, icon: CalendarOff },
      ],
    },
  ];

  const userMenuItems: UserMenuItem[] = [
    { id: "profile",   label: "โปรไฟล์และบัญชี",     href: "/account",          icon: IdCard },
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
      // สลับวิชาได้จากแถบบนเหมือนฝั่งอาจารย์ — รายการมาจาก /me/ta-courses
      // (เฉพาะวิชาที่ตัวเองเป็น TA) ไม่ใช่ทุกวิชาในเทอม
      topBarLeft={<CourseSwitcher tcId={tcId} siblingsPath="/me/ta-courses" />}
      topBarAccessory={<NotificationBell seeAllHref="/ta/notifications" />}
    >
      <TAApprovalBanner />
      {children}
    </Shell>
  );
}
