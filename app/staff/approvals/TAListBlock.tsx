"use client";
import { AlertTriangle, BookOpenCheck, CalendarCheck2, FileCheck2 } from "lucide-react";
import { Chip } from "../../components/ui";

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
  warnings: string[];
}

interface RequestDetail {
  assignments: AssignmentDetail[] | null;
}

const LEVEL_LABEL: Record<string, string> = { undergrad: "ป.ตรี", master: "ป.โท", phd: "ป.เอก" };

export function TAListBlock({ detail }: { detail: RequestDetail }) {
  const list = detail.assignments ?? [];
  if (list.length === 0) {
    return <div className="text-xs text-(--ink-3) italic">ไม่มีข้อมูล TA</div>;
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
  const blocked = a.warnings.length > 0;
  const overLimit = a.approved_course_count >= 3;
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
        <Chip tone={a.level === "undergrad" ? "neutral" : "brand"}>{LEVEL_LABEL[a.level] ?? a.level}</Chip>
        <Chip tone="neutral">{a.total_hrs.toFixed(1)} ชม./สัปดาห์</Chip>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <StatusBadge
          ok={a.profile_status === "approved"}
          icon={<FileCheck2 size={10} />}
          okText="เอกสารผ่านแล้ว"
          badText="เอกสารยังไม่ผ่าน"
        />
        <StatusBadge
          ok={a.has_schedule}
          icon={<CalendarCheck2 size={10} />}
          okText="บันทึกตารางเรียนแล้ว"
          badText="ยังไม่บันทึกตารางเรียน"
        />
        <span className={
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
          (overLimit
            ? "bg-red-50 text-red-700 border-red-200 font-medium"
            : "bg-slate-50 text-slate-600 border-slate-200")
        }>
          <BookOpenCheck size={10} /> เป็น TA แล้ว {a.approved_course_count}/3 วิชา
        </span>
      </div>

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
