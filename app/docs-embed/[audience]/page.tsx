import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { effectiveAudience, gettingStarted, sidebarSections } from "../../../content/docs/registry";
import { AUDIENCE_LABEL, type Audience } from "../../../content/docs/types";
import { getMe } from "../../lib/session";
import { canViewAudience } from "../../lib/docs/audience";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

/** Drawer fallback when the page the reader is on has no doc of its own:
 *  the audience's Getting Started path plus every topic, all linking within
 *  the embed so they keep reading inside the drawer. */
export default async function EmbedHomePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience: raw } = await params;
  if (!VALID.includes(raw as Audience)) notFound();
  const audience = raw as Audience;
  // Same own-check as the content page: never rely on the layout alone.
  const me = await getMe();
  if (!me || !canViewAudience(me, audience)) return null;
  const href = (slug: string, aud: Audience) => `/docs-embed/${aud}/${slug}`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground tracking-tight">คู่มือการใช้งาน · {AUDIENCE_LABEL[audience]}</h1>
      <p className="mt-1 text-sm text-muted">หน้านี้ยังไม่มีคู่มือเฉพาะ เริ่มจากลำดับด้านล่าง หรือเลือกหัวข้อที่ต้องการ</p>

      <ol className="mt-5 space-y-2">
        {gettingStarted(audience).map((p, i) => (
          <li key={p.slug}>
            <Link
              href={href(p.slug, effectiveAudience(p, audience))}
              className="group flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 hover:border-(--brand) transition-colors"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{p.title}</span>
                <span className="block text-xs text-muted">{p.description}</span>
              </span>
              <ArrowRight size={14} className="mt-1.5 shrink-0 text-slate-300 group-hover:text-(--brand)" />
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-t border-border pt-4 space-y-4">
        {sidebarSections(audience).map(({ section, pages }) => (
          <div key={section}>
            <div className="text-xs font-semibold text-muted mb-1">{section}</div>
            <ul className="space-y-0.5">
              {pages.map((p) => (
                <li key={`${p.audience}:${p.slug}`}>
                  <Link href={href(p.slug, effectiveAudience(p, audience))} className="text-sm text-foreground/85 hover:text-(--brand) hover:underline underline-offset-2">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
