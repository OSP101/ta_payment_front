"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { Tabs, ScrollShadow } from "@heroui/react";
import {
  FileDown, History, Merge, Download, FileText, Users, GraduationCap, Banknote, FileSignature,
  CalendarRange, Check, ChevronDown, AlertTriangle,
} from "lucide-react";
import { toast } from "@heroui/react";
import { api } from "../../lib/api";
import { useTerm } from "../TermContext";
import {
  PageHeader, Button, IconButton, Chip, EmptyState, Modal, Select, TabLabel,
  ConfirmDialog, Avatar, TipWrap, Alert,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import UserAvatar from "../../components/UserAvatar";
import {
  MonthChips, monthLabels, monthsQuery, suggestMonths,
  type MonthCoverage,
} from "../../components/monthScope";

/**
 * สรุปงบและปะหน้าจ่ายตรง — everything about the term's TWO payout documents
 * (สรุปรายวิชาที่ขอใช้ TA, ปะหน้าจ่ายตรง). Split out onto its own page
 * (10/08/2026) after briefly living under ใบแต่งตั้งทีเอ ("ส่งออกเอกสาร"):
 * staff wanted to READ the numbers on screen before downloading anything, not
 * just a row of download buttons bolted onto the appointment-order page. The
 * preview tables below hit the same backend source (buildCourseSummaryBlocks /
 * buildTransferCoverSheets) as the .xlsx download, so the screen and the file
 * can never disagree.
 *
 * Both download buttons pass through useCourseGroupGate first (16/08/2026) —
 * a standalone "รหัสคู่" button used to be the only way to review a class
 * taught under two registrar codes (the curriculum transition leaves the old
 * code open for students who have not graduated yet, running side by side
 * with the new one). Staff kept forgetting it existed and shipping documents
 * with the same class printed as two separate rows, so the check now runs
 * automatically in front of every download instead of living behind a button
 * nobody remembered to press.
 */
type PreviewTab = "course_summary" | "transfer_cover";

// The active tab is decided HERE, not inside PreviewSection, because the
// download/history buttons live in the page header now (28/08/2026 — staff
// asked for them level with the page title itself, not down by the tab
// strip) and PageHeader's own row has no visibility into which tab is
// selected below it otherwise.
export default function BudgetSummaryPage() {
  const { termId, term } = useTerm();
  const termLabel = term ? `${term.academic_year}/${term.semester}` : "";
  const [tab, setTab] = useState<PreviewTab>("course_summary");
  return (
    <div>
      <PageHeader
        title="สรุปงบและปะหน้าจ่ายตรง"
        description="ตรวจตัวเลขสรุปรายวิชาที่ขอใช้ TA และปะหน้าจ่ายตรงบนหน้าจอ ก่อนดาวน์โหลดเป็นไฟล์ Excel พร้อมตรวจสอบรหัสวิชาคู่"
        actions={
          termId ? (
            tab === "course_summary" ? (
              <CourseSummaryDownloadButton termId={termId} termLabel={termLabel} />
            ) : (
              <TransferCoverDownloadButton termId={termId} termLabel={termLabel} />
            )
          ) : null
        }
      />
      {termId && <PreviewSection termId={termId} tab={tab} setTab={setTab} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* On-screen preview                                                          */
/* -------------------------------------------------------------------------- */

// PreviewSection's TABLE CONTENT is gated on the term having issued at least
// one คำสั่งแต่งตั้ง (appointment order) round — before that, "who is the TA on
// this course" is only a request someone approved, and the appointment order
// is the step that turns it into the confirmed, official roster these two
// documents are supposed to report on. The DOWNLOAD BUTTONS are deliberately
// NOT behind that same gate — they live in the page header (BudgetSummaryPage,
// 28/08/2026), driven by the SAME tab state passed down here, so staff can
// still generate either file before an appointment order exists.
function PreviewSection({
  termId, tab, setTab,
}: {
  termId: string; tab: PreviewTab; setTab: (tab: PreviewTab) => void;
}) {
  const router = useRouter();
  const { data: rounds, isLoading: roundsLoading } = useSWR<{ items: { id: string }[] }>(
    `/exports/appointment-order/rounds?term_id=${termId}`
  );
  const noRounds = !roundsLoading && !rounds?.items.length;

  const noRoundsNotice = (
    <EmptyState
      icon={<FileSignature size={26} />}
      title="ยังไม่เคยออกคำสั่งแต่งตั้งทีเอ"
      description="ต้องออกคำสั่งแต่งตั้งอย่างน้อย 1 ครั้งก่อน จึงจะแสดงสรุปงบและปะหน้าจ่ายตรงได้ เนื่องจากคำสั่งแต่งตั้งเป็นสิ่งยืนยันว่ารายชื่อทีเอที่ใช้งานจริงคือใคร"
      action={
        <Button variant="primary" onClick={() => router.push("/staff/appointments")}>
          <FileSignature size={16} /> ไปออกคำสั่งแต่งตั้ง
        </Button>
      }
    />
  );

  return (
    <div>
      <Tabs variant="secondary" selectedKey={tab} onSelectionChange={k => setTab(String(k) as PreviewTab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="เลือกเอกสารที่จะดูสรุป">
            <Tabs.Tab id="course_summary">
              <TabLabel icon={<FileDown size={14} />} active={tab === "course_summary"}>
                สรุปรายวิชาที่ขอใช้ TA
              </TabLabel>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="transfer_cover">
              <TabLabel icon={<FileDown size={14} />} active={tab === "transfer_cover"}>
                ปะหน้าจ่ายตรง
              </TabLabel>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="course_summary">
          <div className="pt-5">
            {roundsLoading ? (
              <PreviewTableSkeleton />
            ) : noRounds ? (
              noRoundsNotice
            ) : (
              <CourseSummaryPreviewPanel termId={termId} />
            )}
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="transfer_cover">
          <div className="pt-5">
            {roundsLoading ? (
              <PreviewTableSkeleton />
            ) : noRounds ? (
              noRoundsNotice
            ) : (
              <TransferCoverPreviewSection termId={termId} />
            )}
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading skeletons                                                         */
/* -------------------------------------------------------------------------- */

// PreviewTableSkeleton stands in for a curriculum Panel + DataTable while its
// data is still in flight — shown instead of nothing, so "loading" and "no
// data" never look identical (a blank white area for either was the actual
// bug report: no visual difference between "still fetching" and "empty").
function PreviewTableSkeleton() {
  return (
    <div>
      <div className="pb-3">
        <div className="h-4 w-56 animate-pulse rounded bg-surface-secondary" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface-secondary" />
      </div>
      <div className="divide-y divide-hairline">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-4 py-3.5">
            <div className="h-3 w-14 shrink-0 animate-pulse rounded bg-surface-secondary" />
            <div className="h-3 flex-1 animate-pulse rounded bg-surface-secondary" />
            <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-surface-secondary" />
            <div className="h-3 w-24 shrink-0 animate-pulse rounded bg-surface-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

const fmtBaht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CourseSummaryPreviewRow {
  course_code: string;
  course_name_th: string;
  credit_text: string;
  lecturer: string;
  claim_kind: string;
  num_regular: number;
  num_special: number;
  apply_regular: number;
  apply_special: number;
  ta_student_id?: string;
  ta_name?: string;
  ta_level_th?: string;
}
interface CourseSummaryPreviewSheet {
  curriculum_code: string;
  sheet: string;
  rows: CourseSummaryPreviewRow[];
}

interface TAInfo {
  student_id?: string;
  name: string;
  level_th?: string;
}

// courseSummaryDisplayRow — one row per course. The backend flattens one row
// per (course, TA) pair because a printed/sortable-for-Excel table has no
// cell-merge equivalent (see CourseSummaryPreviewRow's own comment), but that
// made a course with several TAs read as several different courses on
// screen, with its own totals repeated once per TA. groupCourseSummaryRows
// below undoes that flattening for display; the TA column shows everyone at
// once as a compact avatar stack instead.
interface CourseSummaryDisplayRow {
  course_code: string;
  course_name_th: string;
  credit_text: string;
  lecturer: string;
  claim_kind: string;
  num_regular: number;
  num_special: number;
  apply_regular: number;
  apply_special: number;
  tas: TAInfo[];
}

function groupCourseSummaryRows(rows: CourseSummaryPreviewRow[]): CourseSummaryDisplayRow[] {
  const order: string[] = [];
  const byCourse = new Map<string, CourseSummaryDisplayRow>();
  for (const r of rows) {
    let g = byCourse.get(r.course_code);
    if (!g) {
      g = {
        course_code: r.course_code, course_name_th: r.course_name_th, credit_text: r.credit_text,
        lecturer: r.lecturer, claim_kind: r.claim_kind,
        num_regular: r.num_regular, num_special: r.num_special,
        apply_regular: r.apply_regular, apply_special: r.apply_special,
        tas: [],
      };
      byCourse.set(r.course_code, g);
      order.push(r.course_code);
    }
    if (r.ta_name) g.tas.push({ student_id: r.ta_student_id, name: r.ta_name, level_th: r.ta_level_th });
  }
  return order.map(code => byCourse.get(code)!);
}

// TAAvatarStack — the "avatar group with +N overflow" pattern GitHub reviewers,
// Linear assignees, and Jira watchers all converge on for "several people
// attached to one row": every TA shown at once, name + level + student id on
// hover/focus (TipWrap already handles touch and keyboard, not just mouse),
// collapsing to a "+N" chip past a handful so one busy course can't blow out
// the row height for everyone else's.
const TA_STACK_VISIBLE = 4;

function TAAvatarStack({ tas }: { tas: TAInfo[] }) {
  if (tas.length === 0) {
    return <span className="text-xs text-ink-4">ยังไม่มี TA ที่อนุมัติ</span>;
  }
  const visible = tas.slice(0, TA_STACK_VISIBLE);
  const overflow = tas.length - visible.length;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((ta, i) => {
        const [first, ...rest] = ta.name.trim().split(/\s+/);
        return (
          <TipWrap
            // student_id is not reliably unique (seed/placeholder data can
            // repeat it across TAs) — array position always is.
            key={`${i}-${ta.student_id ?? ta.name}`}
            content={<>{ta.name}{ta.level_th ? ` · ${ta.level_th}` : ""}{ta.student_id ? `\n${ta.student_id}` : ""}</>}
          >
            <UserAvatar firstName={first} lastName={rest.join(" ")} size="sm" className="ring-2 ring-surface" />
          </TipWrap>
        );
      })}
      {overflow > 0 && (
        <TipWrap content={tas.slice(TA_STACK_VISIBLE).map(t => t.name).join("\n")}>
          <Avatar size="sm" color="accent" className="ring-2 ring-surface">
            <Avatar.Fallback className="text-[10px]">+{overflow}</Avatar.Fallback>
          </Avatar>
        </TipWrap>
      )}
    </div>
  );
}

const courseSummaryColumns: DataColumn<CourseSummaryDisplayRow>[] = [
  {
    id: "course_code", label: "รหัสวิชา", isRowHeader: true, sortable: true,
    sortValue: r => r.course_code, render: r => <span className="font-medium tabular-nums">{r.course_code}</span>,
  },
  {
    id: "course_name_th", label: "ชื่อวิชา", sortable: true,
    sortValue: r => r.course_name_th, render: r => r.course_name_th,
  },
  { id: "credit_text", label: "หน่วยกิต", className: "whitespace-nowrap", hideOnMobile: true, render: r => r.credit_text },
  {
    id: "lecturer", label: "อาจารย์ผู้สอน", sortable: true,
    sortValue: r => r.lecturer, render: r => r.lecturer,
  },
  {
    id: "claim_kind", label: "ประเภทเบิก", hideOnMobile: true,
    render: r => r.claim_kind ? <Chip tone="info">{r.claim_kind}</Chip> : null,
  },
  {
    id: "ta", label: "TA", sortable: true,
    sortValue: r => r.tas.length ? r.tas.map(t => t.name).join(", ") : "~",
    render: r => <TAAvatarStack tas={r.tas} />,
  },
  {
    id: "num", label: "จำนวนนักศึกษา (ปกติ/พิเศษ)", className: "text-right whitespace-nowrap", hideOnMobile: true,
    render: r => `${r.num_regular} / ${r.num_special}`,
  },
  // The budget the course is allotted, per track — the one money figure this
  // document reports. เบิกจ่ายจริง/คงเหลือ were dropped from both the .xlsx and
  // this table (10/08/2026): actual spend belongs to the payout screens, and
  // the college's own reference workbook only ever totalled this pair.
  {
    id: "apply", label: "ขออนุมัติเบิกจ่าย (บาท)", className: "text-right whitespace-nowrap", sortable: true,
    sortValue: r => r.apply_regular + r.apply_special,
    render: r => (
      <div className="text-right tabular-nums">
        <div>ปกติ {fmtBaht(r.apply_regular)}</div>
        <div className="text-xs text-ink-4">พิเศษ {fmtBaht(r.apply_special)}</div>
      </div>
    ),
  },
];

function CourseSummaryPreviewPanel({ termId }: { termId: string }) {
  const { data, error, isLoading, mutate: retry } = useSWR<{ sheets: CourseSummaryPreviewSheet[]; warnings: string[] }>(
    `/exports/terms/${termId}/course-summary/preview`
  );
  const sheets = data?.sheets ?? [];
  return (
    <div className="space-y-8">
      {!!data?.warnings.length && (
        <div className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">มีรายการที่ควรตรวจสอบ {data.warnings.length} รายการ</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}
      {isLoading && !data ? (
        <PreviewTableSkeleton />
      ) : error && !data ? (
        <Alert
          status="danger"
          title="โหลดข้อมูลไม่สำเร็จ"
          description={error instanceof Error ? error.message : "กรุณาลองใหม่อีกครั้ง"}
          action={<Button variant="secondary" onClick={() => void retry()}>ลองใหม่</Button>}
        />
      ) : sheets.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={26} />}
          title="ยังไม่มีวิชาที่ขอใช้ TA"
          description="เมื่อมีคำขอ TA ที่อนุมัติแล้วในเทอมนี้ สรุปจะมาแสดงที่นี่ แยกตามหลักสูตร"
        />
      ) : (
        sheets.map((sheet, i) => {
          const courseRows = groupCourseSummaryRows(sheet.rows);
          return (
            <div key={sheet.curriculum_code} className={i > 0 ? "pt-8 border-t border-hairline" : ""}>
              <div className="mb-3">
                <div className="text-[15px] font-semibold text-foreground">{sheet.sheet}</div>
                <div className="text-xs text-muted mt-0.5">{courseRows.length} รายวิชา</div>
              </div>
              <DataTable
                ariaLabel={`สรุปรายวิชาที่ขอใช้ TA — ${sheet.sheet}`}
                columns={courseSummaryColumns}
                rows={courseRows}
                rowKey={r => r.course_code}
                searchFn={r => `${r.course_code} ${r.course_name_th} ${r.lecturer} ${r.tas.map(t => t.name).join(" ")}`}
                searchPlaceholder="ค้นหารหัสวิชา ชื่อวิชา อาจารย์ หรือ TA"
                initialSort={{ column: "course_code", direction: "ascending" }}
                minWidth="64rem"
                loading={isLoading}
                error={error}
                onRetry={() => void retry()}
                emptyTitle="ไม่มีวิชาในหลักสูตรนี้"
              />
            </div>
          );
        })
      )}
    </div>
  );
}

interface TransferCoverPreviewRow {
  name: string;
  courses: string;
  baht: number;
  seniority: string;
}
interface TransferCoverPreviewSheet {
  sheet_name: string;
  track: string;
  track_th: string;
  rows: TransferCoverPreviewRow[];
  total_baht: number;
}

const transferCoverColumns: DataColumn<TransferCoverPreviewRow>[] = [
  {
    id: "name", label: "ชื่อ-สกุล", isRowHeader: true, sortable: true,
    sortValue: r => r.name, render: r => r.name,
  },
  { id: "courses", label: "รายวิชา", render: r => r.courses },
  {
    id: "seniority", label: "หมายเหตุ", className: "whitespace-nowrap",
    render: r => <Chip tone={r.seniority === "ใหม่" ? "info" : "neutral"}>{r.seniority}</Chip>,
  },
  {
    id: "baht", label: "จำนวนเงิน (บาท)", className: "text-right whitespace-nowrap", sortable: true,
    sortValue: r => r.baht, render: r => <span className="tabular-nums">{fmtBaht(r.baht)}</span>,
  },
];

/** "undergrad" | "graduate" — the level split (12/08/2026): ป.ตรี กับ
 *  บัณฑิตศึกษาทำเบิกไม่เหมือนกัน จึงเป็นคนละไฟล์เสมอ ไม่มีตัวเลือก "ทั้งสองระดับ". */
type TransferCoverLevel = "undergrad" | "graduate";
const transferCoverLevelLabel: Record<TransferCoverLevel, string> = {
  undergrad: "ป.ตรี", graduate: "บัณฑิตศึกษา",
};

// transferCoverQuery builds the query string every transfer-cover endpoint
// needs: level is required (no "give me both" default the way months has
// one — see the backend's levelParam), months is optional.
function transferCoverQuery(level: TransferCoverLevel, months?: string[]) {
  const params = new URLSearchParams({ level });
  if (months?.length) params.set("months", months.join(","));
  return `?${params.toString()}`;
}

// TransferCoverPreviewSection — the level toggle (ป.ตรี / บัณฑิตศึกษา) plus
// the coverage + preview tables for whichever level is selected. A level
// switch is a fresh screen, not a filter on one shared table: the two files
// have entirely different rosters and month-coverage histories.
function TransferCoverPreviewSection({ termId }: { termId: string }) {
  const [level, setLevel] = useState<TransferCoverLevel>("undergrad");
  return (
    <div className="space-y-8">
      {/* Boxed on purpose (28/08/2026, per staff feedback) — this cluster has
          its OWN small tab-like control (the ป.ตรี/บัณฑิตศึกษา toggle), so
          leaving it flat like the rest of the page read as a second,
          competing tab strip right under the real one. The border here is
          doing real work: telling the two apart. */}
      <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
        <div className="inline-flex rounded-lg border border-brand/20 bg-white p-0.5 mb-4">
          {(["undergrad", "graduate"] as const).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (level === l ? "bg-brand text-white" : "text-ink-2 hover:text-ink-1")
              }
            >
              {transferCoverLevelLabel[l]}
            </button>
          ))}
        </div>
        <TransferCoverCoveragePanel termId={termId} level={level} />
      </div>
      <TransferCoverPreviewPanel termId={termId} level={level} />
    </div>
  );
}

// TransferCoverCoveragePanel — which months of the term already have a
// document and which do not. Sits above the preview because with month
// selection now free, "did we ever issue ตุลาคม?" is a question staff would
// otherwise answer from memory, and the cost of getting it wrong is a TA who
// is never paid for a month they worked. Scoped to ONE level: the two files
// are issued on independent schedules, so issuing ป.ตรี must never make the
// บัณฑิตศึกษา screen believe its own months are already covered. Rendered
// inside TransferCoverPreviewSection's own boxed cluster, alongside the level
// toggle — not from TransferCoverPreviewPanel below, which stays flat.
function TransferCoverCoveragePanel({ termId, level }: { termId: string; level: TransferCoverLevel }) {
  const { data } = useSWR<MonthCoverage>(`/exports/terms/${termId}/transfer-cover/coverage${transferCoverQuery(level)}`);
  if (!data?.months.length) return null;
  const pending = data.months.filter(m => !m.issued);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-ink-1">สถานะการออกเอกสารรายเดือน</span>
        {data.fiscal_split.crosses && (
          <Chip tone="warn">ภาคเรียนนี้คร่อมสิ้นปีงบประมาณ ต้องแยกเอกสาร</Chip>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.months.map(m => (
          <span
            key={m.year_month}
            className={
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " +
              (m.issued
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-border text-ink-3")
            }
          >
            {m.issued && <Check size={12} />}
            {m.label}
          </span>
        ))}
      </div>
      {pending.length > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          ยังไม่ได้ออกเอกสาร {pending.length} เดือน: {pending.map(m => m.label).join(", ")}
        </p>
      )}
    </div>
  );
}

function TransferCoverPreviewPanel({ termId, level }: { termId: string; level: TransferCoverLevel }) {
  const { data, error, isLoading, mutate: retry } = useSWR<{ sheets: TransferCoverPreviewSheet[]; warnings: string[] }>(
    `/exports/terms/${termId}/transfer-cover/preview${transferCoverQuery(level)}`
  );
  const sheets = data?.sheets ?? [];
  return (
    <div className="space-y-8">
      {!!data?.warnings.length && (
        <div className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">มีรายการที่ควรตรวจสอบ {data.warnings.length} รายการ</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}
      {isLoading && !data ? (
        <PreviewTableSkeleton />
      ) : error && !data ? (
        <Alert
          status="danger"
          title="โหลดข้อมูลไม่สำเร็จ"
          description={error instanceof Error ? error.message : "กรุณาลองใหม่อีกครั้ง"}
          action={<Button variant="secondary" onClick={() => void retry()}>ลองใหม่</Button>}
        />
      ) : sheets.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="ยังไม่มีข้อมูลปะหน้าจ่ายตรง"
          description="เมื่อวิชาในเทอมนี้มีบันทึกเวลาที่คิดเงินแล้ว สรุปจะมาแสดงที่นี่ แยกตามหลักสูตร"
        />
      ) : (
        sheets.map((sheet, i) => (
          <div
            key={`${sheet.sheet_name}-${sheet.track}`}
            className={i > 0 ? "pt-8 border-t border-hairline" : ""}
          >
            <div className="mb-3">
              <div className="text-[15px] font-semibold text-foreground">{sheet.sheet_name}</div>
              <div className="text-xs text-muted mt-0.5">
                {sheet.track_th} · {sheet.rows.length} รายการ · รวม {fmtBaht(sheet.total_baht)} บาท
              </div>
            </div>
            <DataTable
              ariaLabel={`ปะหน้าจ่ายตรง — ${sheet.sheet_name} (${sheet.track_th})`}
              columns={transferCoverColumns}
              rows={sheet.rows}
              rowKey={r => `${sheet.rows.indexOf(r)}-${r.name}`}
              searchFn={r => `${r.name} ${r.courses}`}
              searchPlaceholder="ค้นหาชื่อหรือรายวิชา"
              initialSort={{ column: "name", direction: "ascending" }}
              minWidth="40rem"
              loading={isLoading}
              error={error}
              onRetry={() => void retry()}
              emptyTitle="ไม่มีรายชื่อในหลักสูตรนี้"
            />
          </div>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Download buttons (moved verbatim from the appointments page, 10/08/2026)   */
/* -------------------------------------------------------------------------- */

// CourseSummaryDownloadButton — "สรุปรายวิชาที่ขอใช้ TA", the budget-request
// workbook staff used to assemble by hand at the start of every term. This is
// an estimate document (see BuildCourseSummaryWorkbook's own comment), so
// warnings never block the download — they just get a confirmation step so
// staff know what to double check (a missing student count, a course with no
// approved TA yet) before they hand the file onward.
function CourseSummaryDownloadButton({ termId, termLabel }: { termId: string; termLabel: string }) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const groupGate = useCourseGroupGate(termId);

  async function downloadNow() {
    setDownloading(true);
    try {
      const blob = await api.get<Blob>(`/exports/terms/${termId}/course-summary.xlsx`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `course-summary-${termLabel.replace("/", "-") || "term"}.xlsx`;
      el.click();
      URL.revokeObjectURL(url);
      // A download just added a row to the generation ledger — refresh the
      // history modal if it happens to be showing this term already.
      void mutate(`/exports/terms/${termId}/course-summary/history`);
    } catch (e) {
      toast.danger("ดาวน์โหลดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setDownloading(false);
    }
  }

  async function checkWarningsThenDownload() {
    setChecking(true);
    try {
      const res = await api.get<{ warnings: string[] }>(`/exports/terms/${termId}/course-summary/warnings`);
      if (res.warnings.length > 0) {
        setWarnings(res.warnings);
      } else {
        await downloadNow();
      }
    } catch (e) {
      toast.danger("ตรวจสอบไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }

  function start() {
    if (!termId) return;
    void groupGate.guard(() => void checkWarningsThenDownload());
  }

  return (
    <>
      <Button variant="secondary" disabled={!termId} isPending={checking || groupGate.checking} onClick={start}>
        <FileDown size={16} /> สรุปรายวิชาที่ขอใช้ TA
      </Button>
      {/* variant="secondary" to match its neighbour — IconButton defaults to
          "primary" (a solid-fill circle), which next to outlined buttons in
          the same row would read as a mismatched style. */}
      <IconButton
        label="ประวัติการสร้างเอกสาร"
        variant="secondary"
        disabled={!termId}
        onClick={() => setHistoryOpen(true)}
      >
        <History size={16} />
      </IconButton>
      <ConfirmDialog
        open={warnings !== null}
        onClose={() => setWarnings(null)}
        onConfirm={() => { setWarnings(null); void downloadNow(); }}
        isPending={downloading}
        icon={<FileDown size={20} />}
        title="มีรายการที่ควรตรวจสอบก่อนดาวน์โหลด"
        confirmLabel="ดาวน์โหลดต่อ"
        message={
          <div className="space-y-2 text-sm">
            <p className="text-muted">
              ไฟล์นี้เป็นเอกสารประมาณการ ดาวน์โหลดได้ตามปกติ แต่ตัวเลขต่อไปนี้ยังไม่ครบ:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {(warnings ?? []).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        }
      />
      {historyOpen && (
        <CourseSummaryHistoryModal termId={termId} onClose={() => setHistoryOpen(false)} />
      )}
      {groupGate.modal}
    </>
  );
}

// CourseSummaryHistoryModal lists every generation on the ledger (who, when,
// how many courses) with a reprint action per row. Reprint re-renders from the
// frozen snapshot rather than recomputing — a student count or TA approval
// corrected after the fact must not silently change a document already handed
// to someone (see ExportService.ReprintCourseSummary).
function CourseSummaryHistoryModal({
  termId, onClose,
}: {
  termId: string; onClose: () => void;
}) {
  const { data: history } = useSWR<CourseSummaryExportSummary[]>(
    `/exports/terms/${termId}/course-summary/history`
  );
  const [reprinting, setReprinting] = useState<string | null>(null);

  async function reprint(h: CourseSummaryExportSummary) {
    setReprinting(h.id);
    try {
      const blob = await api.get<Blob>(`/exports/course-summary/${h.id}/reprint`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = "course-summary.xlsx";
      el.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.danger("ดาวน์โหลดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setReprinting(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ประวัติการสร้างเอกสารสรุปรายวิชาที่ขอใช้ TA"
      icon={<History size={20} />}
      size="xl"
      footer={<Button variant="ghost" onClick={onClose}>ปิด</Button>}
    >
      {!history?.length ? (
        <EmptyState
          icon={<FileText size={26} />}
          title="ยังไม่เคยสร้างเอกสาร"
          description="เอกสารที่สร้างแล้วจะมาแสดงที่นี่ พร้อมปุ่มดาวน์โหลดฉบับเดิม"
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {history.map(h => (
            <li key={h.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-1">
                  {new Date(h.generated_at).toLocaleString("th-TH", {
                    dateStyle: "medium", timeStyle: "short",
                  })}
                </div>
                <div className="text-xs text-ink-3">
                  {h.course_count} วิชา
                  {h.generated_by && ` · โดย ${h.generated_by}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void reprint(h)}
                disabled={reprinting !== null}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Download size={12} />
                {reprinting === h.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลดฉบับเดิม"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

interface CourseSummaryExportSummary {
  id: string;
  term_id: string;
  generated_at: string;
  generated_by?: string;
  course_count: number;
}

interface TransferCoverBlocker {
  kind: string;
  ta_name: string;
  months: string[];
  rows?: number;
  course_code?: string;
}

interface TransferCoverExportSummary {
  id: string;
  term_id: string;
  generated_at: string;
  generated_by?: string;
  total_baht: number;
  sheet_count: number;
  /** Empty for files issued before the fiscal split existed — those were whole-term. */
  months?: string[];
  /** Empty for files issued before the level split (12/08/2026) — those covered both levels in one file. */
  level?: string;
}

/* -------------------------------------------------------------------------- */
/* Fiscal-year month selection                                                */
/* -------------------------------------------------------------------------- */

// TransferCoverMonthModal — the step between pressing ปะหน้าจ่ายตรง and getting
// a file.
//
// It exists because งบแผ่นดิน closes 30 กันยายน while ภาคต้น teaches มิ.ย.–ต.ค.:
// the two halves draw on different appropriations and must be claimed on
// separate documents. Free month selection makes two new mistakes possible —
// issuing ตุลาคม twice, or never issuing it — so the months already on the
// ledger are shown here rather than left to memory.
// mergeCoverage combines both levels' coverage into one for the bundle
// button's month picker: the month LIST is structurally identical between
// levels (same term, same TermMonths call underneath) — only "issued" can
// differ, so a month reads issued here if EITHER level has already produced
// a file for it, which is the useful warning ("you're about to re-issue
// something") regardless of which level that something was.
function mergeCoverage(a?: MonthCoverage, b?: MonthCoverage): MonthCoverage | undefined {
  const base = a ?? b;
  if (!base) return undefined;
  return {
    ...base,
    months: base.months.map(m => ({
      ...m,
      issued: !!(
        a?.months.find(x => x.year_month === m.year_month)?.issued ||
        b?.months.find(x => x.year_month === m.year_month)?.issued
      ),
    })),
  };
}

function TransferCoverMonthModal({
  termId, onClose, onConfirm, isPending,
}: {
  termId: string;
  onClose: () => void;
  onConfirm: (months: string[]) => void;
  isPending: boolean;
}) {
  const { data: ugData, isLoading: ugLoading } = useSWR<MonthCoverage>(
    `/exports/terms/${termId}/transfer-cover/coverage${transferCoverQuery("undergrad")}`
  );
  const { data: gradData, isLoading: gradLoading } = useSWR<MonthCoverage>(
    `/exports/terms/${termId}/transfer-cover/coverage${transferCoverQuery("graduate")}`
  );
  const isLoading = ugLoading || gradLoading;
  const data = useMemo(() => mergeCoverage(ugData, gradData), [ugData, gradData]);
  const all = useMemo(() => data?.months ?? [], [data]);
  const split = data?.fiscal_split;
  const [selected, setSelected] = useState<string[] | null>(null);

  // Preselect the half that still needs issuing: the closing budget year while
  // any of its months are outstanding, otherwise the new one. A term that does
  // not cross the boundary just gets everything, as before.
  const suggested = useMemo(() => suggestMonths(all, split), [all, split]);

  const months = selected ?? suggested;
  const reissuing = months.filter(ym => all.find(m => m.year_month === ym)?.issued);
  const notCovered = all.filter(m => !m.issued && !months.includes(m.year_month));

  return (
    <Modal
      open
      onClose={onClose}
      title="เลือกเดือนที่จะออกเอกสาร"
      icon={<CalendarRange size={20} />}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            isPending={isPending}
            disabled={months.length === 0}
            onClick={() => onConfirm(months)}
          >
            <Banknote size={14} /> ตรวจสอบและดาวน์โหลด
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <div className="h-4 w-64 animate-pulse rounded bg-surface-secondary" />
          <div className="h-9 w-full animate-pulse rounded bg-surface-secondary" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<CalendarRange size={26} />}
          title="ยังไม่ได้ตั้งรอบส่งบันทึกเวลา"
          description="เอกสารนี้อ้างอิงรอบรายเดือนของภาคเรียน ตั้งรอบที่เมนูตั้งค่าก่อน แล้วจึงกลับมาออกเอกสาร"
        />
      ) : (
        <div className="space-y-4 text-sm">
          {split?.crosses && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              ภาคเรียนนี้คร่อมสิ้นปีงบประมาณ (30 ก.ย.) — เดือน{" "}
              {monthLabels(all, split.after).join(", ")} ต้องเบิกจากงบปีใหม่ จึงต้องแยกเอกสารจาก{" "}
              {monthLabels(all, split.before).join(", ")}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {split?.crosses && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setSelected(split.before)}>
                  งบปีเก่า ({monthLabels(all, split.before).length} เดือน)
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSelected(split.after)}>
                  งบปีใหม่ ({monthLabels(all, split.after).length} เดือน)
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelected(all.map(m => m.year_month))}>
              ทั้งภาคเรียน
            </Button>
          </div>

          <MonthChips months={all} selected={months} onChange={setSelected} />

          {reissuing.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              เดือน {monthLabels(all, reissuing).join(", ")} เคยออกเอกสารไปแล้ว
              การออกซ้ำจะได้ยอดเดิมอีกฉบับ ตรวจสอบก่อนว่าตั้งใจออกใหม่เพื่อแก้ไขฉบับเดิม
            </div>
          )}
          {notCovered.length > 0 && (
            <p className="text-xs text-ink-3">
              ยังไม่ได้ออกเอกสารของเดือน {notCovered.map(m => m.label).join(", ")} — อย่าลืมกลับมาออกให้ครบ
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}


// TransferCoverDownloadButton — "ปะหน้าจ่ายตรง" (แจ้งโอนจ่ายตรงเข้าบัญชีบุคลากร).
// One button, one zip download — bundling both level files (ป.ตรี, บัณฑิต)
// so the header does not carry two near-identical buttons + two history icons
// (12/08/2026). The two documents underneath still pass their OWN gate
// independently: a level that is not ready is skipped (with a toast saying
// so) rather than holding up the level that IS ready — collapsing the gates
// back into one would recreate exactly the coupling the level split fixed.
// Unlike CourseSummaryDownloadButton above, this is a settled/actual
// document: the server refuses outright while a level's every course has not
// reached finance_sent — see ExportService.TermExportBlockers.
function TransferCoverDownloadButton({ termId, termLabel }: { termId: string; termLabel: string }) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [blockers, setBlockers] = useState<{ undergrad: TransferCoverBlocker[]; graduate: TransferCoverBlocker[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const groupGate = useCourseGroupGate(termId);

  async function downloadNow(months: string[], skippedLevel: TransferCoverLevel | null) {
    setDownloading(true);
    try {
      const blob = await api.get<Blob>(`/exports/terms/${termId}/transfer-cover-bundle.zip${monthsQuery(months)}`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      const slice = months.length ? `-${months[0]}${months.length > 1 ? `_${months[months.length - 1]}` : ""}` : "";
      el.download = `transfer-cover-${termLabel.replace("/", "-") || "term"}${slice}.zip`;
      el.click();
      URL.revokeObjectURL(url);
      // A download just added a row to both levels' generation ledgers —
      // refresh whatever the preview tab / history modal are showing.
      for (const lvl of ["undergrad", "graduate"] as const) {
        void mutate(`/exports/terms/${termId}/transfer-cover/history${transferCoverQuery(lvl)}`);
        void mutate(`/exports/terms/${termId}/transfer-cover/coverage${transferCoverQuery(lvl)}`);
      }
      if (skippedLevel) {
        const gotLevel: TransferCoverLevel = skippedLevel === "undergrad" ? "graduate" : "undergrad";
        toast.warning(`ได้เฉพาะไฟล์${transferCoverLevelLabel[gotLevel]}`, {
          description: `ไฟล์${transferCoverLevelLabel[skippedLevel]}ยังไม่พร้อม กดปุ่มนี้อีกครั้งเพื่อดูรายการค้าง`,
        });
      }
    } catch (e) {
      toast.danger("ดาวน์โหลดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setDownloading(false);
    }
  }

  // Both levels are checked for the CHOSEN months in parallel — the whole
  // point of the split is that a graduate course mid-review must not hold up
  // the undergrad file (or the reverse), so one blocked level never blocks
  // the other's download; it only blocks the WHOLE bundle once both are.
  async function checkThenDownload(months: string[]) {
    if (!termId) return;
    setChecking(true);
    try {
      const [ug, grad] = await Promise.all([
        api.get<{ blockers: TransferCoverBlocker[] }>(`/exports/terms/${termId}/transfer-cover/blockers${transferCoverQuery("undergrad", months)}`),
        api.get<{ blockers: TransferCoverBlocker[] }>(`/exports/terms/${termId}/transfer-cover/blockers${transferCoverQuery("graduate", months)}`),
      ]);
      const ugBlocked = ug.blockers.length > 0;
      const gradBlocked = grad.blockers.length > 0;
      if (ugBlocked && gradBlocked) {
        setBlockers({ undergrad: ug.blockers, graduate: grad.blockers });
        setPickerOpen(false);
        return;
      }
      setPickerOpen(false);
      await downloadNow(months, ugBlocked ? "undergrad" : gradBlocked ? "graduate" : null);
    } catch (e) {
      toast.danger("ตรวจสอบไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }

  function blockerLine(b: TransferCoverBlocker): string {
    const who = b.course_code ? `[${b.course_code}] ${b.ta_name}` : b.ta_name;
    const months = b.months.join(", ");
    switch (b.kind) {
      case "waiting_ta": return `${who} ยังไม่ส่งบันทึกเวลา (${months})`;
      case "waiting_lecturer": return `${who} รออาจารย์อนุมัติ (${months})`;
      case "not_finance_sent": return `${who} ตรวจสอบแล้วแต่ยังไม่ส่งการเงิน (${months})`;
      default: return `${who} (${months})`;
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={!termId}
        isPending={groupGate.checking}
        onClick={() => void groupGate.guard(() => setPickerOpen(true))}
      >
        <Banknote size={16} /> ปะหน้าจ่ายตรง
      </Button>
      {/* variant="secondary" to match its neighbour — IconButton defaults to
          "primary" (a solid-fill circle), which next to outlined buttons in
          the same row would read as a mismatched style. */}
      <IconButton
        label="ประวัติการสร้างเอกสาร"
        variant="secondary"
        disabled={!termId}
        onClick={() => setHistoryOpen(true)}
      >
        <History size={16} />
      </IconButton>

      <Modal
        open={blockers !== null}
        onClose={() => setBlockers(null)}
        title="ยังสร้างเอกสารไม่ได้เลยสักไฟล์"
        icon={<FileDown size={20} />}
        footer={<Button variant="primary" onClick={() => setBlockers(null)}>ปิด</Button>}
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">ทั้งไฟล์ ป.ตรี และบัณฑิตยังไม่พร้อม ยังมีรายการค้างดังนี้:</p>
          {blockers && ([["ป.ตรี", blockers.undergrad], ["บัณฑิตศึกษา", blockers.graduate]] as const).map(([label, list]) => (
            list.length > 0 && (
              <div key={label}>
                <div className="text-xs font-medium text-ink-2 mb-1">{label}</div>
                <ul className="list-disc pl-5 space-y-1">
                  {list.map((b, i) => <li key={i}>{blockerLine(b)}</li>)}
                </ul>
              </div>
            )
          ))}
        </div>
      </Modal>

      {pickerOpen && (
        <TransferCoverMonthModal
          termId={termId}
          isPending={checking || downloading}
          onClose={() => setPickerOpen(false)}
          onConfirm={months => void checkThenDownload(months)}
        />
      )}

      {historyOpen && (
        <TransferCoverHistoryModal termId={termId} onClose={() => setHistoryOpen(false)} />
      )}
      {groupGate.modal}
    </>
  );
}

// TransferCoverHistoryModal lists every generation on the ledger (who, when,
// how much, how many sheets) with a reprint action per row. Reprint re-renders
// from the frozen snapshot rather than recomputing — a work log corrected
// after the fact must not silently change a document finance may already
// have acted on (see ExportService.ReprintTransferCover).
function TransferCoverHistoryModal({
  termId, onClose,
}: {
  termId: string; onClose: () => void;
}) {
  // The download button is one button now, but the two documents' generation
  // histories are still separate ledgers (each level is gated and re-issued
  // independently) — a small toggle inside the modal instead of two modals.
  const [level, setLevel] = useState<TransferCoverLevel>("undergrad");
  const { data: history } = useSWR<TransferCoverExportSummary[]>(
    `/exports/terms/${termId}/transfer-cover/history${transferCoverQuery(level)}`
  );
  const [reprinting, setReprinting] = useState<string | null>(null);

  async function reprint(h: TransferCoverExportSummary) {
    setReprinting(h.id);
    try {
      const blob = await api.get<Blob>(`/exports/transfer-cover/${h.id}/reprint`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = "transfer-cover.xlsx";
      el.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.danger("ดาวน์โหลดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setReprinting(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ประวัติการสร้างเอกสารปะหน้าจ่ายตรง"
      icon={<History size={20} />}
      size="xl"
      footer={<Button variant="ghost" onClick={onClose}>ปิด</Button>}
    >
      <div className="mb-3 inline-flex rounded-lg border border-border p-0.5">
        {(["undergrad", "graduate"] as const).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (level === l ? "bg-brand text-white" : "text-ink-2 hover:text-ink-1")
            }
          >
            {transferCoverLevelLabel[l]}
          </button>
        ))}
      </div>
      {!history?.length ? (
        <EmptyState
          icon={<FileText size={26} />}
          title="ยังไม่เคยสร้างเอกสาร"
          description="เอกสารที่สร้างแล้วจะมาแสดงที่นี่ พร้อมปุ่มดาวน์โหลดฉบับเดิม"
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {history.map(h => (
            <li key={h.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-1 flex items-center gap-1.5">
                  {new Date(h.generated_at).toLocaleString("th-TH", {
                    dateStyle: "medium", timeStyle: "short",
                  })}
                  {/* Pre-level-split rows (12/08/2026) covered both files at
                      once — flag that explicitly rather than silently
                      claiming this was already a level-scoped generation. */}
                  {!h.level && <Chip tone="neutral">ก่อนแยกไฟล์ — ครอบคลุมทั้งสองระดับ</Chip>}
                </div>
                {/* Which slice this file was. Two files for one term now differ
                    only by their months, so without this the history reads as
                    the same document generated twice. */}
                <div className="text-xs text-ink-2">
                  {h.months?.length
                    ? `เดือน ${h.months[0]}${h.months.length > 1 ? ` – ${h.months[h.months.length - 1]}` : ""}`
                    : "ทั้งภาคเรียน"}
                </div>
                <div className="text-xs text-ink-3">
                  {h.total_baht.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท ·{" "}
                  {h.sheet_count} ชีต
                  {h.generated_by && ` · โดย ${h.generated_by}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void reprint(h)}
                disabled={reprinting !== null}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Download size={12} />
                {reprinting === h.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลดฉบับเดิม"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

interface CourseGroupCourseInfo {
  id: string;
  code: string;
  name_th: string;
  curriculum: string;
}
interface CourseGroupCandidate {
  courses: CourseGroupCourseInfo[];
  suggested_primary_id: string;
  reason: string;
}
interface CurriculumLite {
  code: string;
  sheet_name: string;
}

// useCourseGroupGate — the check every download now goes through instead of
// staff having to remember a separate "รหัสคู่" button. guard(proceed) checks
// for unconfirmed course-group candidates (DetectCourseGroups: same name_th +
// a matching section schedule — the exact signal a curriculum transition
// leaves behind when the old registrar code stays open alongside the new
// one); if none exist, proceed runs immediately, otherwise the gate modal
// opens and proceed is held until staff dismiss it (merge everything, merge
// some and continue, or continue without merging).
function useCourseGroupGate(termId: string) {
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const proceedRef = useRef<(() => void) | null>(null);

  async function guard(proceed: () => void) {
    if (!termId) return;
    setChecking(true);
    try {
      const candidates = await api.get<CourseGroupCandidate[]>(`/terms/${termId}/course-groups/candidates`);
      if (candidates.length > 0) {
        proceedRef.current = proceed;
        setOpen(true);
      } else {
        proceed();
      }
    } catch (e) {
      toast.danger("ตรวจสอบรหัสวิชาคู่ไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }

  function continueAnyway() {
    setOpen(false);
    const proceed = proceedRef.current;
    proceedRef.current = null;
    proceed?.();
  }

  const modal = open && (
    <CourseGroupGateModal
      termId={termId}
      onClose={() => { setOpen(false); proceedRef.current = null; }}
      onContinue={continueAnyway}
    />
  );

  return { guard, checking, modal };
}

// CourseGroupGateModal — a class taught under two registrar codes (a rename,
// a section split, or right now the curriculum transition leaving the old
// code open for students who have not graduated) must be merged before ใบ A
// / ใบ B print it as one row with its money and student counts added
// together. The backend already detects candidates (DetectCourseGroups) and
// confirms them (ConfirmCourseGroup); this modal is the review step, shown in
// front of a download instead of behind a button staff had to remember to
// press on their own.
function CourseGroupGateModal({
  termId, onClose, onContinue,
}: {
  termId: string; onClose: () => void; onContinue: () => void;
}) {
  const candidatesKey = `/terms/${termId}/course-groups/candidates`;
  const { data: candidates } = useSWR<CourseGroupCandidate[]>(candidatesKey);
  const { data: curricula } = useSWR<CurriculumLite[]>("/curricula");
  const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
  // Per-candidate choice, keyed by index into `candidates` — candidates
  // disappear from the list once confirmed (DetectCourseGroups excludes
  // anything already in course_group_members), so a stale index just means
  // that row is gone, never a wrong one being acted on.
  const [choices, setChoices] = useState<Record<number, { primaryId: string; curriculumCode: string }>>({});
  // Staff read the first 2-3 candidates, missed that the list kept going below
  // the fold, and confirmed a download thinking they'd reviewed everything —
  // this tracks whether ScrollShadow can still see content below so the "เลื่อน
  // ลงดู" hint only shows while it's actually true, not as a permanent fixture.
  const [moreBelow, setMoreBelow] = useState(false);

  // Nothing left to review once every candidate is merged or the list was
  // empty to begin with — resume the download on its own instead of making
  // staff press a second button right after their last "ยืนยันรวมวิชา".
  useEffect(() => {
    if (candidates && candidates.length === 0) onContinue();
  }, [candidates, onContinue]);

  function choiceFor(idx: number, c: CourseGroupCandidate) {
    const existing = choices[idx];
    if (existing) return existing;
    const primary = c.courses.find(x => x.id === c.suggested_primary_id);
    return { primaryId: c.suggested_primary_id, curriculumCode: primary?.curriculum ?? "" };
  }
  function setChoice(idx: number, next: { primaryId: string; curriculumCode: string }) {
    setChoices(s => ({ ...s, [idx]: next }));
  }

  async function confirm(idx: number, c: CourseGroupCandidate) {
    const choice = choiceFor(idx, c);
    if (!choice.curriculumCode) {
      toast.danger("กรุณาเลือกหลักสูตรก่อนยืนยัน");
      return;
    }
    setConfirmingIdx(idx);
    try {
      await api.post(`/terms/${termId}/course-groups`, {
        course_ids: c.courses.map(x => x.id),
        primary_course_id: choice.primaryId,
        curriculum_code: choice.curriculumCode,
      });
      toast.success(`รวมวิชา ${c.courses.map(x => x.code).join("/")} แล้ว`);
      void mutate(candidatesKey);
    } catch (e) {
      toast.danger("ยืนยันไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setConfirmingIdx(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        candidates?.length
          ? `พบวิชาที่อาจเป็นรหัสคู่กัน (${candidates.length} รายการ)`
          : "พบวิชาที่อาจเป็นรหัสคู่กัน"
      }
      icon={<Merge size={20} />}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิกการดาวน์โหลด</Button>
          <Button variant="primary" onClick={onContinue}>ดาวน์โหลดต่อโดยไม่รวมที่เหลือ</Button>
        </>
      }
    >
      <p className="text-sm text-muted mb-3">
        ระบบพบวิชาที่ชื่อ ผู้สอน และตารางสอนตรงกัน ซึ่งอาจเป็นวิชาเดียวกันที่มีสองรหัส
        (เช่นช่วงเปลี่ยนผ่านหลักสูตรที่รหัสเก่ายังต้องเปิดให้นักศึกษาที่ยังไม่จบ) เลือกรวมรหัส
        ด้านล่างเพื่อให้เอกสารพิมพ์เป็นแถวเดียว โดยนำรหัสวิชามาต่อกันและรวมจำนวนนักศึกษาเข้าด้วยกัน
        หรือกดดาวน์โหลดต่อเพื่อพิมพ์แยกกันตามเดิม
      </p>
      {!candidates?.length ? (
        <div className="py-6 text-center text-sm text-muted">กำลังตรวจสอบ…</div>
      ) : (
        <div className="relative">
          <ScrollShadow
            className="space-y-4 max-h-[60vh] pr-1"
            onVisibilityChange={v => setMoreBelow(v === "bottom" || v === "both")}
          >
          {candidates.map((c, idx) => {
            const choice = choiceFor(idx, c);
            return (
              <div key={c.courses.map(x => x.id).join(",")} className="rounded-lg border border-border p-3 space-y-2.5">
                <div className="text-xs text-muted">{c.reason}</div>
                <div className="space-y-1.5">
                  {c.courses.map(course => (
                    <label key={course.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`primary-${idx}`}
                        checked={choice.primaryId === course.id}
                        onChange={() => setChoice(idx, { ...choice, primaryId: course.id })}
                      />
                      <span className="font-medium tabular-nums">{course.code}</span>
                      <span className="text-ink-2">{course.name_th}</span>
                      {course.curriculum && <Chip tone="neutral">{course.curriculum}</Chip>}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Select
                    value={choice.curriculumCode}
                    onChange={e => setChoice(idx, { ...choice, curriculumCode: e.target.value })}
                    className="max-w-[16rem]"
                  >
                    <option value="">เลือกหลักสูตรที่จะลงชีต</option>
                    {(curricula ?? []).map(cur => (
                      <option key={cur.code} value={cur.code}>{cur.sheet_name}</option>
                    ))}
                  </Select>
                  <Button
                    variant="primary"
                    isPending={confirmingIdx === idx}
                    onClick={() => void confirm(idx, c)}
                  >
                    <Merge size={14} /> ยืนยันรวมวิชา
                  </Button>
                </div>
              </div>
            );
          })}
          </ScrollShadow>
          {moreBelow && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1">
              <span className="flex items-center gap-1 rounded-full bg-ink-1 px-2.5 py-1 text-[11px] font-medium text-white shadow-md">
                เลื่อนลงเพื่อดูวิชาที่เหลือ <ChevronDown size={12} className="animate-bounce" />
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
