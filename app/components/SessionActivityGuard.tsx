"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";

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
const SKIP_PREFIXES = ["/login", "/p/"];

type BroadcastMsg = { type: "activity"; at: number } | { type: "logout" };

export default function SessionActivityGuard() {
  const pathname = usePathname();
  const skip = SKIP_PREFIXES.some(p => pathname.startsWith(p));
  const lastHandledRef = useRef(0);

  useEffect(() => {
    if (skip || typeof window === "undefined") return;

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
      if (window.location.pathname.startsWith("/login")) return;
      const next = window.location.pathname + window.location.search;
      // Best-effort: the session is already dead server-side (that's WHY this
      // fired), so this mainly clears the cookie a little sooner than the
      // browser would notice on its own. Never block the redirect on it.
      void api.post("/auth/logout").catch(() => {});
      window.location.assign(`/login?reason=session_idle&next=${encodeURIComponent(next)}`);
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
      channel?.close();
    };
  }, [skip]);

  return null;
}
