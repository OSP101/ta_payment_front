"use client";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, XCircle, ChevronDown, Users, BookOpenCheck, FileCheck2, CalendarCheck2,
  ShieldCheck, ShieldAlert, ClipboardList, UserCog, Clock, GraduationCap,
} from "lucide-react";
import { Accordion } from "@heroui/react";
import { useTerm } from "../TermContext";
import {
  PageHeader, Panel, Chip, SearchField, SelectField, Tip,
} from "../../components/ui";
import { ChecksBlock } from "./ChecksBlock";
import { TAListBlock } from "./TAListBlock";
import { Skel, SkelRegion, SkelValue } from "../../components/Skeletons";

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
  course_cap?: number;
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
  /** The officer who filed it for the lecturer; absent when the lecturer did. */
  submitted_by_name?: string;
  ta_count: number;
  /** Who the request is for — one TA per request since submissions are
   * judged person by person; several names only on older rows. */
  ta_names: string;
  /** Shared by the requests of one submission; absent on older rows. */
  batch_id?: string;
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

// Every request is one TA, decided on its own. 'submitted' is that TA still
// owing a timetable — the system decides the moment it arrives.
const STATUS_META: Record<string, { tone: "success" | "danger" | "warn" | "neutral"; label: string }> = {
  approved:  { tone: "success", label: "อนุมัติ" },
  rejected:  { tone: "danger",  label: "ปฏิเสธ" },
  submitted: { tone: "warn",    label: "รอตารางเรียน" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
  draft:     { tone: "neutral", label: "ฉบับร่าง" },
};

export default function TARequestsPage() {
  // This page is the one exception to "the switcher is the scope". It loads
  // every request and filters client-side, which lets staff widen to "ทุกปี /
  // ทุกเทอม" — comparing a course against last year's request is a real part
  // of the job here and no other page needs it. So the switcher SEEDS the
  // filters rather than replacing them: switching term snaps them back to that
  // term, and the officer can widen again from there.
  const { data, error } = useSWR<RequestSummary[]>("/ta-requests");
  const { terms, term, termId, loaded } = useTerm();
  const activeTerm = terms?.find(t => t.is_active);

  const rows = useMemo(() => data ?? [], [data]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.academic_year));
    if (term) set.add(term.academic_year);
    return [...set].sort((a, b) => b - a);
  }, [rows, term]);
  const semesterOptions = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => set.add(r.semester));
    if (term) set.add(term.semester);
    return [...set].sort();
  }, [rows, term]);

  const [year, setYear] = useState<string>("");
  const [sem, setSem] = useState<string>("");
  const [q, setQ] = useState("");

  // Re-seed on every term change, not just the first load: the switcher is a
  // deliberate act, so it should win over a filter the officer widened earlier.
  const seededFor = useRef<string | null>(null);
  // Mirrors seededFor for rendering: until the first seed lands the filters
  // still read "ทุกปี / ทุกภาค", and drawing the list then would flash every
  // year's requests before narrowing to this term's.
  const [firstSeedDone, setFirstSeedDone] = useState(false);
  useEffect(() => {
    if (!term || seededFor.current === termId) return;
    seededFor.current = termId;
    setYear(String(term.academic_year));
    setSem(String(term.semester));
    setFirstSeedDone(true);
  }, [term, termId]);
  const listReady = !!data && loaded && (!term || firstSeedDone);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (year && String(r.academic_year) !== year) return false;
      if (sem && String(r.semester) !== sem) return false;
      if (!needle) return true;
      return (
        r.course_code.toLowerCase().includes(needle) ||
        r.course_name.toLowerCase().includes(needle) ||
        r.lecturer_name.toLowerCase().includes(needle) ||
        (r.ta_names ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, year, sem, q]);

  const approvedCount = filtered.filter(r => r.status === "approved").length;
  const rejectedCount = filtered.filter(r => r.status === "rejected").length;
  const waitingCount = filtered.filter(r => r.status === "submitted").length;

  return (
    <div>
      <PageHeader
        title="รายการคำขอ TA"
        description={(() => {
          // The fixed half of the line stands on its own while the count loads.
          if (!listReady || !data) return "ระบบตัดสินอัตโนมัติเป็นรายบุคคล";
          return `ระบบตัดสินอัตโนมัติเป็นรายบุคคล · แสดง ${filtered.length}/${data.length} รายการ`;
        })()}
      />

      <Panel padded={false}>
        <div data-tour="approvals-filters" className="flex flex-wrap items-end gap-3 border-b border-(--hairline) px-4 py-3">
          <SelectField
            className="min-w-[9rem]"
            label={<span className="text-xs">ปีการศึกษา</span>}
            value={year}
            onChange={setYear}
            options={[
              { id: "", label: "ทุกปี" },
              // Marked with the same <Chip>active</Chip> the settings page and
              // the term switcher use — one word for one concept, so anyone who
              // wonders what "active" means can search it and find the switch
              // that sets it (ตั้งค่า → ภาคเรียน).
              ...yearOptions.map(y => ({
                id: String(y),
                textValue: String(y),
                label: (
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{y}</span>
                    {activeTerm?.academic_year === y && <Chip tone="success">active</Chip>}
                  </span>
                ),
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
                textValue: SEMESTER_LABEL[s] ?? `ภาค ${s}`,
                label: (
                  <span className="flex items-center gap-2">
                    <span>{SEMESTER_LABEL[s] ?? `ภาค ${s}`}</span>
                    {activeTerm?.semester === s && <Chip tone="success">active</Chip>}
                  </span>
                ),
              })),
            ]}
          />
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="ค้นหารหัส/ชื่อวิชา/อาจารย์/TA…"
          />

          <div className="ml-auto flex gap-2 text-xs">
            <Chip tone="success"><CheckCircle2 size={12} /> อนุมัติ {listReady ? approvedCount : <SkelValue className="h-3 w-4" />}</Chip>
            <Chip tone="danger"><XCircle size={12} /> ปฏิเสธ {listReady ? rejectedCount : <SkelValue className="h-3 w-4" />}</Chip>
            {listReady && waitingCount > 0 && (
              <Chip tone="warn"><Clock size={12} /> รอตารางเรียน {waitingCount}</Chip>
            )}
          </div>
        </div>

        <div className="p-4">
          {error ? (
            <div className="py-10 text-center text-sm text-red-600">โหลดข้อมูลไม่สำเร็จ</div>
          ) : !listReady ? (
            <RequestListSkeleton />
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-(--ink-3)">
              ไม่พบคำขอตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <div data-tour="approvals-list">
            <Accordion allowsMultipleExpanded className="w-full">
              {filtered.map(req => (
                <Accordion.Item key={req.id}>
                  <Accordion.Heading>
                    {/* min-w-0: the trigger is a flex container whose default
                        min-width:auto lets its contents set the width. On a
                        phone that made the row 433px wide inside a 277px card,
                        so the course name ran off the screen instead of
                        truncating. */}
                    <Accordion.Trigger className="min-w-0">
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
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// Accordion rows while /ta-requests loads: status chip, code, name, lecturer.
function RequestListSkeleton() {
  return (
    <SkelRegion className="divide-y divide-(--hairline)">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 py-3.5">
          <Skel className="h-5 w-14 rounded-full" />
          <Skel className="h-4 w-20" />
          <Skel className="h-4 w-56 max-w-[40%]" />
          <Skel className="h-3 w-28 max-w-[20%]" />
          <Skel className="ml-auto size-4 rounded" />
        </div>
      ))}
    </SkelRegion>
  );
}

function RequestHeader({ req }: { req: RequestSummary }) {
  const meta = STATUS_META[req.status] ?? { tone: "neutral" as const, label: req.status };
  return (
    // min-w-0 on the row and on each text child: without it a long course or
    // lecturer name sets the flex item's floor and pushes the whole accordion
    // past the edge of a phone screen instead of truncating.
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pr-2 text-left">
      <Chip tone={meta.tone}>{meta.label}</Chip>
      {/* The TA leads: each row is one person's verdict, so who it is for
          matters more than which course — that repeats down the list. */}
      {req.ta_names && (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 font-medium">
          <GraduationCap size={13} className="shrink-0 text-(--ink-3)" />
          <span className="truncate">{req.ta_names}</span>
        </span>
      )}
      <span className="font-semibold tabular-nums">{req.course_code}</span>
      <Tip content={`${req.course_code} ${req.course_name}\nอ. ${req.lecturer_name}`}>
        <span tabIndex={-1} className="min-w-0 max-w-full truncate text-(--ink-2) sm:max-w-[24rem]">{req.course_name}</span>
      </Tip>
      <Tip content={`${req.course_code} ${req.course_name}\nอ. ${req.lecturer_name}`}>
        <span tabIndex={-1} className="min-w-0 max-w-full truncate text-xs text-(--ink-3)">อ. {req.lecturer_name}</span>
      </Tip>
      {req.submitted_by_name && (
        <Chip tone="info">
          <UserCog size={11} /> เจ้าหน้าที่ {req.submitted_by_name} ส่งแทน
        </Chip>
      )}
    </div>
  );
}

function ExpandedBody({ id, summary }: { id: string; summary: RequestSummary }) {
  const { data: d } = useSWR<RequestDetail>(`/ta-requests/${id}`);
  const checks = d?.decision_checks ?? summary.decision_checks;
  const allPass = checks.every(c => c.passed);
  const passCount = checks.filter(c => c.passed).length;
  // Not judged yet: the only "check" is the note that the TA owes a timetable,
  // and a red "ผ่าน 0/1" would read as a failure that has not happened.
  const waiting = summary.status === "submitted";

  return (
    <div className="space-y-3">
      <div className={
        "rounded-md border px-3 py-2 text-xs flex items-center gap-2 " +
        (waiting
          ? "bg-amber-50/50 border-amber-200 text-amber-800"
          : allPass
          ? "bg-emerald-50/50 border-emerald-200 text-emerald-800"
          : "bg-red-50/50 border-red-200 text-red-800")
      }>
        {waiting ? <Clock size={14} /> : allPass ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        <span>
          {waiting
            ? "รอ TA บันทึกตารางเรียน ระบบจะตัดสินให้อัตโนมัติทันทีที่บันทึก โดยไม่ต้องรอ TA คนอื่น"
            : allPass
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
              <Tip content={`ผ่านการตรวจสอบ ${passCount} จาก ${checks.length} ข้อ`}>
                <span tabIndex={-1} className={
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                  (allPass ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                }>
                  {passCount}/{checks.length}
                </span>
              </Tip>
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
          // One tile per TA the summary already counted, same grid as TAListBlock.
          <SkelRegion className="grid gap-2 md:grid-cols-2">
            {Array.from({ length: Math.min(Math.max(summary.ta_count, 1), 6) }, (_, i) => (
              <Skel key={i} className="h-24 rounded-lg" />
            ))}
          </SkelRegion>
        ) : (
          <TAListBlock detail={d} />
        )}
      </section>

      {d ? (
        <MetaFooter d={d} />
      ) : (
        <div className="pt-2 border-t border-(--hairline)"><Skel className="h-3 w-2/3" /></div>
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
          {d.submitted_by_name && ` โดยเจ้าหน้าที่ ${d.submitted_by_name} แทน อ. ${d.lecturer_name}`}
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
