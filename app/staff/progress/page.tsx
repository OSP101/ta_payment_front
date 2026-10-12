"use client";
import { PageHeader } from "../../components/ui";
import { DocumentProgressBoard } from "../../components/DocumentProgressBoard";
import { useTerm } from "../TermContext";
import { useI18n } from "../../lib/i18n/client";

export default function StaffProgressPage() {
  // Term comes from the shell's switcher — see TermContext for why every staff
  // page reads it from one place instead of keeping its own <Select>.
  const { termId, loaded } = useTerm();
  const { t } = useI18n();

  return (
    <div>
      <PageHeader
        title={t("อัปเดตความคืบหน้าเอกสาร")}
        description={t("ติดตามการเดินเอกสารจริง (นอกระบบ) หลังส่งออก เซ็น TA → อาจารย์ → ผู้รับรอง → ส่งการเงิน → คณบดีลงนาม คลิกที่ขั้นเพื่ออัปเดต ทุกคนเห็นสถานะนี้ได้")}
      />
      <DocumentProgressBoard termId={termId} canEdit pending={!loaded} />
    </div>
  );
}
