"use client";
import { use, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  Breadcrumbs, DatePicker, DateField, Calendar, I18nProvider, Tabs, toast,
} from "@heroui/react";
import { parseDate, type DateValue } from "@internationalized/date";
import { Save, X, CircleAlert, Info as InfoIcon, Lock, Plus, Trash2, LayoutGrid, Users, CalendarDays, Clock } from "lucide-react";
import { api } from "../../../../lib/api";
import {
  PageHeader, Panel, Button, FieldGroup, TextInput, Chip, Alert, Modal, EmptyState,
} from "../../../../components/ui";
import SectionScheduleEditor, {
  type SectionScheduleRow, validateRows, toApiPayload, ScheduleSummary,
} from "../../../../components/SectionScheduleEditor";

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
  // Credit-hour breakdown from the faculty course — drives which meeting kinds
  // the schedule editor exposes. See [[schedule-kind-rules]].
  lecture_hrs: number;
  lab_hrs: number;
  starts_on?: string;
  ends_on?: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  exported_at?: string;
  sections?: SectionRow[];
}

interface Draft {
  starts_on: string;
  ends_on: string;
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

function toDraft(tc?: TC): Draft {
  return {
    starts_on: tc?.starts_on ?? "",
    ends_on: tc?.ends_on ?? "",
  };
}

export default function CourseSettingsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const [draft, setDraft] = useState<Draft>(toDraft(undefined));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canonical = toDraft(tc);
  const dirty = !!tc && (
    draft.starts_on !== canonical.starts_on ||
    draft.ends_on !== canonical.ends_on
  );

  // Keep the latest `dirty` in a ref so the sync effect can read it without
  // re-subscribing (which would resync on every keystroke). Initialised false
  // so the very first load always syncs.
  const dirtyRef = useRef(false);

  // Sync draft when the course data loads / refreshes — but ONLY when the user
  // has no unsaved edits, otherwise a background SWR revalidation would silently
  // discard what they've typed. Declared BEFORE the ref-update effect so on the
  // commit where `tc` arrives it reads the *previous* (false) dirty value and
  // performs the initial sync.
  useEffect(() => {
    if (tc && !dirtyRef.current) setDraft(toDraft(tc));
  }, [tc]);

  useEffect(() => { dirtyRef.current = dirty; });

  // ISO date strings (YYYY-MM-DD) compare lexicographically, so a plain string
  // comparison is enough to enforce ends_on >= starts_on.
  const dateRangeError =
    draft.starts_on && draft.ends_on && draft.ends_on < draft.starts_on
      ? "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มสอน"
      : null;

