"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  CalendarPlus,
  CalendarOff,
} from "lucide-react";
import { PageHeader, Panel, Button, Alert, EmptyState } from "../components/ui";
import { type Executive, emptyExecutive } from "./types";
import { useTerm, useTermKey } from "./TermContext";
import TermDashboard from "./insights/TermDashboard";
import { Skel } from "../components/Skeletons";
import { localDateISO } from "../lib/dates";
import { msg, useI18n } from "../lib/i18n/client";

function formatThaiDate(iso: string | undefined, intl: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(intl, {
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
  const { t, intl } = useI18n();
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
  // Local date: toISOString() is UTC, still yesterday until 07:00 here.
  const todayISO = localDateISO();
  const termExpired = !!activeTerm?.ends_on && activeTerm.ends_on < todayISO;
  const noActiveTerm = loaded && !noTerms && !activeTerm;

  // The dashboard used to warn about exactly one thing (missing student
  // counts) and stay silent about every queue, so "nothing on screen" meant
  // both "all clear" and "nobody has looked". Every outstanding item now
  // appears here, and an empty list says so explicitly.
  const todos: Todo[] = [
    {
      count: s.missing_student_counts, blocker: true,
      title: msg("ยังไม่ได้กรอกจำนวนนักศึกษา"),
      detail: msg("ต้องกรอกก่อนจึงจะส่งออกเอกสารเบิกจ่ายได้ (งบคำนวณจากจำนวนนักศึกษา)"),
      href: "/staff/teaching", action: msg("กรอกจำนวนนักศึกษา"),
    },
    {
      count: s.pending_ta_requests, step: 1,
      title: msg("คำร้องขอ TA รอตรวจ"),
      detail: msg("อาจารย์ส่งคำขอมาแล้ว รออนุมัติหรือปฏิเสธ"),
      href: "/staff/approvals", action: msg("ตรวจคำร้อง"),
    },
    {
      count: s.pending_reviews, step: 2,
      title: msg("แบบฟอร์มใบแจ้งหนี้รอตรวจ"),
      detail: msg("TA ส่งเอกสารครบแล้ว รอเจ้าหน้าที่ตรวจและอนุมัติ"),
      href: "/staff/review", action: msg("ตรวจเอกสาร"),
    },
    {
      // Appointment orders gate payout review: a TA without one cannot be
      // paid, so approved names waiting for a round are work on the officer's
      // desk even though the page lives under จัดการ, not a numbered step.
      count: s.pending_appointments,
      title: msg("TA รอออกคำสั่งแต่งตั้ง"),
      detail: msg("อนุมัติคำขอแล้วแต่ยังไม่อยู่ในคำสั่งแต่งตั้งรอบใด ต้องออกคำสั่งก่อนจึงจะเบิกจ่ายได้"),
      href: "/staff/appointments", action: msg("ออกคำสั่ง"),
    },
    {
      // One line for what used to be two. Steps 3 and 4 are the same errand and
      // now the same screen, so two to-do cards pointing at it would only ask
      // the officer to decide which half to click.
      count: s.payout_courses_actionable, step: 3,
      title: msg("วิชาที่รอตรวจ / รอส่งออก"),
      detail: msg("อาจารย์อนุมัติชั่วโมงแล้ว รอเจ้าหน้าที่ตรวจยอดเงินและส่งออกเอกสาร"),
      href: "/staff/payouts", action: msg("เปิดรายการ"),
    },
  ].filter(x => x.count > 0);

  // Every figure below is scoped to one term, so the term belongs in the page
  // header rather than repeated on each card.
  const termText = s.term_label ? t("ปีการศึกษา {term}", { term: s.term_label }) : "";

  return (
    <div>
      <PageHeader
        title={t("แดชบอร์ดผู้ดูแลระบบ")}
        description={termText
          ? t("ภาพรวมการดำเนินงาน {term}", { term: termText })
          : t("ภาพรวมการดำเนินงานของระบบ COCO TAS")}
      />

      {noTerms ? (
        // Every card below reads zero without a term to scope it to — showing
        // them anyway would look like an honest "nothing going on" instead of
        // "the system isn't set up yet". Same gate the teaching page uses.
        <Panel padded={false}>
          <EmptyState
            icon={<CalendarPlus size={28} />}
            title={t("ยังไม่ได้สร้างปีการศึกษา / ภาคเรียน")}
            description={t("ต้องสร้างปีการศึกษาและภาคเรียนอย่างน้อย 1 รายการก่อน จึงจะเปิดวิชาสอน อนุมัติคำขอ TA และดำเนินงานขั้นตอนอื่น ๆ ต่อได้")}
            action={
              <Link href="/staff/settings?tab=terms">
                <Button variant="primary">
                  <CalendarPlus size={16} /> {t("สร้างปีการศึกษา / ภาคเรียน")}
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
                  ? t("ภาคเรียนที่ใช้งานอยู่สิ้นสุดแล้ว ({date})", { date: formatThaiDate(activeTerm?.ends_on, intl) })
                  : t("ยังไม่ได้ตั้งภาคเรียนที่ใช้งานอยู่")}
                description={termExpired
                  ? t("ภาคเรียน {term} หมดเขตแล้ว กรุณาสร้างภาคเรียนถัดไปและตั้งเป็นภาคเรียนที่ใช้งาน มิฉะนั้นเมนูอื่นจะยังอ้างอิงภาคเรียนที่หมดเขตนี้อยู่", { term: `${activeTerm?.academic_year}/${activeTerm?.semester}` })
                  : t("ไม่มีภาคเรียนใดถูกตั้งเป็นภาคเรียนที่ใช้งานอยู่ กรุณาตรวจสอบที่หน้าตั้งค่า")}
                action={
                  <Link href="/staff/settings?tab=terms">
                    <Button variant="secondary" size="sm">{t("ไปตั้งค่าภาคเรียน")}</Button>
                  </Link>
                }
              />
            </div>
          )}

          <TodoPanel todos={todos} loading={!data} />

          {/* The question-led dashboard (แบบ A, 26/09/2026): KPI row, งบพอไหม,
              ขอ TA เกินไหม, งานค้างที่ไหน, and every course. Same component the
              executive page renders, so both audiences read identical numbers;
              only staff get the links into their queues. */}
          <TermDashboard termId={termId} staffLinks />

          <div className="grid gap-4 mt-6 lg:grid-cols-2">
            <Panel title={t("ทางลัด")} description={t("เมนูใช้บ่อย")} data-tour="dash-shortcuts">
              <ul className="divide-y divide-[var(--hairline)]">
                <ShortcutRow href="/staff/approvals" title={msg("อนุมัติคำขอ TA")} />
                <ShortcutRow href="/staff/review" title={msg("ตรวจสอบแบบฟอร์มใบแจ้งหนี้")} />
                <ShortcutRow href="/staff/payouts" title={msg("ตรวจและส่งออกเอกสาร")} />
                <ShortcutRow href="/staff/teaching" title={msg("วิชาที่เปิดสอน")} />
                <ShortcutRow href="/staff/appointments" title={msg("ใบแต่งตั้งทีเอ")} />
                <ShortcutRow href="/staff/budget-summary" title={msg("สรุปงบและปะหน้าจ่ายตรง")} />
              </ul>
            </Panel>
            <Panel title={t("คู่มือระบบ")} description={t("ลิงก์เอกสารและเวิร์กโฟลว์")}>
              <ul className="space-y-2 text-sm">
                <li className="text-[var(--ink-2)]">• {t("เจ้าหน้าที่นำเข้าตารางสอนจาก Excel → อาจารย์ขอ TA → เจ้าหน้าที่อนุมัติ")}</li>
                <li className="text-[var(--ink-2)]">• {t("TA กรอกข้อมูล/เอกสาร + บันทึกเวลาปฏิบัติงาน → อาจารย์อนุมัติ/ปฏิเสธรายวัน (คือการตรวจจริง ไม่มีการเซ็นในระบบ)")}</li>
                <li className="text-[var(--ink-2)]">• {t("อนุมัติครบ → เจ้าหน้าที่ตรวจสอบและส่งออกไฟล์ ZIP (ล็อกบันทึกเวลาของเดือนนั้น) → ยืนยันส่งการเงิน")}</li>
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
  const { t } = useI18n();
  // While loading, render nothing rather than an "all clear" that may be about
  // to turn into four outstanding items — a false all-clear is worse than a
  // brief gap.
  if (loading) {
    // Skel (not animate-pulse) so a cached/fast response never flashes grey.
    return <Skel className="mb-5 h-24 rounded-xl" />;
  }

  if (todos.length === 0) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-3">
        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
        <div className="text-sm text-emerald-900">
          {t.rich("{b} ทุกขั้นตอนดำเนินการครบแล้ว", { b: <b>{t("ไม่มีงานค้าง")}</b> })}
        </div>
      </div>
    );
  }

  const total = todos.reduce((n, x) => n + x.count, 0);
  return (
    <div data-tour="dash-todo" className="mb-5 rounded-xl border border-amber-300 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <AlertTriangle size={17} className="text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-900">
          {t("สิ่งที่ต้องทำตอนนี้")}
        </span>
        <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
          {t("{n} รายการ", { n: total })}
        </span>
      </div>
      <ul className="divide-y divide-amber-200/70">
        {todos.map(td => (
          <li key={td.href}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span
              aria-hidden
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-[11px] font-bold text-amber-900"
            >
              {td.step ?? "!"}
            </span>
            {/* basis-48 keeps the text from shrinking to make room for the
                button: on a phone the two then no longer fit side by side and
                flex-wrap drops the button to its own line, instead of squeezing
                the description into a four-word column. */}
            <div className="min-w-0 flex-1 basis-48">
              <div className="text-sm font-medium text-amber-950">
                {t(td.title)} <span className="tabular-nums">({td.count})</span>
                {td.blocker && (
                  <span className="ms-2 rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold align-middle">
                    {t("ติดขัด")}
                  </span>
                )}
              </div>
              <div className="text-xs text-amber-800/90 mt-0.5">{t(td.detail)}</div>
            </div>
            <Link href={td.href} className="ms-auto shrink-0">
              <Button variant="primary" size="sm">{t(td.action)}</Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortcutRow({ href, title, hint }: { href: string; title: string; hint?: string }) {
  const { t } = useI18n();
  return (
    <li>
      <Link href={href}
            className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-4 px-4 rounded-md group">
        <div>
          <div className="text-sm font-medium text-[var(--ink-1)]">{t(title)}</div>
          {hint && <div className="text-xs text-[var(--ink-3)] mt-0.5">{hint}</div>}
        </div>
        <ArrowUpRight size={16} className="text-[var(--ink-4)] group-hover:text-[var(--brand)]" />
      </Link>
    </li>
  );
}
