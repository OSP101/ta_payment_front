"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Check, RotateCcw, Lock, AlertTriangle, CheckCircle2, Mail, Circle, Globe2, Copy, X } from "lucide-react";
import { api, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Panel, Button, Chip, TextArea, EmptyState, Spinner, Alert, SearchField, ConfirmDialog } from "./ui";

interface CourseRef { code: string; name_th: string; }
// Per-ROUND physical document progress (migration 0031, fiscal_round since
// migration 0082) + export readiness. A term that crosses the 30 กันยายน
// budget year with real ตุลาคม work has TWO of these; every other term has
// exactly one, indistinguishable from before this feature existed.
export interface TermProgress {
  term_id: string;
  /** 1 or 2 — see TermProgressOverview. */
  round: number;
  /** "" for a single-round term; "รอบ 1 · งบ 2569 (มิ.ย.–ก.ย.)" once a term has two. */
  round_label?: string;
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
  /** The one step the officer may take, and whether its signatures are in. */
  next_stage: number;
  can_advance: boolean;
  signers_missing?: string[];
  /** Role signing at the current stage — "" for 4/5, which nobody signs. */
  current_role?: string;
}

interface TermProgressOverview {
  term_id: string;
  rounds: TermProgress[];
}

const STAGES: { n: number; label: string; atKey: keyof TermProgress; role?: string; who: string }[] = [
  { n: 1, label: "ผู้ช่วยสอนเซ็นครบ", atKey: "ta_signed_at", role: "ta", who: "ผู้ช่วยสอนทุกคนที่สอนในวิชานั้น" },
  { n: 2, label: "อาจารย์เซ็นครบ", atKey: "lecturer_signed_at", role: "lecturer", who: "อาจารย์ผู้ส่งคำขอ" },
  { n: 3, label: "ผู้รับรองเซ็นครบ", atKey: "certifier_signed_at", role: "certifier", who: "หัวหน้าสาขาวิชา" },
  { n: 4, label: "ส่งการเงินแล้ว", atKey: "sent_finance_at", who: "เจ้าหน้าที่นำส่ง" },
  { n: 5, label: "คณบดีลงนาม", atKey: "sent_treasury_at", who: "คณบดี" },
];

export function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// DocumentProgressBoard fetches every round this term has and renders tabs
// only when there is more than one. A term whose ปะหน้าจ่ายตรง never crosses
// the 30 กันยายน budget year (or crosses it but October has nothing billable
// yet — see resolveFiscalRounds) gets back exactly one round and this screen
// is pixel-identical to before fiscal rounds existed: no tabs, no "รอบ"
// wording anywhere.
export function DocumentProgressBoard({
  termId, canEdit, showFinalStage = true,
}: {
  termId: string;
  canEdit: boolean;
  /** Stage 5 ("คณบดีลงนาม") is hidden from TAs — pass false for TA viewers. */
  showFinalStage?: boolean;
}) {
  const key = termId ? `/document-progress?term_id=${termId}` : null;
  const { data, isLoading } = useSWR<TermProgressOverview>(key);
  const [activeRound, setActiveRound] = useState(1);

  if (!termId) return <Panel><EmptyState title="เลือกภาคเรียนเพื่อดูความคืบหน้า" /></Panel>;
  if (isLoading || !data) {
    return <Panel><div className="flex items-center gap-2 py-8 justify-center text-sm text-muted"><Spinner size="sm" /> กำลังโหลด…</div></Panel>;
  }

  const rounds = data.rounds;
  const showTabs = rounds.length > 1;
  const current = rounds.find(r => r.round === activeRound) ?? rounds[0];
  const maxStage = showFinalStage ? 5 : 4;
  // A round other than the one on screen still needing work is exactly the
  // thing staff asked not to lose track of — surfaced once, above the tabs,
  // so switching to round 1's tab does not make round 2 disappear from mind.
  // …and only for the officer who has to act on it. To a TA it is a nag about
  // somebody else's desk.
  const lagging = showTabs && canEdit ? rounds.filter(r => r.round !== activeRound && r.stage < maxStage) : [];

  return (
    <div className="space-y-3">
      {showTabs && (
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {rounds.map(r => (
            <button
              key={r.round}
              type="button"
              onClick={() => setActiveRound(r.round)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (activeRound === r.round ? "bg-brand text-white" : "text-ink-2 hover:text-ink-1")
              }
            >
              {r.round_label || `รอบ ${r.round}`}
            </button>
          ))}
        </div>
      )}
      {lagging.length > 0 && (
        <Alert
          status="warning"
          title={`เทอมนี้ยังเหลือ ${lagging.map(r => r.round_label || `รอบ ${r.round}`).join(", ")} ที่ยังไม่เสร็จ`}
          description="อย่าลืมกลับมาเดินเอกสารรอบนี้ให้ครบด้วย — คลิกที่แท็บด้านบนเพื่อสลับไปดู"
        />
      )}
      {canEdit && (
        // Per-term, not per-round — the public link tabs through every round
        // itself (see the public page), so one link covers a crossing term's
        // two documents.
        <ShareLinkPanel termId={termId} />
      )}
      {canEdit ? (
        <RoundBoard
          key={current.round}
          termId={termId}
          round={current.round}
          p={current}
          overviewKey={key}
          canEdit={canEdit}
          showFinalStage={showFinalStage}
        />
      ) : (
        // TAs and lecturers get a different screen, not a disabled copy of the
        // officer's. Theirs is a record of where the paper is, so it reads
        // top-to-bottom like a route slip and offers nothing to click.
        <ViewerRoundBoard
          key={current.round}
          p={current}
          showFinalStage={showFinalStage}
          checklistKey={termId ? `/document-progress/checklist?term_id=${termId}&round=${current.round}` : null}
        />
      )}
    </div>
  );
}

