"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileQuestion } from "lucide-react";
import { Modal, SearchField, Chip } from "../ui";
import { docHref, findPage, pagesForAudience } from "../../../content/docs/registry";
import { search, recordMiss } from "../../lib/docs/search";
import { AUDIENCE_LABEL, type Audience, type DocPage } from "../../../content/docs/types";

const AUD_TONE: Record<Audience, "info" | "success" | "warn" | "neutral"> = {
  common: "neutral", ta: "success", lecturer: "info", staff: "warn",
};

/**
 * ⌘K / Ctrl+K search — global keyboard shortcut wired in `DocsShell`, plus a
 * plain button next to it for anyone who never learns the shortcut.
 *
 * Only searches pages the signed-in user is actually allowed to open
 * (`allowedAudiences`, resolved by the caller and passed in as
 * `searchableAudiences`) — a TA typing into this box must never see a staff
 * page title in the results, even just as a "you don't have access" tease.
 */
export default function SearchDialog({
  open,
  onClose,
  currentAudience,
  searchableAudiences,
}: {
  open: boolean;
  onClose: () => void;
  currentAudience: Audience;
  searchableAudiences: Audience[];
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  const pool = useMemo(() => {
    const seen = new Set<string>();
    const pages = [];
    for (const aud of searchableAudiences) {
      for (const p of pagesForAudience(aud)) {
        const key = `${p.audience}:${p.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pages.push(p);
      }
    }
    return pages;
  }, [searchableAudiences]);

  // The section of the page actually open behind this dialog — read straight
  // off the URL (`/docs/<audience>/<slug...>`) rather than always picking the
  // audience's first sidebar section, which is what this used to do
  // regardless of where search was opened from. Undefined off the manual's
  // own pages (e.g. mid-app, before any "?" button existed here) — search()
  // treats that as "no boost" the same as it always did.
  const currentSection = useMemo(() => {
    const parts = (pathname ?? "").split("/").filter(Boolean); // ["docs", audience, ...slug]
    if (parts[0] !== "docs" || parts.length < 3) return undefined;
    return findPage(currentAudience, parts.slice(2).join("/"))?.section;
  }, [pathname, currentAudience]);

  const results = useMemo(() => {
    if (q.trim().length < 1) return [];
    return search(pool, q, { currentSection }).slice(0, 12);
  }, [pool, q, currentSection]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const t = setTimeout(() => {
      if (results.length === 0) recordMiss(q, currentAudience);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, results.length, open]);

  const go = (page: DocPage) => {
    onClose();
    router.push(docHref(page, currentAudience));
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" placement="top" title="ค้นหาคู่มือการใช้งาน" icon={<Search size={18} />}>
      <div className="space-y-3">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="พิมพ์คำ เช่น “ลงเวลา”, “ตีกลับ”, หรือข้อความ error ที่เห็นในระบบ…"
          ariaLabel="ค้นหาคู่มือ"
          className="w-full"
        />
        {q.trim() && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
            <FileQuestion size={28} className="text-slate-300" />
            <div>ไม่พบหัวข้อที่ตรงกับ “{q}”</div>
            <div className="text-xs">ลองคำอื่น หรือแจ้งเจ้าหน้าที่ว่าหาไม่เจอ</div>
          </div>
        )}
        {results.length > 0 && (
          <ul className="max-h-96 overflow-y-auto divide-y divide-border rounded-lg border border-border">
            {results.map((r) => (
              <li key={`${r.page.audience}:${r.page.slug}`}>
                <button
                  type="button"
                  onClick={() => go(r.page)}
                  className="flex w-full flex-col items-start gap-1 px-3.5 py-2.5 text-start hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip tone={AUD_TONE[r.page.audience]}>{AUDIENCE_LABEL[r.page.audience]}</Chip>
                    <span className="text-xs text-muted">{r.page.section}</span>
                  </div>
                  <div className="text-sm font-medium text-foreground">{r.page.title}</div>
                  <div className="text-xs text-muted line-clamp-1">{r.page.description}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!q.trim() && (
          <div className="text-xs text-muted">
            พิมพ์ <kbd className="rounded border border-border bg-slate-50 px-1">/</kbd> จากหน้าไหนก็ได้ในคู่มือเพื่อเปิดช่องนี้ ·{" "}
            <Link href={`/docs/${currentAudience}`} onClick={onClose} className="underline">
              กลับหน้าเริ่มต้นใช้งาน
            </Link>
          </div>
        )}
      </div>
    </Modal>
  );
}
