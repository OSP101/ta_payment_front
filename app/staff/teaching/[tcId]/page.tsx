"use client";
import { use, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumbs, toast } from "@heroui/react";
import { Save, Lock, Clock, CircleAlert, ArrowLeft, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import {
  PageHeader, Panel, Button, Chip, Alert, EmptyState, ConfirmDialog,
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
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/staff/teaching">วิชาที่เปิดสอน</Breadcrumbs.Item>
        <Breadcrumbs.Item>
          {tc ? `${tc.code} — ${tc.name_th}` : "…"}
        </Breadcrumbs.Item>
      </Breadcrumbs>

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
        title="ตารางเวลาเรียนต่อ section"
        description="กำหนดวัน-เวลาเรียนของแต่ละ section ให้ระบบใช้เช็คว่า TA ไม่ติดเวลาเรียน"
        padded={false}
      >
        {sortedSecs.length === 0 ? (
          <EmptyState
            icon={<Clock size={28} />}
            title="ยังไม่มี section"
            description="ต้องมี section ในรายวิชานี้ก่อนจึงจะกำหนดตารางเวลาได้"
          />
        ) : (
          <div className="divide-y divide-border">
            {sortedSecs.map(sec => (
              <SectionScheduleBlock
                key={sec.id}
                tcId={tcId}
                section={sec}
                locked={locked}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Danger zone — remove a course opened by mistake. The server refuses if
          the course has any TA / worklog / export data. */}
      <div className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
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
  tcId, section, locked,
}: {
  tcId: string;
  section: SectionRow;
  locked: boolean;
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
          <Button
            variant={dirty ? "primary" : "ghost"} size="sm"
            onClick={save} disabled={!canSave} isPending={saving}
            className={dirty ? "" : "ms-auto"}
          >
            <Save size={13} />บันทึก
          </Button>
        )}
      </div>
      <SectionScheduleEditor value={rows} onChange={setRows} disabled={locked} />
      {err && <Alert status="danger" icon={<CircleAlert size={14} />} title="บันทึกไม่สำเร็จ" description={err} />}
    </div>
  );
}

function formatExportedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
