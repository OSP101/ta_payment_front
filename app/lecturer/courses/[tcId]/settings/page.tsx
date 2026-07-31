"use client";
import { use, useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "@heroui/react";
import {
  CircleAlert, Clock, Eye, Lock, Save, TriangleAlert,
} from "lucide-react";
import { api } from "../../../../lib/api";
import {
  PageHeader, Panel, Button, Chip, Alert, Modal, EmptyState,
} from "../../../../components/ui";
import SectionScheduleEditor, {
  type SectionScheduleRow, validateRows, toApiPayload, ScheduleSummary,
} from "../../../../components/SectionScheduleEditor";

interface SectionRow {
  id: string;
  sec_no: string;
  track: "regular" | "special" | string;
  num_students: number;
  // Set once the lecturer has filled in a missing timetable — they get exactly
  // one such write per section, after which only staff may change it.
  schedule_set_by_lecturer_at?: string;
  schedules?: SectionScheduleRow[];
}

// Why a lecturer may not touch this section's timetable — null when they still
// may. The three cases are distinct on purpose: "the file already said so" and
// "you already answered" are the same lock but not the same explanation, and a
// lecturer who hits the wrong one will go looking for a bug that isn't there.
function lockReason(sec: SectionRow, courseLocked: boolean): string | null {
  if (courseLocked) return "รายวิชานี้ถูกส่งออกแล้ว — แก้ไขไม่ได้";
  if (sec.schedule_set_by_lecturer_at) {
    return `คุณกำหนดตารางเวลาของกลุ่มนี้ไปแล้วเมื่อ ${formatThaiDate(sec.schedule_set_by_lecturer_at)} — กำหนดได้ครั้งเดียว หากต้องแก้ไขกรุณาแจ้งเจ้าหน้าที่`;
  }
  if ((sec.schedules ?? []).length > 0) {
    return "ตารางเวลาของกลุ่มนี้มาจากไฟล์ที่เจ้าหน้าที่นำเข้า — แก้ไขได้เฉพาะเจ้าหน้าที่";
  }
  return null;
}

interface TC {
  id: string;
  code: string;
  name_th: string;
  // Credit-hour breakdown from the faculty course — drives which meeting kinds
  // the schedule editor exposes. See [[schedule-kind-rules]].
  lecture_hrs: number;
  lab_hrs: number;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  exported_at?: string;
  sections?: SectionRow[];
}

// Which meeting kinds the course actually has — drives what the schedule
// editor lets you pick. See [[schedule-kind-rules]].
function allowedKindsFromTC(tc?: TC): ("lecture" | "lab")[] {
  if (!tc) return ["lecture", "lab"];
  const k: ("lecture" | "lab")[] = [];
  if (tc.lecture_hrs > 0) k.push("lecture");
  if (tc.lab_hrs > 0) k.push("lab");
  return k.length > 0 ? k : ["lecture", "lab"];
}

export default function CourseSettingsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);

  const locked = !!tc?.exported_at;

  return (
    <div>
      <PageHeader
        title="ตั้งค่ารายวิชา"
        description={tc ? `${tc.code} — ${tc.name_th}` : undefined}
      />

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title="รายวิชานี้ถูกล็อกแล้ว"
            description={`เจ้าหน้าที่ได้ส่งออกไฟล์ของรายวิชานี้เมื่อ ${formatExportedAt(tc?.exported_at)} — ไม่สามารถแก้ไข section ได้อีก`}
          />
        </div>
      )}

      {/* No tabs. The timetable editor lives behind the "แก้" button of each
          section row, and a WBA course (registrar sent no timetable) is exactly
          the case where the lecturer arrives here *looking* for it — burying
          that row under a second tab hid the one thing the page is for. */}
      <Panel title="ข้อมูลรายวิชา" className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ReadOnly label="รหัสวิชา" value={tc?.code} tabular />
          <ReadOnly label="ชื่อวิชา" value={tc?.name_th} span={3} />
          <ReadOnly label="นักศึกษาทั้งหมด" value={tc ? `${tc.num_students} คน` : "—"} />
          <ReadOnly label="ภาคปกติ" value={tc ? `${tc.num_students_regular} คน` : "—"} />
          <ReadOnly label="ภาคพิเศษ" value={tc ? `${tc.num_students_special} คน` : "—"} />
          <ReadOnly
            label="จำนวน Section"
            value={tc?.sections ? `${tc.sections.length} sec` : "—"}
          />
        </div>
      </Panel>

      <SectionsPanel
        tcId={tcId}
        sections={tc?.sections ?? []}
        locked={locked}
        allowedKinds={allowedKindsFromTC(tc)}
      />
    </div>
  );
}

function formatExportedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

/* -------------------------------------------------------------------------- */
/* Sections editor                                                            */
/* -------------------------------------------------------------------------- */

function SectionsPanel({
  tcId, sections, locked, allowedKinds,
}: {
  tcId: string;
  sections: SectionRow[];
  locked: boolean;
  allowedKinds: ("lecture" | "lab")[];
}) {
  const sortedSecs = [...sections].sort((a, b) => {
    // regular before special, then by numeric sec_no when possible.
    if (a.track !== b.track) return a.track === "regular" ? -1 : 1;
    const na = Number(a.sec_no), nb = Number(b.sec_no);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.sec_no.localeCompare(b.sec_no);
  });

  // Sections still waiting on the lecturer — the only thing on this page they
  // can act on, so it is worth saying out loud rather than making them scan
  // the table for "ยังไม่กำหนด".
  const openSecs = locked ? [] : sortedSecs.filter(s => lockReason(s, locked) === null);

  return (
    <Panel
      title="Sections และตารางเวลา"
      description={
        locked
          ? "รายวิชานี้ถูกล็อกหลังส่งออกไฟล์แล้ว — ดูอย่างเดียว"
          : "รายชื่อ section และจำนวนนักศึกษามาจากไฟล์ทะเบียนที่เจ้าหน้าที่นำเข้า — เพิ่ม แก้ไข หรือลบได้เฉพาะเจ้าหน้าที่"
      }
      className="mb-4"
      padded={false}
    >
      {openSecs.length > 0 && (
        <div className="px-4 pt-4">
          <Alert
            status="warning"
            icon={<TriangleAlert size={16} />}
            title={`มี ${openSecs.length} กลุ่มที่ยังไม่มีตารางเวลา — Sec ${openSecs.map(s => s.sec_no).join(", ")}`}
            description="ไฟล์ทะเบียนไม่ได้ระบุวัน–เวลาเรียนไว้ คุณกรอกเองได้ กลุ่มละครั้งเดียว หลังจากนั้นการแก้ไขจะเป็นหน้าที่ของเจ้าหน้าที่ (ส่งคำขอ TA ไม่ได้จนกว่าจะกรอกครบ)"
          />
        </div>
      )}

      {sortedSecs.length === 0 ? (
        <EmptyState
          title="ยังไม่มี section"
          description="เจ้าหน้าที่เป็นผู้เพิ่ม section จากไฟล์ทะเบียน"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Sec</th>
                <th style={{ width: 140 }}>ประเภท</th>
                <th className="num" style={{ width: 220 }}>จำนวนนักศึกษา</th>
                <th>ตารางเวลา</th>
                <th className="actions" style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {sortedSecs.map(sec => (
                <SectionEditRow
                  key={sec.id}
                  tcId={tcId}
                  section={sec}
                  locked={locked}
                  allowedKinds={allowedKinds}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SectionEditRow({
  tcId, section, locked, allowedKinds,
}: {
  tcId: string;
  section: SectionRow;
  locked: boolean;
  allowedKinds: ("lecture" | "lab")[];
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleRows = section.schedules ?? [];
  const reason = lockReason(section, locked);
  const readOnly = reason !== null;

  return (
    <tr>
      <td className="tabular font-medium">{section.sec_no}</td>
      <td>
        <Chip tone={section.track === "special" ? "warn" : "brand"}>
          {section.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
        </Chip>
      </td>
      <td className="num">
        <span className="tabular">{section.num_students}</span>
        <span className="text-xs text-muted ml-1">คน</span>
      </td>
      <td>
        {scheduleRows.length > 0 ? (
          <ScheduleSummary rows={scheduleRows} />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warning-soft-foreground">
            <TriangleAlert size={13} />ยังไม่กำหนด
          </span>
        )}
      </td>
      <td className="actions">
        <Button
          variant={readOnly ? "ghost" : "primary"}
          size="sm"
          onClick={() => setScheduleOpen(true)}
        >
          {readOnly
            ? <><Eye size={13} />ดูตารางเวลา</>
            : <><Clock size={13} />กำหนดตารางเวลา</>}
        </Button>
      </td>
      <SectionScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        tcId={tcId}
        section={section}
        lockReason={reason}
        allowedKinds={allowedKinds}
      />
    </tr>
  );
}

function SectionScheduleModal({
  open, onClose, tcId, section, lockReason, allowedKinds,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  section: SectionRow;
  /** Why saving is refused, or null when this is the lecturer's one write. */
  lockReason: string | null;
  allowedKinds: ("lecture" | "lab")[];
}) {
  const [rows, setRows] = useState<SectionScheduleRow[]>(section.schedules ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locked = lockReason !== null;

  // Reset draft each time the modal opens or the source data changes.
  useEffect(() => {
    if (open) { setRows(section.schedules ?? []); setErr(null); }
  }, [open, section.schedules]);

  const errors = validateRows(rows);
  // An empty timetable is refused server-side too — it would spend the one
  // write and leave the section still blocking TA requests.
  const canSave = !locked && rows.length > 0 && !errors.hasBlockingError && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/teaching-courses/${tcId}/sections/${section.id}/schedules`, {
        schedules: toApiPayload(rows),
      });
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(`บันทึกตารางเวลา Sec ${section.sec_no} เรียบร้อยแล้ว`);
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
          <Clock size={18} />
          ตารางเวลา Sec {section.sec_no}
          <Chip tone={section.track === "special" ? "warn" : "brand"}>
            {section.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
          </Chip>
        </span>
      }
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ปิด</Button>
          {!locked && (
            <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
              <Save size={14} />บันทึก
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {locked ? (
          <Alert
            status="default"
            icon={<Lock size={16} />}
            title="ดูอย่างเดียว"
            description={lockReason}
          />
        ) : (
          <Alert
            status="warning"
            icon={<TriangleAlert size={16} />}
            title="กำหนดได้ครั้งเดียว"
            description="หลังกดบันทึก ตารางเวลาของกลุ่มนี้จะแก้ไขได้เฉพาะเจ้าหน้าที่ — ตรวจวัน เวลา และประเภทคาบให้ครบถูกต้องก่อนบันทึก"
          />
        )}
        <div className="text-xs text-muted">
          กำหนดวัน–เวลาเรียนของ section นี้ให้ครบทุกคาบ (ทั้งบรรยายและปฏิบัติการ) —
          ระบบใช้ข้อมูลนี้เพื่อเช็คว่า TA ที่เลือกไว้ไม่ติดเวลาเรียนอื่น
        </div>
        <SectionScheduleEditor
          value={rows}
          onChange={setRows}
          disabled={locked}
          allowedKinds={allowedKinds}
        />
        {err && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={err} />
        )}
      </div>
    </Modal>
  );
}

function ReadOnly({
  label, value, span, tabular,
}: {
  label: string;
  value?: React.ReactNode;
  span?: 2 | 3 | 4;
  tabular?: boolean;
}) {
  const cls = span === 3 ? "md:col-span-3" : span === 2 ? "md:col-span-2" : "";
  return (
    <div className={cls}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-sm font-medium ${tabular ? "tabular" : ""}`}>
        {value ?? <span className="text-muted">—</span>}
      </div>
    </div>
  );
}

