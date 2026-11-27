"use client";
import { useState } from "react";
import useSWR from "swr";
import { CalendarClock, CheckCircle2, CircleAlert } from "lucide-react";
import { Alert, Button, Modal, Select } from "./ui";
import { msg, useI18n, type TFn } from "../lib/i18n/client";
import TAWeeklyConflictTimetable from "./TAWeeklyConflictTimetable";

export interface Slot {
  source: "requested" | "own_class" | "teaching";
  course_id: string; course_code: string; course_name: string;
  section_id: string; section_no: string; kind: string;
  day_of_week: number; start_time: string; end_time: string; state: string;
}
export interface Pair { requested: Slot; existing: Slot; blocking: boolean; overlap_start: string; overlap_end: string; }
interface Schedule { ta_name: string; has_schedule: boolean; slots: Slot[]; conflicts: Pair[]; }
const days = [msg("อาทิตย์"), msg("จันทร์"), msg("อังคาร"), msg("พุธ"), msg("พฤหัสบดี"), msg("ศุกร์"), msg("เสาร์")];
const kindLabel = (slot: Slot, t: TFn) => slot.source === "own_class" ? t("เรียน") : slot.kind === "lab" ? t("ปฏิบัติการ") : t("บรรยาย");
const sourceLabel = (slot: Slot, t: TFn) => slot.source === "requested" ? t("วิชาที่กำลังขอ") : slot.source === "own_class" ? t("ตารางเรียน") : t("ช่วยสอน · อนุมัติแล้ว");

function SlotDescription({ slot }: { slot: Slot }) {
  const { t } = useI18n();
  return <div className="min-w-0 space-y-1">
    <p className="font-medium break-words">{slot.course_code || t("ไม่ระบุชื่อวิชา")}{slot.course_name ? ` · ${slot.course_name}` : ""}</p>
    <p className="text-sm">{t(days[slot.day_of_week])} {slot.start_time}–{slot.end_time} · {kindLabel(slot, t)}{slot.section_no ? ` · Sec ${slot.section_no}` : ""}</p>
    {slot.state === "dropped" && <p className="text-sm text-danger-soft-foreground">{t("ภาระงานถูกตัดออกจากคำขอ")}</p>}
  </div>;
}

