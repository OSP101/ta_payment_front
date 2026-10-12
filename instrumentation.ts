/**
 * Server half of error reporting — see app/lib/errorReporting.ts.
 *
 * Reports errors thrown while rendering a page, in a route handler or in a
 * server action. Errors from the Go API are reported by the API itself
 * (ta_payment_back/internal/errtrack), not here.
 */
import type { Instrumentation } from "next";

let enabled = false;

export async function register() {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  // proxy.ts runs on the Node.js runtime in Next 16 and nothing in this app
  // opts into the edge runtime, so the Node SDK is the only one needed.
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  const { scrubEvent } = await import("./app/lib/errorReporting");
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    release: process.env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // onRequestError hands over every request header, Cookie included;
    // scrubEvent keeps User-Agent only.
    beforeSend: (event) => scrubEvent(event),
  });
  enabled = true;
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!enabled) return;
  const Sentry = await import("@sentry/nextjs");
  // The browser only ever sees a server render failure as this digest
  // (app/error.tsx tags its own report with it), so tagging the server-side
  // report the same way is what links the two in GlitchTip.
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  Sentry.withScope((scope) => {
    if (digest) scope.setTag("digest", digest);
    Sentry.captureRequestError(err, request, context);
  });
};
