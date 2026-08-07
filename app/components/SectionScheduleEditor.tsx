"use client";
import { Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
import { TimeField, type TimeValue } from "@heroui/react";
import { Time } from "@internationalized/date";
import { Button, IconButton, Select, Alert } from "./ui";

// Parse "HH:MM" or "HH:MM:SS" into a TimeValue; empty/malformed → null.
function parseHM(s: string): TimeValue | null {
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return new Time(h, m);
}

function formatHM(v: TimeValue | null): string {
  if (!v) return "";
  return `${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")}`;
}

// TimeField locked to 24-hour so lecturers can't accidentally pick 10:30 PM
// when they meant 10:30 AM (see incident 2026-07-14). Emits "HH:MM" strings
// to stay drop-in compatible with the existing SectionScheduleRow shape.
function Hour24TimeInput({
  value, onChange, disabled, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <TimeField
      value={parseHM(value)}
      onChange={v => onChange(formatHM(v))}
      isDisabled={disabled}
      hourCycle={24}
      aria-label={ariaLabel}
      fullWidth
    >
      <TimeField.Group fullWidth>
        <TimeField.Input>{s => <TimeField.Segment segment={s} />}</TimeField.Input>
      </TimeField.Group>
    </TimeField>
  );
}

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

// Business rule: each kind (lecture/lab) allowed at most once per section —
// the credit format (e.g. 3(3-0-6)) means each kind's period covers all of
// that kind's weekly hours in one block. See [[schedule-kind-rules]].
function findDuplicateKind(rows: SectionScheduleRow[]): number[] {
  const firstIdx = new Map<string, number>();
  const bad = new Set<number>();
  rows.forEach((r, i) => {
    const prev = firstIdx.get(r.kind);
    if (prev === undefined) firstIdx.set(r.kind, i);
    else { bad.add(prev); bad.add(i); }
  });
  return [...bad];
}

export interface EditorErrors {
  overlapIdx: number[];
  invalidIdx: number[];
  duplicateKindIdx: number[];
  hasBlockingError: boolean;
}

export function validateRows(rows: SectionScheduleRow[]): EditorErrors {
  const overlapIdx = findOverlap(rows);
  const invalidIdx = findInvalidRange(rows);
  const duplicateKindIdx = findDuplicateKind(rows);
  const incomplete = rows.some(r => !r.start_time || !r.end_time);
  return {
    overlapIdx,
    invalidIdx,
    duplicateKindIdx,
    hasBlockingError:
      overlapIdx.length > 0 || invalidIdx.length > 0 ||
      duplicateKindIdx.length > 0 || incomplete,
  };
}

export default function SectionScheduleEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
  allowedKinds,
}: {
  value: SectionScheduleRow[];
  onChange: (rows: SectionScheduleRow[]) => void;
  disabled?: boolean;
  // compact hides the "จำนวนคาบ" header row — useful inside the OpenCourseModal
  // where a section already sits inside its own container.
  compact?: boolean;
  // Which meeting kinds the course actually has (from lecture_hrs/lab_hrs).
  // Omit or pass [] to allow both — kept optional for backward compat.
  allowedKinds?: ("lecture" | "lab")[];
}) {
  const errors = validateRows(value);

  const kinds: ("lecture" | "lab")[] =
    allowedKinds && allowedKinds.length > 0 ? allowedKinds : ["lecture", "lab"];
  const usedKinds = new Set(value.map(r => r.kind));
  const nextAvailableKind = kinds.find(k => !usedKinds.has(k)) ?? kinds[0];
  const canAddMore = kinds.some(k => !usedKinds.has(k));

  function updateRow(i: number, patch: Partial<SectionScheduleRow>) {
    const next = value.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }
  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function addRow() {
    if (!canAddMore) return;
    onChange([
      ...value,
      { kind: nextAvailableKind, day_of_week: 1, start_time: "09:00", end_time: "12:00", room: "" },
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
          {/* Hidden rather than disabled when read-only: a greyed "เพิ่มคาบ"
              next to a greyed trash icon reads as "broken", not "view only". */}
          {!disabled && (
            <Button variant="ghost" size="sm" onClick={addRow} disabled={!canAddMore}>
              <Plus size={13} />เพิ่มคาบ
            </Button>
          )}
        </div>
      )}

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          {disabled
            ? "ยังไม่มีคาบเรียน"
            : <>ยังไม่มีคาบเรียน กด &quot;เพิ่มคาบ&quot; เพื่อกำหนดวัน-เวลา</>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {value.map((row, i) => {
            const invalid = errors.invalidIdx.includes(i);
            const overlap = errors.overlapIdx.includes(i);
            const dupKind = errors.duplicateKindIdx.includes(i);
            return (
              <div
                key={row.id ?? i}
                className={
                  // Five controls in a row need ~470px. On a phone they go two
                  // up — kind + day on the first line, the two times on the
                  // second — with the delete button pinned to the end of the
                  // first line where it stays out of the way of the fields.
                  "grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[110px_1fr_1fr_1fr_auto] gap-2 items-center rounded-lg border p-2 " +
                  (invalid || overlap || dupKind ? "border-danger/50 bg-danger-soft/20" : "border-border")
                }
              >
                <Select
                  value={String(row.kind)}
                  onChange={e => updateRow(i, { kind: e.target.value as "lecture" | "lab" })}
                  disabled={disabled}
                >
                  {kinds.map(k => {
                    const usedByOther = value.some((r, idx) => idx !== i && r.kind === k);
                    return (
                      <option key={k} value={k} disabled={usedByOther}>
                        {k === "lab" ? "ปฏิบัติการ" : "บรรยาย"}
                      </option>
                    );
                  })}
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
                {!disabled && (
                  <IconButton
                    label="ลบคาบ"
                    variant="danger-soft" size="sm"
                    className="sm:order-last"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                )}
                <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-1 sm:contents">
                  <Hour24TimeInput
                    value={normalizeHM(row.start_time)}
                    onChange={v => updateRow(i, { start_time: v })}
                    disabled={disabled}
                    ariaLabel="เวลาเริ่ม"
                  />
                  <Hour24TimeInput
                    value={normalizeHM(row.end_time)}
                    onChange={v => updateRow(i, { end_time: v })}
                    disabled={disabled}
                    ariaLabel="เวลาสิ้นสุด"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {compact && canAddMore && !disabled && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus size={13} />เพิ่มคาบ
          </Button>
        </div>
      )}

      {errors.duplicateKindIdx.length > 0 && (
        <Alert
          status="danger"
          icon={<AlertTriangle size={14} />}
          title="รูปแบบคาบซ้ำ"
          description="แต่ละ section มีบรรยาย/ปฏิบัติการอย่างละ 1 คาบเท่านั้น"
        />
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
          title="คาบใน section นี้ทับซ้อนกัน"
          description={
            <>
              <div>ตรวจดู AM/PM ให้ตรง คาบที่ชนกัน:</div>
              <ul className="mt-1 list-disc ps-5 space-y-0.5">
                {errors.overlapIdx.map(i => {
                  const r = value[i];
                  return (
                    <li key={i} className="tabular">
                      {r.kind === "lab" ? "ปฏิบัติการ" : "บรรยาย"} · {DOW_LABEL[r.day_of_week]}{" "}
                      {normalizeHM(r.start_time)}–{normalizeHM(r.end_time)}
                    </li>
                  );
                })}
              </ul>
            </>
          }
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
            // whitespace-nowrap: the chip is one fact — "บรรยาย จ. 13:00–15:00".
            // Left to wrap in a narrow table cell it broke into three lines and
            // read as three separate things.
            "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs " +
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