  const canSave =
    dirty &&
    !!draft.starts_on &&
    !!draft.ends_on &&
    !dateRangeError &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    // Send only the fields that actually changed. Empty string clears the date.
    const body: Record<string, string> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach(k => {
      if (draft[k] !== canonical[k]) body[k] = draft[k];
    });
    try {
      await api.patch(`/teaching-courses/${tcId}/settings`, body);
      await mutate(`/teaching-courses/${tcId}`);
      toast.success("บันทึกการตั้งค่ารายวิชาเรียบร้อยแล้ว");
    } catch (e) {
      setErr((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(canonical);
    setErr(null);
  }

  const locked = !!tc?.exported_at;

  return (
    <div>
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/lecturer">รายวิชาที่สอน</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/lecturer/courses/${tcId}`}>
          {tc ? `${tc.code} — ${tc.name_th}` : "…"}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>ตั้งค่ารายวิชา</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title="ตั้งค่ารายวิชา"
        description={tc ? `${tc.code} — ${tc.name_th}` : undefined}
        actions={
          <>
            <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
              <X size={14} />ยกเลิกการแก้ไข
            </Button>
            <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
              <Save size={14} />บันทึก
            </Button>
          </>
        }
      />

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title="รายวิชานี้ถูกล็อกแล้ว"
            description={`เจ้าหน้าที่ได้ส่งออกไฟล์ของรายวิชานี้เมื่อ ${formatExportedAt(tc?.exported_at)} — ไม่สามารถแก้ไข section และจำนวนนักศึกษาได้อีก`}
          />
        </div>
      )}

      <Tabs defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List aria-label="ตั้งค่ารายวิชา">
            <Tabs.Tab id="overview">
              <span className="inline-flex items-center gap-2">
                <LayoutGrid size={14} />ภาพรวม
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sections">
              <span className="inline-flex items-center gap-2">
                <Users size={14} />Sections
                {tc?.sections && (
                  <Chip tone="neutral">{tc.sections.length}</Chip>
                )}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="dates">
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={14} />วันที่
                {dirty && <Chip tone="warn">แก้ค้าง</Chip>}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview" className="pt-4">
          <Panel
            title={<span className="inline-flex items-center gap-2"><Lock size={14} className="text-muted" />ข้อมูลที่แก้ไขไม่ได้</span>}
            description="ข้อมูลจากคณะและระบบ — หากผิด กรุณาแจ้งเจ้าหน้าที่"
            className="mb-4"
          >
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

          <Panel
            title={<span className="inline-flex items-center gap-2"><InfoIcon size={14} className="text-muted" />ข้อมูลอื่น ๆ</span>}
            description="รายการที่ต้องแก้ที่ต้นทาง"
          >
            <ul className="text-sm space-y-2">
              <li>• <b>รหัสวิชา / ชื่อวิชา / หน่วยกิต:</b> มาจากรายวิชาของคณะ ต้องแก้ที่ต้นทาง</li>
              <li>• <b>ตารางเวลา / วันชดเชย:</b> ปกติมาจากการนำเข้า Excel ของเจ้าหน้าที่</li>
            </ul>
          </Panel>
        </Tabs.Panel>

        <Tabs.Panel id="sections" className="pt-4">
          <SectionsPanel
            tcId={tcId}
            sections={tc?.sections ?? []}
            locked={locked}
            allowedKinds={allowedKindsFromTC(tc)}
          />
        </Tabs.Panel>

        <Tabs.Panel id="dates" className="pt-4">
          <Panel
            title="ช่วงเวลาเรียน"
            description="ต้องระบุทั้งสองวัน — ใช้กำหนดขอบเขตของเทอมสำหรับรายวิชานี้"
            className="mb-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldGroup label={<span className="inline-flex items-center gap-1">วันเริ่มสอน <span className="text-danger">*</span></span>}>
                <ThaiDateField
                  value={draft.starts_on}
                  onChange={v => setDraft(d => ({ ...d, starts_on: v }))}
                />
              </FieldGroup>
              <FieldGroup
                label={<span className="inline-flex items-center gap-1">วันสิ้นสุด <span className="text-danger">*</span></span>}
                error={dateRangeError ?? undefined}
              >
                <ThaiDateField
                  value={draft.ends_on}
                  onChange={v => setDraft(d => ({ ...d, ends_on: v }))}
                />
              </FieldGroup>
            </div>
          </Panel>

        </Tabs.Panel>
      </Tabs>

      {err && (
        <div className="mt-4">
          <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={err} />
        </div>
      )}
    </div>
  );
}

function formatExportedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
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
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);

  const sortedSecs = [...sections].sort((a, b) => {
    // regular before special, then by numeric sec_no when possible.
    if (a.track !== b.track) return a.track === "regular" ? -1 : 1;
    const na = Number(a.sec_no), nb = Number(b.sec_no);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.sec_no.localeCompare(b.sec_no);
  });

  return (
    <Panel
      title="Sections และจำนวนนักศึกษาต่อ section"
      description={
        locked
          ? "รายวิชานี้ถูกล็อกหลังส่งออกไฟล์แล้ว — ดูอย่างเดียว"
          : "แก้ไขได้ถึงก่อนเจ้าหน้าที่ส่งออกไฟล์"
      }
      actions={
        !locked && (
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} />เพิ่ม section
          </Button>
        )
      }
      className="mb-4"
      padded={false}
    >
      {sortedSecs.length === 0 ? (
        <EmptyState title="ยังไม่มี section" description={locked ? "" : "กด 'เพิ่ม section' เพื่อเริ่ม"} />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Sec</th>
                <th style={{ width: 140 }}>ประเภท</th>
                <th className="num" style={{ width: 220 }}>จำนวนนักศึกษา</th>
                <th>ตารางเวลา</th>
                {!locked && <th className="actions" style={{ width: 80 }} />}
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
                  onDelete={() => setDeleteTarget(sec)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddSectionModal
        open={addOpen && !locked}
        onClose={() => setAddOpen(false)}
        tcId={tcId}
        existingSecNos={sortedSecs.map(s => s.sec_no)}
      />

      <DeleteSectionModal
        target={deleteTarget}
        tcId={tcId}
        onClose={() => setDeleteTarget(null)}
      />
    </Panel>
  );
}

function SectionEditRow({
  tcId, section, locked, allowedKinds, onDelete,
}: {
  tcId: string;
  section: SectionRow;
  locked: boolean;
  allowedKinds: ("lecture" | "lab")[];
  onDelete: () => void;
}) {
  const [count, setCount] = useState(String(section.num_students));
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  useEffect(() => { setCount(String(section.num_students)); }, [section.num_students]);

  // Empty input is treated as "no change" (not 0). Reject negatives and
  // non-integers.
  const trimmed = count.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const countError =
    parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed))
      ? "จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป"
      : null;
  const dirty = parsed !== null && !countError && parsed !== section.num_students;
  const scheduleRows = section.schedules ?? [];

  async function save() {
    if (!dirty || locked) return;
    setSaving(true);
    try {
      await api.patch(`/teaching-courses/${tcId}/sections/${section.id}`, {
        num_students: Number(count),
      });
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(`บันทึก Sec ${section.sec_no} เรียบร้อยแล้ว`);
    } catch (e) {
      toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td className="tabular font-medium">{section.sec_no}</td>
      <td>
        <Chip tone={section.track === "special" ? "warn" : "brand"}>
          {section.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
        </Chip>
      </td>
      <td className="num">
        <div className="inline-flex flex-col items-end gap-1">
          <div className="inline-flex items-center gap-2">
            <TextInput
              type="number" min={0} max={9999}
              value={count}
              onChange={e => setCount(e.target.value)}
              disabled={locked}
              className="w-24 text-right"
            />
            <span className="text-xs text-muted">คน</span>
          </div>
          {countError && <span className="text-xs text-danger">{countError}</span>}
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2 flex-wrap">
          {scheduleRows.length > 0 ? (
            <ScheduleSummary rows={scheduleRows} />
          ) : (
            <span className="text-xs text-muted italic">ยังไม่กำหนด</span>
          )}
          <Button
            variant="ghost" size="sm"
            onClick={() => setScheduleOpen(true)}
            aria-label={locked ? "ดูตารางเวลา" : "แก้ตารางเวลา"}
          >
            <Clock size={13} />{locked ? "ดู" : "แก้"}
          </Button>
        </div>
      </td>
      {!locked && (
        <td className="actions">
          <div className="inline-flex gap-1">
            <Button
              variant={dirty ? "primary" : "ghost"} size="sm"
              disabled={!dirty || saving} isPending={saving}
              onClick={save}
            >
              <Save size={13} />
            </Button>
            <Button variant="danger-soft" size="sm" onClick={onDelete} aria-label="ลบ section">
              <Trash2 size={13} />
            </Button>
          </div>
        </td>
      )}
      <SectionScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        tcId={tcId}
        section={section}
        locked={locked}
        allowedKinds={allowedKinds}
      />
    </tr>
  );
}

function SectionScheduleModal({
  open, onClose, tcId, section, locked, allowedKinds,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  section: SectionRow;
  locked: boolean;
  allowedKinds: ("lecture" | "lab")[];
}) {
  const [rows, setRows] = useState<SectionScheduleRow[]>(section.schedules ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset draft each time the modal opens or the source data changes.
  useEffect(() => {
    if (open) { setRows(section.schedules ?? []); setErr(null); }
  }, [open, section.schedules]);

  const errors = validateRows(rows);
  const canSave = !locked && !errors.hasBlockingError && !saving;

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

function AddSectionModal({
  open, onClose, tcId, existingSecNos,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  existingSecNos: string[];
}) {
  const [secNo, setSecNo] = useState("");
  const [track, setTrack] = useState<"regular" | "special">("regular");
  const [count, setCount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setSecNo(""); setTrack("regular"); setCount("0"); setErr(null); }
  }, [open]);

  const duplicate = secNo.trim() !== "" && existingSecNos.includes(secNo.trim());
  const canSave = secNo.trim() !== "" && !duplicate && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/teaching-courses/${tcId}/sections`, {
        sec_no: secNo.trim(),
        track,
        num_students: Number(count) || 0,
      });
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(`เพิ่ม Sec ${secNo.trim()} เรียบร้อยแล้ว`);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "เพิ่มไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Plus size={18} />เพิ่ม Section</span>}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
            <Plus size={14} />เพิ่ม
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
          <FieldGroup label="ประเภท">
            <div className="flex gap-2">
              <Button
                variant={track === "regular" ? "primary" : "ghost"} size="sm"
                onClick={() => setTrack("regular")}
              >
                ภาคปกติ
              </Button>
              <Button
                variant={track === "special" ? "primary" : "ghost"} size="sm"
                onClick={() => setTrack("special")}
              >
                ภาคพิเศษ
              </Button>
            </div>
          </FieldGroup>
        </div>
        <FieldGroup label="จำนวนนักศึกษา (ไม่บังคับ)">
          <TextInput
            type="number" min={0} max={9999}
            value={count}
            onChange={e => setCount(e.target.value)}
            className="max-w-[140px]"
          />
        </FieldGroup>
        {duplicate && (
          <Alert
            status="warning"
            icon={<CircleAlert size={16} />}
            title={`เลข Section ${secNo.trim()} มีอยู่แล้ว`}
            description="กรุณาใช้เลขอื่นที่ยังไม่มีในรายวิชานี้"
          />
        )}
        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title="เพิ่มไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}

function DeleteSectionModal({
  target, tcId, onClose,
}: {
  target: SectionRow | null;
  tcId: string;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (target) setErr(null); }, [target]);

  async function doDelete() {
    if (!target) return;
    setSaving(true);
    setErr(null);
    try {
      await api.del(`/teaching-courses/${tcId}/sections/${target.id}`);
      await mutate(`/teaching-courses/${tcId}`);
      toast.success(`ลบ Sec ${target.sec_no} เรียบร้อยแล้ว`);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="ยืนยันลบ section"
      icon={<Trash2 size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="danger" onClick={doDelete} isPending={saving}>
            <Trash2 size={14} />ลบ
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm">
          กำลังจะลบ <b>Sec {target?.sec_no}</b> ({target?.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"})
          — การลบนี้ไม่สามารถย้อนกลับได้
        </div>
        <div className="text-xs text-muted">
          ถ้ามีคำขอ TA หรือรายงานที่อ้างอิง section นี้อยู่แล้ว การลบจะไม่สำเร็จ
        </div>
        {err && <Alert status="danger" icon={<CircleAlert size={16} />} title="ลบไม่สำเร็จ" description={err} />}
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
      <DatePicker aria-label="date" value={dv} onChange={v => onChange(v ? v.toString() : "")}>
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
