"use client";
import { useEffect, useRef } from "react";
import { Modal, ProgressBar } from "@heroui/react";
import { ShieldCheck, Upload } from "lucide-react";
import type { UploadProgress } from "../lib/api";

/**
 * Progress dialog for a file upload that is scanned server-side.
 *
 * Why a modal and not just a pending button: the scan happens INSIDE the POST,
 * after the last byte is sent, so a 10 MB PDF can sit for several seconds with
 * the page looking idle. A spinner on a button says "working"; it does not say
 * "your file is being scanned for viruses, do not close this", which is the
 * only information that makes the wait make sense. Blocking the page also stops
 * the second click that would upload the same file twice.
 *
 * The two phases are deliberately different KINDS of indicator, because only
 * one of them is measured — see UploadPhase in lib/api.ts.
 */
export default function UploadProgressModal({
  progress,
  filename,
}: {
  /** null when idle — the modal is open exactly when an upload is in flight. */
  progress: UploadProgress | null;
  filename?: string;
}) {
  const open = progress !== null;

  // The dialog stays mounted through its exit animation, so for a few frames
  // after the upload finishes it is still visible with progress already null.
  // Rendering from null there flashed the SENDING layout at 0% — the caller's
  // file is gone too, so it read "0.0 / 0.0 MB, 0%" right after a success.
  // Keep the last real values and render those while it animates out.
  const last = useRef<{ progress: UploadProgress; filename?: string } | null>(null);
  useEffect(() => {
    if (!progress) return;
    // filename is kept separately: callers clear their chosen file one render
    // before they clear progress, so overwriting it here with the resulting
    // undefined would drop the name mid-animation.
    last.current = { progress, filename: filename ?? last.current?.filename };
  }, [progress, filename]);

  const shown = progress ?? last.current?.progress ?? null;
  const shownName = progress ? filename : last.current?.filename;
  const scanning = shown?.phase === "processing";

  return (
    <Modal>
      {/* Not dismissable and no CloseTrigger: closing the dialog would not
          cancel the request, so offering to close it would only hide a
          still-running upload from the person waiting on it. */}
      <Modal.Backdrop isOpen={open} isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.Header>
              <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                {scanning ? <ShieldCheck className="size-5" /> : <Upload className="size-5" />}
              </Modal.Icon>
              <Modal.Heading>
                {scanning ? "กำลังตรวจสอบความปลอดภัยของไฟล์" : "กำลังอัปโหลดไฟล์"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {shownName && (
                <div className="text-sm font-medium text-foreground truncate mb-3">{shownName}</div>
              )}

              {scanning ? (
                <>
                  <ProgressBar isIndeterminate aria-label="กำลังสแกนไวรัส" className="w-full">
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                  <div className="text-sm text-muted mt-3">
                    อัปโหลดครบแล้ว ระบบกำลังสแกนไวรัสและตรวจว่าเป็นไฟล์ PDF จริง
                    ก่อนบันทึกลงระบบ ขั้นตอนนี้อาจใช้เวลาสักครู่ตามขนาดไฟล์
                  </div>
                </>
              ) : (
                <>
                  <ProgressBar
                    aria-label="ความคืบหน้าการอัปโหลด"
                    value={shown?.percent ?? 0}
                    className="w-full"
                  >
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                  <div className="flex items-center justify-between text-sm text-muted mt-3">
                    <span>{fmtMB(shown?.loaded ?? 0)} / {fmtMB(shown?.total ?? 0)} MB</span>
                    <span>{shown?.percent ?? 0}%</span>
                  </div>
                </>
              )}

              <div className="text-xs text-muted mt-4 pt-3 border-t border-[var(--hairline)]">
                กรุณาอย่าปิดหรือรีเฟรชหน้านี้จนกว่าจะเสร็จ
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
