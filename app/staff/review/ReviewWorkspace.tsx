"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  Modal as HModal, Select as HSelect, InputGroup, Label, TextField, FieldError,
} from "@heroui/react";
import {
  Users, Check, X, Download, AlertTriangle, FileText,
} from "lucide-react";
import { api, apiUrl } from "../../lib/api";
import { requiredDocKinds } from "../../lib/nationality";
import { notify } from "../../lib/notify";
import PdfFrame from "../../components/PdfFrame";
import { SuppliersButton } from "./SuppliersButton";
import { Skel, SkelRegion, SkelValue } from "../../components/Skeletons";
import {
  Button, Chip, Select, TextArea, FieldGroup, Modal, TipWrap, Tip,
} from "../../components/ui";
import {
  DOC_KIND_LABEL, DOC_KIND_PRINT_ORDER, byPrintOrder, REJECT_PRESETS, OTHER_PRESET,
  type Pending, type Doc, type Profile,
} from "./types";
import { useI18n, type TFn } from "../../lib/i18n/client";

/**
 * Full-screen review workspace — the layout the 24/07/2026 meeting asked for,
 * modelled on Google Classroom's grading screen (reference image supplied).
 *
 * Two things it fixes about the old accordion:
 *
 *  1. Reviewing meant expanding a row, then opening each file in a drawer, then
 *     collapsing and finding the next person. The submitter list now lives
 *     permanently on the left, so moving between people is one click and never
 *     closes the workspace.
 *
 *  2. Documents were cards you had to click. They are now rendered inline the
 *     moment a person is selected — the meeting was explicit: "พรีวิวออกมาเลย
 *     ไม่ต้องกดเพื่อเปิดดู".
 *
 * The rail sits on the LEFT, matching the reference image. The meeting minutes
 * say "ทางขวา"; the image is the authority the minutes point at, and a left
 * rail also matches the direction of reading and every other list in the app.
 */

interface DetailResp {
  profile: Profile | null;
  documents: Doc[];
}


/** DOM id for a document panel, used by the sticky jump-to nav. */
const docAnchor = (docId: string) => `doc-${docId}`;

type SortMode = "status" | "name";

/**
 * The set of TAs this review session is about, plus which of them turned up
 * after it started.
 *
 * Why a session-scoped roster rather than just rendering the pending bucket:
 *
 *  - Approving somebody moves them OUT of pending. Rendering the bucket
 *    directly made them vanish mid-review, which reads as data loss and leaves
 *    the officer no way to see what they just decided.
 *  - The bulk-download gate is "did anyone on this screen get approved", so the
 *    screen has to still know who was on it.
 *
 * The roster only ever grows. Membership lives in a ref so the effect depends on
 * `people` alone — putting the roster in its own dependency list is how this
 * kind of accumulator turns into a render loop.
 */
