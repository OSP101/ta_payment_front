import { requireRole } from "../lib/session";
import RoleShell from "../components/RoleShell";

// Shared "/notifications" page for lecturer + staff/admin. TAs land here from
// their sidebar link to `/ta/notifications` — that route has its own layout
// so the onboarding banner keeps rendering above the list. Reached from the
// user menu, so it renders inside the reader's own shell.
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("lecturer", "staff", "admin");
  return <RoleShell me={me}>{children}</RoleShell>;
}
