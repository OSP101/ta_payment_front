"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Check, RotateCcw, Lock, AlertTriangle, CheckCircle2, Mail, Circle, Globe2, Copy, X } from "lucide-react";
import { api, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Panel, Button, Chip, TextArea, EmptyState, Alert, SearchField, ConfirmDialog, Tip } from "./ui";
import { Skel, SkelRegion } from "./Skeletons";
import { msg, useI18n } from "../lib/i18n/client";

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
  { n: 1, label: msg("ผู้ช่วยสอนเซ็นครบ"), atKey: "ta_signed_at", role: "ta", who: msg("ผู้ช่วยสอนทุกคนที่สอนในวิชานั้น") },
  { n: 2, label: msg("อาจารย์เซ็นครบ"), atKey: "lecturer_signed_at", role: "lecturer", who: msg("อาจารย์ผู้ส่งคำขอ") },
  { n: 3, label: msg("ผู้รับรองเซ็นครบ"), atKey: "certifier_signed_at", role: "certifier", who: msg("หัวหน้าสาขาวิชา") },
  { n: 4, label: msg("ส่งการเงินแล้ว"), atKey: "sent_finance_at", who: msg("เจ้าหน้าที่นำส่ง") },
  { n: 5, label: msg("คณบดีลงนาม"), atKey: "sent_treasury_at", who: msg("คณบดี") },
];

/** `year` turns the CE year into the one to print — pass year() from
 *  useI18n() (BE in Thai, CE in English); defaults to BE. */
