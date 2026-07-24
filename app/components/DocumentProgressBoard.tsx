"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Check, RotateCcw, Lock, AlertTriangle, CheckCircle2, Mail, Circle } from "lucide-react";
import { api, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Panel, Button, Chip, TextArea, EmptyState, Spinner } from "./ui";

interface CourseRef { code: string; name_th: string; }
// Per-term physical document progress (migration 0031) + export readiness.
export interface TermProgress {
  term_id: string;
  total_courses: number;
  exported_courses: number;
  all_exported: boolean;
  unexported_courses: CourseRef[];
  stage: number; // 0..5
  ta_signed_at?: string | null;
  lecturer_signed_at?: string | null;
  certifier_signed_at?: string | null;
  sent_finance_at?: string | null;
  sent_treasury_at?: string | null;
  note?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
}

const STAGES: { n: number; label: string; atKey: keyof TermProgress }[] = [
  { n: 1, label: "TA เซ็นครบ", atKey: "ta_signed_at" },
  { n: 2, label: "อาจารย์เซ็นครบ", atKey: "lecturer_signed_at" },
  { n: 3, label: "ผู้รับรองเซ็นครบ", atKey: "certifier_signed_at" },
  { n: 4, label: "ส่งการเงินแล้ว", atKey: "sent_finance_at" },
  { n: 5, label: "คณบดีลงนาม", atKey: "sent_treasury_at" },
];

