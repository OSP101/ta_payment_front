"use client";
import { Popover, Checkbox } from "@heroui/react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, TextArea, FieldGroup } from "../../components/ui";

const KINDS: { id: string; label: string }[] = [
  { id: "national_id",   label: "สำเนาบัตรประชาชน" },
  { id: "bank_book",     label: "สำเนาสมุดบัญชีธนาคาร" },
  { id: "creditor_form", label: "แบบฟอร์มเจ้าหนี้" },
];

export interface DocForReject {
  id: string;
  kind: string;
  status: string;
}

/** Row-level reject popover. Officer ticks which files have problems and
 * writes a reason under each ticked file; TA sees these reasons on their
 * onboarding page and re-uploads only the flagged files.
 *
 * Submit is blocked until every ticked file has a non-empty reason.
 */
export function RejectPopover({
  docs,
  busy,
  onSubmit,
}: {
  docs: DocForReject[];
  busy?: boolean;
  onSubmit: (items: { doc_id: string; reason: string }[]) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  // Clear form whenever the popover closes so a stale selection can't
  // sneak into a fresh officer action on the same row.
  useEffect(() => {
    if (!isOpen) {
      setChecked({});
      setReasons({});
    }
  }, [isOpen]);

  const byKind = new Map(docs.map(d => [d.kind, d]));
  const eligibleKinds = KINDS.filter(k => {
    const d = byKind.get(k.id);
    return d && d.status !== "approved";
  });

  const items = Object.keys(checked)
    .filter(k => checked[k])
    .map(k => ({ doc_id: byKind.get(k)!.id, reason: (reasons[k] ?? "").trim() }));
  const canSubmit = items.length > 0 && items.every(i => i.reason.length > 0);

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    await onSubmit(items);
    setIsOpen(false);
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button variant="danger-soft" size="sm" disabled={busy || eligibleKinds.length === 0}>
          <X size={14} /> ปฏิเสธ
        </Button>
      </Popover.Trigger>
      <Popover.Content className="w-[420px]">
        <Popover.Dialog>
          <Popover.Heading>ปฏิเสธเอกสาร</Popover.Heading>
          <div className="mt-2 text-sm text-muted">
            เลือกไฟล์ที่มีปัญหาและระบุเหตุผลให้ TA แก้ไข
          </div>
          <div className="mt-4 space-y-3">
            {eligibleKinds.length === 0 ? (
              <div className="text-sm text-muted">ไม่มีเอกสารที่ยังปฏิเสธได้</div>
            ) : (
              eligibleKinds.map(k => (
                <div key={k.id} className="border border-[var(--hairline)] rounded-lg p-3">
                  <Checkbox
                    name={`rej-${k.id}`}
                    isSelected={!!checked[k.id]}
                    onChange={v => setChecked(s => ({ ...s, [k.id]: v }))}
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span className="font-medium">{k.label}</span>
                    </Checkbox.Content>
                  </Checkbox>
                  {checked[k.id] && (
                    <div className="mt-2">
                      <FieldGroup label="เหตุผล">
                        <TextArea
                          rows={2}
                          value={reasons[k.id] ?? ""}
                          onChange={e => setReasons(s => ({ ...s, [k.id]: e.target.value }))}
                          placeholder="เช่น ภาพเบลอ อ่านไม่ออก…"
                        />
                      </FieldGroup>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              isPending={busy}
            >
              ส่งการปฏิเสธ
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
