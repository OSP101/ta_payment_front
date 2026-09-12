"use client";
import { use, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { Save, Lock, Clock, CircleAlert, ArrowLeft, Trash2, Plus, Pencil } from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, Chip, Alert, EmptyState, ConfirmDialog,
  Modal, FieldGroup, TextInput, SelectField,
} from "../../../components/ui";
import SectionScheduleEditor, {
  type SectionScheduleRow, validateRows, toApiPayload, ScheduleSummary,
} from "../../../components/SectionScheduleEditor";
import { courseCodeLabel } from "../../../lib/courseCode";

interface SectionRow {
  id: string;
  sec_no: string;
  track: "regular" | "special" | string;
  num_students: number;
  /** หลักสูตรของกลุ่มเรียน (CS/IT/GIS/AI/CY/OTHER) — มาจาก ReservedFor ตอนนำเข้า;
   *  ไม่มีค่า = ยังไม่ระบุ. เจ้าหน้าที่แก้ทับได้ และค่าที่แก้จะไม่ถูกนำเข้าทับ */
  curriculum?: string | null;
  schedules?: SectionScheduleRow[];
}

const CURRICULUM_OPTIONS = [
  { id: "", label: "ยังไม่ระบุ" },
  { id: "CS", label: "วิทยาการคอมพิวเตอร์ (CS)" },
  { id: "IT", label: "เทคโนโลยีสารสนเทศ (IT)" },
  { id: "GIS", label: "ภูมิสารสนเทศศาสตร์ (GIS)" },
  { id: "AI", label: "ปัญญาประดิษฐ์ (AI)" },
  { id: "CY", label: "ความมั่นคงปลอดภัยไซเบอร์ (CY)" },
  { id: "OTHER", label: "คณะอื่น ๆ" },
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
}

