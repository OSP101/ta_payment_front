"use client";
import type React from "react";
import { Card } from "@heroui/react";

/*
 * Shared loading placeholders.
 *
 * The rule every page follows: never wait for ALL the data before drawing
 * anything. The page header, tabs and filters render immediately; each panel,
 * stat card or table fills in on its own the moment ITS request resolves, and
 * until then shows a placeholder shaped like the eventual content. A spinner
 * (or a blank page) that is replaced by the full layout at once reads as the
 * page flashing (กระพริบ); a same-sized placeholder reads as content arriving.
 *
 * `.skel` (globals.css) keeps the placeholder invisible for its first ~120ms
 * and then fades it in, so a fast or cached response never flashes grey — the
 * space is simply reserved and the real content lands in it.
 */

const BLOCK = "skel block rounded bg-surface-secondary";

/** One grey block. Size it with className (h-*, w-*, rounded-*). */
export function Skel({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`${BLOCK} ${className}`} style={style} />;
}

/**
 * Inline stand-in for a value inside real chrome — a StatCard number, a count
 * in a heading, a cell. Keeps the line height so nothing shifts on arrival.
 */
export function SkelValue({ className = "h-[1em] w-16" }: { className?: string }) {
  return <span aria-hidden className={`skel inline-block align-middle rounded bg-surface-secondary ${className}`} />;
}

/** Announces the loading region once to screen readers; children are the visual placeholder. */
export function SkelRegion({ label = "กำลังโหลด", className = "", children }: {
  label?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A paragraph: `lines` bars, the last one shorter. */
export function SkelText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <SkelRegion className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} className={`h-3.5 ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </SkelRegion>
  );
}

/** Table body rows — `columns` bars per row. Pass the real column count. */
export function SkelRows({ rows = 6, columns = 4, className = "" }: { rows?: number; columns?: number; className?: string }) {
  return (
    <SkelRegion className={`flex flex-col gap-3 py-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: columns }, (_, j) => (
            <Skel key={j} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </SkelRegion>
  );
}

/** A vertical list of items: optional leading icon/avatar, a title and a sub-line. */
export function SkelList({ items = 4, icon = true, bordered = false, className = "" }: {
  items?: number; icon?: boolean; bordered?: boolean; className?: string;
}) {
  return (
    <SkelRegion className={`flex flex-col ${bordered ? "gap-2" : "gap-4"} ${className}`}>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className={`flex items-start gap-3 ${bordered ? "rounded-lg border border-(--hairline) bg-surface p-3" : ""}`}>
          {icon && <Skel className="size-9 shrink-0 rounded-lg" />}
          <div className="flex-1 min-w-0 flex flex-col gap-2 pt-0.5">
            <Skel className="h-4 w-1/2" />
            <Skel className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </SkelRegion>
  );
}

/** A grid of cards (course cards, tiles). Pass the same grid classes the real grid uses. */
export function SkelCards({ count = 3, className = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", cardClassName = "" }: {
  count?: number; className?: string; cardClassName?: string;
}) {
  return (
    <SkelRegion className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`rounded-xl border border-(--hairline) bg-surface p-4 ${cardClassName}`}>
          <div className="flex items-start gap-3">
            <Skel className="size-9 shrink-0 rounded-lg" />
            <div className="flex-1 flex flex-col gap-2">
              <Skel className="h-4 w-1/2" />
              <Skel className="h-3 w-3/4" />
            </div>
          </div>
          <Skel className="mt-4 h-3 w-2/3" />
        </div>
      ))}
    </SkelRegion>
  );
}

/**
 * Placeholder for a row of StatCards, matching StatCard's padding and
 * height. Prefer rendering the real StatCard with `value={<SkelValue/>}` when
 * the labels are known up front; use this only when the cards themselves
 * depend on the data.
 */
export function SkelStats({ count = 4, className = "grid grid-cols-2 lg:grid-cols-4 gap-3" }: { count?: number; className?: string }) {
  return (
    <SkelRegion className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} variant="default" className="p-3 sm:p-4 flex flex-row items-start gap-2.5 sm:gap-3 h-full">
          <Skel className="size-9 sm:size-10 shrink-0 rounded-lg" />
          <div className="flex-1 flex flex-col gap-2">
            <Skel className="h-3 w-2/3" />
            <Skel className="h-6 w-1/2" />
          </div>
        </Card>
      ))}
    </SkelRegion>
  );
}

/** A form: label + input pairs. */
export function SkelForm({ fields = 4, className = "" }: { fields?: number; className?: string }) {
  return (
    <SkelRegion className={`flex flex-col gap-4 ${className}`}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skel className="h-3 w-28" />
          <Skel className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </SkelRegion>
  );
}

/** A fixed-height block for charts, previews, documents. */
export function SkelBlock({ className = "h-64" }: { className?: string }) {
  return (
    <SkelRegion>
      <Skel className={`w-full rounded-xl ${className}`} />
    </SkelRegion>
  );
}
