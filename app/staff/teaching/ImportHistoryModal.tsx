"use client";
// ประวัติการนำเข้าไฟล์ทะเบียน — TOR §3.3 ข.5. Until 15/09/2026 the only trace
// of a registrar-file import was one audit-log row with counts only (no
// filename shown anywhere, no error/warning messages, no screen to open) —
// staff had no way to answer "what happened last time I imported this file"
// without asking someone to read the database. This is that screen.
import { useState } from "react";
import useSWR from "swr";
import { History, ChevronRight, FileSpreadsheet, TriangleAlert, CircleX, CircleCheck } from "lucide-react";
import { Modal, Button, Chip, EmptyState, Alert } from "../../components/ui";

interface HistoryRow {
  id: string;
  filename: string;
  file_sha256?: string;
  row_count: number;
  created_count: number;
  skipped_count: number;
  merged_count: number;
  warning_count: number;
  error_count: number;
  fatal_error?: string;
  imported_by_name?: string;
  started_at?: string;
  at: string;
}

interface HistoryDetail extends HistoryRow {
  created_codes: string[];
  skipped_codes: string[];
  merged_codes: string[];
  warnings: string[];
  errors: string[];
}

function fmtAt(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function ImportHistoryModal({
  open, onClose, termId,
}: {
  open: boolean;
  onClose: () => void;
  termId?: string;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: rows, isLoading } = useSWR<HistoryRow[]>(
    open && termId ? `/teaching-courses/import/history?term_id=${termId}` : null,
  );
  const { data: detail } = useSWR<HistoryDetail>(
    detailId ? `/teaching-courses/import/history/${detailId}` : null,
  );

  return (
    <>
      <Modal open={open && !detailId} onClose={onClose} title="ประวัติการนำเข้าไฟล์ทะเบียน" size="lg" icon={<History size={18} />}>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-(--ink-3)">กำลังโหลด…</div>
        ) : !rows || rows.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={28} />}
            title="ยังไม่เคยนำเข้าไฟล์"
            description="ประวัติการนำเข้าไฟล์ทะเบียนของภาคเรียนนี้จะแสดงที่นี่"
          />
        ) : (
          <ul className="divide-y divide-(--hairline) -mx-4 sm:-mx-6">
            {rows.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(r.id)}
                  className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 text-left hover:bg-(--surface-secondary) transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-(--ink-1) truncate">{r.filename}</div>
                    <div className="text-xs text-(--ink-3)">
                      {fmtAt(r.at)}
                      {r.imported_by_name ? ` · ${r.imported_by_name}` : ""}
                    </div>
                  </div>
                  {r.fatal_error ? (
                    <Chip tone="danger">นำเข้าไม่สำเร็จ</Chip>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Chip tone="success">สร้าง {r.created_count}</Chip>
                      {r.warning_count > 0 && <Chip tone="warn">เตือน {r.warning_count}</Chip>}
                      {r.error_count > 0 && <Chip tone="danger">ผิดพลาด {r.error_count}</Chip>}
                    </div>
                  )}
                  <ChevronRight size={16} className="text-(--ink-3) shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detail?.filename ?? "รายละเอียดการนำเข้า"}
        size="lg"
        icon={<FileSpreadsheet size={18} />}
        footer={<Button variant="tertiary" onClick={() => setDetailId(null)}>กลับไปที่ประวัติ</Button>}
      >
        {!detail ? (
          <div className="py-8 text-center text-sm text-(--ink-3)">กำลังโหลด…</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-(--ink-3)">
              {fmtAt(detail.at)}{detail.imported_by_name ? ` · ${detail.imported_by_name}` : ""}
            </div>
            {detail.fatal_error ? (
              <Alert status="danger" icon={<CircleX size={16} />} title="นำเข้าไม่สำเร็จ" description={detail.fatal_error} />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip tone="success"><CircleCheck size={12} className="me-1 inline" />สร้าง {detail.created_count}</Chip>
                  {detail.skipped_count > 0 && <Chip tone="neutral">ข้าม {detail.skipped_count}</Chip>}
                  {detail.merged_count > 0 && <Chip tone="neutral">รวม {detail.merged_count}</Chip>}
                  {detail.warning_count > 0 && (
                    <Chip tone="warn"><TriangleAlert size={12} className="me-1 inline" />เตือน {detail.warning_count}</Chip>
                  )}
                  <Chip tone={detail.error_count > 0 ? "danger" : "neutral"}>ผิดพลาด {detail.error_count}</Chip>
                </div>
                {detail.created_codes?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-(--ink-2)">รหัสวิชาที่สร้าง</p>
                    <p className="text-xs text-(--ink-3) font-mono">{detail.created_codes.join(", ")}</p>
                  </div>
                )}
                {detail.merged_codes?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-(--ink-2)">รหัสที่รวมเป็นวิชาเดียว</p>
                    <p className="text-xs text-(--ink-3) font-mono">{detail.merged_codes.join(", ")}</p>
                  </div>
                )}
                {detail.skipped_codes?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-(--ink-2)">รหัสวิชาที่ข้าม</p>
                    <p className="text-xs text-(--ink-3) font-mono">{detail.skipped_codes.join(", ")}</p>
                  </div>
                )}
                {detail.errors?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-(--ink-2)">รายการที่มีปัญหา (ต้องตรวจ)</p>
                    <ul className="text-xs space-y-1 max-h-48 overflow-y-auto rounded border border-(--hairline) p-2">
                      {detail.errors.map((e, i) => <li key={i} className="text-red-700">• {e}</li>)}
                    </ul>
                  </div>
                )}
                {detail.warnings?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-(--ink-2)">
                      รายการที่เตือน (ไม่มีตารางเรียน — ปกติสำหรับวิชาโครงงาน/สหกิจ/วิทยานิพนธ์)
                    </p>
                    <ul className="text-xs space-y-1 max-h-48 overflow-y-auto rounded border border-(--hairline) p-2">
                      {detail.warnings.map((w, i) => <li key={i} className="text-(--ink-3)">• {w}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
