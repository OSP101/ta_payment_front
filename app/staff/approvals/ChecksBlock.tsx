"use client";
import { Check, X, AlertTriangle } from "lucide-react";

interface DecisionCheck {
  rule: string;
  ta?: string;
  passed: boolean;
  // warning=true means "failed, but informational only" — staff should notice
  // and follow up (e.g. docs not yet approved), but the request itself is not
  // blocked by it.
  warning?: boolean;
  message: string;
}

const RULE_LABEL: Record<string, string> = {
  docs:           "เอกสาร TA",
  schedule:       "ตารางเรียน",
  cap:            "ไม่เกิน 3 วิชา/ภาค",
  duplicate:      "ไม่ซ้ำในวิชานี้",
  own_conflict:   "ไม่ทับตารางเรียนของ TA",
  cross_conflict: "ไม่ทับกับวิชาอื่นที่สอน",
  intra_conflict: "sections ในคำขอไม่ทับกันเอง",
  workload:       "ภาระงาน",
  section:        "section ตรงกับรายวิชา",
};

// Group by rule so the checklist reads like a rubric — one row per rule per
// TA, so an officer scanning a rejected request can see *which* rule was the
// blocker without eyeballing the full list.
function group(checks: DecisionCheck[]): [string, DecisionCheck[]][] {
  const order = [
    "docs", "schedule", "cap", "duplicate",
    "own_conflict", "cross_conflict", "intra_conflict",
    "workload", "section",
  ];
  const buckets: Record<string, DecisionCheck[]> = {};
  for (const c of checks) (buckets[c.rule] ??= []).push(c);
  const known = order.filter(k => buckets[k]?.length).map(k => [k, buckets[k]] as [string, DecisionCheck[]]);
  const extra = Object.keys(buckets)
    .filter(k => !order.includes(k))
    .map(k => [k, buckets[k]] as [string, DecisionCheck[]]);
  return [...known, ...extra];
}

export function ChecksBlock({ checks }: { checks: DecisionCheck[] }) {
  if (!checks || checks.length === 0) {
    return (
      <div className="text-xs text-(--ink-3) italic px-3 py-2 rounded border border-dashed border-(--hairline)">
        ไม่มีบันทึกการตรวจสอบ (ข้อมูลก่อนระบบเปลี่ยนเป็นตัดสินอัตโนมัติ)
      </div>
    );
  }
  const grouped = group(checks);
  return (
    <ul className="space-y-1">
      {grouped.map(([rule, list]) => (
        <li key={rule} className="rounded-md border border-(--hairline) bg-white overflow-hidden">
          <div className="text-[11px] font-medium tracking-wide text-(--ink-3) bg-slate-50/70 px-3 py-1 border-b border-(--hairline)">
            {RULE_LABEL[rule] ?? rule}
          </div>
          <ul>
            {list.map((c, i) => {
              const warn = !c.passed && c.warning;
              const bad = !c.passed && !c.warning;
              const rowCls = c.passed
                ? "text-emerald-800"
                : warn
                ? "text-amber-800 bg-amber-50/50"
                : "text-red-800 bg-red-50/40";
              const iconCls = c.passed
                ? "bg-emerald-100 text-emerald-700"
                : warn
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700";
              return (
                <li key={i} className={"flex items-start gap-2 px-3 py-1.5 text-xs " + rowCls}>
                  <span className={"mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full " + iconCls}>
                    {c.passed ? <Check size={10} /> : warn ? <AlertTriangle size={10} /> : <X size={10} />}
                  </span>
                  <span>
                    {c.message}
                    {warn && <span className="ml-1 text-[10px] uppercase tracking-wide">· ต้องติดตาม</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
