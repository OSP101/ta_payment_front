"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AlertCircle, Eye, Ban, Pencil } from "lucide-react";
import { Tooltip, Button } from "@heroui/react";
import { Chip, Modal, ConfirmDialog } from "../components/ui";
import { DataTable, type DataColumn } from "../components/DataTable";
import { Skel, SkelList } from "../components/Skeletons";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { msg, useI18n, type TFn } from "../lib/i18n/client";

export interface TARequestRow {
  id: string;
  course_code: string;
  course_name: string;
  teaching_course_id?: string;
  status: string;
  reject_reason?: string;
  submitted_at?: string;
  decided_at?: string;
  ta_count?: number;
  /** Who the request is for — one TA per request since each TA is decided on
   * their own; several names only on older rows. */
  ta_names?: string;
  is_late?: boolean;
  /** Sections whose sessions partly clash with the TA's own timetable. */
  trimmed_count?: number;
  /** Sections the TA lost entirely for the same reason. */
  dropped_count?: number;
  /** Server's own verdict on whether Cancel would currently succeed. */
  can_cancel?: boolean;
  /** The officer who filed it for the lecturer; absent when the lecturer did. */
  submitted_by_name?: string;
}

/** One row of /ta-requests/:id — who was actually sent in this round. */
interface RequestAssignmentDetail {
  section_no: string;
  ta_id?: string;
  student_id?: string;
  workload?: RequestWorkload | null;
  ta_name: string;
  email: string;
  level: string;
  total_hrs: number;
  state: string;
  state_reason?: string;
}
type RequestWorkload = Partial<Record<
  "help_teach_hrs" | "prep_hrs" | "grade_hrs" | "other_hrs" | "check_work_hrs" |
  "attendance_hrs" | "ug_other_hrs" | "lab_hrs" | "lab_other_hrs", number> & Record<
  "help_teach_desc" | "prep_desc" | "grade_desc" | "other_desc" | "ug_other_desc" | "lab_other_desc", string>>;

interface RequestDetail extends TARequestRow {
  lecturer_name?: string;
  academic_year?: number;
  semester?: number;
  reimburse_scope: string;
  assignments: RequestAssignmentDetail[] | null;
}

const STATUS_MAP: Record<string, { tone: "success" | "warn" | "danger" | "info" | "neutral"; label: string }> = {
  approved:  { tone: "success", label: msg("อนุมัติแล้ว") },
  submitted: { tone: "info",    label: msg("รอ TA บันทึกตารางเรียน") },
  pending:   { tone: "warn",    label: msg("รอดำเนินการ") },
  draft:     { tone: "neutral", label: msg("ฉบับร่าง") },
  rejected:  { tone: "danger",  label: msg("ปฏิเสธ@status") },
  cancelled: { tone: "neutral", label: msg("ยกเลิก@status") },
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([k, v]) => [k, v.label]),
);

export function RequestStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  const m = STATUS_MAP[status] ?? { tone: "neutral" as const, label: status };
  return <Chip tone={m.tone}>{t(m.label)}</Chip>;
}

function thDate(iso: string | undefined, intl: string): string {
  return iso
    ? new Date(iso).toLocaleDateString(intl, { day: "numeric", month: "short", year: "numeric" })
    : "-";
}

