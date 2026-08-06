"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { PageHeader, Select } from "../components/ui";
import type { Term } from "../lib/api";
import BudgetAnalytics from "../staff/BudgetAnalytics";

// มุมมองผู้บริหาร — the same BudgetAnalytics section the staff dashboard
// embeds, standing alone. Read-only by construction: the only endpoints this
// page touches are /terms and /dashboard/analytics(.xlsx).
//
// The term selector is local. The staff area's TermContext is the officer's
// working scope (persisted, mirrored into the URL); an executive skimming
// last year's numbers should not be changing anyone's working state.
export default function ExecutivePage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [picked, setPicked] = useState("");
  const termId = useMemo(() => {
    const list = terms ?? [];
    if (picked && list.some(t => t.id === picked)) return picked;
    return (list.find(t => t.is_active) ?? list[0])?.id ?? "";
  }, [terms, picked]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="มุมมองผู้บริหาร"
          description="สรุปการใช้งบประมาณผู้ช่วยสอน แยกรายเดือน รายหลักสูตร และรายวิชา"
        />
        {(terms ?? []).length > 1 && (
          <Select aria-label="เลือกปีการศึกษา" value={termId}
                  onChange={e => setPicked(e.target.value)}>
            {(terms ?? []).map(t => (
              <option key={t.id} value={t.id}>
                {t.academic_year}/{t.semester}{t.is_active ? " (ปัจจุบัน)" : ""}
              </option>
            ))}
          </Select>
        )}
      </div>
      {termId && <BudgetAnalytics termId={termId} />}
    </div>
  );
}
