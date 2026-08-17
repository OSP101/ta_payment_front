"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isLoading, subscribeLoading } from "../lib/loadingBar";

/**
 * YouTube/GitHub-style top progress bar driven by app/lib/loadingBar.ts's
 * in-flight-request counter (wired into api.ts's req()/upload()) — so any
 * page or action that hits the API shows visible progress instead of
 * looking frozen while it waits.
 *
 * SHOW_DELAY_MS holds off rendering anything for a beat: most requests
 * finish well under that, and a bar that flashes on and off for every
 * sub-100ms call would be more distracting than reassuring.
 */
const SHOW_DELAY_MS = 150;
const TRICKLE_MS = 250;
const FADE_MS = 200;

export default function TopLoadingBar() {
  const loading = useSyncExternalStore(subscribeLoading, isLoading, () => false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let trickleTimer: ReturnType<typeof setInterval> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      showTimer = setTimeout(() => {
        shownRef.current = true;
        setVisible(true);
        // Keep trickling from wherever a still-fading bar left off, rather
        // than snapping back down — back-to-back requests inside one
        // SHOW_DELAY_MS window are common (e.g. a page firing two fetches).
        setProgress(p => (p > 0 ? p : 20));
        trickleTimer = setInterval(() => {
          setProgress(p => p + (90 - p) * 0.15);
        }, TRICKLE_MS);
      }, SHOW_DELAY_MS);
    } else if (shownRef.current) {
      shownRef.current = false;
      setProgress(100);
      fadeTimer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, FADE_MS);
    }

    return () => {
      clearTimeout(showTimer);
      clearInterval(trickleTimer);
      clearTimeout(fadeTimer);
    };
  }, [loading]);

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[100] h-[3px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <div
        className="h-full bg-brand"
        style={{
          width: `${progress}%`,
          transition: `width ${progress >= 100 ? FADE_MS : TRICKLE_MS}ms ease`,
          boxShadow: "0 0 8px var(--color-brand)",
        }}
      />
    </div>
  );
}
