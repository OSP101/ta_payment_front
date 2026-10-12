"use client";
import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui";
import { useI18n } from "../lib/i18n/client";

/**
 * What a user sees when a page crashes (app/error.tsx, app/global-error.tsx).
 *
 * Reports the error to GlitchTip and shows the event id as a reference code.
 * A user who cannot describe what went wrong can still send a screenshot of
 * this screen, and the code opens the exact event, with the clicks and API
 * calls that led up to it. When reporting is off (no SENTRY_DSN) the server
 * digest is shown instead, which matches the Next server's own log line.
 */
export default function ErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();
  const [ref, setRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (Sentry.isInitialized()) {
      // A server render failure arrives here as a generic message plus a
      // digest; the real error and stack were reported by the server
      // (instrumentation.ts) under the same digest tag.
      setRef(Sentry.captureException(error, { tags: { boundary: "page", digest: error.digest } }));
    } else if (error.digest) {
      setRef(error.digest);
    }
  }, [error]);

  const copy = async () => {
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(true);
    } catch {
      // Clipboard blocked (http, old browser): the code is still on screen.
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center bg-danger-soft text-danger-soft-foreground">
          <TriangleAlert />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{t("ระบบขัดข้อง")}</h1>
        <p className="text-sm text-muted mt-2">
          {t("หน้านี้ทำงานผิดพลาด ระบบได้บันทึกปัญหาส่งให้ผู้ดูแลระบบแล้ว กรุณาลองใหม่อีกครั้ง หากยังพบปัญหา โปรดแจ้งเจ้าหน้าที่พร้อมรหัสอ้างอิงด้านล่าง")}
        </p>
        {ref && (
          <div className="mt-4 rounded-lg border border-border bg-surface-secondary px-3 py-2">
            <div className="text-xs text-muted">{t("รหัสอ้างอิง")}</div>
            <div className="font-mono text-sm text-foreground break-all select-all">{ref}</div>
            <button type="button" onClick={copy} className="mt-1 text-xs text-accent hover:underline">
              {copied ? t("คัดลอกแล้ว") : t("คัดลอกรหัส")}
            </button>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onPress={retry}>{t("ลองอีกครั้ง")}</Button>
          <Button variant="secondary" onPress={() => window.location.assign("/")}>{t("กลับหน้าหลัก")}</Button>
        </div>
      </div>
    </div>
  );
}
