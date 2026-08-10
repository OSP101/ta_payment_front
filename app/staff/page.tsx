"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Users,
  ClipboardCheck,
  FileText,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  CalendarPlus,
  CalendarOff,
} from "lucide-react";
import { PageHeader, Panel, StatCard, Chip, Button, Alert, EmptyState } from "../components/ui";
import { type Executive, emptyExecutive } from "./types";
import { useTerm, useTermKey } from "./TermContext";
import BudgetAnalytics from "./BudgetAnalytics";

function formatThaiDate(iso?: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// One row of the "สิ่งที่ต้องทำตอนนี้" panel. `blocker` marks work that stops
// a later step rather than being a step itself — it is listed first because
// clearing the queues below it will not help until it is done.
interface Todo {
  count: number;
  step?: number;
  title: string;
  detail: string;
  href: string;
  action: string;
  blocker?: boolean;
}

export default function StaffDashboard() {
  // Same key StaffShell uses, so SWR dedupes it into one request and the badges
  // can never disagree with the cards.
  const { data } = useSWR<Executive>(useTermKey("/dashboard/executive"));
  const s = data ?? emptyExecutive;
  const { terms, termId, loaded } = useTerm();

  // Gate: nothing on this page means anything without at least one term to
  // scope it to. `loaded` distinguishes "still loading" from "confirmed none
  // created yet" — same pattern as the teaching page's noTerms check.
  const noTerms = loaded && (terms?.length ?? 0) === 0;
  // is_active is a manual flag (see academic_terms migration 0066) — a term
  // whose window has passed does not clear it on its own, so staff can be
  // looking at a dashboard scoped to a semester that ended weeks ago with
  // nothing on screen saying so.
  const activeTerm = terms?.find(t => t.is_active);
  const todayISO = new Date().toISOString().slice(0, 10);
  const termExpired = !!activeTerm?.ends_on && activeTerm.ends_on < todayISO;
  const noActiveTerm = loaded && !noTerms && !activeTerm;

  // The dashboard used to warn about exactly one thing (missing student
  // counts) and stay silent about every queue, so "nothing on screen" meant
  // both "all clear" and "nobody has looked". Every outstanding item now
  // appears here, and an empty list says so explicitly.
  const todos: Todo[] = [
    {
      count: s.missing_student_counts, blocker: true,
      title: "ยังไม่ได้กรอกจำนวนนักศึกษา",
      detail: "ต้องกรอกก่อนจึงจะส่งออกเอกสารเบิกจ่ายได้ (งบคำนวณจากจำนวนนักศึกษา)",
      href: "/staff/teaching", action: "กรอกจำนวนนักศึกษา",
    },
    {
      count: s.pending_ta_requests, step: 1,
      title: "คำร้องขอ TA รอตรวจ",
      detail: "อาจารย์ส่งคำขอมาแล้ว รออนุมัติหรือปฏิเสธ",
      href: "/staff/approvals", action: "ตรวจคำร้อง",
    },
    {
      count: s.pending_reviews, step: 2,
      title: "แบบฟอร์มใบแจ้งหนี้รอตรวจ",
      detail: "TA ส่งเอกสารครบแล้ว รอเจ้าหน้าที่ตรวจและอนุมัติ",
      href: "/staff/review", action: "ตรวจเอกสาร",
    },
    {
      // Appointment orders gate payout review: a TA without one cannot be
      // paid, so approved names waiting for a round are work on the officer's
      // desk even though the page lives under จัดการ, not a numbered step.
      count: s.pending_appointments,
      title: "TA รอออกคำสั่งแต่งตั้ง",
      detail: "อนุมัติคำขอแล้วแต่ยังไม่อยู่ในคำสั่งแต่งตั้งรอบใด ต้องออกคำสั่งก่อนจึงจะเบิกจ่ายได้",
      href: "/staff/appointments", action: "ออกคำสั่ง",
    },
    {
      // One line for what used to be two. Steps 3 and 4 are the same errand and
      // now the same screen, so two to-do cards pointing at it would only ask
      // the officer to decide which half to click.
      count: s.payout_courses_actionable, step: 3,
      title: "วิชาที่รอตรวจ / รอส่งออก",
      detail: "อาจารย์อนุมัติชั่วโมงแล้ว รอเจ้าหน้าที่ตรวจยอดเงินและส่งออกเอกสาร",
      href: "/staff/payouts", action: "เปิดรายการ",
    },
  ].filter(t => t.count > 0);

  // Every figure below is scoped to one term, so the term belongs in the page
  // header rather than repeated on each card.
  const termText = s.term_label ? `ปีการศึกษา ${s.term_label}` : "";

  return (
    <div>
      <PageHeader
        title="แดชบอร์ดผู้ดูแลระบบ"
        description={termText
          ? `ภาพรวมการดำเนินงาน ${termText}`
          : "ภาพรวมการดำเนินงานของระบบ TA Payment"}
      />

      {noTerms ? (
        // Every card below reads zero without a term to scope it to — showing
        // them anyway would look like an honest "nothing going on" instead of
        // "the system isn't set up yet". Same gate the teaching page uses.
        <Panel padded={false}>
          <EmptyState
            icon={<CalendarPlus size={28} />}
            title="ยังไม่ได้สร้างปีการศึกษา / ภาคเรียน"
            description="ต้องสร้างปีการศึกษาและภาคเรียนอย่างน้อย 1 รายการก่อน จึงจะเปิดวิชาสอน อนุมัติคำขอ TA และดำเนินงานขั้นตอนอื่น ๆ ต่อได้"
            action={
              <Link href="/staff/settings?tab=terms">
                <Button variant="primary">
                  <CalendarPlus size={16} /> สร้างปีการศึกษา / ภาคเรียน
                </Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <>
          {(termExpired || noActiveTerm) && (
            <div className="mb-5">
              <Alert
                status="warning"
                icon={<CalendarOff size={16} />}
                title={termExpired
                  ? `ภาคเรียนที่ใช้งานอยู่สิ้นสุดแล้ว (${formatThaiDate(activeTerm?.ends_on)})`
                  : "ยังไม่ได้ตั้งภาคเรียนที่ใช้งานอยู่"}
                description={termExpired
                  ? `ภาคเรียน ${activeTerm?.academic_year}/${activeTerm?.semester} หมดเขตแล้ว กรุณาสร้างภาคเรียนถัดไปและตั้งเป็นภาคเรียนที่ใช้งาน มิฉะนั้นเมนูอื่นจะยังอ้างอิงภาคเรียนที่หมดเขตนี้อยู่`
                  : "ไม่มีภาคเรียนใดถูกตั้งเป็นภาคเรียนที่ใช้งานอยู่ กรุณาตรวจสอบที่หน้าตั้งค่า"}
                action={
                  <Link href="/staff/settings?tab=terms">
                    <Button variant="secondary" size="sm">ไปตั้งค่าภาคเรียน</Button>
                  </Link>
                }
              />
            </div>
          )}

          <TodoPanel todos={todos} loading={!data} />

          {/* md stays at 2 columns: the sidebar is already open at that width, so a
              3-column row leaves ~85px of text per card and clips the longer
              labels. 3 columns only from lg. */}
          <div data-tour="dash-stats" className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
            <StatCard label="วิชาที่เปิดสอน" value={s.total_courses} icon={<BookOpen size={18} />} tone="brand"
                      hint={termText || undefined} />
            <StatCard label="TA ทั้งหมด" value={s.total_tas} icon={<Users size={18} />}
                      hint="ปฏิบัติงานในเทอมนี้" />
            <StatCard label="วิชาที่มีการขอใช้ TA" value={s.courses_with_ta} icon={<GraduationCap size={18} />} tone="success"
                      hint={s.total_courses > 0 ? `${((s.courses_with_ta / s.total_courses) * 100).toFixed(0)}% ของวิชาที่เปิดสอน` : undefined} />
            {/* The two review queues live on different pages — each card links to its own. */}
            <StatCard label="แบบฟอร์มหนี้รอตรวจ" value={s.pending_reviews} icon={<FileText size={18} />}
                      tone={s.pending_reviews > 0 ? "warn" : "default"}
                      hint="ขั้นที่ 2" href="/staff/review" />
            <StatCard label="วิชาที่รอตรวจ / รอส่งออก" value={s.payout_courses_actionable} icon={<ClipboardCheck size={18} />}
                      tone={s.payout_courses_actionable > 0 ? "warn" : "default"}
                      hint="ขั้นที่ 3" href="/staff/payouts" />
            {/* No budget StatCard here any more: the analytics section below is the
                budget's single source on this page (settle-based). A second figure
                from the old hours×rate sum sat 12% above it and invited the
                question "which one is right?" */}
          </div>

          {/* มุมบริหาร — เงินไปไหน เร็วแค่ไหน หลักสูตรไหนใช้เยอะ. Same component the
              executive page renders, so the two audiences read identical numbers. */}
          <BudgetAnalytics termId={termId} />

          <div className="grid gap-4 mt-4 lg:grid-cols-3">
            <Panel title="ทางลัด" description="เมนูใช้บ่อย" data-tour="dash-shortcuts">
              <ul className="divide-y divide-[var(--hairline)]">
                <ShortcutRow href="/staff/approvals" title="อนุมัติคำขอ TA" />
                <ShortcutRow href="/staff/review" title="ตรวจสอบแบบฟอร์มใบแจ้งหนี้" />
                <ShortcutRow href="/staff/payouts" title="ตรวจและส่งออกเอกสาร" />
                <ShortcutRow href="/staff/teaching" title="วิชาที่เปิดสอน" />
                <ShortcutRow href="/staff/appointments" title="ใบแต่งตั้งทีเอ" />
                <ShortcutRow href="/staff/budget-summary" title="สรุปงบและปะหน้าจ่ายตรง" />
              </ul>
            </Panel>
            {/* Deliberately no "รอตรวจ" lines here any more — those live in the
                to-do panel at the top, and repeating them made two places to keep
                in sync while telling the reader nothing new. */}
            <Panel title="สถานะโดยรวม" description={`ภาพรวมของเทอม ${s.term_label || "—"}`}>
              <div className="space-y-3">
                <SummaryLine
                  label="วิชาที่ยังไม่ขอใช้ TA"
                  chip={<Chip tone={s.total_courses - s.courses_with_ta > 0 ? "warn" : "success"}>
                    {s.total_courses - s.courses_with_ta} วิชา
                  </Chip>}
                />
                <SummaryLine
                  label="TA ที่ปฏิบัติงาน"
                  chip={<Chip tone={s.total_tas > 0 ? "success" : "warn"}>{s.total_tas} คน</Chip>}
                />
              </div>
            </Panel>
            <Panel title="คู่มือระบบ" description="ลิงก์เอกสารและเวิร์กโฟลว์">
              <ul className="space-y-2 text-sm">
                <li className="text-[var(--ink-2)]">• เจ้าหน้าที่นำเข้าตารางสอนจาก Excel → อาจารย์ขอ TA → เจ้าหน้าที่อนุมัติ</li>
                <li className="text-[var(--ink-2)]">• TA กรอกข้อมูล/เอกสาร + บันทึกเวลาปฏิบัติงาน → อาจารย์อนุมัติ/ปฏิเสธรายวัน (คือการตรวจจริง ไม่มีการเซ็นในระบบ)</li>
                <li className="text-[var(--ink-2)]">• อนุมัติครบ → เจ้าหน้าที่ตรวจสอบและส่งออกไฟล์ ZIP (ล็อกบันทึกเวลาของเดือนนั้น) → ยืนยันส่งการเงิน</li>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* สิ่งที่ต้องทำตอนนี้                                                          */
/* -------------------------------------------------------------------------- */

function TodoPanel({ todos, loading }: { todos: Todo[]; loading: boolean }) {
  // While loading, render nothing rather than an "all clear" that may be about
  // to turn into four outstanding items — a false all-clear is worse than a
  // brief gap.
  if (loading) {
    return <div className="mb-5 h-24 rounded-xl border border-border bg-surface animate-pulse" />;
  }

  if (todos.length === 0) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3">
        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div className="text-sm text-emerald-900 dark:text-emerald-100">
          <b>ไม่มีงานค้าง</b> ทุกขั้นตอนดำเนินการครบแล้ว
        </div>
      </div>
    );
  }

  const total = todos.reduce((n, t) => n + t.count, 0);
  return (
    <div data-tour="dash-todo" className="mb-5 rounded-xl border border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          สิ่งที่ต้องทำตอนนี้
        </span>
        <span className="rounded-full bg-amber-200/70 dark:bg-amber-800/50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-100">
          {total} รายการ
        </span>
      </div>
      <ul className="divide-y divide-amber-200/70 dark:divide-amber-800/40">
        {todos.map(t => (
          <li key={t.href}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span
              aria-hidden
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200/80 dark:bg-amber-800/60 text-[11px] font-bold text-amber-900 dark:text-amber-100"
            >
              {t.step ?? "!"}
            </span>
            {/* basis-48 keeps the text from shrinking to make room for the
                button: on a phone the two then no longer fit side by side and
                flex-wrap drops the button to its own line, instead of squeezing
                the description into a four-word column. */}
            <div className="min-w-0 flex-1 basis-48">
              <div className="text-sm font-medium text-amber-950 dark:text-amber-50">
                {t.title} <span className="tabular-nums">({t.count})</span>
                {t.blocker && (
                  <span className="ms-2 rounded bg-amber-200/80 dark:bg-amber-800/60 px-1.5 py-0.5 text-[10px] font-semibold align-middle">
                    ติดขัด
                  </span>
                )}
              </div>
              <div className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">{t.detail}</div>
            </div>
            <Link href={t.href} className="ms-auto shrink-0">
              <Button variant="primary" size="sm">{t.action}</Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortcutRow({ href, title, hint }: { href: string; title: string; hint?: string }) {
  return (
    <li>
      <Link href={href}
            className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-4 px-4 rounded-md group">
        <div>
          <div className="text-sm font-medium text-[var(--ink-1)]">{title}</div>
          {hint && <div className="text-xs text-[var(--ink-3)] mt-0.5">{hint}</div>}
        </div>
        <ArrowUpRight size={16} className="text-[var(--ink-4)] group-hover:text-[var(--brand)]" />
      </Link>
    </li>
  );
}

function SummaryLine({ label, chip }: { label: string; chip: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--hairline)] last:border-0">
      <div className="text-sm text-[var(--ink-2)]">{label}</div>
      {chip}
    </div>
  );
}
