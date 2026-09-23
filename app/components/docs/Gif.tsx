import { Clapperboard } from "lucide-react";
import { MEDIA } from "../../../content/docs/registry";
import { mediaExists } from "./mediaExists";

/** Same "check disk, show placeholder if missing" contract as `Screenshot`,
 *  for the short looping GIFs (see PLAN §6 for the capture spec: ≤10s, 12fps,
 *  960px wide, palette 128, ≤3MB). Plain `<img>` autoplays/loops a GIF for
 *  free — no player chrome, matching the "reads like a real GIF" decision. */
export default function Gif({ id, caption }: { id: string; caption?: string }) {
  const meta = MEDIA[id];
  if (!meta) {
    return (
      <div className="my-3 rounded-lg border-2 border-dashed border-danger/40 bg-danger-soft/30 px-4 py-3 text-sm text-danger-soft-foreground">
        ไม่พบรหัส GIF <code className="font-mono">{id}</code> ใน media.json
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
          <Clapperboard className="mx-auto mb-2 text-slate-400" size={28} />
          <div className="text-sm font-medium text-slate-600">
            รอ GIF <code className="font-mono">{id}</code>
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
      {/* eslint-disable-next-line @next/next/no-img-element -- GIF must autoplay/loop natively; next/image would strip that */}
      <img src={src} alt={meta.desc} className="w-full h-auto block rounded-lg border border-border" loading="lazy" />
      {caption && <figcaption className="mt-1.5 text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}
