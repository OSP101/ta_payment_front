import { requireRole } from "../lib/session";
import RoleShell from "../components/RoleShell";

// Everyone with an account has an account screen. It is linked from each role's
// sidebar, so it renders inside that role's shell — see RoleShell for why this
// is one page rather than a copy per role.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("ta", "lecturer", "staff", "admin");
  return <RoleShell me={me}>{children}</RoleShell>;
}
