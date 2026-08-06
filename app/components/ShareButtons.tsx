"use client";
import { useState } from "react";
import { Check, Link2, MessageCircle, Send, Share2 } from "lucide-react";

/**
 * Share an announcement to the places people actually forward things.
 *
 * Two links exist for one announcement and they are not interchangeable:
 *
 *   /announcements/<id>    the in-system page — needs an account, shows the
 *                          reader's own shell and the rest of the feed
 *   /p/announcements/<id>  the public page — no login, and only answers for
 *                          announcements staff opened for sharing
 *
 * Anything leaving the building has to be the public link, or the recipient
 * lands on a login screen. When an announcement is NOT public we still offer
 * "copy link" (colleagues can open it) but not the social buttons, because a
 * post to Facebook that nobody outside can read is worse than no button.
 */

export type ShareTarget = "facebook" | "line" | "x";

function shareURL(target: ShareTarget, url: string, title: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (target) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "line":
      // LINE is how most of the faculty forwards things; its share endpoint
      // takes the text and the URL in one parameter.
      return `https://social-plugins.line.me/lineit/share?url=${u}&text=${t}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
  }
}

export function publicAnnouncementURL(id: string): string {
  if (typeof window === "undefined") return `/p/announcements/${id}`;
  return `${window.location.origin}/p/announcements/${id}`;
}

export function internalAnnouncementURL(id: string): string {
  if (typeof window === "undefined") return `/announcements/${id}`;
  return `${window.location.origin}/announcements/${id}`;
}

export default function ShareButtons({
  id,
  title,
  isPublic,
  size = "md",
}: {
  id: string;
  title: string;
  /** Whether staff opened this announcement to readers with no account. */
  isPublic: boolean;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const url = isPublic ? publicAnnouncementURL(id) : internalAnnouncementURL(id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard is blocked outside a secure context; fall back to a prompt
      // so the officer can still get the link out.
      window.prompt("คัดลอกลิงก์นี้", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const btn =
    size === "sm"
      ? "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand"
      : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-2 transition-colors hover:border-brand hover:text-brand";
  const icon = size === "sm" ? 12 : 15;

  const social: { target: ShareTarget; label: string; node: React.ReactNode }[] = [
    { target: "facebook", label: "Facebook", node: <Share2 size={icon} /> },
    { target: "line", label: "LINE", node: <MessageCircle size={icon} /> },
    { target: "x", label: "X", node: <Send size={icon} /> },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPublic &&
        social.map(s => (
          <a
            key={s.target}
            href={shareURL(s.target, url, title)}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
          >
            {s.node}
            {s.label}
          </a>
        ))}

      <button type="button" onClick={copy} className={btn}>
        {copied ? <Check size={icon} className="text-emerald-600" /> : <Link2 size={icon} />}
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
      </button>

      {!isPublic && (
        <span className="text-xs text-ink-3">
          ประกาศนี้ยังไม่ได้เปิดสาธารณะ ผู้รับลิงก์ต้องเข้าสู่ระบบก่อนจึงจะอ่านได้
        </span>
      )}
    </div>
  );
}
