"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileQuestion } from "lucide-react";
import { Modal, SearchField, Chip, Spinner } from "../ui";
import { docHref, type DocPageMeta } from "../../../content/docs/meta";
import { recordMiss } from "../../lib/docs/searchMiss";
import { AUDIENCE_LABEL, type Audience } from "../../../content/docs/types";

const AUD_TONE: Record<Audience, "info" | "success" | "warn" | "neutral"> = {
  common: "neutral", ta: "success", lecturer: "info", staff: "warn",
};

interface SearchHit { page: DocPageMeta; matchedIn: string[] }

type SearchKey = readonly ["docs-search", string, Audience, string];

async function fetchSearch([, q, audience, slug]: SearchKey): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q, audience });
  if (slug) params.set("slug", slug);
  // Not the app-wide SWR fetcher: that one prefixes /api/v1 (the Go
  // backend), and this is a Next route handler.
  const res = await fetch(`/docs-search?${params}`, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`docs-search ${res.status}`);
  return (await res.json()) as SearchHit[];
}

/**
 * ⌘K / Ctrl+K search — global keyboard shortcut wired in `DocsShell`, plus a
 * plain button next to it for anyone who never learns the shortcut.
 *
 * Searched on the server (`/docs-search`), over the pages the signed-in user
 * may open — the server decides that from the session, not from anything
 * this component sends, so a TA typing into this box never sees a staff page
 * title, even just as a "you don't have access" tease. The page text never
 * reaches the browser.
 */
export default function SearchDialog({
  open,
  onClose,
  currentAudience,
}: {
  open: boolean;
  onClose: () => void;
  currentAudience: Audience;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  // The page actually open behind this dialog — read straight off the URL
  // (`/docs/<audience>/<slug...>`); the server boosts results in its
  // section. Empty off the manual's own pages: no boost.
  const currentSlug = useMemo(() => {
    const parts = (pathname ?? "").split("/").filter(Boolean); // ["docs", audience, ...slug]
    if (parts[0] !== "docs" || parts.length < 3) return "";
    return parts.slice(2).join("/");
  }, [pathname]);

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) { setQ(""); setDebounced(""); }
  }, [open]);

  const key: SearchKey | null = open && debounced ? ["docs-search", debounced, currentAudience, currentSlug] : null;
  const { data, error, isLoading } = useSWR(key, fetchSearch, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
    // Quiet: overrides SWRProvider's toast, the dialog says it itself.
    onError: () => {},
  });
  const typed = q.trim();
  // The answer for exactly what is in the box — not a previous query kept
  // on screen (keepPreviousData) and not one still waiting on the debounce.
  const settled = !!typed && typed === debounced && !isLoading && !!data;
  const results = typed ? (data ?? []) : [];

  useEffect(() => {
    if (!open || !settled || debounced.length < 2 || results.length > 0) return;
    const t = setTimeout(() => recordMiss(debounced, currentAudience), 700);
    return () => clearTimeout(t);
  }, [open, settled, debounced, results.length, currentAudience]);

  const go = (page: DocPageMeta) => {
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
        {typed && error && (
          <div className="py-8 text-center text-sm text-muted">ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง</div>
        )}
        {typed && !error && !settled && results.length === 0 && (
          <div className="flex justify-center py-8"><Spinner size="sm" /></div>
        )}
        {settled && !error && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
            <FileQuestion size={28} className="text-slate-300" />
            <div>ไม่พบหัวข้อที่ตรงกับ “{typed}”</div>
            <div className="text-xs">ลองคำอื่น หรือแจ้งเจ้าหน้าที่ว่าหาไม่เจอ</div>
          </div>
        )}
        {!error && results.length > 0 && (
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
        {!typed && (
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
