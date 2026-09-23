"use client";
import { BookOpen } from "lucide-react";
import type { Audience } from "../../../content/docs/types";
import { useDocsPanel } from "./DocsPanel";

/**
 * Inline "read the manual for THIS section" icon — drop it next to a panel
 * title, a tab, or a form section heading, and it opens `DocsPanel` at
 * exactly that doc page, the way Cloudflare's dashboard puts a small book
 * icon beside "DNSSEC" or "Cloudflare Nameservers".
 *
 * This is the fix for pages where one URL holds several topics (tabs on
 * /staff/settings, the modals on /staff/teaching, the sections of
 * /staff/payouts/[tcId]): the header button can only resolve a doc from the
 * pathname, but a page knows which of its own sections it is rendering, so
 * it can point at the precise page itself.
 *
 *   <DocsAnchor audience="staff" slug="settings/admins" />          // icon only
 *   <DocsAnchor audience="ta" slug="worklog/submit" strip />         // right-aligned labelled row
 *
 * `Panel`/`PageHeader` in ui.tsx render the icon form automatically for any
 * `data-tour` key listed in content/docs/anchors.ts; `strip` is for plain
 * container <div>s that have no header of their own to put an icon in.
 */
export default function DocsAnchor({
  audience,
  slug,
  label = "ดูคู่มือของหัวข้อนี้",
  className = "",
  strip = false,
}: {
  audience: Audience;
  slug: string;
  label?: string;
  className?: string;
  strip?: boolean;
}) {
  const { open } = useDocsPanel();
  const icon = (
    <button
      type="button"
      onClick={() => open({ audience, slug })}
      title={label}
      aria-label={label}
      className={
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted " +
        "transition-colors hover:border-(--brand) hover:text-(--brand) " + (strip ? "" : className)
      }
    >
      <BookOpen size={13} />
    </button>
  );
  if (!strip) return icon;
  return (
    <div className={`mb-2 flex items-center justify-end gap-1.5 text-xs text-muted ${className}`}>
      <span>{label}</span>
      {icon}
    </div>
  );
}
