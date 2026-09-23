"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { BookOpen, ExternalLink, X } from "lucide-react";
import type { Audience } from "../../../content/docs/types";
import type { DocPageMeta, DocsIndex } from "../../../content/docs/meta";
import { DOC_ANCHORS } from "../../../content/docs/anchors";
import { resolveDocForRoute } from "../../lib/docs/routeMap";

/**
 * Cloudflare-dashboard-style contextual help: the manual opens in a panel
 * BESIDE the page the reader is confused about, so the screen they're asking
 * about stays visible (and usable) while they read — instead of navigating
 * away to /docs/* and losing their place.
 *
 * On a desktop-width viewport (`lg:` and up) the panel is DOCKED: `Shell`
 * renders `<DocsDock />` as a flex sibling of `<main>`, so opening it
 * narrows the page rather than covering it, and the reader can keep
 * clicking the screen while following the steps. Below `lg` there is no
 * room to split, so the same element becomes a fixed overlay with a
 * backdrop — one component, two layouts, switched purely by breakpoint
 * classes so the open/close state never has to know the viewport.
 *
 * One provider, mounted once in `Shell.tsx` (so every role's shell gets it
 * for free), and any number of triggers: `PageHeader`'s docs pill
 * (page-level, resolves the doc from the current route) and inline
 * `DocsAnchor` book icons that a page can drop next to any section heading
 * to open the doc for THAT section — which is also the honest answer to the
 * "one URL, four tabs" problem the code review found on /staff/settings:
 * the tab picks its own doc, the URL doesn't have to.
 *
 * The drawer body is an <iframe> of `/docs-embed/<audience>/<slug>`, a
 * chrome-less render of the same page the full manual shows. An iframe,
 * not an in-place render, because doc pages contain Server Components
 * (`Screenshot`/`Gif` check the filesystem) that a client drawer can't
 * render itself, and it's exactly how Cloudflare's own panel works — it
 * embeds developers.cloudflare.com. Same origin, so the session cookie
 * rides along and the embed route enforces the same audience gate as the
 * full manual; nginx's `X-Frame-Options: SAMEORIGIN` permits it in prod.
 */

export interface DocsTarget {
  audience: Audience;
  /** Omit to open the audience's Getting Started page. */
  slug?: string;
}

interface DocsPanelState {
  target: DocsTarget | null;
  open: (target: DocsTarget) => void;
  close: () => void;
  /** The signed-in reader's own manual (from `defaultAudience(me)`), so a
   *  shared component like `PageHeader` can resolve "the doc for this page"
   *  without every page telling it which audience it belongs to. `null`
   *  outside a Shell. */
  audience: Audience | null;
  /** Page list of every manual this reader may open (`/docs-index`), or
   *  null while it loads / if it failed — callers then show the generic
   *  pill. Never page text; see content/docs/meta.ts. */
  index: DocsIndex | null;
}

/** What `resolvePageDoc` found for the screen a pill sits on. */
export interface ResolvedDoc {
  target: DocsTarget;
  /** undefined → no doc for this screen: open the audience's landing page. */
  page?: DocPageMeta;
  /** The screen's doc is a topic spread over several pages — open the full
   *  manual in a new tab rather than one page in the drawer. */
  bigTopic: boolean;
}

/**
 * Which doc the page-level pill opens. An explicit target wins; else the
 * `data-tour` key via content/docs/anchors.ts; else the current route.
 *
 * The area of the app the page lives in beats the reader's own role: staff
 * and admin can open /lecturer and /ta pages to act on someone's behalf, and
 * the doc for /lecturer is in the lecturer manual regardless of who's
 * reading. Pages with no role prefix (/account, /announcements) fall back to
 * the reader's audience — their docs are shared across all three anyway.
 * Access is still enforced by the embed route the drawer loads.
 */
export function resolvePageDoc(
  index: DocsIndex | null,
  readerAudience: Audience,
  pathname: string,
  explicit?: { audience: Audience; slug: string },
  dataTour?: string,
): ResolvedDoc {
  const areaAudience: Audience =
    pathname.startsWith("/staff") ? "staff"
      : pathname.startsWith("/lecturer") ? "lecturer"
        : pathname.startsWith("/ta") ? "ta"
          : readerAudience;
  const mapped = dataTour ? DOC_ANCHORS[dataTour] : undefined;
  let target: DocsTarget | undefined = explicit ?? mapped;
  if (!target && index) {
    const p = resolveDocForRoute(pathname, index[areaAudience] ?? []);
    if (p) target = { audience: areaAudience, slug: p.slug };
  }
  const page = target?.slug ? index?.[target.audience]?.find((p) => p.slug === target!.slug) : undefined;
  return {
    target: target ?? { audience: areaAudience },
    page,
    bigTopic: !!page && page.hasSubPages,
  };
}