function buildColumns(
  t: TFn,
  intl: string,
  onDetail: (id: string) => void,
  onCancel: (id: string) => void,
  onEdit?: (id: string) => void,
): DataColumn<TARequestRow>[] { return [
  {
    id: "submitted_at", width: 150, label: t("วันที่ยื่นคำขอ"), sortable: true, isRowHeader: true,
    sortValue: r => r.submitted_at ?? "",
    className: "whitespace-nowrap",
    render: r => (
      <span className="inline-flex flex-col">
        <span>{thDate(r.submitted_at, intl)}</span>
        {r.submitted_by_name && (
          <span className="text-xs text-muted">{t("ส่งแทนโดย {name}", { name: r.submitted_by_name })}</span>
        )}
      </span>
    ),
  },
  {
    // Each row is one TA's own verdict, so the name is what tells rows apart.
    id: "ta_names", width: 200, label: t("ผู้ช่วยสอน"), sortable: true,
    sortValue: r => r.ta_names ?? "",
    render: r => r.ta_names
      ? <span className="text-ink-1">{r.ta_names}</span>
      : <Chip tone="brand">{t("{n} คน", { n: r.ta_count ?? 0 })}</Chip>,
  },
  {
    id: "status", width: 150, label: t("สถานะ"), sortable: true,
    sortValue: r => (STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status),
    render: r => (
      <div className="flex flex-wrap items-center gap-1.5">
        <RequestStatusChip status={r.status} />
        {/* การส่งมี 2 แบบเท่านั้น — ทันเวลา หรือ ช้า (ช้า = เบิกจ่ายช้าตาม) */}
        {r.is_late
          ? <Chip tone="warn">{t("ส่งช้า")}</Chip>
          : <Chip tone="success">{t("ส่งทันเวลา")}</Chip>}
        {/* "อนุมัติแล้ว" on its own would hide the fact that the TA's own
            timetable removed some sessions. Say it on the row. */}
        {(r.trimmed_count ?? 0) > 0 && (
          <Chip tone="warn">{t("ตัดบางคาบ {n} กลุ่ม", { n: r.trimmed_count })}</Chip>
        )}
        {(r.dropped_count ?? 0) > 0 && (
          <Chip tone="danger">{t("ตัดออก {n} กลุ่ม", { n: r.dropped_count })}</Chip>
        )}
      </div>
    ),
  },
  {
    id: "decided_at", width: 150, label: t("วันที่พิจารณา"),
    className: "whitespace-nowrap text-muted",
    render: r => thDate(r.decided_at, intl),
  },
  {
    id: "reason", width: 260, label: t("หมายเหตุ"),
    className: "w-16 text-center",
    render: r => r.reject_reason
      ? (
        <Tooltip delay={0}>
          <Button
            isIconOnly
            variant="tertiary"
            size="sm"
            aria-label={t("ดูเหตุผล")}
            className="text-danger-soft-foreground hover:bg-red-50"
          >
            <AlertCircle size={16} />
          </Button>
          <Tooltip.Content className="max-w-xs text-xs whitespace-pre-line">
            {r.reject_reason}
          </Tooltip.Content>
        </Tooltip>
      )
      : <span className="text-xs text-muted">-</span>,
  },
  {
    id: "actions", width: 90, label: "", className: "w-20 text-center",
    render: r => (
      <div className="flex items-center justify-center gap-1">
        <Tooltip delay={0}>
          <Button
            isIconOnly variant="tertiary" size="sm" aria-label={t("ดูรายละเอียด")}
            onPress={() => onDetail(r.id)}
          >
            <Eye size={16} />
          </Button>
          <Tooltip.Content className="text-xs">{t("ดูรายละเอียด ใครถูกส่งไปในรอบนี้บ้าง")}</Tooltip.Content>
        </Tooltip>
        {r.can_cancel && (r.ta_count ?? 1) === 1 && onEdit && (
          <Tooltip delay={0}>
            <Button isIconOnly variant="tertiary" size="sm" aria-label={t("แก้ไขคำขอ")} onPress={() => onEdit(r.id)}><Pencil size={16} /></Button>
            <Tooltip.Content className="text-xs">{t("แก้ไขคำขอ")}</Tooltip.Content>
          </Tooltip>
        )}
        {r.can_cancel && (
          <Tooltip delay={0}>
            <Button
              isIconOnly variant="tertiary" size="sm" aria-label={t("ยกเลิกคำขอ")}
              className="text-danger-soft-foreground hover:bg-red-50"
              onPress={() => onCancel(r.id)}
            >
              <Ban size={16} />
            </Button>
            <Tooltip.Content className="text-xs">{t("ยกเลิกคำขอนี้")}</Tooltip.Content>
          </Tooltip>
        )}
      </div>
    ),
  },
]; }

const LEVEL_LABEL: Record<string, string> = {
  undergrad: msg("ปริญญาตรี"), master: msg("ปริญญาโท"), phd: msg("ปริญญาเอก"),
};

const STATE_LABEL: Record<string, { tone: "success" | "warn" | "danger"; label: string }> = {
  active:  { tone: "success", label: msg("ทำงานได้ตามปกติ") },
  trimmed: { tone: "warn",    label: msg("ตัดบางคาบ") },
  dropped: { tone: "danger",  label: msg("ตัดออกทั้งกลุ่ม") },
};

/** One TA plus every section they were sent on, grouped from the flat per-section rows. */
interface GroupedAssignment {
  ta_name: string;
  email: string;
  level: string;
  student_id?: string;
  sections: RequestAssignmentDetail[];
}

/** The API returns one row per (TA, section) — group by TA so a person who
 * covers several sections shows up once, with their sections listed inside,
 * instead of repeating their name once per section. */