function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DocumentProgressBoard({
  termId, canEdit, showFinalStage = true,
}: {
  termId: string;
  canEdit: boolean;
  /** Stage 5 ("คณบดีลงนาม") is hidden from TAs — pass false for TA viewers. */
  showFinalStage?: boolean;
}) {
  const key = termId ? `/document-progress?term_id=${termId}` : null;
  const { data, isLoading } = useSWR<TermProgress>(key);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!termId) return <Panel><EmptyState title="เลือกภาคเรียนเพื่อดูความคืบหน้า" /></Panel>;
  if (isLoading || !data) {
    return <Panel><div className="flex items-center gap-2 py-8 justify-center text-sm text-muted"><Spinner size="sm" /> กำลังโหลด…</div></Panel>;
  }

  const p = data;
  const note = noteDraft ?? p.note ?? "";
  // TAs never see the final "คณบดีลงนาม" stage — clamp the visible range so the
  // stepper and the "ขั้นที่ X/Y" chip stay consistent.
  const visibleStages = STAGES.filter(st => showFinalStage || st.n < 5);
  const maxStage = showFinalStage ? 5 : 4;
  const displayStage = Math.min(p.stage, maxStage);
  const done = displayStage >= maxStage;
  const stepsEnabled = canEdit && p.all_exported;

  async function setStage(stage: number) {
    setBusy(true);
    try {
      await api.post(`/document-progress/${termId}`, { stage, note });
      notify.success("อัปเดตความคืบหน้าแล้ว");
      setNoteDraft(null);
      if (key) mutate(key);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Export readiness gate */}
      <Panel>
        {p.all_exported ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={18} />
            <span><b>ส่งออกเอกสารครบทุกวิชาแล้ว</b> ({p.exported_courses}/{p.total_courses} วิชา) — เริ่มติดตามการเซ็นได้</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle size={18} />
              <span>
                <b>ยังส่งออกไม่ครบ</b> — ส่งออกแล้ว {p.exported_courses}/{p.total_courses} วิชา
                {" "}ต้องส่งออกให้ครบทุกวิชาก่อนจึงจะเริ่มติดตามการเซ็นได้
              </span>
            </div>
            {p.unexported_courses.length > 0 && (
              <div className="text-xs text-ink-2">
                <span className="text-muted">วิชาที่ยังไม่ส่งออก: </span>
                {p.unexported_courses.map(c => c.code).join(", ")}
              </div>
            )}
            {/* progress bar */}
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${p.total_courses ? Math.round((p.exported_courses / p.total_courses) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </Panel>

      {/* The single term-level stepper */}
      <Panel padded={false}>
        <div className="px-4 py-3 flex items-center gap-3 border-b border-hairline">
          <div className="font-semibold">การเดินเอกสารของทั้งเทอม</div>
          <div className="ml-auto">
            {done
              ? <Chip tone="success"><Check size={12} /> เสร็จสิ้น</Chip>
              : !p.all_exported
              ? <Chip tone="neutral"><Lock size={12} /> รอส่งออกครบ</Chip>
              : <Chip tone={displayStage === 0 ? "neutral" : "brand"}>{displayStage === 0 ? "ยังไม่เริ่ม" : `ขั้นที่ ${displayStage}/${maxStage}`}</Chip>}
          </div>
        </div>

        <div className={"px-4 py-5 overflow-x-auto " + (!p.all_exported ? "opacity-50" : "")}>
          <div className="flex items-start min-w-[640px]">
            {visibleStages.map((st, i) => {
              const reached = p.stage >= st.n;
              const isCurrent = p.stage === st.n;
              const at = p[st.atKey] as string | null | undefined;
              return (
                <div key={st.n} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <span aria-hidden className={"absolute top-4 right-1/2 left-[-50%] h-0.5 " + (p.stage >= st.n ? "bg-emerald-500" : "bg-hairline")} />
                  )}
                  <button
                    type="button"
                    disabled={!stepsEnabled || busy}
                    onClick={() => stepsEnabled && setStage(isCurrent ? st.n - 1 : st.n)}
                    title={stepsEnabled ? (isCurrent ? "คลิกเพื่อย้อนขั้นนี้" : "คลิกเพื่อตั้งเป็นขั้นนี้") : "ต้องส่งออกเอกสารครบทุกวิชาก่อน"}
                    className={
                      "relative z-10 grid place-items-center w-8 h-8 rounded-full transition-colors " +
                      (reached ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400") +
                      (stepsEnabled ? " cursor-pointer hover:ring-2 hover:ring-emerald-300" : " cursor-not-allowed") +
                      (isCurrent ? " ring-2 ring-emerald-400" : "")
                    }
                  >
                    {reached ? <Check size={16} strokeWidth={3} /> : <span className="text-xs font-semibold">{st.n}</span>}
                  </button>
                  <div className={"mt-2 text-center text-xs px-1 " + (reached ? "text-ink-1 font-medium" : "text-ink-3")}>{st.label}</div>
                  {reached && at && <div className="text-[10px] text-muted tabular mt-0.5">{fmt(at)}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 pb-3 space-y-2">
          {canEdit ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-ink-2 mb-1">หมายเหตุ (ไม่บังคับ)</label>
                <TextArea rows={2} value={note} onChange={e => setNoteDraft(e.target.value)}
                  placeholder="เช่น รออาจารย์ ก. เซ็น / ส่งเอกสารวันที่…" disabled={!p.all_exported} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setStage(p.stage)} disabled={busy || !p.all_exported}>
                บันทึกหมายเหตุ
              </Button>
              {p.stage > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStage(0)} disabled={busy}>
                  <RotateCcw size={12} /> รีเซ็ต
                </Button>
              )}
            </div>
          ) : (
            p.note && <div className="text-xs text-ink-2"><span className="text-muted">หมายเหตุ: </span>{p.note}</div>
          )}
          {p.updated_by_name && p.updated_at && (
            <div className="text-[11px] text-muted">อัปเดตล่าสุดโดย {p.updated_by_name} · {fmt(p.updated_at)}</div>
          )}
        </div>
      </Panel>

      {/* Per-course signature checklist — who hasn't signed yet */}
      <SignatureChecklistPanel termId={termId} canEdit={canEdit} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-course signature checklist (B3)                                        */
/* -------------------------------------------------------------------------- */

interface SignatureItem {
  teaching_course_id: string;
  code: string;
  name_th: string;
  exported: boolean;
  role: string;
  role_label: string;
  responsible: string;
  signed_at?: string | null;
}

function SignatureChecklistPanel({ termId, canEdit }: { termId: string; canEdit: boolean }) {
  const key = termId ? `/document-progress/checklist?term_id=${termId}` : null;
  const { data, isLoading } = useSWR<SignatureItem[]>(key);
  const [busy, setBusy] = useState(false);

  const byCourse = useMemo(() => {
    const m = new Map<string, { code: string; name_th: string; items: SignatureItem[] }>();
    for (const it of data ?? []) {
      const g = m.get(it.teaching_course_id) ?? { code: it.code, name_th: it.name_th, items: [] };
      g.items.push(it);
      m.set(it.teaching_course_id, g);
    }
    return Array.from(m.entries());
  }, [data]);

  const pendingCount = (data ?? []).filter(i => !i.signed_at).length;

  async function toggle(tcId: string, role: string, signed: boolean) {
    setBusy(true);
    try {
      await api.post(`/document-progress/checklist/${tcId}`, { role, signed });
      if (key) mutate(key);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    try {
      const res = await api.post<{ notified: number }>(`/document-progress/${termId}/remind`);
      notify.success(`ส่งอีเมลแจ้งเตือนแล้ว ${res.notified} ท่าน`);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data) {
    return <Panel><div className="flex items-center gap-2 py-6 justify-center text-sm text-muted"><Spinner size="sm" /> กำลังโหลด…</div></Panel>;
  }
  if (byCourse.length === 0) {
    return (
      <Panel>
        <EmptyState title="ยังไม่มีรายวิชาที่มี TA ในเทอมนี้" description="เมื่อมีคำขอ TA ที่อนุมัติแล้ว รายการรอลงนามจะแสดงที่นี่" />
      </Panel>
    );
  }

  return (
    <Panel padded={false}>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-hairline">
        <div className="font-semibold">รายการรอลงนาม (รายวิชา)</div>
        {pendingCount > 0
          ? <Chip tone="warn">ค้าง {pendingCount} รายการ</Chip>
          : <Chip tone="success"><Check size={12} /> เซ็นครบทุกวิชา</Chip>}
        {canEdit && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={remind} disabled={busy || pendingCount === 0}>
            <Mail size={14} /> ส่งอีเมลเตือนอาจารย์ที่ยังไม่เซ็น
          </Button>
        )}
      </div>
      <div className="divide-y divide-hairline">
        {byCourse.map(([tcId, g]) => (
          <div key={tcId} className="px-4 py-3">
            <div className="text-sm font-medium mb-2">
              <span className="tabular">{g.code}</span> <span className="text-ink-2">{g.name_th}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {g.items.map(it => {
                const signed = !!it.signed_at;
                return (
                  <button
                    key={it.role}
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => canEdit && toggle(tcId, it.role, !signed)}
                    title={canEdit ? (signed ? "คลิกเพื่อยกเลิกการเซ็น" : "คลิกเพื่อทำเครื่องหมายว่าเซ็นแล้ว") : undefined}
                    className={
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition " +
                      (signed
                        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-hairline bg-panel") +
                      (canEdit ? " hover:border-accent cursor-pointer" : " cursor-default")
                    }
                  >
                    {signed
                      ? <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      : <Circle size={16} className="text-ink-3 shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{it.role_label}</div>
                      <div className="text-[11px] text-muted truncate">
                        {it.responsible || "—"}
                      </div>
                      <div className={"text-[11px] " + (signed ? "text-emerald-700" : "text-amber-700")}>
                        {signed ? "เซ็นแล้ว" : "ยังไม่เซ็น"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
