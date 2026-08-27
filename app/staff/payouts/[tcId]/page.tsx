"use client";
import { use, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { ArrowLeft, ClipboardEdit, Download, History } from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import { PageHeader, Panel, Button, Modal } from "../../../components/ui";
import { StaffWorklogEditor } from "../../../components/StaffWorklogEditor";
import { ExportPreviewBody } from "../../../components/ExportPreviewBody";
import { useTerm } from "../../TermContext";
import { ReviewGrid } from "./ReviewGrid";

/**
 * One course, top to bottom: check the months, then send the package.
 *
 * The previous workspace put review and export behind two tabs of two different
 * menus, so finishing a review left the officer on a screen with no way forward
 * — they had to remember that a separate export menu existed and find the course
 * there a second time. Here the export panel sits directly under the grid that
 * unlocks it: when the last cell turns green the button below is already live.
 *
 * Editing the raw worklog is the rare case (a staff correction on a TA's behalf)
 * and stays folded away rather than competing with the two normal ones.
 */

interface TC { id: string; code: string; name_th: string; exported_at?: string | null }

interface ExportBatch {
  id: string;
  ta_count: number;
  total_baht: number;
  generated_at: string;
  generated_by_name?: string;
  // file_name is what to save the re-download as. Empty only for a batch
  // whose file failed to persist at generation time (or predates file
  // retention) — see ExportHandler.BatchDownload's "no file" response.
  file_name?: string;
}

export default function CoursePayoutWorkspace({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { termId } = useTerm();
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const [showEditor, setShowEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Every key the review/export/send-back flows can affect, so the page stays
  // consistent without a reload — including the list this page was opened from
  // and the sidebar badge, which are both derived from the same rows.
  const revalidateAll = () => {
    mutate(`/staff/courses/${tcId}/worklogs`);
    mutate(`/exports/course/${tcId}/preview`);
    mutate(`/teaching-courses/${tcId}`);
    mutate(`/teaching-courses/${tcId}/submission-timeline`);
    if (termId) {
      mutate(`/submission-periods/review-queue?term_id=${termId}`);
      mutate(`/exports/summary?term_id=${termId}`);
      mutate(`/teaching-courses?term_id=${termId}`);
      mutate(`/dashboard/executive?term_id=${termId}`);
    }
  };

  return (
    <div>
      <Link
        href="/staff/payouts"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-[var(--brand)]"
      >
        <ArrowLeft size={16} /> กลับไปรายการวิชา
      </Link>

      <PageHeader
        title={tc ? `${tc.code} — ${tc.name_th}` : "…"}
        description="ตรวจรายเดือนด้านบน แล้วส่งออกด้านล่าง"
      />

      <Panel
        data-tour="payout-grid"
        title="ตรวจรายเดือน"
        description="แต่ละช่องคือ TA หนึ่งคนในหนึ่งเดือน กดตัวเลขชั่วโมงเพื่อดูรายการรายวัน"
        className="mb-3"
      >
        <ReviewGrid tcId={tcId} onChanged={revalidateAll} />
      </Panel>

      <Panel data-tour="payout-export" className="mb-3">
        <ExportPreviewBody tcId={tcId} exportedAt={tc?.exported_at} onExported={revalidateAll} />
      </Panel>

      <div data-tour="payout-extras" className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onPress={() => setShowEditor(v => !v)}>
          <ClipboardEdit size={14} /> {showEditor ? "ซ่อนบันทึกเวลา" : "ดู/แก้ไขบันทึกเวลา"}
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setShowHistory(true)}>
          <History size={14} /> ประวัติการส่งออก
        </Button>
      </div>

      {showEditor && (
        <Panel padded={false} className="mt-2">
          <StaffWorklogEditor tcId={tcId} onDataChange={revalidateAll} />
        </Panel>
      )}

      {showHistory && <HistoryDialog tcId={tcId} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function HistoryDialog({ tcId, onClose }: { tcId: string; onClose: () => void }) {
  const { data } = useSWR<ExportBatch[]>(`/exports/course/${tcId}/history`);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Re-serves the exact ZIP that export produced (ExportHandler.BatchDownload)
  // — no re-export, so it does not re-lock anything already locked.
  async function download(b: ExportBatch) {
    setDownloading(b.id);
    try {
      const blob = await api.get<Blob>(`/exports/batch/${b.id}/download`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = b.file_name || "export.zip";
      el.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e, "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ประวัติการส่งออก"
      icon={<History size={20} />}
      size="xl"
      footer={<Button variant="ghost" onClick={onClose}>ปิด</Button>}
    >
      {!data ? (
        <p className="text-sm text-muted">กำลังโหลด…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">ยังไม่เคยส่งออกวิชานี้</p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto overflow-x-auto rounded-lg border border-border">
          <table className="data-table w-full text-sm">
            <thead className="sticky top-0 bg-surface-secondary text-ink-2">
              <tr>
                <th className="px-3 py-2 text-left">เวลา</th>
                <th className="px-3 py-2 text-left">ผู้ส่งออก</th>
                <th className="px-3 py-2 text-right">จำนวน TA</th>
                <th className="px-3 py-2 text-right">ยอดรวม</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map(b => (
                <tr key={b.id} className="border-t border-hairline">
                  <td className="px-3 py-2 tabular">{b.generated_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2">{b.generated_by_name}</td>
                  <td className="px-3 py-2 text-right tabular">{b.ta_count}</td>
                  <td className="px-3 py-2 text-right tabular">{b.total_baht.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {/* Whether a re-download actually succeeds depends on
                        server-side file retention (older rows may predate
                        it) — resolved by trying, with a clear error toast
                        on failure, rather than guessing client-side. */}
                    <button
                      type="button"
                      onClick={() => void download(b)}
                      disabled={downloading !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                    >
                      <Download size={12} />
                      {downloading === b.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลด"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
