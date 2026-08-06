"use client";
import { PageHeader } from "../../components/ui";
import { DocumentProgressBoard } from "../../components/DocumentProgressBoard";
import { useTerm } from "../TermContext";

export default function StaffProgressPage() {
  // Term comes from the shell's switcher — see TermContext for why every staff
  // page reads it from one place instead of keeping its own <Select>.
  const { termId } = useTerm();

  return (
    <div>
      <PageHeader
        title="อัปเดตความคืบหน้าเอกสาร"
        description="ติดตามการเดินเอกสารจริง (นอกระบบ) หลังส่งออก เซ็น TA → อาจารย์ → ผู้รับรอง → ส่งการเงิน → คณบดีลงนาม คลิกที่ขั้นเพื่ออัปเดต ทุกคนเห็นสถานะนี้ได้"
      />
      <DocumentProgressBoard termId={termId} canEdit />
    </div>
  );
}
