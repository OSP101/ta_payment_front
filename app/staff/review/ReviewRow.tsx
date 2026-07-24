"use client";
import useSWR from "swr";
import { useState } from "react";
import {
  Check, X, Eye, FileText, Clock3, Trash2, ChevronDown, ShieldCheck, RefreshCw,
} from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { Button, StatusChip, Spinner, Panel, Chip, Select, TextArea, FieldGroup } from "../../components/ui";
import type { Pending, Doc, Profile } from "./types";
import { DOC_KIND_LABEL, REJECT_PRESETS, OTHER_PRESET, fmtDate, daysUntil } from "./types";

interface DetailResp {
  documents: Doc[] | null;
  profile?: Profile | null;
}

const REQUIRED_KINDS = ["national_id", "bank_book", "creditor_form"];

// Short labels for the collapsed-header per-file status pills — the full
// DOC_KIND_LABEL names are too long to line up three across the row.
const DOC_SHORT_LABEL: Record<string, string> = {
  national_id:   "บัตร ปชช.",
  bank_book:     "สมุดบัญชี",
  creditor_form: "ฟอร์มเจ้าหนี้",
};

/** Traffic-light status of each required file, shown in the collapsed header so
 * the officer knows which document still needs a look without expanding:
 * เขียว = ผ่าน, เหลือง = รอตรวจ, แดง = ตีกลับ, เทา = ยังไม่ส่ง. */
function FileStatusPills({ docs }: { docs: Doc[] }) {
  const current = docs.filter(d => !d.superseded);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REQUIRED_KINDS.map(kind => {
        const status = current.find(d => d.kind === kind)?.status ?? "missing";
        const label = DOC_SHORT_LABEL[kind] ?? kind;
        if (status === "approved")
          return <Chip key={kind} tone="success"><Check size={12} /> {label}</Chip>;
        if (status === "rejected")
          return <Chip key={kind} tone="danger"><X size={12} /> {label}</Chip>;
        if (status === "missing")
          return <Chip key={kind} tone="neutral"><FileText size={12} /> {label}: ยังไม่ส่ง</Chip>;
        return <Chip key={kind} tone="warn"><Clock3 size={12} /> {label}</Chip>;
      })}
    </div>
  );
}

/** One collapsible card per TA. Collapsed by default so the list stays short;
 * expand to see the profile grid + each document with its own
 * approve / reject / view controls (no bulk approve).
 */
export function ReviewRow({
  user,
  onPreview,
  onChanged,
}: {
  user: Pending;
  onPreview: (doc: Doc) => void;
  onChanged: () => void;
}) {
  const { data, mutate, isLoading } = useSWR<DetailResp>(
    `/ta-review/${user.user_id}/docs`,
  );
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const docs = data?.documents ?? [];
  const profile = data?.profile ?? null;
  const canFinalize =
    profile?.status === "submitted" || profile?.status === "needs_fix";

  // Per-file progress — how many of the required docs are approved.
  const requiredDocs = docs.filter(d => REQUIRED_KINDS.includes(d.kind));
  const approvedCount = requiredDocs.filter(d => d.status === "approved").length;
  const allApproved = approvedCount >= REQUIRED_KINDS.length;
  const isResubmission = (profile?.current_round ?? 1) > 1;

  async function approveDoc(docId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/ta-review/docs/${docId}`, { approve: true, reason: "" });
      notify.success("อนุมัติเอกสารแล้ว");
      await mutate();
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  // Reject a single file via reject-batch so the profile flips to needs_fix and
  // the TA sees the reason + re-uploads only this file.
  async function rejectDoc(docId: string, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/ta-review/${user.user_id}/reject-batch`, {
        items: [{ doc_id: docId, reason }],
      });
      notify.success("ตีกลับเอกสารเรียบร้อยแล้ว");
      await mutate();
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  // Finalize = approve the whole profile + generate the officer's ZIP. Enabled
  // only once every required file has been individually approved, so this is a
  // confirmation step, not a bulk approve.
  async function finalize() {
    if (busy || !allApproved) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; zip_token?: string }>(
        `/ta-review/${user.user_id}/approve-all`,
        {},
      );
      if (res.zip_token) {
        window.location.assign(
          `/api/v1/ta-review/${user.user_id}/download.zip?token=${encodeURIComponent(res.zip_token)}`,
        );
      }
      notify.success("อนุมัติผู้ใช้นี้เรียบร้อย กำลังดาวน์โหลดไฟล์…");
      await mutate();
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel padded={false} className="mb-3">
      {/* Header — always visible, click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-(--surface-2) transition rounded-t-lg"
      >
        <ChevronDown size={18} className={`shrink-0 text-muted transition ${expanded ? "" : "-rotate-90"}`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground truncate">{user.full_name}</div>
          <div className="text-xs text-muted truncate">{user.email}</div>
        </div>
        {isResubmission && (
          <Chip tone="warn">
            <RefreshCw size={12} /> ส่งแก้ไขใหม่ (รอบ {profile?.current_round})
          </Chip>
        )}
        {/* Per-file status so the officer sees which document is still pending
            without expanding the card. Falls back to a plain count while the
            detail (docs) is still loading. */}
        {isLoading ? (
          <Chip tone="neutral">ผ่านแล้ว {approvedCount}/{REQUIRED_KINDS.length} ไฟล์</Chip>
        ) : (
          <FileStatusPills docs={docs} />
        )}
        <StatusChip status={user.status} />
        {user.submitted_at && (
          <div className="text-xs text-muted whitespace-nowrap">ส่ง: {fmtDate(user.submitted_at)}</div>
        )}
      </button>

      {expanded && (
        isLoading ? (
          <div className="p-6 flex justify-center border-t border-(--hairline)"><Spinner /></div>
        ) : (
          <div className="p-4 space-y-4 border-t border-(--hairline)">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
                เอกสารที่แนบ — ตรวจและตัดสินทีละไฟล์
              </div>
              {docs.length === 0 ? (
                <div className="text-sm text-muted">ยังไม่มีเอกสาร</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {docs.map(d => (
                    <FileCard
                      key={d.id}
                      doc={d}
                      busy={busy}
                      onPreview={() => onPreview(d)}
                      onApprove={() => approveDoc(d.id)}
                      onReject={reason => rejectDoc(d.id, reason)}
                    />
                  ))}
                </div>
              )}
            </div>

            {profile?.reject_reason && profile.status !== "approved" && (
              <div className="rounded-lg border border-danger/40 bg-danger-soft/60 px-4 py-3 text-sm">
                <div className="font-medium text-danger-soft-foreground mb-1">
                  เหตุผลปฏิเสธล่าสุด
                </div>
                <div className="text-foreground whitespace-pre-wrap">
                  {profile.reject_reason}
                </div>
              </div>
            )}

            {canFinalize && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-muted">
                  {allApproved
                    ? "ทุกไฟล์ผ่านแล้ว — กดยืนยันเพื่ออนุมัติผู้ใช้นี้และออกไฟล์ ZIP"
                    : `อนุมัติครบทุกไฟล์ก่อน (${approvedCount}/${REQUIRED_KINDS.length}) จึงจะยืนยันได้`}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={finalize}
                  disabled={busy || !allApproved}
                  isPending={busy}
                >
                  <ShieldCheck size={14} /> ยืนยันอนุมัติผู้ใช้นี้
                </Button>
              </div>
            )}
          </div>
        )
      )}
    </Panel>
  );
}

