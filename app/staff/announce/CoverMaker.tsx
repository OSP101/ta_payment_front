"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ImagePlus, Moon, Sun, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/app/lib/toast";
import { api, errMessage } from "../../lib/api";
import { Button, ConfirmDialog, FieldGroup, Modal, TextArea, TextInput, Tip } from "../../components/ui";

/**
 * Cover maker: type the words of a notice onto a branded background and use
 * the result as the announcement's cover, without leaving the page for a
 * graphics program.
 *
 * Everything is drawn on a 1600×900 canvas in the browser, with the same Kanit
 * the site uses, so what is on screen is the file that gets uploaded. The
 * layout follows the faculty's notice style: a large heading, a title, a line
 * of detail, an orange rule and a note.
 *
 * The faculty background ships with the site. Staff can add more (16:9, at
 * least 1600×900, checked by the server) so a new design needs no code change.
 */

export const COVER_W = 1600;
export const COVER_H = 900;

interface Background {
  id: string;
  name: string;
  url: string;
  text_tone: "dark" | "light";
  width?: number;
  height?: number;
}

const BUILTIN: Background = {
  id: "builtin", name: "มาตรฐานวิทยาลัย", url: "/images/cp-template.png", text_tone: "dark",
};

export interface CoverText {
  kicker: string;
  headline: string;
  detail: string;
  note: string;
  scale: number; // percent
  tone: "dark" | "light";
  backgroundId: string;
}

export const defaultCoverText = (title: string): CoverText => ({
  kicker: "ประกาศ",
  headline: title,
  detail: "",
  note: "",
  scale: 100,
  tone: "dark",
  backgroundId: BUILTIN.id,
});

const PALETTE = {
  dark:  { kicker: "#0776BC", headline: "#1f2328", detail: "#2f3640", accent: "#F28C28" },
  light: { kicker: "#ffffff", headline: "#ffffff", detail: "#e8eef5", accent: "#FFB25B" },
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter("th", { granularity: "word" })
  : null;

/** Thai has no spaces between words, so lines break at dictionary words. */
function words(text: string): string[] {
  if (!segmenter) return text.split(/(\s+)/);
  return Array.from(segmenter.segment(text), s => s.segment);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of words(para)) {
      const next = line + w;
      if (line && ctx.measureText(next.trimEnd()).width > maxWidth) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else {
        line = next;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/**
 * Size and lines for one block of text.
 *
 * One line is preferred: the text first shrinks to three quarters of its
 * largest size trying to fit on one. Only then does it wrap, and a wrapped
 * block is balanced so the last line is not a lone word ("…ปีการศึกษา / 2569").
 * Text that still does not fit at the smallest size is cut with "…".
 */
function fit(
  ctx: CanvasRenderingContext2D, family: string, text: string, weight: number,
  max: number, min: number, maxWidth: number, maxLines: number,
): { size: number; lines: string[] } {
  const font = (n: number) => { ctx.font = `${weight} ${n}px ${family}`; };
  const hasBreaks = text.includes("\n");
  if (!hasBreaks) {
    for (let size = max; size >= Math.max(min, max * 0.75); size = Math.round(size * 0.95)) {
      font(size);
      if (ctx.measureText(text).width <= maxWidth) return { size, lines: [text] };
    }
  }
  let size = hasBreaks ? max : Math.max(min, Math.round(max * 0.9));
  for (;;) {
    font(size);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines: hasBreaks ? lines : balance(ctx, text, maxWidth, lines.length) };
    if (size <= min) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = last + "…";
      return { size, lines: kept };
    }
    size = Math.max(min, Math.round(size * 0.92));
  }
}

/** Narrowest width that still wraps into the same number of lines, so the
 *  lines come out roughly even. */
function balance(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, count: number): string[] {
  if (count < 2) return wrap(ctx, text, maxWidth);
  let lo = maxWidth / count, hi = maxWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(ctx, text, mid).length > count) lo = mid; else hi = mid;
  }
  return wrap(ctx, text, hi);
}

