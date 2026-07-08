import { getTAProfileStatus, requireRole } from "../lib/session";
import TAShell from "./TAShell";
import { TAApprovalProvider, TAApprovalBanner } from "./TAGate";
import OnboardingBlocker from "./OnboardingBlocker";

export default async function TALayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("ta");
  const profileStatus = await getTAProfileStatus();
  const approved = profileStatus === "approved";
  return (
    <TAApprovalProvider approved={approved} status={profileStatus}>
      <TAShell me={me}>
        <TAApprovalBanner />
        {children}
        <OnboardingBlocker />
      </TAShell>
    </TAApprovalProvider>
  );
}
