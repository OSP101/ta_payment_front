"use client";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, ChevronDown, Users, BookOpenCheck, FileCheck2, CalendarCheck2,
  ShieldCheck, ShieldAlert, ClipboardList,
} from "lucide-react";
import { Accordion } from "@heroui/react";
import { type Term } from "../../lib/api";
import {
  PageHeader, Panel, Chip, SearchField, SelectField,
} from "../../components/ui";
import { ChecksBlock } from "./ChecksBlock";
import { TAListBlock } from "./TAListBlock";

interface DecisionCheck {
  rule: string;
  ta?: string;
  passed: boolean;
  message: string;
}

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

interface RequestSummary {
  id: string;
  course_code: string;
  course_name: string;
  status: string;
  submitted_at?: string;
  decided_at?: string;
  decided_by?: string | null;
  reject_reason?: string;
  teaching_course_id: string;
  lecturer_name: string;
  ta_count: number;
  term_id: string;
  academic_year: number;
  semester: number;
  decision_checks: DecisionCheck[];
}

interface RequestDetail extends RequestSummary {
  reimburse_scope: string;
  counts: { section_no: string; undergrad_count: number; graduate_count: number }[] | null;
  assignments: AssignmentDetail[] | null;
}

const SEMESTER_LABEL: Record<number, string> = { 1: "ภาคต้น", 2: "ภาคปลาย", 3: "ภาคฤดูร้อน" };

// Only two decision surfaces exist under the auto-decide model. The chip
// tone/label reads directly from these.
const STATUS_META: Record<string, { tone: "success" | "danger" | "neutral"; label: string }> = {
  approved:  { tone: "success", label: "อนุมัติ" },
  rejected:  { tone: "danger",  label: "ปฏิเสธ" },
  submitted: { tone: "neutral", label: "รอตัดสิน" }, // legacy — sweep clears these at boot
  cancelled: { tone: "neutral", label: "ยกเลิก" },
  draft:     { tone: "neutral", label: "ฉบับร่าง" },
};