export default function TAConflictScheduleModal({ open, onClose, taId, taName, courseId }: {
  open: boolean; onClose: () => void; taId: string; taName: string; courseId: string;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState("");
  const { data, error, isLoading, mutate } = useSWR<{ schedule?: Schedule }>(open
    ? `/ta-requests/preview-conflicts?ta_id=${encodeURIComponent(taId)}&teaching_course_id=${encodeURIComponent(courseId)}&include_schedule=1` : null);
  const schedule = data?.schedule;
  const requested = [...new Map((schedule?.slots ?? []).filter(s => s.source === "requested").map(s => [s.section_id, s])).values()];
  const conflicts = (schedule?.conflicts ?? []).filter(p => !section || p.requested.section_id === section);
  const requestedSlots = (schedule?.slots ?? []).filter(s => s.source === "requested" && (!section || s.section_id === section));
  const pairsFor = (slot: Slot) => conflicts.filter(p => p.requested.section_id === slot.section_id && p.requested.kind === slot.kind && p.requested.day_of_week === slot.day_of_week && p.requested.start_time === slot.start_time && p.requested.end_time === slot.end_time);
  const freeCount = requestedSlots.filter(s => pairsFor(s).length === 0).length;
  const slots = [...(schedule?.slots ?? [])].filter(s => s.source !== "requested" || !section || s.section_id === section).sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || a.start_time.localeCompare(b.start_time));
  return <Modal open={open} onClose={onClose} size="3xl" icon={<CalendarClock size={18} />}
    title={t("เวลาชนและตารางของ {name}", { name: schedule?.ta_name ?? taName })}
    footer={<Button variant="secondary" onClick={onClose}>{t("ปิด")}</Button>}>
    {error || (data && !schedule) ? <div className="space-y-3" role="alert">
      <Alert status="danger" title={t("โหลดรายละเอียดตารางไม่สำเร็จ")} description={t("กรุณาลองอีกครั้งเพื่อดูรายวิชาและเวลาที่ทับซ้อน")} />
      <Button variant="secondary" onClick={() => mutate()}>{t("ลองอีกครั้ง")}</Button>
    </div> : isLoading || !schedule ? <p role="status" className="py-8 text-muted">{t("กำลังโหลดตารางเรียนและตารางช่วยสอน…")}</p> : <div className="space-y-6">
      <p className="text-sm text-muted">{t("เปรียบเทียบคาบของวิชาที่กำลังขอกับตารางเรียนและรายวิชาที่อนุมัติให้ช่วยสอนแล้วในภาคการศึกษาเดียวกัน คำขอที่ปฏิเสธหรือยกเลิกไม่นำมาคิดเวลาชน")}</p>
      <section className="space-y-3" aria-label={t("รายละเอียดเวลาชน")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-semibold">{t("ตารางคาบที่ขอได้")}</h3>
          <label className="text-sm space-y-1"><span className="block">{t("Section ที่ต้องการตรวจ")}</span><Select value={section} onChange={e => setSection(e.target.value)}>
            <option value="">{t("ทุก Section")}</option>
            {requested.map(s => <option key={s.section_id} value={s.section_id}>Sec {s.section_no}</option>)}
          </Select></label>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">{t("ไม่ชน {free} คาบ · ชน {blocked} คาบ", { free: freeCount, blocked: requestedSlots.length - freeCount })}</p>
          <p>{t("ส่งคำขอคาบที่ไม่ชนได้ คาบที่ชนจะถูกตัดทั้งคาบ ไม่แบ่งเฉพาะนาทีที่ว่าง ส่วนงานตรวจและงานอื่นนอกคาบยังขอได้")}</p>
          {!schedule.has_schedule && <p className="text-muted">{t("ผลนี้ยังไม่รวมตารางเรียนที่ TA ยังไม่ได้บันทึก")}</p>}
        </div>
        <TAWeeklyConflictTimetable slots={slots} conflicts={conflicts} />
        <h3 className="font-semibold pt-3">{t("ผลแยกรายคาบ")}</h3>
        <p className="text-sm text-muted sm:hidden">{t("เลื่อนตารางไปด้านข้างเพื่อดูผลและเวลาที่ทับซ้อน")}</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--hairline)]" tabIndex={0} role="region" aria-label={t("ตารางเปรียบเทียบคาบที่ขอและช่วงเวลาที่ทับซ้อน")}>
          <table className="w-full min-w-[660px] text-left text-sm">
            <caption className="sr-only">{t("ตารางคาบที่ขอได้")}</caption>
            <thead className="bg-surface-secondary"><tr>{[msg("วัน / คาบที่ขอ"), msg("Section / ประเภท"), msg("ผลสำหรับงานในคาบ"), msg("ชนกับ / ช่วงที่ทับ")].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{t(label)}</th>)}</tr></thead>
            <tbody>{requestedSlots.map((slot, i) => {
              const pairs = pairsFor(slot);
              return <tr key={i} className="border-t border-[var(--hairline)] align-top">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{t(days[slot.day_of_week])}<br />{slot.start_time}–{slot.end_time}</td>
                <th scope="row" className="px-4 py-3 font-normal">Sec {slot.section_no}<br />{kindLabel(slot, t)}</th>
                <td className="px-4 py-3"><span className="flex gap-2 items-start font-medium">{pairs.length ? <CircleAlert aria-hidden size={16} className="shrink-0 mt-0.5" /> : <CheckCircle2 aria-hidden size={16} className="shrink-0 mt-0.5 text-success" />}{pairs.length ? t("ชน · ตัดคาบนี้ทั้งคาบ") : t("ไม่ชน · ส่งคำขอได้")}</span>{pairs.length > 0 && <p className="mt-1 tabular-nums text-muted">{t("ตัดคาบ {start}–{end}", { start: slot.start_time, end: slot.end_time })}</p>}</td>
                <td className="px-4 py-3">{pairs.length ? <ul className="space-y-3">{pairs.map((pair, j) => <li key={j}>
                  <p className="font-medium break-words">{pair.existing.course_code || t("ตารางเรียน")}{pair.existing.section_no ? ` · Sec ${pair.existing.section_no}` : ""}</p>
                  <p>{kindLabel(pair.existing, t)} <span className="tabular-nums">{pair.existing.start_time}–{pair.existing.end_time}</span></p>
                  <p className="font-medium tabular-nums">{t("ทับเฉพาะ {start}–{end}", { start: pair.overlap_start, end: pair.overlap_end })}</p>
                </li>)}</ul> : t("ไม่มีเวลาทับซ้อน")}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <h3 className="font-semibold pt-3">{t("รายละเอียดเวลาชน")} ({conflicts.length})</h3>
        {conflicts.length === 0 ? <p className="rounded-lg bg-surface-secondary p-4 text-sm">{t("ไม่พบเวลาทับซ้อนสำหรับ Section ที่แสดง")}</p> : <ul className="space-y-4">
          {conflicts.map((pair, i) => <li key={i} className="rounded-lg border border-[var(--hairline)] overflow-hidden">
            <div className="bg-surface-secondary px-4 py-3 space-y-1">
              <p className={pair.blocking ? "font-semibold text-danger-soft-foreground" : "font-semibold"}>{pair.blocking ? t("ชนกับรายวิชาอื่นที่ช่วยสอน · ตัดเฉพาะคาบนี้") : t("ชนกับตารางเรียน · ตัดเฉพาะคาบนี้")}</p>
              <p className="text-sm tabular-nums">{t("ช่วงที่ทับซ้อน: {day} {start}–{end}", { day: t(days[pair.requested.day_of_week]), start: pair.overlap_start, end: pair.overlap_end })}</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-2"><p className="text-sm text-muted">{t("วิชาที่กำลังขอ")}</p><SlotDescription slot={pair.requested} /></div>
              <div className="space-y-2"><p className="text-sm text-muted">{sourceLabel(pair.existing, t)}</p><SlotDescription slot={pair.existing} /></div>
            </div>
          </li>)}
        </ul>}
      </section>
      <section className="space-y-3" aria-label={t("ตารางเรียนและช่วยสอนทั้งสัปดาห์")}>
        <h3 className="font-semibold">{t("ตารางเรียนและช่วยสอนทั้งสัปดาห์")}</h3>
        <p className="text-sm text-muted">{t("แสดงทุก Section ของวิชาที่กำลังขอเพื่อเปรียบเทียบ ตารางนี้เป็นคาบรายสัปดาห์ที่บันทึกในระบบ ไม่ใช่ชั่วโมงปฏิบัติงานจริง")}</p>
        <p className="text-sm text-muted sm:hidden">{t("เลื่อนตารางไปด้านข้างเพื่อดูชื่อวิชาและ Section")}</p>
        {!schedule.has_schedule && <Alert status="warning" title={t("TA ยังไม่ได้บันทึกตารางเรียนในภาคการศึกษานี้")} description={t("จึงยังตรวจเวลาชนกับตารางเรียนไม่ได้")} />}
        {schedule.has_schedule && !slots.some(s => s.source === "own_class") && <p className="text-sm text-muted">{t("มีข้อมูลตารางเรียนแล้ว แต่ไม่มีคาบเรียนที่ระบุวันและเวลา เช่น WBA")}</p>}
        {slots.length === 0 ? <p className="text-sm text-muted">{t("ยังไม่มีคาบที่ระบุวันและเวลา")}</p> : <div className="overflow-x-auto rounded-lg border border-[var(--hairline)]" tabIndex={0} role="region" aria-label={t("ตารางรายสัปดาห์ เลื่อนแนวนอนเพื่อดูข้อมูลครบ")}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">{t("ตารางเรียนและช่วยสอนทั้งสัปดาห์")}</caption>
            <thead className="bg-surface-secondary"><tr>{[msg("วันและเวลา"), msg("ประเภท"), msg("รายวิชา / Section")].map(label => <th scope="col" className="px-4 py-3 font-medium" key={label}>{t(label)}</th>)}</tr></thead>
            <tbody>{slots.map((slot, i) => <tr key={i} className="border-t border-[var(--hairline)] align-top">
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">{t(days[slot.day_of_week])}<br />{slot.start_time}–{slot.end_time}</td>
              <td className="px-4 py-3"><span className={slot.source === "requested" ? "font-medium text-brand" : ""}>{sourceLabel(slot, t)}</span><br />{kindLabel(slot, t)}</td>
              <td className="px-4 py-3"><p className="break-words">{slot.course_code || t("ไม่ระบุชื่อวิชา")} {slot.course_name}</p>{slot.section_no && <p className="text-muted">Sec {slot.section_no}</p>}{slot.state === "dropped" && <p className="text-danger-soft-foreground">{t("ภาระงานถูกตัดออกจากคำขอ")}</p>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>}
  </Modal>;
}
