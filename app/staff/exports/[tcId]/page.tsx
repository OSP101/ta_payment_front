"use client";
import { use, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { ArrowLeft, ClipboardEdit, FileCheck2 } from "lucide-react";
import { PageHeader, Panel } from "../../../components/ui";
import { StaffWorklogEditor } from "../../../components/StaffWorklogEditor";
import { ExportPreviewBody } from "../../../components/ExportPreviewBody";
import { CourseSubmissionPanel } from "../../../components/CourseSubmissionPanel";

interface TC { id: string; code: string; name_th: string; exported_at?: string | null; }
type Tab = "worklog" | "export";

// Per-course staff workspace: view/edit worklog and verify+export in one place.
// Both tabs stay mounted so a worklog edit in Tab 1 revalidates the payout
// preview in Tab 2 instantly (no reload, no leaving the page).
export default function StaffCourseWorkspace({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: tc } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const [tab, setTab] = useState<Tab>("worklog");

  // Revalidate every key the export/send-back/finance-send flows can affect, so
  // the whole workspace stays consistent without a reload:
  //   - worklogs        → Tab-1 rows + their `locked` chips
  //   - preview         → Tab-2 payout numbers
  //   - teaching-course → tc.exported_at → the download button's locked state
  //   - submission-timeline → CourseSubmissionPanel status + the ส่งการเงิน button
  const revalidateAll = () => {
    mutate(`/staff/courses/${tcId}/worklogs`);
    mutate(`/exports/course/${tcId}/preview`);
    mutate(`/teaching-courses/${tcId}`);
    mutate(`/teaching-courses/${tcId}/submission-timeline`);
  };

  return (
    <div>
      <Link
        href="/staff/exports"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-[var(--brand)] transition-colors mb-2"
      >
        <ArrowLeft size={16} /> กลับไปรายการวิชา (ส่งออกเอกสาร)
      </Link>


      <PageHeader
        title={tc ? `${tc.code} — ${tc.name_th}` : "…"}
        description="ดู/แก้ไขบันทึกเวลา ตรวจสอบยอดเบิกจ่าย แล้วส่งออก — ครบในหน้าเดียว"
      />

      <div className="flex gap-2 mb-3 border-b border-hairline">
        <TabBtn active={tab === "worklog"} onClick={() => setTab("worklog")}>
          <ClipboardEdit size={14} /> บันทึกเวลา (ดู/แก้)
        </TabBtn>
        <TabBtn active={tab === "export"} onClick={() => setTab("export")}>
          <FileCheck2 size={14} /> ตรวจสอบ &amp; ส่งออก
        </TabBtn>
      </div>

      <div className={tab === "worklog" ? "" : "hidden"}>
        <Panel padded={false}>
          <StaffWorklogEditor tcId={tcId} onDataChange={revalidateAll} />
        </Panel>
      </div>

      <div className={tab === "export" ? "" : "hidden"}>
        <Panel className="mb-3">
          <ExportPreviewBody tcId={tcId} exportedAt={tc?.exported_at} onExported={revalidateAll} />
        </Panel>
        <CourseSubmissionPanel tcId={tcId} role="staff" title="สถานะ & ส่งการเงิน" onDataChange={revalidateAll} />
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-[var(--brand)] text-[var(--brand)]"
          : "border-transparent text-ink-3 hover:text-ink-1 hover:border-hairline"
      }`}
    >
      {children}
    </button>
  );
}
