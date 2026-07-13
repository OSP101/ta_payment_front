"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";
import type { Key } from "@heroui/react";
import {
  Autocomplete, EmptyState, Label, ListBox, SearchField, useFilter,
  DatePicker, DateField, Calendar, I18nProvider, toast,
} from "@heroui/react";
import { parseDate, type DateValue } from "@internationalized/date";
import { BookPlus, CircleAlert, Clock, Check, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  Modal, Button, FieldGroup, TextInput, Alert, Chip,
} from "../../components/ui";

// Clamp a typed section count to a whole number in [0, 99] — blocks decimals,
// NaN, and out-of-range values that would otherwise reach the backend.
function clampSectionCount(v: string): number {
  return Math.min(99, Math.max(0, Math.floor(Number(v) || 0)));
}
import SectionScheduleEditor, {
  type SectionScheduleRow, toApiPayload, validateRows,
} from "../../components/SectionScheduleEditor";

interface FC {
  id: string;
  code: string;
  name_th: string;
  credits: number;
  lecture_hrs: number;
  lab_hrs: number;
  self_hrs: number;
  is_active: boolean;
}

interface Draft {
  faculty_course_id: string;
  starts_on: string;
  ends_on: string;
  regular_sections: number;
  special_sections: number;
  // Keyed by sec_no. Section schedules are required at course-open time —
  // TAs consume them immediately for time-clock validation.
  schedules: Record<string, SectionScheduleRow[]>;
}

const EMPTY: Draft = {
  faculty_course_id: "",
  starts_on: "",
  ends_on: "",
  regular_sections: 1,
  special_sections: 0,
  schedules: {},
};

// CP KKU numbering: sec_no runs continuously across tracks — regular gets 1..N,
// special continues N+1..N+M. (Existing courses in the DB may still carry the
// legacy 801+ scheme; only new courses use this continuous scheme.)
function regularSecNos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}
function specialSecNos(n: number, regular: number): string[] {
  return Array.from({ length: n }, (_, i) => String(regular + i + 1));
}
function buildSections(
  regular: number, special: number,
  schedules: Record<string, SectionScheduleRow[]>,
): {
  sec_no: string;
  track: "regular" | "special";
  num_students: number;
  schedules: ReturnType<typeof toApiPayload>;
}[] {
  // num_students starts at 0 — staff is the source of truth for enrolment,
  // so the lecturer's "open course" flow no longer captures it. Staff fills
  // it via the sections settings page before the export batch runs.
  const one = (sec_no: string, track: "regular" | "special") => ({
    sec_no,
    track,
    num_students: 0,
    schedules: toApiPayload(schedules[sec_no] ?? []),
  });
  return [
    ...regularSecNos(regular).map(n => one(n, "regular")),
    ...specialSecNos(special, regular).map(n => one(n, "special")),
  ];
}

