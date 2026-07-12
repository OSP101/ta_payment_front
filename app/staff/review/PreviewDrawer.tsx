"use client";
import { Drawer } from "@heroui/react";
import { Button } from "../../components/ui";

/** Preview a TA-uploaded document in a right-hand drawer at ~50vw. Content is
 * served by the officer-only /ta-review/:userId/docs/:docId/preview endpoint,
 * which bakes an officer-identifying watermark into the returned bytes so a
 * screenshot leaks the officer's identity. Download endpoint is separate
 * (no watermark) and intentionally not surfaced here.
 */
export function PreviewDrawer({
  userId,
  doc,
  onClose,
}: {
  userId: string | null;
  doc: { id: string; filename: string; kind: string; kindLabel: string } | null;
  onClose: () => void;
}) {
  const open = !!(userId && doc);
  const url =
    userId && doc
      ? `/api/v1/ta-review/${userId}/docs/${doc.id}/preview`
      : "";
  const ext = (doc?.filename.split(".").pop() ?? "").toLowerCase();
  const isImage = ext === "jpg" || ext === "jpeg" || ext === "png";
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
          <Drawer.Footer>
            <Button slot="close" variant="secondary" onClick={onClose}>
              ปิด
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
