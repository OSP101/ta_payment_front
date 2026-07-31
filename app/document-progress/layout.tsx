import { requireRole } from "../lib/session";
import RoleShell from "../components/RoleShell";

// The document-progress board is readable by every authenticated role — the
// whole point is that TA, lecturer, and staff can all see where the paperwork
// is without asking. Staff edit it from /staff/progress; here it is read-only.
// It renders inside each role's own shell so the sidebar that linked here stays.
export default async function DocumentProgressLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("ta", "lecturer", "staff", "admin");
  return <RoleShell me={me}>{children}</RoleShell>;
}
