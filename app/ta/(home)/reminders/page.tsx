"use client";
import useSWR from "swr";
import { Fragment, useState } from "react";
import { CalendarClock, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { type Me } from "../../../lib/api";
import { PageHeader, Panel, Chip, type ChipTone } from "../../../components/ui";
import { Skel, SkelRegion, SkelRows, SkelValue } from "../../../components/Skeletons";
import { useI18n, type TFn } from "../../../lib/i18n/client";

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
  status: "pending" | "staff_reviewed" | "exported" | "finance_sent" | "skipped";
  // Worklog readiness for the month. Once the lecturer has approved every daily
  // row the month is "รอเจ้าหน้าที่ส่งออก" — no TA action is required.
  worklog_total: number;
  worklog_unapproved: number;
  worklog_approved_hrs: number;
  // Who the unapproved rows are with — see SubmissionPeriodStatus. Without the
  // split every unapproved row read "รออาจารย์อนุมัติ", including rows the
  // lecturer had already sent BACK and drafts the TA never sent.
  worklog_waiting_ta?: number;
  worklog_waiting_lecturer?: number;
  worklog_rejected?: number;
}

// Group rows by submission period so a TA sees "one card per month" with
// each course they help with underneath.
type Group = { period_id: string; label: string; starts_on: string; due_date: string; is_closed: boolean; rows: PendingRow[] };

// statusBadge folds the daily worklog-approval state into the pending status so
// the TA can see exactly where each month stands. There is no TA "confirm"
// step: after the lecturer approves every row, staff export (lock) then send to
// finance.
function statusBadge(r: PendingRow, today: string, t: TFn): { label: string; tone: ChipTone } {
  // Final from the TA's side — ส่งการเงิน has no staff step by design, so
  // "รอส่งการเงิน" was a wait that never ended.
  if (r.status === "exported")     return { label: t("เจ้าหน้าที่ส่งเอกสารเบิกจ่ายแล้ว"), tone: "success" };
  if (r.status === "finance_sent") return { label: t("ส่งการเงินแล้ว"), tone: "success" };
  if (r.status === "skipped")      return { label: t("ข้ามรอบนี้"), tone: "neutral" };
  if (r.status === "staff_reviewed") return { label: t("เจ้าหน้าที่ตรวจแล้ว"), tone: "info" };
  // pending — derive from worklog readiness
  if (!r.is_closed && r.starts_on > today) return { label: t("ยังไม่ถึงรอบ"), tone: "neutral" };
  if (r.worklog_total === 0)               return { label: t("ไม่มีรายการเดือนนี้"), tone: "neutral" };
  // Worst actionable state first: a bounced row is the TA's to fix, then rows
  // the TA never sent, and only then what is genuinely with the lecturer.
  if ((r.worklog_rejected ?? 0) > 0)
    return { label: t("อาจารย์ตีกลับ ต้องแก้ไข {n} รายการ", { n: r.worklog_rejected }), tone: "danger" };
  if ((r.worklog_waiting_ta ?? 0) > 0 && !r.is_closed)
    return { label: t("ยังไม่ได้ส่งอนุมัติ {n} รายการ", { n: r.worklog_waiting_ta }), tone: "warn" };
  if ((r.worklog_waiting_lecturer ?? 0) > 0)
    return { label: t("รออาจารย์อนุมัติงาน {n} รายการ", { n: r.worklog_waiting_lecturer }), tone: "info" };
  if (r.worklog_unapproved > 0 && r.worklog_waiting_lecturer === undefined)
    return { label: t("รออาจารย์อนุมัติงาน {n} รายการ", { n: r.worklog_unapproved }), tone: "warn" };
  return { label: t("รอเจ้าหน้าที่ส่งออก"), tone: "info" };
}

