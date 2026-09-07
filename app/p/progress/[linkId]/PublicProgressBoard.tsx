"use client";
import useSWR from "swr";
import { FileWarning } from "lucide-react";
import { EmptyState, Panel, Spinner } from "../../../components/ui";
import { ViewerRoundBoard, type TermProgress } from "../../../components/DocumentProgressBoard";
import { useState } from "react";
import { ApiError } from "../../../lib/api";

interface PublicOverview {
  term_id: string;
  term_label: string;
  rounds: TermProgress[];
}

const SEMESTER_LABELS: Record<string, string> = {
  "1": "ภาคต้น",
  "2": "ภาคปลาย",
  "3": "ภาคฤดูร้อน",
};

function termHeading(label: string): string {
  const [year, sem] = label.split("/");
  if (!year || !sem) return label;
  return `${SEMESTER_LABELS[sem] ?? `ภาคเรียนที่ ${sem}`} ปีการศึกษา ${year}`;
}

/**
 * The interactive body of the public share-link page. A client component
 * (not the server-rendered shell around it) because the reader wants live
 * status — a link posted at the start of the term should keep answering
 * correctly weeks later without anyone reloading a stale card — and because
 * a term with two fiscal rounds needs the same round tabs the in-system
 * pages use.
 *
 * Renders through the exact same read-only ViewerRoundBoard the TA/lecturer
 * screen uses, off the public (unauthenticated) endpoints instead of the
 * authenticated ones — same board, same wording, nothing here to click.
 */
export default function PublicProgressBoard({ linkId }: { linkId: string }) {
  const { data, error, isLoading } = useSWR<PublicOverview>(`/public/document-progress/${linkId}`, {
    refreshInterval: 60_000,
  });
  const [activeRound, setActiveRound] = useState(1);

  if (isLoading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted">
          <Spinner size="sm" /> กำลังโหลด…
        </div>
      </Panel>
    );
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Panel>
        <EmptyState
          icon={<FileWarning size={28} />}
          title={notFound ? "ไม่พบลิงก์นี้" : "โหลดข้อมูลไม่สำเร็จ"}
          description={
            notFound
              ? "ลิงก์นี้อาจถูกยกเลิกแล้ว หรือพิมพ์ที่อยู่ไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่"
              : "กรุณาลองใหม่อีกครั้ง"
          }
        />
      </Panel>
    );
  }

  const rounds = data.rounds;
  const showTabs = rounds.length > 1;
  const current = rounds.find(r => r.round === activeRound) ?? rounds[0];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-ink-1">{termHeading(data.term_label)}</h1>
        <p className="text-sm text-ink-2 mt-0.5">ความคืบหน้าการเดินเอกสารเบิกจ่ายผู้ช่วยสอน</p>
      </div>
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
      <ViewerRoundBoard
        key={current.round}
        p={current}
        showFinalStage
        checklistKey={`/public/document-progress/${linkId}/checklist?round=${current.round}`}
      />
    </div>
  );
}
