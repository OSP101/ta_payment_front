"use client";
import useSWR, { mutate } from "swr";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Send, Undo2 } from "lucide-react";
import { Accordion } from "@heroui/react";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { Panel, Button, Chip, TextArea } from "./ui";
import {
  SubmissionTimeline,
  type SubmissionTimelineData,
} from "./SubmissionTimeline";

// One (TA × period) row on the course-level submission-timeline endpoint.
type Row = SubmissionTimelineData;

type ActionKind = "finance-send";

const STATUS_LABEL: Record<Row["status"], string> = {
  pending:      "รอดำเนินการ",
  exported:     "ส่งออกแล้ว รอส่งการเงิน",
  finance_sent: "ส่งการเงินแล้ว",
  skipped:      "ข้าม",
};
type Tone = "brand" | "warn" | "success" | "neutral" | "info";
const STATUS_TONE: Record<Row["status"], Tone> = {
  pending:      "warn",
  exported:     "brand",
  finance_sent: "success",
  skipped:      "neutral",
};

// statusBadge folds the daily-approval readiness into the pending status so the
// staff/lecturer view shows "รอเจ้าหน้าที่ส่งออก" vs "รออาจารย์อนุมัติงาน"
// without expanding the row.
function statusBadge(row: Row): { label: string; tone: Tone } {
  if (row.status !== "pending") {
    return { label: STATUS_LABEL[row.status], tone: STATUS_TONE[row.status] };
  }
  const total = row.worklog_total ?? 0;
  const unapproved = row.worklog_unapproved ?? 0;
  if (total === 0)      return { label: "ไม่มีรายการเดือนนี้", tone: "neutral" };
  if (unapproved > 0)   return { label: `รออาจารย์อนุมัติงาน ${unapproved} รายการ`, tone: "warn" };
  return { label: "รอเจ้าหน้าที่ส่งออก", tone: "info" };
}

// Which action a viewer can take on a row. There are no signatures anymore:
// staff export (via the ZIP button on the exports page) locks a month; here
// staff only confirm the finance handoff once a month is 'exported'. Lecturers
// have no monthly action — their review is the daily worklog approve/reject.
function nextActionFor(
  row: Row,
  role: "lecturer" | "staff",
): { kind: ActionKind; label: string } | null {
  if (row.status === "exported" && role === "staff") {
    return { kind: "finance-send", label: "ส่งการเงิน" };
  }
  return null;
}

// Staff can bounce an exported month back to pending (unlock the worklog for
// corrections). Lecturers cannot; the server enforces the same rule.
function sendBackTargetFor(row: Row, role: "lecturer" | "staff"): Row["status"] | null {
  if (role === "staff" && row.status === "exported") return "pending";
  return null;
}

