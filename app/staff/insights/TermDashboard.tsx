"use client";
/* -------------------------------------------------------------------------- */
/* แดชบอร์ดภาพรวมภาคเรียน — question-led (แบบ A, 26/09/2026)                   */
/* -------------------------------------------------------------------------- */
//
// Shared by /staff (under the officer's to-do list) and /executive (read-only
// for management). Three questions, each answered in one sentence before any
// chart, so an executive can stop reading after the sentence and an officer
// can keep scrolling into the detail:
//
//   1. งบพอถึงสิ้นเทอมไหม        — budget, forecast, pace, where the money goes
//   2. ขอ TA สมเหตุสมผลไหม      — requested vs recommended vs ceiling, per course
//   3. งานค้างอยู่ขั้นไหน         — the five TOR queues, returns, claim months
//
// Then every course in one searchable, sortable table. All figures come from
// one request (/dashboard/analytics): the money is settle-priced, the same as
// the printed claim and the Excel export.

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Download, Wallet, Users, BookOpen, Inbox, Sparkles, CircleCheck, TriangleAlert,
  OctagonAlert, Info, ArrowRight, CalendarClock, FileWarning, Undo2, CalendarX2, UserX, ChevronDown,
  Gauge, Scale, Workflow, Table2,
} from "lucide-react";
import { Panel, Button, Select } from "../../components/ui";
import { api, type Term } from "../../lib/api";
import type { TermAnalytics, StaffingStatus, CourseStaffing } from "../types";
import { curriculumTH } from "../types";
import { MonthlyChart, CurriculumBars } from "../BudgetAnalytics";
import {
  budgetView, budgetAnswer, staffingStats, staffingAnswer, pipelineAnswer, buildInsights,
  costPerStudent, STAFFING_META, PIPELINE_META, baht, bahtShort, num1, pct0, thDate, type Tone,
} from "./analysis";
import {
  BudgetGauge, BudgetStack, StaffingScatter, StatusLegend, VerdictBar, FlowChart, Donut, Spark,
} from "./charts";
import CourseExplorer from "./CourseExplorer";

