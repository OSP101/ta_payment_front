"use client";

import { useI18n, msg } from "../lib/i18n/client";
import type { Slot, Pair } from "./TAConflictScheduleModal";
import styles from "./TAWeeklyConflictTimetable.module.css";

const week = [1, 2, 3, 4, 5, 6, 0];
const dayNames = [msg("อาทิตย์"), msg("จันทร์"), msg("อังคาร"), msg("พุธ"), msg("พฤหัสบดี"), msg("ศุกร์"), msg("เสาร์")];
const sources = ["requested", "teaching", "own_class"] as const;
const minute = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const sameSlot = (a: Slot, b: Slot) => a.source === b.source && a.section_id === b.section_id && a.course_id === b.course_id && a.kind === b.kind && a.day_of_week === b.day_of_week && a.start_time === b.start_time && a.end_time === b.end_time;

// Give simultaneous sections their own lanes; adjacent periods can share one.
function placeSlots(slots: Slot[]) {
  const placed: { slot: Slot; lane: number }[] = [];
  let offset = 0;
  for (const source of sources) {
    const ends: number[] = [];
    for (const slot of slots.filter(s => s.source === source).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.section_no.localeCompare(b.section_no, undefined, { numeric: true }))) {
      let lane = ends.findIndex(end => end <= minute(slot.start_time));
      if (lane < 0) lane = ends.length;
      ends[lane] = minute(slot.end_time);
      placed.push({ slot, lane: offset + lane });
    }
    offset += ends.length;
  }
  return { placed, lanes: offset };
}

