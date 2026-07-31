"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { CalendarDays, Download, Printer } from "lucide-react";
import { Modal, Button, Spinner, Alert } from "./ui";
import { packLanes, parseTime } from "./ScheduleGrid";

/**
 * The TA's week, for reading on a screen.
 *
 * The printable form at /timetable-form reproduces the college's spreadsheet
 * exactly — thirteen fixed hour columns, two lanes per day, 9px labels — because
 * that is the paper the lecturer signs. Rendering the same layout on screen gave
 * the worst of both: every course title clipped, a one-hour duty the same width
 * as a three-hour one, and co-taught sections silently drawn on top of each
 * other.
 *
 * So the screen gets its own view, in the language this app already uses for
 * timetables (see ScheduleGrid, the TA's own schedule editor): days are rows,
 * time is the horizontal axis, and a block's WIDTH is its real duration. The
 * lane packing is imported from that component rather than re-derived, so the
 * two screens can never disagree about how overlaps stack.
 *
 * Paper is untouched: the print and PDF buttons still go to the official form.
 */

interface Block {
  kind: "own_class" | "lecture" | "lab" | "review";
  course_code: string;
  course_name?: string;
  sec_no?: string;
  track?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  expected?: number;
  logged?: number;
}
interface Signer {
  lecturer_name: string;
  courses: string[];
}
interface FormData {
  ta_name: string; student_id?: string; term_label: string;
  blocks: Block[]; signers: Signer[];
  has_own_classes: boolean;
}

/**
 * Four categories, four colours, each with a text tag beside it.
 *
 * The palette is the app's own rather than the spreadsheet's: the college file's
 * pastels were chosen to survive a photocopier and are too washed out to carry
 * dark text on a lit screen. The MEANING is identical to the printed form, so a
 * reader moving between the two is never re-learning anything.
 */
const STYLE: Record<Block["kind"], { bg: string; fg: string; tag: string; label: string }> = {
  own_class: { bg: "#F5C4B3", fg: "#4A1B0C", tag: "เรียน", label: "คาบเรียนของเขา" },
  lecture:   { bg: "#C0DD97", fg: "#173404", tag: "บรรยาย", label: "บรรยาย" },
  lab:       { bg: "#B5D4F4", fg: "#042C53", tag: "ปฏิบัติการ", label: "ปฏิบัติการ" },
  review:    { bg: "#CECBF6", fg: "#26215C", tag: "ตรวจงาน", label: "ตรวจงาน" },
};

// Same window as the paper form: evening grading really does run to 21:00.
const START_HR = 8;
const END_HR = 21;
const TOTAL_MIN = (END_HR - START_HR) * 60;
const ROW_MIN_PX = 34;
const LANE_PX = 22;

const DAYS = [
  { dow: 1, label: "จันทร์" }, { dow: 2, label: "อังคาร" }, { dow: 3, label: "พุธ" },
  { dow: 4, label: "พฤหัส" }, { dow: 5, label: "ศุกร์" },
  { dow: 6, label: "เสาร์" }, { dow: 0, label: "อาทิตย์" },
];

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

