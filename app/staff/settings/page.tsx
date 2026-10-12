"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Save, Pencil, X, Check, CircleAlert, HelpCircle, Sparkles, CalendarDays, CalendarPlus, Power, PowerOff, Mail, MailX, ChevronDown, Server, Send, CircleCheck, CircleX, CircleMinus } from "lucide-react";
import {
  Tabs, Pagination, Accordion, Switch,
  DatePicker, DateField, Calendar, I18nProvider,
  Autocomplete, ListBox, useFilter, Label, Description,
  SearchField as HSearchField,
  type Key,
} from "@heroui/react";
import { toast } from "@/app/lib/toast";
import { parseDate, parseDateTime, type DateValue } from "@internationalized/date";
import { api, ApiError, errMessage, demoTesters, demoAddTester, demoRemoveTester, type DemoTester, type Me } from "../../lib/api";
import { useTerm, useTermKey } from "../TermContext";
import {
  PageHeader, Panel, Button, IconButton, TextInput, TextArea, FieldGroup, Chip, Modal, Alert, SearchField, Select, Tip, TipWrap,
} from "../../components/ui";
import { FormulaHelpModal } from "../../components/formula-help";
import { budgetConfirmMessage } from "../teaching/budgetConfirm";
import { Skel, SkelValue, SkelList, SkelRows, SkelForm } from "../../components/Skeletons";
import { msg, useI18n, type TFn } from "../../lib/i18n/client";

