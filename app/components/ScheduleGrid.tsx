"use client";
import { useMemo, useRef, useState } from "react";
import type React from "react";

export type BlockKind = "" | "lecture" | "lab";

export interface Block {
  id: string;
  term_id: string;
  course_code: string;
  course_name: string;
  course_label?: string; // legacy display string sent from the API
  kind: BlockKind;
  sec_no: string;
  day_of_week: number;
  start_time: string; // HH:MM
  end_time: string;
  note: string;
  is_wba: boolean;
}

export function blockTitle(b: Pick<Block, "course_code" | "course_name" | "course_label">): string {
  const code = b.course_code?.trim() ?? "";
  const name = b.course_name?.trim() ?? "";
  if (code && name) return `${code} ${name}`;
  if (code) return code;
  if (name) return name;
  return b.course_label?.trim() || "";
}

export const KIND_LABEL: Record<BlockKind, string> = {
  "": "",
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
};

export interface DraftRange {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Props {
  blocks: Block[];
  onCreateDraft: (draft: DraftRange) => void;
  onSelectBlock: (id: string) => void;
  disabled?: boolean;
}

// Display order (Mon..Sun) → day_of_week where Sun=0
const DAYS_LONG = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const DAYS_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];
const START_HR = 8;
const END_HR = 20;
const SLOT_MIN = 30;
const SLOTS_PER_HR = 60 / SLOT_MIN;
const HOURS = END_HR - START_HR;
const SLOTS = HOURS * SLOTS_PER_HR;
const TOTAL_MIN = HOURS * 60;
const ROW_PX = 48; // day row height
const MIN_TIMELINE_PX = 720; // horizontal-scroll threshold on narrow screens

