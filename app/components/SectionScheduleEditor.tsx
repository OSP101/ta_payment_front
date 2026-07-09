"use client";
import { Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
import { Button, Chip, Select, TextInput, FieldGroup, Alert } from "./ui";

// Persisted rows have a uuid `id`; unsaved drafts leave it undefined so the
// parent can identify them without minting server-side UUIDs on the client.
export interface SectionScheduleRow {
  id?: string;
  kind: "lecture" | "lab";
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string | null;
}

const DOW_LABEL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
// Mon..Sun display order — matches the TA schedule page.
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

function normalizeHM(v: string): string {
  if (!v) return "";
  // <input type="time"> returns "HH:MM"; DB may return "HH:MM:SS" — trim both to HH:MM.
  return v.length >= 5 ? v.slice(0, 5) : v;
}

// Overlap within the SAME day — matches the backend's intra-section check.
// Cross-section conflicts are surfaced later when a TA takes the request.
function findOverlap(rows: SectionScheduleRow[]): number[] {
  const bad = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.day_of_week !== b.day_of_week) continue;
      if (!a.start_time || !a.end_time || !b.start_time || !b.end_time) continue;
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        bad.add(i); bad.add(j);
      }
    }
  }
  return [...bad];
}

function findInvalidRange(rows: SectionScheduleRow[]): number[] {
  const bad: number[] = [];
  rows.forEach((r, i) => {
    if (r.start_time && r.end_time && r.start_time >= r.end_time) bad.push(i);
  });
  return bad;
}

export interface EditorErrors {
  overlapIdx: number[];
  invalidIdx: number[];
  hasBlockingError: boolean;
}

export function validateRows(rows: SectionScheduleRow[]): EditorErrors {
  const overlapIdx = findOverlap(rows);
  const invalidIdx = findInvalidRange(rows);
  const incomplete = rows.some(r => !r.start_time || !r.end_time);
  return {
    overlapIdx,
    invalidIdx,
    hasBlockingError: overlapIdx.length > 0 || invalidIdx.length > 0 || incomplete,
  };
}

