"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@heroui/react";
import { api, isDemoMode, setDemoApiPrefix } from "../lib/api";

/**
 * CSS variable Shell.tsx's fixed/sticky chrome (sidebar, mobile drawer,
 * TopBar) reads to sit BELOW this banner instead of under it — see that
 * file's own uses of it. Defaults to unset (→ 0px via each `var(…, 0px)`
 * fallback) everywhere this component isn't mounted or isn't active, which
 * is every non-demo page: Shell.tsx never needs to know demo mode exists,
 * it just always leaves room for whatever this variable currently says,
 * and production's "always 0" is that same code path, not a special case.
 */
const BANNER_HEIGHT_VAR = "--demo-banner-h";

/**
 * BETA-only: a sticky, unmissable strip shown on every page for the
 * duration of a demo-sandbox session (see docs/PLAN-demo-sandbox.md §7 —
 * "สีทั้งจอ + banner ค้าง" was a deliberate requirement so nobody mistakes
 * fake sandbox data for a real academic year's). Mounted once in
 * app/layout.tsx, next to SessionActivityGuard.
 *
 * Reads isDemoMode() client-side only — it is entirely driven by
 * sessionStorage (see api.ts's setDemoApiPrefix), which does not exist
 * during server rendering, so the check runs in an effect and the banner is
 * absent on first paint even in demo mode. That one-frame absence is the
 * right tradeoff over guessing from a cookie server-side: this component has
 * no server counterpart to keep in sync, and the sandbox is never mistaken
 * for production for longer than a paint.
 *
 * Re-checks on every pathname change, not just once at mount: app/demo's
 * role-picker calls setDemoApiPrefix and then router.push()es into the app
 * WITHOUT a full page reload, and this component — mounted once in the root
 * layout — is never remounted by that client-side navigation, so a
 * mount-only check would freeze at whatever isDemoMode() was on the very
 * first page this tab ever loaded (almost always "false"). usePathname()
 * changing on every route push is what gives this a reason to look again.
 */
export default function DemoBanner() {
  const [active, setActive] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(isDemoMode());
  }, [pathname]);

  // Keep BANNER_HEIGHT_VAR pixel-exact against the banner's REAL rendered
  // height rather than a hardcoded guess — the same one-line strip wraps to
  // two lines on a narrow viewport, and a stale/guessed height would leave
  // Shell.tsx's chrome either gapped or, worse, right back to overlapping.
  // Set on <html> (not a local ancestor) because Shell.tsx's sidebar is
  // `position: fixed`, which escapes any positioned ancestor's box — a CSS
  // var only reaches it through inheritance from a common ancestor both
  // trees share, and <html> is the only one guaranteed to be that.
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
      return;
    }
    const sync = () => {
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
    };
  }, [active]);

  if (!active) return null;

  async function exit() {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore — clearing local state below still gets them out */
    }
    setDemoApiPrefix(null);
    router.push("/demo");
    router.refresh();
  }

  return (
    <>
      {/* Screen-edge frame: fixed to the VIEWPORT (not the document), so it
          stays put on scroll instead of just marking the top of the page —
          the whole point is a border no amount of scrolling ever hides.
          pointer-events-none so it can sit at the highest z-index without
          intercepting a single click; inset-0 with only a border (no fill)
          means it never dims or blocks the real content either. */}
      <div className="pointer-events-none fixed inset-0 z-[60] border-4 border-warning" aria-hidden="true" />
      <div
        ref={ref}
        className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b border-warning-soft-border bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning-soft-foreground"
      >
        <FlaskConical size={14} className="shrink-0" />
        <span>
          โหมดทดลอง — ข้อมูลทั้งหมดในหน้านี้เป็นข้อมูลจำลอง ไม่ใช่ข้อมูลจริง
        </span>
        <Button size="sm" variant="ghost" onPress={exit} className="h-6 px-2 text-xs">
          ออกจากโหมดทดลอง
        </Button>
      </div>
    </>
  );
}
