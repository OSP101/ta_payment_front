"use client";
import { FileText, Play } from "lucide-react";

/**
 * How an announcement's files are shown to a reader.
 *
 * One component for the feed, the detail page and the public page, so a post
 * looks the same wherever it is opened — and so a change to the layout cannot
 * land in two of the three.
 *
 * `publicMode` swaps the fetch route: the authenticated one refuses anonymous
 * callers, so the public page must ask for the same key through /public.
 */

export interface Attachment {
  id?: string;
  kind: "image" | "video" | "file";
  storage_key: string;
  url: string;
  filename: string;
  mime: string;
  size_bytes: number;
}

export function attachmentSrc(a: Attachment, publicMode: boolean): string {
  return publicMode
    ? `/api/v1/public/announcements/media/${a.storage_key}`
    : a.url;
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function AttachmentGallery({
  items,
  publicMode = false,
}: {
  items: Attachment[];
  publicMode?: boolean;
}) {
  if (!items?.length) return null;

  const images = items.filter(a => a.kind === "image");
  const videos = items.filter(a => a.kind === "video");
  const files = items.filter(a => a.kind === "file");

  // Photo grids read best when the count decides the shape: one photo goes
  // full width, two split, three or more tile.
  const gridCols =
    images.length === 1 ? "grid-cols-1"
      : images.length === 2 ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${gridCols}`}>
          {images.map((a, i) => (
            <a
              key={a.storage_key}
              href={attachmentSrc(a, publicMode)}
              target="_blank"
              rel="noopener noreferrer"
              className={`block overflow-hidden rounded-lg border border-border bg-surface-secondary ${
                images.length === 1 ? "" : "aspect-square"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentSrc(a, publicMode)}
                alt={a.filename || `รูปที่ ${i + 1}`}
                loading="lazy"
                className={images.length === 1
                  ? "max-h-[520px] w-full object-contain"
                  : "h-full w-full object-cover transition-transform hover:scale-[1.02]"}
              />
            </a>
          ))}
        </div>
      )}

      {videos.map(a => (
        <video
          key={a.storage_key}
          controls
          preload="metadata"
          className="w-full rounded-lg border border-border bg-black"
        >
          <source src={attachmentSrc(a, publicMode)} type={a.mime} />
          {/* A browser that cannot play the format still gets the file. */}
          <a href={attachmentSrc(a, publicMode)} className="text-sm underline">
            <Play size={14} className="inline" /> เปิดวิดีโอ {a.filename}
          </a>
        </video>
      ))}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map(a => (
            <li key={a.storage_key}>
              <a
                href={attachmentSrc(a, publicMode)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-brand"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
                  <FileText size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-1">{a.filename}</span>
                  <span className="block text-xs text-ink-3">{humanSize(a.size_bytes)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