export default function SectionScheduleEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: SectionScheduleRow[];
  onChange: (rows: SectionScheduleRow[]) => void;
  disabled?: boolean;
  // compact hides the "จำนวนคาบ" header row — useful inside the OpenCourseModal
  // where a section already sits inside its own container.
  compact?: boolean;
}) {
  const errors = validateRows(value);

  function updateRow(i: number, patch: Partial<SectionScheduleRow>) {
    const next = value.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }
  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([
      ...value,
      { kind: "lecture", day_of_week: 1, start_time: "09:00", end_time: "12:00", room: "" },
    ]);
  }

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted inline-flex items-center gap-1.5">
            <Clock size={12} />
            {value.length === 0
              ? "ยังไม่มีคาบเรียน"
              : <>ทั้งหมด <b className="tabular">{value.length}</b> คาบ / สัปดาห์</>}
          </div>
          <Button variant="ghost" size="sm" onClick={addRow} disabled={disabled}>
            <Plus size={13} />เพิ่มคาบ
          </Button>
        </div>
      )}

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          ยังไม่มีคาบเรียน — กด &quot;เพิ่มคาบ&quot; เพื่อกำหนดวัน-เวลา
        </div>
      ) : (
        <div className="space-y-1.5">
          {value.map((row, i) => {
            const invalid = errors.invalidIdx.includes(i);
            const overlap = errors.overlapIdx.includes(i);
            return (
              <div
                key={row.id ?? i}
                className={
                  "grid grid-cols-[110px_1fr_1fr_1fr_1fr_auto] gap-2 items-center rounded-lg border p-2 " +
                  (invalid || overlap ? "border-danger/50 bg-danger-soft/20" : "border-border")
                }
              >
                <Select
                  value={String(row.kind)}
                  onChange={e => updateRow(i, { kind: e.target.value as "lecture" | "lab" })}
                  disabled={disabled}
                >
                  <option value="lecture">บรรยาย</option>
                  <option value="lab">ปฏิบัติการ</option>
                </Select>
                <Select
                  value={String(row.day_of_week)}
                  onChange={e => updateRow(i, { day_of_week: Number(e.target.value) })}
                  disabled={disabled}
                >
                  {DOW_ORDER.map(d => (
                    <option key={d} value={d}>{DOW_LABEL[d]}</option>
                  ))}
                </Select>
                <TextInput
                  type="time"
                  value={normalizeHM(row.start_time)}
                  onChange={e => updateRow(i, { start_time: e.target.value })}
                  disabled={disabled}
                  aria-label="เวลาเริ่ม"
                />
                <TextInput
                  type="time"
                  value={normalizeHM(row.end_time)}
                  onChange={e => updateRow(i, { end_time: e.target.value })}
                  disabled={disabled}
                  aria-label="เวลาสิ้นสุด"
                />
                <TextInput
                  type="text"
                  placeholder="ห้อง (ไม่บังคับ)"
                  value={row.room ?? ""}
                  onChange={e => updateRow(i, { room: e.target.value })}
                  disabled={disabled}
                  aria-label="ห้อง"
                />
                <Button
                  variant="danger-soft" size="sm"
                  onClick={() => removeRow(i)}
                  disabled={disabled}
                  aria-label="ลบคาบ"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {compact && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" onClick={addRow} disabled={disabled}>
            <Plus size={13} />เพิ่มคาบ
          </Button>
        </div>
      )}

      {errors.invalidIdx.length > 0 && (
        <Alert
          status="danger"
          icon={<AlertTriangle size={14} />}
          title="เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม"
          description="ตรวจสอบคาบที่มีขอบสีแดง"
        />
      )}
      {errors.overlapIdx.length > 0 && (
        <Alert
          status="danger"
          icon={<AlertTriangle size={14} />}
          title="มีคาบที่ทับซ้อนกันในวันเดียวกัน"
          description="สอง section คาบเดียวกันเรียนพร้อมกันไม่ได้"
        />
      )}
    </div>
  );
}

// Serializes rows for the PUT payload. Trims empty room strings to null and
// keeps only the fields the backend expects.
export function toApiPayload(rows: SectionScheduleRow[]): {
  kind: string; day_of_week: number; start_time: string; end_time: string; room: string | null;
}[] {
  return rows.map(r => ({
    kind: r.kind,
    day_of_week: r.day_of_week,
    start_time: normalizeHM(r.start_time),
    end_time: normalizeHM(r.end_time),
    room: (r.room ?? "").trim() ? (r.room as string).trim() : null,
  }));
}

const SHORT_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function sortedForDisplay(rows: SectionScheduleRow[]): SectionScheduleRow[] {
  return [...rows].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.start_time.localeCompare(b.start_time);
  });
}

// Rendered summary for tables — each block shows kind (colored) + day + time,
// so lecturers can tell บรรยาย vs ปฏิบัติการ apart at a glance.
export function ScheduleSummary({ rows }: { rows: SectionScheduleRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="inline-flex flex-wrap gap-1">
      {sortedForDisplay(rows).map((r, i) => (
        <span
          key={r.id ?? i}
          className={
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs " +
            (r.kind === "lab"
              ? "bg-warning-soft text-warning-soft-foreground"
              : "bg-accent-soft text-accent-soft-foreground")
          }
        >
          <span className="font-medium">{r.kind === "lab" ? "ปฏิบัติการ" : "บรรยาย"}</span>
          <span className="tabular">
            {SHORT_DOW[r.day_of_week]}. {normalizeHM(r.start_time)}–{normalizeHM(r.end_time)}
          </span>
        </span>
      ))}
    </div>
  );
}

// Legacy plain-string helper — retained for callers that need a title/aria label.
export function summarizeSchedule(rows: SectionScheduleRow[]): string {
  if (!rows.length) return "";
  return sortedForDisplay(rows)
    .map(r => {
      const kind = r.kind === "lab" ? "ป." : "บ.";
      return `${kind} ${SHORT_DOW[r.day_of_week]}. ${normalizeHM(r.start_time)}–${normalizeHM(r.end_time)}`;
    })
    .join(" · ");
}