async function fetchDocsIndex(): Promise<DocsIndex> {
  // Not the app-wide SWR fetcher: that one prefixes /api/v1 (the Go backend),
  // and this is a Next route handler.
  const res = await fetch("/docs-index", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`docs-index ${res.status}`);
  return (await res.json()) as DocsIndex;
}

const DocsPanelContext = createContext<DocsPanelState | null>(null);

export function useDocsPanel(): DocsPanelState {
  const ctx = useContext(DocsPanelContext);
  if (!ctx) {
    // Outside a Shell (e.g. the login page) there's no drawer to open —
    // callers fall back to a plain link, so this is a no-op, not a throw.
    return { target: null, open: () => {}, close: () => {}, audience: null, index: null };
  }
  return ctx;
}

export function DocsPanelProvider({ audience, children }: { audience: Audience; children: React.ReactNode }) {
  const [target, setTarget] = useState<DocsTarget | null>(null);
  const open = useCallback((t: DocsTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);
  // Array key: keeps it out of the global fetcher's string-path space. Quiet
  // on failure (overrides SWRProvider's toast) — the pill simply stays
  // generic, which still opens the manual.
  const { data: index } = useSWR(["docs-index"], fetchDocsIndex, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onError: () => {},
  });
  const value = useMemo(
    () => ({ target, open, close, audience, index: index ?? null }),
    [target, open, close, audience, index],
  );
  // The panel itself is NOT rendered here: `Shell` places `<DocsDock />`
  // inside its flex row so the docked layout can take a column next to
  // <main>. A provider that rendered it as a trailing sibling of `children`
  // would put it outside that row and it could only ever overlay.
  return <DocsPanelContext.Provider value={value}>{children}</DocsPanelContext.Provider>;
}

export function fullDocsHref(t: DocsTarget): string {
  return t.slug ? `/docs/${t.audience}/${t.slug}` : `/docs/${t.audience}`;
}

function embedHref(t: DocsTarget): string {
  return t.slug ? `/docs-embed/${t.audience}/${t.slug}` : `/docs-embed/${t.audience}`;
}

/**
 * The panel. Render it as a direct child of the app's root flex row, after
 * `<main>`. Docked (a sticky, full-height column) from `lg` up; a fixed
 * right-hand overlay with a backdrop below that.
 */
export function DocsDock() {
  const { target, close } = useDocsPanel();

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;

  return (
    <>
      {/* Backdrop only while the panel overlays (below lg). Docked, the
          page beside it stays interactive, which is the whole point. */}
      <div className="docs-anim-fade fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={close} />
      <aside
        role="complementary"
        aria-label="คู่มือการใช้งาน"
        className="docs-anim-slide-end fixed inset-y-0 end-0 z-50 flex w-[460px] max-w-[92vw] flex-col border-s border-border bg-white shadow-2xl
                   lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:w-[440px] lg:max-w-none lg:shrink-0 lg:shadow-none xl:w-[480px]"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-(--brand) text-white">
            <BookOpen size={15} />
          </span>
          <span className="text-sm font-semibold text-foreground">คู่มือการใช้งาน</span>
          {/* New tab, and the panel stays open — the reader asked for the
              full manual (sidebar, search, all topics) *in addition to* the
              screen they're on, not instead of it. Same as Cloudflare's
              "Go to full documentation ↗". */}
          <Link
            href={fullDocsHref(target)}
            target="_blank"
            rel="noopener"
            className="ms-auto inline-flex items-center gap-1 text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            เปิดคู่มือฉบับเต็ม <ExternalLink size={12} />
          </Link>
          <button type="button" onClick={close} aria-label="ปิดคู่มือ" className="ms-1 rounded-md p-1.5 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <iframe
          key={embedHref(target)}
          src={embedHref(target)}
          title="คู่มือการใช้งาน"
          className="min-h-0 flex-1 w-full border-0"
        />
      </aside>
    </>
  );
}