export function CourseSubmissionPanel({
  tcId,
  role,
  title = "สถานะเบิกจ่ายรายเดือน",
  onDataChange,
}: {
  tcId: string;
  role: "lecturer" | "staff";
  title?: string;
  // Called after a finance-send or send-back succeeds so an embedding page can
  // revalidate its OTHER data (e.g. the worklog editor's lock chips + the payout
  // preview). Send-back unlocks a month; without this those views stay stale.
  onDataChange?: () => void;
}) {
  const key = `/teaching-courses/${tcId}/submission-timeline`;
  const { data, error, isLoading } = useSWR<Row[]>(key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [sendBackDraft, setSendBackDraft] = useState<Record<string, string>>({});
  const [sendBackOpen, setSendBackOpen] = useState<Record<string, boolean>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const rowKey = (r: Row) => `${r.period_id}/${r.ta_id ?? ""}`;

  // Group the flat (TA × period) rows by TA so the panel reads "one card per
  // person" — the timeline endpoint returns rows ordered by due_date, so each
  // TA's months stay chronological inside their group.
  const groups = useMemo(() => {
    const m = new Map<string, { taId: string; taName: string; rows: Row[] }>();
    for (const r of data ?? []) {
      const id = r.ta_id ?? "";
      const g = m.get(id);
      if (g) g.rows.push(r);
      else m.set(id, { taId: id, taName: r.ta_name ?? "-", rows: [r] });
    }
    return Array.from(m.values()).sort((a, b) =>
      a.taName.localeCompare(b.taName, "th"),
    );
  }, [data]);

  async function act(row: Row, kind: ActionKind) {
    const k = rowKey(row);
    const comment = commentDraft[k] ?? "";
    setPendingKey(k);
    try {
      const path = `/submission-periods/${row.period_id}/courses/${tcId}/tas/${row.ta_id}/${kind}`;
      await api.post(path, { comment });
      notify.success("บันทึกสำเร็จ");
      setCommentDraft(x => ({ ...x, [k]: "" }));
      await mutate(key);
      onDataChange?.();
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  async function sendBack(row: Row, toStatus: Row["status"]) {
    const k = rowKey(row);
    const reason = (sendBackDraft[k] ?? "").trim();
    if (!reason) {
      notify.error("ต้องระบุเหตุผลการตีกลับ");
      return;
    }
    setPendingKey(k);
    try {
      const path = `/submission-periods/${row.period_id}/courses/${tcId}/tas/${row.ta_id}/send-back`;
      await api.post(path, { to_status: toStatus, reason });
      notify.success("ตีกลับสำเร็จ");
      setSendBackDraft(x => ({ ...x, [k]: "" }));
      setSendBackOpen(x => ({ ...x, [k]: false }));
      await mutate(key);
      onDataChange?.();
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  if (error) {
    return (
      <Panel title={title}>
        <div className="text-sm text-danger py-4">โหลดสถานะไม่สำเร็จ</div>
      </Panel>
    );
  }
  if (isLoading || !data) {
    return (
      <Panel title={title}>
        <div className="text-sm text-muted py-4">กำลังโหลด…</div>
      </Panel>
    );
  }
  if (data.length === 0) {
    return (
      <Panel title={title} description="ยังไม่มีรอบเบิกจ่ายในเทอมนี้ (หรือยังไม่มี TA ที่อนุมัติแล้ว)">
        <div />
      </Panel>
    );
  }

  return (
    <Panel title={title} padded={false}>
      <Accordion allowsMultipleExpanded className="w-full">
        {groups.map(g => {
          // Count months this viewer's role can currently act on, so the
          // header flags who needs attention without expanding every card.
          const actionable = g.rows.filter(r => nextActionFor(r, role)).length;
          return (
            <Accordion.Item key={g.taId} id={g.taId}>
              <Accordion.Heading>
                <Accordion.Trigger className="flex items-center gap-2 w-full px-4">
                  <span className="font-medium text-ink-1 truncate">{g.taName}</span>
                  <Chip tone="neutral">{g.rows.length} งวด</Chip>
                  {actionable > 0 && <Chip tone="warn">{actionable} รอดำเนินการ</Chip>}
                  <Accordion.Indicator className="ml-auto" />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="px-0 pb-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm sm:min-w-0">
                      <thead className="bg-slate-50 text-ink-2">
                        <tr>
                          <th className="w-8 px-2 py-2"></th>
                          <th className="text-left px-3 py-2">งวด</th>
                          <th className="text-left px-3 py-2">สถานะ</th>
                          <th className="text-right px-3 py-2 pr-4">การดำเนินการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(row => {
                          const k = rowKey(row);
                          const isOpen = !!expanded[k];
                          const nextAction = nextActionFor(row, role);
                          const sendBackTo = sendBackTargetFor(row, role);
                          const busy = pendingKey === k;
                          return (
                            <Fragment key={k}>
                              <tr className="border-t border-hairline">
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    aria-label={isOpen ? "ซ่อนขั้นตอน" : "ดูขั้นตอน"}
                                    onClick={() => setExpanded(x => ({ ...x, [k]: !x[k] }))}
                                    className="p-1 text-ink-2 hover:text-ink-1"
                                  >
                                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </button>
                                </td>
                                <td className="px-3 py-2">{row.period_label}</td>
                                <td className="px-3 py-2">
                                  {(() => {
                                    const b = statusBadge(row);
                                    return <Chip tone={b.tone}>{b.label}</Chip>;
                                  })()}
                                </td>
                                <td className="px-3 py-2 text-right pr-4">
                                  <div className="inline-flex items-center gap-2">
                                    {sendBackTo && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setExpanded(x => ({ ...x, [k]: true }));
                                          setSendBackOpen(x => ({ ...x, [k]: true }));
                                        }}
                                        disabled={busy}
                                      >
                                        <Undo2 size={12} /> ตีกลับ
                                      </Button>
                                    )}
                                    {nextAction && (
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setExpanded(x => ({ ...x, [k]: true }))}
                                        disabled={busy}
                                      >
                                        <Send size={12} /> {nextAction.label}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr className="border-t border-hairline bg-slate-50/40">
                                  <td colSpan={4} className="px-3 py-3">
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <SubmissionTimeline data={row} title="สถานะการอนุมัติ" />
                                      {sendBackTo && sendBackOpen[k] && (
                                        <div className="rounded-xl border border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30 p-3">
                                          <div className="text-sm font-medium text-ink-1 mb-2">
                                            ตีกลับไปขั้น &ldquo;{STATUS_LABEL[sendBackTo]}&rdquo;
                                          </div>
                                          <TextArea
                                            placeholder="เหตุผลการตีกลับ (บังคับ)"
                                            rows={3}
                                            value={sendBackDraft[k] ?? ""}
                                            onChange={e =>
                                              setSendBackDraft(x => ({ ...x, [k]: e.target.value }))
                                            }
                                          />
                                          <div className="flex justify-end gap-2 mt-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => setSendBackOpen(x => ({ ...x, [k]: false }))}
                                              disabled={busy}
                                            >
                                              ยกเลิก
                                            </Button>
                                            <Button
                                              variant="primary"
                                              size="sm"
                                              onClick={() => sendBack(row, sendBackTo)}
                                              disabled={busy || !(sendBackDraft[k] ?? "").trim()}
                                            >
                                              {busy ? "กำลังบันทึก…" : "ยืนยันตีกลับ"}
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                      {nextAction && (
                                        <div className="rounded-xl border border-hairline bg-white/60 dark:bg-slate-900/40 p-3">
                                          <div className="text-sm font-medium text-ink-1 mb-2">
                                            {nextAction.label}
                                          </div>
                                          <TextArea
                                            placeholder="ความคิดเห็น (ไม่บังคับ)"
                                            rows={3}
                                            value={commentDraft[k] ?? ""}
                                            onChange={e =>
                                              setCommentDraft(x => ({ ...x, [k]: e.target.value }))
                                            }
                                          />
                                          <div className="flex justify-end mt-2">
                                            <Button
                                              variant="primary"
                                              size="sm"
                                              onClick={() => act(row, nextAction.kind)}
                                              disabled={busy}
                                            >
                                              {busy ? "กำลังบันทึก…" : `ยืนยัน ${nextAction.label}`}
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Panel>
  );
}
