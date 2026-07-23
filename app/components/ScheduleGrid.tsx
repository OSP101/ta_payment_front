"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Tooltip as HTooltip } from "@heroui/react";

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
  /** Called after a drag on an empty cell. The parent should insert the block
   * silently — the user can click it later to edit name/section/kind. */
  onCreateDraft: (draft: DraftRange) => void;
  /** Called when the user clicks (without dragging) a block. */
  onSelectBlock: (id: string) => void;
  /** Called after a drag-to-move of an existing block. */
  onMoveBlock?: (id: string, day: number, start: string, end: string) => void;
  /** Called after a drag-to-resize of an existing block. */
  onResizeBlock?: (id: string, start: string, end: string) => void;
  disabled?: boolean;
}

// Display order (Mon..Sun) → day_of_week where Sun=0
const DAYS_LONG = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const DAYS_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // maps dayIdx → day_of_week
const DOW_TO_IDX = (() => {
  const m: number[] = [];
  DAY_INDEX.forEach((dow, idx) => (m[dow] = idx));
  return m;
})();
const START_HR = 8;
const END_HR = 20;
const SLOT_MIN = 30;
const SLOTS_PER_HR = 60 / SLOT_MIN;
const HOURS = END_HR - START_HR;
const SLOTS = HOURS * SLOTS_PER_HR;
const TOTAL_MIN = HOURS * 60;
const ROW_PX = 64; // taller so overlap lanes stay readable
const MIN_TIMELINE_PX = 720;
const EDGE_HANDLE_PX = 8; // pointer hit-zone at the left/right of a block for resize
const CLICK_MOVE_THRESHOLD_SLOTS = 1; // <1 slot of movement counts as a click, not a drag

