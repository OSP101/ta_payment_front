"use client";

import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Wrapper around driver.js configured for the staff onboarding tours:
 * Thai button labels, KKU theming (see globals.css `.kku-tour`), and
 * filtering out steps whose target element is not on the page right now
 * (empty tables, permission-gated buttons, collapsed sections).
 */
export function startTour(steps: DriveStep[], onDone?: () => void): Driver | null {
  const visible = steps.filter((s) => {
    if (!s.element) return true; // centered "modal" step
    if (typeof s.element !== "string") return true;
    return document.querySelector(s.element) !== null;
  });
  if (visible.length === 0) return null;

  const d = driver({
    steps: visible,
    showProgress: visible.length > 1,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "ถัดไป",
    prevBtnText: "ย้อนกลับ",
    doneBtnText: "เสร็จสิ้น",
    popoverClass: "kku-tour",
    overlayColor: "rgb(2, 20, 43)",
    overlayOpacity: 0.62,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    allowClose: true,
    disableActiveInteraction: true,
    onDestroyed: () => {
      onDone?.();
    },
  });
  d.drive();
  return d;
}
