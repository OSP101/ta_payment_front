import { redirect, notFound } from "next/navigation";
import { getMe } from "../../lib/session";
import { allowedAudiences, canViewAudience, defaultHomeRoute } from "../../lib/docs/audience";
import { sidebarSections } from "../../../content/docs/registry";
import type { Audience } from "../../../content/docs/types";
import DocsShell from "../../components/docs/DocsShell";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

/**
 * Gates every `/docs/[audience]/*` route server-side — the same rule the
 * plan calls out explicitly: hiding the switch button is not access control,
 * a TA typing `/docs/staff/...` by hand must get a real 403, not a page that
 * merely looks unreachable. `requireRole()` (used everywhere else in this
 * app) is deliberately NOT reused here: reading the manual shouldn't force
 * the 2FA-setup redirect that gates the rest of the app for staff/admin —
 * the "ยืนยันตัวตนสองขั้นตอน" page is itself one of the pages someone mid-setup
 * most needs to read.
 */
export default async function AudienceLayout({
  params,
  children,
}: {
  params: Promise<{ audience: string }>;
  children: React.ReactNode;
}) {
  const { audience: raw } = await params;
  if (!VALID.includes(raw as Audience)) notFound();
  const audience = raw as Audience;

  const me = await getMe();
  if (!me) redirect(`/login?next=/docs/${audience}`);
  if (!canViewAudience(me, audience)) redirect("/403");

  return (
    <DocsShell
      audience={audience}
      allowedAudiences={allowedAudiences(me)}
      sections={sidebarSections(audience)}
      homeHref={defaultHomeRoute(me)}
    >
      {children}
    </DocsShell>
  );
}
