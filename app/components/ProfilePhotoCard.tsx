"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Camera, ImageUp, Trash2, UploadCloud } from "lucide-react";
import type { Me } from "../lib/api";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { Button, ConfirmDialog, Panel } from "./ui";
import UserAvatar from "./UserAvatar";
import AvatarCropper from "./AvatarCropper";

/** What we let the user hand to the cropper. The cropper's own output is what
 *  actually gets uploaded, and that is always a small JPEG. */
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_PICK_BYTES = 12 * 1024 * 1024;

/**
 * Add / replace / remove a profile picture. Deliberately one card rather than a
 * page of its own: it is the first thing on the account screen, where the rest
 * of "who am I" already lives.
 */
export default function ProfilePhotoCard({ me }: { me: Me }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const hasPhoto = !!me.avatar_url;

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      notify.error("รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP");
      return;
    }
    if (f.size > MAX_PICK_BYTES) {
      notify.error("ไฟล์ใหญ่เกิน 12MB กรุณาเลือกไฟล์ที่เล็กกว่านี้");
      return;
    }
    setFile(f);
  }

  /** Re-read /me for client components AND re-run the server layouts, which is
   *  where the header avatar gets its copy of the user. */
  async function refreshEverywhere() {
    await mutate("/me");
    router.refresh();
  }

  async function upload(blob: Blob) {
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await api.upload<{ avatar_url: string; size: number }>("/me/avatar", form);
      await refreshEverywhere();
      setFile(null);
      notify.success(`บันทึกรูปโปรไฟล์แล้ว (${Math.max(1, Math.round((res?.size ?? blob.size) / 1024))} KB)`);
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.del("/me/avatar");
      await refreshEverywhere();
      setConfirmDelete(false);
      notify.success("ลบรูปโปรไฟล์แล้ว");
    } catch (e) {
      notify.error(e);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title="รูปโปรไฟล์"
      description="รูปนี้จะแสดงบนแถบด้านบนและในรายการที่มีชื่อคุณ"
      className="mb-4"
    >
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-dashed p-4 transition-colors ${
          dragging ? "border-accent bg-accent-soft/40" : "border-[var(--hairline)]"
        }`}
      >
        <div className="relative shrink-0">
          <UserAvatar
            firstName={me.first_name}
            lastName={me.last_name}
            src={me.avatar_url}
            className="size-32 text-3xl"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label={hasPhoto ? "เปลี่ยนรูปโปรไฟล์" : "เพิ่มรูปโปรไฟล์"}
            className="absolute bottom-0 -end-0.5 size-9 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-sm ring-2 ring-surface hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Camera size={16} />
          </button>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-start">
          <div className="text-sm text-foreground">
            {hasPhoto ? "คุณตั้งรูปโปรไฟล์ไว้แล้ว" : "ยังไม่มีรูปโปรไฟล์"}
          </div>
          <div className="text-xs text-muted mt-0.5">
            ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์ — รองรับ JPEG, PNG, WebP ขนาดไม่เกิน 12MB
            <br />
            ระบบจะครอบตัดและบีบอัดให้อัตโนมัติก่อนบันทึก
          </div>
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
            <Button variant="primary" size="sm" onPress={() => inputRef.current?.click()}>
              {hasPhoto ? <ImageUp size={14} /> : <UploadCloud size={14} />}
              {hasPhoto ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
            </Button>
            {hasPhoto && (
              <Button variant="tertiary" size="sm" onPress={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> ลบรูป
              </Button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          // Reset the value so picking the SAME file twice still fires change —
          // otherwise a user who cancels the cropper cannot re-open it.
          onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>

      <AvatarCropper
        file={file}
        open={!!file}
        isSaving={saving}
        onCancel={() => { if (!saving) setFile(null); }}
        onConfirm={upload}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="ลบรูปโปรไฟล์"
        message="ระบบจะกลับไปแสดงอักษรย่อของชื่อคุณแทน คุณอัปโหลดรูปใหม่ได้ทุกเมื่อ"
        confirmLabel="ลบรูป"
        danger
        isPending={deleting}
        icon={<Trash2 size={18} />}
      />
    </Panel>
  );
}
