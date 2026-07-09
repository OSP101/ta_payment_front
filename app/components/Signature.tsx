"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal signature capture — collects strokes, emits both SVG and PNG-base64.
// PNG is used for embedding into the DOCX creditor form; SVG is kept as an
// exact vector fallback.
//
// Implementation notes:
//   * `e.currentTarget` cannot be trusted inside pointer handlers — under
//     React 19 batching + Accordion re-parenting it can be null by the time
//     the browser dispatches a `pointermove`/`pointerup`. We always resolve
//     the canvas via `canvasRef.current` and no-op if it's gone.
//   * The canvas is sized in CSS pixels; we don't scale by devicePixelRatio
//     because the DOCX embed re-rasterises anyway.

interface Props {
  value: string;
  onChange: (svg: string, pngB64: string) => void;
}

type Point = { x: number; y: number };

const W = 500;
const H = 140;

export default function Signature({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[]>([]);

  // Redraw whenever committed strokes or the in-progress path changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const paint = (stroke: Point[]) => {
      if (stroke.length === 0) return;
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    };
    strokes.forEach(paint);
    if (current.length > 1) paint(current);
  }, [strokes, current]);

  const posFromEvent = useCallback((e: React.PointerEvent): Point | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    // Clamp to canvas bounds so out-of-frame drags don't produce absurd
    // coordinates when the pointer is captured.
    const x = Math.max(0, Math.min(W, e.clientX - rect.left));
    const y = Math.max(0, Math.min(H, e.clientY - rect.top));
    return { x, y };
  }, []);

  const emit = useCallback((all: Point[][]) => {
    const svg = toSVG(all);
    const c = canvasRef.current;
    const png = c ? c.toDataURL("image/png") : "";
    const b64 = png.startsWith("data:") ? png.slice(png.indexOf(",") + 1) : png;
    onChange(svg, b64);
  }, [onChange]);

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = posFromEvent(e);
    if (!p) return;
    drawingRef.current = true;
    setCurrent([p]);
    try {
      // Capture ensures move/up fire even if the pointer leaves the canvas.
      // Guard against browsers that throw if the pointer is already released.
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch { /* ignore */ }
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = posFromEvent(e);
    if (!p) return;
    setCurrent(c => [...c, p]);
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch { /* ignore */ }
    setCurrent(cur => {
      // Only commit a stroke with at least one point.
      if (cur.length === 0) return cur;
      const all = [...strokes, cur];
      setStrokes(all);
      emit(all);
      return [];
    });
  }
  function clear() {
    drawingRef.current = false;
    setStrokes([]);
    setCurrent([]);
    onChange("", "");
  }

  return (
    <div>
      <div className="border border-slate-300 rounded-md bg-white inline-block">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={e => { if (drawingRef.current) up(e); }}
          className="touch-none cursor-crosshair block"
        />
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          className="text-sm text-slate-600 hover:text-slate-800"
          onClick={clear}
        >
          ล้าง
        </button>
        {value && <span className="text-xs text-slate-500">✓ มีลายเซ็นบันทึกไว้</span>}
      </div>
    </div>
  );
}

function toSVG(strokes: Point[][]): string {
  if (strokes.length === 0) return "";
  const paths = strokes
    .map(s => (s.length === 0
      ? ""
      : `M ${s.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`))
    .filter(Boolean)
    .join(" ");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><path d='${paths}' stroke='#111' stroke-width='2' fill='none' stroke-linejoin='round' stroke-linecap='round'/></svg>`;
}