const TONE: Record<Tone, { icon: typeof Info; text: string; bg: string; ring: string }> = {
  good:   { icon: CircleCheck,   text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", ring: "border-emerald-200 dark:border-emerald-900" },
  info:   { icon: Info,          text: "text-sky-700 dark:text-sky-400",         bg: "bg-sky-50 dark:bg-sky-950/30",         ring: "border-sky-200 dark:border-sky-900" },
  warn:   { icon: TriangleAlert, text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-950/30",     ring: "border-amber-200 dark:border-amber-900" },
  danger: { icon: OctagonAlert,  text: "text-red-700 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-950/30",         ring: "border-red-200 dark:border-red-900" },
  muted:  { icon: Info,          text: "text-[var(--ink-3)]",                     bg: "bg-slate-50 dark:bg-zinc-800/40",      ring: "border-[var(--border)]" },
};

export default function TermDashboard({
  termId, staffLinks = false,
}: {
  termId: string;
  /** Queue cards and course codes link into /staff pages. */
  staffLinks?: boolean;
}) {
  const key = termId ? `/dashboard/analytics?term_id=${termId}` : "/dashboard/analytics";
  const { data: a, isLoading } = useSWR<TermAnalytics>(key);
  const { data: terms } = useSWR<Term[]>("/terms");
  const [compareId, setCompareId] = useState("");
  const { data: b } = useSWR<TermAnalytics>(compareId ? `/dashboard/analytics?term_id=${compareId}` : null);

  const [curriculum, setCurriculum] = useState("");
  const [status, setStatus] = useState<StaffingStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const view = useMemo(() => {
    if (!a) return null;
    const allRows = a.staffing ?? [];
    const rows = curriculum ? allRows.filter(r => r.curriculum === curriculum) : allRows;
    return {
      bv: budgetView(a),
      rows,
      st: staffingStats(rows),
      insights: buildInsights(a),
      curricula: [...new Set(allRows.map(r => r.curriculum))].sort(),
    };
  }, [a, curriculum]);

  const downloadXlsx = async () => {
    if (!a) return;
    setDownloading(true);
    try {
      const blob = await api.get<Blob>(`/dashboard/analytics.xlsx?term_id=${a.term_id}`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `ta-dashboard-${a.term_label.replace("/", "-") || "term"}.xlsx`;
      el.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!a || !view) {
    return (
      <div className="space-y-4" aria-busy={isLoading}>
        <div className="h-44 rounded-2xl border border-[var(--border)] bg-surface animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl border border-[var(--border)] bg-surface animate-pulse" />)}
        </div>
      </div>
    );
  }

  const { bv, rows, st, insights } = view;
  const bAns = budgetAnswer(bv);
  const sAns = staffingAnswer(st, a.plan.students_per_ta);
  const pAns = pipelineAnswer(a);
  const pendingTotal = a.pipeline?.stages.reduce((s, x) => s + x.count, 0) ?? 0;
  const returnedTotal = (a.pipeline?.docs_returned ?? 0) + (a.pipeline?.months_sent_back ?? 0) + (a.pipeline?.worklogs_rejected ?? 0);
  const monthly = (a.monthly ?? []).map(m => m.baht);
  const cps = costPerStudent(a.staffing ?? []);
  const compareOptions = (terms ?? []).filter(t => t.id !== a.term_id);
  const shownInsights = showAllInsights ? insights : insights.slice(0, 5);

  const selectCourse = (id: string | null) => {
    setSelected(id);
    if (id) {
      // Picking a course on the scatter clears a filter that would hide it.
      const row = (a.staffing ?? []).find(r => r.teaching_course_id === id);
      if (row && status && row.status !== status) setStatus("");
    }
  };

  return (
    <div className="space-y-6" data-tour="dash-analytics">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="ไปยังคำถาม" className="flex flex-wrap gap-1.5 me-auto">
          {[
            { id: "q-budget", label: "งบพอไหม", icon: Gauge },
            { id: "q-staffing", label: "ขอ TA เกินไหม", icon: Scale },
            { id: "q-work", label: "งานค้างที่ไหน", icon: Workflow },
            { id: "q-courses", label: "รายวิชา", icon: Table2 },
          ].map(n => (
            <a key={n.id} href={`#${n.id}`}
               className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-surface px-3 py-1 text-xs text-[var(--ink-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
              <n.icon size={13} />{n.label}
            </a>
          ))}
        </nav>
        {compareOptions.length > 0 && (
          <Select aria-label="เทียบกับภาคเรียน" value={compareId} onChange={e => setCompareId(e.target.value)}>
            <option value="">ไม่เปรียบเทียบ</option>
            {compareOptions.map(t => <option key={t.id} value={t.id}>เทียบกับ {t.academic_year}/{t.semester}</option>)}
          </Select>
        )}
        <Button variant="secondary" size="sm" onClick={downloadXlsx} disabled={downloading}>
          <Download size={15} className="me-1.5" />{downloading ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด Excel"}
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Hero: the 30-second read                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-surface">
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="relative flex flex-col items-center justify-center gap-2 border-b lg:border-b-0 lg:border-e border-[var(--hairline)] p-5
                          bg-[radial-gradient(120%_90%_at_0%_0%,rgba(7,118,188,0.10),transparent_60%)]">
            <div className="self-stretch flex items-center justify-between text-xs text-[var(--ink-3)]">
              <span>ภาคเรียน <b className="text-[var(--ink-1)]">{a.term_label}</b></span>
              {a.starts_on && a.ends_on && <span>{thDate(a.starts_on)} – {thDate(a.ends_on)}</span>}
            </div>
            <BudgetGauge b={bv} />
            <div className="text-center">
              <div className="text-xs text-[var(--ink-3)]">
                งบรวมภาคเรียน (ผลรวมงบรายวิชาที่ขอ TA)
              </div>
              <div className="text-2xl font-semibold tabular-nums text-[var(--ink-1)]">
                {baht(bv.used)} <span className="text-base font-normal text-[var(--ink-3)]">/ {baht(bv.base)} บาท</span>
              </div>
            </div>
            <Answer tone={bAns.tone} text={bAns.text} compact />
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[var(--brand-soft,#e7f3fb)] text-[var(--brand)] dark:bg-sky-950/50">
                <Sparkles size={15} />
              </span>
              <h2 className="text-base font-semibold text-[var(--ink-1)]">ข้อสังเกตจากระบบ</h2>
              <span className="hidden sm:inline text-xs text-[var(--ink-3)]">วิเคราะห์อัตโนมัติจากข้อมูลล่าสุด</span>
            </div>
            {insights.length === 0 ? (
              <p className="text-sm text-[var(--ink-3)]">ยังไม่มีข้อมูลพอให้วิเคราะห์</p>
            ) : (
              <ul className="space-y-2">
                {shownInsights.map((it, i) => {
                  const T = TONE[it.tone];
                  return (
                    <li key={i}>
                      <a href={it.target ? `#q-${it.target}` : undefined}
                         className={`flex gap-3 rounded-xl border ${T.ring} ${T.bg} px-3 py-2.5 transition hover:shadow-sm`}>
                        <T.icon size={17} className={`mt-0.5 shrink-0 ${T.text}`} />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium ${T.text}`}>{it.title}</div>
                          {it.detail && <div className="text-xs text-[var(--ink-2)] mt-0.5">{it.detail}</div>}
                        </div>
                        {it.target && <ArrowRight size={14} className="mt-1 shrink-0 text-[var(--ink-4)]" />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {insights.length > 5 && (
              <button type="button" onClick={() => setShowAllInsights(v => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
                <ChevronDown size={13} className={showAllInsights ? "rotate-180" : ""} />
                {showAllInsights ? "ย่อ" : `ดูทั้งหมด ${insights.length} ข้อ`}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* KPI row (TOR 3.13 figures)                                          */}
      {/* ------------------------------------------------------------------ */}
      <div data-tour="dash-stats" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={<BookOpen size={18} />} label="รายวิชาที่ขอ TA"
             value={<>{a.courses_with_ta}<small> / {a.courses_open} วิชา</small></>}
             hint={a.pipeline?.courses_no_ta ? `วิชาที่มีนักศึกษาแต่ยังไม่ขอ ${a.pipeline.courses_no_ta} วิชา` : "ทุกวิชาที่มีนักศึกษาขอ TA แล้ว"}
             delta={b ? delta(a.courses_with_ta, b.courses_with_ta, b.term_label) : undefined} />
        <Kpi icon={<Users size={18} />} label="TA ปฏิบัติงานจริง / ทั้งหมด"
             value={<>{a.active_tas}<small> / {a.total_tas} คน</small></>}
             hint={`ป.ตรี ${a.tas_undergrad} · บัณฑิต ${a.tas_graduate} · มีชั่วโมงอนุมัติแล้ว ${a.active_tas} คน`}
             delta={b ? delta(a.total_tas, b.total_tas, b.term_label) : undefined} />
        <Kpi icon={<Wallet size={18} />} label="งบรวม / เบิกจ่ายแล้ว / คงเหลือ"
             value={<>{bahtShort(bv.base)}<small> บาท</small></>}
             hint={`เบิกจ่ายแล้ว ${baht(bv.used)} · คงเหลือ ${baht(bv.remaining)} · จาก ${a.courses_with_ta} วิชาที่ขอ TA`}
             extra={<Spark values={monthly} w={64} h={26} />}
             delta={b ? delta(a.budget_allocated, b.budget_allocated, b.term_label, "บาท") : undefined} />
        <Kpi icon={<Inbox size={18} />} label="รายการรอดำเนินการ" tone={pendingTotal > 0 ? "warn" : "good"}
             value={<>{pendingTotal}<small> รายการ</small></>}
             hint={returnedTotal > 0 ? `ถูกตีกลับให้แก้ไข ${returnedTotal} รายการ` : "ไม่มีรายการถูกตีกลับ"} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Q1 — งบพอไหม                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Question id="q-budget" n={1} title="งบพอถึงสิ้นเทอมไหม?" answer={bAns} tour="dash-budget">
        <Panel>
          <BudgetStack b={bv} />
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric label="เบิกจ่ายแล้ว" value={baht(bv.used)} unit="บาท" sub={`${pct0(bv.usedPct)} ของงบรวม`} />
            <Metric label="คาดการณ์สิ้นเทอม" value={bv.projectedHigh - bv.projectedLow > 1 ? `${bahtShort(bv.projectedLow)}–${bahtShort(bv.projectedHigh)}` : baht(bv.projectedHigh)} unit="บาท"
                    sub={bv.runRate ? "ต่ำสุดจากที่บันทึกแล้ว สูงสุดจากอัตราใช้จ่าย" : "จากชั่วโมงที่บันทึกแล้ว"} />
            <Metric label="เฉลี่ยต่อเดือน" value={baht(bv.avgMonthly)} unit="บาท" sub={`${(a.monthly ?? []).filter(m => m.baht > 0).length} เดือนที่มีการเบิก`} />
            <Metric label="ใช้ได้อีกต่อเดือน" value={bv.monthlyRoom != null ? baht(bv.monthlyRoom) : "–"} unit={bv.monthlyRoom != null ? "บาท" : ""}
                    sub={bv.monthsLeft != null ? `เหลือเวลา ${num1(bv.monthsLeft)} เดือน` : "ยังไม่ได้ตั้งวันสิ้นสุดเทอม"}
                    tone={bv.monthlyRoom != null && bv.monthlyRoom < bv.avgMonthly ? "warn" : undefined} />
            <Metric label="ค่าเฉลี่ยต่อชั่วโมง" value={a.approved_hours > 0 ? num1(a.budget_used / a.approved_hours) : "–"} unit={a.approved_hours > 0 ? "บาท" : ""}
                    sub={`${num1(a.approved_hours)} ชม. อนุมัติ`} />
            <Metric label="ค่ากลางต่อนักศึกษา" value={cps.median > 0 ? baht(cps.median) : "–"} unit={cps.median > 0 ? "บาท/คน" : ""}
                    sub={bv.unfunded > 0 ? `งานเกินเพดาน ${baht(bv.unfunded)} บาท` : "ไม่มีงานเกินเพดานวิชา"}
                    tone={bv.unfunded > 0 ? "danger" : undefined} />
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-[var(--ink-2)]">
            <Info size={14} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
            งบรวมของภาคเรียนคือผลรวมงบของทุกวิชาที่ส่งคำขอ TA ({a.courses_with_ta} วิชา) คำนวณจากจำนวนนักศึกษาและหน่วยกิตของแต่ละวิชา
            เป็นยอดที่ต้องขอกันไว้สำหรับภาคเรียนนี้ และเพิ่มขึ้นเองเมื่อมีวิชาส่งคำขอเข้ามา
          </p>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title="การเบิกจ่ายรายเดือน" description="แท่งคือยอดแต่ละเดือน เส้นสีเขียวคือยอดสะสม" className="min-w-0 lg:col-span-3">
            <MonthlyChart a={a} b={b ?? undefined} />
          </Panel>
          <Panel title="การใช้งบรายหลักสูตร" description="วิชาที่เปิดให้หลายหลักสูตร นับในหลักสูตรหลักของวิชา" className="min-w-0 lg:col-span-2">
            <CurriculumBars a={a} />
          </Panel>
        </div>
      </Question>

      {/* ------------------------------------------------------------------ */}
      {/* Q2 — ขอ TA สมเหตุสมผลไหม                                           */}
      {/* ------------------------------------------------------------------ */}
      <Question id="q-staffing" n={2} title="แต่ละวิชาขอ TA เกินที่แนะนำหรือเกินจำนวนนักศึกษาไหม?" answer={sAns}
                action={view.curricula.length > 1 ? (
                  <Select aria-label="กรองหลักสูตร" value={curriculum} onChange={e => { setCurriculum(e.target.value); setSelected(null); }}>
                    <option value="">ทุกหลักสูตร</option>
                    {view.curricula.map(c => <option key={c || "none"} value={c}>{curriculumTH(c)}</option>)}
                  </Select>
                ) : undefined}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
          <Panel title="นักศึกษา เทียบ TA ที่ขอ"
                 description={`จุดแต่ละจุดคือหนึ่งวิชา เหนือเส้นเขียวคือขอมากกว่าเกณฑ์ 1 ต่อ ${a.plan.students_per_ta} คน เหนือเส้นประแดงคือเกินเพดาน 1 ต่อ ${a.plan.min_students_per_ta} คน คลิกจุดเพื่อดูวิชาในตาราง`}
                 className="min-w-0">
            <div className="mb-3"><StatusLegend counts={st.counts} picked={status} onPick={s => { setStatus(s); document.getElementById("q-courses")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} /></div>
            <StaffingScatter rows={rows} plan={a.plan} selected={selected} onSelect={id => { selectCourse(id); }} />
            <p className="mt-2 text-[11px] text-[var(--ink-4)]">
              ระบบแนะนำตามกลุ่มเรียนที่เรียนพร้อมกัน กลุ่มละ 1 คนต่อนักศึกษา {a.plan.students_per_ta} คน
              {a.plan.suggested_ta_cap > 0 ? ` (สูงสุด ${a.plan.suggested_ta_cap} คนต่อกลุ่ม)` : ""} อย่างน้อยกลุ่มละ 1 คน
              เส้นในกราฟเป็นเกณฑ์ระดับวิชาเพื่อให้เห็นภาพ ผลการเทียบของแต่ละวิชาคิดรายกลุ่มเรียน
            </p>
          </Panel>
          <div className="space-y-4 min-w-0">
            <Panel title="สรุปการขอ TA">
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="นศ. ในวิชาที่ขอ" value={st.students.toLocaleString("th-TH")} />
                <MiniStat label="TA ที่ขอ / แนะนำ" value={`${st.requested} / ${st.recommended}`}
                          tone={st.requested > st.recommended ? "warn" : undefined} />
                <MiniStat label="นศ. ต่อ TA" value={st.ratio ? num1(st.ratio) : "–"} sub={`เกณฑ์ ${a.plan.students_per_ta}`} />
              </div>
              <div className="mt-4">
                <VerdictBar counts={st.counts} />
                <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-3)]">
                  <span>{st.compliance != null ? `${pct0(st.compliance)} อยู่ในเกณฑ์หรือต่ำกว่า` : ""}</span>
                  <span>{st.withReq} วิชาที่ขอ</span>
                </div>
              </div>
            </Panel>
            <Panel title="วิชาที่ควรทบทวน" description="ขอ TA มากกว่าที่แนะนำ เรียงจากเกินมากที่สุด">
              <CourseList rows={st.review.slice(0, 6)} empty="ไม่มีวิชาที่ขอเกินที่แนะนำ" onPick={selectCourse}
                          right={r => <span className="text-red-600 dark:text-red-400">+{r.requested - r.recommended}</span>} />
            </Panel>
            {st.under.length > 0 && (
              <Panel title="วิชาที่ TA อาจไม่พอ" description="ขอน้อยกว่าที่แนะนำ">
                <CourseList rows={st.under.slice(0, 4)} empty="" onPick={selectCourse}
                            right={r => <span className="text-sky-600 dark:text-sky-400">{r.requested - r.recommended}</span>} />
              </Panel>
            )}
          </div>
        </div>
      </Question>

      {/* ------------------------------------------------------------------ */}
      {/* Q3 — งานค้างอยู่ขั้นไหน                                            */}
      {/* ------------------------------------------------------------------ */}
      <Question id="q-work" n={3} title="งานค้างอยู่ขั้นไหน?" answer={pAns}>
        {a.pipeline && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {a.pipeline.stages.map((s, i) => {
              const m = PIPELINE_META[s.key];
              const hot = pAns.bottleneck === s.key && s.count > 0;
              const card = (
                <div className={`relative h-full rounded-xl border p-3 transition ${hot ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20" : "border-[var(--border)] bg-surface"} ${staffLinks ? "hover:shadow-md" : ""}`}>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
                    <span className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${s.count > 0 ? "bg-[var(--brand)] text-white" : "bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300"}`}>{i + 1}</span>
                    ขั้นที่ {i + 1}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-[var(--ink-1)]">{m.label}</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${s.count > 0 ? (hot ? "text-amber-700 dark:text-amber-400" : "text-[var(--ink-1)]") : "text-[var(--ink-4)]"}`}>{s.count}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-3)] line-clamp-2">
                    {s.oldest_days != null && s.count > 0 ? `รอนานสุด ${s.oldest_days} วัน` : m.who}
                  </div>
                </div>
              );
              return staffLinks ? <Link key={s.key} href={m.href} className="block">{card}</Link> : <div key={s.key}>{card}</div>;
            })}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <Panel title="รอบเบิกรายเดือนอยู่ที่ใคร"
                 description="แต่ละรายการคือ TA หนึ่งคนในหนึ่งวิชาของเดือนนั้น แยกตามผู้ที่ต้องดำเนินการต่อ" className="min-w-0">
            <FlowChart flow={a.flow ?? []} />
          </Panel>
          <div className="space-y-4 min-w-0">
            <DeadlineCard a={a} />
            <Panel title="เอกสาร TA" description="สถานะเอกสารของ TA ในภาคเรียนนี้">
              <div className="flex items-center gap-4">
                <Donut size={116} center={a.docs.approved} sub={`จาก ${a.docs.total} คน`} parts={[
                  { label: "ตรวจผ่าน", value: a.docs.approved, color: "#16a34a" },
                  { label: "รอตรวจ", value: a.docs.submitted, color: "#0ea5e9" },
                  { label: "ต้องแก้ไข", value: a.docs.needs_fix, color: "#f59e0b" },
                  { label: "ไม่ผ่าน", value: a.docs.rejected, color: "#dc2626" },
                  { label: "ยังไม่ส่ง", value: a.docs.not_submitted, color: "#cbd5e1" },
                ]} />
                <ul className="flex-1 space-y-1 text-xs">
                  {[
                    ["ตรวจผ่าน", a.docs.approved, "#16a34a"], ["รอตรวจ", a.docs.submitted, "#0ea5e9"],
                    ["ต้องแก้ไข", a.docs.needs_fix, "#f59e0b"], ["ไม่ผ่าน", a.docs.rejected, "#dc2626"],
                    ["ยังไม่ส่ง / ไม่ครบ", a.docs.not_submitted, "#cbd5e1"],
                  ].map(([l, v, c]) => (
                    <li key={l as string} className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[var(--ink-2)]"><i className="size-2.5 rounded-sm" style={{ background: c as string }} />{l}</span>
                      <b className="tabular-nums">{v as number}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
        </div>

        {a.pipeline && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Followup icon={<FileWarning size={16} />} label="เอกสาร TA ถูกตีกลับ" value={a.pipeline.docs_returned} who="TA ต้องแก้ไข" />
            <Followup icon={<Undo2 size={16} />} label="รอบเบิกถูกส่งกลับ" value={a.pipeline.months_sent_back + a.pipeline.worklogs_rejected}
                      who={`รอบเดือน ${a.pipeline.months_sent_back} · บันทึกเวลา ${a.pipeline.worklogs_rejected}`} />
            <Followup icon={<UserX size={16} />} label="วิชาที่ยังไม่มี TA" value={a.pipeline.courses_no_ta} who="อาจารย์ยังไม่ส่งคำขอ" />
            <Followup icon={<CalendarX2 size={16} />} label="คาบวันหยุดยังไม่ชดเชย" value={a.pipeline.unresolved_makeups} who="อาจารย์ต้องกำหนดวันชดเชย" />
          </div>
        )}
      </Question>

      {/* ------------------------------------------------------------------ */}
      {/* Every course                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section id="q-courses" className="scroll-mt-20">
        <Panel title="รายวิชาทั้งหมดของภาคเรียน"
               description="ค้นหา กรอง และเรียงได้ทุกคอลัมน์ ‘ใช้เพดาน’ คิดจากยอดที่จะจ่ายเมื่อชั่วโมงที่บันทึกแล้วผ่านการอนุมัติทั้งหมด">
          <CourseExplorer rows={rows} status={status} onStatus={setStatus} selected={selected} onSelect={setSelected}
                          linkCourses={staffLinks} />
        </Panel>
      </section>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Question({ id, n, title, answer, action, children, tour }: {
  id: string; n: number; title: string; answer: { tone: Tone; text: string }; action?: React.ReactNode;
  children: React.ReactNode; tour?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3" data-tour={tour}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-semibold text-white shadow-sm">{n}</span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-lg font-semibold text-[var(--ink-1)] leading-snug">{title}</h2>
          <Answer tone={answer.tone} text={answer.text} />
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Answer({ tone, text, compact }: { tone: Tone; text: string; compact?: boolean }) {
  const T = TONE[tone];
  return (
    <p className={`${compact ? "mt-1 text-center text-[13px]" : "mt-0.5 text-sm"} flex items-start gap-1.5 ${compact ? "justify-center" : ""} ${T.text}`}>
      <T.icon size={compact ? 15 : 16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function Kpi({ icon, label, value, hint, delta, extra, action, tone }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; delta?: string;
  extra?: React.ReactNode; action?: React.ReactNode; tone?: "warn" | "good";
}) {
  const iconCls = tone === "warn" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
    : tone === "good" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
    : "bg-[var(--brand-soft,#e7f3fb)] text-[var(--brand)] dark:bg-sky-950/50";
  return (
    <div className="relative flex flex-col rounded-xl border border-[var(--border)] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--ink-3)] line-clamp-1">{label}</span>
            {action}
          </div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums leading-tight whitespace-nowrap text-[var(--ink-1)] [&_small]:text-sm [&_small]:font-normal [&_small]:text-[var(--ink-3)]">{value}</div>
        </div>
      </div>
      {(hint || extra) && (
        <div className="mt-2 flex items-end justify-between gap-2">
          {hint && <div className="min-w-0 flex-1 text-xs text-[var(--ink-3)] line-clamp-3">{hint}</div>}
          {extra && <div className="shrink-0">{extra}</div>}
        </div>
      )}
      {delta && <div className="mt-1 text-[11px] text-[var(--ink-4)]">{delta}</div>}
    </div>
  );
}

function Metric({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone?: "warn" | "danger" }) {
  const c = tone === "danger" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-[var(--ink-1)]";
  return (
    <div className="rounded-lg bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2.5">
      <div className="text-[11px] text-[var(--ink-3)]">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${c}`}>{value} {unit && <span className="text-[11px] font-normal text-[var(--ink-3)]">{unit}</span>}</div>
      {sub && <div className="text-[10.5px] text-[var(--ink-4)] leading-snug">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg bg-slate-50/80 dark:bg-zinc-800/40 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-[var(--ink-1)]"}`}>{value}</div>
      <div className="text-[10.5px] text-[var(--ink-3)] leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-[var(--ink-4)]">{sub}</div>}
    </div>
  );
}

function CourseList({ rows, empty, onPick, right }: {
  rows: CourseStaffing[]; empty: string; onPick: (id: string) => void; right: (r: CourseStaffing) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="flex items-center gap-2 py-2 text-sm text-emerald-700 dark:text-emerald-400"><CircleCheck size={15} />{empty}</p>;
  }
  return (
    <ul className="divide-y divide-[var(--hairline)] -my-1">
      {rows.map(r => {
        const m = STAFFING_META[r.status];
        return (
          <li key={r.teaching_course_id}>
            <button type="button" onClick={() => { onPick(r.teaching_course_id); document.getElementById("q-courses")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    className="flex w-full items-center gap-3 py-2 text-start hover:bg-slate-50 dark:hover:bg-zinc-800/40 -mx-2 px-2 rounded-lg">
              <i className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--ink-1)]">{r.code} <span className="font-normal text-[var(--ink-3)] text-xs">{curriculumTH(r.curriculum)}</span></div>
                <div className="text-[11px] text-[var(--ink-3)] tabular-nums">
                  นศ. {r.students} · ขอ {r.requested} · แนะนำ {r.recommended} · เพดาน {r.ceiling}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums">{right(r)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Followup({ icon, label, value, who }: { icon: React.ReactNode; label: string; value: number; who: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${value > 0 ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" : "border-[var(--border)] bg-surface"}`}>
      <span className={`mt-0.5 ${value > 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--ink-4)]"}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-[var(--ink-3)]">{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${value > 0 ? "text-[var(--ink-1)]" : "text-[var(--ink-4)]"}`}>{value}</div>
        <div className="text-[11px] text-[var(--ink-4)] line-clamp-1">{who}</div>
      </div>
    </div>
  );
}

function DeadlineCard({ a }: { a: TermAnalytics }) {
  const d = a.deadline;
  if (!d) {
    return (
      <Panel title="รอบส่งบันทึกเวลาถัดไป">
        <p className="text-sm text-[var(--ink-3)]">ไม่มีรอบที่เปิดอยู่</p>
      </Panel>
    );
  }
  const urgent = d.days_left <= d.remind_days;
  return (
    <div className={`rounded-xl border p-4 ${urgent ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-transparent dark:border-amber-800" : "border-[var(--border)] bg-surface"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-xl ${urgent ? "bg-amber-500 text-white" : "bg-[var(--brand)] text-white"}`}>
          <span className="text-xl font-bold leading-none tabular-nums">{d.days_left}</span>
          <span className="text-[10px]">วัน</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-1)]"><CalendarClock size={15} />ปิดรอบส่งบันทึกเวลา {thDate(d.due_date)}</div>
          <div className="text-xs text-[var(--ink-2)] mt-0.5">{d.labels.join(", ")}</div>
          <div className="text-xs mt-1.5 text-[var(--ink-3)]">
            {d.not_sent > 0
              ? <>TA ยังไม่ส่ง / ต้องแก้ <b className="text-amber-700 dark:text-amber-400 tabular-nums">{d.not_sent}</b> รายการ</>
              : "ทุกรายการที่บันทึกไว้ส่งครบแล้ว"}
            {` · แจ้งเตือนอัตโนมัติล่วงหน้า ${d.remind_days} วัน`}
          </div>
        </div>
      </div>
    </div>
  );
}

function delta(now: number, prev: number, label: string, unit = "") {
  if (prev <= 0) return `ภาคเรียน ${label} ไม่มีข้อมูล`;
  const d = now - prev;
  if (d === 0) return `เท่ากับภาคเรียน ${label}`;
  const p = (d / prev) * 100;
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d)).toLocaleString("th-TH")}${unit ? ` ${unit}` : ""} (${Math.abs(p).toFixed(0)}%) จาก ${label}`;
}
