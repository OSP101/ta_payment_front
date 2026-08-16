import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe, mfaSetupRequired } from "../lib/session";
import RoleShell from "../components/RoleShell";

// The read-only budget view for the management team. They are lecturers whose
// account carries the executive flag (ticked by staff in the users page) — a
// flag, not a role, so requireRole() cannot express this gate. Staff and admin
// pass too: the page renders the same component their dashboard embeds, and
// refusing them would only make support harder.
export default async function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const allowed = me.is_executive || me.roles.includes("staff") || me.roles.includes("admin");
  if (!allowed) redirect("/");
  // See requireRole's own comment on mfaSetupRequired: demo slots never
  // enforce this, so skip it for a demo walkthrough session.
  const c = await cookies();
  if (!c.get("demo_base_path")?.value && mfaSetupRequired(me)) redirect("/setup-2fa");
  return <RoleShell me={me}>{children}</RoleShell>;
}
