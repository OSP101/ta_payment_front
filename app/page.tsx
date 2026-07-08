import { redirect } from "next/navigation";
import { getMe } from "./lib/session";

// Root — dispatch to the appropriate role home based on the user's roles.
export default async function RootRedirect() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.roles.includes("admin") || me.roles.includes("staff")) redirect("/staff");
  if (me.roles.includes("lecturer")) redirect("/lecturer");
  if (me.roles.includes("ta")) redirect("/ta");
  redirect("/login");
}
