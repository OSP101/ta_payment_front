"use client";
import { useRef, useState } from "react";
import {
  Image as ImageIcon, X, Trash2, AlertTriangle, Plus, Paperclip, Play, FileText,
} from "lucide-react";
import { toast } from "@heroui/react";
import { api, errMessage } from "../../lib/api";
import type { Attachment } from "../../components/AttachmentGallery";
import { Button, FieldGroup, Alert, Tip } from "../../components/ui";
import { IMG, type Draft, type SetDraft } from "./shared";

// ============================================================================
// Attachments: photos, a clip, the PDF of the official notice
// ============================================================================

const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf";

export function AttachmentsField({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const picked = Array.from(files);
    if (draft.attachments.length + picked.length > 20) {
      setErr("แนบไฟล์ได้ไม่เกิน 20 ไฟล์ต่อหนึ่งประกาศ");
      return;
    }
    setBusy(b => b + picked.length);
    // Uploaded one at a time so a rejected file names itself instead of
    // failing the whole batch anonymously.
    for (const file of picked) {
      const form = new FormData();
      form.append("file", file);
      try {
        const up = await api.upload<Attachment>("/announcements/upload-media", form);
        setDraft(d => ({ ...d, attachments: [...d.attachments, up] }));
      } catch (e) {
        setErr(`${file.name}: ${errMessage(e)}`);
      } finally {
        setBusy(b => b - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const move = (i: number, dir: -1 | 1) => {
    // Functional update: an upload may finish between render and click, and a
    // captured `draft` would then drop the file that just arrived.
    setDraft(d => {
      const next = [...d.attachments];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, attachments: next };
    });
  };

  return (
    <FieldGroup
      label={<span className="inline-flex items-center gap-1.5"><Paperclip size={14} />ไฟล์แนบ (รูป วิดีโอ หรือ PDF)</span>}
      hint="รูปได้หลายรูป เรียงลำดับได้ · รูป ≤ 8MB · วิดีโอ ≤ 80MB · PDF ≤ 20MB"
    >
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={e => void addFiles(e.target.files)}
        />
        <Button variant="ghost" size="sm" onPress={() => fileRef.current?.click()} isDisabled={busy > 0}>
          <Plus size={13} />{busy > 0 ? `กำลังอัปโหลด… (${busy})` : "เพิ่มไฟล์"}
        </Button>

        {err && <div className="text-xs text-danger">{err}</div>}

        {!!draft.attachments.length && (
          <ul className="space-y-1.5">
            {draft.attachments.map((a, i) => (
              <li key={a.storage_key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="size-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent-soft text-accent-soft-foreground">
                    {a.kind === "video" ? <Play size={14} /> : <FileText size={14} />}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs">{a.filename}</span>
                <button type="button" aria-label="เลื่อนขึ้น" onClick={() => move(i, -1)}
                  className="px-1 text-ink-3 hover:text-brand disabled:opacity-30" disabled={i === 0}>↑</button>
                <button type="button" aria-label="เลื่อนลง" onClick={() => move(i, 1)}
                  className="px-1 text-ink-3 hover:text-brand disabled:opacity-30" disabled={i === draft.attachments.length - 1}>↓</button>
                <Tip content={`เอา ${a.filename} ออก`}><button type="button" aria-label={`เอา ${a.filename} ออก`}
                  onClick={() => setDraft(d => ({ ...d, attachments: d.attachments.filter(x => x.storage_key !== a.storage_key) }))}
                  className="px-1 text-ink-3 hover:text-danger">
                  <X size={13} />
                </button></Tip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldGroup>
  );
}

// ============================================================================
// Cover-image field: drag-drop, client resize, validation, preview
// ============================================================================

export function CoverImageField({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!IMG.accept.split(",").includes(file.type)) {
      setError(`รองรับเฉพาะไฟล์ ${IMG.acceptLabel}`);
      return;
    }
    if (file.size > IMG.maxBytes) {
      setError("ไฟล์ใหญ่เกิน 5MB ระบบจะพยายามย่อขนาดให้อัตโนมัติ");
    }
    setUploading(true);
    try {
      const resized = await resizeImage(file);
      const form = new FormData();
      form.append("file", resized, resized.name);
      const res = await api.upload<{ key: string; url: string }>("/announcements/upload-image", form);
      // Functional update: the upload takes seconds, and writing back the
      // `draft` captured when it started erased whatever was typed meanwhile.
      setDraft(d => ({ ...d, cover_image_key: res.key, cover_image_url: res.url }));
      toast.success("อัปโหลดรูปสำเร็จ");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  return (
    <FieldGroup
      label={<span>รูปหน้าปก <span className="text-muted">(ไม่บังคับ)</span></span>}
      hint={
        <span>
          แนะนำอัตราส่วน {IMG.aspectHint} ขนาด {IMG.maxWidth}×{IMG.maxHeight}px, ขั้นต่ำ {IMG.minWidth}px แนวกว้าง
          รองรับ {IMG.acceptLabel} ไม่เกิน 5MB (ระบบย่ออัตโนมัติ)
        </span>
      }
    >
      {draft.cover_image_url ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.cover_image_url}
            alt="cover preview"
            className="w-full aspect-video object-cover bg-surface-secondary"
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button variant="secondary" size="sm" onPress={() => fileRef.current?.click()}>
              <ImageIcon size={13} /> เปลี่ยนรูป
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              onPress={() => setDraft(d => ({ ...d, cover_image_key: null, cover_image_url: null }))}
            >
              <Trash2 size={13} /> เอาออก
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          className={
            "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition " +
            (dragging ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-secondary")
          }
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-xl bg-surface-secondary text-muted flex items-center justify-center mx-auto mb-2">
            <ImageIcon size={22} />
          </div>
          <div className="text-sm font-medium">
            {uploading ? "กำลังอัปโหลด…" : "ลากรูปมาวางหรือคลิกเพื่อเลือก"}
          </div>
          <div className="text-xs text-muted mt-1">
            {IMG.acceptLabel} • ≤ 5MB • {IMG.maxWidth}×{IMG.maxHeight}px
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMG.accept}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          // Reset so choosing the same file twice still fires onChange.
          e.currentTarget.value = "";
        }}
      />
      {error && (
        <Alert status="warning" title={error} icon={<AlertTriangle size={14} />} />
      )}
    </FieldGroup>
  );
}

// Client-side resize to keep upload under 5MB and cap dimensions to IMG.maxWidth×maxHeight.
// Returns the resized File; falls back to the original if canvas is unavailable
// or the file already fits within the box.
async function resizeImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, IMG.maxWidth / bmp.width, IMG.maxHeight / bmp.height);
    if (scale >= 1 && file.size <= IMG.maxBytes) return file;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    // Prefer WebP for smaller size, but fall back to JPEG on older browsers.
    const outType = "image/webp";
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, outType, 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: outType });
  } catch {
    return file;
  }
}
