"use client";
import useSWR from "swr";
import {
  LayoutDashboard, Route, Megaphone, Bell, IdCard, ChartColumnBig,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import LecturerTourLauncher from "./tours/TourLauncher";

// The lecturer's home used to be a bare header with two links buried in the top
// bar, so /document-progress and /announcements were reachable from here and
// nowhere else. A sidebar puts them in the same place the TA, staff and
// per-course shells put their navigation — one layout to learn instead of four.
//
// The dropdown keeps what belongs to the account: who you are signed in as,
// account settings, and sign-out (Shell adds that itself).

interface PendingReport { teaching_course_id: string }

const buildNav = (pendingCourses: number, isExecutive: boolean): NavSection[] => [
  {
    title: "ภาพรวม",
    items: [
      // Approving TA hours has no page of its own — it happens inside a course —
      // so the count rides on the link to the course list, which is where the
      // waiting courses are named. It is the lecturer's one recurring duty and
      // the bottleneck of the whole payout, so it must be visible from the
      // pages below too, not only from the home page itself.
      {
        label: "หน้าหลัก",
        href: "/lecturer",
        icon: LayoutDashboard,
        exact: true,
        badge: pendingCourses,
        badgeLabel: "วิชาที่มีบันทึกเวลารออนุมัติ",
      },
      // The management team are lecturers whose accounts staff ticked the
      // executive flag on — the read-only budget analytics lives one click
      // from where they already work.
      ...(isExecutive
        ? [{ label: "มุมมองผู้บริหาร", href: "/executive", icon: ChartColumnBig }]
        : []),
    ],
  },
  {
    title: "ของฉัน",
    items: [
      // /account carries the profile picture, personal details, sign-in and
      // security — "โปรไฟล์และบัญชี" says both halves, because a label of just
      // "โปรไฟล์" hides where the password is changed.
      { label: "โปรไฟล์และบัญชี", href: "/account", icon: IdCard },
    ],
  },
  {
    title: "ติดตาม",
    items: [
      { label: "ความคืบหน้าเอกสาร", href: "/document-progress", icon: Route },
      { label: "ประกาศ", href: "/announcements", icon: Megaphone },
    ],
  },
];

// Account settings moved to the sidebar above, so the dropdown keeps only what
// has no home there. Two identical links on one screen is one too many.
const userMenuItems: UserMenuItem[] = [
  { id: "notif", label: "การเตือน", href: "/notifications", icon: Bell },
];

export default function LecturerHomeShell({
  me, children,
}: { me: Me; children: React.ReactNode }) {
  // Same endpoint the per-course sidebar counts from, so the two cannot drift.
  // Counted by COURSE, not by report row: the badge sits next to a link that
  // lands on the course list, and "12" would promise twelve things to click.
  //
  // Staff and admin may open this page to manage on a lecturer's behalf, and
  // the endpoint hands THEM every pending report in the faculty. That number is
  // not their to-do list and would read as one, so they get no badge — the
  // per-course sidebar still shows the count where it belongs to a course.
  const isLecturer = me.roles.includes("lecturer");
  const { data: pending } = useSWR<PendingReport[]>(isLecturer ? "/reports/pending" : null);
  const pendingCourses = new Set((pending ?? []).map(r => r.teaching_course_id)).size;

  return (
    <Shell
      me={me}
      brandTitle="TA Payment"
      nav={buildNav(pendingCourses, me.is_executive === true)}
      userMenuItems={userMenuItems}
      topBarAccessory={
        <>
          <LecturerTourLauncher />
          <div data-tour="notif-bell" className="shrink-0">
            <NotificationBell />
          </div>
        </>
      }
    >
      {children}
    </Shell>
  );
}