export default function TAWeeklyConflictTimetable({ slots, conflicts }: { slots: Slot[]; conflicts: Pair[] }) {
  const { t } = useI18n();
  const timed = slots.filter(s => s.state !== "dropped" && Number.isFinite(minute(s.start_time)) && minute(s.end_time) > minute(s.start_time));
  const first = Math.floor(Math.min(8 * 60, ...timed.map(s => minute(s.start_time))) / 60);
  const last = Math.ceil(Math.max(18 * 60, ...timed.map(s => minute(s.end_time))) / 60);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const position = (time: string) => (minute(time) - first * 60) / ((last - first) * 60) * 100;
  const sourceName = (slot: Slot) => t(slot.source === "requested" ? "วิชาที่กำลังขอ" : slot.source === "teaching" ? "ช่วยสอน · อนุมัติแล้ว" : "ตารางเรียน");
  const kindName = (slot: Slot) => t(slot.source === "own_class" ? "เรียน" : slot.kind === "lab" ? "ปฏิบัติการ" : "บรรยาย");

  return <section className="space-y-3" aria-label={t("ตารางเรียนแบบรายสัปดาห์")}>
    <h3 className="font-semibold">{t("ตารางเรียนแบบรายสัปดาห์")}</h3>
    <p className="text-sm text-muted">{t("อ่านจากซ้ายไปขวาตามเวลา คาบที่อยู่ตรงกันในแนวตั้งคือเวลาเดียวกัน แถบสีแดงแสดงเฉพาะช่วงที่ทับซ้อน")}</p>
    <ul className={styles.legend} aria-label={t("คำอธิบายสีในตาราง")}>
      <li><span className={styles.requestedKey} aria-hidden />{t("วิชาที่กำลังขอ")}</li>
      <li><span className={styles.teachingKey} aria-hidden />{t("ช่วยสอน · อนุมัติแล้ว")}</li>
      <li><span className={styles.ownKey} aria-hidden />{t("ตารางเรียน")}</li>
      <li><span className={styles.overlapKey} aria-hidden />{t("ช่วงเวลาที่ทับซ้อน")}</li>
    </ul>
    <p className="text-sm text-muted sm:hidden">{t("เลื่อนตารางไปด้านข้างเพื่อเทียบช่วงเวลา วันจะอยู่ด้านซ้ายเสมอ")}</p>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={t("ตารางเรียนรายสัปดาห์ เลื่อนแนวนอนเพื่อดูทุกช่วงเวลา")}>
      <div className={styles.grid} style={{ minWidth: 88 + hours.length * 84 }}>
        <div className={styles.axis}>
          <div className={styles.day}>{t("วัน / เวลา")}</div>
          <div className={styles.hours} style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
            {hours.map(h => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}
            <span className={styles.lastHour}>{String(last).padStart(2, "0")}:00</span>
          </div>
        </div>
        {week.map(day => {
          const { placed, lanes } = placeSlots(timed.filter(s => s.day_of_week === day));
          const overlaps = [...new Map(conflicts.filter(p => p.requested.day_of_week === day).map(p => [`${p.overlap_start}-${p.overlap_end}`, p])).values()];
          return <div className={styles.dayRow} key={day}>
            <div className={styles.day}>{t(dayNames[day])}</div>
            <div className={styles.track} style={{ height: lanes ? lanes * 96 + 12 : 42 }}>
              <div className={styles.lines} style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }} aria-hidden>{hours.map(h => <span key={h} />)}</div>
              {overlaps.map(pair => <div key={`${pair.overlap_start}-${pair.overlap_end}`} className={styles.overlapBand} aria-hidden style={{ left: `${position(pair.overlap_start)}%`, width: `${position(pair.overlap_end) - position(pair.overlap_start)}%` }} />)}
              {lanes === 0 && <p className={styles.empty}>{t("ไม่มีคาบ")}</p>}
              {placed.map(({ slot, lane }, i) => {
                const pairs = conflicts.filter(p => sameSlot(slot, slot.source === "requested" ? p.requested : p.existing));
                const hit = slot.source === "requested" && pairs.length > 0;
                const description = `${sourceName(slot)} · ${slot.course_code || t("ไม่ระบุชื่อวิชา")} ${slot.course_name} · Sec ${slot.section_no} · ${kindName(slot)} · ${t(dayNames[day])} ${slot.start_time}–${slot.end_time}${hit ? ` · ${t("ชน · ตัดคาบนี้ทั้งคาบ")}` : ""}`;
                return <article key={i} aria-label={description} title={description}
                  className={`${styles.event} ${styles[slot.source]} ${hit ? styles.blocked : ""}`}
                  style={{ left: `${position(slot.start_time)}%`, width: `${position(slot.end_time) - position(slot.start_time)}%`, top: lane * 96 + 6 }}>
                  <div className={styles.eventText}>
                    <p className={styles.eventTitle}>{slot.course_code || t("ไม่ระบุชื่อวิชา")}{slot.section_no ? ` · Sec ${slot.section_no}` : ""}</p>
                    <p>{kindName(slot)} · {slot.start_time}–{slot.end_time}</p>
                    <p>{hit ? t("ชน · ตัดคาบนี้ทั้งคาบ") : sourceName(slot)}</p>
                  </div>
                  {[...new Map(pairs.map(p => [`${p.overlap_start}-${p.overlap_end}`, p])).values()].map(pair => <div key={`${pair.overlap_start}-${pair.overlap_end}`} className={styles.overlapStrip}
                    aria-label={t("ทับเฉพาะ {start}–{end}", { start: pair.overlap_start, end: pair.overlap_end })}
                    style={{ left: `${(minute(pair.overlap_start) - minute(slot.start_time)) / (minute(slot.end_time) - minute(slot.start_time)) * 100}%`, width: `${(minute(pair.overlap_end) - minute(pair.overlap_start)) / (minute(slot.end_time) - minute(slot.start_time)) * 100}%` }}>
                    {pair.overlap_start}–{pair.overlap_end}
                  </div>)}
                </article>;
              })}
            </div>
          </div>;
        })}
      </div>
    </div>
    <p className="text-sm text-muted">{t("แถบแดงคือเวลาที่ชนจริง แต่คาบที่กำลังขอจะถูกตัดทั้งคาบ คาบอื่นที่ไม่ชนและงานนอกคาบยังขอได้")}</p>
  </section>;
}