export default function StaffTeachingCoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const router = useRouter();
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const locked = !!tc?.exported_at;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SectionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);

  async function deleteCourse() {
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${tcId}`);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success("ลบรายวิชาแล้ว");
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
        <ArrowLeft size={16} /> กลับไปรายการวิชา
      </Link>

      {tc ? (
        <PageHeader
          title={`${courseCodeLabel(tc)} — ${tc.name_th}`}
          description={`${tc.alt_codes?.length ? `เปิดภายใต้ ${tc.alt_codes.length + 1} รหัส งบและจำนวนนักศึกษารวมกัน · ` : ""}${tc.credits} (${tc.lecture_hrs}-${tc.lab_hrs}-${tc.self_hrs}) · นักศึกษา ${tc.num_students} คน (ปกติ ${tc.num_students_regular} · พิเศษ ${tc.num_students_special})`}
          actions={
            !locked && (
              <Button variant="secondary" size="sm" onClick={() => setInfoOpen(true)}>
                <Pencil size={14} />แก้ไขข้อมูลรายวิชา
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
          <div className="h-8 w-80 animate-pulse rounded bg-surface-secondary" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-secondary" />
        </div>
      )}

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title="รายวิชานี้ถูกล็อกแล้ว"
            description={`ส่งออกไฟล์เมื่อ ${formatExportedAt(tc?.exported_at)} ไม่สามารถแก้ไข section หรือตารางเวลาได้อีก`}
          />
        </div>
      )}

      <Panel
        title="Section และตารางเวลาเรียน"
        data-tour="course-sections"
        description="รายชื่อ section ปกติมาจากไฟล์ทะเบียน เพิ่มเองเมื่อไฟล์ตกหล่น อาจารย์แก้ส่วนนี้ไม่ได้"
        actions={
          !locked && (
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />เพิ่ม section
            </Button>
          )
        }
        padded={false}
      >
        {!tc ? (
          <div className="divide-y divide-border" aria-hidden>
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="p-4">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-secondary" />
                <div className="mt-3 h-10 w-full animate-pulse rounded bg-surface-secondary" />
              </div>
            ))}
          </div>
        ) : sortedSecs.length === 0 ? (
          <EmptyState
            icon={<Clock size={28} />}
            title="ยังไม่มี section"
            description={locked ? "" : "กด 'เพิ่ม section' เพื่อเพิ่มเอง หรือนำเข้าไฟล์ทะเบียนอีกครั้ง"}
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

      {/* Danger zone — remove a course opened by mistake. The server refuses if
          the course has any TA / worklog / export data. */}
      <div data-tour="course-danger" className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-danger">ลบรายวิชานี้</div>
            <div className="text-xs text-muted mt-0.5">
              ลบได้เฉพาะวิชาที่เปิดผิด/ยังไม่มีข้อมูล ถ้ามี TA, บันทึกเวลา หรือส่งออกแล้ว ระบบจะไม่ให้ลบ
            </div>
          </div>
          <Button
            variant="ghost"
            className="ms-auto text-danger hover:bg-danger/10"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
          >
            <Trash2 size={14} /> ลบรายวิชา
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
        title="ยืนยันการลบรายวิชา"
        confirmLabel="ลบรายวิชา"
        message={
          <p className="text-sm text-muted">
            จะลบรายวิชา <b>{tc ? `${courseCodeLabel(tc)} ${tc.name_th}` : ""}</b> พร้อม section และตารางเวลาทั้งหมด
            การกระทำนี้ย้อนกลับไม่ได้ (ระบบจะไม่ลบให้หากวิชานี้มี TA / บันทึกเวลา หรือถูกส่งออกแล้ว)
          </p>
        }
        requireTyped={tc ? [
          { label: "พิมพ์รหัสและชื่อวิชาเพื่อยืนยัน", expected: `${tc.code} ${tc.name_th}` },
          { label: 'พิมพ์ "Delete this subject" เพื่อยืนยัน', expected: "Delete this subject" },
        ] : undefined}
      />
    </div>
  );
}

function SectionScheduleBlock({
  tcId, section, locked, onEdit, onDelete,
}: {
  tcId: string;
  section: SectionRow;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
      toast.success(`บันทึกตารางเวลา Sec ${section.sec_no} เรียบร้อยแล้ว`);
    } catch (e) {
      setErr((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-base font-semibold tabular">Sec {section.sec_no}</span>
        <Chip tone={section.track === "special" ? "warn" : "brand"}>
          {section.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
        </Chip>
        {section.curriculum && (
          <Chip tone="neutral">
            {CURRICULUM_OPTIONS.find(c => c.id === section.curriculum)?.label ?? section.curriculum}
          </Chip>
        )}
        <span className="text-xs text-muted">{section.num_students} คน</span>
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
              <Save size={13} />บันทึก
            </Button>
            <IconButton label={`แก้ไข Sec ${section.sec_no}`} variant="ghost" size="sm" onClick={onEdit}>
              <Pencil size={13} />
            </IconButton>
            <IconButton label={`ลบ Sec ${section.sec_no}`} variant="danger-soft" size="sm" onClick={onDelete}>
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>
      <SectionScheduleEditor value={rows} onChange={setRows} disabled={locked} />
      {err && <Alert status="danger" icon={<CircleAlert size={14} />} title="บันทึกไม่สำเร็จ" description={err} />}
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
  const editing = !!section;
  const [secNo, setSecNo] = useState("");
  const [track, setTrack] = useState<"regular" | "special">("regular");
  const [students, setStudents] = useState("0");
  const [curriculum, setCurriculum] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecNo(section?.sec_no ?? "");
    setTrack(section?.track === "special" ? "special" : "regular");
    setStudents(String(section?.num_students ?? 0));
    setCurriculum(section?.curriculum ?? "");
    setErr(null);
  }, [open, section]);

  const duplicate = secNo.trim() !== "" && existingSecNos.includes(secNo.trim());
  const canSave = secNo.trim() !== "" && !duplicate && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const num = Number(students) || 0;
      if (editing) {
        await api.patch(`/teaching-courses/${tcId}/sections/${section!.id}`, {
          sec_no: secNo.trim(),
          num_students: num,
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
      toast.success(`${editing ? "แก้ไข" : "เพิ่ม"} Sec ${secNo.trim()} เรียบร้อยแล้ว`);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "บันทึกไม่สำเร็จ");
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
          {editing ? `แก้ไข Sec ${section!.sec_no}` : "เพิ่ม Section"}
        </span>
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
            <Save size={14} />บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup
            label="เลข Section"
            hint="ตัวเลขเท่านั้น เช่น 1, 2, 3"
            error={duplicate ? `เลข ${secNo.trim()} มีอยู่แล้วในรายวิชา` : undefined}
          >
            <TextInput
              value={secNo}
              onChange={e => setSecNo(e.target.value.replace(/\D+/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              autoFocus
              placeholder="เช่น 1"
            />
          </FieldGroup>
          <FieldGroup label="จำนวนนักศึกษา" hint="ใช้คำนวณงบและเพดานชั่วโมง TA">
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
            label="หลักสูตรของกลุ่มเรียน"
            value={curriculum}
            onChange={setCurriculum}
            options={CURRICULUM_OPTIONS}
          />
        )}

        {editing ? (
          <div className="text-xs text-muted">
            ประเภทเป็น <b>{track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}</b>
            เปลี่ยนไม่ได้หลังสร้างแล้ว หากผิดให้ลบ section นี้แล้วเพิ่มใหม่
          </div>
        ) : (
          <SelectField
            label="ประเภท"
            value={track}
            onChange={v => setTrack(v === "special" ? "special" : "regular")}
            options={[
              { id: "regular", label: "ภาคปกติ" },
              { id: "special", label: "ภาคพิเศษ" },
            ]}
          />
        )}

        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={err} />}
      </div>
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

  async function doDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${tcId}/sections/${target.id}`);
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(`ลบ Sec ${target.sec_no} เรียบร้อยแล้ว`);
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
      title="ยืนยันลบ section"
      confirmLabel="ลบ section"
      message={
        <div className="space-y-2">
          <p className="text-sm">
            จะลบ <b>Sec {target?.sec_no}</b> ({target?.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"})
            พร้อมตารางเวลาของ section นี้ ย้อนกลับไม่ได้
          </p>
          <p className="text-xs text-muted">
            ถ้ามีคำขอ TA หรือบันทึกเวลาที่อ้างอิง section นี้อยู่ ระบบจะไม่ให้ลบ
          </p>
        </div>
      }
    />
  );
}

function formatExportedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
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

  // Re-seed whenever the dialog opens, so a cancelled edit does not linger.
  useEffect(() => {
    if (!open) return;
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

  const num = (v: string) => Math.min(30, Math.max(0, Math.floor(Number(v) || 0)));

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/teaching-courses/${tcId}/info`, {
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
      toast.success("บันทึกข้อมูลรายวิชาแล้ว");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Pencil size={18} />แก้ไขข้อมูลรายวิชา</span>}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
            <Save size={14} />บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={err} />}

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup
            label={tc.alt_codes?.length ? "รหัสวิชาหลัก" : "รหัสวิชา"}
            hint={tc.alt_codes?.length ? `รหัสที่รวมอยู่ด้วย: ${tc.alt_codes.join(", ")}` : "ตัวเลข 6 หลัก หรืออักษร 2 ตัวตามด้วยตัวเลข 6 หลัก"}
            error={codeBad ? "รูปแบบรหัสวิชาไม่ถูกต้อง เช่น CP353201 หรือ 342233" : undefined}
          >
            <TextInput
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              autoComplete="off"
              maxLength={8}
            />
          </FieldGroup>
          <FieldGroup label="หน่วยกิต">
            <TextInput
              value={credits}
              onChange={e => setCredits(e.target.value.replace(/\D+/g, ""))}
              inputMode="numeric"
              maxLength={2}
            />
          </FieldGroup>
        </div>

        <FieldGroup
          label="ชื่อวิชา (ไทย)"
          error={nameBad ? "ชื่อวิชาต้องไม่ว่าง" : undefined}
        >
          <TextInput value={nameTH} onChange={e => setNameTH(e.target.value)} autoComplete="off" />
        </FieldGroup>

        <FieldGroup label="ชื่อวิชา (อังกฤษ)" hint="เว้นว่างได้">
          <TextInput value={nameEN} onChange={e => setNameEN(e.target.value)} autoComplete="off" />
        </FieldGroup>

        <div>
          <div className="mb-1.5 text-sm font-medium">ชั่วโมงต่อสัปดาห์</div>
          <div className="grid grid-cols-3 gap-3">
            <FieldGroup label="บรรยาย">
              <TextInput value={lec} onChange={e => setLec(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
            <FieldGroup label="ปฏิบัติการ">
              <TextInput value={lab} onChange={e => setLab(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
            <FieldGroup label="ศึกษาด้วยตนเอง">
              <TextInput value={self} onChange={e => setSelf(e.target.value.replace(/\D+/g, ""))} inputMode="numeric" maxLength={2} />
            </FieldGroup>
          </div>
          <p className="mt-1 text-xs text-muted">
            แสดงเป็น {num(credits)} ({num(lec)}-{num(lab)}-{num(self)}) · ชั่วโมงบรรยาย/ปฏิบัติการกำหนดว่ากลุ่มเรียนลงตารางแบบใดได้
          </p>
        </div>

        <SelectField
          label="หลักสูตร (ใช้กับทุกกลุ่มเรียน)"
          value={curriculum}
          onChange={setCurriculum}
          options={[{ id: "", label: "ไม่เปลี่ยน" }, ...CURRICULUM_OPTIONS.slice(1)]}
        />
        <p className="-mt-2 text-xs text-muted">
          เลือกแล้วจะเขียนทับหลักสูตรของทุกกลุ่มเรียนในรายวิชานี้
          หากต้องการกำหนดต่างกันรายกลุ่ม ให้แก้ที่แต่ละ section
        </p>
      </div>
    </Modal>
  );
}
