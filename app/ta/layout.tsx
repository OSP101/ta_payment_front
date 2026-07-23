import { getTAProfileStatus, requireRole } from "../lib/session";
import { TAApprovalProvider } from "./TAGate";
import OnboardingBlocker from "./OnboardingBlocker";

// Auth + approval context only. The actual sidebar shell lives one level down —
// TAShell in (home)/layout.tsx for the shallow feature nav, TACourseShell in
// courses/[tcId]/layout.tsx for the per-course sidebar. Keeping this layout
// shell-less avoids double topbars when the sub-layout renders its own Shell.
export default async function TALayout({ children }: { children: React.ReactNode }) {
  await requireRole("ta");
  const profileStatus = await getTAProfileStatus();
  const approved = profileStatus === "approved";
  return (
    <TAApprovalProvider approved={approved} status={profileStatus}>
      {children}
      <OnboardingBlocker />
    </TAApprovalProvider>
  );
}
