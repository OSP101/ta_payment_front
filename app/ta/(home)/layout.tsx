import { getMe } from "../../lib/session";
import { redirect } from "next/navigation";
import TAShell from "../TAShell";
import { TAApprovalBanner } from "../TAGate";

export default async function TAHomeLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  return (
    <TAShell me={me}>
      <TAApprovalBanner />
      {children}
    </TAShell>
  );
}
