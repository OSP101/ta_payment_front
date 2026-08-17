import type { Metadata } from "next";
import { backendURL, siteURL } from "../../../lib/site";
import PublicProgressBoard from "./PublicProgressBoard";

/**
 * The public face of one term's document-progress board: no login, no
 * sidebar. This is where the link staff post to the department LINE group or
 * Facebook page lands — see ShareLinkPanel in DocumentProgressBoard.tsx for
 * where it gets issued, and migration 0084 / document_progress_share.go for
 * why the id in the URL is a standalone token rather than the term's own id.
 *
 * Unlike the public announcement page, this is not written for search
 * engines or social unfurling — it lists real people's names and signing
 * status, meant only for whoever staff hand the link to — so metadata stays
 * minimal and robots is always noindex.
 */

interface TermLookup { term_label?: string }

async function getTermLabel(linkId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${backendURL()}/api/v1/public/document-progress/${encodeURIComponent(linkId)}`,
      // Never cached: the board changes as staff and lecturers work through
      // it, and a stale metadata fetch is harmless, but a stale "not found"
      // would make a link look dead right after staff issue it.
      { cache: "no-store" },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as TermLookup;
    return data.term_label ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ linkId: string }> },
): Promise<Metadata> {
  const { linkId } = await params;
  const label = await getTermLabel(linkId);
  const title = label ? `ความคืบหน้าเอกสารผู้ช่วยสอน · เทอม ${label}` : "ความคืบหน้าเอกสารผู้ช่วยสอน";
  return {
    title,
    description: "ติดตามความคืบหน้าการเดินเอกสารเบิกจ่ายผู้ช่วยสอน",
    alternates: { canonical: `${siteURL()}/p/document-progress/${linkId}` },
    robots: { index: false, follow: false },
  };
}

export default async function PublicDocumentProgressPage(
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[900px] items-center gap-2.5 px-5 py-3.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            T
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink-1">COCO TAS</span>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-none text-amber-800">
                Beta
              </span>
            </div>
            <div className="text-[11px] text-ink-3">วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-5 py-6">
        <PublicProgressBoard linkId={linkId} />
      </main>

      {/* Same footer as the login page — one copyright/credit block for the
          whole app, not a second wording invented for this screen. */}
      <p className="text-center text-xs text-muted mt-6">
        © {new Date().getFullYear()} College of Computing, Khon Kaen University
      </p>
      <p className="text-center text-xs text-muted mt-1 pb-10">
        Developed by{" "}
        <a
          href="https://osp101.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          ITII Development Team
        </a>
      </p>
    </div>
  );
}
