"use client";
import { Suspense } from "react";
import useSWR from "swr";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Megaphone,
  Settings,
  ScrollText,
  ShieldOff,
  Bell,
  CalendarOff,
  Route,
  IdCard,
  FileSignature,
  Calculator,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import { type Executive, emptyExecutive } from "./types";
import { TermProvider, useTerm } from "./TermContext";
import TermSwitcher from "./TermSwitcher";
import TourLauncher from "./tours/TourLauncher";

// The four steps a payment actually travels through, in order. Numbered
// instead of iconned at the lecturers' request: icons made every entry look
// equally urgent and said nothing about what has to happen first, so staff had
// to learn the sequence from a colleague rather than from the screen.
//
// Step 3 finally gives /staff/worklog a home. The page has existed since the
// staff worklog editor shipped but was reachable only by typing the URL, which
// is why the review step was being done outside the system.
// Badges answer the question the numbered steps could not: the order of work
// was readable, but nothing said whether any of it was waiting. A queue could
// sit untouched for a week and the sidebar looked identical to a clear one.
const buildNav = (s: Executive): NavSection[] => [
  {
    title: "ภาพรวม",
    items: [{ label: "แดชบอร์ด", href: "/staff", icon: LayoutDashboard }],
  },
  {
    title: "สิ่งที่ต้องทำ",
    items: [
      { step: 1, label: "ตรวจคำร้องขอ TA", href: "/staff/approvals",
        badge: s.pending_ta_requests, badgeLabel: "คำร้องรอตรวจ" },
      { step: 2, label: "ตรวจแบบฟอร์มใบแจ้งหนี้", href: "/staff/review",
        badge: s.pending_reviews, badgeLabel: "แบบฟอร์มรอตรวจ" },
      // Steps 3 and 4 were merged on 31/07/2026. They were one errand split
      // across two menus: an officer who finished a review was left on a screen
      // with no way forward and had to know that a separate export menu existed.
      // The badge is now one number in the unit the screen lists — courses with
      // something to do — instead of two counts of two different things that
      // could not be added together.
      { step: 3, label: "ตรวจและส่งออกเอกสาร", href: "/staff/payouts",
        badge: s.payout_courses_actionable, badgeLabel: "วิชาที่ทำได้ตอนนี้" },
    ],
  },
  {
    title: "จัดการ",
    items: [
      // Printing appointment orders is a term-level act that gates everything
      // above; it lived as a tab inside the export screen, where it read as one
      // of the ways to export a payout package.
      //
      // The badge (06/08/2026 ask) counts รายชื่อ approved but not yet on any
      // order — the exact list the next round would print. A TA without an
      // order cannot pass payout review, so this is workflow-gating work, which
      // is what badges mean here. Same number the page itself shows.
      { label: "ใบแต่งตั้งทีเอ", href: "/staff/appointments", icon: FileSignature,
        badge: s.pending_appointments, badgeLabel: "รายชื่อรอออกคำสั่ง" },
      // สรุปรายวิชาที่ขอใช้ TA / ปะหน้าจ่ายตรง / รหัสคู่ (10/08/2026) — briefly
      // lived under ใบแต่งตั้งทีเอ ("ส่งออกเอกสาร"), split back out into its own
      // menu: staff wanted a page they could actually READ a summary on
      // on-screen before downloading, not just a bundle of download buttons
      // bolted onto the appointment-order screen.
      { label: "สรุปงบและปะหน้าจ่ายตรง", href: "/staff/budget-summary", icon: Calculator },
      { label: "จัดการผู้ใช้", href: "/staff/users", icon: Users },
      // No badge here on purpose: badges mean "a step of the workflow is
      // waiting on you". Missing student counts are a blocker, but they are
      // surfaced by the dashboard's to-do panel; putting a count on a
      // reference page too spreads the signal thin.
      { label: "วิชาที่เปิดสอน", href: "/staff/teaching", icon: BookOpen },
    ],
  },
  {
    title: "ปฏิบัติงาน",
    items: [
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
      // Admin-only server-side (RequireRole(rbac.RoleAdmin)) — same convention
      // as Audit Log above, shown to all staff/admin and left to the backend
      // to 403 a non-admin who follows it, rather than hiding it here (this
      // shell has no per-item role-visibility mechanism to begin with).
      { label: "คำขอลบข้อมูล (PDPA)", href: "/staff/data-deletion-requests", icon: ShieldOff },
    ],
  },
];

const userMenuItems: UserMenuItem[] = [
  { id: "account",  label: "ตั้งค่าบัญชี", href: "/account",     icon: IdCard },
  { id: "announce", label: "ประกาศ",   href: "/announcements",  icon: Megaphone },
  { id: "notif",    label: "การเตือน", href: "/notifications",  icon: Bell },
];

export default function StaffShell({ me, children }: { me: Me; children: React.ReactNode }) {
  return (
    // TermProvider wraps the Shell, not just the page: the term switcher lives
    // in the top bar, so the chrome needs the context too.
    <Suspense fallback={null}>
      <TermProvider>
        <StaffShellInner me={me}>{children}</StaffShellInner>
      </TermProvider>
    </Suspense>
  );
}

function StaffShellInner({ me, children }: { me: Me; children: React.ReactNode }) {
  const { termId } = useTerm();
  // Badge counts follow the selected term, same as every page below — a badge
  // that counted the active term while the page showed 2568/2 would be worse
  // than no badge at all.
  const { data } = useSWR<Executive>(termId ? `/dashboard/executive?term_id=${termId}` : null);
  const nav = buildNav(data ?? emptyExecutive);
  return (
    <Shell
      me={me}
      brandTitle="COCO TAS"
      nav={nav}
      userMenuItems={userMenuItems}
      topBarScope={<TermSwitcher />}
      topBarAccessory={
        <>
          <TourLauncher />
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
