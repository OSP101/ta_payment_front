"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Label, Slider } from "@heroui/react";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Undo2 } from "lucide-react";
import { Button, Modal } from "./ui";

/**
 * Crop-and-rotate for a profile picture, in the shape people expect from a
 * phone: a fixed circular window, the picture moving underneath it.
 *
 * Everything happens in the browser. The file the user picked never leaves the
 * machine — what gets uploaded is a 512×512 JPEG this component renders, which
 * is why a 6 MB camera photo turns into ~60 KB without the server having to do
 * anything about it. (The server re-encodes anyway; see handler/avatar.go. That
 * is a safety measure, not the size story.)
 */

/** Edge of the on-screen crop window, in CSS pixels. */
const VIEW = 288;
/** Edge of what we upload. Matches avatarStoredEdge on the server. */
const OUT = 512;
/** Ceiling for the uploaded blob. Reached by dropping quality, never size. */
const TARGET_BYTES = 220 * 1024;
const MAX_ZOOM = 4;

type Transform = { zoom: number; rot: number; x: number; y: number };

const IDENTITY: Transform = { zoom: 1, rot: 0, x: 0, y: 0 };

export default function AvatarCropper({
  file,
  open,
  isSaving = false,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  open: boolean;
  isSaving?: boolean;
  onCancel: () => void;
  /** Receives the cropped, compressed JPEG. */
  onConfirm: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState<Transform>(IDENTITY);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  // Decode the picked file. createImageBitmap applies the EXIF orientation for
  // us — without `from-image` a photo taken in portrait arrives on its side,
  // which is the single most common complaint about home-made croppers.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    setError(null);
    setImg(null);
    setT(IDENTITY);
    (async () => {
      try {
        const b = await createImageBitmap(file, { imageOrientation: "from-image" });
        if (cancelled) { b.close(); return; }
        bitmap = b;
        setImg(b);
      } catch {
        // Safari < 17 has no options-bag overload; fall back to an <img>, which
        // also honours EXIF in every current browser.
        try {
          const el = await loadImageElement(file);
          if (!cancelled) setImg(el);
        } catch {
          if (!cancelled) setError("เปิดไฟล์รูปนี้ไม่ได้ กรุณาเลือกไฟล์อื่น");
        }
      }
    })();
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [file]);

  const dims = useMemo(() => (img ? { w: img.width, h: img.height } : null), [img]);

  /**
   * Scale at which the image just fills the crop window, at zoom 1. Rotation
   * does not enter into it: a quarter turn swaps the two sides, and it is the
   * SHORTER one that has to reach across the window either way.
   */
  const cover = useMemo(() => (dims ? VIEW / Math.min(dims.w, dims.h) : 1), [dims]);

  /**
   * Keep the picture covering the crop window: pan is limited to the overhang
   * on each axis, so a gap can never open at an edge.
   */
  const clamp = useCallback(
    (next: Transform): Transform => {
      if (!dims) return next;
      const [w, h] = next.rot % 180 === 0 ? [dims.w, dims.h] : [dims.h, dims.w];
      const s = (VIEW / Math.min(w, h)) * next.zoom;
      const lx = Math.max(0, (w * s - VIEW) / 2);
      const ly = Math.max(0, (h * s - VIEW) / 2);
      return {
        ...next,
        x: Math.min(lx, Math.max(-lx, next.x)),
        y: Math.min(ly, Math.max(-ly, next.y)),
      };
    },
    [dims],
  );

  /**
   * Paint the current transform onto a square canvas of any size. The preview
   * and the exported file go through this same function, so what the user
   * lines up is exactly what gets saved.
   */
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, size: number) => {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      if (img) {
        const k = size / VIEW;
        ctx.imageSmoothingQuality = "high";
        ctx.translate(size / 2 + t.x * k, size / 2 + t.y * k);
        ctx.rotate((t.rot * Math.PI) / 180);
        const s = cover * t.zoom * k;
        ctx.scale(s, s);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
      ctx.restore();
    },
    [img, t, cover],
  );

  // Redraw the preview on any change. Backing store follows devicePixelRatio so
  // the preview is as sharp as the result it is previewing.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(VIEW * dpr);
    if (c.width !== px) { c.width = px; c.height = px; }
    const ctx = c.getContext("2d");
    if (ctx) paint(ctx, px);
  }, [paint]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setT(prev => clamp({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }
  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!img) return;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setT(prev => clamp({ ...prev, zoom: Math.min(MAX_ZOOM, Math.max(1, prev.zoom * factor)) }));
  }

  /** Arrow keys nudge, so the crop is reachable without a pointer. */
  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = e.shiftKey ? 20 : 5;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    setT(prev => clamp({ ...prev, x: prev.x + d[0], y: prev.y + d[1] }));
  }

  function rotate(deg: number) {
    setT(prev => clamp({ ...prev, rot: (prev.rot + deg + 360) % 360 }));
  }

  async function confirm() {
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) { setError("เบราว์เซอร์นี้ไม่รองรับการปรับแต่งรูปภาพ"); return; }
    paint(ctx, OUT);
    const blob = await compress(c);
    if (!blob) { setError("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่"); return; }
    onConfirm(blob);
  }

  const busy = isSaving || (!img && !error);

  return (
    <Modal
      open={open}
      onClose={() => { if (!isSaving) onCancel(); }}
      title="ครอบตัดรูปโปรไฟล์"
      size="lg"
      footer={
        <>
          <Button variant="tertiary" onPress={onCancel} disabled={isSaving}>ยกเลิก</Button>
          <Button variant="primary" onPress={confirm} isPending={isSaving} disabled={!img}>
            บันทึกรูป
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs text-muted text-center">
          ลากเพื่อเลื่อนรูป เลื่อนแถบด้านล่างหรือหมุนเมาส์เพื่อย่อ-ขยาย — เฉพาะส่วนในวงกลมจะถูกบันทึก
        </p>

        <div
          className="relative rounded-xl overflow-hidden bg-surface-secondary select-none"
          style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
        >
          <canvas
            ref={canvasRef}
            role="application"
            aria-label="พื้นที่ครอบตัดรูปโปรไฟล์ ใช้ปุ่มลูกศรเพื่อเลื่อนรูป"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className="block touch-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: VIEW, height: VIEW }}
          />
          {/* Everything outside the circle is dimmed by one enormous ring
              shadow — cheaper and crisper than an SVG mask. */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ring-2 ring-white/70" />
          {busy && !error && (
            <div className="absolute inset-0 grid place-items-center bg-black/30 text-xs text-white">
              กำลังเปิดรูป…
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="w-full max-w-72 flex items-center gap-2">
          <ZoomOut size={16} className="text-muted shrink-0" aria-hidden />
          <Slider
            className="flex-1"
            value={t.zoom}
            onChange={v => setT(prev => clamp({ ...prev, zoom: Array.isArray(v) ? v[0] : v }))}
            minValue={1}
            maxValue={MAX_ZOOM}
            step={0.01}
            isDisabled={!img}
          >
            <Label className="sr-only">ย่อ-ขยายรูป</Label>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <ZoomIn size={16} className="text-muted shrink-0" aria-hidden />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="tertiary" size="sm" onPress={() => rotate(-90)} disabled={!img}>
            <RotateCcw size={14} /> หมุนซ้าย
          </Button>
          <Button variant="tertiary" size="sm" onPress={() => rotate(90)} disabled={!img}>
            <RotateCw size={14} /> หมุนขวา
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setT(IDENTITY)} disabled={!img}>
            <Undo2 size={14} /> รีเซ็ต
          </Button>
        </div>

        <p className="text-[11px] text-muted text-center">
          บันทึกเป็น JPEG ขนาด {OUT}×{OUT} พิกเซล และบีบอัดให้ไม่เกิน {Math.round(TARGET_BYTES / 1024)} KB โดยอัตโนมัติ
        </p>
      </div>
    </Modal>
  );
}

/**
 * Encode to JPEG, dropping quality until the blob fits the ceiling. Quality is
 * the right dial to turn: shrinking the pixel count instead would blur the face,
 * while the step from q=0.92 to q=0.6 on a 512px portrait is hard to see and
 * typically halves the bytes.
 */
async function compress(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let last: Blob | null = null;
  for (const q of [0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.45]) {
    const blob = await toBlob(canvas, q);
    if (!blob) break;
    last = blob;
    if (blob.size <= TARGET_BYTES) return blob;
  }
  return last;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    el.src = url;
  });
}
