"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AlertTriangle, FileSignature } from "lucide-react";
import { api, errMessage } from "../../lib/api";
import { useTerm } from "../TermContext";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, Select, Chip, TextInput, DatePicker } from "../../components/ui";

/**
 * ใบแต่งตั้งทีเอ (คำสั่ง) — its own menu since 31/07/2026.
 *
 * It used to be a tab inside the export screen, which read as though printing an
 * order were one of the ways to export a payout package. It is not: it happens
 * once per round near the start of a term, it produces a signed paper order
 * rather than a reimbursement package, and it is the GATE the payout screen
 * waits on. Filing it under the monthly errand hid a term-level act inside a
 * per-month one, and made the export menu answer to two unrelated jobs.
 */

export default function AppointmentsPage() {
  const { termId } = useTerm();
  return (
    <div>
      <PageHeader
        title="ใบแต่งตั้งทีเอ (คำสั่ง)"
        description="ออกคำสั่งแต่งตั้งทีเอเป็นรอบ — ทีเอที่ยังไม่มีคำสั่ง จะยังตรวจเบิกจ่ายและส่งออกเอกสารไม่ได้"
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
  include: { teaching_course_id: string; course_code: string; ta_id: string; ta_name: string }[];
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

  const deans = (officers ?? []).filter(o => o.is_active);
  const orderNo = `${orderNoNum.trim()}/${orderNoYear.trim()}`;

  async function generate() {
    if (!orderNoNum.trim() || !orderNoYear.trim() || !orderDate || !effectiveDate || !signerId) {
      notify.error("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
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
      a.download = `appointment-order-${orderNoNum.trim()}-${orderNoYear.trim()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("สร้างเอกสารสำเร็จ");
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
    <Panel className="mb-3">
      <div className="max-w-2xl space-y-3">
        <p className="text-sm text-ink-3">
          กรอกข้อมูลของคำสั่งแต่งตั้งทีเอ ระบบจะดึงรายชื่อทีเอที่ได้รับอนุมัติและ<b>ยังไม่เคยออกคำสั่ง</b>
          จัดกลุ่มตามระดับการศึกษาและรายวิชา (บัญชีแนบท้าย) ตามรูปแบบคำสั่งของวิทยาลัย และสร้างเป็น PDF + DOCX ให้
        </p>

        {/* Round membership. Named before printing, because paper cannot be
            recalled and a course left out has to be chased, not discovered. */}
        {preview && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                รอบที่ {preview.next_round}
              </span>
              {preview.is_late
                ? <Chip tone="warn">รอบล่าช้า</Chip>
                : <Chip tone="success">รอบแรก (ทันกำหนด)</Chip>}
              <span className="text-xs text-ink-3">
                จะออกคำสั่งให้ {preview.include.length} รายชื่อ
                {preview.already_issued > 0 && ` · ออกไปแล้วก่อนหน้า ${preview.already_issued} รายชื่อ`}
              </span>
            </div>

            {preview.include.length === 0 && (
              <div className="text-xs text-amber-700">
                ไม่มีรายชื่อค้างให้ออกคำสั่ง — ทุกคนที่อนุมัติแล้วได้รับคำสั่งครบ
              </div>
            )}

            {preview.skipped.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                  <AlertTriangle size={12} />
                  ข้ามไป {preview.skipped.length} วิชา — ยังไม่พร้อม (จะถือว่าล่าช้า)
                </div>
                <ul className="mt-1 space-y-0.5">
                  {preview.skipped.map(s => (
                    <li key={s.course_code} className="text-[11px] text-amber-900/90">
                      <b>{s.course_code}</b> {s.course_name_th} — {s.reason}
                      {s.pending_tas?.length ? ` (${s.pending_tas.join(", ")})` : ""}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-[11px] text-amber-900/80">
                  วิชาเหล่านี้จะไม่อยู่ในคำสั่งรอบนี้ — เมื่อเรียบร้อยแล้วให้กลับมาออกคำสั่งรอบถัดไป
                </div>
              </div>
            )}
          </div>
        )}

        {!!rounds?.items?.length && (
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              คำสั่งที่ออกไปแล้ว ({rounds.items.length} รอบ)
            </summary>
            <ul className="mt-2 space-y-1">
              {rounds.items.map(r => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <Chip tone={r.is_late ? "warn" : "neutral"}>รอบ {r.round_no}</Chip>
                  <span className="font-medium text-foreground">คำสั่งที่ {r.order_no}</span>
                  {/* order_date is stored as the ISO the picker produced; the
                      printed document converts it, so the history must too —
                      2026 next to a 2569 order number invites a double-take. */}
                  <span>· {thaiDatePreview(r.order_date, false) || r.order_date}</span>
                  <span>· {r.ta_count} รายชื่อ</span>
                  {r.generated_by && <span>· โดย {r.generated_by}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
          {/* คำสั่งที่ — one compact "N / ปี" unit inside a single bordered box */}
          <div>
            <label className="block text-xs text-ink-2 mb-1.5">คำสั่งที่ (เลขที่คำสั่ง)</label>
            <div className="flex h-9 items-center rounded-lg border border-border bg-surface px-2 focus-within:border-brand transition-colors">
              <input
                value={orderNoNum}
                onChange={e => setOrderNoNum(e.target.value.replace(/\D/g, ""))}
                placeholder="6"
                inputMode="numeric"
                aria-label="เลขที่คำสั่ง"
                className="w-14 bg-transparent text-center text-sm outline-none"
              />
              <span className="text-ink-3 px-1">/</span>
              <input
                value={orderNoYear}
                onChange={e => setOrderNoYear(e.target.value.replace(/\D/g, ""))}
                placeholder="2569"
                inputMode="numeric"
                maxLength={4}
                aria-label="ปี พ.ศ. ของคำสั่ง"
                className="flex-1 min-w-0 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {/* ผู้ลงนาม */}
          <div>
            <label className="block text-xs text-ink-2 mb-1.5">ผู้ลงนาม (คณบดี)</label>
            <Select
              value={signerId}
              onChange={e => setSignerId(e.target.value)}
              className="w-full"
              disabled={deans.length === 0}
            >
              <option value="">— เลือกผู้ลงนาม —</option>
              {deans.map(o => (
                <option key={o.id} value={o.id}>
                  {(o.academic_prefix ?? "")}{o.full_name} · {o.title}
                </option>
              ))}
            </Select>
            {/* Without a roster the form fills in fine and only fails at submit
                with "ไม่พบข้อมูลผู้ลงนาม" — which reads as a bug rather than
                as missing setup. Say it here, with the way out. */}
            {officers && deans.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                ยังไม่มีรายชื่อผู้ลงนามในระบบ — เพิ่มได้ที่{" "}
                <a href="/staff/settings" className="underline underline-offset-2">
                  ตั้งค่า › ผู้บริหารที่ลงนาม
                </a>
              </p>
            )}
          </div>

          {/* วันที่สั่ง */}
          <div>
            <label className="block text-xs text-ink-2 mb-1.5">วันที่สั่ง</label>
            <DatePicker value={orderDate} onChange={setOrderDate} label="วันที่สั่ง" className="w-full" />
            <p className="text-xs text-brand mt-1 h-4">
              {orderDate && thaiDatePreview(orderDate, true)}
            </p>
          </div>

          {/* มีผลตั้งแต่วันที่ */}
          <div>
            <label className="block text-xs text-ink-2 mb-1.5">มีผลตั้งแต่วันที่</label>
            <DatePicker value={effectiveDate} onChange={setEffectiveDate} label="มีผลตั้งแต่วันที่" className="w-full" />
            <p className="text-xs text-brand mt-1 h-4">
              {effectiveDate && thaiDatePreview(effectiveDate, false)}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={generate} disabled={busy}>
            <FileSignature size={14} /> {busy ? "กำลังสร้าง…" : "สร้าง PDF + DOCX"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
