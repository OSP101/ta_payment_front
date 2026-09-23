"use client";
import { useEffect, useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { sameOriginPath } from "../../lib/safePath";

/**
 * What the manual drawer's frame (/docs-embed) shows instead of redirecting.
 * A redirect from inside an <iframe> navigates the FRAME: the login page
 * rendered at 440px in the drawer, and after signing in there the whole
 * manual site loaded inside it while the page around it sat on a dead
 * session. The sign-in link targets the top window instead, and comes back
 * to the page the reader was actually on.
 */
export default function EmbedNotice({ kind, audience }: { kind: "expired" | "forbidden"; audience: string }) {
  const fallback = `/docs/${audience}`;
  const [next, setNext] = useState(fallback);

  useEffect(() => {
    try {
      // Same origin, so the parent's location is readable. Resolved through
      // sameOriginPath like every other ?next= this app builds.
      const top = window.top ?? window;
      setNext(sameOriginPath(top.location.pathname + top.location.search, fallback));
    } catch {
      /* not framed by us — keep the manual as the destination */
    }
  }, [fallback]);

  if (kind === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
        <ShieldAlert size={28} className="text-slate-400" />
        <div className="font-medium text-foreground">คุณไม่มีสิทธิ์อ่านคู่มือส่วนนี้</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
      <LogIn size={28} className="text-slate-400" />
      <div className="font-medium text-foreground">เซสชันหมดอายุ</div>
      <div>กรุณาเข้าสู่ระบบอีกครั้งเพื่ออ่านคู่มือ</div>
      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        target="_top"
        className="inline-flex items-center gap-1.5 rounded-lg bg-(--brand) px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        เข้าสู่ระบบอีกครั้ง
      </a>
    </div>
  );
}