export default function TARequestsPage() {
  const { data, error } = useSWR<RequestSummary[]>("/ta-requests");
  const { data: terms } = useSWR<Term[]>("/terms");

  const activeTerm = terms?.find(t => t.is_active);
  const rows = useMemo(() => data ?? [], [data]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.academic_year));
    if (activeTerm) set.add(activeTerm.academic_year);
    return [...set].sort((a, b) => b - a);
  }, [rows, activeTerm]);
  const semesterOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.semester));
    if (activeTerm) set.add(activeTerm.semester);
    return [...set].sort();
  }, [rows, activeTerm]);

  const [year, setYear] = useState<string>("");
  const [sem, setSem] = useState<string>("");
  const [q, setQ] = useState("");

  // Default to the active term on first load only. If the officer clears them,
  // don't re-apply — matches the pattern from the previous implementation.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !activeTerm) return;
    setYear(String(activeTerm.academic_year));
    setSem(String(activeTerm.semester));
    setSeeded(true);
  }, [activeTerm, seeded]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (year && String(r.academic_year) !== year) return false;
      if (sem && String(r.semester) !== sem) return false;
      if (!needle) return true;
      return (
        r.course_code.toLowerCase().includes(needle) ||
        r.course_name.toLowerCase().includes(needle) ||
        r.lecturer_name.toLowerCase().includes(needle)
      );
    });
  }, [rows, year, sem, q]);

  const approvedCount = filtered.filter(r => r.status === "approved").length;
  const rejectedCount = filtered.filter(r => r.status === "rejected").length;

  return (
    <div>
      <PageHeader
        title="รายการคำขอ TA"
        description={(() => {
          if (!data) return "กำลังโหลด…";
          return `ระบบตัดสินอัตโนมัติ · แสดง ${filtered.length}/${data.length} รายการ`;
        })()}
      />

      <Panel padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-(--hairline) px-4 py-3">
          <SelectField
            className="min-w-[9rem]"
            label={<span className="text-xs">ปีการศึกษา</span>}
            value={year}
            onChange={setYear}
            options={[
              { id: "", label: "ทุกปี" },
              ...yearOptions.map(y => ({
                id: String(y),
                label: `${y}${activeTerm?.academic_year === y ? " (ปัจจุบัน)" : ""}`,
              })),
            ]}
          />
          <SelectField
            className="min-w-[9rem]"
            label={<span className="text-xs">ภาคเรียน</span>}
            value={sem}
            onChange={setSem}
            options={[
              { id: "", label: "ทุกภาค" },
              ...semesterOptions.map(s => ({
                id: String(s),
                label: `${SEMESTER_LABEL[s] ?? `ภาค ${s}`}${activeTerm?.semester === s ? " (ปัจจุบัน)" : ""}`,
              })),
            ]}
          />
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="ค้นหารหัส/ชื่อวิชา/อาจารย์…"
            className="flex-1 min-w-[16rem]"
          />

          <div className="ml-auto flex gap-2 text-xs">
            <Chip tone="success"><CheckCircle2 size={12} /> อนุมัติ {approvedCount}</Chip>
            <Chip tone="danger"><XCircle size={12} /> ปฏิเสธ {rejectedCount}</Chip>
          </div>
        </div>

        <div className="p-4">
          {error ? (
            <div className="py-10 text-center text-sm text-red-600">โหลดข้อมูลไม่สำเร็จ</div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-(--ink-3)">กำลังโหลด…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-(--ink-3)">
              ไม่พบคำขอตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <Accordion allowsMultipleExpanded className="w-full">
              {filtered.map(req => (
                <Accordion.Item key={req.id}>
                  <Accordion.Heading>
                    <Accordion.Trigger>
                      <RequestHeader req={req} />
                      <Accordion.Indicator>
                        <ChevronDown size={16} />
                      </Accordion.Indicator>
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body>
                      <ExpandedBody id={req.id} summary={req} />
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </div>
      </Panel>
    </div>
  );
}

function RequestHeader({ req }: { req: RequestSummary }) {
  const meta = STATUS_META[req.status] ?? { tone: "neutral" as const, label: req.status };
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-left">
      <Chip tone={meta.tone}>{meta.label}</Chip>
      <span className="font-semibold tabular-nums">{req.course_code}</span>
      <span className="text-(--ink-2) truncate max-w-[24rem]">{req.course_name}</span>
      <span className="text-xs text-(--ink-3)">อ. {req.lecturer_name}</span>
    </div>
  );
}

function ExpandedBody({ id, summary }: { id: string; summary: RequestSummary }) {
  const { data: d } = useSWR<RequestDetail>(`/ta-requests/${id}`);
  const checks = d?.decision_checks ?? summary.decision_checks;
  const allPass = checks.every(c => c.passed);
  const passCount = checks.filter(c => c.passed).length;

  return (
    <div className="space-y-3">
      <div className={
        "rounded-md border px-3 py-2 text-xs flex items-center gap-2 " +
        (allPass
          ? "bg-emerald-50/50 border-emerald-200 text-emerald-800"
          : "bg-red-50/50 border-red-200 text-red-800")
      }>
        {allPass ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        <span>
          {allPass
            ? `ระบบตรวจสอบผ่านทุกข้อ (${checks.length} รายการ)`
            : `ผ่าน ${passCount}/${checks.length} รายการ`}
        </span>
        {summary.status === "rejected" && summary.reject_reason && (
          <span className="ml-auto italic">{summary.reject_reason}</span>
        )}
      </div>

      {/* The full per-TA checklist is long, so collapse it into an accordion.
          Default-collapsed when everything passed (the banner above already says
          so); auto-expanded when there's a blocker/warning so the officer sees
          why without an extra click. */}
      <Accordion
        defaultExpandedKeys={allPass ? [] : ["checks"]}
        className="w-full rounded-md border border-(--hairline) overflow-hidden"
      >
        <Accordion.Item id="checks">
          <Accordion.Heading>
            <Accordion.Trigger className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-(--ink-2)">
              <ClipboardList size={13} /> การตรวจสอบของระบบ
              <span className={
                "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                (allPass ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
              }>
                {passCount}/{checks.length}
              </span>
              <Accordion.Indicator className="ml-auto" />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="px-3 pb-3">
              <ChecksBlock checks={checks} />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <section>
        <h4 className="text-xs font-semibold text-(--ink-2) mb-2 flex items-center gap-1.5">
          <Users size={13} /> รายชื่อ TA และภาระงาน
        </h4>
        {!d ? (
          <div className="text-xs text-(--ink-3)">กำลังโหลดรายละเอียด…</div>
        ) : (
          <TAListBlock detail={d} />
        )}
      </section>

      {d && (
        <MetaFooter d={d} />
      )}
    </div>
  );
}

const SCOPE_LABEL: Record<string, string> = {
  lecture: "เฉพาะบรรยาย",
  lab:     "เฉพาะปฏิบัติการ",
  both:    "บรรยาย + ปฏิบัติการ",
};

function MetaFooter({ d }: { d: RequestDetail }) {
  return (
    <div className="text-xs text-(--ink-3) flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-(--hairline)">
      <span>ประเภทการเบิก: {SCOPE_LABEL[d.reimburse_scope] ?? d.reimburse_scope}</span>
      <span>ปีการศึกษา {d.academic_year} · {SEMESTER_LABEL[d.semester] ?? `ภาค ${d.semester}`}</span>
      {d.submitted_at && (
        <span className="inline-flex items-center gap-1">
          <FileCheck2 size={11} /> ส่ง {new Date(d.submitted_at).toLocaleString("th-TH")}
        </span>
      )}
      {d.decided_at && (
        <span className="inline-flex items-center gap-1">
          <CalendarCheck2 size={11} /> ตัดสิน {new Date(d.decided_at).toLocaleString("th-TH")}
        </span>
      )}
      {(d.counts?.length ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <BookOpenCheck size={11} />
          {d.counts!.map(c => `Sec ${c.section_no} (ตรี ${c.undergrad_count} · โท/เอก ${c.graduate_count})`).join(" · ")}
        </span>
      )}
    </div>
  );
}

export type { DecisionCheck, RequestSummary, RequestDetail, AssignmentDetail };