export default function OpenCourseModal({
  open, onClose, termId, termLabel, redirectBase = "/lecturer/courses",
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
  redirectBase?: string;
}) {
  const router = useRouter();
  const { data: fcs } = useSWR<FC[]>(open ? "/faculty-courses" : null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Special sections are opt-in — regular is primary, special reveals via
  // "+ เปิดภาคพิเศษด้วย" so the UI stops treating them as equal peers.
  const [showSpecial, setShowSpecial] = useState(false);

  // Reset every time the modal is (re)opened.
  useEffect(() => {
    if (open) { setDraft(EMPTY); setErr(null); setShowSpecial(false); }
  }, [open]);

  const activeFcs = useMemo(() => (fcs ?? []).filter(fc => fc.is_active), [fcs]);
  const selected = activeFcs.find(fc => fc.id === draft.faculty_course_id);

  // Which meeting kinds the selected course actually has — drives what the
  // schedule editor lets the lecturer pick. See [[schedule-kind-rules]].
  const allowedKinds = useMemo<("lecture" | "lab")[]>(() => {
    if (!selected) return ["lecture", "lab"];
    const k: ("lecture" | "lab")[] = [];
    if (selected.lecture_hrs > 0) k.push("lecture");
    if (selected.lab_hrs > 0) k.push("lab");
    return k.length > 0 ? k : ["lecture", "lab"];
  }, [selected]);

  const totalSections = draft.regular_sections + draft.special_sections;

  // All active section numbers — used to gate "every section has a schedule".
  const allSecNos = useMemo(() => [
    ...regularSecNos(draft.regular_sections),
    ...specialSecNos(draft.special_sections, draft.regular_sections),
  ], [draft.regular_sections, draft.special_sections]);

  const scheduleBlocked = Object.values(draft.schedules).some(rows =>
    rows.length > 0 && validateRows(rows).hasBlockingError,
  );
  const scheduleComplete =
    totalSections > 0 && allSecNos.every(sec => (draft.schedules[sec] ?? []).length > 0);

  const dateError =
    draft.starts_on && draft.ends_on && draft.ends_on < draft.starts_on
      ? "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มสอน"
      : null;

  // Progressive reveal gates: each step unlocks the next only when its
  // required fields are filled cleanly.
  const step1Done = !!draft.faculty_course_id;
  const step2Done = step1Done && !!draft.starts_on && !!draft.ends_on && !dateError;
  const step3Done = step2Done && totalSections > 0;
  const step4Done = step3Done && scheduleComplete && !scheduleBlocked;

  const canSubmit = step4Done && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const body = {
        faculty_course_id: draft.faculty_course_id,
        term_id: termId,
        starts_on: draft.starts_on,
        ends_on: draft.ends_on,
        sections: buildSections(
          draft.regular_sections, draft.special_sections, draft.schedules,
        ),
      };
      const res = await api.post<{ id: string }>("/teaching-courses", body);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success("เปิดรายวิชาเรียบร้อยแล้ว", {
        description: selected ? `${selected.code} — ${selected.name_th}` : undefined,
      });
      onClose();
      router.push(`${redirectBase}/${res.id}`);
    } catch (e) {
      // e.g. this faculty course is already opened for the term — surface the
      // backend's (Thai) reason both inline and as a toast.
      setErr((e as Error).message || "เปิดรายวิชาไม่สำเร็จ");
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<BookPlus size={20} />}
      title={<span>เปิดรายวิชาใหม่ · <span className="text-muted font-normal">{termLabel}</span></span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} isPending={saving}>
            <BookPlus size={14} />เปิดรายวิชา
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Step 1 — always visible */}
        <StepCard n={1} title="เลือกวิชา" done={!!draft.faculty_course_id}>
          <CourseAutocomplete
            items={activeFcs}
            value={draft.faculty_course_id}
            onChange={id => setDraft(d => ({ ...d, faculty_course_id: id }))}
          />
          {selected && (
            <div className="mt-2 rounded-lg border border-border bg-accent-soft/30 p-3 flex items-center gap-3">
              <div className="text-sm">
                <div className="font-semibold tabular">{selected.code}</div>
                <div className="text-xs text-muted mt-0.5">{selected.name_th}</div>
              </div>
              <div className="text-xs text-muted ms-auto tabular">
                {selected.credits}({selected.lecture_hrs}-{selected.lab_hrs}-{selected.self_hrs}) หน่วยกิต
              </div>
            </div>
          )}
        </StepCard>

        {/* Step 2 — revealed after Step 1 */}
        {step1Done && (
          <StepCard n={2} title="ช่วงเวลาเรียน" done={step2Done}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldGroup label="วันเริ่มสอน">
                <ThaiDateField
                  value={draft.starts_on}
                  onChange={v => setDraft(d => ({ ...d, starts_on: v }))}
                />
              </FieldGroup>
              <FieldGroup label="วันสิ้นสุด" error={dateError ?? undefined}>
                <ThaiDateField
                  value={draft.ends_on}
                  onChange={v => setDraft(d => ({ ...d, ends_on: v }))}
                />
              </FieldGroup>
            </div>
          </StepCard>
        )}

        {/* Step 3 — revealed after Step 2. Two columns side-by-side: regular on
            the left is primary; the right column is either the "+ เปิดภาคพิเศษ"
            opt-in or the special input once toggled on. */}
        {step2Done && (
          <StepCard n={3} title="กลุ่มเรียน (section)" done={step3Done}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldGroup
                label={<span className="inline-flex items-center gap-2">ภาคปกติ <Chip tone="brand">regular</Chip></span>}
                hint={
                  draft.regular_sections > 0
                    ? `จะสร้าง sec ${regularSecNos(draft.regular_sections).join(", ")}`
                    : "ยังไม่เปิด section ภาคปกติ"
                }
              >
                <TextInput
                  type="number" min={0} max={99} step={1}
                  value={draft.regular_sections}
                  onChange={e => setDraft(d => ({ ...d, regular_sections: clampSectionCount(e.target.value) }))}
                  className="max-w-[140px]"
                />
              </FieldGroup>

              {!showSpecial ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowSpecial(true);
                    setDraft(d => ({ ...d, special_sections: d.special_sections || 1 }));
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted hover:text-accent hover:border-accent min-h-19"
                >
                  <Plus size={14} />เปิด section ภาคพิเศษด้วย
                </button>
              ) : (
                <FieldGroup
                  label={
                    <span className="inline-flex items-center gap-2 w-full">
                      ภาคพิเศษ <Chip tone="warn">special</Chip>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSpecial(false);
                          setDraft(d => ({ ...d, special_sections: 0 }));
                        }}
                        className="ms-auto inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                        aria-label="ยกเลิกภาคพิเศษ"
                      >
                        <X size={12} />ยกเลิก
                      </button>
                    </span>
                  }
                  hint={
                    draft.special_sections > 0
                      ? `จะสร้าง sec ${specialSecNos(draft.special_sections, draft.regular_sections).join(", ")}`
                      : "ยังไม่กำหนดจำนวน"
                  }
                >
                  <TextInput
                    type="number" min={0} max={99} step={1}
                    value={draft.special_sections}
                    onChange={e => setDraft(d => ({ ...d, special_sections: clampSectionCount(e.target.value) }))}
                    className="max-w-[140px]"
                  />
                </FieldGroup>
              )}
            </div>

            {totalSections > 0 && (
              <div className="text-xs text-muted mt-3 pt-3 border-t border-border">
                รวมทั้งหมด <b className="tabular">{totalSections}</b> section
              </div>
            )}
          </StepCard>
        )}

        {/* Step 4 — schedule is required: TA time-clock validation reads it
            immediately. Staff fills num_students later on the sections page. */}
        {step3Done && (
          <StepCard n={4} title="ตารางเวลาเรียนต่อ section" done={step4Done}>
            <div className="text-xs text-muted mb-2">
              กดที่ section เพื่อกำหนดวัน-เวลาเรียน — ต้องกรอกครบทุก section
            </div>
            <SectionSchedulesPanel
              regularSecs={regularSecNos(draft.regular_sections)}
              specialSecs={specialSecNos(draft.special_sections, draft.regular_sections)}
              schedules={draft.schedules}
              allowedKinds={allowedKinds}
              onChange={(sec, rows) =>
                setDraft(d => ({ ...d, schedules: { ...d.schedules, [sec]: rows } }))
              }
            />
          </StepCard>
        )}

        {err && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="เปิดรายวิชาไม่สำเร็จ" description={err} />
        )}
      </div>
    </Modal>
  );
}

