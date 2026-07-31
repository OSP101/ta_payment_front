"use client";
import type { Me } from "../lib/api";
import TAShell from "../ta/TAShell";
import LecturerHomeShell from "../lecturer/LecturerHomeShell";
import StaffShell from "../staff/StaffShell";

/**
 * The right sidebar for whoever is reading, around a page that belongs to
 * everyone.
 *
 * /account, /announcements, /document-progress and /notifications are one page
 * each, shared by every role — so they had no shell at all. Every one of them
 * is linked FROM a sidebar, and clicking a sidebar item made the sidebar
 * vanish: no way back except the browser's Back button, and no sign of where
 * you now were. Duplicating the routes per role (/lecturer/account,
 * /ta/announcements, …) would have fixed the chrome by giving the same content
 * several URLs; picking the shell by role fixes it in one place and leaves the
 * links people have already bookmarked alone.
 *
 * Someone holding several roles gets the shell of the most privileged one,
 * because that is the area they came from — staff who are also lecturers work
 * out of /staff.
 */
export default function RoleShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const has = (r: string) => me.roles.includes(r);

  if (has("admin") || has("staff")) return <StaffShell me={me}>{children}</StaffShell>;
  if (has("lecturer")) return <LecturerHomeShell me={me}>{children}</LecturerHomeShell>;
  if (has("ta")) return <TAShell me={me}>{children}</TAShell>;
  // No role yet (a freshly created account awaiting approval). There is no menu
  // to show, so the page stands on its own exactly as it did before.
  return <>{children}</>;
}
