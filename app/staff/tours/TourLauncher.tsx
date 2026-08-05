"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { findTour } from "./definitions";
import { startTour } from "./engine";

const SEEN_PREFIX = "ta-payment:staff-tour-seen:";

/**
 * Top-bar "สอนการใช้งาน" button. Every staff page has its own tour
 * (see definitions.ts); the button starts the tour for the current page.
 *
 * The dashboard tour auto-starts on the officer's very first visit; on other
 * pages a not-yet-seen tour only makes the button pulse — auto-opening a
 * popover on every screen would get in the way of real work.
 */
export default function TourLauncher() {
  const pathname = usePathname();
  const tour = findTour(pathname ?? "");
  const [unseen, setUnseen] = useState(false);
  const autoStarted = useRef(false);

  const launch = useCallback(() => {
    if (!tour) return;
    try {
      localStorage.setItem(SEEN_PREFIX + tour.key, "1");
    } catch {
      /* private mode — tour still runs, just re-pulses next time */
    }
    setUnseen(false);
    startTour(tour.steps);
  }, [tour]);

  useEffect(() => {
    if (!tour) {
      setUnseen(false);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_PREFIX + tour.key) !== null;
    } catch {
      seen = true;
    }
    setUnseen(!seen);
    if (tour.key === "dashboard" && !seen && !autoStarted.current) {
      autoStarted.current = true;
      // Give the dashboard a moment to render its panels so the tour can
      // anchor to them instead of falling back to centered cards.
      const t = setTimeout(launch, 1200);
      return () => clearTimeout(t);
    }
  }, [tour, launch]);

  if (!tour) return null;

  return (
    <button
      type="button"
      data-tour="tour-button"
      onClick={launch}
      title="ดูคำแนะนำการใช้งานของหน้านี้"
      className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-(--border) bg-(--panel-bg) px-2.5 text-sm font-medium text-(--ink-2) transition-colors hover:bg-(--sidebar-hover) hover:text-(--ink-1)"
    >
      <GraduationCap size={16} />
      <span className="hidden lg:inline">สอนการใช้งาน</span>
      {unseen && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--brand) opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-(--brand)" />
        </span>
      )}
    </button>
  );
}