interface ShareLink {
  id: string;
  term_id: string;
  created_at: string;
  created_by_name?: string;
}

// The public, no-login view of this term's board — a link staff post to the
// department LINE group or Facebook page. At most one is live per term;
// issuing again while one exists just hands back the same link (see the
// backend), so the button here never risks scattering two different links
// for the same term across chat history.
function ShareLinkPanel({ termId }: { termId: string }) {
  const key = termId ? `/document-progress/${termId}/share-link` : null;
  const { data, isLoading } = useSWR<ShareLink | null>(key);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = data && typeof window !== "undefined" ? `${window.location.origin}/p/document-progress/${data.id}` : "";

  async function create() {
    setBusy(true);
    try {
      await api.post(`/document-progress/${termId}/share-link`);
      if (key) mutate(key);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.del(`/document-progress/${termId}/share-link`);
      notify.success("ยกเลิกลิงก์แล้ว — ลิงก์เดิมใช้ดูไม่ได้อีกต่อไป");
      setConfirmRevoke(false);
      if (key) mutate(key);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("คัดลอกลิงก์นี้", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (isLoading) return null;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg bg-brand-soft text-brand">
          <Globe2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">ลิงก์สาธารณะสำหรับเทอมนี้</div>
          {data ? (
            <div className="text-xs text-muted truncate">
              ใครก็เปิดดูได้โดยไม่ต้องเข้าสู่ระบบ · สร้างเมื่อ {fmt(data.created_at)}
              {data.created_by_name ? ` โดย ${data.created_by_name}` : ""}
            </div>
          ) : (
            <div className="text-xs text-muted">ยังไม่มีลิงก์ — สร้างแล้วนำไปประกาศให้อาจารย์และผู้ช่วยสอนดูความคืบหน้าได้</div>
          )}
        </div>
        {data ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(true)} disabled={busy}>
              <X size={13} /> ยกเลิกลิงก์
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={create} disabled={busy}>
            <Globe2 size={13} /> สร้างลิงก์สาธารณะ
          </Button>
        )}
      </div>
      {data && (
        <div className="mt-2 truncate rounded-md bg-panel border border-hairline px-2.5 py-1.5 text-xs text-ink-2 tabular">
          {url}
        </div>
      )}
      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={revoke}
        danger
        isPending={busy}
        title="ยกเลิกลิงก์สาธารณะ?"
        message="ลิงก์ที่ประกาศไปแล้วจะเปิดดูไม่ได้อีก ถ้าต้องแชร์ใหม่ต้องสร้างลิงก์ใหม่และประกาศอีกครั้ง"
        confirmLabel="ยกเลิกลิงก์"
      />
    </Panel>
  );
}

