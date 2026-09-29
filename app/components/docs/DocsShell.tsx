"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookMarked, Calculator, CalendarDays, CalendarHeart, CircleHelp, ClipboardCheck, Clock, FileCheck2,
  FileText, FolderOpen, GraduationCap, Landmark, LayoutGrid, Megaphone, PackageCheck, Rocket, Route,
  Send, Settings, ShieldCheck, UserRound, Users, Wrench, ChevronDown, Menu, Search, X,
  type LucideIcon,
} from "lucide-react";
import AudienceSwitch from "./AudienceSwitch";
import SearchDialog from "./SearchDialog";
import BackToTop from "./BackToTop";
import type { Audience } from "../../../content/docs/types";
import { docHref, type DocPageMeta } from "../../../content/docs/meta";
import { APP_VERSION, DOCS_UPDATED, thaiDate } from "../../lib/docs/version";
import { Tip } from "../ui";

// Metadata only — the server layout maps pages through `toMeta`, so no page
// text rides along in this client component's props.
export interface SidebarSection { section: string; pages: DocPageMeta[] }

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
  filter,
}: {
  sections: SidebarSection[];
  audience: Audience;
  pathname: string | null;
  collapsedSections: Set<string>;
  onToggle: (section: string) => void;
  filter: string;
}) {
  const q = filter.trim().toLowerCase();
  const shown = sections
    .map(({ section, pages }) => ({
      section,
      pages: q ? pages.filter((p) => p.title.toLowerCase().includes(q) || section.toLowerCase().includes(q)) : pages,
    }))
    .filter((s) => s.pages.length > 0);

  if (shown.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted">ไม่พบหัวข้อที่ตรงกับ “{filter}”</p>;
  }
  return (
    <nav className="space-y-5">
      {shown.map(({ section, pages }) => {
        // a filter always shows its matches, even inside a collapsed group
        const collapsed = !q && collapsedSections.has(section);
        return (
          <div key={section}>
            <button
              type="button"
              onClick={() => onToggle(section)}
              aria-expanded={!collapsed}
              className="group flex w-full items-center justify-between px-3 pb-1.5 text-[12.5px] font-medium tracking-wide text-slate-500 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                {(() => { const Icon = SECTION_ICON[section] ?? FolderOpen; return <Icon size={15} className="shrink-0 text-slate-400 group-hover:text-foreground" aria-hidden="true" />; })()}
                {section}
              </span>
              <ChevronDown size={14} className={"text-slate-400 transition-transform " + (collapsed ? "-rotate-90" : "")} aria-hidden="true" />
            </button>
            {!collapsed && (
              <ul className="ms-[19px] space-y-0.5 border-s border-slate-200 ps-2">
                {pages.map((p) => {
                  const href = docHref(p, audience);
                  const active = pathname === href;
                  return (
                    <li key={`${p.audience}:${p.slug}`}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={
                          "block rounded-lg px-3 py-1.5 text-[14px] leading-6 transition-colors " +
                          (active
                            ? "bg-slate-200/70 font-semibold text-foreground"
                            : "text-foreground/75 hover:bg-slate-100 hover:text-foreground")
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

/** One icon per sidebar section, so a long menu scans by shape as well as by
 *  word (developers.cloudflare.com does the same). Unknown sections fall
 *  back to a folder rather than rendering nothing. */
const SECTION_ICON: Record<string, LucideIcon> = {
  "เริ่มต้น": Rocket,
  "บัญชีและการเข้าใช้": UserRound,
  "รายวิชา": GraduationCap,
  "คำขอ TA": Send,
  "เอกสาร": FileText,
  "ตารางเรียน": CalendarDays,
  "ลงเวลา": Clock,
  "วันชดเชย": CalendarHeart,
  "รายงาน": ClipboardCheck,
  "ติดตาม": Route,
  "งบ": Calculator,
  "ผู้บริหาร": Landmark,
  "อ้างอิง": BookMarked,
  "คำถามที่พบบ่อย": CircleHelp,
  "ตั้งค่า": Settings,
  "ผู้ใช้": Users,
  "ประกาศ": Megaphone,
  "ขั้นที่ 1: ตรวจคำร้องขอ TA": ClipboardCheck,
  "ขั้นที่ 2: ตรวจเอกสาร TA": FileCheck2,
  "ขั้นที่ 3: ตรวจและส่งออกเอกสาร": PackageCheck,
  "ปฏิบัติงาน": LayoutGrid,
  "ระบบ": Wrench,
  "Admin": ShieldCheck,
};

/** The "กรองเมนู" box above the sidebar, as on developers.cloudflare.com. */
function NavFilter({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className="relative mb-5">
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { onChange(""); (e.target as HTMLInputElement).blur(); } }}
        placeholder="กรองเมนู"
        aria-label="กรองหัวข้อในเมนู"
        className="h-10 w-full rounded-lg border border-border bg-white px-3 pe-9 text-sm text-foreground placeholder:text-slate-400 focus:border-(--brand) focus:outline-none"
      />
      {!value && (
        <kbd className="pointer-events-none absolute end-2.5 top-1/2 hidden lg:block -translate-y-1/2 rounded border border-border bg-slate-50 px-1.5 text-[11px] text-slate-500">/</kbd>
      )}
    </div>
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
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        // "/" jumps to the sidebar filter where the sidebar is on screen
        // (desktop); on a phone there is no sidebar, so it opens search.
        const f = filterRef.current;
        if (f && f.offsetParent !== null) f.focus();
        else setSearchOpen(true);
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
          <div className="flex items-center gap-3 py-3">
            <Tip content="เปิดเมนู"><button
              type="button"
              className="lg:hidden -ms-1 rounded-md p-1.5 hover:bg-slate-100"
              onClick={() => setMobileOpen(true)}
              aria-label="เปิดเมนู"
            >
              <Menu size={20} />
            </button></Tip>
            <Link href={homeHref} className="flex items-center gap-2.5 shrink-0" aria-label="COCO TAS Docs หน้าแรกของระบบ">
              <Image src="/images/logo-cp-1.png" alt="" width={32} height={32} priority className="h-8 w-8 shrink-0 object-contain" />
              <span className="text-[15px] sm:text-[17px] font-bold tracking-[0.02em] text-foreground">COCO TAS</span>
              <span className="rounded-md border border-slate-300 px-1.5 py-px text-[10px] sm:text-[11px] font-semibold tracking-[0.12em] text-slate-600">DOCS</span>
            </Link>
            <span className="hidden lg:block h-6 w-px bg-border ms-3" aria-hidden="true" />
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
              aria-label="ค้นหาในคู่มือ"
              className="flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-slate-500 hover:border-slate-300 transition-colors md:min-w-[200px]"
            >
              <Search size={17} aria-hidden="true" />
              <span className="hidden md:inline flex-1 text-start">ค้นหา</span>
              <span className="hidden md:flex gap-1" aria-hidden="true">
                <kbd className="rounded border border-border bg-slate-50 px-1.5 text-[11px]">⌘</kbd>
                <kbd className="rounded border border-border bg-slate-50 px-1.5 text-[11px]">K</kbd>
              </span>
            </button>
            <span className="hidden md:inline shrink-0 text-[11px] text-slate-400">v{APP_VERSION}</span>
            <span className="hidden sm:block h-6 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={() => router.push(homeHref)}
              className="hidden sm:inline-flex h-10 shrink-0 items-center rounded-full bg-(--brand) px-5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
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
        <aside className="hidden lg:block w-72 shrink-0 border-e border-border bg-slate-50/60 px-4 py-6">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pe-1">
            <NavFilter value={filter} onChange={setFilter} inputRef={filterRef} />
            <NavList sections={sections} audience={audience} pathname={pathname} collapsedSections={collapsedSections} onToggle={toggleSection} filter={filter} />
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="docs-anim-fade absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="docs-anim-slide-start absolute inset-y-0 start-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">เมนูคู่มือ</span>
                <Tip content="ปิดเมนู"><button type="button" onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู">
                  <X size={18} />
                </button></Tip>
              </div>
              <NavFilter value={filter} onChange={setFilter} />
              <NavList sections={sections} audience={audience} pathname={pathname} collapsedSections={collapsedSections} onToggle={toggleSection} filter={filter} />
              <button
                type="button"
                onClick={() => router.push(homeHref)}
                className="mt-6 flex h-10 w-full items-center justify-center rounded-full bg-(--brand) text-sm font-semibold text-white"
              >
                กลับสู่ระบบ
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-[760px] xl:max-w-[1040px]">
            {children}
            <footer className="mt-16 border-t border-border pt-6 pb-2 text-xs leading-6 text-muted">
              <div>ปรับปรุงคู่มือล่าสุด {thaiDate(DOCS_UPDATED)} ตรงกับระบบเวอร์ชัน {APP_VERSION}</div>
              <div>© {new Date(DOCS_UPDATED).getFullYear() + 543} วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น สงวนลิขสิทธิ์</div>
            </footer>
          </div>
        </main>
      </div>

      <BackToTop />

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentAudience={audience}
      />
    </div>
  );
}