function useSessionRoster(open: boolean, people: Pending[]) {
  const knownRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const [ids, setIds] = useState<string[]>([]);
  // Arrived after the session started — these get the "ใหม่" chip.
  const [arrived, setArrived] = useState<string[]>([]);

  useEffect(() => {
    if (open) return;
    // Reset on close so the next session starts clean and nobody inherits a
    // stale "new" badge.
    knownRef.current = new Set();
    seededRef.current = false;
    setIds([]);
    setArrived([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const incoming = people.map(p => p.user_id);

    // First data after opening is the baseline, not an arrival: the people
    // already waiting are what the officer came here to review.
    if (!seededRef.current) {
      seededRef.current = true;
      knownRef.current = new Set(incoming);
      setIds(incoming);
      return;
    }

    const fresh = incoming.filter(id => !knownRef.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach(id => knownRef.current.add(id));
    setIds(prev => [...prev, ...fresh]);
    setArrived(prev => [...prev, ...fresh]);
  }, [open, people]);

  return { ids, arrived };
}

export function ReviewWorkspace({
  open,
  people,
  initialUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  /** Everyone in the current bucket — becomes the left rail. */
  people: Pending[];
  initialUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(initialUserId);
  const [sort, setSort] = useState<SortMode>("status");

  // Poll while the workspace is open so a TA who submits mid-review shows up on
  // their own — "ก็จะได้ไม่ต้องรีหน้าใหม่". Same SWR keys the page uses, so this
  // shares one cache and one request with it rather than doubling them; the
  // shortest refreshInterval registered for a key is the one SWR honours.
  const poll = { refreshInterval: open ? 20_000 : 0 };
  const { data: livePending } = useSWR<Pending[]>("/ta-review?status=pending", poll);
  const { data: liveApproved } = useSWR<Pending[]>("/ta-review?status=approved", poll);

  // `people` is the pending bucket, so approving somebody removes them from it.
  // The rail must not lose them: the officer needs to see what they just decided,
  // and the download button's gate is "did anyone ON THIS SCREEN get approved".
  // So the workspace keeps its own roster for the life of the session — seeded
  // when it opens, extended when someone new arrives, never shrunk.
  const roster = useSessionRoster(open, livePending ?? people);

  // Resolve each roster entry against whichever bucket now holds it. Approved
  // people come from the approved fetch; everyone else from pending.
  const byId = useMemo(() => {
    const m = new Map<string, Pending>();
    for (const p of [...(livePending ?? people), ...(liveApproved ?? [])]) {
      m.set(p.user_id, p);
    }
    return m;
  }, [livePending, liveApproved, people]);

  const rosterPeople = useMemo(
    () => roster.ids.map(id => byId.get(id)).filter((p): p is Pending => !!p),
    [roster.ids, byId],
  );

  // Approved during THIS session — the gate for the bulk download. Historical
  // approvals are deliberately not counted: those were handed off already, and
  // they say nothing about whether the officer has anything new to download.
  const approvedHere = useMemo(
    () => rosterPeople.filter(p => p.status === "approved"),
    [rosterPeople],
  );

  // Follow the row the officer clicked. The roster keeps approved people around,
  // so this no longer jumps away the moment somebody is approved.
  useEffect(() => {
    if (open) setSelected(initialUserId);
  }, [open, initialUserId]);
  useEffect(() => {
    if (!open || rosterPeople.length === 0) return;
    if (!selected || !rosterPeople.some(p => p.user_id === selected)) {
      setSelected(rosterPeople[0].user_id);
    }
  }, [open, rosterPeople, selected]);

  const ordered = useMemo(() => {
    const copy = [...rosterPeople];
    if (sort === "name") {
      copy.sort((a, b) => a.full_name.localeCompare(b.full_name, "th"));
    } else {
      const rank = (s: string) => (s === "submitted" ? 0 : s === "needs_fix" ? 1 : 2);
      copy.sort(
        (a, b) =>
          rank(a.status) - rank(b.status) ||
          a.full_name.localeCompare(b.full_name, "th"),
      );
    }
    return copy;
  }, [rosterPeople, sort]);

  const current = rosterPeople.find(p => p.user_id === selected) ?? null;

  return (
    <HModal>
      <HModal.Backdrop isOpen={open} onOpenChange={o => { if (!o) onClose(); }}>
        <HModal.Container size="full" scroll="inside">
          <HModal.Dialog aria-label={t("ตรวจสอบแบบฟอร์มใบแจ้งหนี้")}>
            <div className="flex h-full min-h-0 flex-col">
              <WorkspaceHeader
                current={current}
                approvedHere={approvedHere}
                onClose={onClose}
                onChanged={onChanged}
              />
              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <SubmitterRail
                  people={ordered}
                  arrivedIds={roster.arrived}
                  selected={selected}
                  sort={sort}
                  onSort={setSort}
                  onSelect={setSelected}
                />
                <div className="min-w-0 flex-1 overflow-y-auto bg-surface-secondary">
                  {current ? (
                    <PersonPane
                      key={current.user_id}
                      person={current}
                      onChanged={onChanged}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      {t("ไม่มีรายการให้ตรวจ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </HModal.Dialog>
        </HModal.Container>
      </HModal.Backdrop>
    </HModal>
  );
}

function WorkspaceHeader({
  current, approvedHere, onClose, onChanged,
}: {
  current: Pending | null;
  /** The people on THIS screen who are now approved. Both the download gate and
      the contents of the download — not just a count, because the bundle has to
      be exactly these people. */
  approvedHere: Pending[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--hairline)] px-4 py-2.5">
      <span className="text-sm font-semibold">{t("ตรวจสอบแบบฟอร์มใบแจ้งหนี้")}</span>
      {current && <span className="hidden sm:inline-flex"><Chip tone="neutral">{current.full_name}</Chip></span>}
      <div className="ml-auto flex items-center gap-2">
        <DownloadAllButton approvedHere={approvedHere} />
        <SuppliersButton />
        <Tip content={t("ปิด")}><button
          type="button"
          onClick={onClose}
          aria-label={t("ปิด")}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          <X size={18} />
        </button></Tip>
      </div>
    </div>
  );
}

/** Left rail — every submitter, grouped by status, selected row highlighted. */
function SubmitterRail({
  people, arrivedIds, selected, sort, onSort, onSelect,
}: {
  people: Pending[];
  /** Submitted after this session opened — flagged so the officer notices
   *  without reloading the page. */
  arrivedIds: string[];
  selected: string | null;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const STATUS_LABEL: Record<string, string> = {
    submitted: t("รอตรวจ"),
    needs_fix: t("ส่งกลับให้แก้"),
    approved: t("อนุมัติแล้ว"),
    rejected: t("ไม่อนุมัติ"),
  };

  // Group headers only make sense when sorting by status.
  let lastStatus = "";

  return (
    <aside className="flex max-h-[35dvh] w-full shrink-0 flex-col border-b border-[var(--hairline)] md:max-h-none md:w-64 md:border-b-0 md:border-r lg:w-72">
      <div className="shrink-0 border-b border-[var(--hairline)] px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users size={16} /> {t("ผู้ส่งทั้งหมด")}
          <span className="ml-auto text-xs text-muted">{people.length}</span>
        </div>
        <div className="mt-2">
          <Select
            value={sort}
            onChange={e => onSort(e.target.value as SortMode)}
            aria-label={t("เรียงลำดับ")}
          >
            <option value="status">{t("เรียงตามสถานะ")}</option>
            <option value="name">{t("เรียงตามชื่อ")}</option>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {people.map(p => {
          const showHeader = sort === "status" && p.status !== lastStatus;
          lastStatus = p.status;
          const active = p.user_id === selected;
          return (
            <div key={p.user_id}>
              {showHeader && (
                <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {STATUS_LABEL[p.status] ?? p.status}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(p.user_id)}
                aria-current={active ? "true" : undefined}
                className={
                  "flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors " +
                  (active
                    ? "border-accent-soft-foreground bg-accent-soft"
                    : "border-transparent hover:bg-surface-secondary")
                }
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-[11px] font-semibold">
                  {p.full_name.trim().charAt(0)}
                </span>
                <Tip content={`${p.full_name}\n${p.email}`}>
                <span tabIndex={-1} className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm">{p.full_name}</span>
                    {arrivedIds.includes(p.user_id) && (
                      <Chip tone="brand">{t("ใหม่!")}</Chip>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{p.email}</span>
                </span>
                </Tip>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** Main pane — the selected person's documents, all previewed inline. */
function PersonPane({ person, onChanged }: { person: Pending; onChanged: () => void }) {
  const { t } = useI18n();
  const key = `/ta-review/${person.user_id}/docs`;
  const { data, isLoading } = useSWR<DetailResp>(key);

  // Sorted to the print order (creditor form, ID, bank book) so the jump nav,
  // the stacked previews, and the exported/downloaded bundle all agree on the
  // same sequence — staff hand-collate the printout in this order.
  const docs = (data?.documents ?? []).filter(d => !d.superseded).sort(byPrintOrder);
  // A foreign TA's passport takes the citizen-ID copy's place (ta_required_doc_kinds).
  const REQUIRED_KINDS = requiredDocKinds(person.foreign ? "foreign" : "thai")
    .sort((a, b) => DOC_KIND_PRINT_ORDER.indexOf(a) - DOC_KIND_PRINT_ORDER.indexOf(b));
  const required = docs.filter(d => REQUIRED_KINDS.includes(d.kind));
  const approved = required.filter(d => d.status === "approved").length;

  return (
    <div className="p-5">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        {person.full_name}
        {person.foreign && (
          <Tip content={t("ตรวจเลข Passport และชื่อในแบบฟอร์มเจ้าหนี้กับสำเนา Passport")}>
            <span className="inline-flex"><Chip tone="info">{t("ต่างชาติ")}</Chip></span>
          </Tip>
        )}
      </h2>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{person.email}</span>
        <span>·</span>
        <span>
          {t.rich("อนุมัติแล้ว {done}/{total} ไฟล์", { done: data ? approved : <SkelValue className="h-3.5 w-4" />, total: REQUIRED_KINDS.length })}
        </span>
      </div>

      <p className="mt-2 text-xs italic text-muted">
        {t("เอกสารทุกหน้ามีลายน้ำระบุตัวเจ้าหน้าที่และเวลาที่เปิด")}
      </p>

      {/* Jumping between documents must not depend on the mouse wheel. Each
          preview is an embedded PDF viewer that swallows wheel events, so with
          three stacked viewers the pane underneath is effectively unreachable
          by scrolling over a document. These chips also double as an
          at-a-glance status of all three files. */}
      {docs.length > 1 && (
        <nav className="sticky top-0 z-10 -mx-5 mt-3 flex flex-wrap gap-2 border-b border-[var(--hairline)] bg-surface-secondary/95 px-5 py-2 backdrop-blur">
          {docs.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => document.getElementById(docAnchor(d.id))?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={
                "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                (d.status === "approved"
                  ? "border-success/40 bg-success-soft/40 text-success"
                  : d.status === "rejected"
                  ? "border-danger/40 bg-danger-soft/40 text-danger"
                  : "border-[var(--hairline)] bg-surface hover:bg-surface-secondary")
              }
            >
              {DOC_KIND_LABEL[d.kind] ? t(DOC_KIND_LABEL[d.kind]) : d.kind}
              {d.status === "approved" && " ✓"}
              {d.status === "rejected" && " ✕"}
            </button>
          ))}
        </nav>
      )}

      {isLoading ? (
        // Shaped like the DocPanel stack below: a header strip over a tall
        // preview area, one per required document.
        <SkelRegion label={t("กำลังโหลดเอกสาร")} className="mt-4 space-y-4">
          {REQUIRED_KINDS.map(k => (
            <div key={k} className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-surface">
              <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
                <Skel className="h-4 w-32" />
                <Skel className="h-3 w-40" />
              </div>
              <Skel className="h-[62vh] w-full rounded-none" />
            </div>
          ))}
        </SkelRegion>
      ) : docs.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          {t("ยังไม่มีเอกสารที่ส่งเข้ามา")}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {docs.map(d => (
            <DocPanel
              key={d.id}
              userId={person.user_id}
              doc={d}
              onChanged={() => { void mutate(key); onChanged(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One document: inline preview plus its own approve / reject controls. */
function DocPanel({
  userId, doc, onChanged,
}: {
  userId: string;
  doc: Doc;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState<string>(REJECT_PRESETS[0]);
  const [other, setOther] = useState("");

  const reason = preset === OTHER_PRESET ? other.trim() : preset;
  const decided = doc.status === "approved" || doc.status === "rejected";
  const deleted = !!doc.file_deleted_at;
  const url = apiUrl(`/ta-review/${userId}/docs/${doc.id}/preview`);
  const ext = (doc.filename.split(".").pop() ?? "").toLowerCase();
  const isImage = ext === "jpg" || ext === "jpeg" || ext === "png";

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/ta-review/docs/${doc.id}`, { approve: true, reason: "" });
      notify.success(t("อนุมัติเอกสารแล้ว"));
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (busy || reason.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/ta-review/${userId}/reject-batch`, {
        items: [{ doc_id: doc.id, reason }],
      });
      notify.success(t("ตีกลับเอกสารเรียบร้อยแล้ว"));
      setRejecting(false);
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id={docAnchor(doc.id)}
      className="scroll-mt-14 overflow-hidden rounded-xl border border-[var(--hairline)] bg-surface"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
        <FileText size={15} className="text-muted" />
        <span className="text-sm font-medium">
          {DOC_KIND_LABEL[doc.kind] ? t(DOC_KIND_LABEL[doc.kind]) : doc.kind}
        </span>
        <Tip content={doc.filename}>
          <span className="truncate text-xs text-muted">{doc.filename}</span>
        </Tip>
        {doc.status === "approved" && <Chip tone="success">{t("อนุมัติแล้ว")}</Chip>}
        {doc.status === "rejected" && <Chip tone="danger">{t("ตีกลับแล้ว")}</Chip>}

        {!decided && !deleted && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={busy}
              onPress={() => setRejecting(v => !v)}
            >
              <X size={14} /> {t("ตีกลับ")}
            </Button>
            <Button size="sm" isDisabled={busy} onPress={approve}>
              <Check size={14} /> {t("อนุมัติ")}
            </Button>
          </div>
        )}
      </header>

      {doc.status === "rejected" && doc.reject_reason && (
        <div className="border-b border-[var(--hairline)] bg-danger-soft/30 px-4 py-2 text-xs text-danger">
          {t("เหตุผล: {reason}", { reason: doc.reject_reason })}
        </div>
      )}

      {rejecting && !decided && (
        <div className="space-y-2 border-b border-[var(--hairline)] bg-danger-soft/20 px-4 py-3">
          <FieldGroup label={t("เหตุผลที่ตีกลับ")}>
            <Select value={preset} onChange={e => setPreset(e.target.value)}>
              {REJECT_PRESETS.map(r => <option key={r} value={r}>{t(r)}</option>)}
            </Select>
          </FieldGroup>
          {preset === OTHER_PRESET && (
            <TextArea
              value={other}
              onChange={e => setOther(e.target.value)}
              rows={2}
              placeholder={t("ระบุเหตุผล เพื่อให้ TA รู้ว่าต้องแก้อะไร")}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="tertiary" size="sm" onPress={() => setRejecting(false)}>
              {t("ยกเลิก")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              isDisabled={busy || reason.length === 0}
              onPress={reject}
            >
              {t("ยืนยันตีกลับ")}
            </Button>
          </div>
        </div>
      )}

      {/* Rendered immediately — the officer should never have to click to see
          the document they are being asked to judge. */}
      <div className="flex min-h-[62vh] items-center justify-center bg-slate-50">
        {deleted ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted">
            <AlertTriangle size={16} /> {t("ไฟล์ถูกลบตามนโยบายเก็บรักษา 7 วันแล้ว")}
          </div>
        ) : isImage ? (
          // Images keep the capped height: object-contain already fits the
          // whole picture in view, so there is nothing to scroll past, and a
          // photo of an ID card is not A4-shaped.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={doc.filename} className="max-h-[62vh] max-w-full object-contain" />
        ) : (
          <PdfFrame src={url} title={doc.filename} />
        )}
      </div>
    </section>
  );
}

/**
 * Bulk download: every approved TA's approved documents, merged into one file.
 *
 * This used to be "อนุมัติและดาวน์โหลดเอกสารทั้งหมด" and did both jobs for one
 * person. Approving is no longer a separate click — approving the third required
 * document finalises the profile (see finalizeProfileIfComplete in the backend),
 * because a TA whose three documents all passed and who was nonetheless "not
 * approved" was a state that meant nothing. So this button is only the download
 * now, and its scope is everyone: what the finance office wants is one book, not
 * one file per person.
 *
 * The set is fixed when the token is minted, so the file matches what was
 * approved at that moment — somebody approved a minute later is simply not in it.
 */
// downloadAllReason explains why the button is enabled or locked. TipWrap is the
// carrier, on the wrapper rather than the button, because a disabled button emits
// no hover events of its own — the same arrangement LockedActionButton uses.
function downloadAllReason(approvedCount: number, t: TFn): string {
  return approvedCount === 0
    ? t("ยังไม่มีใครในรายชื่อนี้ที่อนุมัติเอกสารครบทุกไฟล์ ต้องอนุมัติอย่างน้อย 1 คนก่อน")
    : t("อนุมัติแล้ว {n} คนในรอบนี้", { n: approvedCount });
}

function DownloadAllButton({ approvedHere }: { approvedHere: Pending[] }) {
  // From THIS session's roster, not from the approved bucket. The bucket is
  // history — people handed off weeks ago — and using it meant the button was
  // live before the officer had approved anything, stayed live in a session where
  // they approved nobody, AND produced a file containing TAs who were never on
  // the screen. The same list now gates the button and defines the contents.
  const { t } = useI18n();
  const approvedCount = approvedHere.length;

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy || !password) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ zip_token: string; ta_count: number }>(
        "/ta-review/download-all-token",
        { password, user_ids: approvedHere.map(p => p.user_id) },
      );
      window.location.assign(
        apiUrl(`/ta-review/download-all.zip?token=${encodeURIComponent(res.zip_token)}`),
      );
      notify.success(t("กำลังดาวน์โหลดเอกสารของ {n} คน…", { n: res.ta_count }));
      setConfirming(false);
    } catch (e) {
      // Inline, not a toast: focus is in the password field, and a toast at the
      // top of a full-screen modal is easy to miss.
      setErr(e instanceof Error ? e.message : t("ดาวน์โหลดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Locked until at least one TA has all three documents approved —
          otherwise the click can only ever produce the server's "nothing to
          download" error, and a button whose only outcome is an error should
          not be pressable. The tooltip carries the reason, because a disabled
          button with no explanation is the same dead end. */}
      <TipWrap content={downloadAllReason(approvedCount, t)} className="inline-flex">
        <Button
          size="sm"
          isDisabled={approvedCount === 0}
          onPress={() => { setPassword(""); setErr(null); setConfirming(true); }}
        >
          <Download size={14} /> {t("ดาวน์โหลดเอกสารทั้งหมด")}
        </Button>
      </TipWrap>

      <Modal
        open={confirming}
        onClose={() => { if (!busy) setConfirming(false); }}
        title={t("ดาวน์โหลดเอกสารทั้งหมด")}
        icon={<Download size={18} />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onPress={() => setConfirming(false)} isDisabled={busy}>
              {t("ยกเลิก")}
            </Button>
            <Button onPress={submit} isDisabled={busy || !password} isPending={busy}>
              <Download size={14} /> {t("ยืนยันและดาวน์โหลด")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Name them. t("ทุกคนที่อนุมัติแล้ว") was ambiguous enough to hide a bug —
              the file was including people approved weeks earlier who were never
              on this screen, and nothing here would have shown that. A list the
              officer can check against the rail makes the contents verifiable
              before the download rather than after. */}
          <div>
            <p className="text-sm text-muted">
              {t.rich("ระบบจะรวมเอกสารของ {people} เป็น PDF เล่มเดียว เรียงตามรหัสนักศึกษา", {
                people: <b className="text-foreground">{t("{n} คนที่คุณอนุมัติในรอบนี้", { n: approvedCount })}</b>,
              })}
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--hairline)] divide-y divide-[var(--hairline)]">
              {approvedHere.map(p => (
                <li key={p.user_id} className="px-3 py-1.5 text-sm">
                  {p.full_name}
                  <span className="ml-2 text-xs text-muted">{p.email}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{t("ไฟล์จะถูกลบอัตโนมัติภายใน 7 วัน")}</p>
                <p className="text-xs text-muted">
                  {t("ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล กรุณาบันทึกไฟล์เก็บไว้ในระบบของหน่วยงาน ก่อนถึงกำหนด")}
                </p>
              </div>
            </div>
          </div>

          <TextField
            name="officer-password-all"
            isRequired
            value={password}
            onChange={v => { setPassword(v); if (err) setErr(null); }}
            isInvalid={!!err}
          >
            <Label>{t("รหัสผ่านของคุณ")}</Label>
            <InputGroup>
              <InputGroup.Input type="password" autoComplete="current-password" autoFocus />
            </InputGroup>
            {err && <FieldError>{err}</FieldError>}
          </TextField>
          <p className="text-xs text-muted">
            {t("ไฟล์นี้รวมข้อมูลส่วนบุคคลของหลายคนไว้ด้วยกัน จึงต้องยืนยันรหัสผ่านทุกครั้ง และระบบบันทึกไว้ว่าใครดาวน์โหลด และมีใครอยู่ในไฟล์")}
          </p>
        </div>
      </Modal>
    </>
  );
}