// RoundBoard renders ONE round's stepper + checklist. Keyed by round in the
// parent so switching tabs remounts it fresh (a note draft typed for round 1
// must not leak onto round 2's screen).
function RoundBoard({
  termId, round, p, overviewKey, canEdit, showFinalStage,
}: {
  termId: string;
  round: number;
  p: TermProgress;
  overviewKey: string | null;
  canEdit: boolean;
  showFinalStage: boolean;
}) {
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await api.post(`/document-progress/${termId}?round=${round}`, { stage, note });
      notify.success("อัปเดตความคืบหน้าแล้ว");
      setNoteDraft(null);
      if (overviewKey) mutate(overviewKey);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Export readiness gate */}
      <Panel data-tour="progress-gate">
        {p.all_exported ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={18} />
            <span><b>ส่งออกเอกสารครบทุกวิชาแล้ว</b> ({p.exported_courses}/{p.total_courses} วิชา) เริ่มติดตามการเซ็นได้</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle size={18} />
              <span>
                <b>ยังส่งออกไม่ครบ</b> ส่งออกแล้ว {p.exported_courses}/{p.total_courses} วิชา
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
      <Panel padded={false} data-tour="progress-stepper">
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

        <div className={"px-4 py-5 overflow-x-auto snap-x " + (!p.all_exported ? "opacity-50" : "")}>
          <div className="flex items-start min-w-[640px] [&>*]:snap-start">
            {visibleStages.map((st, i) => {
              const reached = p.stage >= st.n;
              const isCurrent = p.stage === st.n;
              // The paper moves one desk at a time. Only the very next step is
              // offered, and only once its signatures are in — the server says
              // so via can_advance, and refuses anything else, so the circle
              // must not offer what SetStage would reject.
              const at = p[st.atKey] as string | null | undefined;
              const isNext = st.n === p.stage + 1;
              const canClick =
                stepsEnabled && !busy && (isCurrent || (isNext && p.can_advance));
              const blockedNext = stepsEnabled && isNext && !p.can_advance;
              const title = !stepsEnabled
                ? "ต้องส่งออกเอกสารครบทุกวิชาก่อน"
                : isCurrent
                ? "คลิกเพื่อย้อนขั้นนี้"
                : blockedNext
                ? `ยังกดไม่ได้ ${st.who}ยังเซ็นไม่ครบ`
                : isNext
                ? "คลิกเพื่อยืนยันว่าขั้นนี้เสร็จแล้ว"
                : "ต้องทำขั้นก่อนหน้าให้เสร็จก่อน";
              return (
                <div key={st.n} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <span aria-hidden className={"absolute top-4 right-1/2 left-[-50%] h-0.5 " + (p.stage >= st.n ? "bg-emerald-500" : "bg-hairline")} />
                  )}
                  <button
                    type="button"
                    disabled={!canClick}
                    onClick={() => canClick && setStage(isCurrent ? st.n - 1 : st.n)}
                    title={title}
                    className={
                      "relative z-10 grid place-items-center w-8 h-8 rounded-full transition-colors " +
                      (reached
                        ? "bg-emerald-500 text-white"
                        : blockedNext
                        ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300"
                        : isNext
                        ? "bg-white text-accent ring-2 ring-accent dark:bg-slate-900"
                        : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400") +
                      (canClick ? " cursor-pointer hover:ring-2 hover:ring-emerald-300" : " cursor-not-allowed") +
                      (isCurrent ? " ring-2 ring-emerald-400" : "")
                    }
                  >
                    {reached ? <Check size={16} strokeWidth={3} /> : <span className="text-xs font-semibold">{st.n}</span>}
                  </button>
                  <div className={"mt-2 text-center text-xs px-1 " + (reached ? "text-ink-1 font-medium" : isNext ? "text-ink-1 font-medium" : "text-ink-3")}>{st.label}</div>
                  <div className="text-[10px] text-muted text-center px-1">{st.who}</div>
                  {reached && at && <div className="text-[10px] text-muted tabular mt-0.5">{fmt(at)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {/* The five desks do not fit a phone, so the row scrolls. Say so —
            a scroll nobody knows about is the same as steps that do not exist. */}
        <div className="px-4 -mt-3 pb-1 text-[11px] text-muted sm:hidden">
          เลื่อนแถวขั้นตอนไปทางซ้ายเพื่อดูขั้นถัดไป
        </div>

        {p.all_exported && !done && p.current_role && !p.can_advance && (p.signers_missing?.length ?? 0) > 0 && (
          <div className="mx-4 mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <b>ยังไปขั้นถัดไปไม่ได้</b> เหลืออีก {p.signers_missing!.length} รายที่ยังไม่เซ็น:{" "}
            {p.signers_missing!.slice(0, 4).join(" · ")}
            {p.signers_missing!.length > 4 && ` และอีก ${p.signers_missing!.length - 4} ราย`}
          </div>
        )}

        <div className="px-4 pb-3 space-y-2">
          {canEdit ? (
            // Buttons drop under the field on a phone: side by side they left
            // the note box too narrow to read and pushed "บันทึกหมายเหตุ" off
            // the card.
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="block text-xs text-ink-2 mb-1">หมายเหตุ (ไม่บังคับ)</label>
                <TextArea rows={2} value={note} onChange={e => setNoteDraft(e.target.value)}
                  placeholder="เช่น รออาจารย์ ก. เซ็น / ส่งเอกสารวันที่…" disabled={!p.all_exported} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setStage(p.stage)} disabled={busy || !p.all_exported}>
                  บันทึกหมายเหตุ
                </Button>
                {p.stage > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setStage(0)} disabled={busy}>
                    <RotateCcw size={12} /> รีเซ็ต
                  </Button>
                )}
              </div>
            </div>
          ) : (
            p.note && <div className="text-xs text-ink-2"><span className="text-muted">หมายเหตุ: </span>{p.note}</div>
          )}
          {p.updated_by_name && p.updated_at && (
            <div className="text-[11px] text-muted">อัปเดตล่าสุดโดย {p.updated_by_name} · {fmt(p.updated_at)}</div>
          )}
        </div>
      </Panel>

      {/* Only the people the CURRENT stage is waiting on. Showing all three
          roles at once was the old shape and it buried the actual question —
          the officer wants one list: who do I chase today. */}
      <SignatureChecklistPanel
        termId={termId}
        round={round}
        canEdit={canEdit}
        stage={p.stage}
        role={p.current_role ?? ""}
        allExported={p.all_exported}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-course signature checklist (B3)                                        */
/* -------------------------------------------------------------------------- */

export interface SignatureItem {
  teaching_course_id: string;
  code: string;
  name_th: string;
  exported: boolean;
  role: string;
  role_label: string;
  /** The person. Absent for the certifier, who is one officer per course. */
  signer_id?: string | null;
  responsible: string;
  signed_at?: string | null;
}

function SignatureChecklistPanel({
  termId, round, canEdit, stage, role, allExported,
}: {
  termId: string;
  round: number;
  canEdit: boolean;
  /** Current term stage — the panel shows whoever signs at stage + 1. */
  stage: number;
  /** Role signing next, from the server. "" once nobody signs (stages 4-5). */
  role: string;
  allExported: boolean;
}) {
  const key = termId ? `/document-progress/checklist?term_id=${termId}&round=${round}` : null;
  const { data, isLoading } = useSWR<SignatureItem[]>(key);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const stageInfo = STAGES.find(st => st.n === stage + 1);
  // Only this stage's people. The panel is a work queue, not an archive: a TA
  // who signed in stage 1 is not something the officer needs to look at while
  // chasing the lecturer.
  const items = useMemo(
    () => (data ?? []).filter(i => role !== "" && i.role === role),
    [data, role],
  );

  // In a real term this list runs to hundreds of names, so the officer needs to
  // jump straight to one course or one person. Matching is on course code, Thai
  // course name, and the signer's name — whichever the officer happens to know.
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle === ""
        ? items
        : items.filter(i =>
            [i.code, i.name_th, i.responsible].some(v => (v ?? "").toLowerCase().includes(needle)),
          ),
    [items, needle],
  );

  const byCourse = useMemo(() => {
    const m = new Map<string, { code: string; name_th: string; items: SignatureItem[] }>();
    for (const it of shown) {
      const g = m.get(it.teaching_course_id) ?? { code: it.code, name_th: it.name_th, items: [] };
      g.items.push(it);
      m.set(it.teaching_course_id, g);
    }
    return Array.from(m.entries());
  }, [shown]);

  const pendingCount = items.filter(i => !i.signed_at).length;
  const signedCount = items.length - pendingCount;

  async function toggle(it: SignatureItem, signed: boolean) {
    setBusy(true);
    try {
      await api.post(`/document-progress/checklist/${it.teaching_course_id}?round=${round}`, {
        role: it.role,
        signer_id: it.signer_id ?? null,
        signed,
      });
      if (key) mutate(key);
      // The stepper's can_advance depends on these ticks, so it has to refetch
      // too — otherwise the circle stays amber after the last name is ticked.
      mutate(`/document-progress?term_id=${termId}`);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    try {
      const res = await api.post<{ notified: number }>(`/document-progress/${termId}/remind?round=${round}`);
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
  if (!allExported) return null;
  if (role === "") {
    // Stages 4 and 5 are things the officer does, not sheets anybody signs.
    return (
      <Panel>
        <EmptyState
          title={stage >= 5 ? "เดินเอกสารครบทุกขั้นแล้ว" : "ขั้นนี้ไม่มีรายการให้เซ็น"}
          description={
            stage >= 5
              ? "คณบดีลงนามแล้ว จบกระบวนการของเทอมนี้"
              : "เป็นขั้นที่เจ้าหน้าที่ดำเนินการเอง กดที่วงกลมขั้นถัดไปเมื่อทำเสร็จ"
          }
        />
      </Panel>
    );
  }
  // Only when the stage genuinely has nobody. A search that matches nothing
  // must keep the panel (and its search box) on screen, or the officer is stuck
  // with no way to clear the term they just typed.
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState title="ยังไม่มีรายวิชาที่มีผู้ช่วยสอนในเทอมนี้" description="เมื่อมีคำขอผู้ช่วยสอนที่อนุมัติแล้ว รายการรอลงนามจะแสดงที่นี่" />
      </Panel>
    );
  }

  return (
    <Panel padded={false} data-tour="progress-checklist">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-hairline">
        <div>
          <div className="font-semibold">
            ขั้นที่ {stage + 1} · {stageInfo?.label ?? ""}
          </div>
          <div className="text-xs text-muted">รอ{stageInfo?.who ?? ""}ลงนาม ติ๊กทีละคนเมื่อได้ลายเซ็นแล้ว</div>
        </div>
        {pendingCount > 0
          ? <Chip tone="warn">เซ็นแล้ว {signedCount}/{items.length}</Chip>
          : <Chip tone="success"><Check size={12} /> ครบแล้ว {items.length}/{items.length} กดขั้นถัดไปได้</Chip>}
        {canEdit && role === "lecturer" && (
          <Button variant="secondary" size="sm" onClick={remind} disabled={busy || pendingCount === 0}>
            <Mail size={14} /> ส่งอีเมลเตือนอาจารย์ที่ยังไม่เซ็น
          </Button>
        )}
        <div className="w-full sm:w-auto sm:ml-auto">
          <SearchField
            value={q}
            onChange={setQ}
            ariaLabel="ค้นหารายวิชาหรือชื่อผู้ลงนาม"
            placeholder="ค้นหารหัสวิชา ชื่อวิชา หรือชื่อผู้ลงนาม"
          />
        </div>
      </div>
      {needle !== "" && (
        <div className="px-4 py-2 text-xs text-muted border-b border-hairline">
          {shown.length > 0
            ? `พบ ${shown.length} รายการจากทั้งหมด ${items.length} รายการ`
            : `ไม่พบรายการที่ตรงกับ “${q.trim()}”`}
        </div>
      )}
      <div className="divide-y divide-hairline">
        {byCourse.map(([tcId, g]) => {
          const left = g.items.filter(i => !i.signed_at).length;
          return (
            <div key={tcId} className="px-4 py-3">
              <div className="text-sm font-medium mb-2 flex flex-wrap items-center gap-2">
                <span className="tabular">{g.code}</span>
                <span className="text-ink-2 font-normal">{g.name_th}</span>
                {left === 0
                  ? <Chip tone="success"><Check size={12} /> ครบ</Chip>
                  : <Chip tone="warn">เหลือ {left}/{g.items.length}</Chip>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.items.map(it => {
                  const signed = !!it.signed_at;
                  return (
                    <button
                      key={it.role + (it.signer_id ?? "")}
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => canEdit && toggle(it, !signed)}
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
                        <div className="text-xs font-medium truncate">{it.responsible || "—"}</div>
                        <div className={"text-[11px] " + (signed ? "text-emerald-700" : "text-amber-700")}>
                          {signed ? `เซ็นแล้ว · ${fmt(it.signed_at)}` : "ยังไม่เซ็น"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Viewer side (TA / lecturer): the same route, read as a record              */
/* -------------------------------------------------------------------------- */

// The database stores คำนำหน้า the way the paper forms abbreviate them
// ("ผศ. ดร.", "น.ส."). On a screen there is room for the whole word, and a TA
// reading who is holding their paperwork should see the person as they would be
// addressed. Longest key first so "ผศ." never matches inside "ผู้ช่วยศาสตราจารย์".
const FULL_PREFIX: [string, string][] = [
  ["ศ. ดร.", "ศาสตราจารย์ ดร."],
  ["รศ. ดร.", "รองศาสตราจารย์ ดร."],
  ["ผศ. ดร.", "ผู้ช่วยศาสตราจารย์ ดร."],
  ["ศ.ดร.", "ศาสตราจารย์ ดร."],
  ["รศ.ดร.", "รองศาสตราจารย์ ดร."],
  ["ผศ.ดร.", "ผู้ช่วยศาสตราจารย์ ดร."],
  ["ผศ.", "ผู้ช่วยศาสตราจารย์"],
  ["รศ.", "รองศาสตราจารย์"],
  ["ศ.", "ศาสตราจารย์"],
  ["อ.", "อาจารย์"],
  ["น.ส.", "นางสาว"],
  ["นส.", "นางสาว"],
];

export function fullName(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  for (const [abbr, full] of FULL_PREFIX) {
    if (s.startsWith(abbr)) return `${full} ${s.slice(abbr.length).trim()}`;
  }
  return s;
}

// The panel header for whichever role is signing at the current stage. Not
// just "รายชื่อ" + STAGES[...].who verbatim — "สถานะรายชื่อ…" reads as a
// status board, which is what a TA scanning for a stuck course actually wants.
const STAGE_LIST_TITLE: Record<string, string> = {
  ta: "สถานะรายชื่อผู้ช่วยสอนที่สอนในแต่ละวิชา",
  lecturer: "สถานะรายชื่ออาจารย์ที่สอนในแต่ละวิชา",
  certifier: "สถานะรายชื่อผู้รับรองในแต่ละวิชา",
};

// Exported so the public share-link page (app/p/document-progress/[linkId])
// can render the exact same read-only board off its own (unauthenticated)
// checklist endpoint — same component, different URL underneath.
export function ViewerRoundBoard({
  p, showFinalStage, checklistKey,
}: {
  p: TermProgress;
  showFinalStage: boolean;
  /** Full SWR key for this round's checklist, or null while nothing to fetch yet. */
  checklistKey: string | null;
}) {
  const visibleStages = STAGES.filter(st => showFinalStage || st.n < 5);
  const maxStage = showFinalStage ? 5 : 4;
  const displayStage = Math.min(p.stage, maxStage);
  const done = displayStage >= maxStage;
  const currentStage = STAGES.find(st => st.n === displayStage + 1);

  // One line, in the reader's terms. No tally of who is still missing — with
  // thirty TAs that turns the header into a wall of names, and the list below
  // answers it properly.
  const headline = !p.all_exported
    ? "เจ้าหน้าที่กำลังเตรียมเอกสาร"
    : done
    ? "เดินเอกสารครบทุกขั้นแล้ว"
    : `กำลังรอ${currentStage?.who ?? ""}ลงนาม`;
  const sub = !p.all_exported
    ? `เตรียมแล้ว ${p.exported_courses} จาก ${p.total_courses} วิชา เมื่อครบทุกวิชาจึงจะเริ่มเก็บลายเซ็น`
    : done
    ? "จบกระบวนการของรอบนี้แล้ว"
    : `ขั้นที่ ${displayStage + 1} จาก ${maxStage} · ${currentStage?.label ?? ""}`;

  return (
    <div className="space-y-3">
      <Panel padded={false}>
        <div className="px-4 pt-4">
          <div className="text-xs uppercase tracking-wide text-muted">สถานะตอนนี้</div>
          <h2 className="text-lg font-semibold mt-0.5">{headline}</h2>
          <p className="text-sm text-ink-2 mt-0.5">{sub}</p>
        </div>

        {/* Same left-to-right route as the officer's board, so both sides of
            the office are talking about the same five desks — but built from
            list items, not buttons: there is nothing here to press. */}
        <div className={"px-4 py-5 overflow-x-auto snap-x " + (!p.all_exported ? "opacity-60" : "")}>
          <ol className="flex items-start min-w-[640px] [&>*]:snap-start">
            {visibleStages.map((st, i) => {
              const reached = displayStage >= st.n;
              const isCurrent = p.all_exported && !done && displayStage + 1 === st.n;
              const at = p[st.atKey] as string | null | undefined;
              return (
                <li
                  key={st.n}
                  className="flex-1 flex flex-col items-center relative"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {i > 0 && (
                    <span aria-hidden className={"absolute top-4 right-1/2 left-[-50%] h-0.5 " + (reached ? "bg-emerald-500" : "bg-hairline")} />
                  )}
                  <span
                    aria-hidden
                    className={
                      "relative z-10 grid place-items-center w-8 h-8 rounded-full " +
                      (reached
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "bg-panel text-accent ring-2 ring-accent"
                        : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400")
                    }
                  >
                    {reached ? <Check size={16} strokeWidth={3} /> : <span className="text-xs font-semibold">{st.n}</span>}
                  </span>
                  <span className={"mt-2 text-center text-xs px-1 " + (reached || isCurrent ? "text-ink-1 font-medium" : "text-ink-3")}>
                    {st.label}
                  </span>
                  <span className="text-[10px] text-muted text-center px-1">{st.who}</span>
                  <span className={"text-[10px] text-center px-1 mt-0.5 " + (reached ? "text-muted tabular" : "text-ink-3")}>
                    {reached ? fmt(at) : isCurrent ? "กำลังดำเนินการ" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="px-4 -mt-3 pb-1 text-[11px] text-muted sm:hidden">
          เลื่อนแถวขั้นตอนไปทางซ้ายเพื่อดูขั้นถัดไป
        </div>

        {(p.note || (p.updated_by_name && p.updated_at)) && (
          <div className="px-4 pb-4 pt-1 space-y-1 border-t border-hairline mt-2">
            {p.note && (
              <div className="text-sm pt-2">
                <span className="text-muted text-xs">หมายเหตุจากเจ้าหน้าที่: </span>
                <span className="text-ink-1">{p.note}</span>
              </div>
            )}
            {p.updated_by_name && p.updated_at && (
              <div className="text-[11px] text-muted">อัปเดตล่าสุดโดย {p.updated_by_name} · {fmt(p.updated_at)}</div>
            )}
          </div>
        )}
      </Panel>

      {p.all_exported && (
        <ViewerStageSigners
          checklistKey={checklistKey}
          stage={displayStage}
          role={p.current_role ?? ""}
          done={done}
        />
      )}
    </div>
  );
}

// Only the people the CURRENT step is waiting on — TA names while it is the
// TAs' step, lecturers once it moves to theirs. Names come with their full
// คำนำหน้า, and nothing here is clickable.
function ViewerStageSigners({
  checklistKey, stage, role, done,
}: {
  checklistKey: string | null;
  stage: number;
  role: string;
  done: boolean;
}) {
  const { data, isLoading } = useSWR<SignatureItem[]>(checklistKey);
  const [q, setQ] = useState("");

  const stageInfo = STAGES.find(st => st.n === stage + 1);
  const items = useMemo(
    () => (data ?? []).filter(i => role !== "" && i.role === role),
    [data, role],
  );

  // A real term runs to hundreds of rows, so let the reader jump to one course
  // or one person instead of scrolling for their own name.
  const needle = q.trim().toLowerCase();
  const byCourse = useMemo(() => {
    const m = new Map<string, { code: string; name_th: string; items: SignatureItem[] }>();
    for (const it of items) {
      const g = m.get(it.teaching_course_id) ?? { code: it.code, name_th: it.name_th, items: [] };
      g.items.push(it);
      m.set(it.teaching_course_id, g);
    }
    const all = Array.from(m.entries());
    if (needle === "") return all;
    return all
      .map(([id, g]) => {
        if ([g.code, g.name_th].some(v => (v ?? "").toLowerCase().includes(needle))) return [id, g] as const;
        const hit = g.items.filter(i => fullName(i.responsible).toLowerCase().includes(needle));
        return hit.length ? ([id, { ...g, items: hit }] as const) : null;
      })
      .filter((x): x is readonly [string, { code: string; name_th: string; items: SignatureItem[] }] => x !== null)
      .map(x => [x[0], x[1]] as [string, { code: string; name_th: string; items: SignatureItem[] }]);
  }, [items, needle]);

  if (isLoading || !data) {
    return <Panel><div className="flex items-center gap-2 py-6 justify-center text-sm text-muted"><Spinner size="sm" /> กำลังโหลด…</div></Panel>;
  }
  if (role === "" || done) {
    return (
      <Panel>
        <EmptyState
          title={done ? "เดินเอกสารครบทุกขั้นแล้ว" : "ขั้นนี้ไม่มีรายชื่อผู้ลงนาม"}
          description={
            done
              ? "เอกสารของรอบนี้ผ่านทุกขั้นเรียบร้อย"
              : "เป็นขั้นที่เจ้าหน้าที่ดำเนินการเอง ไม่มีใครต้องลงนามในขั้นนี้"
          }
        />
      </Panel>
    );
  }
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState title="ยังไม่มีรายวิชาที่มีผู้ช่วยสอนในรอบนี้" description="เมื่อคำขอผู้ช่วยสอนได้รับอนุมัติ รายชื่อจะแสดงที่นี่" />
      </Panel>
    );
  }

  const signed = items.filter(i => i.signed_at).length;

  return (
    <Panel
      padded={false}
      className="overflow-hidden"
    >
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline">
        <div className="min-w-0">
          <div className="font-semibold">{STAGE_LIST_TITLE[role] ?? `สถานะรายชื่อ${stageInfo?.who ?? ""}`}</div>
          <div className="text-xs text-muted">ลงนามแล้ว {signed} จาก {items.length} รายชื่อ</div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto">
          <SearchField
            value={q}
            onChange={setQ}
            ariaLabel="ค้นหารายวิชาหรือชื่อผู้ลงนาม"
            placeholder="ค้นหารหัสวิชา ชื่อวิชา หรือชื่อผู้ลงนาม"
          />
        </div>
      </div>
      {needle !== "" && (
        <div className="px-4 py-2 text-xs text-muted border-b border-hairline">
          {byCourse.length > 0 ? `พบ ${byCourse.length} วิชา` : `ไม่พบรายการที่ตรงกับ “${q.trim()}”`}
        </div>
      )}
      <div className="divide-y divide-hairline">
        {byCourse.map(([tcId, g]) => {
          const left = g.items.filter(i => !i.signed_at).length;
          const incomplete = left > 0;
          return (
            <div
              key={tcId}
              className={
                "px-4 py-3 border-l-4 " +
                (incomplete
                  ? "border-l-red-400 bg-red-50/60 dark:bg-red-950/10"
                  : "border-l-transparent")
              }
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tabular text-sm font-medium">{g.code}</span>
                <span className="text-sm text-ink-2 min-w-0 truncate">{g.name_th}</span>
                {/* The whole point of this list is "which course is stuck" —
                    a TA should see that at a glance, not by counting ticks. */}
                {incomplete
                  ? <Chip tone="danger">ค้างอยู่ {left} คน</Chip>
                  : <Chip tone="success"><Check size={12} /> ลงนามครบ</Chip>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {g.items.map(it => (
                  <li key={it.role + (it.signer_id ?? "")} className="flex items-baseline gap-2 text-sm">
                    {it.signed_at
                      ? <Check size={15} aria-hidden className="text-emerald-600 shrink-0 translate-y-0.5" />
                      : <X size={15} aria-hidden className="text-red-600 shrink-0 translate-y-0.5" />}
                    <span className={"min-w-0 flex-1 font-medium " + (it.signed_at ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                      {fullName(it.responsible) || "—"}
                    </span>
                    <span className={"text-xs shrink-0 " + (it.signed_at ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400")}>
                      {it.signed_at ? `ลงนามแล้ว · ${fmt(it.signed_at)}` : "ยังไม่ได้ลงนาม"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
