"use client";
import { AlertTriangle, BookOpenCheck, CalendarCheck2, CalendarClock, FileCheck2 } from "lucide-react";
import { Chip } from "../../components/ui";
import { msg, useI18n } from "../../lib/i18n/client";

interface AssignmentDetail {
  section_no: string;
  ta_id: string;
  ta_name: string;
  email: string;
  student_id?: string;
  level: string;
  total_hrs: number;
  profile_status: string;
  has_schedule: boolean;
  approved_course_count: number;
  /** Per-term course cap from ตั้งค่า (pay_rates.max_courses_per_student). */
  course_cap?: number;
  warnings: string[];
  /** 'active' | 'trimmed' | 'dropped' — outcome of the deferred decision. */
  state?: string;
  /** Why sessions were trimmed or the section dropped, in Thai. */
  state_reason?: string;
}

interface RequestDetail {
  assignments: AssignmentDetail[] | null;
}

const LEVEL_LABEL: Record<string, string> = { undergrad: msg("ป.ตรี"), master: msg("ป.โท"), phd: msg("ป.เอก") };

export function TAListBlock({ detail }: { detail: RequestDetail }) {
  const { t } = useI18n();
  const list = detail.assignments ?? [];
  if (list.length === 0) {
    return <div className="text-xs text-(--ink-3) italic">{t("ไม่มีข้อมูล TA")}</div>;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {list.map((a, i) => (
        <TaCard key={`${a.ta_id}-${a.section_no}-${i}`} a={a} />
      ))}
    </div>
  );
}

function TaCard({ a }: { a: AssignmentDetail }) {
  const { t } = useI18n();
  const blocked = a.warnings.length > 0;
  const cap = a.course_cap ?? 3;
  const overLimit = a.approved_course_count >= cap;
  return (
    <div className={
      "rounded-lg border px-3 py-2.5 " +
      (blocked ? "border-red-200 bg-red-50/40" : "border-(--hairline) bg-white")
    }>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{a.ta_name}</span>
        <span className="text-xs text-(--ink-3)">{a.email}{a.student_id ? ` · ${a.student_id}` : ""}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Chip tone="neutral">Sec {a.section_no}</Chip>
        <Chip tone={a.level === "undergrad" ? "neutral" : "brand"}>{LEVEL_LABEL[a.level] ? t(LEVEL_LABEL[a.level]) : a.level}</Chip>
        <Chip tone="neutral">{t("{n} ชม./สัปดาห์", { n: a.total_hrs.toFixed(1) })}</Chip>
        {/* An approved request can still hide a section the TA cannot fully
            cover. Say so on the row itself — otherwise the only visible signal
            is a green verdict. */}
        {a.state === "trimmed" && <Chip tone="warn">{t("ตัดบางคาบ")}</Chip>}
        {a.state === "dropped" && <Chip tone="danger">{t("ตัดออกทั้งกลุ่ม")}</Chip>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <StatusBadge
          ok={a.profile_status === "approved"}
          icon={<FileCheck2 size={10} />}
          okText={t("เอกสารผ่านแล้ว")}
          badText={t("เอกสารยังไม่ผ่าน")}
        />
        <StatusBadge
          ok={a.has_schedule}
          icon={<CalendarCheck2 size={10} />}
          okText={t("บันทึกตารางเรียนแล้ว")}
          badText={t("ยังไม่บันทึกตารางเรียน")}
        />
        <span className={
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
          (overLimit
            ? "bg-red-50 text-red-700 border-red-200 font-medium"
            : "bg-slate-50 text-slate-600 border-slate-200")
        }>
          <BookOpenCheck size={10} /> {t("เป็น TA แล้ว {n}/{cap} วิชา", { n: a.approved_course_count, cap })}
        </span>
      </div>

      {a.state_reason && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-900">
          <CalendarClock size={11} className="mt-0.5 shrink-0" />
          {/* Multi-line since the reason now names each clashing session. */}
          <span className="whitespace-pre-line">{a.state_reason}</span>
        </div>
      )}

      {blocked && (
        <ul className="mt-2 space-y-1">
          {a.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-red-700">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ ok, icon, okText, badText }: {
  ok: boolean; icon: React.ReactNode; okText: string; badText: string;
}) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
      (ok
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-700 border-red-200 font-medium")
    }>
      {icon} {ok ? okText : badText}
    </span>
  );
}