export function fmt(iso?: string | null, year: (ce: number) => number = ce => ce + 543): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${year(d.getFullYear())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// DocumentProgressBoard fetches every round this term has and renders tabs
// only when there is more than one. A term whose ปะหน้าจ่ายตรง never crosses
// the 30 กันยายน budget year (or crosses it but October has nothing billable
// yet — see resolveFiscalRounds) gets back exactly one round and this screen
// is pixel-identical to before fiscal rounds existed: no tabs, no "รอบ"
// wording anywhere.
export function DocumentProgressBoard({
  termId, canEdit, showFinalStage = true, pending = false,
}: {
  termId: string;
  canEdit: boolean;
  /** Stage 5 ("คณบดีลงนาม") is hidden from TAs — pass false for TA viewers. */
  showFinalStage?: boolean;
  /**
   * The caller is still resolving which term to show (its /terms request has
   * not answered). An empty termId then means "not known yet", not "none
   * picked" — draw the board's shape instead of the "เลือกภาคเรียน" prompt.
   */
  pending?: boolean;
}) {
  const { t } = useI18n();
  const key = termId ? `/document-progress?term_id=${termId}` : null;
  const { data } = useSWR<TermProgressOverview>(key);
  const [activeRound, setActiveRound] = useState(1);
  // Warm the round checklist alongside the overview instead of after it: the
  // panels that read it (SignatureChecklistPanel / ViewerStageSigners) only
  // mount once the overview lands, which made the two requests a waterfall.
  // Same key those panels use, so SWR dedupes it into the one request.
  useSWR<SignatureItem[]>(termId ? `/document-progress/checklist?term_id=${termId}&round=${activeRound}` : null);

  if (!termId && !pending) return <Panel><EmptyState title={t("เลือกภาคเรียนเพื่อดูความคืบหน้า")} /></Panel>;
  if (!data) {
    return (
      <div className="space-y-3">
        {/* The share-link panel needs only the term, so it fills in on its own
            request rather than waiting behind the overview. */}
        {canEdit && termId && <ShareLinkPanel termId={termId} />}
        <BoardSkeleton canEdit={canEdit} stages={showFinalStage ? 5 : 4} />
      </div>
    );
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
              {r.round_label || t("รอบ {n}", { n: r.round })}
            </button>
          ))}
        </div>
      )}
      {lagging.length > 0 && (
        <Alert
          status="warning"
          title={t("เทอมนี้ยังเหลือ {rounds} ที่ยังไม่เสร็จ", { rounds: lagging.map(r => r.round_label || t("รอบ {n}", { n: r.round })).join(", ") })}
          description={t("อย่าลืมกลับมาเดินเอกสารรอบนี้ให้ครบด้วย — คลิกที่แท็บด้านบนเพื่อสลับไปดู")}
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
  /** The short URL token. `id` stays the row identity; only this is shared. */
  slug: string;
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
  const { t, year } = useI18n();
  const key = termId ? `/document-progress/${termId}/share-link` : null;
  const { data, isLoading } = useSWR<ShareLink | null>(key);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);

  // The slug, not the id: the link gets pasted into a chat and read off a
  // phone, so it carries a 12-character token instead of a 36-character UUID.
  // Links issued before slugs existed fall back to the id, which the backend
  // still resolves.
  const token = data ? data.slug || data.id : "";
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/p/progress/${token}` : "";

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
      notify.success(t("ยกเลิกลิงก์แล้ว — ลิงก์เดิมใช้ดูไม่ได้อีกต่อไป"));
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
      window.prompt(t("คัดลอกลิงก์นี้"), url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg bg-brand-soft text-brand">
          <Globe2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("ลิงก์สาธารณะสำหรับเทอมนี้")}</div>
          {/* The panel's frame is static; only whether a link exists waits on
              the request. Returning null here made the whole panel pop in. */}
          {isLoading ? (
            <Skel className="mt-1 h-3 w-3/4 max-w-80" />
          ) : data ? (
            <div className="text-xs text-muted truncate">
              {data.created_by_name
                ? t("ใครก็เปิดดูได้โดยไม่ต้องเข้าสู่ระบบ · สร้างเมื่อ {when} โดย {name}", { when: fmt(data.created_at, year), name: data.created_by_name })
                : t("ใครก็เปิดดูได้โดยไม่ต้องเข้าสู่ระบบ · สร้างเมื่อ {when}", { when: fmt(data.created_at, year) })}
            </div>
          ) : (
            <div className="text-xs text-muted">{t("ยังไม่มีลิงก์ — สร้างแล้วนำไปประกาศให้อาจารย์และผู้ช่วยสอนดูความคืบหน้าได้")}</div>
          )}
        </div>
        {isLoading ? (
          <Skel className="h-8 w-36 shrink-0 rounded-lg" />
        ) : data ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t("คัดลอกแล้ว") : t("คัดลอกลิงก์")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(true)} disabled={busy}>
              <X size={13} /> {t("ยกเลิกลิงก์")}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={create} disabled={busy}>
            <Globe2 size={13} /> {t("สร้างลิงก์สาธารณะ")}
          </Button>
        )}
      </div>
      {data && (
        <Tip content={url}>
          <div className="mt-2 truncate rounded-md bg-panel border border-hairline px-2.5 py-1.5 text-xs text-ink-2 tabular">
            {url}
          </div>
        </Tip>
      )}
      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={revoke}
        danger
        isPending={busy}
        title={t("ยกเลิกลิงก์สาธารณะ?")}
        message={t("ลิงก์ที่ประกาศไปแล้วจะเปิดดูไม่ได้อีก ถ้าต้องแชร์ใหม่ต้องสร้างลิงก์ใหม่และประกาศอีกครั้ง")}
        confirmLabel={t("ยกเลิกลิงก์")}
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
  const { t, year } = useI18n();
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Target stage of a pending BACKWARD move, awaiting confirmation. Going
  // forward is a record of something that happened and is instant; going back
  // ERASES the timestamps of every stage it passes, and this board is the only
  // record that those desks were ever reached. 0 means the full reset.
  const [confirmBack, setConfirmBack] = useState<number | null>(null);

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
      notify.success(t("อัปเดตความคืบหน้าแล้ว"));
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
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={18} />
            <span>{t.rich("{done} ({exported}/{total} วิชา) เริ่มติดตามการเซ็นได้", { done: <b>{t("ส่งออกเอกสารครบทุกวิชาแล้ว")}</b>, exported: p.exported_courses, total: p.total_courses })}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle size={18} />
              <span>
                {t.rich("{notYet} ส่งออกแล้ว {exported}/{total} วิชา ต้องส่งออกให้ครบทุกวิชาก่อนจึงจะเริ่มติดตามการเซ็นได้", { notYet: <b>{t("ยังส่งออกไม่ครบ")}</b>, exported: p.exported_courses, total: p.total_courses })}
              </span>
            </div>
            {p.unexported_courses.length > 0 && (
              <div className="text-xs text-ink-2">
                <span className="text-muted">{t("วิชาที่ยังไม่ส่งออก:")} </span>
                {p.unexported_courses.map(c => c.code).join(", ")}
              </div>
            )}
            {/* progress bar */}
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
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
          <div className="font-semibold">{t("การเดินเอกสารของทั้งเทอม")}</div>
          <div className="ml-auto">
            {done
              ? <Chip tone="success"><Check size={12} /> {t("เสร็จสิ้น")}</Chip>
              : !p.all_exported
              ? <Chip tone="neutral"><Lock size={12} /> {t("รอส่งออกครบ")}</Chip>
              : <Chip tone={displayStage === 0 ? "neutral" : "brand"}>{displayStage === 0 ? t("ยังไม่เริ่ม") : t("ขั้นที่ {n}/{max}", { n: displayStage, max: maxStage })}</Chip>}
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
                ? t("ต้องส่งออกเอกสารครบทุกวิชาก่อน")
                : isCurrent
                ? t("คลิกเพื่อย้อนขั้นนี้")
                : blockedNext
                ? t("ยังกดไม่ได้ {who}ยังเซ็นไม่ครบ", { who: t(st.who) })
                : isNext
                ? t("คลิกเพื่อยืนยันว่าขั้นนี้เสร็จแล้ว")
                : t("ต้องทำขั้นก่อนหน้าให้เสร็จก่อน");
              return (
                <div key={st.n} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <span aria-hidden className={"absolute top-4 right-1/2 left-[-50%] h-0.5 " + (p.stage >= st.n ? "bg-emerald-500" : "bg-hairline")} />
                  )}
                  <Tip content={title}><button
                    type="button"
                    disabled={!canClick}
                    onClick={() => {
                      if (!canClick) return;
                      // Clicking the CURRENT circle steps back off it. Forward
                      // is instant; back asks, because it drops this stage's
                      // date and nothing else records it.
                      if (isCurrent) setConfirmBack(st.n - 1);
                      else setStage(st.n);
                    }}
                    className={
                      "relative z-10 grid place-items-center w-8 h-8 rounded-full transition-colors " +
                      (reached
                        ? "bg-emerald-500 text-white"
                        : blockedNext
                        ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300"
                        : isNext
                        ? "bg-white text-accent ring-2 ring-accent"
                        : "bg-slate-200 text-slate-500") +
                      (canClick ? " cursor-pointer hover:ring-2 hover:ring-emerald-300" : " cursor-not-allowed") +
                      (isCurrent ? " ring-2 ring-emerald-400" : "")
                    }
                  >
                    {reached ? <Check size={16} strokeWidth={3} /> : <span className="text-xs font-semibold">{st.n}</span>}
                  </button></Tip>
                  <div className={"mt-2 text-center text-xs px-1 " + (reached ? "text-ink-1 font-medium" : isNext ? "text-ink-1 font-medium" : "text-ink-3")}>{t(st.label)}</div>
                  <div className="text-[10px] text-muted text-center px-1">{t(st.who)}</div>
                  {reached && at && <div className="text-[10px] text-muted tabular mt-0.5">{fmt(at, year)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {/* The five desks do not fit a phone, so the row scrolls. Say so —
            a scroll nobody knows about is the same as steps that do not exist. */}
        <div className="px-4 -mt-3 pb-1 text-[11px] text-muted sm:hidden">
          {t("เลื่อนแถวขั้นตอนไปทางซ้ายเพื่อดูขั้นถัดไป")}
        </div>

        {p.all_exported && !done && p.current_role && !p.can_advance && (p.signers_missing?.length ?? 0) > 0 && (
          <div className="mx-4 mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t.rich("{blocked} เหลืออีก {n} รายที่ยังไม่เซ็น:", { blocked: <b>{t("ยังไปขั้นถัดไปไม่ได้")}</b>, n: p.signers_missing!.length })}{" "}
            {p.signers_missing!.slice(0, 4).join(" · ")}
            {p.signers_missing!.length > 4 && t(" และอีก {n} ราย", { n: p.signers_missing!.length - 4 })}
          </div>
        )}

        <div className="px-4 pb-3 space-y-2">
          {canEdit ? (
            // Buttons drop under the field on a phone: side by side they left
            // the note box too narrow to read and pushed "บันทึกหมายเหตุ" off
            // the card.
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="block text-xs text-ink-2 mb-1">{t("หมายเหตุ (ไม่บังคับ)")}</label>
                <TextArea rows={2} value={note} onChange={e => setNoteDraft(e.target.value)}
                  placeholder={t("เช่น รออาจารย์ ก. เซ็น / ส่งเอกสารวันที่…")} disabled={!p.all_exported} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setStage(p.stage)} disabled={busy || !p.all_exported}>
                  {t("บันทึกหมายเหตุ")}
                </Button>
                {p.stage > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmBack(0)} disabled={busy}>
                    <RotateCcw size={12} /> {t("รีเซ็ต")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            p.note && <div className="text-xs text-ink-2"><span className="text-muted">{t("หมายเหตุ:")} </span>{p.note}</div>
          )}
          {p.updated_by_name && p.updated_at && (
            <div className="text-[11px] text-muted">{t("อัปเดตล่าสุดโดย {name} · {when}", { name: p.updated_by_name, when: fmt(p.updated_at, year) })}</div>
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

      {/* Every backward move passes through here. The wording says what is
          LOST, not what the button is called: an officer who reads
          "ย้อนกลับ?" and clicks ตกลง has not been told that the dates go with
          it, and those dates are the only record the term has of when each
          desk signed. */}
      <ConfirmDialog
        open={confirmBack !== null}
        onClose={() => setConfirmBack(null)}
        onConfirm={async () => {
          const target = confirmBack ?? 0;
          setConfirmBack(null);
          await setStage(target);
        }}
        danger
        isPending={busy}
        title={confirmBack === 0 ? t("รีเซ็ตความคืบหน้าทั้งเทอม?") : t("ย้อนกลับขั้นก่อนหน้า?")}
        message={
          confirmBack === 0
            ? t("ความคืบหน้าจะกลับไปเป็น “ยังไม่เริ่ม” และวันที่ของทุกขั้นที่บันทึกไว้แล้ว ({n} ขั้น) จะถูกลบทิ้ง กรอกกลับเข้ามาใหม่ไม่ได้ ต้องไล่กดทีละขั้นอีกครั้ง", { n: displayStage })
            : t("ขั้น “{stage}” จะถูกยกเลิก และวันที่ที่บันทึกไว้ของขั้นนี้จะหายไป", { stage: t(STAGES[(confirmBack ?? 1)]?.label ?? "") })
        }
        confirmLabel={confirmBack === 0 ? t("รีเซ็ต") : t("ย้อนกลับ")}
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
  /** The person. Absent for the certifier, who is one officer per course, and
   * on the public board (PDPA-03 — users.id is a login-required join key and
   * must not ride along on an anonymous link). */
  signer_id?: string | null;
  /** Public board's stand-in for signer_id: a short hash, stable enough to
   * dedupe React keys but not reversible to a user id. Absent on the
   * authenticated board, which has signer_id instead. */
  signer_ref?: string | null;
  responsible: string;
  signed_at?: string | null;
}

/** A key stable enough to dedupe a list of SignatureItem across renders,
 * working on both the authenticated board (signer_id) and the public one
 * (signer_ref instead) — see the PDPA-03 note on SignatureItem above. */
function signatureItemKey(it: SignatureItem): string {
  return it.role + (it.signer_id ?? it.signer_ref ?? "");
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
  const { t, year } = useI18n();
  const key = termId ? `/document-progress/checklist?term_id=${termId}&round=${round}` : null;
  const { data } = useSWR<SignatureItem[]>(key);
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
      notify.success(t("ส่งอีเมลแจ้งเตือนแล้ว {n} ท่าน", { n: res.notified }));
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // These two branches depend only on the stage, not on the checklist, so they
  // are decided before waiting on it.
  if (!allExported) return null;
  if (role === "") {
    // Stages 4 and 5 are things the officer does, not sheets anybody signs.
    return (
      <Panel>
        <EmptyState
          title={stage >= 5 ? t("เดินเอกสารครบทุกขั้นแล้ว") : t("ขั้นนี้ไม่มีรายการให้เซ็น")}
          description={
            stage >= 5
              ? t("คณบดีลงนามแล้ว จบกระบวนการของเทอมนี้")
              : t("เป็นขั้นที่เจ้าหน้าที่ดำเนินการเอง กดที่วงกลมขั้นถัดไปเมื่อทำเสร็จ")
          }
        />
      </Panel>
    );
  }
  if (!data) return <ChecklistSkeleton />;
  // Only when the stage genuinely has nobody. A search that matches nothing
  // must keep the panel (and its search box) on screen, or the officer is stuck
  // with no way to clear the term they just typed.
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState title={t("ยังไม่มีรายวิชาที่มีผู้ช่วยสอนในเทอมนี้")} description={t("เมื่อมีคำขอผู้ช่วยสอนที่อนุมัติแล้ว รายการรอลงนามจะแสดงที่นี่")} />
      </Panel>
    );
  }

  return (
    <Panel padded={false} data-tour="progress-checklist">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-hairline">
        <div>
          <div className="font-semibold">
            {t("ขั้นที่ {n} · {stage}", { n: stage + 1, stage: stageInfo ? t(stageInfo.label) : "" })}
          </div>
          <div className="text-xs text-muted">{t("รอ{who}ลงนาม ติ๊กทีละคนเมื่อได้ลายเซ็นแล้ว", { who: stageInfo ? t(stageInfo.who) : "" })}</div>
        </div>
        {pendingCount > 0
          ? <Chip tone="warn">{t("เซ็นแล้ว {n}/{total}", { n: signedCount, total: items.length })}</Chip>
          : <Chip tone="success"><Check size={12} /> {t("ครบแล้ว {n}/{total} กดขั้นถัดไปได้", { n: items.length, total: items.length })}</Chip>}
        {canEdit && role === "lecturer" && (
          <Button variant="secondary" size="sm" onClick={remind} disabled={busy || pendingCount === 0}>
            <Mail size={14} /> {t("ส่งอีเมลเตือนอาจารย์ที่ยังไม่เซ็น")}
          </Button>
        )}
        <div className="w-full sm:w-auto sm:ml-auto">
          <SearchField
            value={q}
            onChange={setQ}
            ariaLabel={t("ค้นหารายวิชาหรือชื่อผู้ลงนาม")}
            placeholder={t("ค้นหารหัสวิชา ชื่อวิชา หรือชื่อผู้ลงนาม")}
          />
        </div>
      </div>
      {needle !== "" && (
        <div className="px-4 py-2 text-xs text-muted border-b border-hairline">
          {shown.length > 0
            ? t("พบ {n} รายการจากทั้งหมด {total} รายการ", { n: shown.length, total: items.length })
            : t("ไม่พบรายการที่ตรงกับ “{q}”", { q: q.trim() })}
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
                  ? <Chip tone="success"><Check size={12} /> {t("ครบ")}</Chip>
                  : <Chip tone="warn">{t("เหลือ {n}/{total}", { n: left, total: g.items.length })}</Chip>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.items.map(it => {
                  const signed = !!it.signed_at;
                  return (
                    <Tip key={signatureItemKey(it)} content={[it.responsible, canEdit ? (signed ? t("คลิกเพื่อยกเลิกการเซ็น") : t("คลิกเพื่อทำเครื่องหมายว่าเซ็นแล้ว")) : ""].filter(Boolean).join("\n")}><button
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => canEdit && toggle(it, !signed)}
                      className={
                        "flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition " +
                        (signed
                          ? "border-emerald-300 bg-emerald-50"
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
                          {signed ? t("เซ็นแล้ว · {when}", { when: fmt(it.signed_at, year) }) : t("ยังไม่เซ็น")}
                        </div>
                      </div>
                    </button></Tip>
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
// i18n-ignore-next-line — title prefixes are part of a person's name (data)
const FULL_PREFIX: [string, string][] = [
  ["ศ. ดร.", "ศาสตราจารย์ ดร."], // i18n-ignore
  ["รศ. ดร.", "รองศาสตราจารย์ ดร."], // i18n-ignore
  ["ผศ. ดร.", "ผู้ช่วยศาสตราจารย์ ดร."], // i18n-ignore
  ["ศ.ดร.", "ศาสตราจารย์ ดร."], // i18n-ignore
  ["รศ.ดร.", "รองศาสตราจารย์ ดร."], // i18n-ignore
  ["ผศ.ดร.", "ผู้ช่วยศาสตราจารย์ ดร."], // i18n-ignore
  ["ผศ.", "ผู้ช่วยศาสตราจารย์"], // i18n-ignore
  ["รศ.", "รองศาสตราจารย์"], // i18n-ignore
  ["ศ.", "ศาสตราจารย์"], // i18n-ignore
  ["อ.", "อาจารย์"], // i18n-ignore
  ["น.ส.", "นางสาว"], // i18n-ignore
  ["นส.", "นางสาว"], // i18n-ignore
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
  ta: msg("สถานะรายชื่อผู้ช่วยสอนที่สอนในแต่ละวิชา"),
  lecturer: msg("สถานะรายชื่ออาจารย์ที่สอนในแต่ละวิชา"),
  certifier: msg("สถานะรายชื่อผู้รับรองในแต่ละวิชา"),
};

// Exported so the public share-link page (app/p/progress/[linkId])
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
  const { t, year } = useI18n();
  const visibleStages = STAGES.filter(st => showFinalStage || st.n < 5);
  const maxStage = showFinalStage ? 5 : 4;
  const displayStage = Math.min(p.stage, maxStage);
  const done = displayStage >= maxStage;
  const currentStage = STAGES.find(st => st.n === displayStage + 1);

  // One line, in the reader's terms. No tally of who is still missing — with
  // thirty TAs that turns the header into a wall of names, and the list below
  // answers it properly.
  const headline = !p.all_exported
    ? t("เจ้าหน้าที่กำลังเตรียมเอกสาร")
    : done
    ? t("เดินเอกสารครบทุกขั้นแล้ว")
    : t("กำลังรอ{who}ลงนาม", { who: currentStage ? t(currentStage.who) : "" });
  const sub = !p.all_exported
    ? t("เตรียมแล้ว {n} จาก {total} วิชา เมื่อครบทุกวิชาจึงจะเริ่มเก็บลายเซ็น", { n: p.exported_courses, total: p.total_courses })
    : done
    ? t("จบกระบวนการของรอบนี้แล้ว")
    : t("ขั้นที่ {n} จาก {max} · {stage}", { n: displayStage + 1, max: maxStage, stage: currentStage ? t(currentStage.label) : "" });

  return (
    <div className="space-y-3">
      <Panel padded={false}>
        <div className="px-4 pt-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("สถานะตอนนี้")}</div>
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
                        : "bg-slate-200 text-slate-500")
                    }
                  >
                    {reached ? <Check size={16} strokeWidth={3} /> : <span className="text-xs font-semibold">{st.n}</span>}
                  </span>
                  <span className={"mt-2 text-center text-xs px-1 " + (reached || isCurrent ? "text-ink-1 font-medium" : "text-ink-3")}>
                    {t(st.label)}
                  </span>
                  <span className="text-[10px] text-muted text-center px-1">{t(st.who)}</span>
                  <span className={"text-[10px] text-center px-1 mt-0.5 " + (reached ? "text-muted tabular" : "text-ink-3")}>
                    {reached ? fmt(at, year) : isCurrent ? t("กำลังดำเนินการ") : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="px-4 -mt-3 pb-1 text-[11px] text-muted sm:hidden">
          {t("เลื่อนแถวขั้นตอนไปทางซ้ายเพื่อดูขั้นถัดไป")}
        </div>

        {(p.note || (p.updated_by_name && p.updated_at)) && (
          <div className="px-4 pb-4 pt-1 space-y-1 border-t border-hairline mt-2">
            {p.note && (
              <div className="text-sm pt-2">
                <span className="text-muted text-xs">{t("หมายเหตุจากเจ้าหน้าที่:")} </span>
                <span className="text-ink-1">{p.note}</span>
              </div>
            )}
            {p.updated_by_name && p.updated_at && (
              <div className="text-[11px] text-muted">{t("อัปเดตล่าสุดโดย {name} · {when}", { name: p.updated_by_name, when: fmt(p.updated_at, year) })}</div>
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
  const { t, year } = useI18n();
  const { data } = useSWR<SignatureItem[]>(checklistKey);
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

  if (role === "" || done) {
    return (
      <Panel>
        <EmptyState
          title={done ? t("เดินเอกสารครบทุกขั้นแล้ว") : t("ขั้นนี้ไม่มีรายชื่อผู้ลงนาม")}
          description={
            done
              ? t("เอกสารของรอบนี้ผ่านทุกขั้นเรียบร้อย")
              : t("เป็นขั้นที่เจ้าหน้าที่ดำเนินการเอง ไม่มีใครต้องลงนามในขั้นนี้")
          }
        />
      </Panel>
    );
  }
  if (!data) return <ChecklistSkeleton />;
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState title={t("ยังไม่มีรายวิชาที่มีผู้ช่วยสอนในรอบนี้")} description={t("เมื่อคำขอผู้ช่วยสอนได้รับอนุมัติ รายชื่อจะแสดงที่นี่")} />
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
          <div className="font-semibold">{STAGE_LIST_TITLE[role] ? t(STAGE_LIST_TITLE[role]) : t("สถานะรายชื่อ{who}", { who: stageInfo ? t(stageInfo.who) : "" })}</div>
          <div className="text-xs text-muted">{t("ลงนามแล้ว {n} จาก {total} รายชื่อ", { n: signed, total: items.length })}</div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto">
          <SearchField
            value={q}
            onChange={setQ}
            ariaLabel={t("ค้นหารายวิชาหรือชื่อผู้ลงนาม")}
            placeholder={t("ค้นหารหัสวิชา ชื่อวิชา หรือชื่อผู้ลงนาม")}
          />
        </div>
      </div>
      {needle !== "" && (
        <div className="px-4 py-2 text-xs text-muted border-b border-hairline">
          {byCourse.length > 0 ? t("พบ {n} วิชา", { n: byCourse.length }) : t("ไม่พบรายการที่ตรงกับ “{q}”", { q: q.trim() })}
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
                  ? "border-l-red-400 bg-red-50/60"
                  : "border-l-transparent")
              }
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tabular text-sm font-medium">{g.code}</span>
                <Tip content={`${g.code} ${g.name_th}`}>
                  <span className="text-sm text-ink-2 min-w-0 truncate">{g.name_th}</span>
                </Tip>
                {/* The whole point of this list is "which course is stuck" —
                    a TA should see that at a glance, not by counting ticks. */}
                {incomplete
                  ? <Chip tone="danger">{t("ค้างอยู่ {n} คน", { n: left })}</Chip>
                  : <Chip tone="success"><Check size={12} /> {t("ลงนามครบ")}</Chip>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {g.items.map(it => (
                  <li key={signatureItemKey(it)} className="flex items-baseline gap-2 text-sm">
                    {it.signed_at
                      ? <Check size={15} aria-hidden className="text-emerald-600 shrink-0 translate-y-0.5" />
                      : <X size={15} aria-hidden className="text-red-600 shrink-0 translate-y-0.5" />}
                    <span className={"min-w-0 flex-1 font-medium " + (it.signed_at ? "text-emerald-700" : "text-red-600")}>
                      {fullName(it.responsible) || "—"}
                    </span>
                    <span className={"text-xs shrink-0 " + (it.signed_at ? "text-emerald-700" : "text-red-600")}>
                      {it.signed_at ? t("ลงนามแล้ว · {when}", { when: fmt(it.signed_at, year) }) : t("ยังไม่ได้ลงนาม")}
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

/* -------------------------------------------------------------------------- */
/* Loading placeholders                                                       */
/* -------------------------------------------------------------------------- */

// Same outline as the real stepper row (circle, label, who) so the panel keeps
// its height when the overview lands.
function StepperSkeleton({ stages }: { stages: number }) {
  return (
    <div className="px-4 py-5 overflow-x-auto">
      <div className="flex items-start min-w-[640px]">
        {Array.from({ length: stages }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <Skel className="size-8 rounded-full" />
            <Skel className="h-3 w-20" />
            <Skel className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// One round's board while the overview is in flight: the officer's gate +
// stepper + checklist, or the viewer's status card + stepper.
function BoardSkeleton({ canEdit, stages }: { canEdit: boolean; stages: number }) {
  const { t } = useI18n();
  if (!canEdit) {
    return (
      <SkelRegion className="space-y-3">
        <Panel padded={false}>
          <div className="px-4 pt-4 flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-muted">{t("สถานะตอนนี้")}</div>
            <Skel className="h-6 w-56" />
            <Skel className="h-4 w-72 max-w-full" />
          </div>
          <StepperSkeleton stages={stages} />
        </Panel>
      </SkelRegion>
    );
  }
  return (
    <SkelRegion className="space-y-3">
      <Panel>
        <Skel className="h-5 w-2/3" />
      </Panel>
      <Panel padded={false}>
        <div className="px-4 py-3 flex items-center gap-3 border-b border-hairline">
          <div className="font-semibold">{t("การเดินเอกสารของทั้งเทอม")}</div>
          <Skel className="ml-auto h-6 w-24 rounded-full" />
        </div>
        <StepperSkeleton stages={stages} />
        <div className="px-4 pb-3">
          <Skel className="h-16 w-full rounded-xl" />
        </div>
      </Panel>
      <ChecklistSkeleton />
    </SkelRegion>
  );
}

// A checklist panel: header line + two course groups of signer tiles.
function ChecklistSkeleton() {
  return (
    <Panel padded={false}>
      <SkelRegion>
        <div className="px-4 py-3 flex flex-col gap-2 border-b border-hairline">
          <Skel className="h-4 w-48" />
          <Skel className="h-3 w-64 max-w-full" />
        </div>
        <div className="divide-y divide-hairline">
          {[0, 1].map(i => (
            <div key={i} className="px-4 py-3">
              <Skel className="h-4 w-56 mb-2" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[0, 1, 2].map(j => <Skel key={j} className="h-12 rounded-lg" />)}
              </div>
            </div>
          ))}
        </div>
      </SkelRegion>
    </Panel>
  );
}
