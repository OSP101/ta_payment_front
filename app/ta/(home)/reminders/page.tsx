"use client";
import useSWR from "swr";
import { Fragment, useState } from "react";
import { CalendarClock, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { type Me } from "../../../lib/api";
import { PageHeader, Panel, Chip, type ChipTone } from "../../../components/ui";
import {
  SubmissionTimeline,
  type SubmissionTimelineData,
} from "../../../components/SubmissionTimeline";

interface PendingRow {
  period_id: string;
  label: string;
  starts_on: string;
  due_date: string;
  is_closed: boolean;
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  status: "pending" | "exported" | "finance_sent" | "skipped";
  // Worklog readiness for the month. Once the lecturer has approved every daily
  // row the month is "รอเจ้าหน้าที่ส่งออก" — no TA action is required.
  worklog_total: number;
  worklog_unapproved: number;
  worklog_approved_hrs: number;
}

// Group rows by submission period so a TA sees "one card per month" with
// each course they help with underneath.
type Group = { period_id: string; label: string; starts_on: string; due_date: string; is_closed: boolean; rows: PendingRow[] };

// statusBadge folds the daily worklog-approval state into the pending status so
// the TA can see exactly where each month stands. There is no TA "confirm"
// step: after the lecturer approves every row, staff export (lock) then send to
// finance.
function statusBadge(r: PendingRow, today: string): { label: string; tone: ChipTone } {
  if (r.status === "exported")     return { label: "ส่งออกแล้ว รอส่งการเงิน", tone: "brand" };
  if (r.status === "finance_sent") return { label: "ส่งการเงินแล้ว", tone: "success" };
  if (r.status === "skipped")      return { label: "ข้ามรอบนี้", tone: "neutral" };
  // pending — derive from worklog readiness
  if (!r.is_closed && r.starts_on > today) return { label: "ยังไม่ถึงรอบ", tone: "neutral" };
  if (r.worklog_total === 0)               return { label: "ไม่มีรายการเดือนนี้", tone: "neutral" };
  if (r.worklog_unapproved > 0)            return { label: `รออาจารย์อนุมัติงาน ${r.worklog_unapproved} รายการ`, tone: "warn" };
  return { label: "รอเจ้าหน้าที่ส่งออก", tone: "info" };
}

export default function TAReminderPage() {
  const { data } = useSWR<PendingRow[]>("/me/submission-periods");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const timelineKey = (r: PendingRow) => `${r.period_id}/${r.teaching_course_id}`;

  const groups: Group[] = (data ?? []).reduce<Group[]>((acc, r) => {
    const g = acc.find(x => x.period_id === r.period_id);
    if (g) {
      g.rows.push(r);
    } else {
      acc.push({
        period_id: r.period_id, label: r.label,
        starts_on: r.starts_on, due_date: r.due_date, is_closed: r.is_closed,
        rows: [r],
      });
    }
    return acc;
  }, []);

  return (
    <div>
      <PageHeader
        title="สถานะการเบิกจ่ายรายเดือน"
        description="ติดตามสถานะบันทึกเวลาปฏิบัติงานแต่ละเดือน — เมื่ออาจารย์อนุมัติงานครบ เจ้าหน้าที่จะตรวจสอบ ส่งออกไฟล์ แล้วส่งให้การเงิน (ไม่ต้องยืนยันด้วยตนเอง)"
      />
      {!data ? (
        <div className="text-sm text-muted p-6">กำลังโหลด…</div>
      ) : groups.length === 0 ? (
        <Panel title="ไม่มีรายการที่ต้องทำ">
          <div className="text-sm text-muted py-4">
            ยังไม่มีรอบเบิกจ่ายที่ต้องยืนยัน เมื่อเจ้าหน้าที่สร้างรอบเดือนใหม่ระบบจะแจ้งเตือนคุณ
          </div>
        </Panel>
      ) : (
        <div className="space-y-6">
          {groups.map(g => {
            // Local calendar date, not UTC — toISOString() would lag a day
            // between 00:00–07:00 ICT and mark due-today periods overdue.
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const overdue = !g.is_closed && g.due_date < today;
            const notYet = !g.is_closed && g.starts_on > today;
            return (
              <Panel
                key={g.period_id}
                title={g.label}
                description={
                  g.is_closed
                    ? "รอบนี้ปิดรับแล้ว"
                    : notYet
                    ? `จะเปิดรับวันที่ ${g.starts_on} · กำหนดส่ง ${g.due_date}`
                    : `เปิดรับ ${g.starts_on} → ${g.due_date}`
                }
                actions={
                  overdue ? (
                    <Chip tone="warn"><AlertTriangle size={12} /> เลยกำหนด</Chip>
                  ) : g.is_closed ? (
                    <Chip tone="neutral">ปิดแล้ว</Chip>
                  ) : notYet ? (
                    <Chip tone="neutral"><CalendarClock size={12} /> ยังไม่ถึงวันเปิด</Chip>
                  ) : (
                    <Chip tone="brand"><CalendarClock size={12} /> เปิดรับ</Chip>
                  )
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-ink-2">
                      <tr>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="text-left px-3 py-2">รหัสวิชา</th>
                        <th className="text-left px-3 py-2">ชื่อวิชา</th>
                        <th className="text-left px-3 py-2">ชั่วโมงอนุมัติ</th>
                        <th className="text-right px-3 py-2">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const key = timelineKey(r);
                        const isOpen = !!expanded[key];
                        const badge = statusBadge(r, today);
                        return (
                          <Fragment key={r.teaching_course_id}>
                            <tr className="border-t border-hairline">
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  aria-label={isOpen ? "ซ่อนขั้นตอน" : "ดูขั้นตอน"}
                                  onClick={() => setExpanded(x => ({ ...x, [key]: !x[key] }))}
                                  className="p-1 text-ink-2 hover:text-ink-1"
                                >
                                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                              </td>
                              <td className="px-3 py-2 tabular">{r.course_code}</td>
                              <td className="px-3 py-2">{r.course_name_th}</td>
                              <td className="px-3 py-2 tabular">{r.worklog_approved_hrs.toFixed(1)} ชม.</td>
                              <td className="px-3 py-2 text-right">
                                <Chip tone={badge.tone}>{badge.label}</Chip>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="border-t border-hairline bg-slate-50/40">
                                <td colSpan={5} className="px-3 py-3">
                                  <TimelineLoader periodId={r.period_id} tcId={r.teaching_course_id} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Fetches and renders the timeline for one (period, TA-me, course) triple.
// Kept local because the TA case pins ta_id to the current user; other roles
// pass an explicit taId.
function TimelineLoader({ periodId, tcId }: { periodId: string; tcId: string }) {
  const { data: me } = useSWR<Me>("/me");
  const { data, error } = useSWR<SubmissionTimelineData>(
    me?.id ? `/submission-periods/${periodId}/courses/${tcId}/tas/${me.id}/timeline` : null,
  );
  if (error) return <div className="text-xs text-danger px-2">โหลดขั้นตอนไม่สำเร็จ</div>;
  if (!data) return <div className="text-xs text-muted px-2">กำลังโหลด…</div>;
  return <SubmissionTimeline data={data} title="สถานะการอนุมัติ" />;
}
