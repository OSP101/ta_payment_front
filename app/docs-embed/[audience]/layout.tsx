import { notFound } from "next/navigation";
import { getMe } from "../../lib/session";
import { canViewAudience } from "../../lib/docs/audience";
import type { Audience } from "../../../content/docs/types";
import EmbedNotice from "../../components/docs/EmbedNotice";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

/**
 * Chrome-less twin of `/docs/[audience]`: the same pages, gated by the same
 * rule, minus the header/sidebar/search — it exists to be iframed by the
 * in-app `DocsPanel` drawer, which already has its own header and lives on
 * a page that has its own navigation. Same-origin, so the session cookie is
 * sent with the frame request and this gate holds exactly as it does for
 * the full manual; a TA can no more frame `/docs-embed/staff/...` than open
 * `/docs/staff/...` directly.
 */
export default async function EmbedLayout({
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
  // No redirect() here: from inside a frame it navigates the FRAME, which
  // put the login (or 403) page inside the drawer. A notice renders instead;
  // its sign-in link targets the top window (see EmbedNotice). The children
  // — the page content — are not rendered at all in either case.
  const blocked = !me ? "expired" : !canViewAudience(me, audience) ? "forbidden" : null;

  return (
    <div className="min-h-screen bg-white px-5 py-5 sm:px-6">
      <div className="mx-auto max-w-[760px]">
        {blocked ? <EmbedNotice kind={blocked} audience={audience} /> : children}
      </div>
    </div>
  );
}
