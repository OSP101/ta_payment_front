"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// useUnsavedChanges installs a document-level capture-phase click listener
// that intercepts internal-link navigation while `hasUnsaved` is true, so a
// TA who forgot to press Save can't silently blow away their edits by
// clicking a nav link. Returns a `pendingHref` (the target the user tried
// to reach), plus `confirm()` and `cancel()` — the consumer is expected to
// wire these into a ConfirmDialog. Kept split so the dialog can live in
// the caller's JSX tree (same theme, same z-index stack).
//
// Skipped intents (they don't discard data or already open a new context):
//   - modifier keys (meta/ctrl/shift/alt) or non-left-button clicks
//   - anchor with target="_blank"
//   - external hosts, hash-only, mailto:/tel:
//   - navigation to the same pathname+search
//
// The App-Router router doesn't emit `routeChangeStart`, so this listener
// is the only reliable hook point for in-app navigation guards.
export function useUnsavedChanges(hasUnsaved: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;
      if (rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const dest = url.pathname + url.search + url.hash;
      const here = window.location.pathname + window.location.search + window.location.hash;
      if (dest === here) return;
      // Intercept: block the browser + stop React Link's own handler from
      // running (capture phase fires before target's own listeners).
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(dest);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [hasUnsaved]);

  function confirm() {
    const dest = pendingHref;
    setPendingHref(null);
    if (dest) router.push(dest);
  }
  function cancel() {
    setPendingHref(null);
  }

  return { pendingHref, confirm, cancel };
}
