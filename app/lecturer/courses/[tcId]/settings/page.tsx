"use client";
import { use, useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "@/app/lib/toast";
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
import { courseCodeLabel } from "../../../../lib/courseCode";
import { Skel, SkelValue } from "../../../../components/Skeletons";
import { useI18n, type TFn } from "../../../../lib/i18n/client";

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
function lockReason(sec: SectionRow, courseLocked: boolean, t: TFn, intl: string): string | null {
  if (courseLocked) return t("รายวิชานี้ถูกส่งออกแล้ว แก้ไขไม่ได้");
  if (sec.schedule_set_by_lecturer_at) {
    return t("คุณกำหนดตารางเวลาของกลุ่มนี้ไปแล้วเมื่อ {date} กำหนดได้ครั้งเดียว หากต้องแก้ไขกรุณาแจ้งเจ้าหน้าที่", { date: formatThaiDate(sec.schedule_set_by_lecturer_at, intl) });
  }
  if ((sec.schedules ?? []).length > 0) {
    return t("ตารางเวลาของกลุ่มนี้มาจากไฟล์ที่เจ้าหน้าที่นำเข้า แก้ไขได้เฉพาะเจ้าหน้าที่");
  }
  return null;
}

interface TC {
  id: string;
  code: string;
  alt_codes?: string[];
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
  const { t, intl } = useI18n();
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);

  const locked = !!tc?.exported_at;

  return (
    <div>
      <PageHeader
        title={t("ตั้งค่ารายวิชา")}
        // A non-breaking space holds the description's line while loading, so
        // the whole page doesn't shift down when the course name lands.
        description={tc ? `${courseCodeLabel(tc)} — ${tc.name_th}` : "\u00a0"}
      />

      {locked && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title={t("รายวิชานี้ถูกล็อกแล้ว")}
            description={t("เจ้าหน้าที่ได้ส่งออกไฟล์ของรายวิชานี้เมื่อ {when} ไม่สามารถแก้ไข section ได้อีก", { when: formatExportedAt(tc?.exported_at, intl) })}
          />
        </div>
      )}

      {/* No tabs. The timetable editor lives behind the "แก้" button of each
          section row, and a WBA course (registrar sent no timetable) is exactly
          the case where the lecturer arrives here *looking* for it — burying
          that row under a second tab hid the one thing the page is for. */}
      <Panel title={t("ข้อมูลรายวิชา")} className="mb-4" data-tour="set-info">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* "—" means "the file has no value"; while loading it would be a
              false claim, so each value waits as a placeholder instead. */}
          <ReadOnly label={t("รหัสวิชา")} value={tc ? courseCodeLabel(tc) : <SkelValue className="h-4 w-20" />} tabular />
          <ReadOnly label={t("ชื่อวิชา")} value={tc ? tc.name_th : <SkelValue className="h-4 w-56" />} span={3} />
          <ReadOnly label={t("นักศึกษาทั้งหมด")} value={tc ? t("{n} คน", { n: tc.num_students }) : <SkelValue className="h-4 w-14" />} />
          <ReadOnly label={t("ภาคปกติ")} value={tc ? t("{n} คน", { n: tc.num_students_regular }) : <SkelValue className="h-4 w-14" />} />
          <ReadOnly label={t("ภาคพิเศษ")} value={tc ? t("{n} คน", { n: tc.num_students_special }) : <SkelValue className="h-4 w-14" />} />
          <ReadOnly
            label={t("จำนวน Section")}
            value={!tc ? <SkelValue className="h-4 w-14" /> : tc.sections ? `${tc.sections.length} sec` : "—"}
          />
        </div>
      </Panel>

      <SectionsPanel
        tcId={tcId}
        sections={tc ? tc.sections ?? [] : undefined}
        locked={locked}
        allowedKinds={allowedKindsFromTC(tc)}
      />
    </div>
  );
}

function formatExportedAt(iso: string | undefined, intl: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" });
}

function formatThaiDate(iso: string, intl: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(intl, { dateStyle: "medium" });
}

/* -------------------------------------------------------------------------- */
/* Sections editor                                                            */
/* -------------------------------------------------------------------------- */

