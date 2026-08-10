"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  AlertTriangle, CalendarDays, Check, Download, FileSignature,
  FileText, Hash, PenLine, Users,
} from "lucide-react";
import { api, errMessage } from "../../lib/api";
import { useTerm } from "../TermContext";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, Select, Chip, DatePicker, EmptyState,
} from "../../components/ui";

/**
 * ใบแต่งตั้งทีเอ (คำสั่ง) — its own section since 31/07/2026.
 *
 * It used to be a tab inside the export screen, which read as though printing an
 * order were one of the ways to export a payout package. It is not: it happens
 * once per round near the start of a term, it produces a signed paper order
 * rather than a reimbursement package, and it is the GATE the payout screen
 * waits on. Filing it under the monthly errand hid a term-level act inside a
 * per-month one, and made the export menu answer to two unrelated jobs.
 *
 * สรุปรายวิชาที่ขอใช้ TA / ปะหน้าจ่ายตรง / รหัสคู่ briefly lived here too
 * (09/08/2026 – 10/08/2026) but moved out to their own "สรุปงบและปะหน้าจ่ายตรง"
 * page: those three are budget/payout documents, not appointment orders, and
 * staff wanted an on-screen summary table for them that has no equivalent
 * here — see app/staff/budget-summary/page.tsx.
 *
 * Layout (06/08/2026): the round's headcount leads the page, the form and the
 * history sit side by side below it. Everything used to be stacked in one
 * narrow column, so the number staff came for was a grey footnote and the four
 * fields they fill read as an afterthought.
 */

export default function AppointmentsPage() {
  const { termId } = useTerm();
  return (
    <div>
      <PageHeader
        title="ใบแต่งตั้งทีเอ"
        description="ออกคำสั่งแต่งตั้งทีเอตามรอบที่ยื่นขอ พร้อมประวัติการออกคำสั่งและปุ่มดาวน์โหลดฉบับเดิม"
      />
      {termId && <AppointmentSection termId={termId} />}
    </div>
  );
}

