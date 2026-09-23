"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ChevronRight, Menu, Search, X } from "lucide-react";
import AudienceSwitch from "./AudienceSwitch";
import SearchDialog from "./SearchDialog";
import { AUDIENCE_LABEL, type Audience, type DocPage } from "../../../content/docs/types";
import { docHref } from "../../../content/docs/registry";
import { APP_VERSION } from "../../lib/docs/version";

export interface SidebarSection { section: string; pages: DocPage[] }

/**
 * The grouped sidebar list. Module-level on purpose: declared inside
 * DocsShell's render it was a NEW component type on every state change, so
 * React remounted the whole nav each time — keyboard focus fell to <body>
 * after toggling a section, and the sidebar's scroll reset on every ⌘K.
 */
function NavList({
  sections,
  audience,
  pathname,
  collapsedSections,
  onToggle,
}: {
  sections: SidebarSection[];
  audience: Audience;
  pathname: string | null;
  collapsedSections: Set<string>;
  onToggle: (section: string) => void;
}) {
  return (
    <nav className="space-y-4">
      {sections.map(({ section, pages }) => {
        const collapsed = collapsedSections.has(section);
        return (
          <div key={section}>
            <button
              type="button"
              onClick={() => onToggle(section)}
              className="flex w-full items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
            >
              {section}
              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            {!collapsed && (
              <ul className="mt-1 space-y-0.5">
                {pages.map((p) => {
                  const href = docHref(p, audience);
                  const active = pathname === href;
                  return (
                    <li key={`${p.audience}:${p.slug}`}>
                      <Link
                        href={href}
                        className={
                          "block rounded-md px-2.5 py-1.5 text-sm transition-colors " +
                          (active
                            ? "bg-accent-soft/60 text-accent-soft-foreground font-medium"
                            : "text-foreground/80 hover:bg-slate-100")
                        }
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Chrome for every `/docs/[audience]/*` page: header (brand, audience
 * switch, search, version) + collapsible sidebar (desktop) / drawer
 * (mobile). Modeled on docs.docker.com / nextjs.org's own layout — segmented
 * audience switch up top, grouped sidebar nav, content column capped for
 * reading width, and a search box that opens on ⌘K/Ctrl+K from anywhere in
 * the manual.
 */
export default function DocsShell({
  audience,
  allowedAudiences,
  sections,
  homeHref,
  children,
}: {
  audience: Audience;
  allowedAudiences: Audience[];
  sections: SidebarSection[];
  homeHref: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleSection = (s: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex items-center gap-3 py-2.5">
            <button
              type="button"
              className="lg:hidden -ms-1 rounded-md p-1.5 hover:bg-slate-100"
              onClick={() => setMobileOpen(true)}
              aria-label="เปิดเมนู"
            >
              <Menu size={20} />
            </button>
            <Link href={homeHref} className="flex items-center gap-2 shrink-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-(--brand) text-white">
                <BookOpen size={15} />
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-foreground">คู่มือการใช้งาน</span>
            </Link>
            {/* Desktop: switch sits centered in the header row itself. Mobile
                drops it to its own full-width row below (see after this div) —
                three Thai labels ("เจ้าหน้าที่", "ผู้ช่วยสอน"...) never fit this
                pill cluster's compact padding at 375px without wrapping
                mid-word, so it needs the full row's width there instead. */}
            <div className="hidden flex-1 justify-center sm:flex">
              <AudienceSwitch current={audience} allowed={allowedAudiences} />
            </div>
            <div className="flex-1 sm:hidden" />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-1.5 text-sm text-muted hover:bg-slate-100 transition-colors"
            >
              <Search size={15} />
              <span className="hidden md:inline">ค้นหา…</span>
              <kbd className="hidden md:inline rounded border border-border bg-white px-1 text-[10px]">⌘K</kbd>
            </button>
            <span className="hidden sm:inline shrink-0 text-[11px] text-muted">v{APP_VERSION}</span>
            <button
              type="button"
              onClick={() => router.push(homeHref)}
              className="hidden sm:inline shrink-0 text-xs text-muted hover:text-foreground underline underline-offset-2"
            >
              กลับสู่ระบบ
            </button>
          </div>
          {allowedAudiences.length > 1 && (
            <div className="pb-2.5 sm:hidden">
              <AudienceSwitch current={audience} allowed={allowedAudiences} variant="full" />
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <aside className="hidden lg:block w-64 shrink-0 border-e border-border px-3 py-6">
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pe-2">
            <NavList sections={sections} audience={audience} pathname={pathname} collapsedSections={collapsedSections} onToggle={toggleSection} />
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="docs-anim-fade absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="docs-anim-slide-start absolute inset-y-0 start-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">เมนูคู่มือ</span>
                <button type="button" onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู">
                  <X size={18} />
                </button>
              </div>
              <NavList sections={sections} audience={audience} pathname={pathname} collapsedSections={collapsedSections} onToggle={toggleSection} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-[760px] xl:max-w-[1040px]">{children}</div>
        </main>
      </div>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentAudience={audience}
        searchableAudiences={allowedAudiences}
      />
    </div>
  );
}
