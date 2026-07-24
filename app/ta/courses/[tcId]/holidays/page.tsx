"use client";
import { use, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { CalendarOff, CheckCircle2, AlertTriangle, Bell, MapPin, Send } from "lucide-react";
import { api, ApiError } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, TextInput, Modal, Chip, Alert, EmptyState, FieldGroup,
} from "../../../../components/ui";

interface Makeup {
  id: string;
  makeup_date: string;
  start_time?: string;
  end_time?: string;
  note?: string;
}
interface AffectedSection {
  section_id: string;
  sec_no: string;
  track: string;
  kind: "lecture" | "lab";
  start_time: string;
  end_time: string;
  room?: string;
  makeup: Makeup | null;
}
interface HolidayImpact {
  original_date: string;
  day_of_week: number;
  holiday_name_th: string;
  affected_sections: AffectedSection[];
}
interface ImpactsResponse {
  impacts: HolidayImpact[];
  unresolved_count: number;
}
interface TC { id: string; code: string; name_th: string; }

const MONTH_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const KIND_LABEL: Record<string, string> = { lecture: "บรรยาย", lab: "ปฏิบัติการ" };

function formatThaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export default function TAHolidaysPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: course } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const { data: impacts, isLoading } = useSWR<ImpactsResponse>(`/teaching-courses/${tcId}/holiday-impacts`);
  const [remindTarget, setRemindTarget] = useState<HolidayImpact | null>(null);

  async function refresh() {
    await mutate(`/teaching-courses/${tcId}/holiday-impacts`);
  }

  return (
    <div>
      <PageHeader
        title="วันหยุดและวันชดเชย"
        description="วันหยุดที่ตรงกับคาบเรียนของรายวิชานี้ — ถ้าอาจารย์ยังไม่กำหนดวันชดเชย คุณจะลงเวลาปฏิบัติงานของคาบนั้นไม่ได้"
      />

      {impacts && impacts.unresolved_count > 0 && (
        <Alert
          status="warning"
          icon={<AlertTriangle size={16} />}
          title={`ยังมี ${impacts.unresolved_count} คาบที่รอวันชดเชย`}
          description="กด 'แจ้งเตือนอาจารย์' ในแต่ละคาบเพื่อขอให้อาจารย์กำหนดวันชดเชย — ระบบจะจำกัดการแจ้ง 1 ครั้ง / วัน / วันหยุด"
        />
      )}

      <div className="mt-4">
        {isLoading && !impacts ? (
          <Panel>
            <div className="flex justify-center py-10 text-sm text-muted">กำลังโหลด…</div>
          </Panel>
        ) : !impacts || impacts.impacts.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<CheckCircle2 size={28} />}
              title="ไม่มีวันหยุดที่ตรงกับคาบเรียน"
              description="ตารางเทอมนี้ไม่มีวันหยุดที่กระทบคาบเรียนของรายวิชานี้"
            />
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {impacts.impacts.map(imp => {
              const unresolvedHere = imp.affected_sections.filter(s => !s.makeup).length;
              return (
                <Panel
                  key={imp.original_date}
                  title={
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{formatThaiDate(imp.original_date)}</span>
                      <span className="text-xs text-muted">({DOW_TH[imp.day_of_week]})</span>
                      <Chip tone="danger">{imp.holiday_name_th}</Chip>
                    </span>
                  }
                  description={
                    unresolvedHere > 0
                      ? `${imp.affected_sections.length} คาบได้รับผลกระทบ · ${unresolvedHere} คาบยังไม่มีวันชดเชย`
                      : `${imp.affected_sections.length} คาบได้รับผลกระทบ · อาจารย์กำหนดวันชดเชยครบแล้ว`
                  }
                  actions={
                    unresolvedHere > 0 ? (
                      <Button variant="secondary" size="sm" onClick={() => setRemindTarget(imp)}>
                        <Bell size={13} /> แจ้งเตือนอาจารย์
                      </Button>
                    ) : undefined
                  }
                  padded={false}
                >
                  <div className="divide-y divide-(--hairline)">
                    {imp.affected_sections.map((sec, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-4 flex-wrap md:flex-nowrap">
                        <div className="w-44 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className={
                              "inline-flex items-center justify-center min-w-8 h-6 px-2 rounded-full text-xs font-semibold tabular-nums " +
                              (sec.track === "special" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground")
                            }>
                              sec {sec.sec_no}
                            </span>
                            <Chip tone={sec.kind === "lab" ? "warn" : "info"}>{KIND_LABEL[sec.kind]}</Chip>
                          </div>
                          <div className="text-xs text-muted mt-1 flex items-center gap-1 tabular-nums">
                            {sec.start_time.slice(0, 5)}–{sec.end_time.slice(0, 5)}
                            {sec.room && <><MapPin size={11} className="ml-1" /> {sec.room}</>}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          {sec.makeup ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <CheckCircle2 size={16} className="text-success" />
                              <span className="text-sm font-medium">
                                ชดเชย: {formatThaiDate(sec.makeup.makeup_date)}
                              </span>
                              {sec.makeup.start_time && sec.makeup.end_time && (
                                <span className="text-xs text-muted tabular-nums">
                                  {sec.makeup.start_time.slice(0, 5)}–{sec.makeup.end_time.slice(0, 5)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <AlertTriangle size={16} className="text-warning" />
                              <span className="text-sm text-warning-soft-foreground">อาจารย์ยังไม่ได้กำหนดวันชดเชย — คุณจะลงเวลาคาบนี้ไม่ได้</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      {remindTarget && (
        <RemindModal
          tcId={tcId}
          impact={remindTarget}
          onClose={() => setRemindTarget(null)}
          onSent={async () => { setRemindTarget(null); await refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RemindModal — sends the throttled nudge to the course's lecturer(s).
// ---------------------------------------------------------------------------

function RemindModal({
  tcId, impact, onClose, onSent,
}: {
  tcId: string;
  impact: HolidayImpact;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = useMemo(() => `${formatThaiDate(impact.original_date)} (${impact.holiday_name_th})`, [impact]);

  async function handleSend() {
    setError(null);
    setSending(true);
    try {
      await api.post(`/teaching-courses/${tcId}/holiday-impacts/${impact.original_date}/remind`, {
        note: note.trim(),
      });
      notify.success("ส่งการแจ้งเตือนให้อาจารย์แล้ว");
      await onSent();
    } catch (e) {
      // Backend returns a Thai-message 400 when the throttle rejects — surface
      // it inline so the TA understands why the send didn't go through, rather
      // than a generic toast.
      if (e instanceof ApiError && e.status === 400) {
        setError(e.message);
      } else {
        notify.error(e);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="แจ้งเตือนอาจารย์ให้กำหนดวันชดเชย"
      icon={<Bell size={18} />}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={sending}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSend} isPending={sending} disabled={sending}>
            <Send size={14} /> ส่งการแจ้งเตือน
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-surface-secondary border border-(--hairline) px-3 py-2 text-sm">
          <div className="text-xs text-muted">วันหยุดที่จะแจ้ง</div>
          <div className="font-semibold text-foreground mt-0.5">{label}</div>
        </div>

        <FieldGroup label="ข้อความเพิ่มเติม (ระบุก็ได้)" hint="ระบบจะรวมข้อความนี้ไว้ในการแจ้งเตือน">
          <TextInput
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น รบกวนอาจารย์ระบุวันชดเชยด้วยครับ"
            autoFocus
          />
        </FieldGroup>

        {error && <Alert status="warning" title={error} icon={<AlertTriangle size={14} />} />}

        <Alert
          status="default"
          icon={<CalendarOff size={14} />}
          title="ระบบจะแจ้งได้ครั้งเดียวต่อ 24 ชั่วโมง / วันหยุด"
          description="เพื่อไม่ให้อาจารย์ได้รับการแจ้งเตือนซ้ำ ๆ กรุณาอย่าลืมตรวจสอบผ่านทางอื่นด้วย"
        />
      </div>
    </Modal>
  );
}
