"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageSquareText } from "lucide-react";
import { Button } from "../ui";

/** A manual link written out in full (this deployment's own origin) with a
 *  copy button, for staff to paste into LINE or an email to a newcomer. */
export default function ShareLink({ label, path, message }: { label: string; path: string; message?: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"" | "link" | "message">("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin + path;

  const copy = async (what: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : `${message}\n\n${url}`);
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* clipboard blocked: the text is still selectable on screen */
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-[13px] text-foreground/90">
          {url || path}
        </code>
        <Button size="sm" variant="secondary" onPress={() => copy("link")} isDisabled={!origin}>
          {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
          {copied === "link" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
        </Button>
      </div>
      {message && (
        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">ข้อความพร้อมลิงก์ สำหรับส่งทางอีเมลหรือ LINE</span>
            <Button size="sm" variant="secondary" onPress={() => copy("message")} isDisabled={!origin}>
              {copied === "message" ? <Check size={14} /> : <MessageSquareText size={14} />}
              {copied === "message" ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
            </Button>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/85">
            {message}
            {"\n\n"}
            <span className="break-all font-mono text-[13px]">{url || path}</span>
          </p>
        </div>
      )}
    </div>
  );
}
