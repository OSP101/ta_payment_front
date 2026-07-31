"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";
import { Package, CheckCircle2, AlertTriangle, History, FileSignature, ChevronRight } from "lucide-react";
import { api, errMessage } from "../../lib/api";
import { useTerm, useTermKey } from "../TermContext";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, Select, EmptyState, Chip, ConfirmDialog, TextInput, DatePicker, Spinner } from "../../components/ui";

/**
 * Why the export list is empty, in the officer's terms. The two causes need
 * different actions on different screens, so a single "nothing here" would leave
 * them guessing which one applies.
 */
function emptyReason(noOrder: number, notReviewed: number): string {
  const parts: string[] = [];
  if (noOrder > 0) {
    parts.push(`${noOrder} วิชายังไม่ได้พิมพ์คำสั่งแต่งตั้งทีเอ — พิมพ์ที่แท็บ “ใบแต่งตั้งทีเอ (คำสั่ง)” ก่อน`);
  }
  if (notReviewed > 0) {
    parts.push(`${notReviewed} วิชายังตรวจเบิกจ่าย (ขั้นที่ 3) ไม่เสร็จ`);
  }
  if (parts.length === 0) {
    return "วิชาจะขึ้นที่นี่เมื่อพิมพ์คำสั่งแต่งตั้งทีเอแล้ว และตรวจเบิกจ่ายเสร็จทุกเดือน";
  }
  return parts.join(" · ");
}

/** The same information, condensed, for when the list is not empty. */
function excludedHint(noOrder: number, notReviewed: number): string {
  const parts: string[] = [];
  if (noOrder > 0) parts.push(`ยังไม่ได้พิมพ์คำสั่ง ${noOrder} วิชา`);
  if (notReviewed > 0) parts.push(`ยังตรวจเบิกจ่ายไม่เสร็จ ${notReviewed} วิชา`);
  return parts.join(" · ");
}

interface TC { id: string; code: string; name_th: string; num_students: number; exported_at?: string | null; }

// Phase 4 dashboard row aggregating budget + submission status per course.
interface CourseSummary {
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  term_label: string;
  per_course_max_baht: number;
  used_baht: number;
  remaining_baht: number;
  over_budget: boolean;
  ta_count: number;
  pending_months?: string[];
  /**
   * Months with lecturer-approved work that have NOT passed staff review
   * (step 3). Export skips them, so the row has to say so — otherwise the
   * download quietly contains fewer TAs than the course has.
   */
  unreviewed_months?: string[];
  last_export_at?: string | null;
  /** A printed appointment order covers this course. */
  has_appointment_order: boolean;
  /** Step 3 finished: at least one month signed off and none still waiting. */
  review_complete: boolean;
  /** Both of the above. Decided by the server so this screen and the payout
   *  review screen cannot drift apart on what "ready to export" means. */
  export_eligible: boolean;
}

interface ExportBatch {
  id: string;
  file_name: string;
  ta_count: number;
  total_baht: number;
  generated_at: string;
  generated_by_name?: string;
}

type Tab = "package" | "appointment";

