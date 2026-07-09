import { requireRole } from "../lib/session";

// The public feed at /announcements is reachable by every authenticated
// role — TA, lecturer, and staff/admin all follow announcement links from
// the notification bell into this shell.
export default async function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ta", "lecturer", "staff", "admin");
  return <>{children}</>;
}
