"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { startTour, type TourStep } from "./engine";

export type TourDef = {
  /** Unique key — also used for the "seen" flag in localStorage. */
  key: string;
  match: (path: string) => boolean;
  steps: TourStep[];
};

const DEFAULT_SEEN_PREFIX = "ta-payment:tour-seen:";

/**
 * Top-bar "สอนการใช้งาน" button, shared by every role area. Each area passes
 * its own tour definitions; the button starts the tour matching the current
 * page.
 *
 * The tour whose key equals `autoStartKey` auto-starts on the user's very
 * first visit; on other pages a not-yet-seen tour only makes the button
 * pulse — auto-opening a popover on every screen would get in the way of
 * real work.
 */
export default function TourLauncher({
  tours,
  autoStartKey,
  seenPrefix = DEFAULT_SEEN_PREFIX,
}: {
  tours: TourDef[];
  autoStartKey?: string;
  /** Override to keep pre-existing "seen" flags valid (staff shipped first). */
  seenPrefix?: string;
}) {
  const pathname = usePathname();
  const tour = tours.find((t) => t.match(pathname ?? ""));
  const [unseen, setUnseen] = useState(false);
  const autoStarted = useRef(false);

  const launch = useCallback(() => {
    if (!tour) return;
    try {
      localStorage.setItem(seenPrefix + tour.key, "1");
    } catch {
      /* private mode — tour still runs, just re-pulses next time */
    }
    setUnseen(false);
    startTour(tour.steps);
  }, [tour, seenPrefix]);

  useEffect(() => {
    if (!tour) {
      setUnseen(false);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(seenPrefix + tour.key) !== null;
    } catch {
      seen = true;
    }
    setUnseen(!seen);
    if (tour.key === autoStartKey && !seen && !autoStarted.current) {
      autoStarted.current = true;
      // Give the page a moment to render its panels so the tour can anchor
      // to them instead of falling back to centered cards.
      const t = setTimeout(launch, 1200);
      return () => clearTimeout(t);
    }
  }, [tour, autoStartKey, launch]);

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
