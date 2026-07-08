"use client";
import { useEffect, useRef, useState } from "react";

// Minimal signature capture — collects strokes, emits both SVG and PNG-base64.
// PNG is used for embedding into the DOCX creditor form; SVG is kept as an
// exact vector fallback.
interface Props {
  value: string;
  onChange: (svg: string, pngB64: string) => void;
}

export default function Signature({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Array<Array<{ x: number; y: number }>>>([]);
  const [current, setCurrent] = useState<Array<{ x: number; y: number }>>([]);

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
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    if (current.length > 1) {
      ctx.beginPath();
      current.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }, [strokes, current]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    setDrawing(true);
    setCurrent([pos(e)]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    setCurrent(c => [...c, pos(e)]);
  }
  function up() {
    if (!drawing) return;
    const all = [...strokes, current];
    setStrokes(all);
    setCurrent([]);
    setDrawing(false);
    emit(all);
  }
  function clear() {
    setStrokes([]);
    setCurrent([]);
    onChange("", "");
  }
  function emit(all: Array<Array<{ x: number; y: number }>>) {
    const svg = toSVG(all);
    const c = canvasRef.current;
    const png = c ? c.toDataURL("image/png") : "";
    // Strip the "data:image/png;base64," prefix so backend gets pure base64
    const b64 = png.startsWith("data:") ? png.slice(png.indexOf(",") + 1) : png;
    onChange(svg, b64);
  }

  return (
    <div>
      <div className="border border-slate-300 rounded-md bg-white inline-block">
        <canvas ref={canvasRef} width={500} height={140}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                className="touch-none cursor-crosshair" />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className="text-sm text-slate-600 hover:text-slate-800" onClick={clear}>ล้าง</button>
        {value && <span className="text-xs text-slate-500">✓ มีลายเซ็นบันทึกไว้</span>}
      </div>
    </div>
  );
}

function toSVG(strokes: Array<Array<{ x: number; y: number }>>): string {
  if (strokes.length === 0) return "";
  const paths = strokes.map(s =>
    s.length === 0 ? "" : `M ${s.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`,
  ).filter(Boolean).join(" ");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 140'><path d='${paths}' stroke='#111' stroke-width='2' fill='none' stroke-linejoin='round' stroke-linecap='round'/></svg>`;
}
