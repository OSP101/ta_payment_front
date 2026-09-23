"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api, isDemoMode } from "../lib/api";

/**
 * Enforces the 15-minute idle timeout and reacts to a single-device-login
 * kick, on the client side. The server is the actual authority — see
 * AccountGuard in internal/handler/middleware.go, which rejects a request on
 * a session that has gone quiet for 15 minutes or been superseded by another
 * login, no matter what this component does or fails to do. What THIS buys is
 * the "ตัดทันทีไม่เตือน" requirement actually landing at 15 minutes on the
 * wall clock: without it, a tab sitting on a page with no background polling
 * would only discover its session was dead the next time the user clicked
 * something, which reads as "logged out eventually", not "logged out at 15
 * minutes".
 *
 * Two things a naive mousemove/keydown listener would miss, handled here:
 *
 *  1. Multiple tabs. Activity in one tab has to reset the idle clock in every
 *     other tab too, and a timeout firing in one tab has to log out all of
 *     them together — otherwise a user working in tab A gets silently kicked
 *     out of tab B mid-idle-window, with no idea why. BroadcastChannel
 *     handles both directions.
 *  2. <PdfFrame>'s <iframe>. Mouse/keyboard events inside an iframe's own
 *     document never bubble to this window — an officer reading a PDF for 20
 *     minutes would otherwise get treated as idle. Polling
 *     document.activeElement for "it's the iframe" sidesteps needing any
 *     cooperation from the iframe's content (which may be a same-origin PDF
 *     viewer today but there is no reason to couple this to that).
 *  3. The manual drawer's <iframe> (/docs-embed, see DocsPanel). Reading and
 *     scrolling there never focuses the frame, so (2) misses it. The embed
 *     runs this component as a FOLLOWER only: it forwards its own activity
 *     to the parent page (postMessage, same origin) and does nothing else —
 *     no timer, no heartbeat, and above all no redirect, which would put the
 *     login page inside the drawer. The parent treats a forwarded event
 *     exactly like its own.
 */

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;
// How often local activity is allowed to reset the timer / broadcast / check
// the heartbeat gate. mousemove alone can fire dozens of times a second;
// nothing here needs finer granularity than a few seconds against a
// 15-minute window, and un-throttled it would touch a BroadcastChannel and a
// couple of refs on every pixel of mouse movement.
const ACTIVITY_THROTTLE_MS = 3000;
const IFRAME_POLL_MS = 30 * 1000;
const CHANNEL_NAME = "tapay:session-activity";

// Pages reachable without a live session — running the idle/heartbeat
// machinery there would just generate 401s that redirect back to a page
// that's already /login, or spend heartbeats on the public share links,
// which are intentionally not authenticated at all (see router.go).
const SKIP_PREFIXES = ["/login", "/p/", "/demo"];

type BroadcastMsg = { type: "activity"; at: number } | { type: "logout" };

// postMessage type the /docs-embed frame sends its parent on activity.
const EMBED_ACTIVITY = "tapay:docs-embed-activity";
const EMBED_PREFIX = "/docs-embed";

export default function SessionActivityGuard() {
  const pathname = usePathname();
  const skip = SKIP_PREFIXES.some(p => pathname.startsWith(p));
  const embedded = pathname.startsWith(EMBED_PREFIX);
  const lastHandledRef = useRef(0);

  // Follower mode inside the manual drawer's frame — see (3) above.
  useEffect(() => {
    if (!embedded || typeof window === "undefined" || window.parent === window) return;
    let last = 0;
    const forward = () => {
      const now = Date.now();
      if (now - last < ACTIVITY_THROTTLE_MS) return;
      last = now;
      try {
        window.parent.postMessage({ type: EMBED_ACTIVITY }, window.location.origin);
      } catch {
        /* parent gone — nothing to keep alive */
      }
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart", "wheel"];
    for (const ev of events) window.addEventListener(ev, forward, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, forward);
    };
  }, [embedded]);

  useEffect(() => {
    if (skip || embedded || typeof window === "undefined") return;

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHeartbeatAt = 0;
    let done = false;

    function scheduleIdleTimeout() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(logout, IDLE_LIMIT_MS);
    }

    function logout() {
      if (done) return;
      done = true;
      channel?.postMessage({ type: "logout" } satisfies BroadcastMsg);
      redirectToLogin();
    }

    function redirectToLogin() {
      // A demo tester idling out must land back on /demo, never /login —
      // same reasoning as api.ts's handleAuthRedirect, which this component
      // otherwise duplicates without going through: /login authenticates
      // against production, which a sandbox visitor has no account for, and
      // sending them there reads as "you got logged out of the real
      // system." Checked fresh here (not hoisted out of the closure) since
      // this function is only ever called once per mount, right when the
      // timeout actually fires.
      const authPage = isDemoMode() ? "/demo" : "/login";
      if (window.location.pathname.startsWith(authPage)) return;
      const next = window.location.pathname + window.location.search;
      // Best-effort: the session is already dead server-side (that's WHY this
      // fired), so this mainly clears the cookie a little sooner than the
      // browser would notice on its own. Never block the redirect on it.
      void api.post("/auth/logout").catch(() => {});
      window.location.assign(`${authPage}?reason=session_idle&next=${encodeURIComponent(next)}`);
    }

    function maybeHeartbeat() {
      const now = Date.now();
      if (now - lastHeartbeatAt < HEARTBEAT_MIN_INTERVAL_MS) return;
      lastHeartbeatAt = now;
      // A failed heartbeat needs no handling here: a 401 already carries the
      // right ?reason= via api.ts's handleAuthRedirect, and any other failure
      // (network blip) just means the idle timer above remains the backstop.
      void api.post("/auth/heartbeat").catch(() => {});
    }

    function onActivity(broadcast: boolean) {
      const now = Date.now();
      if (now - lastHandledRef.current < ACTIVITY_THROTTLE_MS) return;
      lastHandledRef.current = now;
      scheduleIdleTimeout();
      if (broadcast) channel?.postMessage({ type: "activity", at: now } satisfies BroadcastMsg);
      maybeHeartbeat();
    }

    const localActivity = () => onActivity(true);
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    for (const ev of events) window.addEventListener(ev, localActivity, { passive: true });

    const iframePoll = setInterval(() => {
      if (document.activeElement?.tagName === "IFRAME") onActivity(true);
    }, IFRAME_POLL_MS);

    // Activity forwarded by the manual drawer's frame — same origin only.
    const fromEmbed = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: unknown } | null)?.type === EMBED_ACTIVITY) onActivity(true);
    };
    window.addEventListener("message", fromEmbed);

    if (channel) {
      channel.onmessage = (e: MessageEvent<BroadcastMsg>) => {
        if (done) return;
        if (e.data.type === "activity") {
          scheduleIdleTimeout();
        } else if (e.data.type === "logout") {
          done = true;
          redirectToLogin();
        }
      };
    }

    scheduleIdleTimeout();

    return () => {
      for (const ev of events) window.removeEventListener(ev, localActivity);
      if (idleTimer) clearTimeout(idleTimer);
      clearInterval(iframePoll);
      window.removeEventListener("message", fromEmbed);
      channel?.close();
    };
  }, [skip, embedded]);

  return null;
}
