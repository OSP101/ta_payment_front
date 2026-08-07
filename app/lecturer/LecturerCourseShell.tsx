"use client";
import useSWR from "swr";
import { LayoutDashboard, Calculator, Send, ClipboardCheck, Settings, ArrowLeft, Megaphone, Bell, ShieldAlert, CalendarOff, IdCard } from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import LecturerTourLauncher from "./tours/TourLauncher";
import CourseSwitcher from "../components/CourseSwitcher";
import { Alert } from "../components/ui";

interface CourseInfo {
  unresolved_makeups?: number;
  /** ≥1 section has no timetable (registrar "WBA") — TA requests are blocked. */
  has_missing_schedule?: boolean;
  num_students?: number;
}
interface PendingReport { teaching_course_id: string; ta_id: string }

export default function LecturerCourseShell({
  me, tcId, courseCode, children,
}: {
  me: Me;
  tcId: string;
  courseCode?: string;
  children: React.ReactNode;
}) {
  // คาบที่ตกวันหยุดและยังไม่กำหนดวันชดเชย — ถ้าไม่ทำ ระบบจะข้ามวันนั้น
  // และ TA ลงเวลาไม่ได้ (= เบิกเงินไม่ได้) จึงติดตัวนับไว้ที่เมนูให้เห็นทุกหน้า
  const { data: courseInfo } = useSWR<CourseInfo>(
    tcId ? `/teaching-courses/${tcId}` : null,
  );
  const pendingMakeups = courseInfo?.unresolved_makeups ?? 0;

  // รายงานที่ TA ส่งมาแล้วรออาจารย์อนุมัติ — งานประจำหลักของอาจารย์ และเป็น
  // คอขวดของการเบิกจ่าย: ถ้าไม่อนุมัติ เจ้าหน้าที่ตรวจต่อไม่ได้ทั้งเดือน
  const { data: pending } = useSWR<PendingReport[]>("/reports/pending");
  // Counted by PERSON, not by row. /reports/pending returns one row per
  // ASSIGNMENT, so a TA helping with two sections produced a "2" next to a page
  // that then showed one card — the badge and the screen were counting
  // different things, and the reader had no way to know which.
  const pendingReports = new Set(
    (pending ?? []).filter(r => r.teaching_course_id === tcId).map(r => r.ta_id),
  ).size;

  // ตั้งค่ารายวิชาเป็นที่ที่แก้ทั้งสองอย่างนี้ ไอคอนจึงอยู่ตรงนั้น ไม่ใช่ตรงหน้า
  // ที่ถูกบล็อก — บอกว่า "ต้องไปทำอะไร" มีประโยชน์กว่าบอกว่า "ตรงนี้ทำไม่ได้"
  const missingSchedule = courseInfo?.has_missing_schedule === true;
  const missingStudents = courseInfo !== undefined && (courseInfo.num_students ?? 0) === 0;
  const settingsIssue = missingSchedule
    ? "ยังไม่ระบุเวลาเรียน (WBA) ส่งคำขอ TA ไม่ได้จนกว่าจะกรอกตารางเรียน"
    : missingStudents
      ? "ยังไม่ได้กรอกจำนวนนักศึกษา คำนวณงบและเบิกจ่ายไม่ได้"
      : undefined;

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
        {
          label: "อนุมัติรายงาน TA",
          href: `/lecturer/courses/${tcId}/reports`,
          icon: ClipboardCheck,
          badge: pendingReports,
          badgeLabel: "รออนุมัติ",
        },
        {
          label: "วันหยุดและวันชดเชย",
          href: `/lecturer/courses/${tcId}/holidays`,
          icon: CalendarOff,
          badge: pendingMakeups,
          badgeLabel: "รอกำหนดวันชดเชย",
        },
        {
          label: "ตั้งค่ารายวิชา",
          href: `/lecturer/courses/${tcId}/settings`,
          icon: Settings,
          status: settingsIssue ? "warn" : undefined,
          statusLabel: settingsIssue,
        },
      ],
    },
    {
      title: "อื่น ๆ",
      items: [
        { label: "คำนวณงบ", href: `/lecturer/courses/${tcId}/budget`, icon: Calculator },
      ],
    },
  ];

  const brandTitle = "TA Payment";
  const userMenuItems: UserMenuItem[] = [
    { id: "account",  label: "ตั้งค่าบัญชี", href: "/account",     icon: IdCard },
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
      topBarLeft={
        <div data-tour="course-switcher" className="min-w-0">
          <CourseSwitcher tcId={tcId} />
        </div>
      }
      topBarAccessory={
        <>
          <LecturerTourLauncher />
          <div data-tour="notif-bell" className="shrink-0">
            <NotificationBell />
          </div>
        </>
      }
    >
      {impersonating && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<ShieldAlert size={16} />}
            title="กำลังเข้าใช้งานด้วยสิทธิ์เจ้าหน้าที่/ผู้ดูแลระบบ"
            description="คุณเข้ามาในหน้ามุมมองของอาจารย์เพื่อจัดการแทน การกระทำใด ๆ จะถูกบันทึกในนามผู้ใช้ปัจจุบัน"
          />
        </div>
      )}
      {children}
    </Shell>
  );
}