function FileCard({
  doc, busy, onPreview, onApprove, onReject,
}: {
  doc: Doc;
  busy?: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const kindLabel = DOC_KIND_LABEL[doc.kind] ?? doc.kind;
  const deleted = !!doc.file_deleted_at;
  const daysLeft = doc.expires_at ? daysUntil(doc.expires_at) : null;
  const decided = doc.status === "approved" || doc.status === "rejected";

  // Inline reject-reason picker state (no popup — expands within the card).
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState(REJECT_PRESETS[0]);
  const [other, setOther] = useState("");
  const reason = preset === OTHER_PRESET ? other.trim() : preset;
  const canSubmitReject = reason.length > 0;

  function submitReject() {
    if (!canSubmitReject || busy) return;
    onReject(reason);
    setRejecting(false);
    setPreset(REJECT_PRESETS[0]);
    setOther("");
  }

  return (
    <div className={`border rounded-lg p-3 flex flex-col gap-2
      ${deleted ? "bg-slate-50 border-(--hairline) opacity-70" : "border-(--hairline)"}`}>
      <div className="flex items-start gap-2">
        <FileText size={16} className="text-muted shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{kindLabel}</div>
          <div className="text-xs text-muted truncate">{doc.filename}</div>
        </div>
        <StatusChip status={doc.status} />
      </div>

      {doc.status === "rejected" && doc.reject_reason && (
        <div className="text-xs text-danger-soft-foreground">
          เหตุผล: {doc.reject_reason}
        </div>
      )}
      {daysLeft !== null && daysLeft >= 0 && !deleted && doc.status === "approved" && (
        <div className="text-xs text-muted inline-flex items-center gap-1">
          <Clock3 size={12} /> จะถูกลบใน {daysLeft} วัน
        </div>
      )}
      {deleted && (
        <div className="text-xs text-muted inline-flex items-center gap-1">
          <Trash2 size={12} /> ถูกลบตามนโยบายเก็บรักษา 7 วัน
        </div>
      )}

      {/* Inline reject-reason picker */}
      {rejecting && (
        <div className="rounded-md border border-danger/40 bg-danger-soft/40 p-2 space-y-2">
          <FieldGroup label="เหตุผลที่ตีกลับ">
            <Select value={preset} onChange={e => setPreset(e.target.value)}>
              {REJECT_PRESETS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </FieldGroup>
          {preset === OTHER_PRESET && (
            <TextArea
              rows={2}
              value={other}
              onChange={e => setOther(e.target.value)}
              placeholder="ระบุเหตุผลให้ TA แก้ไข…"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={submitReject}
              disabled={!canSubmitReject || busy}
              isPending={busy}
            >
              ส่งการตีกลับ
            </Button>
          </div>
        </div>
      )}

      {!rejecting && (
        <div className="mt-auto flex flex-wrap justify-end gap-1.5 pt-1">
          <Button variant="secondary" size="sm" onClick={onPreview} disabled={deleted}>
            <Eye size={14} /> ดู
          </Button>
          {!decided && (
            <>
              <Button
                variant="danger-soft"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={busy || deleted}
              >
                <X size={14} /> ไม่อนุมัติ
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onApprove}
                disabled={busy || deleted}
                isPending={busy}
              >
                <Check size={14} /> อนุมัติ
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
