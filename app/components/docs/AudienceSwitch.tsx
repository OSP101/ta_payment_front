"use client";
import Link from "next/link";
import { AUDIENCE_LABEL, type Audience } from "../../../content/docs/types";

/**
 * Segmented "which manual" switch — the same idea as choosing App Router vs
 * Pages Router on nextjs.org, sized to what this app actually needs: at most
 * three buttons (เจ้าหน้าที่ / อาจารย์ / ผู้ช่วยสอน), only the ones the signed-in
 * user is allowed to open (`allowed`, resolved server-side by the layout —
 * this component never decides access, only renders what it's given).
 *
 * Two look-and-feel variants, one render path: at 375px, three Thai labels
 * packed into the `compact` pill cluster's tight padding wrap mid-word
 * ("เจ้า" / "หน้าที่") — measured, not assumed, while checking this on a real
 * phone width. `full` spends the whole row width instead (`DocsShell` places
 * it on its own line under the header on small screens), so each label gets
 * enough room to stay on one line at a normal reading size. Both share the
 * exact same list/link/active markup; only the wrapper and per-tab classes
 * differ, picked once up front instead of duplicated across two JSX blocks.
 */
export default function AudienceSwitch({
  current,
  allowed,
  variant = "compact",
}: {
  current: Audience;
  allowed: Audience[];
  variant?: "compact" | "full";
}) {
  if (allowed.length <= 1) return null;

  const isFull = variant === "full";
  const wrapperClassName = isFull
    ? "grid gap-0.5 rounded-lg bg-slate-100 p-1"
    : "inline-flex rounded-lg bg-slate-100 p-1 gap-0.5";
  const wrapperStyle = isFull ? { gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` } : undefined;
  const tabClassName = (active: boolean) =>
    "whitespace-nowrap rounded-md text-sm font-medium transition-colors " +
    (isFull ? "py-2 text-center " : "px-3 py-1.5 ") +
    (active ? "bg-white text-foreground shadow-sm" : isFull ? "text-muted" : "text-muted hover:text-foreground");

  return (
    <div role="tablist" aria-label="เลือกมุมมองคู่มือ" className={wrapperClassName} style={wrapperStyle}>
      {allowed.map((a) => {
        const active = a === current;
        return (
          <Link key={a} href={`/docs/${a}`} role="tab" aria-selected={active} className={tabClassName(active)}>
            {AUDIENCE_LABEL[a]}
          </Link>
        );
      })}
    </div>
  );
}