function groupByTa(list: RequestAssignmentDetail[]): GroupedAssignment[] {
  const byEmail = new Map<string, GroupedAssignment>();
  for (const a of list) {
    const key = a.ta_id || a.email || a.ta_name;
    const g = byEmail.get(key);
    if (g) g.sections.push(a);
    else byEmail.set(key, { ta_name: a.ta_name, email: a.email, level: a.level, student_id: a.student_id, sections: [a] });
  }
  return [...byEmail.values()];
}

const WORKLOAD_ITEMS = [
  ["help_teach_hrs", "help_teach_desc", msg("ช่วยสอน")],
  ["grade_hrs", "grade_desc", msg("ตรวจการบ้าน")],
  ["prep_hrs", "prep_desc", msg("เตรียมการสอน")],
  ["other_hrs", "other_desc", msg("อื่น ๆ ระบุ")],
  ["check_work_hrs", null, msg("ช่วยตรวจงาน")],
  ["attendance_hrs", null, msg("เช็คชื่อ / เก็บใบงาน")],
  ["ug_other_hrs", "ug_other_desc", msg("อื่น ๆ (บรรยาย)")],
  ["lab_hrs", null, msg("สอนปฏิบัติการ")],
  ["lab_other_hrs", "lab_other_desc", msg("อื่น ๆ (ปฏิบัติการ)")],
] as const;

