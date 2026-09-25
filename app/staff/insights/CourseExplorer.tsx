"use client";
// รายวิชาทั้งหมดของภาคเรียน — one table that answers both questions for a
// single course (enough TAs? enough money?) with search, filters and sorting
// on every column (TOR 3.13: รองรับการค้นหา กรองข้อมูล และเรียงลำดับ).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle, CalendarX2 } from "lucide-react";
import { SearchField, Select } from "../../components/ui";
import type { CourseStaffing, StaffingStatus } from "../types";
import { curriculumTH } from "../types";
import { STAFFING_META, CAP_META, capState, baht, money, num1, pct0, type CapState } from "./analysis";
import { MiniBar, onActivate } from "./charts";

type SortKey = "code" | "curriculum" | "students" | "recommended" | "requested" | "ratio" | "spent" | "use" | "status";

const PAGE = 15;

export default function CourseExplorer({
  rows, status, onStatus, selected, onSelect, linkCourses, ratio,
}: {
  rows: CourseStaffing[];
  status: StaffingStatus | "";
  onStatus: (s: StaffingStatus | "") => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Staff can open the course page; the executive view cannot reach /staff. */
  linkCourses: boolean;
  /** The near-cap line (near_cap_ratio) — the same capState as Q1. */
  ratio: number;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "requested" | "none">("all");
  const [money_, setMoney] = useState<"" | "over" | "near">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [limit, setLimit] = useState(PAGE);
  const selRef = useRef<HTMLTableRowElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const val = (r: CourseStaffing, k: SortKey): number | string => {
      switch (k) {
        case "code": return r.code;
        case "curriculum": return curriculumTH(r.curriculum);
        case "students": return r.students;
        case "recommended": return r.recommended;
        case "requested": return r.requested;
        case "ratio": return r.students_per_ta || Infinity;
        case "spent": return r.spent_baht;
        case "use": return r.cap_baht > 0 ? r.forecast_baht / r.cap_baht : -1;
        case "status": return STAFFING_META[r.status].rank * 1000 - (r.requested - r.recommended);
      }
    };
    return rows
      .filter(r => !status || r.status === status)
      .filter(r => scope === "all" || (scope === "requested" ? r.requested > 0 : r.requested === 0))
      .filter(r => !money_ || capState(r, ratio) === money_)
      .filter(r => !needle
        || r.code.toLowerCase().includes(needle)
        || r.name_th.toLowerCase().includes(needle)
        || r.lecturers.some(l => l.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        const c = typeof x === "string" ? x.localeCompare(y as string, "th") : (x as number) - (y as number);
        return (c || a.code.localeCompare(b.code)) * sort.dir;
      });
  }, [rows, q, scope, status, sort, money_, ratio]);

  // A course picked on the scatter jumps into view even if it is past the fold.
  // Only on a new pick: re-scrolling on every keystroke would yank the page
  // away from the search box.
  useEffect(() => {
    if (!selected) return;
    const idx = filtered.findIndex(r => r.teaching_course_id === selected);
    if (idx >= limit) setLimit(idx + 1);
    const t = setTimeout(() => selRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const th = (key: SortKey, label: string, align: "start" | "end" = "start", cls = "") => {
    const on = sort.key === key;
    const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={`py-2 pe-3 font-medium text-${align} ${cls}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button"
                onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : (key === "code" || key === "curriculum" || key === "status" ? 1 : -1) }))}
                className={`inline-flex items-center gap-1 hover:text-[var(--ink-1)] ${on ? "text-[var(--ink-1)]" : ""}`}>
          {label}<Icon size={12} className={on ? "" : "opacity-40"} />
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SearchField value={q} onChange={v => { setQ(v); setLimit(PAGE); }}
                     placeholder="ค้นหารหัส ชื่อวิชา หรืออาจารย์" ariaLabel="ค้นหารายวิชา" className="w-full sm:w-72" />
        <Select aria-label="กรองตามผลการเทียบ" value={status} onChange={e => onStatus(e.target.value as StaffingStatus | "")}>
          <option value="">ทุกผลการเทียบ</option>
          {(Object.keys(STAFFING_META) as StaffingStatus[])
            .sort((a, b) => STAFFING_META[a].rank - STAFFING_META[b].rank)
            .map(k => <option key={k} value={k}>{STAFFING_META[k].label}</option>)}
        </Select>
        <Select aria-label="กรองตามการขอ TA" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
          <option value="all">ทุกวิชา</option>
          <option value="requested">เฉพาะวิชาที่ขอ TA</option>
          <option value="none">เฉพาะวิชาที่ยังไม่ขอ</option>
        </Select>
        <Select aria-label="กรองตามสถานะงบ" value={money_} onChange={e => setMoney(e.target.value as typeof money_)}>
          <option value="">ทุกสถานะงบ</option>
          <option value="over">{CAP_META.over.label}</option>
          <option value="near">{CAP_META.near.label} (ถึง {pct0(ratio * 100)})</option>
        </Select>
        <span className="ms-auto text-xs text-[var(--ink-3)] tabular-nums" aria-live="polite">{filtered.length} จาก {rows.length} วิชา</span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-xs text-[var(--ink-3)]">
              {th("code", "วิชา")}
              {th("curriculum", "หลักสูตร")}
              {th("students", "นศ.", "end")}
              {th("recommended", "แนะนำ", "end")}
              {th("requested", "ขอ", "end")}
              {th("ratio", "นศ./TA", "end")}
              {th("spent", "เบิกแล้ว (บาท)", "end")}
              {th("use", "คาดการณ์เทียบเพดานวิชา", "start", "w-44")}
              {th("status", "ผลการเทียบ")}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {filtered.slice(0, limit).map(r => {
              const m = STAFFING_META[r.status];
              const on = selected === r.teaching_course_id;
              const usePct = r.cap_baht > 0 ? (r.forecast_baht / r.cap_baht) * 100 : null;
              const cs: CapState = capState(r, ratio);
              const diff = r.requested - r.recommended;
              return (
                <tr key={r.teaching_course_id} ref={on ? selRef : undefined}
                    tabIndex={0} aria-selected={on}
                    onClick={() => onSelect(on ? null : r.teaching_course_id)}
                    onKeyDown={e => { if (e.target === e.currentTarget) onActivate(() => onSelect(on ? null : r.teaching_course_id))(e); }}
                    className={`cursor-pointer align-top transition-colors focus-visible:outline-2 focus-visible:outline-[var(--brand)] focus-visible:-outline-offset-2 ${on ? "bg-[var(--brand-soft,#e7f3fb)]" : "hover:bg-slate-50"}`}>
                  <td className="py-2.5 pe-3 max-w-[300px]">
                    <div className="flex items-baseline gap-2">
                      {linkCourses
                        ? <Link href={`/staff/teaching/${r.teaching_course_id}`} onClick={e => e.stopPropagation()}
                                className="font-semibold tabular-nums hover:underline">{r.code}</Link>
                        : <span className="font-semibold tabular-nums">{r.code}</span>}
                      {r.pending_request && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">รออนุมัติ</span>}
                    </div>
                    <div className="text-xs text-[var(--ink-2)] line-clamp-1">{r.name_th}</div>
                    {r.lecturers.length > 0 && (
                      <div className="text-xs text-[var(--ink-3)] line-clamp-1">{r.lecturers.join(", ")}</div>
                    )}
                  </td>
                  <td className="py-2.5 pe-3 text-xs text-[var(--ink-2)] whitespace-nowrap">{curriculumTH(r.curriculum)}</td>
                  <td className="py-2.5 pe-3 text-end tabular-nums">
                    {r.students_missing && r.students === 0
                      ? <span className="inline-flex items-center gap-1 text-amber-800"><AlertTriangle size={12} />ไม่มี</span>
                      : r.students}
                    <div className="text-xs text-[var(--ink-3)]">{r.sittings} กลุ่ม</div>
                  </td>
                  <td className="py-2.5 pe-3 text-end tabular-nums text-[var(--ink-2)]">
                    {r.recommended}
                    <div className="text-xs text-[var(--ink-3)]">สูงสุด {r.ceiling}</div>
                  </td>
                  <td className="py-2.5 pe-3 text-end tabular-nums">
                    <b>{r.requested || "–"}</b>
                    {r.requested > 0 && diff !== 0 && (
                      <div className={`text-xs ${diff > 0 ? "text-red-700" : "text-sky-700"}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pe-3 text-end tabular-nums">{r.students_per_ta ? num1(r.students_per_ta) : "–"}</td>
                  <td className="py-2.5 pe-3 text-end tabular-nums">
                    {r.spent_baht > 0 ? baht(r.spent_baht) : "–"}
                    {r.unfunded_baht > 0 && (
                      <div className="text-xs text-red-700" title="งานที่บันทึกแล้วแต่เพดานวิชาจ่ายไม่ได้">
                        จ่ายไม่ได้ {money(r.unfunded_baht)}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pe-3">
                    {usePct != null && r.requested > 0 ? (
                      <div className="pt-1.5">
                        <MiniBar value={r.forecast_baht} max={r.cap_baht} warnAt={ratio} over={cs === "over"} />
                        <div className="mt-1 text-xs tabular-nums" style={{ color: cs === "over" || cs === "near" ? CAP_META[cs].ink : "var(--ink-3)" }}>
                          {Math.round(usePct)}% ของ {money(r.cap_baht)}{cs === "over" || cs === "near" ? ` · ${CAP_META[cs].label}` : ""}
                        </div>
                      </div>
                    ) : <span className="text-xs text-[var(--ink-3)]">–</span>}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                          style={{ background: `${m.color}1a`, color: m.ink }}>
                      <i className="size-1.5 rounded-full" style={{ background: m.color }} />{m.short}
                    </span>
                    {r.unresolved_makeups > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--ink-3)]" title="คาบตรงวันหยุดที่ยังไม่กำหนดวันชดเชย">
                        <CalendarX2 size={11} /> ชดเชย {r.unresolved_makeups} คาบ
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-sm text-[var(--ink-3)]">ไม่พบรายวิชาที่ตรงเงื่อนไข</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="mt-3 text-center">
          <button type="button" onClick={() => setLimit(l => l + PAGE * 2)}
                  className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--ink-2)] hover:bg-slate-50">
            แสดงเพิ่ม ({filtered.length - limit} วิชา)
          </button>
        </div>
      )}
    </div>
  );
}