interface AdminOfficer {
  id: string;
  academic_prefix?: string;
  full_name: string;
  title: string;
  is_active: boolean;
  // Derived server-side from `title`. Never re-derive it here: the printed
  // document decides from the same field, and two copies of the rule would
  // eventually disagree about who signed with what authority.
  is_dean: boolean;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
// Preview how the backend will render an ISO date in Thai government style
// (day + Thai month + Buddhist-era year). withEra adds "พ.ศ.".
function thaiDatePreview(iso: string, withEra: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const [, y, mo, d] = m;
  const month = THAI_MONTHS[Number(mo) - 1];
  const beYear = Number(y) + 543;
  return `${Number(d)} ${month} ${withEra ? "พ.ศ. " : ""}${beYear}`;
}

/** Membership of the next คำสั่งแต่งตั้ง round, from the preview endpoint. */
interface AppointmentPreview {
  next_round: number;
  is_late: boolean;
  already_issued: number;
  include: {
    teaching_course_id: string;
    course_code: string;
    course_name_th: string;
    ta_id: string;
    ta_name: string;
  }[];
  skipped: { course_code: string; course_name_th: string; reason: string; pending_tas?: string[] }[];
}

interface AppointmentRound {
  id: string;
  round_no: number;
  order_no: string;
  order_date: string;
  ta_count: number;
  generated_at: string;
  generated_by?: string;
  is_late: boolean;
  // False for orders issued before the server started keeping a copy of the
  // rendered document. Those can never be re-issued, so the button is absent
  // rather than present-and-failing.
  can_reprint: boolean;
}

/** Field wrapper — one label style for every control on this form. */
function Field({
  label, icon, hint, children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {icon}{label}
      </label>
      {children}
      {/* Fixed height so a preview appearing under one field cannot shove its
          neighbour down and make the grid jump while typing. */}
      <div className="mt-1 h-4 text-xs text-brand">{hint}</div>
    </div>
  );
}

function AppointmentSection({ termId }: { termId: string }) {
  const { data: officers } = useSWR<AdminOfficer[]>("/settings/admin-officers");
  // Who this round would appoint, and what it leaves behind. Printing is a
  // paper act that cannot be recalled, so staff see it before committing.
  const previewKey = termId ? `/exports/appointment-order/preview?term_id=${termId}` : null;
  const { data: preview } = useSWR<AppointmentPreview>(previewKey);
  const roundsKey = termId ? `/exports/appointment-order/rounds?term_id=${termId}` : null;
  const { data: rounds } = useSWR<{ items: AppointmentRound[] }>(roundsKey);
  // Order number is "N/YYYY" — two fields joined by "/".
  const [orderNoNum, setOrderNoNum] = useState("");
  const [orderNoYear, setOrderNoYear] = useState("");
  const [orderDate, setOrderDate] = useState("");       // ISO YYYY-MM-DD
  const [effectiveDate, setEffectiveDate] = useState(""); // ISO YYYY-MM-DD
  const [signerId, setSignerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [reprinting, setReprinting] = useState<string | null>(null);

  const deans = (officers ?? []).filter(o => o.is_active);
  const orderNo = `${orderNoNum.trim()}/${orderNoYear.trim()}`;
  // A คำสั่ง is issued under the dean's authority. When a deputy signs it, the
  // document prints the acting form — so the screen has to say so BEFORE the
  // paper is generated, not after someone notices on the printout.
  const signer = deans.find(o => o.id === signerId);
  const acting = signer && !signer.is_dean;
  const deanSeat = deans.find(o => o.is_dean)?.title ?? "คณบดีวิทยาลัยการคอมพิวเตอร์";

  const pending = preview?.include.length ?? 0;

  // Names grouped by course: the printed บัญชีแนบท้าย is laid out that way, so
  // checking the screen against the paper is a straight read rather than a
  // mental regroup.
  const byCourse = useMemo(() => {
    const m = new Map<string, { code: string; name: string; tas: string[] }>();
    for (const p of preview?.include ?? []) {
      const g = m.get(p.course_code) ?? { code: p.course_code, name: p.course_name_th, tas: [] };
      g.tas.push(p.ta_name);
      m.set(p.course_code, g);
    }
    return [...m.values()];
  }, [preview]);

  // What is still missing, named — a disabled button with no reason is a dead
  // end, and the toast that used to say it only appeared after a click.
  const missing = [
    !orderNoNum.trim() || !orderNoYear.trim() ? "เลขที่คำสั่ง" : null,
    !signerId ? "ผู้ลงนาม" : null,
    !orderDate ? "วันที่สั่ง" : null,
    !effectiveDate ? "วันที่มีผล" : null,
  ].filter(Boolean) as string[];
  const canGenerate = missing.length === 0 && pending > 0 && !busy;

  /**
   * Fetch an already-issued order again.
   *
   * Deliberately does NOT revalidate the preview or the round list afterwards:
   * nothing changed. A copy that quietly refreshed the screen would suggest it
   * had done something, and the one thing staff must be sure of here is that
   * asking for the paper again cannot alter who is appointed.
   */
  async function reprint(r: AppointmentRound) {
    setReprinting(r.id);
    try {
      const blob: Blob = await api.get(`/exports/appointment-order/rounds/${r.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appointment-order-${r.order_no.replace("/", "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success(`ดาวน์โหลดคำสั่งที่ ${r.order_no} (ฉบับเดิม) แล้ว`);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setReprinting(null);
    }
  }

  async function generate() {
    if (!canGenerate) return;
    setBusy(true);
    try {
      const blob: Blob = await api.post("/exports/appointment-order", {
        term_id: termId,
        order_no: orderNo,
        order_date: orderDate,
        effective_date: effectiveDate,
        signer_officer_id: signerId,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appointment-order-${orderNoNum.trim()}-${orderNoYear.trim()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("สร้างไฟล์คำสั่งแล้ว");
      // The round is now on the ledger — refresh so the next preview shows the
      // reduced membership rather than offering the same names again.
      if (previewKey) void mutate(previewKey);
      if (roundsKey) void mutate(roundsKey);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Round headline ─────────────────────────────────────────────── */}
      <div
        data-tour="appt-round"
        className="overflow-hidden rounded-xl border border-border bg-panel-bg shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-4 border-b border-hairline bg-brand-soft/50 px-5 py-4">
          <div
            className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold tabular-nums shadow-sm ${
              pending > 0 ? "bg-brand text-brand-fg" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {pending > 0 ? pending : <Check size={30} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-ink-1">
              {pending > 0 ? `ทีเอ ${pending} คน รอออกคำสั่งแต่งตั้ง` : "ออกคำสั่งครบทุกคนแล้ว"}
            </div>
            {/* No "·" separators: they wrap onto the next line on a phone and
                sit there as a stray dot. Spacing alone does the job. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
              {preview && (
                <>
                  <span>คำสั่งรอบที่ {preview.next_round}</span>
                  {preview.is_late
                    ? <Chip tone="warn">รอบล่าช้า</Chip>
                    : <Chip tone="success">รอบแรก (ทันกำหนด)</Chip>}
                  {preview.already_issued > 0 && (
                    <span>ออกคำสั่งไปแล้ว {preview.already_issued} คน</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* The names themselves, grouped as they will print. Shown outright —
            hiding a one-line list behind a toggle costs a click and tells the
            reader nothing about how long the list is. */}
        {pending > 0 && (
          <div className="max-h-64 overflow-y-auto px-5 py-3">
            <ul className="space-y-2">
              {byCourse.map(c => (
                <li key={c.code} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold text-ink-1">{c.code}</span>
                  <span className="min-w-0 truncate text-ink-3">{c.name}</span>
                  <span className="ms-auto flex flex-wrap justify-end gap-1">
                    {c.tas.map(t => (
                      <span key={t} className="chip chip-brand !text-[11px]">{t}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pending === 0 && (
          <div className="px-5 py-3 text-sm text-ink-3">
            ทีเอที่อนุมัติแล้วได้รับคำสั่งแต่งตั้งครบทุกคน เมื่ออนุมัติคำขอใหม่ รายชื่อจะมาแสดงที่นี่
          </div>
        )}
      </div>

      {/* ── Courses held back ──────────────────────────────────────────── */}
      {!!preview?.skipped.length && (
        <Panel
          title={
            <span className="inline-flex items-center gap-2 text-amber-900">
              <AlertTriangle size={16} className="text-amber-600" />
              ยังไม่พร้อมออกคำสั่ง {preview.skipped.length} วิชา
            </span>
          }
          description="วิชาเหล่านี้จะไม่อยู่ในคำสั่งรอบนี้ เมื่อเรียบร้อยแล้วให้กลับมาออกคำสั่งรอบถัดไป (จะนับเป็นรอบล่าช้า)"
          className="border-amber-200 bg-amber-50/40"
        >
          <ul className="divide-y divide-amber-200/60">
            {preview.skipped.map(s => (
              <li key={s.course_code} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-semibold text-ink-1">{s.course_code}</span>
                <span className="text-ink-3">{s.course_name_th}</span>
                <span className="ms-auto text-xs text-amber-800">
                  {s.reason}
                  {s.pending_tas?.length ? ` (${s.pending_tas.join(", ")})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Form + history ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="ข้อมูลคำสั่ง"
          description="ระบบจัดกลุ่มรายชื่อตามระดับการศึกษาและรายวิชา (บัญชีแนบท้าย) ตามรูปแบบคำสั่งของวิทยาลัย"
          className="lg:col-span-2"
          data-tour="appt-form"
        >
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Field label="คำสั่งที่ (เลขที่คำสั่ง)" icon={<Hash size={13} className="text-ink-4" />}>
              <div className="flex h-9 items-center rounded-lg border border-border bg-surface px-2 transition-colors focus-within:border-brand">
                <input
                  value={orderNoNum}
                  onChange={e => setOrderNoNum(e.target.value.replace(/\D/g, ""))}
                  placeholder="6"
                  inputMode="numeric"
                  aria-label="เลขที่คำสั่ง"
                  className="w-14 bg-transparent text-center text-sm outline-none"
                />
                <span className="px-1 text-ink-3">/</span>
                <input
                  value={orderNoYear}
                  onChange={e => setOrderNoYear(e.target.value.replace(/\D/g, ""))}
                  placeholder="2569"
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="ปี พ.ศ. ของคำสั่ง"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </Field>

            <Field label="ผู้ลงนาม (คณบดี หรือผู้รักษาการแทน)" icon={<PenLine size={13} className="text-ink-4" />}>
              <Select
                value={signerId}
                onChange={e => setSignerId(e.target.value)}
                className="w-full"
                disabled={deans.length === 0}
              >
                <option value="">เลือกผู้ลงนาม</option>
                {deans.map(o => (
                  <option key={o.id} value={o.id}>
                    {(o.academic_prefix ?? "")}{o.full_name} · {o.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="วันที่สั่ง"
              icon={<CalendarDays size={13} className="text-ink-4" />}
              hint={orderDate && thaiDatePreview(orderDate, true)}
            >
              <DatePicker value={orderDate} onChange={setOrderDate} label="วันที่สั่ง" className="w-full" />
            </Field>

            <Field
              label="มีผลตั้งแต่วันที่"
              icon={<CalendarDays size={13} className="text-ink-4" />}
              hint={effectiveDate && thaiDatePreview(effectiveDate, false)}
            >
              <DatePicker value={effectiveDate} onChange={setEffectiveDate} label="มีผลตั้งแต่วันที่" className="w-full" />
            </Field>
          </div>

          {/* Show the signature block as it will print, not just a warning about
              it. "รักษาการแทน" is a claim about authority, so staff should be
              able to check the exact three lines against the seat they think is
              vacant before committing them to paper. */}
          {acting && (
            <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                <AlertTriangle size={13} /> ผู้ลงนามไม่ใช่คณบดี จะพิมพ์เป็น “รักษาการแทน”
              </div>
              <div className="mt-1 text-center text-xs leading-relaxed text-amber-900/90">
                <div>({signer!.academic_prefix ?? ""}{signer!.full_name})</div>
                <div>{signer!.title} รักษาการแทน</div>
                <div>{deanSeat}</div>
              </div>
            </div>
          )}

          {/* Without a roster the form fills in fine and only fails at submit
              with "ไม่พบข้อมูลผู้ลงนาม", which reads as a bug rather than as
              missing setup. Say it here, with the way out. */}
          {officers && deans.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              ยังไม่มีรายชื่อผู้ลงนามในระบบ เพิ่มได้ที่{" "}
              <a href="/staff/settings" className="underline underline-offset-2">
                ตั้งค่า › ผู้บริหารที่ลงนาม
              </a>
            </p>
          )}

          <div
            data-tour="appt-generate"
            className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4"
          >
            <span className="me-auto text-xs text-ink-3">
              {pending === 0
                ? "ไม่มีรายชื่อค้าง จึงยังไม่ต้องออกคำสั่งรอบใหม่"
                : missing.length > 0
                  ? `กรอกให้ครบก่อน: ${missing.join(" · ")}`
                  : `จะได้ไฟล์ Word 1 ไฟล์ สำหรับทีเอ ${pending} คน`}
            </span>
            <Button variant="primary" onClick={generate} disabled={!canGenerate}>
              <FileSignature size={14} /> {busy ? "กำลังสร้าง…" : "สร้างไฟล์คำสั่ง (.docx)"}
            </Button>
          </div>
        </Panel>

        <Panel
          title="ประวัติการออกคำสั่ง"
          description={rounds?.items?.length ? `ออกไปแล้ว ${rounds.items.length} รอบ` : undefined}
          data-tour="appt-history"
          padded={!rounds?.items?.length}
        >
          {!rounds?.items?.length ? (
            <EmptyState
              icon={<FileText size={26} />}
              title="ยังไม่เคยออกคำสั่ง"
              description="คำสั่งที่ออกแล้วจะมาแสดงที่นี่ พร้อมปุ่มดาวน์โหลดฉบับเดิม"
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {rounds.items.map(r => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Chip tone={r.is_late ? "warn" : "neutral"}>รอบ {r.round_no}</Chip>
                    <span className="text-sm font-medium text-ink-1">คำสั่งที่ {r.order_no}</span>
                    <span className="ms-auto inline-flex items-center gap-1 text-xs text-ink-3">
                      <Users size={12} />{r.ta_count}
                    </span>
                  </div>
                  {/* order_date is stored as the ISO the picker produced; the
                      printed document converts it, so the history must too —
                      2026 next to a 2569 order number invites a double-take. */}
                  <div className="mt-1 text-xs text-ink-3">
                    {thaiDatePreview(r.order_date, false) || r.order_date}
                    {r.generated_by && ` · โดย ${r.generated_by}`}
                  </div>
                  <div className="mt-1.5">
                    {r.can_reprint ? (
                      <button
                        type="button"
                        onClick={() => void reprint(r)}
                        disabled={reprinting !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                      >
                        <Download size={12} />
                        {reprinting === r.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลดฉบับเดิม"}
                      </button>
                    ) : (
                      // Not a disabled button: nothing the user can do will ever
                      // enable it, and a greyed control invites them to try.
                      <span className="text-xs text-ink-4">ออกก่อนระบบเก็บสำเนา ดาวน์โหลดซ้ำไม่ได้</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
