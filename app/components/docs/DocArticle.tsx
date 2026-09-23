import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { effectiveAudience, findPage, pagesForAudience } from "../../../content/docs/registry";
import { AUDIENCE_LABEL, type Audience, type DocPage } from "../../../content/docs/types";
import type { Me } from "../../lib/api";
import { canViewAudience } from "../../lib/docs/audience";
import DocBlocks, { stepEntries } from "./Blocks";
import OnThisPage from "./OnThisPage";

/**
 * One doc page's body — title, badges, blocks, related links, prev/next —
 * shared by the full manual (`/docs/[audience]/[...slug]`) and the
 * chrome-less embed the in-app `DocsPanel` drawer iframes
 * (`/docs-embed/...`). `linkBase` is the only difference: internal links
 * must stay inside whichever of the two the reader is in, so a related page
 * clicked inside the drawer opens inside the drawer.
 */
export default function DocArticle({
  page,
  audience,
  me,
  linkBase,
}: {
  page: DocPage;
  audience: Audience;
  me: Me | null;
  linkBase: "/docs" | "/docs-embed";
}) {
  const href = (p: DocPage) => `${linkBase}/${effectiveAudience(p, audience)}/${p.slug}`;

  const siblings = pagesForAudience(audience).filter((p) => p.section === page.section);
  const idx = siblings.findIndex((p) => p.slug === page.slug);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  // The route's layout already confirmed `me` can view THIS audience — a
  // `related:` reference can point at a different one, so every related
  // page gets its own check before its title ever reaches the response.
  const relatedPages = (page.related ?? [])
    .map((r) => {
      const [aud, s] = r.includes(":") ? r.split(":") : [audience, r];
      return findPage(aud as Audience, s);
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p) => !!me && canViewAudience(me, p.audience));

  // Breadcrumb: manual home › this audience's landing › section (its first
  // page) › the page itself. In the embed the "home" hop is dropped — the
  // panel header already says where the reader is.
  const sectionFirst = siblings[0];
  const toc = stepEntries(page.blocks);

  return (
    <div className="xl:flex xl:gap-10">
    <article className="min-w-0 flex-1">
      <nav aria-label="ตำแหน่งหน้า" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
        <Link href={`${linkBase}/${audience}`} className="hover:text-foreground">{linkBase === "/docs" ? "คู่มือการใช้งาน" : AUDIENCE_LABEL[audience]}</Link>
        {sectionFirst && (
          <>
            <ChevronRight size={12} className="text-slate-300" />
            <Link href={href(sectionFirst)} className="hover:text-foreground">{page.section}</Link>
          </>
        )}
        <ChevronRight size={12} className="text-slate-300" />
        <span className="text-foreground/80" aria-current="page">{page.title}</span>
      </nav>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">{page.title}</h1>
      <p className="mt-3 text-base text-muted max-w-[62ch] leading-7">{page.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
          ตรงกับระบบเวอร์ชัน {page.since}
        </span>
        {page.routes?.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
            <ExternalLink size={10} /> {r}
          </span>
        ))}
      </div>

      <div className="mt-8">
        <DocBlocks blocks={page.blocks} />
      </div>

      {relatedPages.length > 0 && (
        <div className="mt-10 border-t border-border pt-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">อ่านเพิ่ม</h2>
          <ul className="flex flex-wrap gap-2">
            {relatedPages.map((p) => (
              <li key={`${p.audience}:${p.slug}`}>
                <Link
                  href={href(p)}
                  className="inline-block rounded-full border border-border px-3 py-1 text-xs text-foreground/80 hover:border-(--brand) hover:text-(--brand) transition-colors"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 border-t border-border pt-5">
        {prev ? (
          <Link href={href(prev)} className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm hover:border-(--brand) transition-colors">
            <ArrowLeft size={15} className="text-slate-400 shrink-0" />
            <span className="min-w-0"><span className="block text-[11px] text-muted">ก่อนหน้า</span><span className="truncate block font-medium">{prev.title}</span></span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={href(next)} className="flex items-center justify-end gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm text-end hover:border-(--brand) transition-colors">
            <span className="min-w-0"><span className="block text-[11px] text-muted">ถัดไป</span><span className="truncate block font-medium">{next.title}</span></span>
            <ArrowRight size={15} className="text-slate-400 shrink-0" />
          </Link>
        ) : <span />}
      </div>
    </article>
    {toc.length > 0 && linkBase === "/docs" && (
      <aside className="hidden xl:block w-56 shrink-0">
        <div className="sticky top-20">
          <OnThisPage entries={toc} />
        </div>
      </aside>
    )}
    </div>
  );
}
