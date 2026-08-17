"use client";
import {
  LayoutDashboard, IdCard, CalendarDays, FileText, Route, Megaphone,
} from "lucide-react";
import type { Me } from "../lib/api";
import Shell, { type NavSection, type NavStatus, type UserMenuItem } from "../components/Shell";
import NotificationBell from "../components/NotificationBell";
import TaTourLauncher from "./tours/TourLauncher";
import { useTAOnboarding } from "./useTAOnboarding";
import { EnrollmentScopeSwitcher } from "./EnrollmentScopeModal";

// The TA's pages now live in the left sidebar rather than behind the avatar
// dropdown. Hiding a whole feature set inside a menu that people read as
// "account settings" meant the only discoverable route to a TA's own schedule
// or documents was a link on the home page — and none at all from anywhere
// else. A sidebar shows the same items without a click, and matches the staff
// shell so the two roles are not learned separately.
//
// The dropdown keeps what genuinely belongs to the account: who you are signed
// in as, and sign-out (Shell adds that itself).
const buildNav = (docsStatus?: NavStatus, docsLabel?: string,
                 schedStatus?: NavStatus, schedLabel?: string): NavSection[] => [
  {
    title: "ภาพรวม",
    items: [{ label: "หน้าหลัก", href: "/ta", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "ของฉัน",
    items: [
      // /account, not /ta/profile: both rendered the same component, and the
      // shared route now carries whichever shell the reader belongs to. One
      // page, one URL, identical for a TA and a lecturer. /ta/profile still
      // resolves — it redirects here — so old links and bookmarks survive.
      { label: "โปรไฟล์และบัญชี", href: "/account", icon: IdCard },
      { label: "ตารางเรียนของฉัน", href: "/ta/schedule", icon: CalendarDays,
        status: schedStatus, statusLabel: schedLabel },
      { label: "เอกสารของฉัน", href: "/ta/documents", icon: FileText,
        status: docsStatus, statusLabel: docsLabel },
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

// Nothing left to put here: every destination moved to the sidebar. Shell still
// renders the account block and sign-out.
const userMenuItems: UserMenuItem[] = [];

export default function TAShell({
  me,
  children,
}: {
  me: Me;
  children: React.ReactNode;
}) {
  // Same hook the checklist card uses — the sidebar marks and the card can no
  // longer drift apart (they did: the card counted a sent-back file as done).
  const { docState, docLabel, scheduleDone, scheduleLabel } = useTAOnboarding();

  const docsStatus: NavStatus | undefined =
    docState === "rejected" || docState === "not_sent" ? "warn"
      : docState === "pending_review" ? "pending"
        : undefined;

  const nav = buildNav(
    docsStatus, docLabel,
    scheduleDone ? undefined : "warn", scheduleLabel,
  );

  return (
    <Shell
      me={me}
      brandTitle="TA Payment"
      nav={nav}
      userMenuItems={userMenuItems}
      topBarAccessory={
        <>
          <EnrollmentScopeSwitcher />
          <TaTourLauncher />
          <div data-tour="notif-bell" className="shrink-0">
            <NotificationBell seeAllHref="/ta/notifications" />
          </div>
        </>
      }
    >
      {children}
    </Shell>
  );
}
