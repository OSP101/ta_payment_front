import { notFound } from "next/navigation";
import { getMe } from "../../lib/session";
import ErrorReportTest from "./ErrorReportTest";

/**
 * Admin-only check that error reporting works end to end on this deployment:
 * each button fails on purpose in one of the places a real bug can, and the
 * result should appear in GlitchTip within seconds (README "Error reporting").
 *
 * Not in any menu: it is opened by URL after a deploy, and a 404 for anyone
 * but an admin.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const me = await getMe();
  if (!me?.roles.includes("admin")) notFound();
  const { kind } = await searchParams;
  if (kind === "server") {
    // A Server Component render failure: reported by instrumentation.ts's
    // onRequestError on the server, and app/error.tsx in the browser.
    throw new Error("error-report test: server render failed (ignore, sent on purpose)");
  }
  return <ErrorReportTest />;
}