export default function ExportsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("package");
  // Term comes from the shell's switcher — see TermContext.
  const { termId } = useTerm();
  const { data: courses } = useSWR<TC[]>(useTermKey("/teaching-courses"));
  const { data: summary } = useSWR<CourseSummary[]>(useTermKey("/exports/summary"));

  // Clicking a course opens its workspace (view/edit worklog + verify + export).
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Merge summary onto courses so a single row shows exportable status +
  // budget snapshot. courses is the source of truth; summary is enrichment.
  const summaryById = new Map((summary ?? []).map(s => [s.teaching_course_id, s]));

  // Only courses that are actually exportable. A term holds every course the
  // registrar file mentions — 127 of them here — and listing all of them made the
  // screen a directory to scroll rather than a work list. A course qualifies once
  // its appointment order is printed (the TAs are officially appointed) AND step 3
  // is finished (the amounts are final); `export_eligible` is that rule, decided
  // server-side.
  //
  // Rendered only after `summary` arrives, because eligibility lives there: doing
  // it the other way round would flash the full 127 rows on every load.
  const visible = summary
    ? (courses ?? []).filter(c => summaryById.get(c.id)?.export_eligible)
    : undefined;

  // Why the rest are absent. An empty list with no explanation reads as a broken
  // page, and the two reasons need different actions on different screens.
  const excluded = (summary ?? []).filter(s => !s.export_eligible);
  const noOrder = excluded.filter(s => !s.has_appointment_order).length;
  const notReviewed = excluded.filter(s => s.has_appointment_order && !s.review_complete).length;

  return (
    <div>
      <PageHeader
        title="ส่งออกเอกสาร"
        description="สร้าง ZIP รวมเอกสารเบิกจ่ายทั้งวิชา + ใบแต่งตั้งทีเอ (คำสั่ง) — แต่ละ tab สร้างไฟล์คนละแบบ"
      />

      <div className="flex gap-2 mb-3 border-b border-hairline">
        <TabButton active={tab === "package"} onClick={() => setTab("package")}>
          <Package size={14} /> แพ็คเกจรายวิชา
        </TabButton>
        <TabButton active={tab === "appointment"} onClick={() => setTab("appointment")}>
          <FileSignature size={14} /> ใบแต่งตั้งทีเอ (คำสั่ง)
        </TabButton>
      </div>

      {tab === "appointment" && termId && (
        <AppointmentSection termId={termId} />
      )}

      {tab === "package" && (<>
      <Panel padded={false} className="mb-3">
        {!visible ? (
          <div className="p-6 flex justify-center"><Spinner /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="ยังไม่มีวิชาที่พร้อมส่งออก"
            description={emptyReason(noOrder, notReviewed)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-ink-2">
                <tr>
                  <th className="text-left px-3 py-2">วิชา</th>
                  <th className="text-right px-3 py-2">งบ / ใช้ไปแล้ว</th>
                  <th className="text-right px-3 py-2">คงเหลือ</th>
                  <th className="text-center px-3 py-2">TA</th>
                  <th className="text-left px-3 py-2">ส่งออกล่าสุด</th>
                  <th className="text-right px-3 py-2">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => {
                  const s = summaryById.get(c.id);
                  const exported = !!c.exported_at;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-hairline cursor-pointer hover:bg-surface-secondary transition-colors"
                      onClick={() => router.push(`/staff/exports/${c.id}`)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center shrink-0">
                            <Package size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.code}</div>
                            <div className="text-xs text-ink-3 truncate">{c.name_th}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {s ? (
                          <>
                            {s.per_course_max_baht.toLocaleString()} / <b>{s.used_baht.toLocaleString()}</b>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {s ? (
                          s.over_budget ? (
                            <Chip tone="warn"><AlertTriangle size={11} /> เกิน</Chip>
                          ) : (
                            <span>{s.remaining_baht.toLocaleString()}</span>
                          )
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center tabular">{s?.ta_count ?? 0}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-col items-start gap-1">
                          {exported ? (
                            <Chip tone="success"><CheckCircle2 size={11} /> ส่งออกแล้ว</Chip>
                          ) : (
                            <span className="text-ink-3">ยังไม่ส่งออก</span>
                          )}
                          {!!s?.unreviewed_months?.length && (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-amber-700"
                              title={`ยังไม่ผ่านขั้นที่ 3 (ตรวจสอบเบิกจ่าย): ${s.unreviewed_months.join(", ")}`}
                            >
                              <AlertTriangle size={11} className="shrink-0" />
                              รอตรวจ {s.unreviewed_months.length} เดือน
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); setHistoryFor(c.id); }}
                        >
                          <History size={12} />ประวัติ
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => router.push(`/staff/exports/${c.id}`)}>
                          เปิด <ChevronRight size={12} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {visible && visible.length > 0 && (noOrder > 0 || notReviewed > 0) && (
        <p className="mb-2 text-xs text-[var(--ink-3)]">
          แสดงเฉพาะวิชาที่พร้อมส่งออก — {excludedHint(noOrder, notReviewed)}
        </p>
      )}

      <p className="text-xs text-[var(--ink-3)]">
        คลิกที่วิชาเพื่อเปิดหน้าจัดการ — ดู/แก้ไขบันทึกเวลา ตรวจสอบยอดเบิกจ่าย และส่งออก ZIP (การส่งออกจะล็อกเดือนที่อนุมัติครบ)
      </p>
      </>)}

      {historyFor && (
        <HistoryDialog tcId={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-[var(--brand)] text-[var(--brand)]"
          : "border-transparent text-ink-3 hover:text-ink-1 hover:border-hairline"
      }`}
    >
      {children}
    </button>
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

function HistoryDialog({ tcId, onClose }: { tcId: string; onClose: () => void }) {
  const { data } = useSWR<ExportBatch[]>(`/exports/course/${tcId}/history`);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={onClose}
      confirmLabel="ปิด"
      title="ประวัติการส่งออก"
      icon={<History size={20} />}
      message={
        !data ? (
          <p className="text-sm text-muted">กำลังโหลด…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่เคยส่งออกวิชานี้</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-ink-2 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">เวลา</th>
                  <th className="text-left px-2 py-1">ผู้ส่งออก</th>
                  <th className="text-right px-2 py-1">จำนวน TA</th>
                  <th className="text-right px-2 py-1">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {data.map(b => (
                  <tr key={b.id} className="border-t border-hairline">
                    <td className="px-2 py-1 tabular">{b.generated_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-2 py-1">{b.generated_by_name}</td>
                    <td className="px-2 py-1 text-right tabular">{b.ta_count}</td>
                    <td className="px-2 py-1 text-right tabular">{b.total_baht.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    />
  );
}
