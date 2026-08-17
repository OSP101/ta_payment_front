import { getTAProfileStatus, requireRole } from "../lib/session";
import { TAApprovalProvider } from "./TAGate";
import EnrollmentScopeGate from "./EnrollmentScopeModal";

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
      {/* Blocking picker for a TA with >1 education-level period — see
          EnrollmentScopeModal.tsx. Mounted here (not deeper, e.g. TAShell)
          so it covers every route under /ta, including courses/[tcId]/*. */}
      <EnrollmentScopeGate />
      {children}
    </TAApprovalProvider>
  );
}
