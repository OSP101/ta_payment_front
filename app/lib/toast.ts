"use client";
// HeroUI's toast with one change: when the caller doesn't pass `timeout`, the
// toast stays up long enough to READ it. HeroUI's flat 4 s default cut a long
// Thai error ("วันเผยแพร่ใหม่ต้องอยู่ก่อนวันหมดอายุ (…) แก้ไขวันหมดอายุในหน้าแก้ไขก่อน")
// off mid-sentence, while a two-word "ลบแล้ว" hung around for nothing.
//
// Import `toast` from here, never from "@heroui/react" directly. The
// <Toast.Provider> itself still comes from HeroUI (see SWRProvider).
// Hovering or focusing a toast pauses its timer (react-aria), so a reader who
// needs longer than the estimate can still keep it open.
import { toast as heroToast } from "@heroui/react";
import type { ReactNode } from "react";

type Opts = NonNullable<Parameters<typeof heroToast.success>[1]>;
type Variant = "default" | "success" | "info" | "warning" | "danger";

// Thai has no spaces between words, so count characters, not words. ~14
// characters a second is a comfortable reading pace for a short notice; the
// base covers noticing the toast at all. Errors and warnings get extra time
// because the reader usually has to act on them.
const BASE_MS = 2500;
const MS_PER_CHAR = 70;
const MIN_MS: Record<Variant, number> = { default: 4000, success: 3500, info: 4500, warning: 6000, danger: 6000 };
const MAX_MS = 15000;

function textLength(node: ReactNode): number {
  if (node == null || typeof node === "boolean") return 0;
  if (typeof node === "string" || typeof node === "number") return String(node).length;
  if (Array.isArray(node)) return node.reduce((n, c) => n + textLength(c), 0);
  // A React element: we can't see the rendered text, so count its children
  // when they're plain, and assume a medium-length notice otherwise.
  const props = (node as { props?: { children?: ReactNode } }).props;
  return props && "children" in props ? textLength(props.children) : 60;
}

/** How long a toast with this title + description should stay on screen. */
export function readingTimeout(title: ReactNode, description?: ReactNode, variant: Variant = "default"): number {
  const chars = textLength(title) + textLength(description);
  return Math.min(MAX_MS, Math.max(MIN_MS[variant], BASE_MS + chars * MS_PER_CHAR));
}

function withTimeout(variant: Variant, message: ReactNode, opts?: Opts): Opts {
  if (opts?.timeout !== undefined) return opts;
  return { ...opts, timeout: readingTimeout(message, opts?.description, variant) };
}

export const toast = Object.assign(
  (message: ReactNode, opts?: Parameters<typeof heroToast>[1]) =>
    heroToast(message, { ...opts, timeout: opts?.timeout ?? readingTimeout(message, opts?.description) }),
  {
    success: (message: ReactNode, opts?: Opts) => heroToast.success(message, withTimeout("success", message, opts)),
    info: (message: ReactNode, opts?: Opts) => heroToast.info(message, withTimeout("info", message, opts)),
    warning: (message: ReactNode, opts?: Opts) => heroToast.warning(message, withTimeout("warning", message, opts)),
    danger: (message: ReactNode, opts?: Opts) => heroToast.danger(message, withTimeout("danger", message, opts)),
    promise: heroToast.promise,
    close: heroToast.close,
    clear: heroToast.clear,
    pauseAll: heroToast.pauseAll,
    resumeAll: heroToast.resumeAll,
    getQueue: heroToast.getQueue,
  },
);
