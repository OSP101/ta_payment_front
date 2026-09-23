"use client";
import { usePathname } from "next/navigation";
import { BookOpen, ExternalLink } from "lucide-react";
import type { Audience } from "../../../content/docs/types";
import { resolvePageDoc, useDocsPanel } from "./DocsPanel";

/**
 * The "📖 คู่มือ <หัวข้อ>" pill under every page title — the Cloudflare
 * dashboard's per-page "<Topic> documentation" button. This replaced the
 * top-bar "คู่มือการใช้งาน" button: a pill that names the exact topic, sitting
 * where the eye lands first, beats one generic button in the chrome.
 *
 * Which doc: see `resolvePageDoc` (explicit prop, else the `data-tour` key,
 * else the current route). No match → the audience's Getting Started page,
 * labelled plainly. Renders nothing outside a Shell (login, public pages)
 * where there is no drawer to open.
 *
 * Drawer or new tab: a screen whose manual is ONE page (ตรวจสอบเอกสาร TA)
 * opens in the side drawer, so the screen stays visible while reading. A
 * screen that is a whole *topic* — several doc pages describe its tabs,
 * modals or sections (ลงเวลา has 6 sub-pages, คำขอ TA 6, ตั้งค่า 3) — opens
 * the full manual in a new tab instead: those need the sidebar to step
 * through the sub-pages, which a drawer showing one page at a time is bad
 * at. Decided from the manual's own structure (`hasSubPages`, from
 * `screenSubPages` on the server), not per page by hand. Shared "common"
 * pages (/account etc.) always use the drawer.
 *
 * Page titles come from the per-reader `/docs-index`, not a bundled copy of
 * the manual; until it arrives the pill shows the generic label (same size,
 * so nothing shifts) and still opens the manual.
 */
export default function PageDocsPill({ explicit, dataTour }: { explicit?: { audience: Audience; slug: string }; dataTour?: string }) {
  const { open, audience, index } = useDocsPanel();
  const pathname = usePathname();
  if (!audience) return null;

  const { target, page, bigTopic } = resolvePageDoc(index, audience, pathname ?? "", explicit, dataTour);
  const label = !page ? "คู่มือการใช้งาน" : bigTopic ? `คู่มือ ${page.section}` : `คู่มือ ${page.title}`;
  const pillClass = "mt-3 inline-flex items-center gap-1.5 rounded-full border border-(--brand)/40 bg-white px-3 py-1 text-sm text-(--brand) transition-colors hover:bg-accent-soft/40";

  if (bigTopic && target.slug) {
    return (
      <a href={`/docs/${target.audience}/${target.slug}`} target="_blank" rel="noopener" className={pillClass}>
        <BookOpen size={15} />
        {label}
        <ExternalLink size={12} className="opacity-70" />
      </a>
    );
  }
  return (
    <button type="button" onClick={() => open(target)} className={pillClass}>
      <BookOpen size={15} />
      {label}
    </button>
  );
}
