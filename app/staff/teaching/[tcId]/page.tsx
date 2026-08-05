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

interface SectionRow {
  id: string;
  sec_no: string;
  track: "regular" | "special" | string;
  num_students: number;
  schedules?: SectionScheduleRow[];
}

interface TC {
  id: string;
  code: string;
  name_th: string;
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
      <PageHeader
        title={tc ? `${tc.code} — ${tc.name_th}` : "…"}
        description={tc ? `นักศึกษา ${tc.num_students} คน (ปกติ ${tc.num_students_regular} · พิเศษ ${tc.num_students_special})` : undefined}
        actions={
          <Link href="/staff/teaching">
            <Button variant="ghost"><ArrowLeft size={14} />กลับ</Button>
          </Link>
        }
      />

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title="รายวิชานี้ถูกล็อกแล้ว"
            description={`ส่งออกไฟล์เมื่อ ${formatExportedAt(tc?.exported_at)} — ไม่สามารถแก้ไข section หรือตารางเวลาได้อีก`}
          />
        </div>
      )}

      <Panel
        title="Section และตารางเวลาเรียน"
        data-tour="course-sections"
        description="รายชื่อ section ปกติมาจากไฟล์ทะเบียน — เพิ่มเองเมื่อไฟล์ตกหล่น อาจารย์แก้ส่วนนี้ไม่ได้"
        actions={
          !locked && (
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />เพิ่ม section
            </Button>
          )
        }
        padded={false}
      >
        {sortedSecs.length === 0 ? (
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
              ลบได้เฉพาะวิชาที่เปิดผิด/ยังไม่มีข้อมูล — ถ้ามี TA, บันทึกเวลา หรือส่งออกแล้ว ระบบจะไม่ให้ลบ
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
            จะลบรายวิชา <b>{tc ? `${tc.code} — ${tc.name_th}` : ""}</b> พร้อม section และตารางเวลาทั้งหมด
            การกระทำนี้ย้อนกลับไม่ได้ (ระบบจะไม่ลบให้หากวิชานี้มี TA / บันทึกเวลา หรือถูกส่งออกแล้ว)
          </p>
        }
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecNo(section?.sec_no ?? "");
    setTrack(section?.track === "special" ? "special" : "regular");
    setStudents(String(section?.num_students ?? 0));
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

        {editing ? (
          <div className="text-xs text-muted">
            ประเภทเป็น <b>{track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}</b> —
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
            พร้อมตารางเวลาของ section นี้ — ย้อนกลับไม่ได้
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
