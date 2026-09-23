"use client";
import { usePathname } from "next/navigation";
import { BookOpen, ExternalLink } from "lucide-react";
import type { Audience } from "../../../content/docs/types";
import { resolvePageDoc, useDocsPanel } from "./DocsPanel";
import useIsDemo from "../../lib/useIsDemo";

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
  // The demo sandbox keeps its API prefix in per-tab sessionStorage: a new
  // tab would start as production, its first heartbeat would 401 and bounce
  // the tester to the real /login. In demo the topic opens in this tab.
  const demo = useIsDemo();
  if (!audience) return null;

  const { target, page, bigTopic } = resolvePageDoc(index, audience, pathname ?? "", explicit, dataTour);
  const label = !page ? "คู่มือการใช้งาน" : bigTopic ? `คู่มือ ${page.section}` : `คู่มือ ${page.title}`;
  // The ONLY docs entry on a screen, so it is sized and coloured as a real
  // button (tinted brand fill, not a hairline outline) — the small per-section
  // icons it replaced were easy to miss and cluttered the toolbars.
  const btnClass =
    "mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-(--brand)/25 bg-accent-soft/50 " +
    "px-3.5 py-2 text-sm font-medium text-(--brand) transition-colors hover:bg-accent-soft hover:border-(--brand)/50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)";
  const inner = (
    <>
      <BookOpen size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
      {bigTopic && page && page.subPageCount > 0 && (
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-normal text-(--brand)/80">
          {page.subPageCount + 1} หัวข้อ
        </span>
      )}
    </>
  );

  if (bigTopic && target.slug) {
    return (
      <a
        href={`/docs/${target.audience}/${target.slug}`}
        target={demo ? "_self" : "_blank"}
        rel={demo ? undefined : "noopener"}
        className={btnClass}
        title="เปิดคู่มือฉบับเต็มในแท็บใหม่"
      >
        {inner}
        {!demo && <ExternalLink size={13} className="shrink-0 opacity-70" />}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => open(target)} className={btnClass} title="เปิดคู่มือด้านข้าง">
      {inner}
    </button>
  );
}