function WorkloadDetail({ workload }: { workload?: RequestWorkload | null }) {
  const { t, intl } = useI18n();
  if (!workload) return <p className="mt-2 text-xs text-muted">{t("ไม่มีข้อมูลภาระงานที่บันทึกไว้")}</p>;
  const items = WORKLOAD_ITEMS.filter(([hours, desc]) => (workload[hours] ?? 0) > 0 || (desc && workload[desc]?.trim()));
  if (!items.length) return <p className="mt-2 text-xs text-muted">{t("ไม่ได้ระบุภาระงาน")}</p>;
  return (
    <dl className="mt-3 divide-y divide-hairline">
      {items.map(([hours, desc, label]) => (
        <div key={hours} className="py-2 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-ink-2">{t(label)}</dt>
            <dd className="shrink-0 tabular-nums text-ink-1">{t("{hrs} ชม./สัปดาห์", { hrs: (workload[hours] ?? 0).toLocaleString(intl, { maximumFractionDigits: 2 }) })}</dd>
          </div>
          {desc && workload[desc] && <dd className="mt-1 whitespace-pre-wrap break-words text-muted">{workload[desc]}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Who was actually sent in this round — opened from the history table. */
function RequestDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, intl } = useI18n();
  const { data: d, error, mutate: reload } = useSWR<RequestDetail>(id ? `/ta-requests/${id}` : null);
  const grouped = d?.assignments?.length ? groupByTa(d.assignments) : [];
  return (
    <Modal open={!!id} onClose={onClose} title={t("รายละเอียดคำขอ")} icon={<Eye size={18} />} size="xl">
      {error ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>{t("โหลดรายละเอียดคำขอไม่สำเร็จ")}</p>
          <Button variant="secondary" onPress={() => { void reload(); }}>{t("ลองอีกครั้ง")}</Button>
        </div>
      ) : !d ? (
        // Shaped like the loaded body: status line, then one card per TA.
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Skel className="h-6 w-20 rounded-full" />
            <Skel className="h-3.5 w-28" />
          </div>
          <SkelList items={2} icon={false} bordered />
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestStatusChip status={d.status} />
            <Chip tone={d.is_late ? "warn" : "success"}>{t(d.is_late ? "ส่งช้า" : "ส่งทันเวลา")}</Chip>
          </div>
          <section className="space-y-3 border-b border-hairline pb-4">
            <h3 className="font-semibold text-ink-1 break-words">{d.course_code} {d.course_name}</h3>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                [t("อาจารย์ผู้ยื่นคำขอ"), d.lecturer_name || "-"],
                ...(d.submitted_by_name ? [[t("ส่งแทนโดย"), d.submitted_by_name]] : []),
                [t("ปีการศึกษา / ภาคเรียน"), d.academic_year && d.semester ? `${d.academic_year} / ${d.semester}` : "-"],
                [t("วันที่ยื่นคำขอ"), thDate(d.submitted_at, intl)],
                [t("วันที่พิจารณา"), thDate(d.decided_at, intl)],
                [t("ประเภทที่ขอเบิก"), t(({ lecture: msg("บรรยาย"), lab: msg("ปฏิบัติการ"), both: msg("บรรยายและปฏิบัติการ") } as Record<string, string>)[d.reimburse_scope] ?? d.reimburse_scope)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 break-words text-ink-1">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <h3 className="font-semibold text-ink-1">{t("ภาระงานที่ระบุในคำขอ")}</h3>
          {d.reject_reason && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 whitespace-pre-line">
              {d.reject_reason}
            </div>
          )}
          {!grouped.length ? (
            <div className="text-xs text-muted text-center py-6">{t("ไม่มีรายชื่อ TA ในคำขอนี้")}</div>
          ) : (
            <ul className="space-y-2">
              {grouped.map((g, i) => (
                <li key={i} className="rounded-lg border border-hairline p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-ink-1">{g.ta_name}</div>
                    <Chip tone="neutral">{LEVEL_LABEL[g.level] ? t(LEVEL_LABEL[g.level]) : g.level}</Chip>
                  </div>
                  <div className="text-xs text-muted mt-0.5 break-words">{g.email}</div>
                  {g.student_id && <div className="mt-1 text-xs text-muted">{t("รหัสนักศึกษา")}: {g.student_id}</div>}
                  <ul className="mt-3 divide-y divide-hairline">
                    {g.sections.map((a, j) => {
                      const st = STATE_LABEL[a.state];
                      return (
                        <li key={j} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-ink-2">
                              {t("กลุ่ม {sec} · {hrs} ชม./สัปดาห์", { sec: a.section_no, hrs: a.total_hrs.toFixed(1) })}
                            </span>
                            {st && <Chip tone={st.tone}>{t(st.label)}</Chip>}
                          </div>
                          <WorkloadDetail workload={a.workload} />
                          {a.state_reason && (
                            <div className="text-xs text-amber-700 mt-1">{a.state_reason}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function RequestsTable({
  rows, loading, onEdit, emptyDescription = msg("เริ่มจากปุ่ม 'ส่งคำขอ TA'"),
}: {
  rows: TARequestRow[] | undefined;
  loading?: boolean;
  onEdit?: (id: string) => void;
  emptyDescription?: string;
}) {
  const { t, intl } = useI18n();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function doCancel() {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await api.post(`/ta-requests/${cancelId}/cancel`);
      notify.success(t("ยกเลิกคำขอเรียบร้อยแล้ว"));
      mutate("/ta-requests");
      mutate(`/ta-requests/${cancelId}`);
      // Cancelling frees the TA's slot on this course — the candidates list
      // (already_in_course/at_quota) is keyed by teaching_course_id, which
      // this table doesn't know, so match every candidates key rather than
      // one. Otherwise the picker keeps showing the TA as blocked until some
      // unrelated fetch happens to revalidate it.
      mutate(key => typeof key === "string" && key.startsWith("/ta-requests/candidates"));
      setCancelId(null);
    } catch (e) {
      notify.error(e);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <DataTable
        ariaLabel={t("ประวัติคำขอ TA")}
        rows={rows}
        loading={loading}
        rowKey={r => r.id}
        searchFn={r => `${r.ta_names ?? ""} ${STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status} ${r.reject_reason ?? ""}`}
        searchPlaceholder={t("ค้นหาชื่อ TA / สถานะ / เหตุผล…")}
        filters={[{
          id: "status",
          placeholder: t("ทุกสถานะ"),
          // Derive from the full STATUS_MAP so every status (incl. cancelled /
          // pending) is filterable — not just a hardcoded subset.
          options: [
            { id: "", label: t("ทุกสถานะ") },
            ...Object.entries(STATUS_MAP).map(([id, v]) => ({ id, label: t(v.label) })),
          ],
          predicate: (r, v) => r.status === v,
        }]}
        initialSort={{ column: "submitted_at", direction: "descending" }}
        pageSize={10}
        emptyTitle={t("ยังไม่มีคำขอ")}
        emptyDescription={t(emptyDescription)}
        columns={buildColumns(t, intl, setDetailId, setCancelId, onEdit)}
      />
      <RequestDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={!!cancelId}
        onClose={() => { if (!cancelling) setCancelId(null); }}
        onConfirm={doCancel}
        title={t("ยกเลิกคำขอ TA นี้?")}
        message={t("โควตาของ TA ในคำขอนี้จะถูกคืน และคำขอนี้จะยกเลิกถาวร (TA คนอื่นที่ส่งพร้อมกันไม่ถูกยกเลิกด้วย) หากต้องการ TA คนเดิมอีกครั้ง ต้องส่งคำขอใหม่")}
        confirmLabel={t("ยืนยันยกเลิก")}
        danger
        isPending={cancelling}
      />
    </>
  );
}