export function drawCover(
  ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null, t: CoverText, family: string,
) {
  const W = COVER_W, H = COVER_H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = t.tone === "dark" ? "#eef4fa" : "#0b2338";
  ctx.fillRect(0, 0, W, H);
  if (bg && bg.naturalWidth) {
    // Cover-fit: fill the canvas, crop what overflows, centred.
    const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
    const w = bg.naturalWidth * s, h = bg.naturalHeight * s;
    ctx.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h);
  }

  const k = t.scale / 100;
  const c = PALETTE[t.tone];
  type Block = { lines: string[]; size: number; weight: number; color: string; gapAfter: number } | { rule: true; gapAfter: number };
  const blocks: Block[] = [];
  const add = (text: string, weight: number, max: number, min: number, maxWidth: number, maxLines: number, color: string, gapAfter: number) => {
    if (!text.trim()) return;
    const { size, lines } = fit(ctx, family, text.trim(), weight, max * k, min * k, maxWidth, maxLines);
    blocks.push({ lines, size, weight, color, gapAfter });
  };
  // Widths keep the heading clear of the logo in the top-right corner.
  add(t.kicker, 600, 230, 110, 980, 1, c.kicker, 4);
  add(t.headline, 600, 116, 60, 1320, 2, c.headline, 10);
  add(t.detail, 400, 54, 32, 1340, 2, c.detail, 0);
  if (t.note.trim()) {
    blocks.push({ rule: true, gapAfter: 0 });
    add(t.note, 500, 40, 26, 1300, 4, c.accent, 0);
  }

  const LH = 1.32;
  const RULE_GAP = 34 * k;
  const heightOf = (b: Block) => ("rule" in b ? RULE_GAP * 2 + 6 : b.lines.length * b.size * LH) + b.gapAfter;
  const total = blocks.reduce((n, b) => n + heightOf(b), 0);
  let y = Math.max(60, (H - total) / 2 - 30);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const b of blocks) {
    if ("rule" in b) {
      ctx.shadowColor = "transparent";
      ctx.fillStyle = c.accent;
      ctx.fillRect(W / 2 - 605, y + RULE_GAP, 1210, 6);
      y += heightOf(b);
      continue;
    }
    ctx.font = `${b.weight} ${b.size}px ${family}`;
    ctx.fillStyle = b.color;
    // White text gets a soft shadow so it still reads on a background that
    // turns out paler than expected.
    ctx.shadowColor = t.tone === "light" ? "rgba(0,0,0,0.45)" : "transparent";
    ctx.shadowBlur = t.tone === "light" ? b.size * 0.12 : 0;
    ctx.shadowOffsetY = t.tone === "light" ? b.size * 0.03 : 0;
    for (const line of b.lines) {
      // Kanit's ascent is roughly its em size; marks above Thai consonants
      // sit inside the 1.32 line box.
      ctx.fillText(line, W / 2, y + b.size * 1.02);
      y += b.size * LH;
    }
    y += b.gapAfter;
  }
}

/** The family name next/font registered for Kanit, ready for ctx.font. */
function kanitFamily(): string {
  if (typeof window === "undefined") return "Kanit, sans-serif";
  const v = getComputedStyle(document.body).getPropertyValue("--font-kanit").trim()
    || getComputedStyle(document.documentElement).getPropertyValue("--font-kanit").trim();
  return v || "Kanit, sans-serif";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("โหลดรูปพื้นหลังไม่สำเร็จ"));
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

