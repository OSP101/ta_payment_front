"use client";
// Thin wrapper over HeroUI's toast queue so the whole app has ONE consistent
// way to show success/error feedback. The <Toast.Provider> is mounted in
// SWRProvider. HeroUI toasts are announced via aria-live and auto-dismiss.
import { toast } from "@heroui/react";
import { errMessage } from "./api";

export const notify = {
  success(message: string) {
    toast.success(message);
  },
  error(e: unknown, fallback?: string) {
    const msg = typeof e === "string" ? e : errMessage(e);
    toast.danger(msg || fallback || "เกิดข้อผิดพลาด กรุณาลองใหม่");
  },
  info(message: string) {
    toast.info(message);
  },
  warning(message: string) {
    toast.warning(message);
  },
};

/**
 * Wrap an async action so it shows an error toast on failure and (optionally) a
 * success toast on completion. Rethrows so callers can still branch. Returns the
 * resolved value on success, or undefined on handled failure when `swallow`.
 */
export async function withToast<T>(
  fn: () => Promise<T>,
  opts: { success?: string; swallow?: boolean } = {}
): Promise<T | undefined> {
  try {
    const r = await fn();
    if (opts.success) notify.success(opts.success);
    return r;
  } catch (e) {
    notify.error(e);
    if (opts.swallow) return undefined;
    throw e;
  }
}
