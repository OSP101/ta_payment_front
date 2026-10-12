/**
 * Browser half of error reporting — see app/lib/errorReporting.ts.
 *
 * Starts only when the root layout rendered the config <meta> (the server has
 * SENTRY_DSN), so a developer machine and any deployment without GlitchTip
 * load the SDK code but never initialise it and never send anything.
 *
 * Events go to TUNNEL_PATH on this same origin, never to GlitchTip directly:
 * CSP connect-src stays 'self' (proxy.ts), ad blockers have nothing to match,
 * and the GlitchTip address in the DSN can be an internal docker name.
 */
import * as Sentry from "@sentry/nextjs";
import { CONFIG_META, TUNNEL_PATH, scrubBreadcrumb, scrubEvent, type BrowserConfig } from "./app/lib/errorReporting";

function readConfig(): BrowserConfig | null {
  try {
    const raw = document.querySelector(`meta[name="${CONFIG_META}"]`)?.getAttribute("content");
    return raw ? (JSON.parse(raw) as BrowserConfig) : null;
  } catch {
    return null;
  }
}

const config = typeof document !== "undefined" ? readConfig() : null;

if (config) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tunnel: TUNNEL_PATH,
    sendDefaultPii: false,
    // Errors only. GlitchTip has no session replay, and performance tracing
    // would multiply the event volume on a 4 GB VM for little gain here.
    tracesSampleRate: 0,
    // Enough trail to see the clicks and API calls that led up to a crash.
    maxBreadcrumbs: 50,
    ignoreErrors: [
      // Benign browser noise, reported by every Sentry user.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // A request the page itself cancelled on navigation.
      "AbortError",
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
}

// Navigation breadcrumbs for App Router transitions. A no-op when not
// initialised.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
