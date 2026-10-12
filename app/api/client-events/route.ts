/**
 * Tunnel: the browser SDK posts its error envelopes here (same origin), and
 * this forwards them to GlitchTip over the internal docker network. See
 * app/lib/errorReporting.ts for why the browser never talks to GlitchTip.
 *
 * Only envelopes addressed to OUR project are forwarded; anything else is
 * refused, so this can't be used as an open relay into GlitchTip or anywhere
 * else. The client's IP is deliberately not passed on.
 */
import { NextResponse, type NextRequest } from "next/server";

// Error envelopes are a few KB; anything near this is not one.
const MAX_BYTES = 256 * 1024;

interface Target {
  key: string;
  projectId: string;
  envelopeUrl: string;
}

function target(): Target | null {
  const raw = (process.env.SENTRY_DSN ?? "").trim();
  if (!raw) return null;
  try {
    const dsn = new URL(raw);
    const projectId = dsn.pathname.replace(/^\/+|\/+$/g, "");
    if (!dsn.username || !/^\d+$/.test(projectId)) return null;
    return {
      key: dsn.username,
      projectId,
      envelopeUrl: `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const t = target();
  // Reporting is off on this server: accept and drop, so a page cached from
  // before the switch-off doesn't log a failed request on every error.
  if (!t) return new NextResponse(null, { status: 204 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  const body = await req.text();
  if (body.length > MAX_BYTES) return new NextResponse(null, { status: 413 });

  // First line of an envelope is its JSON header, carrying the DSN the
  // browser SDK was initialised with.
  let dsn: URL;
  try {
    const nl = body.indexOf("\n");
    const header = JSON.parse(nl === -1 ? body : body.slice(0, nl)) as { dsn?: string };
    dsn = new URL(header.dsn ?? "");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (dsn.username !== t.key || dsn.pathname.replace(/^\/+|\/+$/g, "") !== t.projectId) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const res = await fetch(t.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${t.key}, sentry_client=coco-tunnel/1`,
        // GlitchTip parses the browser/OS from this.
        "User-Agent": req.headers.get("user-agent") ?? "",
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return new NextResponse(null, { status: res.ok ? 200 : 502 });
  } catch {
    // GlitchTip down or slow: the report is lost, the page must not care.
    return new NextResponse(null, { status: 502 });
  }
}
