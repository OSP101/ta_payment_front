import { ImageOff } from "lucide-react";
import { MEDIA } from "../../../content/docs/registry";
import type { Hotspot } from "../../../content/docs/types";
import { mediaExists } from "./mediaExists";

/**
 * Renders one screenshot by its registry ID (`content/docs/media.json`).
 *
 * Server component on purpose: it checks the file's presence on disk (via
 * `mediaExists`) at render time. Nothing in the docs pipeline runs a
 * separate "which images are missing" build step (see `PLAN-manual-docs-platform.md`
 * §9 for why that was cut) — the page itself IS the check. In dev, an editor
 * writing a new page sees the placeholder immediately, and a screenshot
 * dropped into `public/docs/v1/<file>` makes it disappear on the next
 * request, no rebuild step to remember; in production the result is cached
 * (see `mediaExists`) since the deployed file set can't change mid-process.
 */
export default function Screenshot({
  id,
  caption,
  hotspots,
}: {
  id: string;
  caption?: string;
  hotspots?: Hotspot[];
}) {
  const meta = MEDIA[id];
  if (!meta) {
    return (
      <div className="my-3 rounded-lg border-2 border-dashed border-danger/40 bg-danger-soft/30 px-4 py-3 text-sm text-danger-soft-foreground">
        ไม่พบรหัสภาพ <code className="font-mono">{id}</code> ใน media.json (พิมพ์ผิดหรือยังไม่ได้ลงทะเบียน)
      </div>
    );
  }
  const exists = mediaExists(meta.file);
  const src = `/docs/v1/${meta.file}`;

  // The dashed "waiting for this image" card exists for the AUTHOR: it names
  // the route, the account to capture with and the exact file to drop in.
  // None of that belongs in front of a reader, so in production a missing
  // file renders nothing at all — the surrounding text still reads fine
  // without it, and `npm run docs:media` is where the gap gets tracked.
  if (!exists && process.env.NODE_ENV === "production") return null;

  if (!exists) {
    return (
      <figure className="my-3">
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <ImageOff className="mx-auto mb-2 text-slate-400" size={28} />
          <div className="text-sm font-medium text-slate-600">
            รอภาพ <code className="font-mono">{id}</code>
          </div>
          <div className="mt-1 text-xs text-slate-500 max-w-md mx-auto">{meta.desc}</div>
          <div className="mt-2 text-[11px] text-slate-400">
            หน้า/route: <code className="font-mono">{meta.route}</code> · บัญชี {meta.account} · วางไฟล์ที่{" "}
            <code className="font-mono">public/docs/v1/{meta.file}</code>
          </div>
        </div>
        {caption && <figcaption className="mt-1.5 text-xs text-muted text-center">{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="my-3">
      <div className="relative rounded-lg overflow-hidden border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- doc screenshots are static files under public/, arbitrary aspect ratio, no benefit from next/image here */}
        <img src={src} alt={meta.desc} className="w-full h-auto block" />
        {hotspots?.map((h, i) => (
          <span
            key={i}
            title={h.label}
            className="absolute flex items-center justify-center w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger text-white text-xs font-bold ring-2 ring-white shadow"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          >
            {i + 1}
          </span>
        ))}
        <span className="absolute bottom-1 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          v{meta.since}
        </span>
      </div>
      {(caption || hotspots?.length) && (
        <figcaption className="mt-1.5 text-xs text-muted">
          {caption}
          {hotspots?.length ? (
            <ol className="mt-1 list-decimal ps-4 space-y-0.5">
              {hotspots.map((h, i) => <li key={i}>{h.label}</li>)}
            </ol>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}