function SectionSchedulesPanel({
  regularSecs, specialSecs, schedules, allowedKinds, onChange,
}: {
  regularSecs: string[];
  specialSecs: string[];
  schedules: Record<string, SectionScheduleRow[]>;
  allowedKinds: ("lecture" | "lab")[];
  onChange: (sec: string, rows: SectionScheduleRow[]) => void;
}) {
  const allSecs = [
    ...regularSecs.map(n => ({ sec: n, track: "regular" as const })),
    ...specialSecs.map(n => ({ sec: n, track: "special" as const })),
  ];
  const [openSec, setOpenSec] = useState<string | null>(null);

  return (
    <div className="divide-y divide-border rounded-md border border-border bg-surface">
      {allSecs.map(({ sec, track }) => {
          const rows = schedules[sec] ?? [];
          const isOpen = openSec === sec;
          return (
            <div key={sec} className="p-2">
              <button
                type="button"
                onClick={() => setOpenSec(isOpen ? null : sec)}
                className="w-full flex items-center gap-2 text-left"
              >
                <Clock size={13} className="text-muted" />
                <span className="text-sm font-medium tabular">Sec {sec}</span>
                <Chip tone={track === "special" ? "warn" : "brand"}>
                  {track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
                </Chip>
                <span className={
                  "text-xs ms-auto " +
                  (rows.length > 0 ? "text-muted" : "text-warning font-medium")
                }>
                  {rows.length > 0
                    ? `${rows.length} คาบ`
                    : "ต้องกำหนด"}
                </span>
              </button>
              {isOpen && (
                <div className="mt-2">
                  <SectionScheduleEditor
                    value={rows}
                    onChange={next => onChange(sec, next)}
                    allowedKinds={allowedKinds}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function StepCard({
  n, title, done, children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
            (done
              ? "bg-success-soft text-success-soft-foreground"
              : "bg-accent-soft text-accent-soft-foreground")
          }
          aria-hidden
        >
          {done ? <Check size={12} /> : n}
        </div>
        <div className="font-semibold text-sm">{title}</div>
      </div>
      {children}
    </div>
  );
}

function CourseAutocomplete({
  items, value, onChange,
}: {
  items: FC[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  return (
    <Autocomplete
      className="w-full"
      placeholder="พิมพ์ค้นหารหัสหรือชื่อวิชา…"
      selectionMode="single"
      value={value || null}
      onChange={(k: Key | Key[] | null) => onChange(String(k ?? ""))}
    >
      <Label className="sr-only">รายวิชา</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value />
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="ค้นหาวิชา…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className="max-h-[320px] overflow-y-auto"
            renderEmptyState={() => <EmptyState>ไม่พบรายวิชา</EmptyState>}
          >
            {items.map(fc => (
              <ListBox.Item key={fc.id} id={fc.id} textValue={`${fc.code} ${fc.name_th}`}>
                <div className="min-w-0">
                  <div className="tabular font-medium">{fc.code}</div>
                  <div className="text-xs text-muted truncate">{fc.name_th}</div>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

function ThaiDateField({
  value, onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  let dv: DateValue | null = null;
  if (value) {
    try { dv = parseDate(value); } catch { dv = null; }
  }
  return (
    <I18nProvider locale="th-TH">
      <DatePicker
        aria-label="date"
        value={dv}
        onChange={v => onChange(v ? v.toString() : "")}
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {segment => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}
