"use client";
import useSWR from "swr";
import { useState } from "react";
import { Check, Eye, FileText, Clock3, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { Button, StatusChip, Spinner, Panel } from "../../components/ui";
import { RejectPopover, type DocForReject } from "./RejectPopover";
import type { Pending, Doc, Profile } from "./types";
import { DOC_KIND_LABEL, fmtDate, daysUntil } from "./types";

interface DetailResp {
  documents: Doc[] | null;
  profile?: Profile | null;
}

/** One always-expanded card per TA. Shows profile grid + 3 file cards +
 * approve/reject controls all at once so the officer doesn't have to click
 * through a modal to see what they're deciding on.
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

  const docs = data?.documents ?? [];
  const profile = data?.profile ?? null;
  const canFinalize =
    profile?.status === "submitted" || profile?.status === "needs_fix";

  async function approveAll() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; zip_token?: string }>(
        `/ta-review/${user.user_id}/approve-all`,
        {},
      );
      if (res.zip_token) {
        // Same-tab navigation: browser sees Content-Disposition: attachment
        // and downloads without leaving the page. Avoids popup-blocker
        // pitfalls that dog window.open flows.
        window.location.assign(
          `/api/v1/ta-review/${user.user_id}/download.zip?token=${encodeURIComponent(res.zip_token)}`,
        );
      }
      notify.success("อนุมัติเรียบร้อย กำลังดาวน์โหลดไฟล์…");
      await mutate();
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function rejectBatch(items: { doc_id: string; reason: string }[]) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/ta-review/${user.user_id}/reject-batch`, { items });
      notify.success("ตีกลับเอกสารเรียบร้อยแล้ว");
      await mutate();
      onChanged();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  const rejectTargets: DocForReject[] = docs
    .filter(d => ["national_id", "bank_book", "creditor_form"].includes(d.kind))
    .map(d => ({ id: d.id, kind: d.kind, status: d.status }));

  return (
    <Panel padded={false} className="mb-3">
      <div className="p-4 border-b border-[var(--hairline)] flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground truncate">{user.full_name}</div>
          <div className="text-xs text-muted truncate">{user.email}</div>
        </div>
        <StatusChip status={user.status} />
        {user.submitted_at && (
          <div className="text-xs text-muted">ส่ง: {fmtDate(user.submitted_at)}</div>
        )}
        {canFinalize && (
          <div className="flex gap-2">
            <RejectPopover
              docs={rejectTargets}
              busy={busy}
              onSubmit={rejectBatch}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={approveAll}
              disabled={busy || docs.length < 3}
              isPending={busy}
            >
              <Check size={14} /> อนุมัติทั้งชุด
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-6 flex justify-center"><Spinner /></div>
      ) : (
        <div className="p-4 space-y-4">
          {profile && <ProfileGrid profile={profile} />}

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
              เอกสารที่แนบ
            </div>
            {docs.length === 0 ? (
              <div className="text-sm text-muted">ยังไม่มีเอกสาร</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {docs.map(d => (
                  <FileCard key={d.id} doc={d} onPreview={() => onPreview(d)} />
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
        </div>
      )}
    </Panel>
  );
}

function ProfileGrid({ profile }: { profile: Profile }) {
  const cells: [string, string | undefined][] = [
    ["คำนำหน้า",       profile.prefix],
    ["เลขบัตรประชาชน", profile.national_id],
    ["ธนาคาร",         profile.bank_name],
    ["เลขที่บัญชี",     profile.account_no],
    ["ชื่อบัญชี",       profile.account_name],
  ];
  const filled = cells.filter(([, v]) => v && v.length > 0);
  if (filled.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
        ข้อมูลบัญชี
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2 text-sm">
        {filled.map(([k, v]) => (
          <div key={k} className="flex flex-col min-w-0">
            <span className="text-xs text-muted">{k}</span>
            <span className="text-foreground tabular-nums truncate">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileCard({ doc, onPreview }: { doc: Doc; onPreview: () => void }) {
  const kindLabel = DOC_KIND_LABEL[doc.kind] ?? doc.kind;
  const deleted = !!doc.file_deleted_at;
  const daysLeft = doc.expires_at ? daysUntil(doc.expires_at) : null;
  return (
    <div className={`border rounded-lg p-3 flex flex-col gap-2
      ${deleted ? "bg-slate-50 border-[var(--hairline)] opacity-70" : "border-[var(--hairline)]"}`}>
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

      <div className="mt-auto flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
          disabled={deleted}
        >
          <Eye size={14} /> ดู
        </Button>
      </div>
    </div>
  );
}
