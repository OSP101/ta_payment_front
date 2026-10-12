"use client";
import { use, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/app/lib/toast";
import { Save, Lock, Clock, CircleAlert, ArrowLeft, Trash2, Plus, Pencil, GitMerge } from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, Chip, Alert, EmptyState, ConfirmDialog,
  Modal, FieldGroup, TextInput, SelectField, Select, Tip,
} from "../../../components/ui";
import SectionScheduleEditor, {
  type SectionScheduleRow, validateRows, toApiPayload, ScheduleSummary,
} from "../../../components/SectionScheduleEditor";
import { courseCodeLabel } from "../../../lib/courseCode";
import { useTitleScope } from "../../../components/Shell";
import { Skel, SkelRegion } from "../../../components/Skeletons";
import LecturerPanel from "./LecturerPanel";
import { budgetConfirmMessage } from "../budgetConfirm";
import { msg, useI18n } from "../../../lib/i18n/client";

interface SectionRow {
  id: string;
  sec_no: string;
  track: "regular" | "special" | string;
  num_students: number;
  /** หลักสูตรของกลุ่มเรียน (CS/IT/GIS/AI/CY/OTHER) — มาจาก ReservedFor ตอนนำเข้า;
   *  ไม่มีค่า = ยังไม่ระบุ. เจ้าหน้าที่แก้ทับได้ และค่าที่แก้จะไม่ถูกนำเข้าทับ */
  curriculum?: string | null;
  /** Set only on a merged code's section that found no partner (same number and
   *  track) — every other one was folded into the course's own section. */
  course_code?: string | null;
  schedules?: SectionScheduleRow[];
}

const CURRICULUM_OPTIONS = [
  { id: "", label: msg("ยังไม่ระบุ") },
  { id: "CS", label: msg("วิทยาการคอมพิวเตอร์ (CS)") },
  { id: "IT", label: msg("เทคโนโลยีสารสนเทศ (IT)") },
  { id: "GIS", label: msg("ภูมิสารสนเทศศาสตร์ (GIS)") },
  { id: "AI", label: msg("ปัญญาประดิษฐ์ (AI)") },
  { id: "CY", label: msg("ความมั่นคงปลอดภัยไซเบอร์ (CY)") },
  { id: "OTHER", label: msg("คณะอื่น ๆ") },
];

interface TC {
  id: string;
  code: string;
  alt_codes?: string[];
  name_th: string;
  name_en?: string;
  credits: number;
  lecture_hrs: number;
  lab_hrs: number;
  self_hrs: number;
  starts_on?: string;
  ends_on?: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  exported_at?: string;
  sections?: SectionRow[];
  lecturers?: { id: string; first_name: string; last_name: string; is_primary: boolean }[];
}

