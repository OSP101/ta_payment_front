"use client";

import { useEffect, useRef } from "react";

/**
 * A manual screen recording that behaves like a GIF: muted, looping, no sound
 * track, and it plays only while on screen. Recordings run 10-50 s, far too
 * heavy as real GIFs, so they ship as H.264 MP4 instead.
 *
 * Nothing is fetched until the clip scrolls near the viewport (preload="none"
 * plus the observer), so a page with several clips costs one video at a time.
 * Controls stay visible so a reader can pause, scrub or go full screen, and
 * under prefers-reduced-motion the clip never starts on its own.
 */
export default function DocVideo({
  src,
  poster,
  label,
  width,
  height,
}: {
  src: string;
  poster: string;
  label: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.preload = "metadata";
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      width={width}
      height={height}
      aria-label={label}
      className="block h-auto w-full bg-slate-50"
      muted
      loop
      playsInline
      controls
      preload="none"
    />
  );
}