function SectionsPanel({
  tcId, sections, locked, allowedKinds,
}: {
  tcId: string;
  /** undefined while the course is loading — distinct from "no sections". */
  sections: SectionRow[] | undefined;
  locked: boolean;
  allowedKinds: ("lecture" | "lab")[];
}) {
  const { t, intl } = useI18n();
  const sortedSecs = [...(sections ?? [])].sort((a, b) => {
    // regular before special, then by numeric sec_no when possible.
    if (a.track !== b.track) return a.track === "regular" ? -1 : 1;
    const na = Number(a.sec_no), nb = Number(b.sec_no);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.sec_no.localeCompare(b.sec_no);
  });

  // Sections still waiting on the lecturer — the only thing on this page they
  // can act on, so it is worth saying out loud rather than making them scan
  // the table for "ยังไม่กำหนด".
  const openSecs = locked ? [] : sortedSecs.filter(s => lockReason(s, locked, t, intl) === null);

  return (
    <Panel
      title={t("Sections และตารางเวลา")}
      data-tour="set-sections"
      description={
        locked
          ? t("รายวิชานี้ถูกล็อกหลังส่งออกไฟล์แล้ว ดูอย่างเดียว")
          : t("รายชื่อ section และจำนวนนักศึกษามาจากไฟล์ทะเบียนที่เจ้าหน้าที่นำเข้า เพิ่ม แก้ไข หรือลบได้เฉพาะเจ้าหน้าที่")
      }
      className="mb-4"
      padded={false}
    >
      {openSecs.length > 0 && (
        <div className="px-4 pt-4">
          <Alert
            status="warning"
            icon={<TriangleAlert size={16} />}
            title={t("มี {n} กลุ่มที่ยังไม่มีตารางเวลา Sec {secs}", { n: openSecs.length, secs: openSecs.map(s => s.sec_no).join(", ") })}
            description={t("ไฟล์ทะเบียนไม่ได้ระบุวัน–เวลาเรียนไว้ คุณกรอกเองได้ กลุ่มละครั้งเดียว หลังจากนั้นการแก้ไขจะเป็นหน้าที่ของเจ้าหน้าที่ (ส่งคำขอ TA ไม่ได้จนกว่าจะกรอกครบ)")}
          />
        </div>
      )}

      {sections !== undefined && sortedSecs.length === 0 ? (
        <EmptyState
          title={t("ยังไม่มี section")}
          description={t("เจ้าหน้าที่เป็นผู้เพิ่ม section จากไฟล์ทะเบียน")}
        />
      ) : (
        <div className="overflow-x-auto">
          {/* A phone cannot hold four columns of Thai without breaking every
              cell onto its own set of lines. Given a floor the container
              scrolls and the rows stay readable. */}
          <table className="data-table w-full min-w-[620px] sm:min-w-0">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Sec</th>
                <th style={{ width: 140 }}>{t("ประเภท")}</th>
                <th className="num" style={{ width: 220 }}>{t("จำนวนนักศึกษา")}</th>
                <th>{t("ตารางเวลา")}</th>
                <th className="actions" style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {/* Header is fixed chrome; only the rows wait for the course. */}
              {sections === undefined && [0, 1, 2].map(i => (
                <tr key={i} aria-hidden>
                  <td><Skel className="h-4 w-8" /></td>
                  <td><Skel className="h-6 w-20 rounded-full" /></td>
                  <td className="num"><Skel className="ml-auto h-4 w-12" /></td>
                  <td><Skel className="h-4 w-48" /></td>
                  <td className="actions"><Skel className="ml-auto h-8 w-24 rounded-lg" /></td>
                </tr>
              ))}
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
  const { t, intl } = useI18n();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleRows = section.schedules ?? [];
  const reason = lockReason(section, locked, t, intl);
  const readOnly = reason !== null;

  return (
    <tr>
      <td className="tabular font-medium">{section.sec_no}</td>
      <td>
        <Chip tone={section.track === "special" ? "warn" : "brand"}>
          {section.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")}
        </Chip>
      </td>
      <td className="num">
        <span className="tabular">{section.num_students}</span>
        <span className="text-xs text-muted ml-1">{t("คน")}</span>
      </td>
      <td>
        {scheduleRows.length > 0 ? (
          <ScheduleSummary rows={scheduleRows} />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warning-soft-foreground">
            <TriangleAlert size={13} />{t("ยังไม่กำหนด")}
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
            ? <><Eye size={13} />{t("ดูตารางเวลา")}</>
            : <><Clock size={13} />{t("กำหนดตารางเวลา")}</>}
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
  const { t } = useI18n();
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
      toast.success(t("บันทึกตารางเวลา Sec {sec} เรียบร้อยแล้ว", { sec: section.sec_no }));
      onClose();
    } catch (e) {
      setErr((e as Error).message || t("บันทึกไม่สำเร็จ"));
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
          {t("ตารางเวลา Sec {sec}", { sec: section.sec_no })}
          <Chip tone={section.track === "special" ? "warn" : "brand"}>
            {section.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")}
          </Chip>
        </span>
      }
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ปิด")}</Button>
          {!locked && (
            <Button variant="primary" onClick={save} disabled={!canSave} isPending={saving}>
              <Save size={14} />{t("บันทึก")}
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
            title={t("ดูอย่างเดียว")}
            description={lockReason}
          />
        ) : (
          <Alert
            status="warning"
            icon={<TriangleAlert size={16} />}
            title={t("กำหนดได้ครั้งเดียว")}
            description={t("หลังกดบันทึก ตารางเวลาของกลุ่มนี้จะแก้ไขได้เฉพาะเจ้าหน้าที่ ตรวจวัน เวลา และประเภทคาบให้ครบถูกต้องก่อนบันทึก")}
          />
        )}
        <div className="text-xs text-muted">
          {t("กำหนดวัน–เวลาเรียนของ section นี้ให้ครบทุกคาบ (ทั้งบรรยายและปฏิบัติการ) ระบบใช้ข้อมูลนี้เพื่อเช็คว่า TA ที่เลือกไว้ไม่ติดเวลาเรียนอื่น")}
        </div>
        <SectionScheduleEditor
          value={rows}
          onChange={setRows}
          disabled={locked}
          allowedKinds={allowedKinds}
        />
        {err && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={err} />
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

