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
//   1. งบพอถึงสิ้นเทอมไหม        — budget, forecast, pace, courses at their cap
//   2. ขอ TA สมเหตุสมผลไหม      — requested vs recommended vs ceiling, per course
//   3. งานค้างอยู่ขั้นไหน         — the five TOR queues, returns, claim months
//
// Then every course in one searchable, sortable table. All figures come from
// one request (/dashboard/analytics): the money is settle-priced, the same as
// the printed claim and the Excel export.
//
// Each figure appears once (polish of 26/09/2026): the top is the term strip,
// the decisions list and four KPIs with one headline number each; the whole
// budget story lives in question 1 only. Every colour comes from a rule in
// analysis.ts (RULES, capState, near_cap_ratio); a figure without a rule is
// drawn in ink.

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Download, Wallet, Users, BookOpen, Inbox, Sparkles, CircleCheck, TriangleAlert,
  OctagonAlert, Info, ArrowRight, CalendarClock, FileWarning, Undo2, CalendarX2, UserX, ChevronDown,
  Gauge, Scale, Workflow, Table2, BarChart3, AlignLeft,
} from "lucide-react";
import { Panel, Button, Select } from "../../components/ui";
import { api, type Term } from "../../lib/api";
import type { TermAnalytics, StaffingStatus, CourseStaffing } from "../types";
import { curriculumTH } from "../types";
import {
  budgetView, budgetAnswer, courseRisk, staffingStats, staffingAnswer, pipelineAnswer, buildInsights,
  flowShape, flowSentences, docsShape, CAP_META, RULES, STAFFING_META, PIPELINE_META,
  money, num1, pct0, thDate, type Tone, type Answer as AnswerT, type CourseRef,
} from "./analysis";
import {
  BudgetStack, StaffingScatter, StaffingRows, StatusLegend, VerdictBar, FlowChart, Donut, MiniBar,
} from "./charts";
import MonthlyChart from "./MonthlyChart";
import CurriculumBars from "./CurriculumBars";
import CourseExplorer from "./CourseExplorer";