export function TimetableModal({
  open, onClose, termId, taId, taName,
}: {
  open: boolean; onClose: () => void;
  termId: string | null; taId: string | null; taName?: string;
}) {
  const key = open && termId && taId
    ? `/timetable-form?term_id=${termId}&user_id=${taId}`
    : null;
  const { data, isLoading } = useSWR<FormData>(key);

  const printHref = termId && taId
    ? `/timetable-form?term_id=${termId}&user_id=${taId}`
    : "#";
  const pdfHref = termId && taId
    ? `/api/v1/timetable-form.pdf?term_id=${termId}&user_id=${taId}`
    : "#";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
      icon={<CalendarDays size={18} />}
      title={data ? `ตารางเรียนและตารางปฏิบัติงาน — ${data.ta_name}` : (taName ?? "ตารางเรียน")}
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-muted">
              {data.student_id ? `รหัส ${data.student_id} · ` : ""}ภาคการศึกษา {data.term_label}
            </span>
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onPress={() => window.open(pdfHref, "_blank", "noopener")}>
              <Download size={14} /> PDF
            </Button>
            <Button variant="secondary" size="sm" onPress={() => window.open(printHref, "_blank", "noopener")}>
              <Printer size={14} /> พิมพ์ฟอร์ม
            </Button>
          </div>

          {!data.has_own_classes && (
            <Alert
              status="warning"
              title="ยังไม่มีตารางเรียนของนักศึกษา"
              description="ตรวจการทับซ้อนกับเวลาเรียนไม่ได้จนกว่าเขาจะกรอกตารางเรียนของตัวเอง"
            />
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(Object.keys(STYLE) as Block["kind"][]).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STYLE[k].bg }} />
                {STYLE[k].label}
              </span>
            ))}
          </div>

          <Timeline blocks={data.blocks} />

          {data.signers.length > 0 && (
            <p className="text-xs text-muted">
              อาจารย์ผู้ลงนาม:{" "}
              {data.signers.map(s => `${s.lecturer_name} (${s.courses.join(", ")})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Days down, hours across. A block's left/width come straight from its real
 * start and end, so a one-hour duty is visibly a third of a three-hour lab —
 * which the fixed-column layout could not express at all.
 */
function Timeline({ blocks }: { blocks: Block[] }) {
  const byDay = useMemo(() => {
    const m = new Map<number, { block: Block; lane: number; laneCount: number }[]>();
    for (const d of DAYS) {
      const dayBlocks = blocks.filter(
        b => b.day_of_week === d.dow && parseTime(b.start_time) < parseTime(b.end_time),
      );
      if (dayBlocks.length > 0) m.set(d.dow, packLanes(dayBlocks));
    }
    return m;
  }, [blocks]);

  // Weekend rows only when something falls there — two permanently empty rows
  // cost a fifth of the height and say nothing.
  const days = DAYS.filter(d => (d.dow >= 1 && d.dow <= 5) || byDay.has(d.dow));
  const hours = Array.from({ length: END_HR - START_HR + 1 }, (_, i) => START_HR + i);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-surface">
      <div className="min-w-[760px]">
        <div className="flex border-b border-[var(--hairline)] bg-surface-secondary">
          <div className="w-16 shrink-0 px-2 py-1.5 text-[11px] text-muted">เวลา →</div>
          <div className="relative flex-1" style={{ height: 24 }}>
            {hours.map((h, i) => {
              // The first and last labels sit ON the edges, so centring them
              // pushes half of each outside the box — the closing hour came out
              // clipped to a single digit.
              const last = i === hours.length - 1;
              return (
                <span
                  key={h}
                  className={
                    "absolute bottom-1 text-[11px] tabular text-muted " +
                    (i === 0 ? "" : last ? "-translate-x-full" : "-translate-x-1/2")
                  }
                  style={{ left: pct(i / (END_HR - START_HR)) }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              );
            })}
          </div>
        </div>

        {days.map(d => {
          const packed = byDay.get(d.dow) ?? [];
          const laneCount = packed.length > 0 ? packed[0].laneCount : 1;
          const rowH = Math.max(ROW_MIN_PX, laneCount * LANE_PX + 8);
          return (
            <div key={d.dow} className="flex border-b border-[var(--hairline)] last:border-b-0">
              <div
                className="flex w-16 shrink-0 items-center justify-center bg-surface-secondary text-xs font-medium"
                style={{ minHeight: rowH }}
              >
                {d.label}
              </div>
              <div className="relative flex-1" style={{ height: rowH }}>
                {/* Hour gridlines — the only thing that makes a block's position
                    readable as a time rather than as a position. */}
                {hours.slice(1, -1).map((h, i) => (
                  <div
                    key={h}
                    aria-hidden
                    className="absolute top-0 bottom-0 w-px bg-[var(--hairline)]"
                    style={{ left: pct((i + 1) / (END_HR - START_HR)) }}
                  />
                ))}
                {packed.map(({ block: b, lane }, i) => {
                  const s = Math.max(parseTime(b.start_time), START_HR * 60) - START_HR * 60;
                  const e = Math.min(parseTime(b.end_time), END_HR * 60) - START_HR * 60;
                  if (e <= s) return null;
                  const st = STYLE[b.kind] ?? STYLE.review;
                  const label =
                    `${b.course_code}${b.sec_no ? ` sec ${b.sec_no}` : ""} ${st.tag}` +
                    (b.track === "special" ? " (พิเศษ)" : b.track === "regular" ? " (ปกติ)" : "");
                  const counts = b.expected ? ` · ${b.logged ?? 0}/${b.expected}` : "";
                  return (
                    <div
                      key={i}
                      className="absolute overflow-hidden rounded-md px-1.5 text-[11px] leading-[18px] whitespace-nowrap"
                      style={{
                        left: pct(s / TOTAL_MIN),
                        width: pct((e - s) / TOTAL_MIN),
                        top: 4 + lane * LANE_PX,
                        height: LANE_PX - 4,
                        background: st.bg,
                        color: st.fg,
                      }}
                      title={`${b.course_code} ${b.course_name ?? ""} · ${st.tag} · ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}${counts}`}
                    >
                      {label}{counts}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