export default function CoverMaker({
  open, onClose, value, onChange, onUse,
}: {
  open: boolean;
  onClose: () => void;
  value: CoverText;
  onChange: (v: CoverText) => void;
  /** Receives the finished 1600×900 image. */
  onUse: (file: File) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const { data } = useSWR<{ items: Background[] }>(open ? "/announcements/backgrounds" : null);
  const backgrounds = useMemo(() => [BUILTIN, ...(data?.items ?? [])], [data]);
  const bg = backgrounds.find(b => b.id === value.backgroundId) ?? BUILTIN;
  const set = <K extends keyof CoverText>(k: K, v: CoverText[K]) => onChange({ ...value, [k]: v });

  // Fonts must be loaded before drawing, or the canvas silently uses a fallback.
  useEffect(() => {
    if (!open || family) return;
    const f = kanitFamily();
    Promise.all([400, 500, 600].map(w => document.fonts.load(`${w} 64px ${f}`, "ประกาศ")))
      .catch(() => undefined)
      .finally(() => setFamily(f));
  }, [open, family]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBgError(null);
    loadImage(bg.url)
      .then(img => { if (!cancelled) setBgImg(img); })
      .catch(e => { if (!cancelled) { setBgImg(null); setBgError(errMessage(e)); } });
    return () => { cancelled = true; };
  }, [open, bg.url]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !family) return;
    const id = requestAnimationFrame(() => drawCover(ctx, bgImg, value, family));
    return () => cancelAnimationFrame(id);
  }, [value, bgImg, family]);

  function toBlob(type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvasRef.current?.toBlob(b => (b ? resolve(b) : reject(new Error("สร้างรูปไม่สำเร็จ"))), type, quality);
    });
  }

  async function use() {
    setUsing(true);
    try {
      const blob = await toBlob("image/webp", 0.92);
      await onUse(new File([blob], `cover-${Date.now()}.webp`, { type: "image/webp" }));
      onClose();
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setUsing(false);
    }
  }

  async function download() {
    try {
      const blob = await toBlob("image/png");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(value.headline || value.kicker || "ประกาศ").slice(0, 40)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.danger(errMessage(e));
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!using) onClose(); }}
      title="สร้างรูปหน้าปกจากแม่แบบ"
      icon={<Wand2 size={18} />}
      size="3xl"
      placement="center"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Tip content="บันทึกรูป PNG ลงเครื่อง ไว้ใช้โพสต์ที่อื่น">
            <Button variant="ghost" onPress={download} disabled={!family}>
              <Download size={14} /> ดาวน์โหลดรูป
            </Button>
          </Tip>
          <span className="flex-1" />
          <Button variant="tertiary" onPress={onClose} disabled={using}>ปิด</Button>
          <Button variant="primary" onPress={use} isPending={using} disabled={using || !family}>
            <Check size={14} /> ใช้เป็นรูปหน้าปก
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="cover-maker">
        <div className="min-w-0 space-y-3">
          <canvas
            ref={canvasRef}
            width={COVER_W}
            height={COVER_H}
            className="aspect-video w-full rounded-lg border border-border bg-surface-secondary"
            aria-label="ตัวอย่างรูปหน้าปก"
          />
          {bgError && <div className="text-xs text-danger">{bgError}</div>}
          <BackgroundPicker
            items={backgrounds}
            selected={bg.id}
            onPick={b => onChange({ ...value, backgroundId: b.id, tone: b.text_tone })}
          />
        </div>

        <div className="min-w-0 space-y-3">
          <FieldGroup label="หัวเรื่องใหญ่">
            <TextInput value={value.kicker} maxLength={30} onChange={e => set("kicker", e.target.value)} placeholder="ประกาศ" aria-label="หัวเรื่องใหญ่" />
          </FieldGroup>
          <FieldGroup label="หัวข้อ" hint="ยาวได้ 2 บรรทัด ระบบย่อขนาดให้พอดีเอง">
            <TextArea rows={2} value={value.headline} maxLength={120} onChange={e => set("headline", e.target.value)} placeholder="รายชื่อนักศึกษา" aria-label="หัวข้อ" />
          </FieldGroup>
          <FieldGroup label="รายละเอียด">
            <TextArea rows={2} value={value.detail} maxLength={160} onChange={e => set("detail", e.target.value)} placeholder="สำหรับการสอบกลางภาค ประจำภาคการศึกษาต้น ปีการศึกษา 2569" aria-label="รายละเอียด" />
          </FieldGroup>
          <FieldGroup label="หมายเหตุ" hint="แสดงสีส้มใต้เส้นคั่น ขึ้นบรรทัดใหม่ได้ (สูงสุด 4 บรรทัด)">
            <TextArea rows={3} value={value.note} maxLength={300} onChange={e => set("note", e.target.value)} placeholder="หมายเหตุ : …" aria-label="หมายเหตุ" />
          </FieldGroup>
          <FieldGroup label={`ขนาดตัวอักษร ${value.scale}%`}>
            <input
              type="range" min={70} max={120} step={5} value={value.scale}
              onChange={e => set("scale", Number(e.target.value))}
              aria-label="ขนาดตัวอักษร"
              className="w-full accent-[var(--brand)]"
            />
          </FieldGroup>
          <FieldGroup label="สีตัวอักษร">
            <div className="flex gap-1.5">
              {([["dark", "เข้ม (พื้นสว่าง)", <Sun key="s" size={12} />], ["light", "ขาว (พื้นเข้ม)", <Moon key="m" size={12} />]] as const).map(([v, label, icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={value.tone === v}
                  onClick={() => set("tone", v)}
                  className={`chip inline-flex cursor-pointer items-center gap-1 transition ${value.tone === v ? "chip-brand" : "chip-neutral"}`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

function BackgroundPicker({
  items, selected, onPick,
}: {
  items: Background[];
  selected: string;
  onPick: (b: Background) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<{ file: File; url: string; name: string; tone: "dark" | "light"; size: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<Background | null>(null);
  const [removing, setRemoving] = useState(false);

  /** Checked here too, so a wrong file is turned away before it is uploaded. */
  async function pick(file: File) {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("รองรับเฉพาะ PNG, JPEG หรือ WebP");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("ไฟล์ใหญ่เกิน 8MB");
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const { width: w, height: h } = bmp;
      bmp.close();
      const off = Math.abs(w / h - 16 / 9) / (16 / 9);
      if (w < COVER_W || h < COVER_H) {
        setError(`รูปพื้นหลังต้องมีขนาดอย่างน้อย 1600×900 พิกเซล (รูปนี้ ${w}×${h})`);
        return;
      }
      if (off > 0.01) {
        setError(`รูปพื้นหลังต้องเป็นสัดส่วน 16:9 เช่น 1600×900 หรือ 1920×1080 (รูปนี้ ${w}×${h})`);
        return;
      }
      setPending({
        file, url: URL.createObjectURL(file), size: `${w}×${h}`,
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 100), tone: "dark",
      });
    } catch {
      setError("อ่านรูปไม่ได้ ไฟล์อาจเสีย");
    }
  }

  async function upload() {
    if (!pending) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", pending.file, pending.file.name);
      form.append("name", pending.name);
      form.append("text_tone", pending.tone);
      const b = await api.upload<Background>("/announcements/backgrounds", form);
      await mutate("/announcements/backgrounds");
      URL.revokeObjectURL(pending.url);
      setPending(null);
      onPick(b);
      toast.success("เพิ่มพื้นหลังแล้ว");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function del() {
    if (!remove) return;
    setRemoving(true);
    try {
      await api.del(`/announcements/backgrounds/${remove.id}`);
      await mutate("/announcements/backgrounds");
      if (remove.id === selected) onPick(BUILTIN);
      toast.success("ลบพื้นหลังแล้ว");
      setRemove(null);
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-foreground">พื้นหลัง</span>
        <span className="text-xs text-muted">เพิ่มได้เอง: PNG, JPEG หรือ WebP สัดส่วน 16:9 อย่างน้อย 1600×900 พิกเซล ไม่เกิน 8MB</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(b => (
          <div key={b.id} className="group relative">
            <button
              type="button"
              onClick={() => onPick(b)}
              aria-pressed={b.id === selected}
              aria-label={`พื้นหลัง ${b.name}`}
              className={
                "block w-32 overflow-hidden rounded-md border-2 transition " +
                (b.id === selected ? "border-[var(--brand)]" : "border-transparent hover:border-border")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
              <span className="block truncate bg-surface px-1.5 py-0.5 text-start text-[11px] text-ink-2">{b.name}</span>
            </button>
            {b.id !== BUILTIN.id && (
              <Tip content={`ลบพื้นหลัง ${b.name}`}>
                <button
                  type="button"
                  aria-label={`ลบพื้นหลัง ${b.name}`}
                  onClick={() => setRemove(b)}
                  className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-md bg-surface/90 text-danger opacity-100 shadow-sm transition-opacity pointer-fine:opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </Tip>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex aspect-video w-32 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-xs text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <ImagePlus size={16} /> เพิ่มพื้นหลัง
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.currentTarget.value = ""; }}
        />
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      {pending && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-secondary p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.url} alt="" className="aspect-video w-32 rounded object-cover" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-xs text-muted">{pending.size} พิกเซล</div>
            <TextInput value={pending.name} maxLength={100} onChange={e => setPending(p => (p ? { ...p, name: e.target.value } : p))} aria-label="ชื่อพื้นหลัง" placeholder="ชื่อพื้นหลัง" />
            <div className="flex flex-wrap gap-1.5">
              {([["dark", "พื้นสว่าง ใช้ตัวอักษรเข้ม"], ["light", "พื้นเข้ม ใช้ตัวอักษรขาว"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={pending.tone === v}
                  onClick={() => setPending(p => (p ? { ...p, tone: v } : p))}
                  className={`chip cursor-pointer transition ${pending.tone === v ? "chip-brand" : "chip-neutral"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="tertiary" size="sm" onPress={() => { URL.revokeObjectURL(pending.url); setPending(null); }} disabled={uploading}>ยกเลิก</Button>
            <Button variant="primary" size="sm" onPress={upload} isPending={uploading} disabled={uploading || !pending.name.trim()}>
              เพิ่มพื้นหลัง
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={del}
        isPending={removing}
        danger
        icon={<Trash2 size={18} />}
        title="ลบพื้นหลัง?"
        message={`ลบ “${remove?.name ?? ""}” ออกจากรายการพื้นหลัง และนำกลับมาไม่ได้ รูปหน้าปกที่สร้างไปแล้วจะไม่ได้รับผลกระทบ`}
        confirmLabel="ลบ"
      />
    </div>
  );
}