export default function TAReminderPage() {
  const { t, fmtDate } = useI18n();
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
        title={t("สถานะการเบิกจ่ายรายเดือน")}
        description={t("ติดตามสถานะบันทึกเวลาปฏิบัติงานแต่ละเดือน เมื่ออาจารย์อนุมัติงานครบ เจ้าหน้าที่จะตรวจสอบ ส่งออกไฟล์ แล้วส่งให้การเงิน (ไม่ต้องยืนยันด้วยตนเอง)")}
      />
      {!data ? (
        // One month-card shaped placeholder per likely group, so the list
        // lands in place instead of replacing a line of text.
        <SkelRegion className="space-y-6">
          {Array.from({ length: 2 }, (_, i) => (
            <Panel
              key={i}
              title={<SkelValue className="h-4 w-32" />}
              description={<SkelValue className="h-3 w-48" />}
              actions={<SkelValue className="h-5 w-16 rounded-full" />}
            >
              <SkelRows rows={2} columns={5} />
            </Panel>
          ))}
        </SkelRegion>
      ) : groups.length === 0 ? (
        <Panel title={t("ไม่มีรายการที่ต้องทำ")}>
          <div className="text-sm text-muted py-4">
            {t("ยังไม่มีรอบเบิกจ่ายที่ต้องยืนยัน เมื่อเจ้าหน้าที่สร้างรอบเดือนใหม่ระบบจะแจ้งเตือนคุณ")}
          </div>
        </Panel>
      ) : (
        <div data-tour="rem-list" className="space-y-6">
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
                title={g.label /* period label from the API */}
                description={
                  g.is_closed
                    ? t("รอบนี้ปิดรับแล้ว")
                    : notYet
                    ? t("จะเปิดรับวันที่ {start} · กำหนดส่ง {due}", { start: fmtDate(g.starts_on), due: fmtDate(g.due_date) })
                    : t("เปิดรับ {start} → {due}", { start: fmtDate(g.starts_on), due: fmtDate(g.due_date) })
                }
                actions={
                  overdue ? (
                    <Chip tone="warn"><AlertTriangle size={12} /> {t("เลยกำหนด")}</Chip>
                  ) : g.is_closed ? (
                    <Chip tone="neutral">{t("ปิดแล้ว")}</Chip>
                  ) : notYet ? (
                    <Chip tone="neutral"><CalendarClock size={12} /> {t("ยังไม่ถึงวันเปิด")}</Chip>
                  ) : (
                    <Chip tone="brand"><CalendarClock size={12} /> {t("เปิดรับ")}</Chip>
                  )
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm sm:min-w-0">
                    <thead className="bg-slate-50 text-ink-2">
                      <tr>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="text-left px-3 py-2">{t("รหัสวิชา")}</th>
                        <th className="text-left px-3 py-2">{t("ชื่อวิชา")}</th>
                        <th className="text-left px-3 py-2">{t("ชั่วโมงอนุมัติ")}</th>
                        <th className="text-right px-3 py-2">{t("สถานะ")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const key = timelineKey(r);
                        const isOpen = !!expanded[key];
                        const badge = statusBadge(r, today, t);
                        return (
                          <Fragment key={r.teaching_course_id}>
                            <tr className="border-t border-hairline">
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  aria-label={isOpen ? t("ซ่อนขั้นตอน") : t("ดูขั้นตอน")}
                                  onClick={() => setExpanded(x => ({ ...x, [key]: !x[key] }))}
                                  className="tap-target p-1 text-ink-2 hover:text-ink-1"
                                >
                                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                              </td>
                              <td className="px-3 py-2 tabular">{r.course_code}</td>
                              <td className="px-3 py-2">{r.course_name_th}</td>
                              <td className="px-3 py-2 tabular">{t("{h} ชม.", { h: r.worklog_approved_hrs.toFixed(1) })}</td>
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
  const { t } = useI18n();
  const { data: me } = useSWR<Me>("/me");
  const { data, error } = useSWR<SubmissionTimelineData>(
    me?.id ? `/submission-periods/${periodId}/courses/${tcId}/tas/${me.id}/timeline` : null,
  );
  if (error) return <div className="text-xs text-danger px-2">{t("โหลดขั้นตอนไม่สำเร็จ")}</div>;
  if (!data) {
    return (
      <SkelRegion label={t("กำลังโหลดขั้นตอน")} className="rounded-xl border border-hairline px-4 py-3 flex flex-col gap-3">
        <Skel className="h-4 w-28" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skel className="size-5 shrink-0 rounded-full" />
            <Skel className="h-3.5 w-2/3" />
          </div>
        ))}
      </SkelRegion>
    );
  }
  return <SubmissionTimeline data={data} title={t("สถานะการอนุมัติ")} />;
}
