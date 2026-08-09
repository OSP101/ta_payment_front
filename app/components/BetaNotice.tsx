"use client";
import { FlaskConical, Lock, ClipboardList } from "lucide-react";
import { Button } from "@heroui/react";
import { Modal } from "./ui";

// Bumped if the notice content changes materially and testers should see it
// again even though they already dismissed an earlier version.
const SEEN_KEY = "ta-payment:beta-notice-seen:v1";

export function hasSeenBetaNotice(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked — don't force the modal on every load
  }
}

export function markBetaNoticeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not fatal; it'll just auto-open again next visit.
  }
}

// Small pill next to the logo. Always clickable so someone who dismissed the
// notice can still find it again — it isn't only a one-time interruption.
export function BetaBadge({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      title="ระบบอยู่ระหว่างช่วงทดสอบ (Beta) — คลิกเพื่อดูรายละเอียด"
      className="inline-flex items-center rounded-full border border-warning-soft-border bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-none text-warning-soft-foreground hover:brightness-95"
    >
      Beta
    </button>
  );
}

export function BetaNoticeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  function close() {
    markBetaNoticeSeen();
    onClose();
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="ระบบอยู่ระหว่างช่วงทดสอบ (Beta)"
      size="sm"
      icon={<FlaskConical size={18} />}
      footer={<Button variant="primary" onPress={close}>เข้าใจแล้ว</Button>}
    >
      <div className="space-y-3 text-sm text-foreground/80">
        <p>
          เว็บไซต์นี้เปิดให้ทดลองใช้งานกับกลุ่มตัวอย่างก่อนใช้งานจริง อาจพบข้อผิดพลาด
          หรือมีการปรับเปลี่ยนหน้าจอและฟังก์ชันระหว่างช่วงทดสอบ
        </p>
        <div className="flex gap-2.5">
          <Lock size={16} className="mt-0.5 shrink-0 text-muted" />
          <p>ข้อมูลที่ท่านอัปโหลดจะถูกเข้ารหัสไว้บนระบบ เพื่อความปลอดภัยของข้อมูล</p>
        </div>
        <div className="flex gap-2.5">
          <ClipboardList size={16} className="mt-0.5 shrink-0 text-muted" />
          <p>
            ทีมงานขอเก็บข้อมูลการใช้งานของท่านในระหว่างช่วงทดสอบ เพื่อนำไปปรับปรุงและพัฒนาระบบ
            ให้ใช้งานได้ดียิ่งขึ้นก่อนเปิดใช้งานจริง
          </p>
        </div>
      </div>
    </Modal>
  );
}
