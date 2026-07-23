"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";
import type { Key } from "@heroui/react";
import {
  Autocomplete, EmptyState, Label, ListBox, SearchField, useFilter, toast,
} from "@heroui/react";
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
  // Teaching lecturer(s). Only collected when a non-lecturer (staff) opens the
  // course — a lecturer opening their own course is auto-assigned server-side.
  lecturer_ids: string[];
  regular_sections: number;
  special_sections: number;
  // Keyed by sec_no. Section schedules are required at course-open time —
  // TAs consume them immediately for time-clock validation.
  schedules: Record<string, SectionScheduleRow[]>;
}

const EMPTY: Draft = {
  faculty_course_id: "",
  lecturer_ids: [],
  regular_sections: 1,
  special_sections: 0,
  schedules: {},
};

interface LecturerUser {
  id: string;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}
function lecturerName(u: LecturerUser): string {
  return [u.title, u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

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
  pickLecturers = false,
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
  redirectBase?: string;
  // When true (staff opening a course), the form collects the teaching
  // lecturer(s) instead of silently attributing the course to the opener.
  pickLecturers?: boolean;
}) {
  const router = useRouter();
  const { data: fcs } = useSWR<FC[]>(open ? "/faculty-courses" : null);
  const { data: lecturerData } = useSWR<{ items: LecturerUser[] }>(
    open && pickLecturers ? "/users?role=lecturer&limit=200" : null,
  );
  const lecturers = useMemo(() => lecturerData?.items ?? [], [lecturerData]);
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

  // Progressive reveal gates: each step unlocks the next only when its
  // required fields are filled cleanly. When pickLecturers is on, an extra
  // "อาจารย์ผู้สอน" step sits between course and sections (shifting numbers).
  const step1Done = !!draft.faculty_course_id;
  const lecturersDone = !pickLecturers || draft.lecturer_ids.length > 0;
  const sectionsReady = step1Done && lecturersDone;
  const sectionsDone = sectionsReady && totalSections > 0;
  const step3Done = sectionsDone && scheduleComplete && !scheduleBlocked;
  const secStepNo = pickLecturers ? 3 : 2;
  const schedStepNo = pickLecturers ? 4 : 3;

  const canSubmit = step3Done && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      // starts_on/ends_on omitted — staff fills the teaching window later.
      // Backend columns are nullable and worklog validation defaults to an
      // unbounded window when null.
      const body = {
        faculty_course_id: draft.faculty_course_id,
        term_id: termId,
        ...(pickLecturers ? { lecturer_ids: draft.lecturer_ids } : {}),
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

        {/* Lecturer step — staff-only. A lecturer opening their own course is
            auto-assigned server-side and never sees this. */}
        {pickLecturers && step1Done && (
          <StepCard n={2} title="อาจารย์ผู้สอน" done={lecturersDone}>
            <div className="text-xs text-muted mb-2">
              เลือกอาจารย์ผู้สอนของรายวิชานี้ (เลือกได้มากกว่า 1 คน)
            </div>
            <LecturerPicker
              lecturers={lecturers}
              selected={draft.lecturer_ids}
              onChange={ids => setDraft(d => ({ ...d, lecturer_ids: ids }))}
            />
          </StepCard>
        )}

        {/* Sections — revealed after course (+ lecturer, if staff). Two columns
            side-by-side: regular on the left is primary; the right column is
            either the "+ เปิดภาคพิเศษ" opt-in or the special input once on. */}
        {sectionsReady && (
          <StepCard n={secStepNo} title="กลุ่มเรียน (section)" done={sectionsDone}>
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

        {/* Schedule — required: TA time-clock validation reads it immediately.
            Staff fills num_students + course dates later. */}
        {sectionsDone && (
          <StepCard n={schedStepNo} title="ตารางเวลาเรียนต่อ section" done={step3Done}>
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

// LecturerPicker — add lecturers via autocomplete, shown as removable chips.
// At least one is required (gated by the parent's lecturersDone).
function LecturerPicker({
  lecturers, selected, onChange,
}: {
  lecturers: LecturerUser[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const byId = useMemo(() => new Map(lecturers.map(u => [u.id, u])), [lecturers]);
  const available = lecturers.filter(u => !selected.includes(u.id));
  return (
    <div>
      {/* key remounts the autocomplete after each pick so it clears its input */}
      <LecturerAutocomplete
        key={selected.length}
        items={available}
        onPick={id => { if (id && !selected.includes(id)) onChange([...selected, id]); }}
      />
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(id => {
            const u = byId.get(id);
            return (
              <Chip key={id} tone="brand">
                {u ? lecturerName(u) : id}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter(x => x !== id))}
                  className="ms-1 inline-flex hover:text-danger"
                  aria-label="เอาออก"
                >
                  <X size={11} />
                </button>
              </Chip>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-warning font-medium mt-2">ยังไม่ได้เลือกอาจารย์ — ต้องเลือกอย่างน้อย 1 คน</div>
      )}
    </div>
  );
}

function LecturerAutocomplete({
  items, onPick,
}: {
  items: LecturerUser[];
  onPick: (id: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  return (
    <Autocomplete
      className="w-full"
      placeholder="พิมพ์ค้นหาอาจารย์…"
      selectionMode="single"
      value={null}
      onChange={(k: Key | Key[] | null) => onPick(String(k ?? ""))}
    >
      <Label className="sr-only">อาจารย์ผู้สอน</Label>
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
              <SearchField.Input placeholder="ค้นหาอาจารย์…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className="max-h-[280px] overflow-y-auto"
            renderEmptyState={() => <EmptyState>ไม่พบอาจารย์</EmptyState>}
          >
            {items.map(u => (
              <ListBox.Item key={u.id} id={u.id} textValue={`${lecturerName(u)} ${u.email}`}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{lecturerName(u)}</div>
                  <div className="text-xs text-muted truncate">{u.email}</div>
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

