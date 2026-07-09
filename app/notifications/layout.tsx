import { requireRole } from "../lib/session";

// Shared "/notifications" page for lecturer + staff/admin. TAs land here from
// their sidebar link to `/ta/notifications` — that route has its own layout
// so the onboarding banner keeps rendering above the list.
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("lecturer", "staff", "admin");
  return <>{children}</>;
}
