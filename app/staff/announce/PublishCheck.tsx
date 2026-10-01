"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Mail, Send, ShieldCheck } from "lucide-react";
import { toast } from "@heroui/react";
import { api, errMessage } from "../../lib/api";
import { Button, Modal, Tip } from "../../components/ui";
import {
  CAT_META, fmtDateTime, fromLocalParts, mailSubject,
  type Ann, type AudiencePreview, type Draft,
} from "./shared";

/**
 * The last look before something is sent.
 *
 * Publishing mails people, and mail cannot be called back — so this is the one
 * place the page stops and asks. It does not ask a yes/no question; it shows
 * the facts that decide the answer: how many people, which people, when, and
 * what the form left unset. Saving a draft, or editing a published notice
 * without changing who it is for, sends nothing and never comes through here.
 */
export default function PublishCheck({
  open, onClose, onConfirm, pending,
  draft, sentence, preview, previewLoading, existing,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  draft: Draft;
  /** The audience rule in words. */
  sentence: string;
  preview: AudiencePreview | null;
  previewLoading: boolean;
  /** The saved announcement when editing one that is already out — its
   *  recipient list is what the new audience is compared against. */
  existing?: Ann | null;
}) {
  const [showNames, setShowNames] = useState(false);
  const [testing, setTesting] = useState(false);

  const liveEdit = draft.originalStatus === "live" || draft.originalStatus === "expired";
  const scheduleAt = draft.when === "scheduled" ? fromLocalParts(draft.publishDate, draft.publishTime) : null;
  const expireAt = draft.expires ? fromLocalParts(draft.expireDate, draft.expireTime) : null;
  const total = preview?.total ?? 0;

  // Who is new and who drops out, when the audience of a published notice changes.
  const diff = useMemo(() => {
    if (!liveEdit || !preview || !existing?.recipients) return null;
    const before = new Map(
      existing.recipients.filter(r => r.user_id).map(r => [r.user_id as string, r.name || r.email]),
    );
    const after = new Set(preview.names.map(n => n.id));
    return {
      added: preview.names.filter(n => !before.has(n.id)),
      removed: [...before].filter(([id]) => !after.has(id)).map(([id, name]) => ({ id, name })),
    };
  }, [liveEdit, preview, existing]);

  const nobody = !!preview && total === 0;
  const blocked = !preview || previewLoading || (nobody && !draft.isPublic);
  const blockedWhy = !preview || previewLoading
    ? "กำลังนับผู้รับ"
    : nobody && !draft.isPublic
      ? "ยังไม่มีผู้รับ กลับไปเลือกกลุ่มผู้รับก่อน"
      : undefined;

  const wantsExpiry = ["warning", "urgent", "event"].includes(draft.category);
  const mediaCount = draft.attachments.length + (draft.cover_image_key ? 1 : 0);
  const notified = liveEdit ? (diff?.added.length ?? 0) : total;

  async function sendTest() {
    setTesting(true);
    try {
      await api.post("/announcements/send-test", {
        title: draft.title.trim(), body: draft.body.trim(), category: draft.category,
      });
      toast.success("ส่งอีเมลทดสอบถึงอีเมลของคุณแล้ว");
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setTesting(false);
    }
  }

  const confirmLabel = liveEdit
    ? notified > 0 ? `บันทึกและแจ้ง ${notified} คนที่เพิ่มใหม่` : "บันทึกการแก้ไข"
    : scheduleAt
      ? "ตั้งเวลาเผยแพร่"
      : nobody ? (draft.isPublic ? "เผยแพร่ทางลิงก์สาธารณะ" : "เผยแพร่") : `เผยแพร่ถึง ${total} คน`;

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose(); }}
      title={liveEdit ? "ตรวจก่อนบันทึก: ผู้รับเปลี่ยนไป" : "ตรวจก่อนเผยแพร่"}
      icon={<ShieldCheck size={18} />}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Tip content="ส่งอีเมลฉบับนี้ถึงอีเมลของคุณคนเดียว เพื่อดูว่าผู้รับจะเห็นอย่างไร ไม่มีใครอื่นได้รับ">
            <Button variant="ghost" onPress={sendTest} isPending={testing} disabled={testing || pending}>
              <Mail size={14} /> ส่งทดสอบถึงตัวเอง
            </Button>
          </Tip>
          <span className="flex-1" />
          <Button variant="tertiary" onPress={onClose} disabled={pending}>กลับไปแก้ไข</Button>
          <Tip content={blockedWhy}>
            <Button variant="primary" onPress={onConfirm} isPending={pending} disabled={blocked || pending}>
              <Send size={14} /> {confirmLabel}
            </Button>
          </Tip>
        </div>
      }
    >
      <ul className="divide-y divide-[var(--hairline)] text-sm" data-testid="publish-check">
        <Row
          ok={!nobody}
          title={
            !preview || previewLoading ? "กำลังนับผู้รับ…"
              : nobody ? (draft.isPublic ? "ไม่มีผู้รับในระบบ อ่านได้ทางลิงก์สาธารณะเท่านั้น" : "ยังไม่มีผู้รับ")
              : preview.everyone ? `ผู้รับ ${total} คน: ทุกคนในระบบ`
              : `ผู้รับ ${total} คน`
          }
          detail={sentence}
          action={total > 0 && (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowNames(s => !s)}>
              {showNames ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}
            </button>
          )}
        >
          {showNames && preview && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-ink-2">
              {preview.names.map(n => n.name).join(" · ")}
            </div>
          )}
          {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
            <div className="mt-2 space-y-1.5 text-xs">
              {diff.added.length > 0 && (
                <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                  <b>เพิ่มใหม่ {diff.added.length} คน</b> จะได้รับแจ้งเตือนและอีเมลเมื่อบันทึก
                  <div className="mt-0.5 text-muted">{diff.added.map(n => n.name).join(" · ")}</div>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2">
                  <b>นำออก {diff.removed.length} คน</b> จะไม่เห็นประกาศนี้ในหน้าประกาศอีก (อีเมลที่ส่งไปแล้วเรียกคืนไม่ได้)
                  <div className="mt-0.5 text-amber-900/80">{diff.removed.map(n => n.name).join(" · ")}</div>
                </div>
              )}
            </div>
          )}
        </Row>

        <Row
          ok
          title={draft.title.trim() || "ยังไม่มีหัวข้อ"}
          detail={
            `${CAT_META[draft.category].label} · เนื้อหา ${draft.body.trim().length.toLocaleString()} ตัวอักษร` +
            (mediaCount ? ` · รูปและไฟล์ ${mediaCount} รายการ` : "")
          }
        />

        {!liveEdit && (
          <Row
            ok
            title={scheduleAt ? `เผยแพร่ ${fmtDateTime(scheduleAt.toISOString())}` : "เผยแพร่ทันทีที่กดยืนยัน"}
            detail={
              nobody
                ? "ไม่มีการส่งแจ้งเตือนหรืออีเมล"
                : `ผู้รับได้ทั้งการแจ้งเตือนในระบบและอีเมล หัวเรื่อง “${mailSubject(draft.category, draft.title.trim())}”`
            }
          />
        )}

        <Row
          ok={!!expireAt || !wantsExpiry}
          title={expireAt ? `หมดอายุ ${fmtDateTime(expireAt.toISOString())}` : "ไม่มีวันหมดอายุ"}
          detail={
            expireAt
              ? "หลังเวลานี้ประกาศจะหายจากหน้าประกาศของผู้รับ"
              : wantsExpiry
                ? "ประกาศประเภทนี้มักมีกำหนด ถ้าไม่ตั้งวันหมดอายุจะค้างอยู่ในหน้าประกาศจนกว่าจะยกเลิกเอง"
                : "ประกาศจะแสดงต่อไปจนกว่าจะยกเลิกเผยแพร่"
          }
        />

        {draft.isPublic && (
          <Row
            ok={false}
            title="เปิดลิงก์สาธารณะ"
            detail="ใครก็ตามที่ได้ลิงก์จะอ่านหัวข้อ เนื้อหา และไฟล์แนบได้โดยไม่ต้องเข้าสู่ระบบ ตรวจว่าไม่มีข้อมูลภายใน"
          />
        )}
      </ul>
    </Modal>
  );
}

function Row({
  ok, title, detail, action, children,
}: {
  ok: boolean;
  title: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <span
          className={
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full " +
            (ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")
          }
        >
          {ok ? <Check size={12} /> : <AlertTriangle size={11} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium text-foreground break-words">{title}</span>
            {action}
          </div>
          {detail && <div className="mt-0.5 text-xs text-muted break-words">{detail}</div>}
          {children}
        </div>
      </div>
    </li>
  );
}
