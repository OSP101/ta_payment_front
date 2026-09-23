"use client";
import { useEffect, useState } from "react";
import { isDemoMode } from "./api";

/**
 * Whether this tab is in the demo sandbox. Read after mount, never during
 * render: the server has no sessionStorage, so reading it while rendering
 * would give SSR and the first client render different answers (a
 * hydration mismatch). `false` until then.
 */
export default function useIsDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(isDemoMode()), []);
  return demo;
}