interface Rate {
  id?: string;
  effective_from: string;
  undergrad_regular: number; undergrad_special: number;
  graduate_regular: number; graduate_special_lumpsum: number;
  ug_lecture_hours_per_credit: number;
  ug_lab_hours_per_credit: number;
  baseline_students_lecture: number;
  baseline_students_lab: number;
  ug_workload_rate_regular: number;
  term_months: number;
  ug_max_hours_per_day: number;
  max_courses_per_student: number;
  // Migration 0018 — ประกาศ 731/2565 + 1080/2565 caps.
  graduate_regular_hourly: number;      // 50 ฿/hr (แทน graduate_regular lump-sum เดิม)
  grad_special_term_cap: number;        // 12,000 ฿/TA/course/term
  daily_pay_cap_baht: number;           // 300 ฿/วัน สำหรับทุกคนคิดชั่วโมง
  ug_regular_daily_hour_cap: number;    // ป.ตรี ปกติ 7 hrs/วัน
  ug_special_daily_hour_cap: number;    // ป.ตรี พิเศษ 6 hrs/วัน
  grad_regular_daily_hour_cap: number;  // บัณฑิต ปกติ 6 hrs/วัน
  // Migration 0112 — TA planning ratios the planner on the lecturer's pages reads.
  plan_students_per_ta: number;      // เกณฑ์ 1 TA ต่อ นศ. 25 คน
  plan_min_students_per_ta: number;  // ไม่วางแผนเกิน 1 TA ต่อ นศ. 15 คน
  plan_suggested_ta_cap: number;     // เพดานจำนวน TA ตามเกณฑ์ (0 = ไม่จำกัด)
  note?: string;
}
export default function SettingsPage() {
  const { t } = useI18n();
  const params = useSearchParams();
  // Allow deep-linking to a specific tab, e.g. /staff/settings?tab=terms
  const tabParam = params.get("tab");
  // "windows" and "periods" are kept as valid aliases so old deep-links still
  // land on the merged calendar tab instead of a 404.
  const rawTab = tabParam ?? "";
  const normalised = rawTab === "windows" || rawTab === "periods" ? "calendar" : rawTab;
  const activeTab = ["rate", "terms", "calendar", "curricula", "admins", "email", "mail-test", "demo-access"].includes(normalised)
    ? normalised
    : "rate";
  const router = useRouter();
  const pathname = usePathname();
  // Mirror the chosen tab into ?tab= so a reload lands back on it. replace, not
  // push: switching tabs isn't a new destination for the back button.
  const selectTab = (key: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", key);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  return (
    <div>
      {/* The page-level pill is this screen's one docs entry: it opens the
          whole ตั้งค่า topic (one doc page per tab) in the full manual. */}
      <PageHeader title={t("ตั้งค่าระบบ")} description={t("อัตราค่าตอบแทน วิชา ภาคเรียน และฝ่ายบริหาร")} />
      <Tabs variant="secondary" selectedKey={activeTab} onSelectionChange={k => selectTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t("หมวดตั้งค่า")} data-tour="settings-tabs">
            <Tabs.Tab id="rate">{t("อัตราค่าตอบแทน")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="terms">{t("ภาคเรียน")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="calendar">{t("ปฏิทินเทอม")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="curricula">{t("หลักสูตร")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="admins">{t("ฝ่ายบริหาร")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="email">{t("อีเมลแจ้งเตือน")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="mail-test">{t("ทดสอบอีเมล")}<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="demo-access">{t("สิทธิ์ห้องทดลอง")}<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="rate" className="pt-6">
          <PayRateSection />
        </Tabs.Panel>
        <Tabs.Panel id="terms" className="pt-6">
          <TermsSection />
        </Tabs.Panel>
        <Tabs.Panel id="calendar" className="pt-6">
          <div className="space-y-6">
            <RequestWindowsSection />
            <SubmissionPeriodsSection />
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="curricula" className="pt-6">
          <CurriculaSection />
        </Tabs.Panel>
        <Tabs.Panel id="admins" className="pt-6">
          <AdminOfficersSection />
        </Tabs.Panel>
        <Tabs.Panel id="email" className="pt-6">
          <MailSettingsSection />
        </Tabs.Panel>
        <Tabs.Panel id="mail-test" className="pt-6">
          <MailServerTestSection />
        </Tabs.Panel>
        <Tabs.Panel id="demo-access" className="pt-6">
          <DemoTestersSection />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pay rate — read-only view + edit mode + confirm-save flow                  */
/* -------------------------------------------------------------------------- */

// Today in the browser's own calendar (Bangkok for every user of this system).
// toISOString() is UTC, which is still "yesterday" until 07:00 here — the
// wrong side of the line for a date whose past/future-ness now matters.
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PayRateSection() {
  const { t, fmtDate } = useI18n();
  const { data, error: rateError } = useSWR<Rate>("/settings/pay-rate");
  // Versions saved ahead of time. The backend only starts using one on its own
  // date, so they are listed apart from "in force now" rather than shown as it.
  const { data: scheduled } = useSWR<Rate[]>("/settings/pay-rate/scheduled");
  const { data: me } = useSWR<Me>("/me");
  const isAdmin = (me?.roles ?? []).includes("admin");
  const [withdrawTarget, setWithdrawTarget] = useState<Rate | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const empty: Rate = {
    effective_from: todayLocal(),
    undergrad_regular: 40, undergrad_special: 50,
    graduate_regular: 50, graduate_special_lumpsum: 4000,
    ug_lecture_hours_per_credit: 3, ug_lab_hours_per_credit: 4.5,
    baseline_students_lecture: 60, baseline_students_lab: 30,
    // 300 = 50%×200 (ตรี) + 50%×400 (บัณฑิต) per the faculty workbook;
    // applied to both tracks, which differ only in student count.
    ug_workload_rate_regular: 300,
    term_months: 4,
    ug_max_hours_per_day: 7,
    max_courses_per_student: 3,
    graduate_regular_hourly: 50,
    grad_special_term_cap: 12000,
    daily_pay_cap_baht: 300,
    ug_regular_daily_hour_cap: 7,
    ug_special_daily_hour_cap: 6,
    grad_regular_daily_hour_cap: 6,
    plan_students_per_ta: 25,
    plan_min_students_per_ta: 15,
    plan_suggested_ta_cap: 3,
  };
  const [draft, setDraft] = useState<Rate>(empty);

  function startEdit() {
    setDraft({
      ...(data ?? empty),
      effective_from: todayLocal(),
    });
    setEditing(true);
  }
  function cancel() { setEditing(false); }

  // Field-level validation — every rate must be a finite number > 0. Empty
  // inputs coerce to 0 via Number(), which these checks reject.
  const rateErrors = {
    undergrad_regular: vPositive(draft.undergrad_regular),
    ug_max_hours_per_day: vPositive(draft.ug_max_hours_per_day),
    undergrad_special: vPositive(draft.undergrad_special),
    graduate_regular: vPositive(draft.graduate_regular),
    graduate_special_lumpsum: vPositive(draft.graduate_special_lumpsum),
    max_courses_per_student: vPositiveInt(draft.max_courses_per_student)
      ?? (draft.max_courses_per_student > 10 ? msg("ต้องไม่เกิน 10 วิชา") : null),
    ug_lecture_hours_per_credit: vPositive(draft.ug_lecture_hours_per_credit),
    ug_lab_hours_per_credit: vPositive(draft.ug_lab_hours_per_credit),
    baseline_students_lecture: vPositive(draft.baseline_students_lecture),
    baseline_students_lab: vPositive(draft.baseline_students_lab),
    ug_workload_rate_regular: vPositive(draft.ug_workload_rate_regular),
    graduate_regular_hourly: vPositive(draft.graduate_regular_hourly),
    grad_special_term_cap: vPositive(draft.grad_special_term_cap),
    daily_pay_cap_baht: vPositive(draft.daily_pay_cap_baht),
    ug_regular_daily_hour_cap: vPositive(draft.ug_regular_daily_hour_cap),
    ug_special_daily_hour_cap: vPositive(draft.ug_special_daily_hour_cap),
    grad_regular_daily_hour_cap: vPositive(draft.grad_regular_daily_hour_cap),
    plan_students_per_ta: vPositive(draft.plan_students_per_ta),
    plan_min_students_per_ta: vPositive(draft.plan_min_students_per_ta) ??
      (draft.plan_min_students_per_ta > draft.plan_students_per_ta ? msg("ต้องไม่มากกว่าเกณฑ์ นศ. ต่อ TA") : null),
  };
  const hasRateErrors = Object.values(rateErrors).some(Boolean);
  const effectiveFromError = !draft.effective_from ? msg("กรุณาระบุวันเริ่มใช้") : null;
  const effectiveFromPast =
    !!draft.effective_from && draft.effective_from < todayLocal();
  const effectiveFromFuture =
    !!draft.effective_from && draft.effective_from > todayLocal();
  const canSaveRate = !hasRateErrors && !effectiveFromError;

  async function doSave() {
    if (!canSaveRate) return;
    setSaving(true);
    try {
      await api.post("/settings/pay-rate", draft);
      await mutate("/settings/pay-rate");
      await mutate("/settings/pay-rate/scheduled");
      setEditing(false);
      setConfirming(false);
      toast.success(t("บันทึกเวอร์ชันใหม่เรียบร้อยแล้ว"), {
        description: t("เริ่มใช้ {date}", { date: fmtDate(draft.effective_from) }),
      });
    } catch (e) {
      toast.danger(t("บันทึกไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  async function doWithdraw() {
    if (!withdrawTarget?.id) return;
    setWithdrawing(true);
    try {
      await api.del(`/settings/pay-rate/${withdrawTarget.id}`);
      await mutate("/settings/pay-rate/scheduled");
      toast.success(t("ยกเลิกอัตราที่ตั้งล่วงหน้าแล้ว"), {
        description: t("เวอร์ชันที่จะเริ่มใช้ {date}", { date: fmtDate(withdrawTarget.effective_from) }),
      });
      setWithdrawTarget(null);
    } catch (e) {
      toast.danger(t("ยกเลิกไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <Panel
      title={t("อัตราค่าตอบแทน TA")}
      description={t("ค่าตอบแทนแบบมีเวอร์ชัน สร้างเวอร์ชันใหม่ทุกครั้งที่แก้ (เก็บประวัติ)")}
      actions={
        editing ? (
          <>
            <Button variant="ghost" onClick={cancel}><X size={14} />{t("ยกเลิก")}</Button>
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={!canSaveRate}>
              <Save size={14} />{t("บันทึกเวอร์ชันใหม่")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setShowFormula(true)}>
              <HelpCircle size={14} />{t("ดูตัวอย่างการคำนวณ")}
            </Button>
            <Button variant="secondary" onClick={startEdit}><Pencil size={14} />{t("แก้ไข")}</Button>
          </>
        )
      }
    >
      {/* Versions saved ahead of time — not in force until their date */}
      {!editing && (scheduled?.length ?? 0) > 0 && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning-soft/40 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays size={16} />{t("อัตราที่ตั้งล่วงหน้า (ยังไม่มีผล)")}
          </div>
          <p className="mt-1 text-xs text-muted">
            {isAdmin
              ? t("ระบบยังคำนวณด้วยอัตราปัจจุบันด้านล่างจนถึงวันเริ่มใช้ของแต่ละเวอร์ชัน")
              : t("ระบบยังคำนวณด้วยอัตราปัจจุบันด้านล่างจนถึงวันเริ่มใช้ของแต่ละเวอร์ชัน — ถ้าตั้งวันผิด แจ้งผู้ดูแลระบบให้ยกเลิก")}
          </p>
          <ul className="mt-3 space-y-2">
            {scheduled!.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium">{t("เริ่มใช้ {date}", { date: fmtDate(r.effective_from) })}</span>
                <Tip content={t("ปริญญาตรี ภาคปกติ {ugr} บาท/ชั่วโมง\nปริญญาตรี ภาคพิเศษ {ugs} บาท/ชั่วโมง\nบัณฑิตศึกษา ภาคปกติ {gr} บาท/ชั่วโมง\nบัณฑิตศึกษา ภาคพิเศษ เหมาจ่าย {ls} บาท/คน/วิชา/ภาค", { ugr: r.undergrad_regular, ugs: r.undergrad_special, gr: r.graduate_regular_hourly, ls: r.graduate_special_lumpsum.toLocaleString() })}>
                  <span className="text-muted">
                    {t("ตรี {ugr}/{ugs} · บัณฑิต {gr} บาท/ชม. · เหมาจ่าย {ls} บาท/ภาค", { ugr: r.undergrad_regular, ugs: r.undergrad_special, gr: r.graduate_regular_hourly, ls: r.graduate_special_lumpsum.toLocaleString() })}
                  </span>
                </Tip>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setWithdrawTarget(r)}>
                    <Trash2 size={14} />{t("ยกเลิกเวอร์ชันนี้")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current values — read-only */}
      {!editing && (
        !data && !rateError ? (
          <PayRateSkeleton />
        ) : data ? (
          <div className="space-y-5">
            <ViewGroup title={t("อัตราค่าจ้าง ปริญญาตรี")} hint={t("อ้างอิงประกาศ 731/2565 + 1080/2565")}>
              <ViewRow label={t("ภาคปกติ")} value={t("{n} บาท/ชั่วโมง", { n: data.undergrad_regular })} />
              <ViewRow label={t("ภาคพิเศษ")} value={t("{n} บาท/ชั่วโมง", { n: data.undergrad_special })} />
              <ViewRow label={t("ชั่วโมงสูงสุด/วัน (ปกติ)")} value={t("{n} ชั่วโมง", { n: data.ug_regular_daily_hour_cap ?? 7 })} />
              <ViewRow label={t("ชั่วโมงสูงสุด/วัน (พิเศษ)")} value={t("{n} ชั่วโมง", { n: data.ug_special_daily_hour_cap ?? 6 })} />
            </ViewGroup>
            <ViewGroup title={t("อัตราค่าจ้าง บัณฑิตศึกษา (โท/เอก)")}>
              <ViewRow label={t("ภาคปกติ (คิดชั่วโมง)")} value={t("{n} บาท/ชั่วโมง", { n: data.graduate_regular_hourly ?? 50 })} />
              <ViewRow label={t("ชั่วโมงสูงสุด/วัน (บัณฑิต ปกติ)")} value={t("{n} ชั่วโมง", { n: data.grad_regular_daily_hour_cap ?? 6 })} />
              <ViewRow label={t("ภาคพิเศษ (เหมาจ่าย)")} value={t("{n} บาท/คน/วิชา/ภาค", { n: data.graduate_special_lumpsum.toLocaleString() })} />
              <ViewRow label={t("เพดานพิเศษ/เทอม (ต่อ TA × วิชา)")} value={t("{n} บาท", { n: (data.grad_special_term_cap ?? 12000).toLocaleString() })} />
            </ViewGroup>
            <ViewGroup title={t("เพดานรายวัน (ทุกคนคิดชั่วโมง)")}>
              <ViewRow label={t("ค่าตอบแทนสูงสุด/วัน")} value={t("{n} บาท", { n: (data.daily_pay_cap_baht ?? 300).toLocaleString() })} />
            </ViewGroup>
            <ViewGroup title={t("เกณฑ์วางแผนจำนวน TA")} hint={t("ใช้ในตัววางแผน TA บนหน้าอาจารย์")}>
              <ViewRow label={t("เกณฑ์ 1 TA ต่อ นศ.")} value={t("{n} คน", { n: data.plan_students_per_ta ?? 25 })} />
              <ViewRow label={t("ไม่เกิน 1 TA ต่อ นศ.")} value={t("{n} คน", { n: data.plan_min_students_per_ta ?? 15 })} />
              <ViewRow label={t("เพดานจำนวน TA ตามเกณฑ์")} value={(data.plan_suggested_ta_cap ?? 3) > 0 ? t("{n} คน", { n: data.plan_suggested_ta_cap ?? 3 }) : t("ไม่จำกัด")} />
            </ViewGroup>
            <ViewGroup title={t("ข้อกำหนดทั่วไป")} hint={t("ใช้ตั้งแต่ {date}", { date: fmtDate(data.effective_from) })}>
              <ViewRow label={t("จำนวนวิชา TA สูงสุด/คน")} value={t("{n} วิชา", { n: data.max_courses_per_student ?? 3 })} />
            </ViewGroup>
            <ViewGroup title={t("สูตรคำนวณโหลด TA ปริญญาตรี")}>
              <ViewRow label={t("ชั่วโมงบรรยาย / หน่วยกิต")} value={data.ug_lecture_hours_per_credit} />
              <ViewRow label={t("ชั่วโมงปฏิบัติ / หน่วยกิต")} value={data.ug_lab_hours_per_credit} />
              <ViewRow label={t("Baseline นศ./sec บรรยาย")} value={data.baseline_students_lecture} />
              <ViewRow label={t("Baseline นศ./sec ปฏิบัติ")} value={data.baseline_students_lab} />
              <ViewRow label={t("Effective rate (บาท/ชั่วโมงสัปดาห์/เดือน)")} value={data.ug_workload_rate_regular} />
            </ViewGroup>

            <button
              type="button"
              onClick={() => setShowFormula(true)}
              className="w-full rounded-lg border border-accent/30 bg-accent-soft/40 hover:bg-accent-soft transition-colors p-4 text-left flex items-center gap-3 group"
            >
              <span className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                <Sparkles size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{t("ดูตัวอย่างการคำนวณทีละขั้น")}</span>
                <span className="block text-xs text-muted mt-0.5">
                  {t("ใช้ค่า rate ปัจจุบันด้านบน + วิชาตัวอย่าง 2 หน่วยกิตบรรยาย + 1 หน่วยกิตปฏิบัติ + 5 นักศึกษาภาคปกติ")}
                </span>
              </span>
              <span className="text-muted group-hover:text-accent transition-colors">→</span>
            </button>
          </div>
        ) : (
          <div className="text-sm text-muted py-4">{t("ยังไม่มีอัตราค่าตอบแทน กด \"แก้ไข\" เพื่อกำหนดครั้งแรก")}</div>
        )
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-6">
          <EditGroup title={t("อัตราค่าจ้าง ปริญญาตรี")} description={t("ประกาศ 731/2565: ปกติ 40, พิเศษ 50 บาท/ชั่วโมง")}>
            <F label={t("ตรี ปกติ (บาท/ชั่วโมง)")} type="number" min={0} value={draft.undergrad_regular}
               error={rateErrors.undergrad_regular}
               onChange={v => setDraft({ ...draft, undergrad_regular: Number(v) })} />
            <F label={t("ตรี พิเศษ (บาท/ชั่วโมง)")} type="number" min={0} value={draft.undergrad_special}
               error={rateErrors.undergrad_special}
               onChange={v => setDraft({ ...draft, undergrad_special: Number(v) })} />
            <F label={t("ชม. สูงสุด/วัน (ปกติ)")} type="number" min={0} value={draft.ug_regular_daily_hour_cap}
               error={rateErrors.ug_regular_daily_hour_cap}
               onChange={v => setDraft({ ...draft, ug_regular_daily_hour_cap: Number(v) })} />
            <F label={t("ชม. สูงสุด/วัน (พิเศษ)")} type="number" min={0} value={draft.ug_special_daily_hour_cap}
               error={rateErrors.ug_special_daily_hour_cap}
               onChange={v => setDraft({ ...draft, ug_special_daily_hour_cap: Number(v) })} />
          </EditGroup>

          <EditGroup title={t("อัตราค่าจ้าง บัณฑิตศึกษา (โท/เอก)")} description={t("ประกาศ 1080/2565: ปกติ 50 บาท/ชม., พิเศษเหมาจ่าย 4,000 บาท/คน/วิชา/ภาค (ไม่เกินเพดานต่อเทอมด้านล่าง)")}>
            <F label={t("ภาคปกติ (บาท/ชั่วโมง)")} type="number" min={0} value={draft.graduate_regular_hourly}
               error={rateErrors.graduate_regular_hourly}
               onChange={v => setDraft({ ...draft, graduate_regular_hourly: Number(v) })} />
            <F label={t("ชม. สูงสุด/วัน (บัณฑิต ปกติ)")} type="number" min={0} value={draft.grad_regular_daily_hour_cap}
               error={rateErrors.grad_regular_daily_hour_cap}
               onChange={v => setDraft({ ...draft, grad_regular_daily_hour_cap: Number(v) })} />
            <F label={t("ภาคพิเศษ (เหมาจ่าย/คน/วิชา/ภาค)")} type="number" min={0} value={draft.graduate_special_lumpsum}
               error={rateErrors.graduate_special_lumpsum}
               onChange={v => setDraft({ ...draft, graduate_special_lumpsum: Number(v) })} />
            <F label={t("เพดานพิเศษ/เทอม (ต่อ TA × วิชา)")} type="number" min={0} value={draft.grad_special_term_cap}
               error={rateErrors.grad_special_term_cap}
               onChange={v => setDraft({ ...draft, grad_special_term_cap: Number(v) })} />
          </EditGroup>

          <EditGroup title={t("เพดานรายวัน (ทุกคนคิดชั่วโมง)")} description={t("ประกาศ: ค่าตอบแทนรวมของ TA ที่คิดชั่วโมง ต้องไม่เกิน 300 บาท/วัน")}>
            <F label={t("ค่าตอบแทนสูงสุด/วัน (บาท)")} type="number" min={0} value={draft.daily_pay_cap_baht}
               error={rateErrors.daily_pay_cap_baht}
               onChange={v => setDraft({ ...draft, daily_pay_cap_baht: Number(v) })} />
          </EditGroup>

          <EditGroup title={t("เกณฑ์วางแผนจำนวน TA")} description={t("ตัววางแผนบนหน้าอาจารย์: ให้ครบตามเกณฑ์ก่อน แล้วเพิ่มคนได้จนถึงความหนาแน่นสูงสุด ถ้างบพอ")}>
            <F label={t("เกณฑ์ 1 TA ต่อ นศ. (คน)")} type="number" min={1} value={draft.plan_students_per_ta}
               error={rateErrors.plan_students_per_ta}
               onChange={v => setDraft({ ...draft, plan_students_per_ta: Number(v) })} />
            <F label={t("ไม่เกิน 1 TA ต่อ นศ. (คน)")} type="number" min={1} value={draft.plan_min_students_per_ta}
               error={rateErrors.plan_min_students_per_ta}
               onChange={v => setDraft({ ...draft, plan_min_students_per_ta: Number(v) })} />
            <F label={t("เพดานจำนวน TA ตามเกณฑ์ (0 = ไม่จำกัด)")} type="number" min={0} value={draft.plan_suggested_ta_cap}
               onChange={v => setDraft({ ...draft, plan_suggested_ta_cap: Number(v) })} />
          </EditGroup>

          <EditGroup title={t("ข้อกำหนดทั่วไป")} description={t("เริ่มใช้เมื่อไร + ข้อจำกัดตามระเบียบ (จำนวนเดือนของแต่ละเทอมกำหนดที่แท็บ 'ภาคเรียน')")}>
            <F label={t("เริ่มใช้")} type="date" value={draft.effective_from}
               error={effectiveFromError}
               onChange={v => setDraft({ ...draft, effective_from: v })} />
            <F label={t("จำนวนวิชา TA สูงสุด/คน/ภาค (1–10, ระบบใช้ตัดสินคำขอ TA ทันที)")} type="number" min={1} value={draft.max_courses_per_student}
               error={rateErrors.max_courses_per_student}
               onChange={v => setDraft({ ...draft, max_courses_per_student: Number(v) })} />
          </EditGroup>

          {effectiveFromFuture && (
            <Alert
              status="accent"
              icon={<CalendarDays size={16} />}
              title={t("ตั้งอัตราล่วงหน้า")}
              description={t("เวอร์ชันนี้จะเริ่มมีผลวันที่ {date} — ก่อนถึงวันนั้นระบบยังคำนวณด้วยอัตราปัจจุบัน", { date: fmtDate(draft.effective_from) })}
            />
          )}
          {effectiveFromPast && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title={t("วันเริ่มใช้เป็นวันในอดีต")}
              description={t("เวอร์ชันนี้จะเริ่มใช้ย้อนหลัง อาจกระทบการคำนวณค่าจ้างของรายการที่ผ่านมา โปรดตรวจสอบก่อนบันทึก")}
            />
          )}

          <EditGroup
            title={t("สูตรคำนวณโหลด TA ปริญญาตรี")}
            description={t("ตามชีต 2_59 ป.ตรี ปกติ/พิเศษ ใช้ effective rate เดียวกัน (default 300 = 50% × 200 ตรี + 50% × 400 บัณฑิต)")}
          >
            <F label={t("ชั่วโมงบรรยาย / หน่วยกิต")} type="number" min={0} value={draft.ug_lecture_hours_per_credit}
               error={rateErrors.ug_lecture_hours_per_credit}
               onChange={v => setDraft({ ...draft, ug_lecture_hours_per_credit: Number(v) })} />
            <F label={t("ชั่วโมงปฏิบัติ / หน่วยกิต")} type="number" min={0} value={draft.ug_lab_hours_per_credit}
               error={rateErrors.ug_lab_hours_per_credit}
               onChange={v => setDraft({ ...draft, ug_lab_hours_per_credit: Number(v) })} />
            <F label={t("Baseline นักศึกษา/section บรรยาย")} type="number" min={0} value={draft.baseline_students_lecture}
               error={rateErrors.baseline_students_lecture}
               onChange={v => setDraft({ ...draft, baseline_students_lecture: Number(v) })} />
            <F label={t("Baseline นักศึกษา/section ปฏิบัติ")} type="number" min={0} value={draft.baseline_students_lab}
               error={rateErrors.baseline_students_lab}
               onChange={v => setDraft({ ...draft, baseline_students_lab: Number(v) })} />
            <F label={t("Effective rate (บาท/ชั่วโมง/สัปดาห์/เดือน)")} type="number" min={0} value={draft.ug_workload_rate_regular}
               error={rateErrors.ug_workload_rate_regular}
               onChange={v => setDraft({ ...draft, ug_workload_rate_regular: Number(v) })} />
          </EditGroup>
        </div>
      )}

      <ConfirmSaveModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doSave}
        saving={saving}
        title={t("ยืนยันสร้างเวอร์ชันใหม่?")}
        description={t("ระบบจะสร้างอัตราค่าตอบแทนเวอร์ชันใหม่ เริ่มใช้ {date} เวอร์ชันเก่ายังเก็บไว้เป็นประวัติ", { date: fmtDate(draft.effective_from) })}
      />

      <ConfirmSaveModal
        open={withdrawTarget !== null}
        onClose={() => setWithdrawTarget(null)}
        onConfirm={doWithdraw}
        saving={withdrawing}
        variant="danger"
        confirmLabel={t("ยกเลิกเวอร์ชันนี้")}
        confirmIcon={<Trash2 size={14} />}
        title={t("ยกเลิกอัตราที่ตั้งล่วงหน้า?")}
        description={t("เวอร์ชันที่จะเริ่มใช้ {date} ยังไม่เคยถูกใช้คำนวณ ยกเลิกได้โดยไม่กระทบยอดใด ๆ (บันทึกไว้ในประวัติการใช้งาน)", { date: withdrawTarget ? fmtDate(withdrawTarget.effective_from) : "" })}
      />

      <FormulaHelpModal
        open={showFormula}
        onClose={() => setShowFormula(false)}
        constants={{
          hrsPerLecCr: (editing ? draft : (data ?? draft)).ug_lecture_hours_per_credit,
          hrsPerLabCr: (editing ? draft : (data ?? draft)).ug_lab_hours_per_credit,
          baseLec:     (editing ? draft : (data ?? draft)).baseline_students_lecture,
          baseLab:     (editing ? draft : (data ?? draft)).baseline_students_lab,
          rate:        (editing ? draft : (data ?? draft)).ug_workload_rate_regular,
          termMonths:  (editing ? draft : (data ?? draft)).term_months || 4,
        }}
        example={{
          lecCr: 2, labCr: 1, students: 5,
          trackLabel: t("ภาคปกติ (ตัวอย่าง)"),
          courseName: t("ตัวอย่าง SW-TESTING (3 นก.)"),
        }}
      />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                      */
/* -------------------------------------------------------------------------- */

interface Term {
  id?: string;
  academic_year: number; semester: number;
  starts_on?: string; ends_on?: string;
  // Faculty exam windows — worklog entries falling inside either range are
  // blocked by the backend. Required at create/update.
  midterm_starts_on?: string; midterm_ends_on?: string;
  final_starts_on?: string; final_ends_on?: string;
  months: number;
  is_active: boolean;
  /** เพดานงบรายวิชาที่ทุกวิชาในภาคใช้ร่วมกัน — null = ไม่กำหนด (migration 0144). */
  course_budget_cap_baht?: number | null;
}

interface TermUsage {
  teaching_courses: number;
  class_schedules: number;
  exports: number;
  request_windows: number;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: msg("ภาคต้น"),
  2: msg("ภาคปลาย"),
  3: msg("ภาคฤดูร้อน"),
};

function semesterLabel(n: number, t: TFn): string {
  return SEMESTER_LABELS[n] ? t(SEMESTER_LABELS[n]) : t("ภาค {n}", { n });
}

function termLabel(term: Pick<Term, "academic_year" | "semester">, t: TFn) {
  return `${term.academic_year} ${semesterLabel(term.semester, t)}`;
}

// Wrap a Thai-locale DatePicker around an ISO-YYYY-MM-DD string. The
// backend keeps Gregorian ISO, the picker just displays it in th-TH format
// (day-month-BE year with Thai month names).
function TermDateField({
  label, value, onChange, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  autoFocus?: boolean;
}) {
  const { intl } = useI18n();
  let dv: DateValue | null = null;
  if (value) {
    try { dv = parseDate(value); } catch { dv = null; }
  }
  return (
    <I18nProvider locale={intl}>
      <DatePicker
        aria-label={label}
        value={dv}
        onChange={v => onChange(v ? v.toString() : "")}
        autoFocus={autoFocus}
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {segment => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}

// Client-only "pending years" — a year the user chose but hasn't populated
// with any term yet. Once a term is created for the year it becomes real and
// this entry is discarded. Cleared on refresh (that's fine — user just clicks
// "เพิ่มปีการศึกษา" again).
// How many most-recent years to load by default. Older years hide behind a
// "แสดงปีเก่ากว่านี้" button that widens the server-side year_from filter.
// Chosen small so users with 10+ years don't drown in whitespace.
const YEAR_PAGE_SIZE = 5;

const CURRENT_BE = new Date().getFullYear() + 543;

// Invalidate every /terms* SWR key so save/delete refresh both the paginated
// list and the total-year count. Using a matcher function is more resilient
// than exact-key strings, which drift as we add new query variants.
function mutateAllTerms() {
  return mutate(key => typeof key === "string" && key.startsWith("/terms"));
}

function TermsSection() {
  const { t, fmtDate } = useI18n();
  const router = useRouter();
  // Progressive load: start with the last N years, widen when the user asks.
  // Null = load everything (no filter).
  const [yearFromLimit, setYearFromLimit] = useState<number | null>(CURRENT_BE - YEAR_PAGE_SIZE + 1);
  const swrKey = yearFromLimit !== null ? `/terms?year_from=${yearFromLimit}` : "/terms";
  // keepPreviousData: widening the year range is the same list growing, so the
  // loaded years stay on screen instead of flashing the empty state.
  const { data } = useSWR<Term[]>(swrKey, { keepPreviousData: true });
  // Cheap separate count so the "X จาก Y ปี" label is honest even before we
  // have loaded every year's rows.
  const { data: yearsCount } = useSWR<{ count: number }>("/terms/years/count");
  const totalYears = yearsCount?.count;
  const [pendingYears, setPendingYears] = useState<number[]>([]);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [prefillYear, setPrefillYear] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [capTarget, setCapTarget] = useState<Term | null>(null);
  const [yearFilter, setYearFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Track whether we've done the initial auto-expand so subsequent data
  // refreshes (SWR revalidation) don't re-clobber the user's choices.
  const initialisedRef = useRef(false);

  const terms = useMemo(
    () => (data ?? []).slice().sort((a, b) =>
      b.academic_year !== a.academic_year
        ? b.academic_year - a.academic_year
        : a.semester - b.semester,
    ),
    [data],
  );
  const activeCount = terms.filter(t => t.is_active).length;

  // Group by academic year (desc). Include years that exist only in pendingYears.
  const grouped = useMemo(() => {
    const map = new Map<number, Term[]>();
    for (const t of terms) {
      if (!map.has(t.academic_year)) map.set(t.academic_year, []);
      map.get(t.academic_year)!.push(t);
    }
    for (const y of pendingYears) {
      if (!map.has(y)) map.set(y, []);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [terms, pendingYears]);

  const existingYears = useMemo(
    () => Array.from(new Set([...terms.map(t => t.academic_year), ...pendingYears])),
    [terms, pendingYears],
  );

  // Client-side substring filter across the loaded years. Server-side
  // pagination controls WHICH years are loaded; the search box just narrows
  // what's shown from those. If the user's query doesn't match any loaded
  // year, we prompt them to widen the range.
  const visibleGroups = useMemo(() => {
    const q = yearFilter.trim();
    if (!q) return grouped;
    return grouped.filter(([y]) => String(y).includes(q));
  }, [grouped, yearFilter]);

  // How many more years exist on the server beyond what we've loaded.
  const hiddenCount = totalYears !== undefined && yearFromLimit !== null
    ? Math.max(0, totalYears - grouped.length)
    : 0;

  // Auto-expand latest year on first load. Once the user has interacted (or
  // filtered), we hand back control — no more auto-clobbering.
  useEffect(() => {
    if (initialisedRef.current || grouped.length === 0) return;
    initialisedRef.current = true;
    // Open the year of the ACTIVE term — that is the one staff come here to
    // change (its เพดานงบรายวิชา, dates). The newest year used to open instead,
    // which put a far-future test year in front and folded the real one away.
    const active = terms.find(t => t.is_active);
    setExpanded(new Set([String(active ? active.academic_year : grouped[0][0])]));
  }, [grouped, terms]);

  // When searching, expand every match — helps when the user is hunting for a
  // specific term rather than browsing.
  useEffect(() => {
    if (!yearFilter.trim()) return;
    setExpanded(new Set(visibleGroups.map(([y]) => String(y))));
  }, [yearFilter, visibleGroups]);

  function openAddYear() { setYearPickerOpen(true); }
  function onYearPicked(year: number) {
    setYearPickerOpen(false);
    // Only remember as pending if it doesn't have terms yet.
    if (!terms.some(t => t.academic_year === year) && !pendingYears.includes(year)) {
      setPendingYears(ys => [...ys, year]);
    }
    setPrefillYear(year);
    setEditingTerm(null);
    setFormOpen(true);
    // Ensure the new year is visible + expanded.
    setExpanded(prev => new Set([...prev, String(year)]));
  }
  function openAddTerm(year: number) {
    setPrefillYear(year);
    setEditingTerm(null);
    setFormOpen(true);
  }
  function openEdit(t: Term) {
    setPrefillYear(null);
    setEditingTerm(t);
    setFormOpen(true);
  }
  function onSavedTerm(label: string, mode: "add" | "edit", saved: Term) {
    setFormOpen(false);
    // Once a real term exists for that year, drop the pending marker.
    if (prefillYear !== null) {
      setPendingYears(ys => ys.filter(y => y !== prefillYear));
    }
    // Holidays for the term's years now sync automatically from TDBM (see
    // /staff/holidays) — no BOT prompt needed here any more.
    if (mode === "edit" || !saved.id) {
      toast.success(mode === "edit" ? t("แก้ไข{label} เรียบร้อยแล้ว", { label }) : t("เพิ่ม{label} เรียบร้อยแล้ว", { label }));
      return;
    }
    // A new term takes no TA request and no work log until staff set its
    // ช่วงรับคำขอ and รอบเบิกจ่าย (both enforced by the backend), so the next
    // step is the calendar tab, on the term just created.
    toast.success(t("เพิ่ม{label} เรียบร้อยแล้ว", { label }), {
      description: t("ขั้นต่อไป กำหนดช่วงรับคำขอ TA และรอบเบิกจ่ายรายเดือนของภาคเรียนนี้"),
    });
    router.push(`/staff/settings?tab=calendar&term=${saved.id}`);
  }

  return (
    <Panel
      title={t("ปีการศึกษา / ภาคเรียน")}
      description={t("สร้างปีการศึกษาก่อน แล้วจึงเพิ่มภาคเรียนในปีนั้น (ภาคต้น / ภาคปลาย / ภาคฤดูร้อน)")}
      actions={
        <Button variant="primary" onClick={openAddYear}>
          <Plus size={14} />{t("เพิ่มปีการศึกษา")}
        </Button>
      }
    >
      {data === undefined && grouped.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <Skel className="h-10 w-full max-w-xs rounded-xl" />
            <SkelValue className="ms-auto h-3 w-20" />
          </div>
          <SkelList items={3} icon={false} bordered />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-muted py-4">{t("ยังไม่มีปีการศึกษา กด \"เพิ่มปีการศึกษา\" เพื่อเริ่ม")}</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <SearchField
              value={yearFilter}
              onChange={setYearFilter}
              placeholder={t("ค้นหาปีการศึกษา… (เช่น 2568)")}
              ariaLabel={t("ค้นหาปีการศึกษา")}
            />
            <div className="text-xs text-muted tabular ms-auto">
              {yearFilter.trim()
                ? t("พบ {n} ปี", { n: visibleGroups.length })
                : totalYears !== undefined
                  ? t("โหลด {n} จาก {total} ปี", { n: grouped.length, total: totalYears })
                  : t("{n} ปี", { n: grouped.length })}
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="space-y-2 py-6 text-center">
              <div className="text-sm text-muted">
                {t("ไม่พบปีการศึกษา \"{q}\" ในที่โหลดไว้", { q: yearFilter })}
              </div>
              {hiddenCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setYearFromLimit(null)}>
                  {t("โหลดปีทั้งหมด ({n} ปีที่ยังไม่โหลด) แล้วค้นใหม่", { n: hiddenCount })}
                </Button>
              )}
            </div>
          ) : (
            <Accordion
              allowsMultipleExpanded
              variant="surface"
              expandedKeys={expanded}
              onExpandedChange={keys => setExpanded(new Set(Array.from(keys as Set<React.Key>).map(String)))}
            >
              {(() => {
                // Only inject decade dividers when the visible list actually
                // spans multiple decades — otherwise the divider is noise.
                const decadesShown = new Set(visibleGroups.map(([y]) => Math.floor(y / 10) * 10));
                const showDecadeDividers = decadesShown.size > 1;
                let lastDecade: number | null = null;
                return visibleGroups.flatMap(([year, list]) => {
                  const decade = Math.floor(year / 10) * 10;
                  const nodes: React.ReactNode[] = [];
                  if (showDecadeDividers && decade !== lastDecade) {
                    nodes.push(
                      <div
                        key={`decade-${decade}`}
                        className="text-xs font-medium text-muted uppercase tracking-wider pt-3 pb-1 px-1 tabular"
                      >
                        {t("ทศวรรษ {decade}", { decade })}
                      </div>
                    );
                    lastDecade = decade;
                  }
                  const usedSemesters = new Set(list.map(t => t.semester));
                  const hasEmptySlot = [1, 2, 3].some(s => !usedSemesters.has(s));
                  const hasActive = list.some(t => t.is_active);
                  nodes.push(
                    <Accordion.Item
                      key={year}
                      id={String(year)}
                      className={`border-l-4 ${hasActive ? "border-l-success" : "border-l-border"}`}
                    >
                    <Accordion.Heading>
                      <Accordion.Trigger>
                        <span className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-base font-bold tabular">{t("ปีการศึกษา {year}", { year })}</span>
                          <span className="text-xs text-muted">
                            {list.length > 0 ? t("· {n} ภาคเรียน", { n: list.length }) : t("· ยังไม่ได้เพิ่มภาคเรียน")}
                          </span>
                          {hasActive && <Chip tone="success">active</Chip>}
                        </span>
                        <Accordion.Indicator />
                      </Accordion.Trigger>
                    </Accordion.Heading>
                    <Accordion.Panel>
                      <Accordion.Body>
                        <div className="flex justify-end mb-3">
                          {hasEmptySlot && (
                            <Button variant="secondary" size="sm" onClick={() => openAddTerm(year)}>
                              <Plus size={13} />{t("เพิ่มภาคเรียน")}
                            </Button>
                          )}
                        </div>
                        {list.length === 0 ? (
                          <div className="text-sm text-muted py-4">
                            {t("ยังไม่มีภาคเรียนในปีนี้ กด \"เพิ่มภาคเรียน\" เพื่อเริ่ม")}
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="data-table w-full">
                              <thead>
                                <tr>
                                  <th>{t("ภาคเรียน")}</th>
                                  <th>{t("ช่วงวันสอน")}</th>
                                  <th className="num">{t("จำนวนเดือน")}</th>
                                  <th>{t("เพดานงบรายวิชา")}</th>
                                  <th>{t("สถานะ")}</th>
                                  <th className="actions" />
                                </tr>
                              </thead>
                              <tbody>
                                {list.map(tm => (
                                  <tr key={tm.id}>
                                    <td className="font-medium">{semesterLabel(tm.semester, t)}</td>
                                    <td className="text-muted text-sm">
                                      {fmtDate(tm.starts_on)} → {fmtDate(tm.ends_on)}
                                    </td>
                                    <td className="num tabular">{tm.months ?? 4}</td>
                                    <td>
                                      <button
                                        type="button"
                                        onClick={() => setCapTarget(tm)}
                                        // A real button, not muted text with a tiny pencil:
                                        // staff could not find where the cap is set.
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-surface-secondary"
                                      >
                                        {tm.course_budget_cap_baht != null
                                          ? <span className="tabular-nums">{t("ไม่เกิน {n} บ.", { n: tm.course_budget_cap_baht.toLocaleString() })}</span>
                                          : <span className="text-muted">{t("ไม่กำหนด")}</span>}
                                        <Pencil size={13} className="text-[var(--brand)]" />
                                        <span className="text-[var(--brand)]">{tm.course_budget_cap_baht != null ? t("แก้ไข") : t("กำหนดเพดาน")}</span>
                                      </button>
                                    </td>
                                    <td>
                                      {tm.is_active
                                        ? <Chip tone="success">active</Chip>
                                        : <Chip tone="neutral">—</Chip>}
                                    </td>
                                    <td className="actions">
                                      <div className="inline-flex gap-1">
                                        <IconButton label={t("แก้ไข")} variant="ghost" size="sm" onClick={() => openEdit(tm)}>
                                          <Pencil size={13} />
                                        </IconButton>
                                        <IconButton label={t("ลบ")} variant="danger-soft" size="sm" onClick={() => setDeleteTarget(tm)}>
                                          <Trash2 size={13} />
                                        </IconButton>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Accordion.Body>
                    </Accordion.Panel>
                  </Accordion.Item>
                  );
                  return nodes;
                });
              })()}
            </Accordion>
          )}

          {!yearFilter.trim() && hiddenCount > 0 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setYearFromLimit(v => (v === null ? null : v - YEAR_PAGE_SIZE))
                }
              >
                {t("แสดงปีเก่ากว่านี้ ({n} ปี)", { n: hiddenCount })}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setYearFromLimit(null)}>
                {t("โหลดทั้งหมด")}
              </Button>
            </div>
          )}
        </div>
      )}

      <YearPickerModal
        open={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
        existingYears={existingYears}
        onPicked={onYearPicked}
      />

      <TermFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editingTerm}
        lockedYear={editingTerm ? editingTerm.academic_year : prefillYear}
        existing={terms}
        activeCount={activeCount}
        onSaved={onSavedTerm}
      />

      <TermDeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={label => { setDeleteTarget(null); toast.success(t("ลบ{label} เรียบร้อยแล้ว", { label })); }}
      />
      {capTarget && <TermBudgetCapModal term={capTarget} onClose={() => setCapTarget(null)} />}
    </Panel>
  );
}

/**
 * เพดานงบรายวิชา — ONE figure every course of the term shares (migration 0144):
 * "ไม่กำหนด" = each course's budget is its workload formula; a figure = the
 * smaller of the formula and the figure. A new term starts from the latest
 * term's value, so this is set once and touched only when the faculty rule
 * changes. Same guards as a headcount edit, course by course: a course with an
 * exported month refuses the change, and courses with approved TAs or hours
 * need an explicit confirm after seeing which ones.
 */
function TermBudgetCapModal({ term, onClose }: { term: Term; onClose: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"none" | "cap">(term.course_budget_cap_baht == null ? "none" : "cap");
  const [amount, setAmount] = useState(term.course_budget_cap_baht == null ? "" : String(term.course_budget_cap_baht));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const num = Number(amount.replace(/,/g, ""));
  const invalid = mode === "cap" && (amount.trim() === "" || !Number.isFinite(num) || num < 0);

  async function save(confirm = false) {
    if (invalid || !term.id) return;
    setSaving(true); setErr(null);
    try {
      await api.patch(`/terms/${term.id}/budget-cap`, {
        budget_cap_baht: mode === "cap" ? num : null,
        confirm: confirm || undefined,
      });
      await mutate((k: unknown) => typeof k === "string" && (k.startsWith("/terms") || k.startsWith("/teaching-courses")));
      toast.success(t("บันทึกเพดานงบรายวิชาแล้ว"));
      onClose();
    } catch (e) {
      const preview = budgetConfirmMessage(e);
      if (preview) setConfirmMsg(preview);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!saving) onClose(); }}
      size="sm"
      title={t("เพดานงบรายวิชา · {semester} {year}", { semester: semesterLabel(term.semester, t), year: term.academic_year })}
      footer={
        confirmMsg ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmMsg(null)} disabled={saving}>{t("ย้อนกลับ")}</Button>
            <Button variant="danger" onClick={() => save(true)} disabled={saving} isPending={saving}>{t("ยืนยันการเปลี่ยนงบ")}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
            <Button variant="primary" onClick={() => save()} disabled={invalid || saving} isPending={saving}>
              <Save size={14} />{t("บันทึก")}
            </Button>
          </>
        )
      }
    >
      {confirmMsg ? (
        <Alert status="warning" title={t("ยืนยันการเปลี่ยนงบประมาณรายวิชา")} description={confirmMsg} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {t("ใช้ร่วมกันทุกวิชาในภาคเรียนนี้ ภาคเรียนที่สร้างใหม่จะใช้ค่าเดียวกับภาคล่าสุดให้เอง")}
          </p>
          <div role="radiogroup" aria-label={t("เพดานงบรายวิชา")} className="space-y-2">
            {([
              { id: "none", title: msg("ไม่กำหนดเพดาน"), note: msg("งบของแต่ละวิชาเป็นไปตามสูตรคำนวณ") },
              { id: "cap", title: msg("กำหนดเพดาน"), note: msg("งบของแต่ละวิชาไม่เกินจำนวนที่กำหนด (ใช้ค่าที่น้อยกว่าระหว่างงบตามสูตรกับเพดาน)") },
            ] as const).map(o => {
              const on = mode === o.id;
              return (
                <div
                  key={o.id}
                  role="radio"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => setMode(o.id)}
                  onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setMode(o.id); } }}
                  className={
                    "cursor-pointer rounded-xl border p-3 transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] " +
                    (on ? "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]" : "border-border hover:bg-surface-secondary")
                  }
                >
                  <div className="flex items-start gap-3">
                    <span className={
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 " +
                      (on ? "border-[var(--brand)]" : "border-slate-400")
                    }>
                      {on && <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t(o.title)}</div>
                      <div className="mt-0.5 text-xs text-muted">{t(o.note)}</div>
                      {o.id === "cap" && on && (
                        <div className="mt-3" onClick={e => e.stopPropagation()}>
                          <label className="mb-1 block text-xs font-medium" htmlFor="cap-amount">{t("ไม่เกินวิชาละ")}</label>
                          <div className="flex items-center gap-2">
                            <TextInput
                              id="cap-amount"
                              inputMode="numeric"
                              placeholder={t("เช่น 20,000")}
                              value={amount === "" ? "" : Number(amount.replace(/,/g, "")).toLocaleString("en-US")}
                              onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                              className="text-right tabular"
                              autoFocus
                            />
                            <span className="text-sm text-muted">{t("บาท")}</span>
                          </div>
                          {invalid && amount.trim() !== "" && (
                            <div className="mt-1 text-xs text-danger">{t("ต้องเป็นจำนวนเงินตั้งแต่ 0 บาทขึ้นไป")}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {err && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={err} />}
        </div>
      )}
    </Modal>
  );
}

function YearPickerModal({
  open, onClose, existingYears, onPicked,
}: {
  open: boolean;
  onClose: () => void;
  existingYears: number[];
  onPicked: (year: number) => void;
}) {
  const { t } = useI18n();
  const [year, setYear] = useState<string>("");

  useEffect(() => {
    if (open) setYear(String(new Date().getFullYear() + 543));
  }, [open]);

  const yearNum = Number(year);
  const yearError =
    year.trim() === "" ? null :
    !Number.isInteger(yearNum) ? t("ปีการศึกษาต้องเป็นจำนวนเต็ม") :
    yearNum < 2500 || yearNum > 2700 ? t("ปีการศึกษาต้องอยู่ระหว่าง 2500–2700 (พ.ศ.)") :
    null;
  const duplicate = year.trim() !== "" && existingYears.includes(yearNum);
  const canPick = year.trim() !== "" && !yearError && !duplicate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Plus size={18} />{t("เพิ่มปีการศึกษา")}
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={() => onPicked(yearNum)} disabled={!canPick}>
            {t("ถัดไป เพิ่มภาคเรียน")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {t("กรอกปีการศึกษาที่ต้องการสร้าง จากนั้นจะให้เพิ่มภาคเรียน (ต้น / ปลาย / ฤดูร้อน) ภายในปีนั้น")}
        </div>
        <FieldGroup
          label={t("ปีการศึกษา (พ.ศ.)")}
          hint={t("เช่น 2568")}
          error={yearError ?? undefined}
        >
          <TextInput
            type="number" min={2500} max={2700} step={1}
            value={year}
            onChange={e => setYear(e.target.value)}
            placeholder="2568"
            autoFocus
          />
        </FieldGroup>
        {duplicate && (
          <Alert
            status="warning"
            icon={<CircleAlert size={16} />}
            title={t("ปีการศึกษา {year} มีอยู่แล้ว", { year: yearNum })}
            description={t("ให้ปิดหน้านี้แล้วเลื่อนลงไปที่กลุ่มของปีนั้น กด 'เพิ่มภาคเรียน' แทน")}
          />
        )}
      </div>
    </Modal>
  );
}

// Difference in whole months between two YYYY-MM-DD strings (inclusive of
// partial months). Returns null if either date is empty.
function monthsBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) return null;
  const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round((days / 30.4375) * 10) / 10;
}

// Calendar months the term's dates touch (Jun 1–Sep 30 → 4), mirroring
// service.TermMonthSpan. Null while either date is missing or reversed.
function calendarMonthSpan(start?: string, end?: string): number | null {
  if (!start || !end || start > end) return null;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return null;
  return (ey - sy) * 12 + (em - sm) + 1;
}

function TermFormModal({
  open, onClose, editing, lockedYear, existing, activeCount, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Term | null;
  // When set (and no editing target), the year field is disabled and only
  // unused semesters within this year are offered.
  lockedYear: number | null;
  existing: Term[];
  activeCount: number;
  onSaved: (label: string, mode: "add" | "edit", saved: Term) => void;
}) {
  const { t, fmtDate } = useI18n();
  const isEdit = editing !== null;
  const yearIsLocked = isEdit || lockedYear !== null;
  const [draft, setDraft] = useState<Term>(() => ({
    academic_year: new Date().getFullYear() + 543,
    semester: 1,
    months: 4,
    starts_on: "",
    ends_on: "",
    is_active: false,
  }));
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Semesters already used in the target year (excludes self when editing).
  const usedSemesters = useMemo(() => {
    const year = editing?.academic_year ?? lockedYear ?? draft.academic_year;
    return new Set(
      existing
        .filter(t => t.academic_year === year && (!editing || t.id !== editing.id))
        .map(t => t.semester),
    );
  }, [existing, editing, lockedYear, draft.academic_year]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDraft(editing);
    } else {
      const year = lockedYear ?? new Date().getFullYear() + 543;
      const usedForYear = new Set(
        existing.filter(t => t.academic_year === year).map(t => t.semester),
      );
      const nextSem = [1, 2, 3].find(s => !usedForYear.has(s)) ?? 1;
      setDraft({
        academic_year: year,
        semester: nextSem,
        months: 4,
        starts_on: "",
        ends_on: "",
        is_active: false,
      });
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, lockedYear]);

  const yearError =
    !Number.isInteger(draft.academic_year) ? t("ปีการศึกษาต้องเป็นจำนวนเต็ม") :
    draft.academic_year < 2500 || draft.academic_year > 2700 ? t("ปีการศึกษาต้องอยู่ระหว่าง 2500–2700 (พ.ศ.)") :
    null;
  const semesterError =
    ![1, 2, 3].includes(draft.semester) ? t("ภาคเรียนต้องเป็น 1, 2 หรือ 3 (ฤดูร้อน)") : null;
  // Same bound the server enforces (UpsertTerm): months multiplies every
  // course budget, so it may not exceed the calendar months the dates touch —
  // a Jun 1–Sep 30 term saved with 12 tripled every budget.
  const calSpan = calendarMonthSpan(draft.starts_on, draft.ends_on);
  const maxMonths = calSpan ?? 12;
  const monthsError =
    !Number.isFinite(draft.months) || draft.months < 1 || draft.months > maxMonths
      ? (calSpan !== null
          ? t("จำนวนเดือนต้องอยู่ระหว่าง 1–{n} ตามช่วงวันเริ่ม–สิ้นสุด (ครอบคลุม {n} เดือน)", { n: calSpan })
          : t("จำนวนเดือนต้องอยู่ระหว่าง 1–12"))
      : null;
  const startsError =
    !draft.starts_on ? t("กรุณาระบุวันเริ่มสอน") : null;
  const endsError =
    !draft.ends_on ? t("กรุณาระบุวันสิ้นสุดสอน") :
    draft.starts_on && draft.ends_on && draft.starts_on >= draft.ends_on
      ? t("วันสิ้นสุดต้องหลังวันเริ่ม") : null;
  // Exam ranges — required (backend enforces). Also sanity-check that the
  // range is closed (start ≤ end); we don't force it inside term start/end
  // because faculty sometimes sets exams just outside the teaching window.
  const midtermStartsError = !draft.midterm_starts_on ? t("กรุณาระบุวันเริ่มสอบกลางภาค") : null;
  const midtermEndsError =
    !draft.midterm_ends_on ? t("กรุณาระบุวันสิ้นสุดสอบกลางภาค") :
    draft.midterm_starts_on && draft.midterm_ends_on && draft.midterm_starts_on > draft.midterm_ends_on
      ? t("วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม") : null;
  const finalStartsError = !draft.final_starts_on ? t("กรุณาระบุวันเริ่มสอบปลายภาค") : null;
  const finalEndsError =
    !draft.final_ends_on ? t("กรุณาระบุวันสิ้นสุดสอบปลายภาค") :
    draft.final_starts_on && draft.final_ends_on && draft.final_starts_on > draft.final_ends_on
      ? t("วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม") : null;

  // Duplicate (year, semester) — only relevant in add mode; edit mode locks these.
  const duplicate = !isEdit
    ? existing.find(t => t.academic_year === draft.academic_year && t.semester === draft.semester)
    : null;

  // Sanity: months vs actual date span.
  const spanMonths = monthsBetween(draft.starts_on, draft.ends_on);
  const spanMismatch =
    spanMonths !== null && Math.abs(spanMonths - draft.months) > 1
      ? { span: spanMonths, months: draft.months } : null;

  // Activating this term while others are already active.
  const willAddAnotherActive =
    draft.is_active && (!editing || !editing.is_active) && activeCount > 0;

  const noChange = isEdit && editing &&
    draft.months === editing.months &&
    (draft.starts_on ?? "") === (editing.starts_on ?? "") &&
    (draft.ends_on ?? "") === (editing.ends_on ?? "") &&
    (draft.midterm_starts_on ?? "") === (editing.midterm_starts_on ?? "") &&
    (draft.midterm_ends_on ?? "") === (editing.midterm_ends_on ?? "") &&
    (draft.final_starts_on ?? "") === (editing.final_starts_on ?? "") &&
    (draft.final_ends_on ?? "") === (editing.final_ends_on ?? "") &&
    draft.is_active === editing.is_active;

  const canSave =
    !yearError && !semesterError && !monthsError && !startsError && !endsError &&
    !midtermStartsError && !midtermEndsError && !finalStartsError && !finalEndsError &&
    !duplicate && !noChange;

  function askSave() {
    setError(null);
    if (!canSave) return;
    setConfirming(true);
  }

  async function doSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Term = {
        ...draft,
        ...(isEdit && editing ? { id: editing.id } : {}),
      };
      const saved = await api.post<Term>("/terms", payload);
      await mutateAllTerms();
      onSaved(termLabel(draft, t), isEdit ? "edit" : "add", { ...payload, ...(saved ?? {}) });
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message || t("บันทึกไม่สำเร็จ"));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-2">
            {isEdit ? <Pencil size={18} /> : <Plus size={18} />}
            {isEdit
              ? t("แก้ไข{term}", { term: termLabel(editing!, t) })
              : lockedYear !== null
                ? t("เพิ่มภาคเรียน ปีการศึกษา {year}", { year: lockedYear })
                : t("เพิ่มภาคเรียนใหม่")}
          </span>
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
            <Button variant="primary" onClick={askSave} disabled={!canSave || saving} isPending={saving}>
              <Save size={14} />{isEdit ? t("บันทึกการแก้ไข") : t("เพิ่มภาคเรียน")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {isEdit && (
            <Alert
              status="default"
              icon={<CircleAlert size={16} />}
              title={t("แก้ไขภาคเรียน ล็อกคีย์หลัก")}
              description={t("ปีการศึกษาและภาคเรียนล็อกไว้ เพราะเป็นตัวอ้างอิงของวิชาที่เปิดสอน / ตารางสอน TA / งบประมาณ หากต้องเปลี่ยน ให้ลบและสร้างใหม่ (ต้องไม่มีข้อมูลอ้างอิงเหลืออยู่)")}
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FieldGroup
              label={t("ปีการศึกษา (พ.ศ.)")}
              hint={yearIsLocked ? (isEdit ? t("ล็อกไม่ให้แก้") : t("เลือกจากขั้นก่อนหน้า")) : t("เช่น 2568")}
              error={yearError ?? undefined}
            >
              <TextInput
                type="number" min={2500} max={2700} step={1}
                value={draft.academic_year}
                disabled={yearIsLocked}
                onChange={e => setDraft({ ...draft, academic_year: Number(e.target.value) })}
                autoFocus={!yearIsLocked}
              />
            </FieldGroup>
            <FieldGroup
              label={t("ภาคเรียน")}
              hint={
                isEdit
                  ? t("ล็อกไม่ให้แก้")
                  : usedSemesters.size > 0
                    ? t("ภาคที่มีแล้ว: {list}", { list: Array.from(usedSemesters).sort().map(s => semesterLabel(s, t)).join(", ") })
                    : t("ต้น / ปลาย / ฤดูร้อน")
              }
              error={semesterError ?? undefined}
            >
              <Select
                value={String(draft.semester)}
                disabled={isEdit}
                onChange={e => setDraft({ ...draft, semester: Number(e.target.value) })}
                autoFocus={!isEdit && yearIsLocked}
              >
                {[1, 2, 3].map(s => (
                  <option
                    key={s}
                    value={String(s)}
                    disabled={!isEdit && usedSemesters.has(s)}
                  >
                    {!isEdit && usedSemesters.has(s) ? t("{semester} (มีแล้ว)", { semester: semesterLabel(s, t) }) : semesterLabel(s, t)}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup
              label={t("จำนวนเดือนที่เปิด")}
              hint={t("ใช้คำนวณค่าจ้าง")}
              error={monthsError ?? undefined}
            >
              <TextInput
                type="number" min={1} max={maxMonths} step={1}
                value={draft.months}
                onChange={e => setDraft({ ...draft, months: Number(e.target.value) })}
              />
            </FieldGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldGroup label={t("วันที่เริ่มสอน")} error={startsError ?? undefined}>
              <TermDateField
                label={t("วันที่เริ่มสอน")}
                value={draft.starts_on ?? ""}
                onChange={v => setDraft({ ...draft, starts_on: v })}
              />
            </FieldGroup>
            <FieldGroup label={t("วันที่สิ้นสุดสอน")} error={endsError ?? undefined}>
              <TermDateField
                label={t("วันที่สิ้นสุดสอน")}
                value={draft.ends_on ?? ""}
                onChange={v => setDraft({ ...draft, ends_on: v })}
              />
            </FieldGroup>
          </div>

          {/* Exam windows — worklog entries falling inside these ranges are
              rejected. Faculty publishes these once per term. */}
          <div className="rounded-lg border border-border p-3 space-y-3 bg-surface-secondary/40">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide">{t("ช่วงสอบตามประกาศคณะ")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label={t("เริ่มสอบกลางภาค")} error={midtermStartsError ?? undefined}>
                <TermDateField
                  label={t("เริ่มสอบกลางภาค")}
                  value={draft.midterm_starts_on ?? ""}
                  onChange={v => setDraft({ ...draft, midterm_starts_on: v })}
                />
              </FieldGroup>
              <FieldGroup label={t("สิ้นสุดสอบกลางภาค")} error={midtermEndsError ?? undefined}>
                <TermDateField
                  label={t("สิ้นสุดสอบกลางภาค")}
                  value={draft.midterm_ends_on ?? ""}
                  onChange={v => setDraft({ ...draft, midterm_ends_on: v })}
                />
              </FieldGroup>
              <FieldGroup label={t("เริ่มสอบปลายภาค")} error={finalStartsError ?? undefined}>
                <TermDateField
                  label={t("เริ่มสอบปลายภาค")}
                  value={draft.final_starts_on ?? ""}
                  onChange={v => setDraft({ ...draft, final_starts_on: v })}
                />
              </FieldGroup>
              <FieldGroup label={t("สิ้นสุดสอบปลายภาค")} error={finalEndsError ?? undefined}>
                <TermDateField
                  label={t("สิ้นสุดสอบปลายภาค")}
                  value={draft.final_ends_on ?? ""}
                  onChange={v => setDraft({ ...draft, final_ends_on: v })}
                />
              </FieldGroup>
            </div>
            <div className="text-xs text-muted">
              {t("TA จะลงบันทึกเวลาในช่วงนี้ไม่ได้ ระบบจะปฏิเสธอัตโนมัติ")}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 flex items-center gap-2">
            <input
              id="term-active-modal"
              type="checkbox"
              checked={draft.is_active}
              onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
            />
            <label htmlFor="term-active-modal" className="text-sm select-none">
              {t("ตั้งเป็นภาคเรียนปัจจุบัน (active)")}
            </label>
          </div>

          {duplicate && (
            <Alert
              status="danger"
              icon={<CircleAlert size={16} />}
              title={t("{term} มีอยู่แล้ว", { term: termLabel(duplicate, t) })}
              description={t("ห้ามซ้ำ หากต้องการแก้ไข ให้ปิดหน้านี้แล้วกด 'แก้ไข' ที่แถวนั้นแทน")}
            />
          )}

          {spanMismatch && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title={t("จำนวนเดือนไม่ตรงกับช่วงวันที่")}
              description={t("ช่วงวันที่เริ่ม–สิ้นสุดคือประมาณ {span} เดือน แต่กรอกไว้ {months} เดือน ค่าจ้างอาจคำนวณไม่ตรงกับที่คาด", { span: spanMismatch.span, months: spanMismatch.months })}
            />
          )}

          {willAddAnotherActive && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title={t("มีภาคเรียนที่ active อยู่ {n} รายการแล้ว", { n: activeCount })}
              description={t("ระบบยอมให้มีหลาย active พร้อมกัน แต่จะกำกวมว่าอันไหนคือภาคปัจจุบัน แนะนำให้ปิด active ของภาคเดิมก่อน")}
            />
          )}

          {noChange && (
            <div className="text-xs text-muted">{t("ยังไม่มีการเปลี่ยนแปลง")}</div>
          )}

          {error && (
            <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={error} />
          )}
        </div>
      </Modal>

      <ConfirmSaveModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doSave}
        saving={saving}
        title={isEdit ? t("ยืนยันบันทึกการแก้ไข?") : t("ยืนยันเพิ่มภาคเรียน?")}
        description={(() => {
          const vars = {
            term: termLabel(draft, t), months: draft.months,
            start: fmtDate(draft.starts_on), end: fmtDate(draft.ends_on),
            active: draft.is_active ? ", active" : "",
          };
          return isEdit
            ? t("อัปเดต{term} {months} เดือน, {start} → {end}{active}", vars)
            : t("สร้าง{term} {months} เดือน, {start} → {end}{active}", vars);
        })()}
      />
    </>
  );
}

function TermDeleteModal({
  target, onClose, onDone,
}: {
  target: Term | null;
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const { t, fmtDate } = useI18n();
  const open = target !== null;
  const [usage, setUsage] = useState<TermUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: a failed usage lookup is not a failed delete, and
  // labelling it "ลบไม่สำเร็จ" sent the officer looking for the wrong problem.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target?.id) return;
    setTyped("");
    setError(null);
    setLoadError(null);
    setUsage(null);
    setLoadingUsage(true);
    api.get<TermUsage>(`/terms/${target.id}/usage`)
      .then(setUsage)
      .catch(e => setLoadError((e as Error).message || t("โหลดข้อมูลอ้างอิงไม่สำเร็จ")))
      .finally(() => setLoadingUsage(false));
  }, [open, target?.id]);

  if (!target) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const label = termLabel(target, t);
  // Confirmation code — easier to type than the Thai label, unambiguous per term.
  const confirmCode = `${target.academic_year}/${target.semester}`;
  const blocking =
    usage !== null &&
    usage.teaching_courses + usage.class_schedules + usage.exports > 0;
  const cascadeWindows = (usage?.request_windows ?? 0) > 0;
  const codeMatch = typed.trim() === confirmCode;
  const canDelete = !loadingUsage && usage !== null && !blocking && codeMatch;

  async function doDelete() {
    if (!canDelete || !target?.id) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/terms/${target.id}`);
      await mutateAllTerms();
      onDone(label);
    } catch (e) {
      setError((e as Error).message || t("ลบไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("ยืนยันลบภาคเรียน")}
      icon={<CircleAlert size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="danger" onClick={doDelete} disabled={!canDelete || saving} isPending={saving}>
            <Trash2 size={14} />{t("ลบภาคเรียน")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-slate-50 p-3">
          <div className="text-xs text-muted mb-1">{t("ภาคเรียนที่จะลบ")}</div>
          <div className="tabular font-medium">{label}</div>
          <div className="text-xs text-muted mt-1">
            {t("{start} → {end} · {months} เดือน", { start: fmtDate(target.starts_on), end: fmtDate(target.ends_on), months: target.months })}
            {target.is_active && " · active"}
          </div>
        </div>

        {loadingUsage ? (
          <div className="rounded-lg border border-border p-3" role="status" aria-busy="true">
            <span className="sr-only">{t("กำลังตรวจข้อมูลอ้างอิง…")}</span>
            <Skel className="h-3 w-16 mb-3" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex justify-between gap-4">
                  <Skel className="h-3.5 w-40" />
                  <Skel className="h-3.5 w-6" />
                </div>
              ))}
            </div>
          </div>
        ) : usage ? (
          <>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                {t("ผลกระทบ")}
              </div>
              <ul className="text-sm space-y-1">
                <li className="flex justify-between">
                  <span>{t("รายวิชาที่เปิดสอนในภาคนี้")}</span>
                  <span className={usage.teaching_courses > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.teaching_courses}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>{t("ตารางสอน TA")}</span>
                  <span className={usage.class_schedules > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.class_schedules}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>{t("ไฟล์ส่งออกที่ผูกไว้")}</span>
                  <span className={usage.exports > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.exports}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>{t("รอบเปิดรับ TA (จะถูกลบตาม)")}</span>
                  <span className="tabular text-muted">{usage.request_windows}</span>
                </li>
              </ul>
            </div>

            {blocking ? (
              <Alert
                status="danger"
                icon={<CircleAlert size={16} />}
                title={t("ลบไม่ได้ มีข้อมูลอ้างอิงอยู่")}
                description={t("ต้องลบวิชาที่เปิดสอน ตารางสอน TA และไฟล์ส่งออกของภาคเรียนนี้ก่อน จึงจะลบได้ (ป้องกันข้อมูลกำพร้า)")}
              />
            ) : (
              <>
                {cascadeWindows && (
                  <Alert
                    status="warning"
                    icon={<CircleAlert size={16} />}
                    title={t("รอบเปิดรับ TA จำนวน {n} รายการจะถูกลบพร้อมกัน", { n: usage.request_windows })}
                    description={t("ตารางรอบเปิดรับผูกกับภาคเรียนแบบ cascade เมื่อลบภาคเรียนจะลบตามอัตโนมัติ")}
                  />
                )}
                <div className="text-sm">
                  {t.rich("การลบไม่สามารถย้อนกลับได้ เพื่อยืนยัน กรุณาพิมพ์ {code} ด้านล่าง", { code: <b className="tabular">{confirmCode}</b> })}
                </div>
                <FieldGroup label={t("พิมพ์ \"{code}\" เพื่อยืนยัน", { code: confirmCode })}>
                  <TextInput
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={confirmCode}
                    autoFocus
                  />
                </FieldGroup>
                {typed.trim() !== "" && !codeMatch && (
                  <div className="text-xs text-red-600">{t("รหัสไม่ตรง")}</div>
                )}
              </>
            )}
          </>
        ) : null}

        {loadError && (
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title={t("ตรวจข้อมูลอ้างอิงไม่สำเร็จ")}
            description={t("{error} ยังลบไม่ได้จนกว่าจะตรวจได้ว่ามีอะไรผูกอยู่กับภาคเรียนนี้", { error: loadError })}
          />
        )}

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title={t("ลบไม่สำเร็จ")} description={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function ViewGroup({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-l-4 bg-default/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {children}
      </dl>
    </div>
  );
}

// Same boxes as the read-only rate view (row counts per ViewGroup, then the
// formula button), so the values land in place instead of the "ยังไม่มีอัตรา…"
// empty line flashing first.
function PayRateSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-5" role="status" aria-busy="true">
      <span className="sr-only">{t("กำลังโหลด")}</span>
      {[4, 4, 1, 3, 1, 5].map((n, g) => (
        <div key={g} className="rounded-lg border border-border border-l-4 bg-default/40 p-4">
          <Skel className="h-4 w-44 mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <Skel className="h-3.5 w-32" />
                <Skel className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Skel className="h-[74px] w-full rounded-lg" />
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function EditGroup({
  title, description, children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-l-4 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

function F({
  label, value, onChange, type = "text", error, min,
}: { label: string; value: string | number; onChange: (v: string) => void; type?: string; error?: string | null; min?: number }) {
  // Validation messages arrive as msg() keys (vPositive & co.); translated here.
  const { t } = useI18n();
  return (
    <FieldGroup label={label} error={error ? t(error) : undefined}>
      <TextInput
        type={type}
        min={min}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={e => onChange(e.target.value)}
      />
    </FieldGroup>
  );
}

/* Positive-number validators shared by the pay-rate editor. */
function vPositive(v: number): string | null {
  if (!Number.isFinite(v)) return msg("กรุณากรอกตัวเลข");
  if (v <= 0) return msg("ต้องมากกว่า 0");
  return null;
}
function vPositiveInt(v: number): string | null {
  if (!Number.isFinite(v)) return msg("กรุณากรอกตัวเลข");
  if (!Number.isInteger(v) || v <= 0) return msg("ต้องเป็นจำนวนเต็มมากกว่า 0");
  return null;
}

function ConfirmSaveModal({
  open, onClose, onConfirm, saving, title, description,
  variant = "primary", confirmLabel = msg("ยืนยันบันทึก"), confirmIcon,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  saving: boolean; title: string; description: string;
  variant?: "primary" | "danger";
  confirmLabel?: string;
  confirmIcon?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<CircleAlert size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant={variant} onClick={onConfirm} isPending={saving}>
            {confirmIcon ?? <Check size={14} />}{t(confirmLabel)}
          </Button>
        </>
      }
    >
      <p className="text-sm">{description}</p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* TA request windows — per-term open/close scheduling                         */
/* -------------------------------------------------------------------------- */

interface RequestWindow {
  id: string;
  term_id: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  note?: string | null;
  // เปิดแล้วระบบส่งอีเมลแจ้งอาจารย์อัตโนมัติ (ตอนเปิดรับ + 3 วันก่อนครบกำหนด)
  notify_lecturers?: boolean | null;
  open_sent?: number;
  closing_sent?: number;
}

// Mirrors TARequestService.WindowReadiness — who the automatic mail reaches,
// and the course data still missing.
interface WindowReadiness {
  courses_total: number;
  lecturers_ready: number;
  courses_without_lecturer: { id: string; code: string; name_th: string }[];
  lecturers_without_course: { id: string; name: string; email: string }[];
}

// กำหนดส่งไม่ได้ "ปิดรับ" อีกต่อไป — มีแค่ 2 สถานะเดียวกับฝั่งอาจารย์:
// ยังไม่ถึงกำหนด (ส่งแล้วนับว่าทันเวลา) กับ เลยกำหนด (ส่งได้ แต่นับว่าล่าช้า)
function windowStatus(w: RequestWindow, now = Date.now()) {
  const closes = new Date(w.closes_at).getTime();
  if (now > closes) return { tone: "warn" as const, label: msg("เลยกำหนด คำขอใหม่นับเป็นส่งช้า") };
  return { tone: "success" as const, label: msg("ยังไม่ถึงกำหนด ส่งทันเวลา") };
}

function RequestWindowsSection() {
  const { t, fmtDate } = useI18n();
  // Follows the shell's term switcher like every other term-scoped staff view.
  // This section used to carry its own <Select>, which meant the settings page
  // could show one term in the top bar and a different one here — the exact
  // disagreement the shared switcher was introduced to remove.
  const { terms, termId } = useTerm();
  const swrKey = useTermKey("/ta-request/windows");
  const { data: windows } = useSWR<RequestWindow[]>(swrKey, { keepPreviousData: true });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RequestWindow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RequestWindow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Double-fire guard for the "กำหนดส่งใน 30 วัน" quick action.
  const [quickOpening, setQuickOpening] = useState(false);

  const noTerms = terms !== undefined && terms.length === 0;
  const term = terms?.find(t => t.id === termId);
  const list = windows ?? [];


  async function quickOpen30Days() {
    if (!termId || quickOpening) return;
    setQuickOpening(true);
    const now = new Date();
    // 30 calendar days from now — matches the label (the old +1 month was wrong).
    const end = new Date();
    end.setDate(end.getDate() + 30);
    try {
      await api.post("/ta-request/windows", {
        term_id: termId,
        opens_at: now.toISOString(),
        closes_at: end.toISOString(),
        is_open: true,
        note: "เปิดด่วน (30 วัน)", // i18n-ignore — stored note (data), shown as saved
        notify_lecturers: true,
      });
      await mutate(swrKey);
      toast.success(t("เปิดรับสมัครทันทีแล้ว"), { description: t("ระยะเวลา 30 วัน") });
    } catch (e) {
      toast.danger(t("เปิดรับสมัครทันทีไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setQuickOpening(false);
    }
  }
  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/ta-request/windows/${deleteTarget.id}`);
      await mutate(swrKey);
      toast.success(t("ลบช่วงเวลารับสมัครแล้ว"));
      setDeleteTarget(null);
    } catch (e) {
      toast.danger(t("ลบช่วงเวลารับสมัครไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title={t("ระยะเวลารับสมัคร TA")}
      description={t("อาจารย์ส่งคำขอ TA ได้ตั้งแต่วันเปิดรับของภาคเรียน เลยกำหนดส่งแล้วยังส่งได้ แต่คำขอจะถูกทำเครื่องหมายว่า “ส่งช้า” และการเบิกจ่ายจะล่าช้าตาม")}
      actions={
        !noTerms && (
          <Button
            variant="primary"
            disabled={!termId}
            onClick={() => { setEditing(null); setFormOpen(true); }}
          >
            <Plus size={14} /> {t("เพิ่มช่วงเวลา")}
          </Button>
        )
      }
    >
      {!noTerms && termId && <WindowReadinessPanel termId={termId} />}
      {noTerms ? (
        <Alert
          status="warning"
          title={t("ยังไม่มีปีการศึกษา / ภาคเรียน")}
          description={t("ต้องสร้างภาคเรียนที่แท็บ 'ภาคเรียน' ก่อน จึงจะกำหนดช่วงเวลารับสมัครได้")}
        />
      ) : !windows ? (
        <SkelList items={2} icon={false} bordered />
      ) : list.length === 0 ? (
        <div className="py-8 flex flex-col items-center gap-3 text-center border border-dashed border-hairline rounded-lg">
          <CalendarDays size={28} className="text-muted" />
          <div>
            <div className="text-sm font-medium">
              {t("ยังไม่ได้กำหนดวันส่งคำขอ TA สำหรับ {term}", { term: `${term?.academic_year ?? ""}/${term?.semester ?? ""}` })}
            </div>
            <div className="text-xs text-muted mt-1">
              {t("อาจารย์จะส่งคำขอ TA ของภาคเรียนนี้ไม่ได้ จนกว่าจะกำหนดช่วงรับคำขอ")}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => { setEditing(null); setFormOpen(true); }}
            >
              <CalendarDays size={14} /> {t("กำหนดวันเอง")}
            </Button>
            <Button
              variant="primary"
              onClick={quickOpen30Days}
              disabled={quickOpening}
              isPending={quickOpening}
            >
              <Power size={14} /> {t("กำหนดส่งใน 30 วัน")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(w => {
            const st = windowStatus(w);
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-panel px-4 py-3"
              >
                <Chip tone={st.tone}>{t(st.label)}</Chip>
                <div className="flex flex-col min-w-0">
                  <div className="text-sm font-medium tabular">
                    {formatDateTime(w.opens_at, fmtDate, t)} → {formatDateTime(w.closes_at, fmtDate, t)}
                  </div>
                  {w.note && (
                    <Tip content={w.note}>
                      <div className="text-xs text-muted truncate">{w.note}</div>
                    </Tip>
                  )}
                  <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    {w.notify_lecturers ? (
                      <>
                        <Mail size={12} />
                        {(w.closing_sent ?? 0) > 0
                          ? t("แจ้งอาจารย์อัตโนมัติ · แจ้งเปิดรับแล้ว {open} คน · เตือนก่อนครบกำหนด {closing} คน", { open: w.open_sent ?? 0, closing: w.closing_sent })
                          : t("แจ้งอาจารย์อัตโนมัติ · แจ้งเปิดรับแล้ว {open} คน", { open: w.open_sent ?? 0 })}
                      </>
                    ) : (
                      <><MailX size={12} /> {t("ไม่ส่งอีเมลแจ้งอาจารย์")}</>
                    )}
                  </div>
                </div>
                <div className="ms-auto flex items-center gap-2">
                  <IconButton
                    label={t("แก้ไข")}
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditing(w); setFormOpen(true); }}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label={t("ลบ")}
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(w)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WindowFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        termId={termId}
        editing={editing}
        onSaved={async () => {
          setFormOpen(false);
          await mutate(swrKey);
          toast.success(editing ? t("แก้ไขช่วงเวลาแล้ว") : t("เพิ่มช่วงเวลาแล้ว"));
        }}
      />

      <ConfirmSaveModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        saving={deleting}
        variant="danger"
        confirmLabel={t("ลบ")}
        confirmIcon={<Trash2 size={14} />}
        title={t("ลบช่วงเวลารับสมัคร?")}
        description={t("การลบจะไม่มีผลกับคำขอที่ส่งมาก่อนหน้านี้ แต่จะไม่สามารถลบได้ถ้ามีคำขออ้างอิงช่วงเวลานี้อยู่")}
      />
    </Panel>
  );
}

// "ความพร้อมก่อนแจ้งอาจารย์" — the automatic mail only reaches lecturers who
// already have a course this term, so what staff need to see is the data that
// would leave someone out: courses nobody is attached to (usually a registrar
// name that did not match an account) and lecturers still without a course.
function WindowReadinessPanel({ termId }: { termId: string }) {
  const { t } = useI18n();
  const { data, error } = useSWR<WindowReadiness>(`/ta-request/windows/readiness?term_id=${termId}`);
  const [showCourses, setShowCourses] = useState(false);
  const [showLecturers, setShowLecturers] = useState(false);
  if (error) return null;
  // The panel always shows once loaded, so hold its box (title + chip row)
  // while it loads instead of letting the window list below jump down.
  if (!data) {
    return (
      <div className="mb-3 rounded-lg border border-hairline bg-panel px-4 py-3 space-y-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Mail size={14} /> {t("ความพร้อมก่อนแจ้งอาจารย์")}
        </div>
        <div className="flex flex-wrap gap-2">
          <Skel className="h-6 w-56 rounded-full" />
          <Skel className="h-6 w-44 rounded-full" />
        </div>
      </div>
    );
  }

  const missingCourses = data.courses_without_lecturer;
  const idle = data.lecturers_without_course;
  return (
    <div className="mb-3 rounded-lg border border-hairline bg-panel px-4 py-3 space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5">
        <Mail size={14} /> {t("ความพร้อมก่อนแจ้งอาจารย์")}
      </div>
      {data.courses_total === 0 ? (
        <Alert
          status="warning"
          title={t("ยังไม่มีรายวิชาในภาคเรียนนี้")}
          description={t("ระบบจะยังไม่ส่งอีเมลถึงอาจารย์คนใด จนกว่าจะนำเข้าหรือเพิ่มรายวิชาที่หน้า 'วิชาที่เปิดสอน'")}
        />
      ) : (
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip tone="success"><Check size={12} /> {t("อาจารย์ที่มีวิชาแล้ว {n} คน (จะได้รับอีเมล)", { n: data.lecturers_ready })}</Chip>
          {missingCourses.length > 0 ? (
            <button type="button" className="inline-flex items-center gap-1 cursor-pointer text-muted" aria-expanded={showCourses} onClick={() => setShowCourses(v => !v)}>
              <Chip tone="warn"><CircleAlert size={12} /> {t("วิชาที่ยังไม่มีอาจารย์ผูก {n} วิชา", { n: missingCourses.length })}</Chip>
              <ChevronDown size={14} className={showCourses ? "rotate-180" : ""} />
            </button>
          ) : (
            <Chip tone="success"><Check size={12} /> {t("ทุกวิชามีอาจารย์ผู้สอนแล้ว")}</Chip>
          )}
          {idle.length > 0 && (
            <button type="button" className="inline-flex items-center gap-1 cursor-pointer text-muted" aria-expanded={showLecturers} onClick={() => setShowLecturers(v => !v)}>
              <Chip tone="neutral">{t("อาจารย์ที่ยังไม่มีวิชา {n} คน (ยังไม่ส่ง)", { n: idle.length })}</Chip>
              <ChevronDown size={14} className={showLecturers ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}
      {showCourses && missingCourses.length > 0 && (
        <div className="text-xs">
          <div className="text-muted mb-1">
            {t.rich("อาจารย์ของวิชาเหล่านี้จะไม่ได้รับอีเมลและจะไม่เห็นวิชาที่หน้าแรก — ผูกอาจารย์ผู้สอนที่หน้า {link} แล้วระบบจะส่งอีเมลให้เองภายใน 1 ชั่วโมง", {
              link: <a href="/staff/teaching" className="underline">{t("วิชาที่เปิดสอน")}</a>,
            })}
          </div>
          <ul className="list-disc ps-5 space-y-0.5">
            {missingCourses.map(c => (
              <li key={c.id}>
                <a href={`/staff/teaching/${c.id}`} className="underline tabular">{c.code}</a> {c.name_th}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showLecturers && idle.length > 0 && (
        <div className="text-xs">
          <div className="text-muted mb-1">
            {t("ส่วนใหญ่เป็นอาจารย์ที่ไม่ได้สอนภาคนี้ หากมีวิชาภายหลัง ระบบจะส่งอีเมลให้เอง")}
          </div>
          <ul className="list-disc ps-5 space-y-0.5">
            {idle.map(l => <li key={l.id}>{l.name} <span className="text-muted">{l.email}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// "22 มิ.ย. 2569 14:30 น." / "22 Jun 2026 14:30" — local wall clock.
function formatDateTime(iso: string, fmtDate: (iso?: string | null) => string, t: TFn): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return t("{date} {time} น.", { date: fmtDate(day), time: `${hh}:${mm}` });
}

// "YYYY-MM-DDTHH:mm" (local wall-clock) ↔ ISO round-trip. We deliberately treat
// the input as local time so the picker matches what the staff typed.
function dateToLocalMinute(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}
function isoToLocalMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateToLocalMinute(d);
}
function localMinuteToISO(local: string): string {
  // new Date("YYYY-MM-DDTHH:mm") is parsed as local time — exactly the intent.
  return new Date(local).toISOString();
}

// Date + time (minute precision) picker in Thai locale. Mirrors TermDateField
// but uses parseDateTime so the calendar exposes hour/minute segments.
function TermDateTimeField({
  label, value, onChange, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (localMinute: string) => void;
  autoFocus?: boolean;
}) {
  const { intl } = useI18n();
  let dv: DateValue | null = null;
  if (value) {
    // Accept "YYYY-MM-DDTHH:mm" (no seconds) — parseDateTime wants seconds.
    const withSec = value.length === 16 ? `${value}:00` : value;
    try { dv = parseDateTime(withSec); } catch { dv = null; }
  }
  return (
    <I18nProvider locale={intl}>
      <DatePicker
        aria-label={label}
        value={dv}
        onChange={v => onChange(v ? v.toString().slice(0, 16) : "")}
        autoFocus={autoFocus}
        granularity="minute"
        hourCycle={24}
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {segment => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}

function WindowFormModal({
  open, onClose, termId, editing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  editing: RequestWindow | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  // Local wall-clock strings in "YYYY-MM-DDTHH:mm" — timezone applied at submit.
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState("");
  const [notifyLecturers, setNotifyLecturers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setOpensAt(isoToLocalMinute(editing.opens_at));
      setClosesAt(isoToLocalMinute(editing.closes_at));
      setIsOpen(editing.is_open);
      setNote(editing.note ?? "");
      setNotifyLecturers(!!editing.notify_lecturers);
    } else {
      const now = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 30);
      setOpensAt(dateToLocalMinute(now));
      setClosesAt(dateToLocalMinute(end));
      setIsOpen(true);
      setNote("");
      setNotifyLecturers(true);
    }
    setErr(null);
  }, [open, editing]);

  const canSave = !!termId && !!opensAt && !!closesAt && opensAt < closesAt;

  async function submit() {
    if (!canSave) {
      setErr(t("กรุณากรอกวันเวลาให้ครบและเวลาปิดต้องหลังเวลาเปิด"));
      return;
    }
    setSaving(true); setErr(null);
    try {
      await api.post("/ta-request/windows", {
        id: editing?.id,
        term_id: termId,
        opens_at: localMinuteToISO(opensAt),
        closes_at: localMinuteToISO(closesAt),
        is_open: isOpen,
        note: note.trim() || null,
        notify_lecturers: notifyLecturers,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("แก้ไขช่วงเวลารับสมัคร") : t("เพิ่มช่วงเวลารับสมัคร")}
      size="md"
      icon={<CalendarDays size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={submit} disabled={!canSave || saving} isPending={saving}>
            <Save size={14} /> {t("บันทึก")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldGroup label={t("เริ่มรับสมัคร (วัน-เดือน-ปี เวลา)")}>
            <TermDateTimeField label={t("เวลาเริ่ม")} value={opensAt} onChange={setOpensAt} />
          </FieldGroup>
          <FieldGroup label={t("ปิดรับสมัคร (วัน-เดือน-ปี เวลา)")}>
            <TermDateTimeField label={t("เวลาปิด")} value={closesAt} onChange={setClosesAt} />
          </FieldGroup>
        </div>
        <FieldGroup label={t("สถานะ")} hint={t("ปิดชั่วคราวเพื่อหยุดรับคำขอโดยไม่ต้องลบช่วงเวลา")}>
          <div className="flex items-center gap-3">
            <Switch isSelected={isOpen} onChange={setIsOpen} aria-label={t("สถานะเปิดรับ")}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span>{isOpen ? t("เปิดรับคำขอ") : t("ปิดชั่วคราว")}</span>
              </Switch.Content>
            </Switch>
            {!isOpen && <PowerOff size={14} className="text-muted" />}
          </div>
        </FieldGroup>
        <FieldGroup
          label={t("แจ้งอาจารย์ทางอีเมล")}
          hint={t("ส่งเมื่อถึงเวลาเริ่มรับสมัคร และเตือนอีกครั้ง 3 วันก่อนครบกำหนดเฉพาะวิชาที่ยังไม่มีคำขอ ส่งเฉพาะอาจารย์ที่มีวิชาในภาคเรียนนี้แล้ว อาจารย์ที่ได้วิชาภายหลังจะได้รับอีเมลตามมาเอง ไม่ส่งซ้ำ")}
        >
          <Switch isSelected={notifyLecturers} onChange={setNotifyLecturers} aria-label={t("แจ้งอาจารย์ทางอีเมล")}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <span>{notifyLecturers ? t("ส่งอีเมลแจ้งอัตโนมัติ") : t("ไม่ส่งอีเมล")}</span>
            </Switch.Content>
          </Switch>
        </FieldGroup>
        <FieldGroup label={t("หมายเหตุ (ถ้ามี)")}>
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder={t("เช่น 'รอบแรก' หรือ 'ขยายเวลาให้ CS'")} />
        </FieldGroup>
        {err && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* อีเมลแจ้งเตือน: contact block at the foot of every notification e-mail     */
/* -------------------------------------------------------------------------- */

// Mirrors MailContact / MailSettings in ta_payment_back/internal/service/mail_settings.go.
interface MailSettings {
  contact_heading: string;
  contact_unit: string;
  contact_detail: string;
  updated_at?: string | null;
  updated_by_name?: string | null;
}

function MailSettingsSection() {
  const { t, fmtDate } = useI18n();
  const { data, mutate: reload } = useSWR<MailSettings>("/mail-settings");
  const [heading, setHeading] = useState("");
  const [unit, setUnit] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setHeading(data.contact_heading);
    setUnit(data.contact_unit);
    setDetail(data.contact_detail);
  }, [data]);

  const dirty = !!data && (heading !== data.contact_heading || unit !== data.contact_unit || detail !== data.contact_detail);

  // Re-render the sample e-mail as staff type, a moment after they stop, so
  // the preview is always the real template rather than a front-end copy.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.post<{ html: string }>("/mail-settings/preview", {
          contact_heading: heading, contact_unit: unit, contact_detail: detail,
        });
        setPreview(res.html);
        setPreviewErr(null);
      } catch (e) {
        setPreviewErr((e as Error).message);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data, heading, unit, detail]);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await api.put("/mail-settings", { contact_heading: heading, contact_unit: unit, contact_detail: detail });
      await reload();
      toast.success(t("บันทึกข้อมูลการติดต่อแล้ว"), { description: t("อีเมลที่ส่งหลังจากนี้จะใช้ข้อความใหม่") });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={t("ข้อมูลการติดต่อท้ายอีเมล")}
      description={t("ข้อความส่วนท้ายของอีเมลแจ้งเตือนทุกฉบับที่ระบบส่งถึงอาจารย์และผู้ช่วยสอน ใช้บอกว่าหากมีข้อสงสัยให้ติดต่อใคร")}
      actions={
        <Button variant="primary" onClick={save} disabled={!dirty || saving} isPending={saving}>
          <Save size={14} /> {t("บันทึก")}
        </Button>
      }
    >
      {!data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkelForm fields={3} />
          <div>
            <div className="text-sm font-medium mb-2">{t("ตัวอย่างอีเมล")}</div>
            <Skel className="w-full rounded-lg" style={{ height: 760 }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <FieldGroup label={t("หัวข้อ")} hint={t("ข้อความตัวหนาบรรทัดแรกของส่วนท้าย")}>
              <TextInput value={heading} onChange={e => setHeading(e.target.value)} maxLength={200} />
            </FieldGroup>
            <FieldGroup label={t("หน่วยงานที่ติดต่อ")} hint={t("เช่น ชื่องานหรือชื่อเจ้าหน้าที่ผู้รับผิดชอบ")}>
              <TextArea value={unit} onChange={e => setUnit(e.target.value)} rows={2} maxLength={300} />
            </FieldGroup>
            <FieldGroup
              label={t("รายละเอียดการติดต่อ (ถ้ามี)")}
              hint={t("พิมพ์บรรทัดละหนึ่งช่องทาง เช่น อาคารและห้อง หมายเลขโทรศัพท์ อีเมล ไม่เกิน 6 บรรทัด")}
            >
              <TextArea
                value={detail}
                onChange={e => setDetail(e.target.value)}
                rows={4}
                placeholder={t("อาคาร ... ชั้น ... ห้อง ...\nโทร 043-00-0000 ต่อ ...\nอีเมล ...@kku.ac.th")}
              />
            </FieldGroup>
            {err && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={err} />}
            {data.updated_at && (
              <div className="text-xs text-muted">
                {data.updated_by_name
                  ? t("แก้ไขล่าสุด {when} โดย {name}", { when: formatDateTime(data.updated_at, fmtDate, t), name: data.updated_by_name })
                  : t("แก้ไขล่าสุด {when}", { when: formatDateTime(data.updated_at, fmtDate, t) })}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium mb-2">{t("ตัวอย่างอีเมล")}</div>
            {previewErr ? (
              <Alert status="warning" title={t("แสดงตัวอย่างไม่ได้")} description={previewErr} />
            ) : !preview ? (
              // First render lands 400ms after the form (debounced) — hold the
              // frame's space rather than show a blank white box.
              <Skel className="w-full rounded-lg" style={{ height: 760 }} />
            ) : (
              <iframe
                title={t("ตัวอย่างอีเมล")}
                sandbox=""
                srcDoc={preview}
                className="w-full rounded-lg border border-hairline bg-white"
                style={{ height: 760 }}
              />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* ทดสอบอีเมล: is the KKU mail server reachable, and does a real send arrive   */
/* -------------------------------------------------------------------------- */

// Mirror mail.Info / mail.CheckResult / service.TestSendResult in ta_payment_back.
interface MailServerInfo {
  enabled: boolean;
  host: string;
  port: number;
  encryption: "starttls" | "ssl" | "none" | "auto";
  from: string;
  from_header: string;
  auth_user: string;
  has_password: boolean;
  legacy_ciphers: boolean;
}

const MAIL_ENCRYPTION_LABEL: Record<MailServerInfo["encryption"], string> = {
  starttls: msg("STARTTLS (เข้ารหัสหลังเชื่อมต่อ)"),
  ssl: msg("SSL (เข้ารหัสตั้งแต่เชื่อมต่อ)"),
  none: msg("ไม่เข้ารหัส"),
  auto: msg("STARTTLS เมื่อเซิร์ฟเวอร์รองรับ"),
};
interface MailCheckStep { key: string; label: string; ok: boolean; skipped?: boolean; warning?: boolean; detail?: string; ms: number }
interface MailCheckResult { ok: boolean; steps: MailCheckStep[]; advice?: string }
interface MailTestSendResult { to: string; sent: boolean; disabled?: boolean; error?: string; ms: number }

function MailServerTestSection() {
  const { t, fmtDate } = useI18n();
  const { data: info } = useSWR<MailServerInfo>("/mail-settings/server");
  const { data: me } = useSWR<Me>("/me");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<MailCheckResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<MailTestSendResult | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  // Default the recipient to the signed-in account, the safest place to send
  // a test; staff can type any other single address.
  useEffect(() => {
    if (me?.email && !to) setTo(me.email);
  }, [me, to]);

  async function runCheck() {
    setChecking(true);
    try {
      setCheck(await api.post<MailCheckResult>("/mail-settings/check"));
      setCheckedAt(new Date().toISOString());
    } catch (e) {
      toast.danger(t("ทดสอบการตั้งค่าอีเมลไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setChecking(false);
    }
  }

  async function sendTest() {
    setSending(true); setSendErr(null); setSent(null);
    try {
      setSent(await api.post<MailTestSendResult>("/mail-settings/test-send", { to: to.trim() }));
    } catch (e) {
      setSendErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title={t("เมลเซิร์ฟเวอร์ที่ใช้ส่ง")}
        description={t("ค่าที่ระบบใช้ส่งอีเมลแจ้งเตือน กำหนดในไฟล์ตั้งค่าของเซิร์ฟเวอร์ (.env) หากต้องการเปลี่ยนกรุณาแจ้งผู้ดูแลระบบ")}
      >
        {!info ? (
          <div className="py-4 text-sm text-muted">{t("กำลังโหลด…")}</div>
        ) : !info.enabled ? (
          <Alert
            status="warning"
            title={t("ยังไม่ได้ตั้งค่าเมลเซิร์ฟเวอร์")}
            description={t("ไม่ได้กำหนด SMTP_HOST ระบบจึงไม่ส่งอีเมลใด ๆ การแจ้งเตือนจะแสดงเฉพาะในระบบ")}
          />
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">{t("เซิร์ฟเวอร์")}</dt>
            <dd className="font-medium tabular break-all">{info.host}:{info.port}</dd>
            <dt className="text-muted">{t("การเข้ารหัส")}</dt>
            <dd>
              {MAIL_ENCRYPTION_LABEL[info.encryption] ? t(MAIL_ENCRYPTION_LABEL[info.encryption]) : info.encryption}
              {info.legacy_ciphers && <span className="text-muted"> {t("รองรับการเข้ารหัสรุ่นเก่า")}</span>}
            </dd>
            <dt className="text-muted">{t("ส่งในนาม")}</dt>
            <dd className="break-all">{info.from_header || info.from}</dd>
            <dt className="text-muted">{t("บัญชีเข้าสู่ระบบ")}</dt>
            <dd className="break-all">
              {info.auth_user
                ? <>{info.auth_user} {info.has_password ? <span className="text-muted">{t("(กำหนดรหัสผ่านแล้ว)")}</span> : <span className="text-danger">{t("(ยังไม่กำหนดรหัสผ่าน)")}</span>}</>
                : <span className="text-muted">{t("ไม่เข้าสู่ระบบ (อนุญาตตาม IP ของเซิร์ฟเวอร์)")}</span>}
            </dd>
          </dl>
        )}
      </Panel>

      <Panel
        title={t("ทดสอบการเชื่อมต่อ")}
        description={t("ตรวจทีละขั้นตอนว่าระบบติดต่อเมลเซิร์ฟเวอร์ได้หรือไม่ โดยไม่ส่งอีเมลจริง")}
        actions={
          <Button variant="secondary" onClick={runCheck} disabled={checking || !info?.enabled} isPending={checking}>
            <Server size={14} /> {t("ทดสอบการเชื่อมต่อ")}
          </Button>
        }
      >
        {!check ? (
          <div className="text-sm text-muted">{t("กดปุ่ม “ทดสอบการเชื่อมต่อ” เพื่อเริ่มตรวจ ใช้เวลาไม่เกิน 1 นาที")}</div>
        ) : (
          <div className="space-y-3">
            <Alert
              status={check.ok ? "success" : "danger"}
              title={check.ok ? t("เชื่อมต่อเมลเซิร์ฟเวอร์ได้") : t("เชื่อมต่อเมลเซิร์ฟเวอร์ไม่สำเร็จ")}
              description={checkedAt ? t("ทดสอบเมื่อ {when}", { when: formatDateTime(checkedAt, fmtDate, t) }) : undefined}
            />
            {check.advice && <Alert status="warning" title={t("ข้อแนะนำ")} description={check.advice} />}
            <ol className="divide-y divide-hairline rounded-lg border border-hairline">
              {check.steps.map(st => (
                <li key={st.key} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <Tip content={st.warning ? t("มีข้อควรระวัง แต่ยังส่งอีเมลได้") : st.skipped ? t("ข้ามขั้นตอนนี้") : st.ok ? t("ผ่าน") : t("ไม่ผ่าน")}>
                    <span className="inline-flex shrink-0 mt-0.5">
                      {st.warning
                        ? <CircleAlert size={18} className="text-warning" />
                        : st.skipped
                        ? <CircleMinus size={18} className="text-muted" />
                        : st.ok
                          ? <CircleCheck size={18} className="text-success" />
                          : <CircleX size={18} className="text-danger" />}
                    </span>
                  </Tip>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{st.label}</div>
                    {st.detail && <div className="text-xs text-muted mt-0.5 break-words">{st.detail}</div>}
                  </div>
                  {!st.skipped && !st.warning && st.ms > 0 && <span className="text-xs text-muted tabular shrink-0">{st.ms} ms</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Panel>

      <Panel
        title={t("ส่งอีเมลทดสอบ")}
        description={t("ส่งอีเมลตัวอย่างจริงหนึ่งฉบับด้วยรูปแบบเดียวกับอีเมลแจ้งเตือน ส่งได้ไม่เกิน 5 ฉบับใน 10 นาที และทุกครั้งจะถูกบันทึกในประวัติการใช้งาน")}
      >
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <FieldGroup label={t("ส่งถึง")} hint={t("ระบุอีเมลผู้รับหนึ่งที่อยู่")}>
              <TextInput type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="name@kku.ac.th" />
            </FieldGroup>
          </div>
          <Button variant="primary" onClick={sendTest} disabled={sending || !to.trim() || !info?.enabled} isPending={sending}>
            <Send size={14} /> {t("ส่งอีเมลทดสอบ")}
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {sendErr && <Alert status="danger" title={t("ส่งไม่สำเร็จ")} description={sendErr} />}
          {sent && (sent.sent ? (
            <Alert
              status="success"
              title={t("ส่งถึง {to} แล้ว", { to: sent.to })}
              description={t("เมลเซิร์ฟเวอร์รับอีเมลแล้ว ({ms} ms) หากไม่พบในกล่องจดหมาย กรุณาตรวจสอบโฟลเดอร์จดหมายขยะ", { ms: sent.ms })}
            />
          ) : (
            <Alert
              status={sent.disabled ? "warning" : "danger"}
              title={sent.disabled ? t("ระบบปิดการส่งอีเมลอยู่") : t("ส่งถึง {to} ไม่สำเร็จ", { to: sent.to })}
              description={sent.error}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Admin officers — executive roster used on generated official documents     */
/* -------------------------------------------------------------------------- */

interface AdminOfficer {
  id?: string;
  // The account this seat is bound to. full_name is display-only on the
  // client — the server always resolves it from user_id at save time, so
  // typing over it here would have no effect (see AdminOfficerService.Upsert).
  user_id: string;
  academic_prefix: string;
  full_name: string;
  title: string;
  is_active: boolean;
  linked_email?: string | null;
  linked_active?: boolean | null;
}

// The pool an officer's name is picked from — any non-TA account. Only the
// fields the picker needs to search and display; see /users (UserService.List).
interface LinkableUser {
  id: string;
  email: string;
  title?: string | null;
  first_name: string;
  last_name: string;
  roles: string[];
  is_active: boolean;
}

// Academic prefix is never picked here — it always tracks the linked
// account's own title (see staff/users/page.tsx's TITLE_OPTIONS), the account
// uses the abbreviated form, documents print the spelled-out form. The
// backend re-derives this the same way at save time (see
// AdminOfficerService.Upsert) — this copy only drives the live preview.
// i18n-ignore: academic prefixes are printed on official Thai documents (data).
const USER_TITLE_TO_PREFIX: Record<string, string> = {
  "อาจารย์": "อาจารย์", // i18n-ignore
  "อ. ดร.": "ดร.", // i18n-ignore
  "ดร.": "ดร.", // i18n-ignore
  "ผศ.": "ผู้ช่วยศาสตราจารย์", // i18n-ignore
  "ผศ. ดร.": "ผู้ช่วยศาสตราจารย์ ดร.", // i18n-ignore
  "รศ.": "รองศาสตราจารย์", // i18n-ignore
  "รศ. ดร.": "รองศาสตราจารย์ ดร.", // i18n-ignore
  "ศ.": "ศาสตราจารย์", // i18n-ignore
  "ศ. ดร.": "ศาสตราจารย์ ดร.", // i18n-ignore
};

/* -------------------------------------------------------------------------- */
/* หลักสูตร — sheet identity the payout documents print under                  */
/* -------------------------------------------------------------------------- */

interface Curriculum {
  code: string;
  sheet_name: string;
  full_name_th: string;
  level: "undergrad" | "graduate";
  sort_order: number;
}

function CurriculaSection() {
  const { t } = useI18n();
  const { data } = useSWR<Curriculum[]>("/curricula");
  const [editing, setEditing] = useState<Curriculum | null>(null);
  const rows = data ?? [];

  return (
    <Panel
      title={t("หลักสูตร")}
      description={t("ชื่อชีตและชื่อเต็มของแต่ละหลักสูตร ใช้พิมพ์ในเอกสารสรุปรายวิชาที่ขอใช้ TA และปะหน้าจ่ายตรง — แก้ตรงนี้เมื่อคณะเปลี่ยนชื่อหลักสูตร (เช่น IT → ITII) โดยไม่ต้องแก้โค้ด")}
    >
      {data && rows.length === 0 ? (
        <div className="text-sm text-muted py-4">{t("ยังไม่มีหลักสูตรในระบบ")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{t("รหัส")}</th>
                <th>{t("ชื่อชีต")}</th>
                <th>{t("ชื่อเต็มหลักสูตร")}</th>
                <th>{t("ระดับ")}</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {/* Header stays put; only the rows wait for /curricula. */}
              {!data && Array.from({ length: 4 }, (_, i) => (
                <tr key={`skel-${i}`} aria-hidden>
                  <td><Skel className="h-3.5 w-10" /></td>
                  <td><Skel className="h-3.5 w-16" /></td>
                  <td><Skel className="h-3.5 w-64 max-w-full" /></td>
                  <td><Skel className="h-6 w-20 rounded-full" /></td>
                  <td className="actions"><Skel className="ms-auto h-7 w-16 rounded-lg" /></td>
                </tr>
              ))}
              {rows.map(cur => (
                <tr key={cur.code}>
                  <td className="tabular text-muted">{cur.code}</td>
                  <td className="font-medium">{cur.sheet_name}</td>
                  <td>{cur.full_name_th}</td>
                  <td>
                    {cur.level === "graduate"
                      ? <Chip tone="neutral">{t("บัณฑิตศึกษา")}</Chip>
                      : <Chip tone="success">{t("ปริญญาตรี")}</Chip>}
                  </td>
                  <td className="actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(cur)}>
                      <Pencil size={13} />{t("แก้ไข")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CurriculumEditModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.success(t("บันทึกการแก้ไขหลักสูตรเรียบร้อยแล้ว"));
        }}
      />
    </Panel>
  );
}

function CurriculumEditModal({
  editing, onClose, onSaved,
}: {
  editing: Curriculum | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [sheetName, setSheetName] = useState("");
  const [fullName, setFullName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setSheetName(editing.sheet_name);
    setFullName(editing.full_name_th);
    setSortOrder(editing.sort_order);
    setError(null);
  }, [editing]);

  const sheetTrim = sheetName.trim();
  const fullTrim = fullName.trim();
  const canSave = sheetTrim !== "" && fullTrim !== "";

  async function save() {
    if (!editing || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/curricula/${editing.code}`, {
        sheet_name: sheetTrim, full_name_th: fullTrim, sort_order: sortOrder,
      });
      await mutate("/curricula");
      onSaved();
    } catch (e) {
      setError((e as Error).message || t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Pencil size={18} />
          {editing ? t("แก้ไขหลักสูตร {code}", { code: editing.code }) : ""}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={save} disabled={!canSave || saving} isPending={saving}>
            <Save size={14} />{t("บันทึกการแก้ไข")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert status="danger" title={error} />}
        <FieldGroup label={t("ชื่อชีต")} hint={t("ชื่อแท็บชีตที่พิมพ์ในเอกสาร Excel")}>
          <TextInput value={sheetName} onChange={e => setSheetName(e.target.value)} maxLength={40} autoFocus />
        </FieldGroup>
        <FieldGroup label={t("ชื่อเต็มหลักสูตร")}>
          <TextInput value={fullName} onChange={e => setFullName(e.target.value)} maxLength={200} />
        </FieldGroup>
        <FieldGroup label={t("ลำดับการพิมพ์")} hint={t("ชีตที่มีเลขน้อยกว่าจะอยู่ก่อนในเอกสาร")}>
          <TextInput
            type="number"
            value={String(sortOrder)}
            onChange={e => setSortOrder(Number(e.target.value) || 0)}
          />
        </FieldGroup>
      </div>
    </Modal>
  );
}

// ตำแหน่งฝ่ายบริหารเป็นรายการคงที่ (ดูตำแหน่งเดิมในระบบ) — หน้านี้จึงไม่มีปุ่ม
// "เพิ่ม"/"ลบ" อีกต่อไป มีแต่มอบหมาย/เปลี่ยนตัวผู้ดำรงตำแหน่งที่มีอยู่แล้ว การ
// ถือตำแหน่งที่เปิดใช้งานอยู่คือสิ่งที่ให้สิทธิ์เข้าดูแดชบอร์ดผู้บริหารด้วย
// (ดู userTitleToPrefix/rbac.RoleExecutive ฝั่ง backend) — จึงไม่มีช่องติ๊กแยก
// ที่หน้าจัดการผู้ใช้อีกแล้ว
function AdminOfficersSection() {
  const { t } = useI18n();
  const { data } = useSWR<AdminOfficer[]>("/settings/admin-officers?include_inactive=1");
  const [editing, setEditing] = useState<AdminOfficer | null>(null);
  // Turning a position OFF asks first: its holder loses the executive view and
  // drops off the signer list at once. Turning one back on stays one click.
  const [confirmOff, setConfirmOff] = useState<AdminOfficer | null>(null);
  const [toggling, setToggling] = useState(false);

  const rows = useMemo(
    () => (data ?? []).slice().sort((a, b) => a.title.localeCompare(b.title, "th")),
    [data],
  );

  async function toggleActive(o: AdminOfficer) {
    setToggling(true);
    try {
      await api.post("/settings/admin-officers", { ...o, is_active: !o.is_active });
      await mutate("/settings/admin-officers?include_inactive=1");
      toast.success(o.is_active ? t("ปิดใช้งานตำแหน่ง {title} แล้ว", { title: o.title }) : t("เปิดใช้งานตำแหน่ง {title} แล้ว", { title: o.title }));
      setConfirmOff(null);
    } catch (e) {
      toast.danger(o.is_active ? t("ปิดใช้งานตำแหน่งไม่สำเร็จ") : t("เปิดใช้งานตำแหน่งไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setToggling(false);
    }
  }

  return (
    <Panel
      title={t("ตำแหน่งฝ่ายบริหาร")}
      description={t("ตำแหน่งเป็นรายการคงที่ (คณบดี / รองคณบดี / หัวหน้าสาขา ฯลฯ) — มอบหมายอาจารย์เข้าดำรงตำแหน่งได้ที่นี่ ผู้ดำรงตำแหน่งที่เปิดใช้งานอยู่จะเห็นแดชบอร์ดผู้บริหารโดยอัตโนมัติ")}
    >
      {data && rows.length === 0 ? (
        <div className="text-sm text-muted py-4">{t("ยังไม่มีข้อมูลตำแหน่งฝ่ายบริหารในระบบ")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{t("ตำแหน่งบริหาร")}</th>
                <th>{t("ผู้ดำรงตำแหน่ง")}</th>
                <th>{t("สถานะ")}</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 4 }, (_, i) => (
                <tr key={`skel-${i}`} aria-hidden>
                  <td><Skel className="h-3.5 w-32" /></td>
                  <td><Skel className="h-3.5 w-44" /></td>
                  <td><Skel className="h-6 w-20 rounded-full" /></td>
                  <td className="actions"><Skel className="ms-auto h-7 w-24 rounded-lg" /></td>
                </tr>
              ))}
              {rows.map(o => (
                <tr key={o.id} className={!o.is_active ? "opacity-60" : ""}>
                  <td className="font-medium">{o.title}</td>
                  <td>
                    {o.academic_prefix}{o.full_name}
                    {o.linked_email && (
                      <div className="text-xs text-muted mt-0.5">{o.linked_email}</div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1 items-start">
                      {o.is_active
                        ? <Chip tone="success">{t("เปิดใช้งาน@status")}</Chip>
                        : <Chip tone="neutral">{t("ปิดใช้งาน")}</Chip>}
                      {o.linked_active === false && (
                        <Chip tone="warn">{t("บัญชีถูกปิดใช้งาน")}</Chip>
                      )}
                    </div>
                  </td>
                  <td className="actions">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(o)}>
                        <Pencil size={13} />{t("แก้ไข")}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={toggling} onClick={() => (o.is_active ? setConfirmOff(o) : toggleActive(o))}>
                        {o.is_active ? <><PowerOff size={13} />{t("ปิด@toggle")}</> : <><Power size={13} />{t("เปิด@toggle")}</>}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminOfficerFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={name => {
          setEditing(null);
          toast.success(t("มอบหมาย {name} เรียบร้อยแล้ว", { name }));
        }}
      />
      <ConfirmSaveModal
        open={confirmOff !== null}
        onClose={() => { if (!toggling) setConfirmOff(null); }}
        onConfirm={() => { if (confirmOff) toggleActive(confirmOff); }}
        saving={toggling}
        variant="danger"
        title={confirmOff ? t("ปิดใช้งานตำแหน่ง {title}?", { title: confirmOff.title }) : t("ปิดใช้งานตำแหน่ง?")}
        description={t("{name} จะเข้าหน้าผู้บริหารไม่ได้ และจะไม่อยู่ในรายชื่อผู้ลงนามของเอกสารที่สร้างหลังจากนี้ทันที เปิดใช้งานกลับได้ภายหลัง", {
          name: (confirmOff ? `${confirmOff.academic_prefix}${confirmOff.full_name}`.trim() : "") || t("ผู้ดำรงตำแหน่ง"),
        })}
        confirmLabel={t("ปิดใช้งาน")}
        confirmIcon={<PowerOff size={14} />}
      />
    </Panel>
  );
}

// Reassigns who holds one FIXED seat — there is no add/delete here any more
// (see AdminOfficersSection's comment and AdminOfficerService.Upsert, which
// now rejects a create). Only the account and the active/inactive status are
// editable; the position name itself is the seat's own fixed identity.
function AdminOfficerFormModal({
  editing, onClose, onSaved,
}: {
  editing: AdminOfficer | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { t } = useI18n();
  const open = editing !== null;
  const [draft, setDraft] = useState<AdminOfficer>({
    user_id: "", academic_prefix: "", full_name: "", title: "", is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Any non-TA account can hold a seat — dean/vice-dean are lecturers, the
  // claim-form certifier is often staff. Fetched whole (the college has ~40
  // such accounts) rather than server-searched, same tradeoff as TaAutocomplete.
  const { data: usersData } = useSWR<{ items: LinkableUser[] }>(
    open ? "/users?limit=500&status=active" : null,
  );
  const candidates = useMemo(() => {
    const list = (usersData?.items ?? []).filter(u => u.roles.some(r => r !== "ta"));
    // The currently-linked account stays pickable even if it no longer
    // qualifies (deactivated, or switched to a TA-only role since) — otherwise
    // opening this seat would show a blank picker for no visible reason.
    if (editing?.user_id && !list.some(u => u.id === editing.user_id)) {
      list.unshift({
        id: editing.user_id,
        email: editing.linked_email ?? "",
        first_name: editing.full_name,
        last_name: "",
        roles: [],
        is_active: editing.linked_active ?? true,
      });
    }
    return list;
  }, [usersData, editing]);
  const { contains } = useFilter({ sensitivity: "base" });
  const selectedUser = candidates.find(u => u.id === draft.user_id) ?? null;

  useEffect(() => {
    if (!editing) return;
    setDraft(editing);
    setError(null);
  }, [editing]);

  function pickUser(u: LinkableUser) {
    setDraft(d => ({
      ...d,
      user_id: u.id,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      // Always tracks the account — never a staff-chosen override, see the
      // note on USER_TITLE_TO_PREFIX above.
      academic_prefix: USER_TITLE_TO_PREFIX[(u.title ?? "").trim()] ?? (u.title ?? "").trim(),
    }));
  }

  const canSave = draft.user_id !== "";

  async function save() {
    if (!canSave || !editing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/settings/admin-officers", { ...draft, id: editing.id });
      await mutate("/settings/admin-officers?include_inactive=1");
      onSaved(draft.full_name);
    } catch (e) {
      setError((e as Error).message || t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Pencil size={18} />
          {editing ? t("เปลี่ยนตัวผู้ดำรงตำแหน่ง: {title}", { title: editing.title }) : ""}
        </span>
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={save} disabled={!canSave || saving} isPending={saving}>
            <Save size={14} />{t("บันทึก")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Autocomplete
            selectionMode="single"
            value={draft.user_id || null}
            onChange={(k: Key | null) => {
              const id = k ? String(k) : "";
              const u = candidates.find(x => x.id === id);
              if (u) pickUser(u);
            }}
            className="w-full"
            placeholder={t("พิมพ์ชื่อหรืออีเมลเพื่อค้นหา…")}
          >
            <Label>{t("ชื่อ-นามสกุล")}</Label>
            <Autocomplete.Trigger>
              <Autocomplete.Value>
                {({ defaultChildren, isPlaceholder }) => {
                  if (isPlaceholder || !selectedUser) return defaultChildren;
                  return (
                    <span className="truncate">
                      {selectedUser.first_name} {selectedUser.last_name}
                      {selectedUser.email && (
                        <span className="text-muted text-xs ml-1">· {selectedUser.email}</span>
                      )}
                    </span>
                  );
                }}
              </Autocomplete.Value>
              <Autocomplete.ClearButton />
              <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
              <Autocomplete.Filter filter={contains}>
                <HSearchField autoFocus name="admin-officer-user-search" variant="secondary">
                  <HSearchField.Group>
                    <HSearchField.SearchIcon />
                    <HSearchField.Input placeholder={t("ค้นหาชื่อหรืออีเมล…")} />
                    <HSearchField.ClearButton />
                  </HSearchField.Group>
                </HSearchField>
                <ListBox renderEmptyState={() => (
                  <div className="text-sm text-muted p-3 text-center">{t("ไม่พบบัญชีที่ตรงกัน")}</div>
                )}>
                  {candidates.map(u => (
                    <ListBox.Item key={u.id} id={u.id} textValue={`${u.first_name} ${u.last_name} ${u.email}`}>
                      <div className="flex flex-col min-w-0">
                        <Label>{u.first_name} {u.last_name}</Label>
                        <Description className="text-xs">{u.email}</Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Autocomplete.Filter>
            </Autocomplete.Popover>
          </Autocomplete>
          <div className="text-xs text-muted">
            {t("เลือกจากบัญชีผู้ใช้ที่มีอยู่ในระบบ — ชื่อและคำนำหน้าจะตรงกับบัญชีเสมอ")}
          </div>
        </div>

        <FieldGroup
          label={t("สถานะ")}
          hint={t("ปิดใช้งานจะไม่ถูกนำไปใช้ในเอกสารใหม่ และผู้ดำรงตำแหน่งจะไม่เห็นแดชบอร์ดผู้บริหารอีกต่อไป")}
        >
          <div className="flex items-center gap-3 pt-2">
            <Switch
              isSelected={draft.is_active}
              onChange={v => setDraft({ ...draft, is_active: v })}
              aria-label={t("สถานะเปิดใช้งาน")}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span>{draft.is_active ? t("เปิดใช้งาน@status") : t("ปิดใช้งาน")}</span>
              </Switch.Content>
            </Switch>
          </div>
        </FieldGroup>

        <div className="rounded-lg border border-border bg-accent-soft/40 p-3">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">{t("ตัวอย่างการปรากฏในเอกสาร")}</div>
          <div className="text-sm">
            <div className="font-medium">
              {(draft.academic_prefix || "") + (draft.full_name || t("— ยังไม่เลือกบัญชี —"))}
            </div>
            <div className="text-muted">{editing?.title}</div>
          </div>
        </div>

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Demo sandbox access — who may enter "โหมดทดลอง" and at what tier.          */
/* BETA-only, same as everything under internal/demo on the backend — remove  */
/* this section together with that package when the sandbox is retired.      */
/* -------------------------------------------------------------------------- */

const TIER_LABELS: Record<DemoTester["tier"], string> = {
  staff: msg("เจ้าหน้าที่ (ทุกสิทธิ์)"),
  lecturer: msg("อาจารย์ (อาจารย์ + TA)"),
  ta: msg("TA (เฉพาะสิทธิ์ TA)"),
};
const TIER_TONE: Record<DemoTester["tier"], "brand" | "success" | "neutral"> = {
  staff: "brand",
  lecturer: "success",
  ta: "neutral",
};

function DemoTestersSection() {
  const { t } = useI18n();
  const { data, error } = useSWR<{ items: DemoTester[] }>("/demo-testers", () => demoTesters());
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DemoTester | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(
    () => (data?.items ?? []).slice().sort((a, b) => a.email.localeCompare(b.email)),
    [data],
  );

  // /api/v1/demo-testers only exists when this backend was started with
  // DEMO_MODE=true (see main.go's demo.MountAdmin call) — production never
  // sets that flag, so this 404s there. Without this check the panel just
  // rendered an empty "ยังไม่มีใครมีสิทธิ์" table forever and "เพิ่มผู้มีสิทธิ์"
  // silently 404'd on submit, with nothing telling the admin why.
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Panel title={t("สิทธิ์เข้าใช้งานห้องทดลอง")}>
        <Alert
          status="default"
          title={t("เซิร์ฟเวอร์นี้ไม่ได้เปิดใช้งานโหมดทดลอง (Demo)")}
          description={t("ฟีเจอร์ \"ห้องทดลอง\" เปิดเฉพาะบางเซิร์ฟเวอร์ (เช่นสำหรับสาธิตระบบ) เซิร์ฟเวอร์นี้ไม่ได้ตั้งค่าไว้ จึงไม่มีอะไรให้จัดการในส่วนนี้")}
        />
      </Panel>
    );
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await demoRemoveTester(deleteTarget.email);
      await mutate("/demo-testers");
      toast.success(t("ยกเลิกสิทธิ์ของ {email} เรียบร้อยแล้ว", { email: deleteTarget.email }));
      setDeleteTarget(null);
    } catch (e) {
      toast.danger(t("ยกเลิกสิทธิ์ไม่สำเร็จ"), { description: errMessage(e) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title={t("สิทธิ์เข้าใช้งานห้องทดลอง")}
      description={t("กำหนดว่าอีเมลไหนเข้า \"โหมดทดลอง\" ได้บ้าง และเห็นบทบาทไหนบ้าง — เจ้าหน้าที่เห็นทุกบทบาท อาจารย์เห็นเฉพาะบทบาทอาจารย์และ TA ส่วน TA เห็นเฉพาะบทบาท TA ของตัวเอง อีเมลที่ไม่อยู่ในรายการนี้เข้าห้องทดลองไม่ได้เลย")}
      actions={
        <Button variant="primary" onClick={() => setFormOpen(true)}>
          <Plus size={14} />{t("เพิ่มผู้มีสิทธิ์")}
        </Button>
      }
    >
      {(data || error) && rows.length === 0 ? (
        <div className="text-sm text-muted py-4">
          {t("ยังไม่มีใครมีสิทธิ์เข้าห้องทดลอง กด \"เพิ่มผู้มีสิทธิ์\" เพื่อเริ่ม")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{t("อีเมล")}</th>
                <th>{t("ระดับสิทธิ์")}</th>
                <th>{t("หมายเหตุ")}</th>
                <th>{t("เพิ่มโดย")}</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {!data && !error && Array.from({ length: 3 }, (_, i) => (
                <tr key={`skel-${i}`} aria-hidden>
                  <td><Skel className="h-3.5 w-48" /></td>
                  <td><Skel className="h-6 w-28 rounded-full" /></td>
                  <td><Skel className="h-3.5 w-24" /></td>
                  <td><Skel className="h-3.5 w-24" /></td>
                  <td className="actions"><Skel className="ms-auto h-7 w-20 rounded-lg" /></td>
                </tr>
              ))}
              {rows.map(tester => (
                <tr key={tester.email}>
                  <td className="font-medium">{tester.email}</td>
                  <td><Chip tone={TIER_TONE[tester.tier]}>{t(TIER_LABELS[tester.tier])}</Chip></td>
                  <td className="text-muted text-sm">{tester.note || <span className="text-muted">—</span>}</td>
                  <td className="text-muted text-sm">{tester.added_by}</td>
                  <td className="actions">
                    <Button variant="danger-soft" size="sm" onClick={() => setDeleteTarget(tester)}>
                      <Trash2 size={13} />{t("ยกเลิกสิทธิ์")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DemoTesterFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={email => {
          setFormOpen(false);
          toast.success(t("ให้สิทธิ์ {email} เรียบร้อยแล้ว", { email }));
        }}
      />

      <ConfirmSaveModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        saving={deleting}
        title={t("ยืนยันยกเลิกสิทธิ์เข้าห้องทดลอง?")}
        description={
          deleteTarget
            ? t("ยกเลิกสิทธิ์ของ \"{email}\" — คำขอเข้าห้องทดลองครั้งถัดไปของอีเมลนี้จะถูกปฏิเสธ และหากกำลังทดลองอยู่ ระบบจะบล็อกการเข้าสู่ระบบครั้งถัดไปทันที", { email: deleteTarget.email })
            : ""
        }
        variant="danger"
      />
    </Panel>
  );
}

function DemoTesterFormModal({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (email: string) => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<DemoTester["tier"]>("ta");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setTier("ta");
    setNote("");
    setError(null);
  }, [open]);

  const emailTrim = email.trim();
  const emailError = emailTrim === "" ? null
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim) ? t("รูปแบบอีเมลไม่ถูกต้อง") : null;
  const canSave = emailTrim !== "" && !emailError;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await demoAddTester(emailTrim, tier, note.trim());
      await mutate("/demo-testers");
      onSaved(emailTrim);
    } catch (e) {
      setError((e as Error).message || t("บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Plus size={18} />{t("เพิ่มผู้มีสิทธิ์เข้าห้องทดลอง")}
        </span>
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={save} disabled={!canSave || saving} isPending={saving}>
            <Plus size={14} />{t("ให้สิทธิ์")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGroup label={t("อีเมลผู้ทดสอบ")} hint={t("อีเมลจริงของอาจารย์/TA/เจ้าหน้าที่ที่จะทดลองใช้งาน")} error={emailError ?? undefined}>
          <TextInput
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@kkumail.com"
            autoFocus
          />
        </FieldGroup>

        <FieldGroup
          label={t("ระดับสิทธิ์")}
          hint={t("กำหนดว่าจะเลือกทดลองบทบาทไหนได้บ้างในห้องทดลอง")}
        >
          <Select value={tier} onChange={e => setTier(e.target.value as DemoTester["tier"])}>
            <option value="ta">{t(TIER_LABELS.ta)}</option>
            <option value="lecturer">{t(TIER_LABELS.lecturer)}</option>
            <option value="staff">{t(TIER_LABELS.staff)}</option>
          </Select>
        </FieldGroup>

        <FieldGroup label={t("หมายเหตุ (ถ้ามี)")} hint={t("เช่น ชื่อ-นามสกุล หรือเหตุผลที่ให้สิทธิ์")}>
          <TextInput
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t("เช่น อาจารย์สมชาย ภาควิชา...")}
            maxLength={200}
          />
        </FieldGroup>

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกไม่สำเร็จ")} description={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Submission periods — monthly reimbursement window per term                 */
/* -------------------------------------------------------------------------- */

interface SubmissionPeriod {
  id: string;
  term_id: string;
  year_month: string;
  starts_on: string;
  due_date: string;
  label: string;
  remind_days_before: number;
  is_closed: boolean;
}

function SubmissionPeriodsSection() {
  const { t, fmtDate } = useI18n();
  // Follows the shell's term switcher, like every other term-scoped staff view.
  const { term, termId, loaded: termsLoaded } = useTerm();
  const { data: periods, mutate: refresh } = useSWR<SubmissionPeriod[]>(
    useTermKey("/submission-periods"),
    { keepPreviousData: true },
  );

  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editing, setEditing] = useState<SubmissionPeriod | null>(null);
  const [seedConfirm, setSeedConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubmissionPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedTerm = term;
  const seedSemester = selectedTerm?.semester ?? 1;
  const seedMonthsLabel = seedSemester === 1 ? t("มิ.ย.–ต.ค.") : t("พ.ย.–มี.ค.");
  const existingMonths = new Set((periods ?? []).map(p => p.year_month));
  const seedTemplateMonths =
    seedSemester === 1 ? [6, 7, 8, 9, 10] : [11, 12, 1, 2, 3];
  const seedYearBase = selectedTerm?.academic_year ?? 0;
  const seedWillCreate = seedTemplateMonths.filter(m => {
    // year_month is keyed by the ACADEMIC year for every month, ม.ค.–มี.ค.
    // of ภาคปลาย included (BulkCreateForTerm) — not the calendar year.
    const ym = `${seedYearBase}-${String(m).padStart(2, "0")}`;
    return !existingMonths.has(ym);
  }).length;

  async function bulkSeed() {
    if (!termId) return;
    setSeeding(true);
    try {
      await api.post(`/submission-periods/bulk-for-term/${termId}`, {});
      await refresh();
      toast.success(t("สร้างระยะเวลารายเดือนเรียบร้อย"));
      setSeedConfirm(false);
    } catch (e) {
      toast.danger(t("สร้างระยะเวลารายเดือนไม่สำเร็จ"), { description: errMessage(e) });
    } finally { setSeeding(false); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/submission-periods/${deleteTarget.id}`);
      await refresh();
      toast.success(t("ลบรอบ \"{label}\" เรียบร้อยแล้ว", { label: deleteTarget.label }));
      setDeleteTarget(null);
    } catch (e) {
      toast.danger(t("ลบรอบเบิกจ่ายไม่สำเร็จ"), { description: errMessage(e) });
    } finally { setDeleting(false); }
  }

  return (
    <Panel
      title={t("ระยะเวลาเบิกจ่ายรายเดือน")}
      description={t("รอบเบิกจ่ายต่อเดือน (ประกาศ 2569: มิ.ย.–ต.ค.) ระบบส่ง reminder ผ่าน email/in-app ให้ TA อัตโนมัติก่อนวันครบกำหนด")}
      actions={
        <>
          <Button variant="secondary" onClick={() => setSeedConfirm(true)} disabled={!termId || seeding}>
            <Plus size={14} />{t("สร้างอัตโนมัติ 5 เดือน")}
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!termId}>
            <Plus size={14} />{t("เพิ่มเดือน")}
          </Button>
        </>
      }
    >
      {termsLoaded && !termId ? (
        <div className="text-sm text-muted py-4">{t("ยังไม่มีภาคเรียนในระบบ สร้างที่แท็บ \"ภาคเรียน\" ก่อน")}</div>
      ) : !periods ? (
        <SkelRows rows={5} columns={6} />
      ) : periods.length === 0 ? (
        <Alert
          status="warning"
          title={t("ยังไม่มีรอบเบิกจ่ายของภาคเรียน {term}", { term: `${selectedTerm?.academic_year ?? ""}/${selectedTerm?.semester ?? ""}` })}
          description={t("TA จะลงเวลาและส่งอนุมัติไม่ได้ และวิชาจะไม่ขึ้นในหน้าตรวจและส่งออกเอกสาร จนกว่าจะสร้างรอบ กด “สร้างอัตโนมัติ 5 เดือน” เพื่อสร้างตามวันเปิดและปิดภาค")}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-ink-2">
              <tr>
                <th className="text-left px-3 py-2">{t("ป้ายกำกับ")}</th>
                <th className="text-left px-3 py-2">{t("รหัสเดือน")}</th>
                <th className="text-left px-3 py-2">{t("ช่วงเวลา (เปิด → ปิด)")}</th>
                <th className="text-left px-3 py-2">{t("แจ้งเตือน (วัน)")}</th>
                <th className="text-left px-3 py-2">{t("สถานะ")}</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id} className="border-t border-hairline">
                  <td className="px-3 py-2">{p.label}</td>
                  <td className="px-3 py-2 tabular">{p.year_month}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">
                    {fmtDate(p.starts_on)} → {fmtDate(p.due_date)}
                  </td>
                  <td className="px-3 py-2 tabular">{p.remind_days_before}</td>
                  <td className="px-3 py-2">
                    <Chip tone={p.is_closed ? "neutral" : "brand"}>
                      {p.is_closed ? t("ปิดแล้ว") : t("เปิดรับ")}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <IconButton label={t("แก้ไข")} variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil size={12} />
                    </IconButton>
                    <IconButton label={t("ลบ")} variant="ghost" size="sm" onClick={() => setDeleteTarget(p)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <SubmissionPeriodModal
          termId={termId}
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { await refresh(); setCreating(false); setEditing(null); }}
        />
      )}

      <Modal
        open={seedConfirm}
        onClose={() => !seeding && setSeedConfirm(false)}
        title={t("สร้างระยะเวลาเบิกจ่ายอัตโนมัติ")}
        icon={<CalendarPlus size={20} />}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSeedConfirm(false)} disabled={seeding}>
              {t("ยกเลิก")}
            </Button>
            <Button variant="primary" onClick={bulkSeed} isPending={seeding} disabled={seedWillCreate === 0}>
              <Plus size={14} />
              {seedWillCreate === 0
                ? t("ไม่มีเดือนใหม่ให้สร้าง")
                : t("สร้าง {n} เดือน", { n: seedWillCreate })}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            {t.rich("ระบบจะสร้างรอบเบิกจ่ายรายเดือนตามเทมเพลตของภาคเรียน {term} โดยอัตโนมัติ", {
              term: <b>{selectedTerm ? termLabel(selectedTerm, t) : ""}</b>,
            })}
          </p>
          <ul className="rounded-md border border-hairline bg-slate-50 px-3 py-2 space-y-1 text-xs">
            <li>{t.rich("· ครอบคลุมเดือน {months} (5 รอบ)", { months: <b>{seedMonthsLabel}</b> })}</li>
            <li>{t("· วันเปิดรอบ = วันที่ 1 ของแต่ละเดือน")}</li>
            <li>{t("· กำหนดส่งตามประกาศ 2569 (3 เดือนแรกครบ 31 ก.ค. · ที่เหลือ +5 วัน)")}</li>
            <li>{t("· ส่ง reminder ให้ TA ล่วงหน้า 3 วันก่อนครบกำหนด")}</li>
          </ul>
          {seedWillCreate < seedTemplateMonths.length && (
            <Alert
              status="warning"
              icon={<CircleAlert size={14} />}
              title={
                seedWillCreate === 0
                  ? t("มีรอบครบทุกเดือนแล้ว")
                  : t("จะข้าม {n} เดือนที่มีอยู่แล้ว", { n: seedTemplateMonths.length - seedWillCreate })
              }
              description={t("ระบบจะไม่ทับรอบเดิม เดือนที่มีอยู่แล้วต้องแก้จากปุ่ม “แก้ไข” ในตารางแทน")}
            />
          )}
        </div>
      </Modal>

      <ConfirmSaveModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        saving={deleting}
        variant="danger"
        confirmLabel={t("ลบรอบนี้")}
        confirmIcon={<Trash2 size={14} />}
        title={deleteTarget ? t("ลบรอบ \"{label}\"?", { label: deleteTarget.label }) : t("ลบรอบเบิกจ่าย?")}
        description={t("สถานะการเซ็น/ลงนามของ TA และอาจารย์ที่ผูกอยู่กับรอบนี้จะถูกลบทั้งหมด หากมี TA เซ็นไปแล้ว จะไม่สามารถกู้กลับได้")}
      />
    </Panel>
  );
}

function SubmissionPeriodModal({
  termId, initial, onClose, onSaved,
}: {
  termId: string;
  initial: SubmissionPeriod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<SubmissionPeriod>(
    initial ?? {
      id: "",
      term_id: termId,
      year_month: "",
      starts_on: "",
      due_date: "",
      label: "",
      remind_days_before: 3,
      is_closed: false,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await api.post("/submission-periods", { ...draft, term_id: termId });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? t("แก้ไขรอบเบิกจ่าย") : t("เพิ่มรอบเบิกจ่าย")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={save} isPending={saving} disabled={saving}>
            <Save size={14} />{t("บันทึก")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGroup label={t("ป้ายกำกับ (แสดงบน UI)")}>
          <TextInput value={draft.label}
                     placeholder={t("เช่น มิถุนายน 2569")}
                     onChange={e => setDraft({ ...draft, label: e.target.value })} />
        </FieldGroup>
        <FieldGroup label={t("รหัสเดือน (year-month)")}>
          <TextInput value={draft.year_month}
                     placeholder="2569-06"
                     onChange={e => setDraft({ ...draft, year_month: e.target.value })} />
        </FieldGroup>
        <FieldGroup label={t("วันเปิดรอบ (TA เริ่มเซ็นได้)")}>
          <TermDateField label={t("วันเปิดรอบ")}
                         value={draft.starts_on}
                         onChange={v => setDraft({ ...draft, starts_on: v })} />
        </FieldGroup>
        <FieldGroup label={t("กำหนดส่ง (วันสุดท้ายที่เซ็นได้)")}>
          <TermDateField label={t("กำหนดส่ง")}
                         value={draft.due_date}
                         onChange={v => setDraft({ ...draft, due_date: v })} />
        </FieldGroup>
        <FieldGroup label={t("แจ้งเตือนล่วงหน้า (วัน)")}>
          <TextInput type="number" min={0} value={draft.remind_days_before}
                     onChange={e => setDraft({ ...draft, remind_days_before: Number(e.target.value) })} />
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.is_closed}
                 onChange={e => setDraft({ ...draft, is_closed: e.target.checked })} />
          {t("ปิดรับแล้ว (ไม่ส่ง reminder อีก)")}
        </label>
        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title={t("บันทึกรอบเบิกจ่ายไม่สำเร็จ")} description={error} />
        )}
      </div>
    </Modal>
  );
}
