"use client";
import { useRef, useState } from "react";

export interface Block {
  id: string;
  term_id: string;
  course_label: string;
  day_of_week: number;
  start_time: string; // HH:MM
  end_time: string;
  note: string;
  is_wba: boolean;
}

interface Props {
  blocks: Block[];
  onChange: (bs: Block[]) => void;
  termId: string;
}

const DAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]; // Mon-Sun display
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // maps display order → day_of_week
const START_HR = 8;
const END_HR = 20;
const SLOT_MIN = 30; // 30-min slots
const SLOTS = ((END_HR - START_HR) * 60) / SLOT_MIN;

function timeStr(h: number, m: number) {
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function ScheduleGrid({ blocks, onChange, termId }: Props) {
  const [drag, setDrag] = useState<{ dayIdx: number; slotStart: number; slotEnd: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function slotFromEvent(e: React.PointerEvent, dayIdx: number) {
    const el = gridRef.current?.querySelectorAll<HTMLElement>("[data-col]")[dayIdx];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    return Math.floor((y / rect.height) * SLOTS);
  }

  function slotToTime(slot: number) {
    const min = slot * SLOT_MIN;
    return timeStr(START_HR + Math.floor(min / 60), min % 60);
  }

  function down(e: React.PointerEvent, dayIdx: number) {
    const s = slotFromEvent(e, dayIdx);
    setDrag({ dayIdx, slotStart: s, slotEnd: s + 1 });
  }
  function move(e: React.PointerEvent, dayIdx: number) {
    if (!drag) return;
    if (dayIdx !== drag.dayIdx) return;
    const s = slotFromEvent(e, dayIdx);
    setDrag({ ...drag, slotEnd: Math.max(drag.slotStart + 1, s + 1) });
  }
  function up() {
    if (!drag) return;
    const label = prompt("ชื่อวิชา (ระบุก็ได้):") ?? "";
    const nb: Block = {
      id: "b-" + Date.now(),
      term_id: termId,
      course_label: label,
      day_of_week: DAY_INDEX[drag.dayIdx],
      start_time: slotToTime(Math.min(drag.slotStart, drag.slotEnd)),
      end_time: slotToTime(Math.max(drag.slotStart, drag.slotEnd)),
      note: "", is_wba: false,
    };
    onChange([...blocks, nb]);
    setDrag(null);
  }

  function del(id: string) { onChange(blocks.filter(b => b.id !== id)); }

  return (
    <div className="panel overflow-x-auto">
      <div ref={gridRef} className="grid" style={{ gridTemplateColumns: "5rem repeat(7, minmax(6rem, 1fr))" }}>
        {/* header */}
        <div />
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-sm font-medium py-3 border-b border-[var(--hairline)] bg-slate-50 first:rounded-tl-xl last:rounded-tr-xl">
            {d}
          </div>
        ))}

        {/* time labels */}
        <div className="border-r border-[var(--hairline)]">
          {Array.from({ length: END_HR - START_HR }, (_, i) => (
            <div key={i} className="h-16 text-xs text-slate-500 pr-2 text-right pt-1">{timeStr(START_HR + i, 0)}</div>
          ))}
        </div>

        {/* day columns */}
        {DAYS.map((_, dayIdx) => (
          <div key={dayIdx} data-col={dayIdx}
               className="relative border-l border-[var(--hairline)]"
               style={{ height: (END_HR - START_HR) * 64 }}
               onPointerDown={e => down(e, dayIdx)}
               onPointerMove={e => move(e, dayIdx)}
               onPointerUp={up} onPointerCancel={up}>
            {/* hour lines */}
            {Array.from({ length: END_HR - START_HR }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-slate-50"
                   style={{ top: i * 64 }} />
            ))}
            {/* existing blocks for this day */}
            {blocks.filter(b => b.day_of_week === DAY_INDEX[dayIdx] && !b.is_wba).map(b => {
              const startMin = parseTime(b.start_time) - START_HR * 60;
              const endMin = parseTime(b.end_time) - START_HR * 60;
              const top = (startMin / 60) * 64;
              const height = ((endMin - startMin) / 60) * 64;
              return (
                <div key={b.id}
                     onClick={() => { if (confirm(`ลบคาบ ${b.start_time}–${b.end_time}?`)) del(b.id); }}
                     className="absolute inset-x-1 rounded-md text-xs text-white p-1 cursor-pointer overflow-hidden"
                     style={{ top, height, background: "var(--brand)" }}>
                  <div className="font-medium truncate">{b.course_label || "คาบเรียน"}</div>
                  <div>{b.start_time}–{b.end_time}</div>
                </div>
              );
            })}
            {/* drag preview */}
            {drag && drag.dayIdx === dayIdx && (
              <div className="absolute inset-x-1 rounded-md border-2 border-dashed pointer-events-none"
                   style={{
                     top: Math.min(drag.slotStart, drag.slotEnd) * (64 / (60 / SLOT_MIN)),
                     height: Math.abs(drag.slotEnd - drag.slotStart) * (64 / (60 / SLOT_MIN)),
                     borderColor: "var(--brand)",
                   }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