// Text colours on their tinted backgrounds all pass WCAG AA (≥ 4.5:1).
const TONE: Record<Tone, { icon: typeof Info; text: string; bg: string; ring: string }> = {
  good:   { icon: CircleCheck,   text: "text-emerald-800", bg: "bg-emerald-50", ring: "border-emerald-200" },
  info:   { icon: Info,          text: "text-sky-800",     bg: "bg-sky-50",     ring: "border-sky-200" },
  warn:   { icon: TriangleAlert, text: "text-amber-800",   bg: "bg-amber-50",   ring: "border-amber-200" },
  danger: { icon: OctagonAlert,  text: "text-red-700",     bg: "bg-red-50",     ring: "border-red-200" },
  muted:  { icon: Info,          text: "text-[var(--ink-2)]", bg: "bg-slate-50", ring: "border-[var(--border)]" },
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
  const [flowAsChart, setFlowAsChart] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const view = useMemo(() => {
    if (!a) return null;
    const allRows = a.staffing ?? [];
    const rows = curriculum ? allRows.filter(r => r.curriculum === curriculum) : allRows;
    return {
      bv: budgetView(a),
      risk: courseRisk(a),
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

  const { bv, risk, rows, st, insights } = view;
  const bAns = budgetAnswer(bv, risk);
  const sAns = staffingAnswer(st, a.plan.students_per_ta);
  const pAns = pipelineAnswer(a);
  const pendingTotal = a.pipeline?.stages.reduce((s, x) => s + x.count, 0) ?? 0;
  const stale = a.pipeline?.stages.some(x => x.count > 0 && (x.oldest_days ?? 0) >= RULES.staleDays) ?? false;
  const returnedTotal = (a.pipeline?.docs_returned ?? 0) + (a.pipeline?.months_sent_back ?? 0) + (a.pipeline?.worklogs_rejected ?? 0);
  const compareOptions = (terms ?? []).filter(t => t.id !== a.term_id);
  const shownInsights = showAllInsights ? insights : insights.slice(0, 5);
  const atRisk = [...risk.over, ...risk.near];
  const scatterPts = rows.filter(r => r.requested > 0 && r.students > 0).length;
  const flow = flowShape(a.flow ?? []);
  const docs = docsShape(a.docs);

  const selectCourse = (id: string | null) => {
    setSelected(id);
    if (id) {
      // Picking a course anywhere clears a filter that would hide its row.
      const row = (a.staffing ?? []).find(r => r.teaching_course_id === id);
      if (row && status && row.status !== status) setStatus("");
      if (row && curriculum && row.curriculum !== curriculum) setCurriculum("");
    }
  };
  const jumpTo = (id: string) => {
    selectCourse(id);
    document.getElementById("q-courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              <n.icon size={14} />{n.label}
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
      {/* Top: the term, then what needs a decision                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-surface" aria-labelledby="dash-decisions">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--hairline)] bg-[radial-gradient(120%_140%_at_0%_0%,rgba(7,118,188,0.08),transparent_60%)] px-5 py-3 text-sm text-[var(--ink-2)]">
          <span>ภาคเรียน <b className="text-[var(--ink-1)]">{a.term_label}</b></span>
          {a.starts_on && a.ends_on && <span>{thDate(a.starts_on)} – {thDate(a.ends_on)}</span>}
          {bv.elapsedPct != null && <span>ผ่านไป <b className="tabular-nums text-[var(--ink-1)]">{pct0(bv.elapsedPct)}</b> ของเทอม</span>}
          {a.as_of && <span className="ms-auto text-xs text-[var(--ink-3)]">ข้อมูล ณ {thDate(a.as_of)}</span>}
        </div>
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[var(--brand-soft,#e7f3fb)] text-[var(--brand)]">
              <Sparkles size={15} />
            </span>
            <h2 id="dash-decisions" className="text-base font-semibold text-[var(--ink-1)]">ข้อสังเกตที่ต้องตัดสินใจหรือติดตาม</h2>
            <span className="hidden sm:inline text-xs text-[var(--ink-3)]">วิเคราะห์อัตโนมัติจากข้อมูลล่าสุด</span>
          </div>
          {insights.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-800"><CircleCheck size={16} />ไม่มีเรื่องที่ต้องตัดสินใจหรือติดตามในตอนนี้</p>
          ) : (
            <ul className="grid gap-2 lg:grid-cols-2">
              {shownInsights.map((it, i) => {
                const T = TONE[it.tone];
                return (
                  <li key={i}>
                    <a href={it.target ? `#q-${it.target}` : undefined}
                       className={`flex h-full gap-3 rounded-xl border ${T.ring} ${T.bg} px-3 py-2.5 transition hover:shadow-sm`}>
                      <T.icon size={18} className={`mt-0.5 shrink-0 ${T.text}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${T.text}`}>{it.title}</div>
                        {it.detail && <div className="text-xs text-[var(--ink-2)] mt-0.5">{it.detail}</div>}
                      </div>
                      {it.target && <ArrowRight size={15} className="mt-1 shrink-0 text-[var(--ink-3)]" aria-hidden />}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {insights.length > 5 && (
            <button type="button" onClick={() => setShowAllInsights(v => !v)} aria-expanded={showAllInsights}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
              <ChevronDown size={14} className={showAllInsights ? "rotate-180" : ""} />
              {showAllInsights ? "ย่อ" : `ดูทั้งหมด ${insights.length} ข้อ`}
            </button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* KPI row (TOR 3.13 figures) — one headline number per card          */}
      {/* ------------------------------------------------------------------ */}
      <div data-tour="dash-stats" className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={<BookOpen size={18} />} label="รายวิชาที่ขอ TA" value={a.courses_with_ta} unit="วิชา"
             sub={`จาก ${a.courses_open} วิชาที่เปิด${a.pipeline?.courses_no_ta ? ` · มีนักศึกษาแต่ยังไม่ขอ ${a.pipeline.courses_no_ta} วิชา` : ""}`}
             delta={b ? delta(a.courses_with_ta, b.courses_with_ta, b.term_label) : undefined} />
        <Kpi icon={<Users size={18} />} label="TA ปฏิบัติงานจริง" value={a.active_tas} unit="คน"
             sub={`จาก ${a.total_tas} คนที่แต่งตั้ง · ป.ตรี ${a.tas_undergrad} · บัณฑิต ${a.tas_graduate}`}
             title="TA ปฏิบัติงานจริง = มีบันทึกเวลาที่อนุมัติแล้วอย่างน้อย 1 รายการในภาคเรียนนี้"
             delta={b ? delta(a.active_tas, b.active_tas, b.term_label) : undefined} />
        <Kpi icon={<Wallet size={18} />} label="เบิกจ่ายแล้ว" value={Math.round(bv.used).toLocaleString("th-TH")} unit="บาท"
             sub={bv.base > 0 ? `${pct0(bv.usedPct)} ของงบรวม ${money(bv.base)}` : "ยังไม่มีงบรวม"}
             delta={b ? delta(a.budget_used, b.budget_used, b.term_label, "บาท") : undefined} />
        <Kpi icon={<Inbox size={18} />} label="รายการรอดำเนินการ" value={pendingTotal} unit="รายการ"
             tone={stale ? "warn" : undefined}
             sub={`${stale ? `มีรายการรอนานเกิน ${RULES.staleDays} วัน · ` : ""}ถูกตีกลับให้แก้ไข ${returnedTotal} รายการ`} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Q1 — งบพอไหม                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Question id="q-budget" n={1} title="งบพอถึงสิ้นเทอมไหม?" answer={bAns} onCourse={jumpTo} tour="dash-budget">
        <Panel>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div>
              <div className="text-sm text-[var(--ink-2)]">งบรวม <b className="text-lg tabular-nums text-[var(--ink-1)]">{money(bv.base)}</b></div>
              <div className="text-xs text-[var(--ink-3)]">ผลรวมงบของ {a.courses_with_ta} วิชาที่ส่งคำขอ TA คำนวณจากจำนวนนักศึกษาและหน่วยกิต เงินย้ายข้ามวิชาไม่ได้</div>
            </div>
            <div className="text-sm text-[var(--ink-2)]">คงเหลือ <b className="text-lg tabular-nums text-[var(--ink-1)]">{money(bv.remaining)}</b></div>
          </div>
          <BudgetStack b={bv} />
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="คาดการณ์สิ้นเทอม"
                      value={bv.projectedHigh - bv.projectedLow > 1 ? `${Math.round(bv.projectedLow).toLocaleString("th-TH")}–${money(bv.projectedHigh)}` : money(bv.projectedHigh)}
                      sub={bv.runRate ? "ต่ำสุดจากชั่วโมงที่บันทึกแล้ว สูงสุดถ้าใช้ในอัตราเดิม" : "จากชั่วโมงที่บันทึกแล้ว"} />
              <Metric label="งานที่ยังจ่ายไม่ได้" value={money(risk.unfunded)} tone={risk.unfunded > 0 ? "danger" : undefined}
                      sub={risk.unfunded > 0 ? "ชั่วโมงที่เกินเพดานวิชา" : "ไม่มีวิชาใดเกินเพดาน"} />
              <Metric label="ค่าเฉลี่ยต่อชั่วโมง" value={a.approved_hours > 0 ? `${num1(a.budget_used / a.approved_hours)} บาท` : "–"}
                      sub={`จาก ${num1(a.approved_hours)} ชม. ที่อนุมัติ`} />
            </div>
            <div className="rounded-xl border border-[var(--hairline)] p-3">
              <div className="mb-2 text-sm font-medium text-[var(--ink-1)]">วิชาที่ชนหรือใกล้เพดานงบ <span className="font-normal text-xs text-[var(--ink-3)]">(คาดการณ์ถึง {pct0(risk.ratio * 100)} ของเพดานวิชา)</span></div>
              {atRisk.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-800"><CircleCheck size={15} />ไม่มีวิชาใดใช้ถึง {pct0(risk.ratio * 100)} ของเพดาน</p>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {atRisk.slice(0, 6).map(r => {
                    const cs = r.unfunded_baht > 0 ? "over" : "near";
                    return (
                      <li key={r.teaching_course_id}>
                        <button type="button" onClick={() => jumpTo(r.teaching_course_id)}
                                className="grid w-full grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-lg px-1.5 py-2 text-start hover:bg-slate-50">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--ink-1)]">{r.code} <span className="text-xs font-medium" style={{ color: CAP_META[cs].ink }}>{CAP_META[cs].label}</span></div>
                            <div className="text-xs text-[var(--ink-3)] tabular-nums">
                              {money(r.forecast_baht)} จาก {money(r.cap_baht)}{r.unfunded_baht > 0 ? ` · จ่ายไม่ได้ ${money(r.unfunded_baht)}` : ""}
                            </div>
                          </div>
                          <MiniBar value={r.forecast_baht} max={r.cap_baht} warnAt={risk.ratio} over={cs === "over"} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {atRisk.length > 6 && <p className="mt-1 text-xs text-[var(--ink-3)]">และอีก {atRisk.length - 6} วิชา ดูในตารางรายวิชา</p>}
            </div>
          </div>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title="การเบิกจ่ายสะสมเทียบเวลา"
                 description="เส้นเขียวคือยอดสะสมจริง เส้นประคือเส้นอ้างอิงถ้าใช้เท่ากันทุกเดือน ไม่ใช่เป้าหมาย แท่งด้านล่างคือยอดแต่ละเดือน"
                 className="min-w-0 lg:col-span-3">
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
      <Question id="q-staffing" n={2} title="แต่ละวิชาขอ TA เกินที่แนะนำหรือเกินจำนวนนักศึกษาไหม?" answer={sAns} onCourse={jumpTo}
                action={view.curricula.length > 1 ? (
                  <Select aria-label="กรองหลักสูตร" value={curriculum} onChange={e => { setCurriculum(e.target.value); setSelected(null); }}>
                    <option value="">ทุกหลักสูตร</option>
                    {view.curricula.map(c => <option key={c || "none"} value={c}>{curriculumTH(c)}</option>)}
                  </Select>
                ) : undefined}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
          {scatterPts >= RULES.scatterMinPoints ? (
            <Panel title="นักศึกษา เทียบ TA ที่ขอ"
                   description={`จุดแต่ละจุดคือหนึ่งวิชา เหนือเส้นเขียวคือขอมากกว่าเกณฑ์ 1 ต่อ ${a.plan.students_per_ta} คน เหนือเส้นประแดงคือเกินเพดาน 1 ต่อ ${a.plan.min_students_per_ta} คน คลิกจุดเพื่อดูวิชาในตาราง`}
                   className="min-w-0">
              <div className="mb-3"><StatusLegend counts={st.counts} picked={status} onPick={s => { setStatus(s); document.getElementById("q-courses")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} /></div>
              <StaffingScatter rows={rows} plan={a.plan} selected={selected} onSelect={id => selectCourse(id)} />
              <StaffingNote a={a} />
            </Panel>
          ) : (
            <Panel title="TA ที่ขอ เทียบที่แนะนำและเพดาน"
                   description={`มีวิชาที่ขอ TA ${st.withReq} วิชา แสดงเป็นรายวิชา (กราฟกระจายจะแสดงเมื่อมีตั้งแต่ ${RULES.scatterMinPoints} วิชา)`}
                   className="min-w-0">
              <StaffingRows rows={rows} selected={selected} onSelect={jumpTo} />
              <StaffingNote a={a} />
            </Panel>
          )}
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
                <div className="mt-1.5 flex justify-between text-xs text-[var(--ink-3)]">
                  <span>{st.compliance != null ? `${pct0(st.compliance)} อยู่ในเกณฑ์หรือต่ำกว่า` : ""}</span>
                  <span>{st.withReq} วิชาที่ขอ</span>
                </div>
              </div>
            </Panel>
            <Panel title="วิชาที่ควรทบทวน" description="ขอ TA มากกว่าที่แนะนำ เรียงจากเกินมากที่สุด">
              <CourseList rows={st.review.slice(0, 6)} empty="ไม่มีวิชาที่ขอเกินที่แนะนำ" onPick={jumpTo}
                          right={r => <span className="text-red-700">+{r.requested - r.recommended}</span>} />
            </Panel>
            {st.under.length > 0 && (
              <Panel title="วิชาที่ TA อาจไม่พอ" description="ขอน้อยกว่าที่แนะนำ">
                <CourseList rows={st.under.slice(0, 4)} empty="" onPick={jumpTo}
                            right={r => <span className="text-sky-800">{r.requested - r.recommended}</span>} />
              </Panel>
            )}
          </div>
        </div>
      </Question>

      {/* ------------------------------------------------------------------ */}
      {/* Q3 — งานค้างอยู่ขั้นไหน                                            */}
      {/* ------------------------------------------------------------------ */}
      <Question id="q-work" n={3} title="งานค้างอยู่ขั้นไหน?" answer={pAns} onCourse={jumpTo}>
        {a.pipeline && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {a.pipeline.stages.map((s, i) => {
              const m = PIPELINE_META[s.key];
              const old = s.count > 0 && (s.oldest_days ?? 0) >= RULES.staleDays;
              const card = (
                <div className={`relative h-full rounded-xl border p-3 transition ${old ? "border-amber-300 bg-amber-50" : "border-[var(--border)] bg-surface"} ${staffLinks ? "hover:shadow-md" : ""}`}>
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                    <span className={`inline-flex size-5 items-center justify-center rounded-full text-xs font-bold ${s.count > 0 ? "bg-[var(--brand)] text-white" : "bg-slate-200 text-slate-700"}`}>{i + 1}</span>
                    ขั้นที่ {i + 1}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-[var(--ink-1)]">{m.label}</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${s.count > 0 ? (old ? "text-amber-800" : "text-[var(--ink-1)]") : "text-[var(--ink-3)]"}`}>{s.count}</div>
                  <div className="mt-0.5 text-xs text-[var(--ink-3)] line-clamp-2">
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
                 description="แต่ละรายการคือ TA หนึ่งคนในหนึ่งวิชาของเดือนนั้น แยกตามผู้ที่ต้องดำเนินการต่อ" className="min-w-0"
                 actions={flow.months.length > 0 && !flow.chart ? (
                   <button type="button" onClick={() => setFlowAsChart(v => !v)} aria-pressed={flowAsChart}
                           className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--brand)] hover:bg-slate-50">
                     {flowAsChart ? <><AlignLeft size={14} />ดูเป็นข้อความ</> : <><BarChart3 size={14} />ดูเป็นกราฟ</>}
                   </button>
                 ) : undefined}>
            {flow.months.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--ink-3)]">ยังไม่มีการบันทึกเวลาในภาคเรียนนี้</div>
            ) : flow.chart || flowAsChart ? (
              <FlowChart months={flow.months} />
            ) : (
              <>
                <ul className="space-y-2">
                  {flowSentences(flow.months).map(l => (
                    <li key={l.key} className="flex items-start gap-2 text-sm text-[var(--ink-1)]">
                      <i className="mt-1.5 inline-block size-3 shrink-0 rounded-sm" style={{ background: l.color }} aria-hidden />
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-[var(--ink-3)]">
                  {flow.months.length < RULES.flowMinMonths
                    ? "มีข้อมูลเดือนเดียว จึงสรุปเป็นข้อความ"
                    : `ทุกเดือนแบ่งสัดส่วนใกล้เคียงกัน (ต่างกันไม่เกิน ${pct0(RULES.flowMinShareSpread * 100)}) จึงสรุปเป็นข้อความ`}
                </p>
              </>
            )}
          </Panel>
          <div className="space-y-4 min-w-0">
            <DeadlineCard a={a} />
            <Panel title="เอกสาร TA" description="สถานะเอกสารของ TA ในภาคเรียนนี้">
              {docs.chart ? (
                <div className="flex items-center gap-4">
                  <Donut size={116} center={a.docs.approved} sub={`จาก ${a.docs.total} คน`} parts={docs.parts} />
                  <ul className="flex-1 space-y-1 text-xs">
                    {docs.parts.map(p => (
                      <li key={p.key} className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[var(--ink-2)]"><i className="size-3 rounded-sm" style={{ background: p.color }} />{p.label}</span>
                        <b className="tabular-nums">{p.value}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={`flex items-center gap-2 text-sm ${a.docs.total > 0 && a.docs.approved === a.docs.total ? "text-emerald-800" : "text-[var(--ink-1)]"}`}>
                  {a.docs.total > 0 && a.docs.approved === a.docs.total && <CircleCheck size={16} />}{docs.sentence}
                </p>
              )}
            </Panel>
          </div>
        </div>

        {a.pipeline && (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">
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
               description={`ค้นหา กรอง และเรียงได้ทุกคอลัมน์ ‘คาดการณ์เทียบเพดานวิชา’ คิดจากยอดที่จะจ่ายเมื่อชั่วโมงที่บันทึกแล้วผ่านการอนุมัติทั้งหมด ถึง ${pct0(risk.ratio * 100)} ถือว่าใกล้เพดาน`}>
          <CourseExplorer rows={rows} status={status} onStatus={setStatus} selected={selected} onSelect={setSelected}
                          linkCourses={staffLinks} ratio={risk.ratio} />
        </Panel>
      </section>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Question({ id, n, title, answer, action, children, tour, onCourse }: {
  id: string; n: number; title: string; answer: AnswerT; action?: React.ReactNode;
  children: React.ReactNode; tour?: string; onCourse: (id: string) => void;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3" data-tour={tour} aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-semibold text-white shadow-sm" aria-hidden>{n}</span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-h`} className="text-lg font-semibold text-[var(--ink-1)] leading-snug">{title}</h2>
          <AnswerLine answer={answer} onCourse={onCourse} />
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** The answer sentence; `{courses}` becomes buttons that open the course's
 *  row in the table. */
function AnswerLine({ answer, onCourse }: { answer: AnswerT; onCourse: (id: string) => void }) {
  const T = TONE[answer.tone];
  const [head, tail] = answer.text.split("{courses}");
  const list: CourseRef[] = answer.courses ?? [];
  const shown = list.slice(0, RULES.maxNamedCourses);
  return (
    <p className={`mt-1 flex items-start gap-1.5 text-[15px] font-medium leading-relaxed ${T.text}`}>
      <T.icon size={17} className="mt-1 shrink-0" aria-hidden />
      <span>
        {head}
        {tail !== undefined && (
          <>
            {shown.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <button type="button" onClick={() => onCourse(c.id)} className="underline decoration-dotted underline-offset-4 hover:decoration-solid">
                  {c.code}
                </button>
              </span>
            ))}
            {list.length > shown.length && ` และอีก ${list.length - shown.length} วิชา`}
            {tail}
          </>
        )}
      </span>
    </p>
  );
}

function StaffingNote({ a }: { a: TermAnalytics }) {
  return (
    <p className="mt-3 text-xs text-[var(--ink-3)]">
      ระบบแนะนำตามกลุ่มเรียนที่เรียนพร้อมกัน กลุ่มละ 1 คนต่อนักศึกษา {a.plan.students_per_ta} คน
      {a.plan.suggested_ta_cap > 0 ? ` (สูงสุด ${a.plan.suggested_ta_cap} คนต่อกลุ่ม)` : ""} อย่างน้อยกลุ่มละ 1 คน
      เพดานคือ 1 ต่อ {a.plan.min_students_per_ta} คน ผลการเทียบของแต่ละวิชาคิดรายกลุ่มเรียน
    </p>
  );
}

function Kpi({ icon, label, value, unit, sub, delta, tone, title }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; unit: string; sub?: string; delta?: string;
  tone?: "warn"; title?: string;
}) {
  const iconCls = tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-[var(--brand-soft,#e7f3fb)] text-[var(--brand)]";
  return (
    <div className="relative flex flex-col rounded-xl border border-[var(--border)] bg-surface p-4" title={title}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${iconCls}`} aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-[var(--ink-2)]">{label}</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums leading-tight text-[var(--ink-1)]">
            {value} <span className="text-sm font-normal text-[var(--ink-2)]">{unit}</span>
          </div>
        </div>
      </div>
      {sub && <div className="mt-2 text-xs text-[var(--ink-3)]">{sub}</div>}
      {delta && <div className="mt-1 text-xs text-[var(--ink-3)]">{delta}</div>}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${tone === "danger" ? "text-red-700" : "text-[var(--ink-1)]"}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--ink-3)] leading-snug">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-800" : "text-[var(--ink-1)]"}`}>{value}</div>
      <div className="text-xs text-[var(--ink-3)] leading-tight">{label}</div>
      {sub && <div className="text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  );
}

function CourseList({ rows, empty, onPick, right }: {
  rows: CourseStaffing[]; empty: string; onPick: (id: string) => void; right: (r: CourseStaffing) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="flex items-center gap-2 py-2 text-sm text-emerald-800"><CircleCheck size={15} />{empty}</p>;
  }
  return (
    <ul className="divide-y divide-[var(--hairline)] -my-1">
      {rows.map(r => {
        const m = STAFFING_META[r.status];
        return (
          <li key={r.teaching_course_id}>
            <button type="button" onClick={() => onPick(r.teaching_course_id)}
                    className="flex w-full items-center gap-3 py-2 text-start hover:bg-slate-50 -mx-2 px-2 rounded-lg">
              <i className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--ink-1)]">{r.code} <span className="font-normal text-[var(--ink-3)] text-xs">{curriculumTH(r.curriculum)}</span></div>
                <div className="text-xs text-[var(--ink-3)] tabular-nums">
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
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${value > 0 ? "border-amber-200 bg-amber-50" : "border-[var(--border)] bg-surface"}`}>
      <span className={`mt-0.5 ${value > 0 ? "text-amber-800" : "text-[var(--ink-3)]"}`} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-[var(--ink-2)]">{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${value > 0 ? "text-[var(--ink-1)]" : "text-[var(--ink-3)]"}`}>{value}</div>
        <div className="text-xs text-[var(--ink-3)] line-clamp-1">{who}</div>
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
  // Amber when the reminder window the office configured has started.
  const urgent = d.days_left <= d.remind_days;
  return (
    <div className={`rounded-xl border p-4 ${urgent ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white" : "border-[var(--border)] bg-surface"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-xl text-white ${urgent ? "bg-amber-700" : "bg-[var(--brand)]"}`}>
          <span className="text-xl font-bold leading-none tabular-nums">{d.days_left}</span>
          <span className="text-xs">วัน</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-1)]"><CalendarClock size={15} aria-hidden />ปิดรอบส่งบันทึกเวลา {thDate(d.due_date)}</div>
          <div className="text-xs text-[var(--ink-2)] mt-0.5">{d.labels.join(", ")}</div>
          <div className="text-xs mt-1.5 text-[var(--ink-3)]">
            {d.not_sent > 0
              ? <>TA ยังไม่ส่ง / ต้องแก้ <b className="text-amber-800 tabular-nums">{d.not_sent}</b> รายการ</>
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
