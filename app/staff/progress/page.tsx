"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { type Term } from "../../lib/api";
import { PageHeader, Select } from "../../components/ui";
import { DocumentProgressBoard } from "../../components/DocumentProgressBoard";

export default function StaffProgressPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState("");
  useEffect(() => { if (!termId && terms?.length) setTermId(terms[0].id); }, [terms, termId]);

  return (
    <div>
      <PageHeader
        title="อัปเดตความคืบหน้าเอกสาร"
        description="ติดตามการเดินเอกสารจริง (นอกระบบ) หลังส่งออก — เซ็น TA → อาจารย์ → ผู้รับรอง → ส่งการเงิน → คณบดีลงนาม คลิกที่ขั้นเพื่ออัปเดต ทุกคนเห็นสถานะนี้ได้"
        actions={
          <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
            {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
          </Select>
        }
      />
      <DocumentProgressBoard termId={termId} canEdit />
    </div>
  );
}
