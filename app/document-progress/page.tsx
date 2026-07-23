"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type Term, type Me } from "../lib/api";
import { PageHeader, Select } from "../components/ui";
import { DocumentProgressBoard } from "../components/DocumentProgressBoard";

export default function DocumentProgressPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const { data: me } = useSWR<Me>("/me");
  const [termId, setTermId] = useState("");
  useEffect(() => { if (!termId && terms?.length) setTermId(terms[0].id); }, [terms, termId]);

  // Stage 5 ("คณบดีลงนาม") is visible only to lecturer/staff/admin — not TAs.
  const showFinalStage = (me?.roles ?? []).some(r => ["lecturer", "staff", "admin"].includes(r));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1000px] mx-auto p-4 md:p-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-3">
          <ArrowLeft size={14} /> กลับหน้าแรก
        </Link>
        <PageHeader
          title="ความคืบหน้าเอกสารเบิกจ่าย"
          description="ติดตามว่าเอกสารของแต่ละวิชาเดินทางไปถึงขั้นไหนแล้ว — อัปเดตโดยเจ้าหน้าที่"
          actions={
            <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
              {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
            </Select>
          }
        />
        <DocumentProgressBoard termId={termId} canEdit={false} showFinalStage={showFinalStage} />
      </div>
    </div>
  );
}