function pct(n: number) { return `${n * 100}%`; }
function timeStr(h: number, m: number) {
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function slotToTime(slot: number) {
  const min = slot * SLOT_MIN;
  return timeStr(START_HR + Math.floor(min / 60), min % 60);
}

export default function ScheduleGrid({ blocks, onCreateDraft, onSelectBlock, disabled }: Props) {
  const [drag, setDrag] = useState<{ dayIdx: number; slotStart: number; slotEnd: number } | null>(null);
  const rowsRef = useRef<(HTMLDivElement | null)[]>([]);

  const hours = useMemo(() => Array.from({ length: HOURS + 1 }, (_, i) => START_HR + i), []);

  function slotFromEvent(e: React.PointerEvent, dayIdx: number) {
    const el = rowsRef.current[dayIdx];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const raw = (x / rect.width) * SLOTS;
    return Math.max(0, Math.min(SLOTS, Math.round(raw)));
  }

  function down(e: React.PointerEvent, dayIdx: number) {
    if (disabled) return;
    if ((e.target as HTMLElement).closest("[data-block]")) return; // clicks on blocks handled below
    const s = slotFromEvent(e, dayIdx);
    setDrag({ dayIdx, slotStart: s, slotEnd: s });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function move(e: React.PointerEvent, dayIdx: number) {
    if (!drag || drag.dayIdx !== dayIdx) return;
    const s = slotFromEvent(e, dayIdx);
    setDrag({ ...drag, slotEnd: s });
  }
  function up() {
    if (!drag) { return; }
    const start = Math.min(drag.slotStart, drag.slotEnd);
    const end = Math.max(drag.slotStart, drag.slotEnd);
    if (end - start >= 1) {
      onCreateDraft({
        day_of_week: DAY_INDEX[drag.dayIdx],
        start_time: slotToTime(start),
        end_time: slotToTime(end),
      });
    }
    setDrag(null);
  }

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-white overflow-x-auto">
      <div style={{ minWidth: MIN_TIMELINE_PX }}>
        {/* Hour header */}
        <div className="flex items-end border-b border-[var(--hairline)] bg-slate-50">
          <div className="w-20 shrink-0 text-xs text-slate-500 py-2 px-2">เวลา →</div>
          <div className="relative flex-1" style={{ height: 32 }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute top-0 bottom-0 flex items-end pb-1"
                   style={{ left: pct(i / HOURS) }}>
                <span className="text-xs text-slate-500 tabular-nums -translate-x-1/2">{timeStr(h, 0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day rows */}
        {DAYS_LONG.map((label, dayIdx) => {
          const dow = DAY_INDEX[dayIdx];
          const dayBlocks = blocks.filter(b => b.day_of_week === dow && !b.is_wba);
          return (
            <div key={dayIdx} className="flex items-stretch border-b border-[var(--hairline)] last:border-b-0">
              <div className="w-20 shrink-0 flex items-center justify-center text-sm font-medium text-slate-700 bg-slate-50/60">
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{DAYS_SHORT[dayIdx]}</span>
              </div>
              <div
                ref={el => { rowsRef.current[dayIdx] = el; }}
                data-row={dayIdx}
                className="relative flex-1 select-none touch-none"
                style={{
                  height: ROW_PX,
                  cursor: disabled ? "default" : "crosshair",
                }}
                onPointerDown={e => down(e, dayIdx)}
                onPointerMove={e => move(e, dayIdx)}
                onPointerUp={up}
                onPointerCancel={up}
              >
                {/* hour grid lines (excluding leftmost 0 and rightmost edge) */}
                {Array.from({ length: HOURS - 1 }, (_, i) => (
                  <div key={"h" + i} className="absolute top-0 bottom-0"
                       style={{ left: pct((i + 1) / HOURS), width: 1, background: "var(--hairline)" }} />
                ))}
                {/* half-hour minor lines */}
                {Array.from({ length: HOURS }, (_, i) => (
                  <div key={"m" + i} className="absolute top-0 bottom-0"
                       style={{ left: pct((i + 0.5) / HOURS), width: 1, background: "rgba(0,0,0,0.03)" }} />
                ))}
                {/* existing blocks */}
                {dayBlocks.map(b => {
                  const startMin = parseTime(b.start_time) - START_HR * 60;
                  const endMin = parseTime(b.end_time) - START_HR * 60;
                  const heading = blockTitle(b) || "คาบเรียน";
                  const meta = [
                    b.sec_no ? `sec ${b.sec_no}` : "",
                    KIND_LABEL[b.kind],
                  ].filter(Boolean).join(" · ");
                  return (
                    <button
                      key={b.id}
                      data-block
                      type="button"
                      onClick={e => { e.stopPropagation(); onSelectBlock(b.id); }}
                      className="absolute rounded-md text-white text-xs px-1.5 py-1 text-left overflow-hidden hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/60"
                      style={{
                        left: pct(startMin / TOTAL_MIN),
                        width: pct(Math.max(SLOT_MIN, endMin - startMin) / TOTAL_MIN),
                        top: 4, bottom: 4,
                        background: "var(--brand)",
                      }}
                      title={`${heading}${meta ? " · " + meta : ""} · ${b.start_time}–${b.end_time}`}
                    >
                      <div className="font-medium truncate">{heading}</div>
                      <div className="opacity-90 tabular-nums text-[10px] leading-tight truncate">
                        {b.start_time}–{b.end_time}{meta ? " · " + meta : ""}
                      </div>
                    </button>
                  );
                })}
                {/* drag preview */}
                {drag && drag.dayIdx === dayIdx && drag.slotEnd !== drag.slotStart && (
                  <div
                    className="absolute rounded-md border-2 border-dashed pointer-events-none"
                    style={{
                      left: pct(Math.min(drag.slotStart, drag.slotEnd) / SLOTS),
                      width: pct(Math.abs(drag.slotEnd - drag.slotStart) / SLOTS),
                      top: 4, bottom: 4,
                      borderColor: "var(--brand)",
                      background: "rgba(7,118,188,0.10)",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
