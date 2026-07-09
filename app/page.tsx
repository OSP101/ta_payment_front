import { redirect } from "next/navigation";
import { getMe } from "./lib/session";
import NoRoleNotice from "./NoRoleNotice";

// Root — dispatch to the appropriate role home based on the user's roles.
export default async function RootRedirect() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.roles.includes("admin") || me.roles.includes("staff")) redirect("/staff");
  if (me.roles.includes("lecturer")) redirect("/lecturer");
  if (me.roles.includes("ta")) redirect("/ta");
  // Authenticated but no recognised role — don't bounce back to /login (that
  // reads as "wrong password"). Explain the situation and offer logout.
  return <NoRoleNotice email={me.email} />;
}
