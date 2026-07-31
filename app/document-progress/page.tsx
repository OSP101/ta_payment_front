"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type Term, type Me } from "../lib/api";
import { PageHeader } from "../components/ui";
import TermSelect from "../components/TermSelect";
import { DocumentProgressBoard } from "../components/DocumentProgressBoard";

export default function DocumentProgressPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const { data: me } = useSWR<Me>("/me");
  const [termId, setTermId] = useState("");
  // Default to the ACTIVE term, not terms[0] ("the newest term that exists").
  // Those differ the moment staff create next semester ahead of time, and this
  // page is cross-role — a TA and an officer looking at it should not silently
  // be reading different terms.
  useEffect(() => {
    if (termId || !terms?.length) return;
    setTermId((terms.find(t => t.is_active) ?? terms[0]).id);
  }, [terms, termId]);

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
            <TermSelect terms={terms} value={termId} onChange={setTermId} />
          }
        />
        <DocumentProgressBoard termId={termId} canEdit={false} showFinalStage={showFinalStage} />
      </div>
    </div>
  );
}
