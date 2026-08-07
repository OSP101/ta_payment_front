"use client";

import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * A DriveStep that may declare what to do when its target element is not on
 * the page right now: drop the step (default) or show it as a centered card.
 * `fallbackCenter` fits steps that teach UI the user has to summon first
 * (e.g. the TA form card that appears only after pressing "เพิ่ม TA").
 */
export type TourStep = DriveStep & { fallbackCenter?: boolean };

/**
 * Wrapper around driver.js configured for the onboarding tours:
 * Thai button labels, KKU theming (see globals.css `.kku-tour`), and
 * filtering out steps whose target element is not on the page right now
 * (empty tables, permission-gated buttons, collapsed sections).
 */
export function startTour(steps: TourStep[], onDone?: () => void): Driver | null {
  const visible: DriveStep[] = [];
  for (const s of steps) {
    const { fallbackCenter, ...drive } = s;
    if (!drive.element || typeof drive.element !== "string") {
      visible.push(drive);
      continue;
    }
    if (document.querySelector(drive.element)) {
      visible.push(drive);
    } else if (fallbackCenter) {
      visible.push({ ...drive, element: undefined });
    }
  }
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