export default function StaffTeachingCoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const router = useRouter();
  const { t, intl } = useI18n();
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);
  useTitleScope(tc ? `${courseCodeLabel(tc)} ${tc.name_th}` : undefined);
  const locked = !!tc?.exported_at;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SectionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [foldTarget, setFoldTarget] = useState<SectionRow | null>(null);

  async function deleteCourse() {
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${tcId}`);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success(t("ลบรายวิชาแล้ว"));
      router.push("/staff/teaching");
    } catch (e) {
      // Backend returns a clear Thai reason when the course has data.
      notify.error(e);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const sortedSecs = [...(tc?.sections ?? [])].sort((a, b) => {
    if (a.track !== b.track) return a.track === "regular" ? -1 : 1;
    const na = Number(a.sec_no), nb = Number(b.sec_no);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.sec_no.localeCompare(b.sec_no);
  });

  return (
    <div>
      <Link
        href="/staff/teaching"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-[var(--brand)]"
      >
        <ArrowLeft size={16} /> {t("กลับไปรายการวิชา")}
      </Link>

      {tc ? (
        <PageHeader
          title={`${courseCodeLabel(tc)} — ${tc.name_th}`}
          description={tc.alt_codes?.length
            ? t("เปิดภายใต้ {codes} รหัส งบและจำนวนนักศึกษารวมกัน · {credits} ({lec}-{lab}-{self}) · นักศึกษา {n} คน (ปกติ {reg} · พิเศษ {spc})", {
                codes: tc.alt_codes.length + 1, credits: tc.credits, lec: tc.lecture_hrs, lab: tc.lab_hrs, self: tc.self_hrs,
                n: tc.num_students, reg: tc.num_students_regular, spc: tc.num_students_special,
              })
            : t("{credits} ({lec}-{lab}-{self}) · นักศึกษา {n} คน (ปกติ {reg} · พิเศษ {spc})", {
                credits: tc.credits, lec: tc.lecture_hrs, lab: tc.lab_hrs, self: tc.self_hrs,
                n: tc.num_students, reg: tc.num_students_regular, spc: tc.num_students_special,
              })}
          actions={
            !locked && (
              <Button variant="secondary" size="sm" onClick={() => setInfoOpen(true)}>
                <Pencil size={14} />{t("แก้ไขข้อมูลรายวิชา")}
              </Button>
            )
          }
        />
      ) : (
        // Title/description bars instead of literal "…" text — a fixed-width
        // placeholder in the exact shape of the real header means the swap
        // reads as content filling in, not the page changing shape underneath
        // the reader (the flash the settings page was reported for).
        <div className="mb-6" aria-hidden>
          <Skel className="h-8 w-80 max-w-full" />
          <Skel className="mt-2 h-4 w-56" />
        </div>
      )}

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title={t("รายวิชานี้ถูกล็อกแล้ว")}
            description={t("ส่งออกไฟล์เมื่อ {at} ไม่สามารถแก้ไข section หรือตารางเวลาได้อีก", { at: formatExportedAt(tc?.exported_at, intl) })}
          />
        </div>
      )}

      {/* Always drawn — it sits above the sections, so popping it in once the
          course loaded pushed the whole section list down. */}
      <div className="mb-6">
        <LecturerPanel tcId={tcId} lecturers={tc?.lecturers} loading={!tc} />
      </div>

      <Panel
        title={t("Section และตารางเวลาเรียน")}
        data-tour="course-sections"
        description={t("รายชื่อ section ปกติมาจากไฟล์ทะเบียน เพิ่มเองเมื่อไฟล์ตกหล่น อาจารย์แก้ส่วนนี้ไม่ได้")}
        actions={
          !locked && (
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />{t("เพิ่ม section")}
            </Button>
          )
        }
        padded={false}
      >
        {!tc ? (
          <SkelRegion className="divide-y divide-border">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="p-4">
                <Skel className="h-4 w-40" />
                <Skel className="mt-3 h-10 w-full" />
              </div>
            ))}
          </SkelRegion>
        ) : sortedSecs.length === 0 ? (
          <EmptyState
            icon={<Clock size={28} />}
            title={t("ยังไม่มี section")}
            description={locked ? "" : t("กด 'เพิ่ม section' เพื่อเพิ่มเอง หรือนำเข้าไฟล์ทะเบียนอีกครั้ง")}
          />
        ) : (
          <div className="divide-y divide-border">
            {sortedSecs.map(sec => (
              <SectionScheduleBlock
                key={sec.id}
                tcId={tcId}
                section={sec}
                locked={locked}
                onEdit={() => setEditTarget(sec)}
                onDelete={() => setDeleteTarget(sec)}
                onFold={sec.course_code ? () => setFoldTarget(sec) : undefined}
              />
            ))}
          </div>
        )}
      </Panel>

      <SectionFormModal
        open={addOpen && !locked}
        onClose={() => setAddOpen(false)}
        tcId={tcId}
        existingSecNos={sortedSecs.map(s => s.sec_no)}
      />

      <SectionFormModal
        open={!!editTarget && !locked}
        onClose={() => setEditTarget(null)}
        tcId={tcId}
        section={editTarget ?? undefined}
        existingSecNos={sortedSecs.filter(s => s.id !== editTarget?.id).map(s => s.sec_no)}
      />

      <DeleteSectionDialog
        target={deleteTarget}
        tcId={tcId}
        onClose={() => setDeleteTarget(null)}
      />

      {foldTarget && (
        <FoldSectionModal
          tcId={tcId}
          section={foldTarget}
          candidates={sortedSecs.filter(s => s.id !== foldTarget.id && !s.course_code && s.track === foldTarget.track)}
          onClose={() => setFoldTarget(null)}
        />
      )}

      {/* Danger zone — remove a course opened by mistake. The server refuses if
          the course has any TA / worklog / export data. */}
      <div data-tour="course-danger" className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-danger">{t("ลบรายวิชานี้")}</div>
            <div className="text-xs text-muted mt-0.5">
              {t("ลบได้เฉพาะวิชาที่เปิดผิด/ยังไม่มีข้อมูล ถ้ามี TA, บันทึกเวลา หรือส่งออกแล้ว ระบบจะไม่ให้ลบ")}
            </div>
          </div>
          <Button
            variant="ghost"
            className="ms-auto text-danger hover:bg-danger/10"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
          >
            <Trash2 size={14} /> {t("ลบรายวิชา")}
          </Button>
        </div>
      </div>

      {tc && (
        <CourseInfoModal
          open={infoOpen}
          tcId={tcId}
          tc={tc}
          onClose={() => setInfoOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteCourse}
        isPending={deleting}
        danger
        icon={<Trash2 size={20} />}
        title={t("ยืนยันการลบรายวิชา")}
        confirmLabel={t("ลบรายวิชา")}
        message={
          <p className="text-sm text-muted">
            {t.rich("จะลบรายวิชา {course} พร้อม section และตารางเวลาทั้งหมด การกระทำนี้ย้อนกลับไม่ได้ (ระบบจะไม่ลบให้หากวิชานี้มี TA / บันทึกเวลา หรือถูกส่งออกแล้ว)", {
              course: <b>{tc ? `${courseCodeLabel(tc)} ${tc.name_th}` : ""}</b>,
            })}
          </p>
        }
        requireTyped={tc ? [
          { label: t("พิมพ์รหัสและชื่อวิชาเพื่อยืนยัน"), expected: `${tc.code} ${tc.name_th}` },
          { label: t('พิมพ์ "Delete this subject" เพื่อยืนยัน'), expected: "Delete this subject" },
        ] : undefined}
      />
    </div>
  );
}

function SectionScheduleBlock({
  tcId, section, locked, onEdit, onDelete, onFold,
}: {
  tcId: string;
  section: SectionRow;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Present only for a merged code's section still on its own. */
  onFold?: () => void;
}) {
  const { t } = useI18n();
  const initial = section.schedules ?? [];
  const [rows, setRows] = useState<SectionScheduleRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Track current rows + the last server value we synced to, so a background
  // SWR revalidation doesn't clobber the user's unsaved edits.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const syncedRef = useRef(JSON.stringify(toApiPayload(initial)));

  useEffect(() => {
    const incoming = section.schedules ?? [];
    const localDirty =
      JSON.stringify(toApiPayload(rowsRef.current)) !== syncedRef.current;
    // Only pull server data in when the user has no unsaved local edits.
    if (!localDirty) {
      setRows(incoming);
      syncedRef.current = JSON.stringify(toApiPayload(incoming));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.schedules]);

  const errors = validateRows(rows);
  const dirty = JSON.stringify(toApiPayload(rows)) !== JSON.stringify(toApiPayload(initial));
  const canSave = !locked && dirty && !errors.hasBlockingError && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/teaching-courses/${tcId}/sections/${section.id}/schedules`, {
        schedules: toApiPayload(rows),
      });
      // Mark the just-saved payload as the synced baseline so the revalidation
      // that follows adopts the server copy instead of being treated as dirty.
      syncedRef.current = JSON.stringify(toApiPayload(rows));
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(t("บันทึกตารางเวลา Sec {sec} เรียบร้อยแล้ว", { sec: section.sec_no }));
    } catch (e) {
      setErr((e as Error).message || t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-base font-semibold tabular">Sec {section.sec_no}</span>
        <Chip tone={section.track === "special" ? "warn" : "brand"}>
          {section.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")}
        </Chip>
        {section.curriculum && (
          <Chip tone="neutral">
            {t(CURRICULUM_OPTIONS.find(c => c.id === section.curriculum)?.label ?? section.curriculum)}
          </Chip>
        )}
        <span className="text-xs text-muted">{t("{n} คน", { n: section.num_students })}</span>
        {section.course_code && (
          <Tip content={t("section ของรหัส {code} ที่ระบบหา section คู่ (เลขและประเภทเดียวกัน) ไม่เจอ ถ้าเรียนด้วยกัน ให้กดรวมเข้ากับ section นั้น", { code: section.course_code })}>
            <span className="inline-flex"><Chip tone="warn">{t("ยังไม่รวม")}</Chip></span>
          </Tip>
        )}
        {!dirty && rows.length > 0 && (
          <div className="ms-auto"><ScheduleSummary rows={rows} /></div>
        )}
        {!locked && (
          // ms-auto lands on whichever element first needs to be pushed right:
          // the summary when it is shown, otherwise this group.
          <div className={"inline-flex items-center gap-1 " + (dirty || rows.length === 0 ? "ms-auto" : "")}>
            <Button
              variant={dirty ? "primary" : "ghost"} size="sm"
              onClick={save} disabled={!canSave} isPending={saving}
            >
              <Save size={13} />{t("บันทึก")}
            </Button>
            <IconButton label={t("แก้ไข Sec {sec}", { sec: section.sec_no })} variant="ghost" size="sm" onClick={onEdit}>
              <Pencil size={13} />
            </IconButton>
            {onFold && (
              <Button variant="secondary" size="sm" onClick={onFold}>
                <GitMerge size={13} />{t("รวมเข้ากับ sec…")}
              </Button>
            )}
            <IconButton label={t("ลบ Sec {sec}", { sec: section.sec_no })} variant="danger-soft" size="sm" onClick={onDelete}>
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>
      <SectionScheduleEditor value={rows} onChange={setRows} disabled={locked} />
      {err && <Alert status="danger" icon={<CircleAlert size={14} />} title={t("บันทึกไม่สำเร็จ")} description={err} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section roster — staff only                                                */
/* -------------------------------------------------------------------------- */

// One modal for both add and edit: the fields are identical apart from track,
// which the API cannot change after creation (PATCH /sections takes sec_no,
// room and num_students only). Two near-identical modals would drift.
function SectionFormModal({
  open, onClose, tcId, section, existingSecNos,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  /** Present when editing; absent when adding. */
  section?: SectionRow;
  existingSecNos: string[];
}) {
  const { t } = useI18n();
  const editing = !!section;
  const [secNo, setSecNo] = useState("");
  const [track, setTrack] = useState<"regular" | "special">("regular");
  const [students, setStudents] = useState("0");
  const [curriculum, setCurriculum] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Budget preview from a 409 — see budgetConfirm.ts.
  const [budgetPrompt, setBudgetPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBudgetPrompt(null);
    setSecNo(section?.sec_no ?? "");
    setTrack(section?.track === "special" ? "special" : "regular");
    setStudents(String(section?.num_students ?? 0));
    setCurriculum(section?.curriculum ?? "");
    setErr(null);
  }, [open, section]);

  const duplicate = secNo.trim() !== "" && existingSecNos.includes(secNo.trim());
  const canSave = secNo.trim() !== "" && !duplicate && !saving;

  async function save(confirm = false) {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const num = Number(students) || 0;
      if (editing) {
        await api.patch(`/teaching-courses/${tcId}/sections/${section!.id}`, {
          sec_no: secNo.trim(),
          num_students: num,
          ...(confirm ? { confirm: true } : {}),
          // Send only when changed: "" clears back to ยังไม่ระบุ on purpose,
          // but an untouched field must not rewrite what the import derived.
          ...(curriculum !== (section?.curriculum ?? "") ? { curriculum } : {}),
        });
      } else {
        await api.post(`/teaching-courses/${tcId}/sections`, {
          sec_no: secNo.trim(),
          track,
          num_students: num,
        });
      }
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(editing
        ? t("แก้ไข Sec {sec} เรียบร้อยแล้ว", { sec: secNo.trim() })
        : t("เพิ่ม Sec {sec} เรียบร้อยแล้ว", { sec: secNo.trim() }));
      setBudgetPrompt(null);
      onClose();
    } catch (e) {
      const preview = budgetConfirmMessage(e);
      if (preview) setBudgetPrompt(preview);
      else setErr((e as Error).message || t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          {editing ? <Pencil size={18} /> : <Plus size={18} />}
          {editing ? t("แก้ไข Sec {sec}", { sec: section!.sec_no }) : t("เพิ่ม Section")}
        </span>
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={() => save()} disabled={!canSave} isPending={saving}>
            <Save size={14} />{t("บันทึก")}
          </Button>
        </>
      }
    >
      <BudgetChangeConfirm
        message={budgetPrompt}
        pending={saving}
        onCancel={() => setBudgetPrompt(null)}
        onConfirm={() => save(true)}
      />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup
            label={t("เลข Section")}
            hint={t("ตัวเลขเท่านั้น เช่น 1, 2, 3")}
            error={duplicate ? t("เลข {sec} มีอยู่แล้วในรายวิชา", { sec: secNo.trim() }) : undefined}
          >
            <TextInput
              value={secNo}
              onChange={e => setSecNo(e.target.value.replace(/\D+/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              autoFocus
              placeholder={t("เช่น 1")}
            />
          </FieldGroup>
          <FieldGroup label={t("จำนวนนักศึกษา")} hint={t("ใช้คำนวณงบและเพดานชั่วโมง TA")}>
            <TextInput
              value={students}
              onChange={e => setStudents(e.target.value.replace(/\D+/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
            />
          </FieldGroup>
        </div>

        {editing && (
          <SelectField
            label={t("หลักสูตรของกลุ่มเรียน")}
            value={curriculum}
            onChange={setCurriculum}
            options={CURRICULUM_OPTIONS.map(o => ({ ...o, label: t(o.label) }))}
          />
        )}

        {editing ? (
          <div className="text-xs text-muted">
            {t.rich("ประเภทเป็น {track} เปลี่ยนไม่ได้หลังสร้างแล้ว หากผิดให้ลบ section นี้แล้วเพิ่มใหม่", {
              track: <b>{track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")}</b>,
            })}
          </div>
        ) : (
          <SelectField
            label={t("ประเภท")}
            value={track}
            onChange={v => setTrack(v === "special" ? "special" : "regular")}
            options={[
              { id: "regular", label: t("ภาคปกติ") },
              { id: "special", label: t("ภาคพิเศษ") },
            ]}
          />
        )}

        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={err} />}
      </div>
    </Modal>
  );
}

/**
 * Fold a merged code's leftover section into the section it is taught with:
 * one class, one section (office, 02/10/2026). The class keeps the chosen
 * section's timetable; students, TA requests, hours and makeups move into it
 * (POST …/sections/:id/fold → fold_section_into, migration 0145).
 */
function FoldSectionModal({
  tcId, section, candidates, onClose,
}: {
  tcId: string;
  section: SectionRow;
  candidates: SectionRow[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [into, setInto] = useState(candidates[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function fold() {
    if (!into) return;
    setPending(true);
    try {
      await api.post(`/teaching-courses/${tcId}/sections/${section.id}/fold`, { into_section_id: into });
      await mutate((k: unknown) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success(t("รวม Sec {sec} แล้ว", { sec: section.sec_no }));
      onClose();
    } catch (e) {
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!pending) onClose(); }}
      size="sm"
      icon={<GitMerge size={18} />}
      title={t("รวม Sec {sec}", { sec: section.sec_no })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={fold} disabled={!into || pending} isPending={pending}>{t("รวม section")}</Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <Alert status="warning" title={t("ไม่มี section ให้รวม")}
          description={t("วิชานี้ไม่มี section {track} ของรหัสหลัก รวมได้เฉพาะ section ประเภทเดียวกัน", { track: section.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ") })} />
      ) : (
        <div className="space-y-3">
          <FieldGroup label={t("เรียนด้วยกันกับ")}>
            <Select value={into} onChange={e => setInto(e.target.value)}>
              {candidates.map(c => <option key={c.id} value={c.id}>{t("Sec {sec} ({n} คน)", { sec: c.sec_no, n: c.num_students })}</option>)}
            </Select>
          </FieldGroup>
          <p className="text-xs text-muted">
            {t("นักศึกษา {n} คนจะรวมเข้า section ที่เลือก และใช้ตารางเรียนของ section นั้น คำขอ TA บันทึกเวลา และวันชดเชยของ Sec {sec} จะย้ายตามไปด้วย ย้อนกลับไม่ได้", { n: section.num_students, sec: section.sec_no })}
          </p>
        </div>
      )}
    </Modal>
  );
}

function DeleteSectionDialog({
  target, tcId, onClose,
}: {
  target: SectionRow | null;
  tcId: string;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const { t } = useI18n();

  async function doDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${tcId}/sections/${target.id}`);
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(t("ลบ Sec {sec} เรียบร้อยแล้ว", { sec: target.sec_no }));
      onClose();
    } catch (e) {
      // The server refuses when a TA request or work log still points here.
      notify.error(e);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmDialog
      open={!!target}
      onClose={onClose}
      onConfirm={doDelete}
      isPending={deleting}
      danger
      icon={<Trash2 size={20} />}
      title={t("ยืนยันลบ section")}
      confirmLabel={t("ลบ section")}
      message={
        <div className="space-y-2">
          <p className="text-sm">
            {t.rich("จะลบ {sec} ({track}) พร้อมตารางเวลาของ section นี้ ย้อนกลับไม่ได้", {
              sec: <b>Sec {target?.sec_no}</b>,
              track: target?.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ"),
            })}
          </p>
          <p className="text-xs text-muted">
            {t("ถ้ามีคำขอ TA หรือบันทึกเวลาที่อ้างอิง section นี้อยู่ ระบบจะไม่ให้ลบ")}
          </p>
        </div>
      }
    />
  );
}

function formatExportedAt(iso: string | undefined, intl: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" });
}

/* -------------------------------------------------------------------------- */
/* Course identity                                                            */
/* -------------------------------------------------------------------------- */

// KKU course codes: legacy six digits ("342233"), or two capitals plus six
// ("CP353201"). Same pattern the backend enforces — checked here only so the
// reader is told before they press save, never instead of the server.
const COURSE_CODE_RE = /^(?:[A-Z]{2}[0-9]{6}|[0-9]{6})$/;

/**
 * Correcting a course after it is open.
 *
 * The registrar file is where these normally come from, but it arrives with
 * typos and with courses missing, and the only fix used to be deleting the
 * course and re-entering every section and schedule by hand.
 *
 * หลักสูตร sits on the SECTION, not the course. It is offered here because staff
 * set it once for the whole course when they open one, and the open dialog
 * already promises it can be corrected "ที่หน้าตั้งค่ารายวิชา" — this is that
 * page. Saving it writes every section; per-section overrides stay on each
 * section's own editor, so the field starts blank rather than showing one
 * section's value as if it spoke for all of them.
 *
 * ระดับ (ปริญญาตรี / บัณฑิตศึกษา) is deliberately absent: it decides the pay
 * rate and which caps apply, so changing it would re-price work already logged.
 */
function CourseInfoModal({
  open, tcId, tc, onClose,
}: { open: boolean; tcId: string; tc: TC; onClose: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState(tc.code);
  const [nameTH, setNameTH] = useState(tc.name_th);
  const [nameEN, setNameEN] = useState(tc.name_en ?? "");
  const [credits, setCredits] = useState(String(tc.credits));
  const [lec, setLec] = useState(String(tc.lecture_hrs));
  const [lab, setLab] = useState(String(tc.lab_hrs));
  const [self, setSelf] = useState(String(tc.self_hrs));
  const [curriculum, setCurriculum] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // Budget preview from a 409 — see budgetConfirm.ts.
  const [budgetPrompt, setBudgetPrompt] = useState<string | null>(null);

  // Re-seed whenever the dialog opens, so a cancelled edit does not linger.
  useEffect(() => {
    if (!open) return;
    setBudgetPrompt(null);
    setCode(tc.code);
    setNameTH(tc.name_th);
    setNameEN(tc.name_en ?? "");
    setCredits(String(tc.credits));
    setLec(String(tc.lecture_hrs));
    setLab(String(tc.lab_hrs));
    setSelf(String(tc.self_hrs));
    setCurriculum("");
    setErr("");
  }, [open, tc]);

  const codeUpper = code.toUpperCase().replace(/\s+/g, "");
  const codeBad = codeUpper.length > 0 && !COURSE_CODE_RE.test(codeUpper);
  const nameBad = nameTH.trim() === "";
  const canSave = !codeBad && !nameBad && codeUpper !== "" && !saving;

  // Clamped only below; the server owns the ceilings (credits 30, hours 60 —
  // teaching_rules.go) and answers in Thai. Clamping hours at 30 here used to
  // silently rewrite a real "9 (0-36-18)" course to 30 lab hours.
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  async function save(confirm = false) {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/teaching-courses/${tcId}/info`, {
        ...(confirm ? { confirm: true } : {}),
        code: codeUpper,
        name_th: nameTH.trim(),
        name_en: nameEN.trim(),
        credits: num(credits),
        lecture_hrs: num(lec),
        lab_hrs: num(lab),
        self_hrs: num(self),
        // Only sent when the officer actually picked one — an untouched field
        // must not overwrite section-level values they never looked at.
        ...(curriculum ? { curriculum } : {}),
      });
      await mutate(`/teaching-courses/${tcId}`);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success(t("บันทึกข้อมูลรายวิชาแล้ว"));
      setBudgetPrompt(null);
      onClose();
    } catch (e) {
      const preview = budgetConfirmMessage(e);
      if (preview) setBudgetPrompt(preview);
      else setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Pencil size={18} />{t("แก้ไขข้อมูลรายวิชา")}</span>}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={() => save()} disabled={!canSave} isPending={saving}>
            <Save size={14} />{t("บันทึก")}
          </Button>
        </>
      }
    >
      <BudgetChangeConfirm
        message={budgetPrompt}
        pending={saving}
        onCancel={() => setBudgetPrompt(null)}
        onConfirm={() => save(true)}
      />
      <div className="space-y-4">
        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={err} />}

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup
            label={tc.alt_codes?.length ? t("รหัสวิชาหลัก") : t("รหัสวิชา")}
            hint={tc.alt_codes?.length ? t("รหัสที่รวมอยู่ด้วย: {codes}", { codes: tc.alt_codes.join(", ") }) : t("ตัวเลข 6 หลัก หรืออักษร 2 ตัวตามด้วยตัวเลข 6 หลัก")}
            error={codeBad ? t("รูปแบบรหัสวิชาไม่ถูกต้อง เช่น CP353201 หรือ 342233") : undefined}
          >
            <TextInput
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              autoComplete="off"
              maxLength={8}
            />
          </FieldGroup>
          <FieldGroup label={t("หน่วยกิต")}>
            <TextInput
              value={credits}
              onChange={e => setCredits(e.target.value.replace(/\D+/g, ""))}
              inputMode="numeric"
              maxLength={2}
            />
          </FieldGroup>
        </div>

        <FieldGroup
          label={t("ชื่อวิชา (ไทย)")}
          error={nameBad ? t("ชื่อวิชาต้องไม่ว่าง") : undefined}
        >
          <TextInput value={nameTH} onChange={e => setNameTH(e.target.value)} autoComplete="off" />
        </FieldGroup>

        <FieldGroup label={t("ชื่อวิชา (อังกฤษ)")} hint={t("เว้นว่างได้")}>
          <TextInput value={nameEN} onChange={e => setNameEN(e.target.value)} autoComplete="off" />
        </FieldGroup>

        <div>
          <div className="mb-1.5 text-sm font-medium">{t("ชั่วโมงต่อสัปดาห์")}</div>
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
            <FieldGroup label={t("บรรยาย")}>
              <TextInput value={lec} onChange={e => setLec(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
            <FieldGroup label={t("ปฏิบัติการ")}>
              <TextInput value={lab} onChange={e => setLab(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
            <FieldGroup label={t("ศึกษาด้วยตนเอง")}>
              <TextInput value={self} onChange={e => setSelf(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
          </div>
          <p className="mt-1 text-xs text-muted">
            {t("แสดงเป็น {credits} ({lec}-{lab}-{self}) · ชั่วโมงบรรยาย/ปฏิบัติการกำหนดว่ากลุ่มเรียนลงตารางแบบใดได้", { credits: num(credits), lec: num(lec), lab: num(lab), self: num(self) })}
          </p>
        </div>

        <SelectField
          label={t("หลักสูตร (ใช้กับทุกกลุ่มเรียน)")}
          value={curriculum}
          onChange={setCurriculum}
          options={[{ id: "", label: t("ไม่เปลี่ยน") }, ...CURRICULUM_OPTIONS.slice(1).map(o => ({ ...o, label: t(o.label) }))]}
        />
        <p className="-mt-2 text-xs text-muted">
          {t("เลือกแล้วจะเขียนทับหลักสูตรของทุกกลุ่มเรียนในรายวิชานี้ หากต้องการกำหนดต่างกันรายกลุ่ม ให้แก้ที่แต่ละ section")}
        </p>
      </div>
    </Modal>
  );
}

/**
 * Second step of an edit that moves the budget of a course whose TAs or hours
 * are already approved: the server refused it with a preview (old → new budget,
 * who is affected) and saves only when the same edit is sent again with
 * confirm=true. Without this the edit used to save silently — a stray 0 in the
 * lecture hours zeroed the ceiling every approval had been made against.
 */
function BudgetChangeConfirm({
  message, pending, onCancel, onConfirm,
}: { message: string | null; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  return (
    <ConfirmDialog
      open={message !== null}
      onClose={onCancel}
      onConfirm={onConfirm}
      title={t("ยืนยันการเปลี่ยนงบประมาณรายวิชา")}
      message={<span className="whitespace-pre-line">{message}</span>}
      confirmLabel={t("ยืนยันการเปลี่ยนงบ")}
      danger
      isPending={pending}
      size="md"
    />
  );
}
