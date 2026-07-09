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
import { BookPlus, CircleAlert, Clock } from "lucide-react";
import { api } from "../../lib/api";
import {
  Modal, Button, FieldGroup, TextInput, Alert, Chip,
} from "../../components/ui";
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
  open, onClose, termId, termLabel,
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
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

  const canSubmit =
    !!draft.faculty_course_id &&
    !!draft.starts_on &&
    !!draft.ends_on &&
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
      router.push(`/lecturer/courses/${res.id}`);
    } catch (e) {
      setErr((e as Error).message || "เปิดรายวิชาไม่สำเร็จ");
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
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            เลือกรายวิชาจากคณะ
          </div>
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
                {selected.credits}({selected.lecture_hrs}-{selected.lab_hrs}) หน่วยกิต
              </div>
            </div>
          )}
        </div>

        <SectionDivider label="ช่วงเวลาเรียน" required />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldGroup label="วันเริ่มสอน">
            <ThaiDateField
              value={draft.starts_on}
              onChange={v => setDraft(d => ({ ...d, starts_on: v }))}
            />
          </FieldGroup>
          <FieldGroup label="วันสิ้นสุด">
            <ThaiDateField
              value={draft.ends_on}
              onChange={v => setDraft(d => ({ ...d, ends_on: v }))}
            />
          </FieldGroup>
        </div>

        <SectionDivider label="กลุ่มเรียน (section)" required />
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
              type="number" min={0} max={99}
              value={draft.regular_sections}
              onChange={e => setDraft(d => ({ ...d, regular_sections: Math.max(0, Number(e.target.value)) }))}
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
              type="number" min={0} max={99}
              value={draft.special_sections}
              onChange={e => setDraft(d => ({ ...d, special_sections: Math.max(0, Number(e.target.value)) }))}
              className="max-w-[140px]"
            />
          </FieldGroup>
        </div>
        <div className="text-xs text-muted -mt-2">
          รวมทั้งหมด <b className="tabular">{totalSections}</b> section — เลขห้อง จำนวน นศ.
          และตารางเวลากรอกที่นี่ได้ หรือมาแก้ในหน้าจัดการวิชาภายหลังก็ได้
        </div>

        {totalSections > 0 && (
          <SectionStudentCounts
            regularSecs={regularSecNos(draft.regular_sections)}
            specialSecs={specialSecNos(draft.special_sections)}
            counts={draft.student_counts}
            onChange={(sec, v) =>
              setDraft(d => ({ ...d, student_counts: { ...d.student_counts, [sec]: v } }))
            }
          />
        )}

        {totalSections > 0 && (
          <SectionSchedulesPanel
            regularSecs={regularSecNos(draft.regular_sections)}
            specialSecs={specialSecNos(draft.special_sections)}
            schedules={draft.schedules}
            onChange={(sec, rows) =>
              setDraft(d => ({ ...d, schedules: { ...d.schedules, [sec]: rows } }))
            }
          />
        )}

        <SectionDivider label="วันสอบ (ไม่บังคับตอนนี้)" />
        <div className="text-xs text-muted -mt-2">
          หากยังไม่ทราบ สามารถเว้นว่างและกลับมากรอกภายหลังได้ —
          <b className="text-warning ms-1">
            แต่ TA จะไม่สามารถสร้างการลงบันทึกเวลาได้จนกว่าจะกรอกครบ
          </b>
        </div>

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

function SectionDivider({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      {required && <span className="text-xs text-danger">*</span>}
      <div className="flex-1 border-t border-border" />
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
