"use client";
import { useEffect, useState } from "react";
import { Drawer } from "@heroui/react";
import { Check, X } from "lucide-react";
import { Button, Select, TextArea, FieldGroup, StatusChip } from "../../components/ui";
import { REJECT_PRESETS, OTHER_PRESET } from "./types";

/** Preview a TA-uploaded document in a right-hand drawer at ~50vw. Content is
 * served by the officer-only /ta-review/:userId/docs/:docId/preview endpoint,
 * which bakes an officer-identifying watermark into the returned bytes so a
 * screenshot leaks the officer's identity. Download endpoint is separate
 * (no watermark) and intentionally not surfaced here.
 *
 * The footer carries the same อนุมัติ / ไม่อนุมัติ actions as the file card so
 * the officer can decide right after seeing the document, without closing the
 * drawer and hunting for the row again.
 */
export function PreviewDrawer({
  userId,
  doc,
  busy = false,
  onApprove,
  onReject,
  onClose,
}: {
  userId: string | null;
  doc: {
    id: string; filename: string; kind: string; kindLabel: string;
    status?: string;
  } | null;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onClose: () => void;
}) {
  const open = !!(userId && doc);
  const url =
    userId && doc
      ? `/api/v1/ta-review/${userId}/docs/${doc.id}/preview`
      : "";
  const ext = (doc?.filename.split(".").pop() ?? "").toLowerCase();
  const isImage = ext === "jpg" || ext === "jpeg" || ext === "png";

  // Already-decided docs show their status instead of the decision buttons —
  // mirrors the file card, where อนุมัติ/ไม่อนุมัติ hide once decided.
  const decided = doc?.status === "approved" || doc?.status === "rejected";

  // Inline reject-reason picker (same presets as the file card, no popup).
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState(REJECT_PRESETS[0]);
  const [other, setOther] = useState("");
  const reason = preset === OTHER_PRESET ? other.trim() : preset;
  const canSubmitReject = reason.length > 0;

  // Reset the picker whenever a different document is opened.
  useEffect(() => {
    setRejecting(false);
    setPreset(REJECT_PRESETS[0]);
    setOther("");
  }, [doc?.id]);

  function submitReject() {
    if (!canSubmitReject || busy || !onReject) return;
    onReject(reason);
  }

  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={o => { if (!o) onClose(); }}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="w-[50vw] max-w-none">
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{doc?.kindLabel ?? ""}</Drawer.Heading>
            <div className="mt-1 text-xs text-muted truncate">
              {doc?.filename}
            </div>
            <div className="mt-1 text-xs text-muted italic">
              เอกสารทุกหน้ามีลายน้ำระบุตัวเจ้าหน้าที่และเวลาที่เปิด
            </div>
          </Drawer.Header>
          <Drawer.Body>
            {open && (
              <div className="w-full h-full min-h-[70vh] rounded-lg border border-[var(--hairline)] overflow-hidden bg-slate-50 flex items-center justify-center">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={doc?.filename ?? ""}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={url}
                    title={doc?.filename ?? "preview"}
                    className="w-full h-full min-h-[70vh]"
                  />
                )}
              </div>
            )}
          </Drawer.Body>
          <Drawer.Footer className="flex-col items-stretch gap-2">
            {/* Reason picker expands above the buttons when rejecting. */}
            {rejecting && !decided && (
              <div className="rounded-md border border-danger/40 bg-danger-soft/40 p-2 space-y-2 text-left">
                <FieldGroup label="เหตุผลที่ตีกลับ">
                  <Select value={preset} onChange={e => setPreset(e.target.value)}>
                    {REJECT_PRESETS.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </FieldGroup>
                {preset === OTHER_PRESET && (
                  <TextArea
                    rows={2}
                    value={other}
                    onChange={e => setOther(e.target.value)}
                    placeholder="ระบุเหตุผลให้ TA แก้ไข…"
                  />
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {decided && doc?.status && (
                <span className="me-auto"><StatusChip status={doc.status} /></span>
              )}
              {!decided && onReject && (
                rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                      ยกเลิก
                    </Button>
                    <Button
                      variant="danger"
                      onClick={submitReject}
                      disabled={!canSubmitReject || busy}
                      isPending={busy}
                    >
                      <X size={14} /> ส่งการตีกลับ
                    </Button>
                  </>
                ) : (
                  <Button variant="danger-soft" onClick={() => setRejecting(true)} disabled={busy}>
                    <X size={14} /> ไม่อนุมัติ
                  </Button>
                )
              )}
              {!decided && !rejecting && onApprove && (
                <Button variant="primary" onClick={onApprove} disabled={busy} isPending={busy}>
                  <Check size={14} /> อนุมัติ
                </Button>
              )}
              <Button slot="close" variant="secondary" onClick={onClose} disabled={busy}>
                ปิด
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