function pct(n: number) { return `${n * 100}%`; }
function timeStr(h: number, m: number) {
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function slotToTime(slot: number) {
  const min = Math.round(slot) * SLOT_MIN;
  return timeStr(START_HR + Math.floor(min / 60), min % 60);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Assign each block a lane so overlapping blocks stack vertically inside the
// row instead of collapsing on top of each other. Greedy: sort by start, drop
// the block into the first lane that's free at that time.
function packLanes(blocks: Block[]): { block: Block; lane: number; laneCount: number }[] {
  const sorted = blocks.slice().sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
  const laneEnds: number[] = []; // last endMin per lane
  const out: { block: Block; lane: number; laneCount: number }[] = [];
  for (const b of sorted) {
    const startMin = parseTime(b.start_time);
    const endMin = parseTime(b.end_time);
    let lane = laneEnds.findIndex(e => e <= startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endMin);
    } else {
      laneEnds[lane] = endMin;
    }
    out.push({ block: b, lane, laneCount: 0 });
  }
  const laneCount = Math.max(1, laneEnds.length);
  return out.map(x => ({ ...x, laneCount }));
}

type DragState =
  | { kind: "idle" }
  | {
      kind: "creating";
      startDayIdx: number;
      startSlot: number;
      endDayIdx: number;
      endSlot: number;
    }
  | {
      kind: "moving";
      id: string;
      /** how many slots into the block the pointer originally landed */
      grabSlots: number;
      durationSlots: number;
      startDayIdx: number;
      dayIdx: number;
      startSlot: number;
      hasMoved: boolean;
    }
  | {
      kind: "resizing";
      id: string;
      edge: "left" | "right";
      dayIdx: number;
      startSlot: number;
      endSlot: number;
      hasMoved: boolean;
    };

export default function ScheduleGrid({
  blocks,
  onCreateDraft,
  onSelectBlock,
  onMoveBlock,
  onResizeBlock,
  disabled,
}: Props) {
  const [drag, setDrag] = useState<DragState>({ kind: "idle" });
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const hours = useMemo(() => Array.from({ length: HOURS + 1 }, (_, i) => START_HR + i), []);

  // Per-day lane assignment. Recomputed when blocks change.
  const layout = useMemo(() => {
    const byDay = new Map<number, Block[]>();
    for (const b of blocks) {
      if (b.is_wba) continue;
      const arr = byDay.get(b.day_of_week) ?? [];
      arr.push(b);
      byDay.set(b.day_of_week, arr);
    }
    const packed = new Map<number, ReturnType<typeof packLanes>>();
    for (const [dow, arr] of byDay) {
      packed.set(dow, packLanes(arr));
    }
    return packed;
  }, [blocks]);

  // Translate a client-coord (x, y) inside the timeline into (dayIdx, slot).
  function coordFromEvent(e: React.PointerEvent | PointerEvent): { dayIdx: number; slot: number } {
    const el = timelineRef.current;
    if (!el) return { dayIdx: 0, slot: 0 };
    const rect = el.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    const slot = clamp(Math.round((x / rect.width) * SLOTS), 0, SLOTS);
    const dayIdx = clamp(Math.floor(y / ROW_PX), 0, DAYS_LONG.length - 1);
    return { dayIdx, slot };
  }

  // Handle document-level pointer events so movement crosses row boundaries.
  useEffect(() => {
    if (drag.kind === "idle") return;

    function onMove(ev: PointerEvent) {
      const { dayIdx, slot } = coordFromEvent(ev);
      setDrag(prev => {
        if (prev.kind === "creating") {
          return { ...prev, endDayIdx: dayIdx, endSlot: slot };
        }
        if (prev.kind === "moving") {
          // Snap: shift block so pointer stays at the grabbed offset.
          let newStart = slot - prev.grabSlots;
          newStart = clamp(newStart, 0, SLOTS - prev.durationSlots);
          const moved =
            prev.hasMoved ||
            dayIdx !== prev.startDayIdx ||
            newStart !== prev.startSlot;
          return { ...prev, dayIdx, startSlot: newStart, hasMoved: moved };
        }
        if (prev.kind === "resizing") {
          if (prev.edge === "left") {
            const newStart = clamp(slot, 0, prev.endSlot - 1);
            return { ...prev, startSlot: newStart, hasMoved: prev.hasMoved || newStart !== prev.startSlot };
          } else {
            const newEnd = clamp(slot, prev.startSlot + 1, SLOTS);
            return { ...prev, endSlot: newEnd, hasMoved: prev.hasMoved || newEnd !== prev.endSlot };
          }
        }
        return prev;
      });
    }

    function onUp() {
      setDrag(prev => {
        if (prev.kind === "creating") {
          const startSlot = Math.min(prev.startSlot, prev.endSlot);
          const endSlot = Math.max(prev.startSlot, prev.endSlot);
          const dayIdx = prev.endDayIdx; // whichever row the drag ended in
          if (endSlot - startSlot >= 1) {
            onCreateDraft({
              day_of_week: DAY_INDEX[dayIdx],
              start_time: slotToTime(startSlot),
              end_time: slotToTime(endSlot),
            });
          }
        } else if (prev.kind === "moving") {
          if (!prev.hasMoved) {
            // No effective drag → treat as click.
            onSelectBlock(prev.id);
          } else if (onMoveBlock) {
            onMoveBlock(
              prev.id,
              DAY_INDEX[prev.dayIdx],
              slotToTime(prev.startSlot),
              slotToTime(prev.startSlot + prev.durationSlots),
            );
          }
        } else if (prev.kind === "resizing") {
          if (prev.hasMoved && onResizeBlock) {
            onResizeBlock(prev.id, slotToTime(prev.startSlot), slotToTime(prev.endSlot));
          } else {
            // Trivial resize (pointer never left the edge) → open editor.
            onSelectBlock(prev.id);
          }
        }
        return { kind: "idle" };
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.kind]);

  function onTimelinePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    const target = e.target as HTMLElement;
    // Block-body / resize-handle clicks are handled by their own listeners below.
    if (target.closest("[data-block]") || target.closest("[data-handle]")) return;
    if (e.button !== 0) return;
    const { dayIdx, slot } = coordFromEvent(e);
    setDrag({
      kind: "creating",
      startDayIdx: dayIdx,
      startSlot: slot,
      endDayIdx: dayIdx,
      endSlot: slot,
    });
  }

  function startMove(e: React.PointerEvent, b: Block) {
    if (disabled) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    const { dayIdx: pointerDayIdx, slot: pointerSlot } = coordFromEvent(e);
    const startSlot = Math.round((parseTime(b.start_time) - START_HR * 60) / SLOT_MIN);
    const endSlot = Math.round((parseTime(b.end_time) - START_HR * 60) / SLOT_MIN);
    setDrag({
      kind: "moving",
      id: b.id,
      grabSlots: clamp(pointerSlot - startSlot, 0, endSlot - startSlot),
      durationSlots: endSlot - startSlot,
      startDayIdx: pointerDayIdx,
      dayIdx: pointerDayIdx,
      startSlot,
      hasMoved: false,
    });
  }

  function startResize(e: React.PointerEvent, b: Block, edge: "left" | "right") {
    if (disabled) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    const dayIdx = DOW_TO_IDX[b.day_of_week] ?? 0;
    const startSlot = Math.round((parseTime(b.start_time) - START_HR * 60) / SLOT_MIN);
    const endSlot = Math.round((parseTime(b.end_time) - START_HR * 60) / SLOT_MIN);
    setDrag({
      kind: "resizing",
      id: b.id,
      edge,
      dayIdx,
      startSlot,
      endSlot,
      hasMoved: false,
    });
  }

  const previewInFlightId =
    drag.kind === "moving" || drag.kind === "resizing" ? drag.id : null;

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

        {/* Grid body: single continuous pointer surface so drag crosses rows. */}
        <div className="flex items-stretch">
          <div className="w-20 shrink-0 flex flex-col bg-slate-50/60">
            {DAYS_LONG.map((label, dayIdx) => (
              <div
                key={dayIdx}
                className="flex items-center justify-center text-sm font-medium text-slate-700 border-b border-[var(--hairline)] last:border-b-0"
                style={{ height: ROW_PX }}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{DAYS_SHORT[dayIdx]}</span>
              </div>
            ))}
          </div>
          <div
            ref={timelineRef}
            className="relative flex-1 select-none touch-none"
            style={{
              height: ROW_PX * DAYS_LONG.length,
              cursor: disabled ? "default" : drag.kind === "creating" ? "grabbing" : "crosshair",
            }}
            onPointerDown={onTimelinePointerDown}
          >
            {/* row backgrounds */}
            {DAYS_LONG.map((_, i) => (
              <div
                key={"row" + i}
                className="absolute left-0 right-0 border-b border-[var(--hairline)]"
                style={{ top: i * ROW_PX, height: ROW_PX }}
              />
            ))}
            {/* hour grid lines */}
            {Array.from({ length: HOURS - 1 }, (_, i) => (
              <div key={"h" + i} className="absolute top-0 bottom-0 pointer-events-none"
                   style={{ left: pct((i + 1) / HOURS), width: 1, background: "var(--hairline)" }} />
            ))}
            {/* half-hour minor lines */}
            {Array.from({ length: HOURS }, (_, i) => (
              <div key={"m" + i} className="absolute top-0 bottom-0 pointer-events-none"
                   style={{ left: pct((i + 0.5) / HOURS), width: 1, background: "rgba(0,0,0,0.03)" }} />
            ))}

            {/* Existing blocks, packed into lanes per day. */}
            {DAYS_LONG.map((_, dayIdx) => {
              const dow = DAY_INDEX[dayIdx];
              const packed = layout.get(dow) ?? [];
              return packed.map(({ block: b, lane, laneCount }) => {
                if (previewInFlightId === b.id) return null; // rendered by preview branch below
                const startMin = parseTime(b.start_time) - START_HR * 60;
                const endMin = parseTime(b.end_time) - START_HR * 60;
                const laneH = (ROW_PX - 4) / laneCount;
                const heading = blockTitle(b) || "คาบเรียน";
                const meta = [
                  b.sec_no ? `sec ${b.sec_no}` : "",
                  KIND_LABEL[b.kind],
                ].filter(Boolean).join(" · ");
                const tipText = `${heading}${meta ? " · " + meta : ""} · ${b.start_time}–${b.end_time}`;
                return (
                  <HTooltip key={b.id} delay={200}>
                    <HTooltip.Trigger
                      data-block
                      onPointerDown={e => startMove(e, b)}
                      className="absolute rounded-md text-white text-xs overflow-hidden hover:brightness-110 shadow-sm"
                      style={{
                        left: pct(startMin / TOTAL_MIN),
                        width: pct(Math.max(SLOT_MIN, endMin - startMin) / TOTAL_MIN),
                        top: dayIdx * ROW_PX + 2 + lane * laneH,
                        height: laneH - 2,
                        background: "var(--brand)",
                        cursor: disabled ? "default" : "grab",
                      }}
                    >
                      {/* left resize handle */}
                      {!disabled && (
                        <HTooltip delay={200}>
                          <HTooltip.Trigger
                            data-handle
                            onPointerDown={e => startResize(e, b, "left")}
                            className="absolute left-0 top-0 bottom-0 hover:bg-white/20"
                            style={{ width: EDGE_HANDLE_PX, cursor: "ew-resize" }}
                          />
                          <HTooltip.Content>
                            <div className="text-xs">ลากเพื่อขยับเวลาเริ่ม</div>
                          </HTooltip.Content>
                        </HTooltip>
                      )}
                      <div className="px-1.5 py-1 pointer-events-none">
                        <div className="font-medium truncate">{heading}</div>
                        <div className="opacity-90 tabular-nums text-[10px] leading-tight truncate">
                          {b.start_time}–{b.end_time}{meta ? " · " + meta : ""}
                        </div>
                      </div>
                      {/* right resize handle */}
                      {!disabled && (
                        <HTooltip delay={200}>
                          <HTooltip.Trigger
                            data-handle
                            onPointerDown={e => startResize(e, b, "right")}
                            className="absolute right-0 top-0 bottom-0 hover:bg-white/20"
                            style={{ width: EDGE_HANDLE_PX, cursor: "ew-resize" }}
                          />
                          <HTooltip.Content>
                            <div className="text-xs">ลากเพื่อขยับเวลาสิ้นสุด</div>
                          </HTooltip.Content>
                        </HTooltip>
                      )}
                    </HTooltip.Trigger>
                    <HTooltip.Content>
                      <div className="text-xs">{tipText}</div>
                    </HTooltip.Content>
                  </HTooltip>
                );
              });
            })}

            {/* Drag preview for creating */}
            {drag.kind === "creating" && (drag.endSlot !== drag.startSlot || drag.endDayIdx !== drag.startDayIdx) && (
              <div
                className="absolute rounded-md border-2 border-dashed pointer-events-none"
                style={{
                  left: pct(Math.min(drag.startSlot, drag.endSlot) / SLOTS),
                  width: pct(Math.max(1, Math.abs(drag.endSlot - drag.startSlot)) / SLOTS),
                  top: drag.endDayIdx * ROW_PX + 4,
                  height: ROW_PX - 8,
                  borderColor: "var(--brand)",
                  background: "rgba(7,118,188,0.10)",
                }}
              />
            )}

            {/* Drag preview for moving */}
            {drag.kind === "moving" && (
              <div
                className="absolute rounded-md text-white text-xs px-1.5 py-1 pointer-events-none opacity-90"
                style={{
                  left: pct(drag.startSlot / SLOTS),
                  width: pct(drag.durationSlots / SLOTS),
                  top: drag.dayIdx * ROW_PX + 4,
                  height: ROW_PX - 8,
                  background: "var(--brand)",
                  border: "2px solid white",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                <div className="tabular-nums text-[10px] font-medium">
                  {slotToTime(drag.startSlot)}–{slotToTime(drag.startSlot + drag.durationSlots)}
                </div>
              </div>
            )}

            {/* Drag preview for resizing */}
            {drag.kind === "resizing" && (
              <div
                className="absolute rounded-md pointer-events-none"
                style={{
                  left: pct(drag.startSlot / SLOTS),
                  width: pct(Math.max(1, drag.endSlot - drag.startSlot) / SLOTS),
                  top: drag.dayIdx * ROW_PX + 4,
                  height: ROW_PX - 8,
                  background: "rgba(7,118,188,0.35)",
                  border: "2px solid var(--brand)",
                }}
              >
                <div className="text-white text-[10px] tabular-nums px-1.5 py-1 font-medium">
                  {slotToTime(drag.startSlot)}–{slotToTime(drag.endSlot)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-muted px-3 py-2 border-t border-[var(--hairline)]">
        ลากในพื้นที่ว่างเพื่อสร้างคาบใหม่ · ลากคาบเพื่อย้ายวัน/เวลา · จับขอบซ้ายหรือขวาของคาบเพื่อขยาย/หด · คลิกเพื่อแก้ไขรายละเอียด · คาบที่ซ้อนกันจะถูกจัดชั้นให้อัตโนมัติ
      </div>
    </div>
  );
}
