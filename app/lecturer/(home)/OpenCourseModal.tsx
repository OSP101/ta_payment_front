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
import { BookPlus, CircleAlert, Clock, Check, ChevronRight, ChevronDown } from "lucide-react";
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
  midterm_lecture_date: string;
  midterm_lab_date: string;
  final_lecture_date: string;
  final_lab_date: string;
  regular_sections: number;
  special_sections: number;
  // Keyed by sec_no. Empty string = not specified (server saves 0).
  student_counts: Record<string, string>;
  // Keyed by sec_no. Empty array = no schedule specified — lecturer can
  // fill in later via the settings page.
  schedules: Record<string, SectionScheduleRow[]>;
}

const EMPTY: Draft = {
  faculty_course_id: "",
  starts_on: "",
  ends_on: "",
  midterm_lecture_date: "",
  midterm_lab_date: "",
  final_lecture_date: "",
  final_lab_date: "",
  regular_sections: 1,
  special_sections: 0,
  student_counts: {},
  schedules: {},
};

// KKU convention: regular sections numbered 1..N, special sections start at 801.
// Tweak here if your faculty uses a different numbering scheme.
function regularSecNos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}
function specialSecNos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(801 + i));
}
function buildSections(
  regular: number, special: number,
  counts: Record<string, string>,
  schedules: Record<string, SectionScheduleRow[]>,
): {
  sec_no: string;
  track: "regular" | "special";
  num_students: number;
  schedules: ReturnType<typeof toApiPayload>;
}[] {
  const one = (sec_no: string, track: "regular" | "special") => ({
    sec_no,
    track,
    num_students: Number(counts[sec_no] || 0),
    schedules: toApiPayload(schedules[sec_no] ?? []),
  });
  return [
    ...regularSecNos(regular).map(n => one(n, "regular")),
    ...specialSecNos(special).map(n => one(n, "special")),
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

  // Reset every time the modal is (re)opened.
  useEffect(() => { if (open) { setDraft(EMPTY); setErr(null); } }, [open]);

  const activeFcs = useMemo(() => (fcs ?? []).filter(fc => fc.is_active), [fcs]);
  const selected = activeFcs.find(fc => fc.id === draft.faculty_course_id);

  const totalSections = draft.regular_sections + draft.special_sections;

  const scheduleBlocked = Object.values(draft.schedules).some(rows =>
    rows.length > 0 && validateRows(rows).hasBlockingError,
  );

  const dateError =
    draft.starts_on && draft.ends_on && draft.ends_on < draft.starts_on
      ? "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มสอน"
      : null;

  // Progressive reveal gates: each step unlocks the next only when its
  // required fields are filled cleanly.
  const step1Done = !!draft.faculty_course_id;
  const step2Done = step1Done && !!draft.starts_on && !!draft.ends_on && !dateError;
  const step3Done = step2Done && totalSections > 0;

  const canSubmit =
    !!draft.faculty_course_id &&
    !!draft.starts_on &&
    !!draft.ends_on &&
    !dateError &&
    totalSections > 0 &&
    !scheduleBlocked &&
    !saving;

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
        midterm_lecture_date: draft.midterm_lecture_date || undefined,
        midterm_lab_date: draft.midterm_lab_date || undefined,
        final_lecture_date: draft.final_lecture_date || undefined,
        final_lab_date: draft.final_lab_date || undefined,
        sections: buildSections(
          draft.regular_sections, draft.special_sections,
          draft.student_counts, draft.schedules,
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

        {/* Step 3 — revealed after Step 2 */}
        {step2Done && (
          <StepCard n={3} title="กลุ่มเรียน (section)" done={step3Done}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldGroup
                label={<span className="inline-flex items-center gap-2">ภาคปกติ <Chip tone="brand">regular</Chip></span>}
                hint={
                  draft.regular_sections > 0
                    ? `จะสร้าง sec ${Array.from({ length: draft.regular_sections }, (_, i) => i + 1).join(", ")}`
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
              <FieldGroup
                label={<span className="inline-flex items-center gap-2">ภาคพิเศษ <Chip tone="warn">special</Chip></span>}
                hint={
                  draft.special_sections > 0
                    ? `จะสร้าง sec ${Array.from({ length: draft.special_sections }, (_, i) => 801 + i).join(", ")}`
                    : "ยังไม่เปิด section ภาคพิเศษ"
                }
              >
                <TextInput
                  type="number" min={0} max={99} step={1}
                  value={draft.special_sections}
                  onChange={e => setDraft(d => ({ ...d, special_sections: clampSectionCount(e.target.value) }))}
                  className="max-w-[140px]"
                />
              </FieldGroup>
            </div>
            {totalSections > 0 && (
              <div className="text-xs text-muted mt-2">
                รวมทั้งหมด <b className="tabular">{totalSections}</b> section
              </div>
            )}
          </StepCard>
        )}

        {/* Optional block — revealed after Step 3 */}
        {step3Done && (
          <div className="rounded-lg border border-border bg-surface-secondary/30 p-3">
            <div className="text-xs font-semibold text-muted mb-2">
              รายละเอียดเพิ่มเติม <span className="font-normal">(ไม่บังคับ — กรอกที่นี่ หรือมาแก้ในหน้าจัดการวิชาภายหลังก็ได้)</span>
            </div>
            <div className="space-y-2">
              <Collapsible
                title="จำนวนนักศึกษาต่อ section"
                summary={studentCountsSummary(draft.student_counts, totalSections)}
              >
                <SectionStudentCounts
                  regularSecs={regularSecNos(draft.regular_sections)}
                  specialSecs={specialSecNos(draft.special_sections)}
                  counts={draft.student_counts}
                  onChange={(sec, v) =>
                    setDraft(d => ({ ...d, student_counts: { ...d.student_counts, [sec]: v } }))
                  }
                />
              </Collapsible>

              <Collapsible
                title="ตารางเวลาเรียน"
                summary={schedulesSummary(draft.schedules, totalSections)}
              >
                <SectionSchedulesPanel
                  regularSecs={regularSecNos(draft.regular_sections)}
                  specialSecs={specialSecNos(draft.special_sections)}
                  schedules={draft.schedules}
                  onChange={(sec, rows) =>
                    setDraft(d => ({ ...d, schedules: { ...d.schedules, [sec]: rows } }))
                  }
                />
              </Collapsible>

              <Collapsible
                title="วันสอบ"
                summary={examSummary(draft)}
                warn="TA จะสร้างการลงบันทึกเวลาไม่ได้จนกว่าจะกรอกครบ"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldGroup label={<span>สอบกลางภาค <Chip tone="brand">บรรยาย</Chip></span>}>
                    <ThaiDateField
                      value={draft.midterm_lecture_date}
                      onChange={v => setDraft(d => ({ ...d, midterm_lecture_date: v }))}
                    />
                  </FieldGroup>
                  <FieldGroup label={<span>สอบกลางภาค <Chip tone="warn">ปฏิบัติการ</Chip></span>}>
                    <ThaiDateField
                      value={draft.midterm_lab_date}
                      onChange={v => setDraft(d => ({ ...d, midterm_lab_date: v }))}
                    />
                  </FieldGroup>
                  <FieldGroup label={<span>สอบปลายภาค <Chip tone="brand">บรรยาย</Chip></span>}>
                    <ThaiDateField
                      value={draft.final_lecture_date}
                      onChange={v => setDraft(d => ({ ...d, final_lecture_date: v }))}
                    />
                  </FieldGroup>
                  <FieldGroup label={<span>สอบปลายภาค <Chip tone="warn">ปฏิบัติการ</Chip></span>}>
                    <ThaiDateField
                      value={draft.final_lab_date}
                      onChange={v => setDraft(d => ({ ...d, final_lab_date: v }))}
                    />
                  </FieldGroup>
                </div>
              </Collapsible>
            </div>
          </div>
        )}

        {err && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="เปิดรายวิชาไม่สำเร็จ" description={err} />
        )}
      </div>
    </Modal>
  );
}

function SectionStudentCounts({
  regularSecs, specialSecs, counts, onChange,
}: {
  regularSecs: string[];
  specialSecs: string[];
  counts: Record<string, string>;
  onChange: (sec: string, v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-surface-secondary/40">
      <div className="text-xs text-muted">
        <b>จำนวนนักศึกษาต่อ section</b> — ไม่บังคับ ถ้ายังไม่ทราบให้เว้นว่างไว้แล้วมาแก้ในหน้าตั้งค่าภายหลัง
      </div>

      {regularSecs.length > 0 && (
        <SecCountGrid title="ภาคปกติ" tone="brand" secs={regularSecs} counts={counts} onChange={onChange} />
      )}
      {specialSecs.length > 0 && (
        <SecCountGrid title="ภาคพิเศษ" tone="warn" secs={specialSecs} counts={counts} onChange={onChange} />
      )}
    </div>
  );
}

function SecCountGrid({
  title, tone, secs, counts, onChange,
}: {
  title: string;
  tone: "brand" | "warn";
  secs: string[];
  counts: Record<string, string>;
  onChange: (sec: string, v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Chip tone={tone}>{title}</Chip>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {secs.map(sec => (
          <div key={sec} className="flex items-center gap-2">
            <span className="text-xs text-muted tabular w-14 shrink-0">Sec {sec}</span>
            <TextInput
              type="number" min={0} max={9999}
              value={counts[sec] ?? ""}
              onChange={e => onChange(sec, e.target.value)}
              placeholder="—"
              className="text-right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionSchedulesPanel({
  regularSecs, specialSecs, schedules, onChange,
}: {
  regularSecs: string[];
  specialSecs: string[];
  schedules: Record<string, SectionScheduleRow[]>;
  onChange: (sec: string, rows: SectionScheduleRow[]) => void;
}) {
  const allSecs = [
    ...regularSecs.map(n => ({ sec: n, track: "regular" as const })),
    ...specialSecs.map(n => ({ sec: n, track: "special" as const })),
  ];
  const [openSec, setOpenSec] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-surface-secondary/40">
      <div className="text-xs text-muted">
        <b>ตารางเวลาเรียนต่อ section</b> — ไม่บังคับ กดที่ section เพื่อกำหนดวัน-เวลาเรียน
      </div>
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
                <span className="text-xs text-muted ms-auto">
                  {rows.length > 0
                    ? `${rows.length} คาบ`
                    : "ยังไม่กำหนด"}
                </span>
              </button>
              {isOpen && (
                <div className="mt-2">
                  <SectionScheduleEditor
                    value={rows}
                    onChange={next => onChange(sec, next)}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
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

function Collapsible({
  title, summary, warn, children,
}: {
  title: string;
  summary?: string;
  warn?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary/50 transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
        <span className="text-sm font-medium">{title}</span>
        {summary && <span className="text-xs text-muted ms-auto">{summary}</span>}
      </button>
      {open && (
        <div className="p-3 border-t border-border space-y-3">
          {warn && (
            <div className="text-xs text-warning">
              {warn}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function studentCountsSummary(counts: Record<string, string>, total: number): string {
  const filled = Object.values(counts).filter(v => v.trim() !== "" && Number(v) > 0).length;
  if (filled === 0) return "ยังไม่กรอก";
  return `กรอกแล้ว ${filled}/${total} section`;
}

function schedulesSummary(schedules: Record<string, SectionScheduleRow[]>, total: number): string {
  const filled = Object.values(schedules).filter(rows => rows.length > 0).length;
  if (filled === 0) return "ยังไม่กำหนด";
  return `กำหนดแล้ว ${filled}/${total} section`;
}

function examSummary(d: Draft): string {
  const filled = [d.midterm_lecture_date, d.midterm_lab_date, d.final_lecture_date, d.final_lab_date]
    .filter(v => !!v).length;
  if (filled === 0) return "ยังไม่กำหนด";
  return `กรอกแล้ว ${filled}/4`;
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
