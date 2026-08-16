"use client";
import { useState } from "react";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import {
  errMessage, reviewDeletionRequest,
  type Me, type DataDeletionRequestForReview,
} from "../../lib/api";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, Alert, Chip, StatusChip, TextArea, Modal } from "../../components/ui";

/**
 * Admin-only review queue for PDPA erasure requests — see
 * internal/service/data_deletion.go's ReviewDeletion. Gated server-side
 * (RequireRole(rbac.RoleAdmin)); this page just avoids showing a confused
 * staff member a raw 403 by checking the role client-side first, same as
 * staff/users/page.tsx's canReset2FA/canUnlock pattern.
 */
export default function DataDeletionRequestsPage() {
  const { data: me } = useSWR<Me>("/me");
  const isAdmin = (me?.roles ?? []).includes("admin");
  const [status, setStatus] = useState("pending");
  const { data, error, mutate: revalidate } = useSWR<DataDeletionRequestForReview[]>(
    isAdmin ? `/staff/data-deletion-requests?status=${status}` : null);
  const [reviewing, setReviewing] = useState<DataDeletionRequestForReview | null>(null);

  if (me && !isAdmin) {
    return (
      <div>
        <PageHeader title="คำขอลบข้อมูล (PDPA)" />
        <Alert status="warning" title="เฉพาะผู้ดูแลระบบเท่านั้น" description="หน้านี้เข้าถึงได้เฉพาะบัญชีผู้ดูแลระบบ (admin)" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="คำขอลบข้อมูล (PDPA)"
        description="พิจารณาคำขอให้ลบข้อมูลส่วนบุคคลจาก TA — อนุมัติจะปิดใช้งานบัญชีและลบข้อมูลที่ไม่จำเป็นทันที ส่วนข้อมูลที่มีผลทางการเงินจะยังคงถูกเก็บไว้หากมีประวัติเบิกจ่าย"
      />

      <div className="flex gap-2 mb-4">
        {(["pending", "approved", "rejected"] as const).map(s => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {{ pending: "รอตรวจ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธแล้ว" }[s]}
          </FilterChip>
        ))}
      </div>

      {error && <Alert status="danger" title="โหลดข้อมูลไม่สำเร็จ" description={errMessage(error)} />}

      <Panel title={`รายการ (${data?.length ?? 0})`}>
        {!data ? (
          <div className="text-sm text-muted">กำลังโหลด…</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted">ไม่มีคำขอในสถานะนี้</div>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--hairline)] -my-1">
            {data.map(r => (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{r.requester_name}</div>
                  <div className="text-xs text-muted">{r.requester_email}</div>
                  {r.reason && <div className="text-xs text-muted mt-1">เหตุผล: {r.reason}</div>}
                  <div className="text-xs text-muted mt-1">
                    ส่งคำขอเมื่อ {new Date(r.requested_at).toLocaleString("th-TH")}
                  </div>
                  {r.review_note && (
                    <div className="text-xs text-muted mt-1">หมายเหตุการพิจารณา: {r.review_note}</div>
                  )}
                </div>
                <Chip tone={r.has_payment_history ? "warn" : "neutral"}>
                  {r.has_payment_history ? "มีประวัติจ่ายเงินแล้ว" : "ไม่มีประวัติจ่ายเงิน"}
                </Chip>
                <StatusChip status={r.status} />
                {r.status === "pending" && (
                  <Button variant="secondary" size="sm" onClick={() => setReviewing(r)}>
                    พิจารณา
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {reviewing && (
        <ReviewModal
          req={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); revalidate(); }}
        />
      )}
    </div>
  );
}

function ReviewModal({
  req, onClose, onDone,
}: { req: DataDeletionRequestForReview; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function decide(approve: boolean) {
    if (!approve && !note.trim()) {
      notify.error("กรุณาระบุเหตุผลที่ปฏิเสธคำขอ");
      return;
    }
    setBusy(approve ? "approve" : "reject");
    try {
      await reviewDeletionRequest(req.id, approve, note);
      notify.success(approve ? "อนุมัติคำขอแล้ว" : "ปฏิเสธคำขอแล้ว");
      onDone();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="พิจารณาคำขอลบข้อมูล" size="md">
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted">{req.requester_name} ({req.requester_email})</div>

        <Alert
          status={req.has_payment_history ? "warning" : "default"}
          title={req.has_payment_history ? "มีประวัติจ่ายเงินแล้ว — จะลบบางส่วน" : "ไม่มีประวัติจ่ายเงิน — จะลบข้อมูลทั้งหมดที่ทำได้"}
          description={
            req.has_payment_history
              ? "หากอนุมัติ: ปิดใช้งานบัญชี ลบ 2FA/รูปโปรไฟล์/เซสชัน/เอกสารที่อัปโหลด — เลขบัตรประชาชนและประวัติชั่วโมงสอนยังคงถูกเก็บไว้ตามข้อบังคับทางบัญชี/ภาษี"
              : "หากอนุมัติ: ปิดใช้งานบัญชี ลบ 2FA/รูปโปรไฟล์/เซสชัน/เอกสารที่อัปโหลด รวมถึงเลขบัตรประชาชนที่จัดเก็บไว้"
          }
        />

        <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (บังคับหากปฏิเสธ)" rows={3} />

        <div className="flex gap-2">
          <Button variant="primary" onClick={() => decide(true)} disabled={!!busy} isPending={busy === "approve"}>
            <Check size={14} /> อนุมัติ
          </Button>
          <Button variant="danger" onClick={() => decide(false)} disabled={!!busy} isPending={busy === "reject"}>
            <X size={14} /> ปฏิเสธ
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>
            ยกเลิก
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip cursor-pointer transition ${active ? "chip-brand" : "chip-neutral"}`}
    >
      {children}
    </button>
  );
}
