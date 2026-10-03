"use client";
import { Scale } from "lucide-react";

/**
 * เพดานงบรายวิชา — one figure per term every course shares (migration 0144),
 * set by staff in ตั้งค่า > ภาคเรียน. Shown wherever a course budget is read so
 * nobody is surprised that a budget stops at the faculty's ceiling. Renders
 * nothing while the term sets no cap.
 */
export default function BudgetCapNotice({
  cap, formula, applied, compact,
}: {
  cap: number | null | undefined;
  formula?: number;
  applied?: boolean;
  compact?: boolean;
}) {
  if (cap == null) return null;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-border bg-surface-secondary ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}>
      <Scale size={compact ? 13 : 15} className="mt-0.5 shrink-0 text-muted" />
      <div>
        <div>ตามระเบียบของคณะ งบประมาณแต่ละรายวิชาไม่เกิน <b className="tabular-nums">{fmt(cap)}</b> บาท</div>
        {applied && formula != null && (
          <div className="text-muted text-xs mt-0.5">
            งบตามสูตรของวิชานี้คือ {fmt(formula)} บาท ซึ่งเกินเพดาน ระบบจึงใช้ {fmt(cap)} บาท
          </div>
        )}
      </div>
    </div>
  );
}
