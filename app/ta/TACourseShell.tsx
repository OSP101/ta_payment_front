"use client";
import useSWR from "swr";
import {
  ArrowLeft, LayoutDashboard, Clock, CalendarOff,
  IdCard, CalendarDays, FileText, Bell, Megaphone, CalendarClock,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import TaTourLauncher from "./tours/TourLauncher";
import CourseSwitcher from "../components/CourseSwitcher";
import { TAApprovalBanner } from "./TAGate";

// Only the fields the badge needs; the worklog page owns the full shape.
interface AssignmentTally { id: string; submittable_count: number }
interface CourseInfo { unresolved_makeups?: number }

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
  // Rows the TA can still SEND, summed across every section they hold on this
  // course. A TA assisting two sections has two separate piles and can only see
  // one of them at a time on the worklog screen, so the count that matters is
  // the one that spans them — visible before they even open the page.
  //
  // Deliberately not unsent_count: a period that closed with rows unsent is
  // settled (ไม่ประสงค์ลงเวลา), and a badge counting them nags forever about
  // something nobody can act on.
  const { data: assignments } = useSWR<AssignmentTally[]>(
    tcId ? `/me/assignments?teaching_course_id=${tcId}` : null,
  );
  const unsentTotal = (assignments ?? []).reduce((n, a) => n + (a.submittable_count ?? 0), 0);

  // คาบที่ตกวันหยุดและยังไม่มีวันชดเชย — เดิมนับไว้เฉพาะเมนูของอาจารย์ เพราะ TA
  // ทำอะไรไม่ได้นอกจากรอ ตอนนี้ TA กำหนดวันชดเชยเองได้แล้ว ตัวเลขนี้จึงเป็นงาน
  // ที่ทำได้จริง (และเป็นเงื่อนไขว่าจะลงเวลาคาบนั้นได้หรือไม่) จึงติดไว้ด้วย
  const { data: courseInfo } = useSWR<CourseInfo>(
    tcId ? `/teaching-courses/${tcId}` : null,
  );
  const pendingMakeups = courseInfo?.unresolved_makeups ?? 0;

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
        {
          label: "วันหยุดและวันชดเชย",
          href: `/ta/courses/${tcId}/holidays`,
          icon: CalendarOff,
          badge: pendingMakeups,
          badgeLabel: "รอกำหนดวันชดเชย",
        },
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
      topBarLeft={
        <div data-tour="course-switcher" className="min-w-0">
          <CourseSwitcher tcId={tcId} siblingsPath="/me/ta-courses" />
        </div>
      }
      topBarAccessory={
        <>
          <TaTourLauncher />
          <div data-tour="notif-bell" className="shrink-0">
            <NotificationBell seeAllHref="/ta/notifications" />
          </div>
        </>
      }
    >
      <TAApprovalBanner />
      {children}
    </Shell>
  );
}
