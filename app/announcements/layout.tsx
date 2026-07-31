import { requireRole } from "../lib/session";
import RoleShell from "../components/RoleShell";

// The public feed at /announcements is reachable by every authenticated
// role — TA, lecturer, and staff/admin all follow announcement links from
// the notification bell into this shell, and from their own sidebars. It
// renders inside the reader's own shell so that sidebar stays put.
export default async function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("ta", "lecturer", "staff", "admin");
  return <RoleShell me={me}>{children}</RoleShell>;
}
