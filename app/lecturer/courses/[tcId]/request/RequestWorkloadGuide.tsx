"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Ban, BookOpen, Check } from "lucide-react";
import { Button, Modal } from "../../../../components/ui";
import { msg, useI18n } from "../../../../lib/i18n/client";
import styles from "./request-form.module.css";

export const requestGuidePreferenceKey = (userId: string) => `ta-payment:request-guide:v1:${userId}`;

export type WorkloadGuideTopic = "hours" | "sections" | "worklog" | "cancellation" | "plans";
const topics: { id: WorkloadGuideTopic; label: string }[] = [
  { id: "hours", label: msg("ชั่วโมงแต่ละงาน") },
  { id: "sections", label: msg("ทำไมแยก Section") },
  { id: "worklog", label: msg("TA ใช้ข้อมูลอย่างไร") },
  { id: "cancellation", label: msg("แก้ไข / ยกเลิก") },
  { id: "plans", label: msg("แผนแนะนำ") },
];
const lectureDuties = [
  { title: msg("ช่วยตรวจงาน"), text: msg("เวลาที่มอบหมายให้ตรวจงานหรือแบบฝึกหัดของกลุ่มนี้ ไม่ใช่จำนวนชั่วโมงที่วิชามีคาบบรรยาย"), example: msg("เช่น ตรวจแบบฝึกหัดสัปดาห์ละ 1 ชั่วโมง ให้กรอก 1") },
  { title: msg("เช็คชื่อ / เก็บใบงาน"), text: msg("เวลาที่ TA ช่วยเช็คชื่อหรือเก็บใบงานในคาบบรรยายของกลุ่มนี้"), example: msg("เช่น ช่วยในคาบสัปดาห์ละ 1 ชั่วโมง ให้กรอก 1") },
  { title: msg("อื่น ๆ"), text: msg("งานเกี่ยวกับการบรรยายที่มอบหมายเพิ่มเติม ต้องระบุกิจกรรมและเวลาที่ทำต่อสัปดาห์"), example: msg("เช่น เตรียมเอกสารประกอบการเรียน 0.5 ชั่วโมง ให้กรอก 0.5 และระบุรายละเอียด") },
];
const labDuties = [
  { title: msg("สอนปฏิบัติการ"), text: msg("เวลาที่ TA ช่วยสอนหรือดูแลนักศึกษาในคาบปฏิบัติการของกลุ่มนี้"), example: msg("เช่น ดูแลแล็บสัปดาห์ละ 2 ชั่วโมง ให้กรอก 2") },
  { title: msg("อื่น ๆ (ปฏิบัติการ)"), text: msg("งานปฏิบัติการอื่นที่มอบหมายแทนการสอนปฏิบัติการ ต้องระบุกิจกรรมและเวลา"), example: msg("ในแต่ละ Section เลือกได้อย่างใดอย่างหนึ่งระหว่างสอนปฏิบัติการกับงานอื่น ๆ (ปฏิบัติการ)") },
];
const graduateDuties = [
  { title: msg("ช่วยสอน"), text: msg("เวลาที่มอบหมายให้ช่วยจัดการเรียนการสอนของกลุ่มนี้"), example: msg("กรอกชั่วโมงต่อสัปดาห์ พร้อมรายละเอียดงานที่มอบหมาย") },
  { title: msg("ตรวจการบ้าน (ไม่เกิน 2 ชม./สัปดาห์)"), text: msg("เวลาที่มอบหมายให้ตรวจการบ้านของกลุ่มนี้ โดยช่องนี้มีเพดานของระบบกำกับอยู่"), example: msg("ใช้เพดานที่แสดงข้างช่องกรอก ไม่เพิ่มชั่วโมงเพื่อให้ยอดรวมครบ") },
  { title: msg("เตรียมการสอน"), text: msg("เวลาที่มอบหมายให้เตรียมเนื้อหา เอกสาร หรือกิจกรรมก่อนสอน"), example: msg("ระบุชั่วโมงและรายละเอียดให้ตรงกับงานที่มอบหมายจริง") },
  { title: msg("อื่น ๆ ระบุ"), text: msg("งานอื่นที่มอบหมายในกลุ่มนี้ ต้องระบุรายละเอียดและชั่วโมงต่อสัปดาห์"), example: msg("ภาระงานรวมกับชั่วโมงที่นำไปเบิกจ่ายอาจต่างกัน ให้ดูค่าตอบแทนประมาณการประกอบด้วย") },
];

export default function RequestWorkloadGuide({ topic, onTopicChange, onClose, onComplete, required = false, level = "undergrad" }: {
  topic: WorkloadGuideTopic | null;
  onTopicChange: (topic: WorkloadGuideTopic) => void;
  onClose: () => void;
  onComplete: (doNotShowAgain: boolean) => void;
  required?: boolean;
  level?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const selected = topic ?? "hours";
  const [visited, setVisited] = useState<Set<WorkloadGuideTopic>>(new Set());
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (topic === null) { wasOpen.current = false; return; }
    if (!wasOpen.current) {
      wasOpen.current = true;
      setVisited(new Set([topic]));
      setDoNotShowAgain(false);
    } else setVisited(previous => previous.has(topic) ? previous : new Set([...previous, topic]));
  }, [topic]);
  const allVisited = topics.every(item => visited.has(item.id));
  const selectedIndex = topics.findIndex(item => item.id === selected);
  const isLastTopic = selectedIndex === topics.length - 1;
  const isGrad = level === "master" || level === "phd";
  function duties(items: { title: string; text: string; example: string }[]) {
    return <dl className={styles.guideDuties}>{items.map(item => <div key={item.title}>
      <dt>{t(item.title)}</dt><dd><p>{t(item.text)}</p><p className={styles.guideExample}>{t(item.example)}</p></dd>
    </div>)}</dl>;
  }
  return <Modal open={topic !== null} onClose={onClose} dismissible={!required} size="xl" icon={<BookOpen size={20} />}
    title={t("คู่มือกรอกคำขอและชั่วโมง TA")}
    footer={<div className={styles.guideConfirmation}>
      {isLastTopic && <label className={styles.guideOptOut}>
        <input type="checkbox" checked={doNotShowAgain} disabled={!allVisited} onChange={e => setDoNotShowAgain(e.target.checked)} />
        <span>{t("เข้าใจแล้ว ไม่แสดงอัตโนมัติอีกบนเบราว์เซอร์นี้")}</span>
      </label>}
      {isLastTopic && required && !allVisited && <p className="text-sm text-ink-3">{t("กรุณาเปิดอ่านหัวข้อที่ยังไม่มีเครื่องหมายถูกให้ครบก่อนยืนยัน")}</p>}
      <div className={styles.guideFooterActions} role="group" aria-label={t("การนำทางคู่มือ")}>
        <span className="text-sm text-ink-3" role="status">{t("หัวข้อที่ {n} จาก {total}", { n: selectedIndex + 1, total: topics.length })}</span>
        {isLastTopic
          ? <Button disabled={required && !allVisited} onClick={() => onComplete(doNotShowAgain && allVisited)}>{t("เข้าใจแล้ว")}</Button>
          : <Button onClick={() => onTopicChange(topics[selectedIndex + 1].id)}>{t("ถัดไป")}</Button>}
      </div>
    </div>}>
    <div className={styles.guide}>
      <p className="text-ink-3">{t("ข้อมูลที่อาจารย์กำหนดจะใช้จัดงาน สร้างเวลาทำงาน และตรวจสอบการเบิกจ่ายของ TA")}</p>
      <div className={styles.guideTabs} role="tablist" aria-label={t("หัวข้อคู่มือกรอกคำขอ TA")}>
        {topics.map((item, index) => <button key={item.id} type="button" role="tab"
          id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}-panel`}
          aria-selected={selected === item.id} data-visited={visited.has(item.id) || undefined} tabIndex={selected === item.id ? 0 : -1}
          onClick={() => onTopicChange(item.id)} onKeyDown={e => {
            const next = e.key === "ArrowRight" ? (index + 1) % topics.length : e.key === "ArrowLeft" ? (index + topics.length - 1) % topics.length : e.key === "Home" ? 0 : e.key === "End" ? topics.length - 1 : -1;
            if (next < 0) return;
            e.preventDefault(); onTopicChange(topics[next].id);
            document.getElementById(`${id}-${topics[next].id}-tab`)?.focus();
          }}>{t(item.label)}{visited.has(item.id) && <Check size={13} aria-hidden="true" />}</button>)}
      </div>

      <section role="tabpanel" id={`${id}-hours-panel`} aria-labelledby={`${id}-hours-tab`} hidden={selected !== "hours"}>
        <h3>{t("กรอกเวลาของแต่ละงานใน 1 สัปดาห์")}</h3>
        <p>{t("ติ๊กเฉพาะงานที่ TA คนนี้ได้รับมอบหมาย แล้วกรอกชั่วโมงของงานนั้น งานที่ไม่ได้ทำให้เว้นไว้ ระบบรวมชั่วโมงให้อัตโนมัติ")}</p>
        <div className={styles.guideCallout}><strong>{t("ชั่วโมงต่อสัปดาห์ ไม่ใช่ชั่วโมงรวมทั้งเทอม")}</strong><p>{isGrad ? t("ตัวอย่างภาระงานบัณฑิตศึกษา: ช่วยสอน 6 ชั่วโมง + เตรียมการสอน 2 ชั่วโมง + ตรวจการบ้าน 2 ชั่วโมง เท่ากับ 10 ชั่วโมงต่อสัปดาห์") : t("ตัวอย่าง: ตรวจงาน 1 ชั่วโมง + เช็คชื่อ 1 ชั่วโมง + สอนปฏิบัติการ 2 ชั่วโมง เท่ากับ 4 ชั่วโมงต่อสัปดาห์สำหรับ Section นี้")}</p></div>
        {isGrad ? <><h4>{t("TA ปริญญาโท / ปริญญาเอก")}</h4>{duties(graduateDuties)}<p className="text-ink-3">{t("ฟอร์มบัณฑิตศึกษาตรวจภาระงานรวม 10–12 ชั่วโมงต่อสัปดาห์ตามเงื่อนไขเดิมของระบบ โดยรายละเอียดงานและการเบิกจ่ายให้ยึดช่องและประมาณการที่แสดงในฟอร์ม")}</p></>
          : <><h4>{t("ชั่วโมงบรรยาย (ปริญญาตรี)")}</h4>{duties(lectureDuties)}<h4>{t("ชั่วโมงปฏิบัติการ")}</h4>{duties(labDuties)}</>}
        <p className={styles.guideFootnote}>{t("ตัวเลขด้านบนเป็นตัวอย่างวิธีกรอก เพดานของแต่ละช่องอ้างอิงตารางสอนและเงื่อนไขที่ระบบแสดง ไม่ต้องกรอกให้เต็มเพดานทุกช่อง")}</p>
      </section>

      <section role="tabpanel" id={`${id}-sections-panel`} aria-labelledby={`${id}-sections-tab`} hidden={selected !== "sections"}>
        <h3>{t("แต่ละกลุ่มอาจมอบหมายงานไม่เหมือนกัน")}</h3>
        <p>{t("TA คนเดียวอาจช่วยครบทุกงานใน Section หนึ่ง แต่อีก Section อาจช่วยได้เฉพาะตรวจงาน เพราะติดเรียนหรือมีภาระอื่น การกรอกรวมยอดเดียวจะไม่บอกว่าชั่วโมงนั้นเป็นงานของกลุ่มไหน")}</p>
        <div className={styles.guideTable}><table><caption>{t("ตัวอย่าง TA คนเดียว รับผิดชอบต่างกันในสองกลุ่ม")}</caption><thead><tr><th scope="col">Section</th><th scope="col">{t("งานที่ได้รับมอบหมายต่อสัปดาห์")}</th></tr></thead><tbody><tr><th scope="row">Sec 1</th><td>{t("ตรวจงาน 1 ชม. + เช็คชื่อ 1 ชม. + สอนปฏิบัติการ 2 ชม.")}</td></tr><tr><th scope="row">Sec 2</th><td>{t("ตรวจงาน 0.5 ชม. โดยไม่รับงานในคาบของกลุ่มนี้")}</td></tr></tbody></table></div>
        <h4>{t("ถ้าบรรยายเรียนรวม แต่แล็บแยกกลุ่มล่ะ?")}</h4>
        <p>{t("เลือก Section ที่ TA รับผิดชอบ แล้วกรอกงานและชั่วโมงของแต่ละกลุ่มตามจริง คำขอใหม่รวมชั่วโมงทุก Section เพื่อตรวจเกณฑ์ภาระงาน ส่วนการเบิกจ่ายจะนับคาบที่สอนพร้อมกันเพียงครั้งเดียว เพราะเป็นการทำงานในช่วงเวลาเดียวกัน")}</p>
        <div className={styles.guideCallout}><strong>{t("กรอกละเอียดขึ้น เพื่อให้เวลาที่สร้างตรงกับงานจริง")}</strong><p>{t("การแยกกลุ่มทำให้รู้ว่า TA คนนี้ทำงานอะไรได้กับกลุ่มใด และช่วยตรวจสอบรายการได้รวดเร็วและถูกต้องกว่าการระบุเพียงยอดรวม")}</p></div>
      </section>

      <section role="tabpanel" id={`${id}-worklog-panel`} aria-labelledby={`${id}-worklog-tab`} hidden={selected !== "worklog"}>
        <h3>{t("คำขอของอาจารย์คือข้อมูลตั้งต้นของเวลาทำงาน TA")}</h3>
        <h4>{t("บัณฑิตศึกษา: ภาคปกติและโครงการพิเศษคิดค่าตอบแทนต่างกัน")}</h4>
        <dl className={styles.guideDuties}>
          <div><dt>{t("ภาคปกติ")}</dt><dd><strong>{t("50 บาทต่อชั่วโมง")}</strong><p>{t("กรอกชั่วโมงงานของภาคปกติให้ตรงกับที่มอบหมายในคำขอ เพื่อให้ระบบคำนวณและสร้างเวลาอัตโนมัติ จากนั้น TA ตรวจเวลาที่ทำจริงก่อนส่ง โดยเบิกจ่ายจากชั่วโมงที่ได้รับอนุมัติ")}</p></dd></div>
          <div><dt>{t("โครงการพิเศษ")}</dt><dd><strong>{t("เหมาจ่ายทั้งเทอม")}</strong><p>{t("ค่าตอบแทนใช้ยอดเหมาจ่ายของเทอมตามที่ระบบกำหนด จึงไม่ต้องกรอกเวลาของโครงการพิเศษเพื่อนำไปคูณอัตรารายชั่วโมง")}</p></dd></div>
        </dl>
        <div className={styles.guideCallout}><strong>{t("บัณฑิตศึกษาลงเวลาเพื่อคำนวณค่าตอบแทนเฉพาะภาคปกติ")}</strong><p>{t("หาก TA ดูแลทั้งภาคปกติและโครงการพิเศษ ให้กรอกและสร้างเวลาของภาคปกติเท่านั้น ส่วนโครงการพิเศษแยกคิดเป็นเงินเหมาจ่ายทั้งเทอม ไม่ต้องลงเวลาซ้ำเพื่อคิดเงินรายชั่วโมง")}</p><p>{t("ตัวอย่าง: ภาคปกติได้รับอนุมัติ 8 ชั่วโมง คิดเป็น 8 × 50 = 400 บาท ส่วนโครงการพิเศษใช้ยอดเหมาจ่ายของเทอมแยกต่างหาก")}</p></div>
        <p className={styles.guideFootnote}>{t("การกำหนดภาระงานในคำขอกับการลงเวลาเพื่อเบิกจ่ายเป็นคนละส่วน บัณฑิตศึกษายังต้องกรอกรายละเอียดภาระงานตามที่ฟอร์มคำขอกำหนด แต่ชั่วโมงที่นำไปคำนวณเงินให้แยกภาคปกติกับโครงการพิเศษตามข้างต้น")}</p>
        <h4>{t("ขั้นตอนจากคำขอสู่การลงเวลา")}</h4>
        <ol className={styles.guideSteps}>
          <li><strong>{t("อาจารย์กำหนดงานและชั่วโมงแยก Section")}</strong><p>{t("ระบุว่า TA ทำงานอะไรให้กลุ่มไหน และมอบหมายสัปดาห์ละกี่ชั่วโมง จากนั้นตรวจสอบก่อนส่งคำขอ")}</p></li>
          <li><strong>{t("TA ใช้ระบบสร้างเวลาอัตโนมัติจากคำขอที่ได้รับอนุมัติ")}</strong><p>{t("ระบบนำกิจกรรม ชั่วโมง และตารางสอนที่เกี่ยวข้องมาเตรียมรายการเวลาทำงานให้ตรงกับงานที่อาจารย์กำหนด")}</p></li>
          <li><strong>{t("TA ตรวจเวลาที่ทำจริงก่อนส่งลงเวลา")}</strong><p>{t("TA ลงเวลาได้ตามกิจกรรมและเพดานที่ได้รับอนุมัติ ไม่สามารถเพิ่มชั่วโมงเกินที่กำหนดเองได้ การสร้างเวลาอัตโนมัติยังต้องตรวจให้ตรงกับการทำงานจริง")}</p></li>
        </ol>
        <div className={styles.guideCallout}><strong>{t("ข้อมูลถูกตั้งแต่คำขอ ช่วยลดความล่าช้าในการเบิกจ่าย")}</strong><p>{t("แม้ต้องกรอกมากกว่าระบบเดิม แต่รายละเอียดนี้ช่วยตรวจสอบงานได้เร็ว ลดข้อมูลผิดและการส่งกลับไปแก้ไข จึงช่วยให้กระบวนการจ่ายค่าตอบแทนเดินต่อได้เร็วขึ้น")}</p></div>
      </section>

      <section role="tabpanel" id={`${id}-cancellation-panel`} aria-labelledby={`${id}-cancellation-tab`} hidden={selected !== "cancellation"}>
        <h3>{t("ต้องการแก้คำขอที่ส่งแล้ว ต้องยกเลิกแล้วส่งใหม่")}</h3>
        <p>{t("คำขอที่ส่งเข้าระบบแล้วไม่มีปุ่มแก้ไข หากต้องการเปลี่ยน Section กิจกรรม หรือชั่วโมงของ TA คนใด ต้องยกเลิกคำขอของคนนั้นก่อน แล้วส่งคำขอใหม่ด้วยข้อมูลที่ถูกต้อง ส่วนฉบับร่างที่ยังไม่ได้ส่งยังปรับแก้ในฟอร์มได้")}</p>
        <div className={styles.guideCallout}><strong>{t("ออกหนังสือแต่งตั้งแล้ว ยกเลิกคำขอไม่ได้")}</strong><p>{t("อาจารย์ยกเลิกได้เฉพาะคำขอที่ยังไม่ได้ออกหนังสือแต่งตั้งให้ TA คนนั้น หากออกหนังสือแล้ว ให้ติดต่อเจ้าหน้าที่เพื่อสอบถามการดำเนินการแก้ไข")}</p></div>
        <h4>{t("ยกเลิกตรงไหน และส่งใหม่อย่างไร?")}</h4>
        <ol className={styles.guideSteps}>
          <li><strong>{t("เลื่อนลงไปที่ประวัติคำขอ TA ใต้ฟอร์ม")}</strong><p>{t("ในหน้าคำขอผู้ช่วยสอนของรายวิชานี้ เลื่อนลงผ่านปุ่มส่งคำขอ จะพบตารางรายการคำขอที่ส่งแล้ว ใช้ช่องค้นหาชื่อ TA เพื่อหาคนที่ต้องการแก้ไข")}</p></li>
          <li><strong>{t("ตรวจชื่อ TA แล้วกดปุ่มยกเลิกท้ายแถว")}</strong><p>{t("เลือกเฉพาะแถวของ TA คนที่ต้องการแก้ไข กดปุ่มยกเลิกคำขอรูปวงกลมมีขีดทับ ซึ่งอยู่ข้างปุ่มดูรายละเอียดรูปตา บนมือถือให้ดูที่ท้ายการ์ดของคนนั้น")}</p><p className="flex items-center gap-2 mt-2"><Ban size={16} aria-hidden="true" /><span>{t("ชื่อปุ่ม: ยกเลิกคำขอ / ข้อความเมื่อชี้เมาส์: ยกเลิกคำขอนี้")}</span></p></li>
          <li><strong>{t("ตรวจหน้าต่างยืนยัน แล้วกดยืนยันยกเลิก")}</strong><p>{t("ระบบจะแสดงหน้าต่าง “ยกเลิกคำขอ TA นี้?” ตรวจว่ากำลังยกเลิกคนที่ถูกต้อง แล้วกด “ยืนยันยกเลิก” รอให้รายการนั้นเปลี่ยนเป็นสถานะ “ยกเลิก” ก่อนส่งใหม่")}</p></li>
          <li><strong>{t("กลับไปเพิ่ม TA คนเดิม แล้วส่งข้อมูลใหม่")}</strong><p>{t("กลับขึ้นไปที่ส่วน “กำหนดภาระงานรายคน” กด “เพิ่ม TA” เลือกชื่อ TA คนเดิม ระบุ Section กิจกรรม และชั่วโมงที่แก้ไขแล้ว จากนั้นตรวจสรุปและกด “ส่งคำขอ” อีกครั้ง ใช้บัญชี TA เดิมได้ ไม่ต้องสร้างบัญชีใหม่")}</p></li>
        </ol>
        <p className={styles.guideFootnote}>{t("ยกเลิกเฉพาะคำขอของ TA คนที่ต้องการแก้ไข ไม่ต้องยกเลิก TA คนอื่นที่ส่งพร้อมกัน คำขอเดิมจะเป็นประวัติการยกเลิก ส่วนข้อมูลที่ส่งใหม่จะเป็นคำขอใหม่")}</p>
        <h4>{t("ถ้าไม่พบปุ่มยกเลิก หรือระบบแจ้งว่ายกเลิกไม่ได้")}</h4>
        <p>{t("ให้ติดต่อเจ้าหน้าที่ พร้อมแจ้งรายวิชา ชื่อ TA และข้อมูลที่ต้องการแก้ไข ระบบตรวจสถานะและข้อมูลที่ผูกกับคำขอด้วย เช่น มีการลงเวลาทำงานแล้ว หรือมีเอกสารเบิกจ่ายออกแล้ว อาจยกเลิกไม่ได้แม้ยังไม่ออกหนังสือแต่งตั้ง")}</p>
      </section>

      <section role="tabpanel" id={`${id}-plans-panel`} aria-labelledby={`${id}-plans-tab`} hidden={selected !== "plans"}>
        <h3>{t("แผนแนะนำเป็นตัวช่วยตัดสินใจ อาจารย์ปรับได้")}</h3>
        <p>{t("ระบบใช้ตารางสอนและงบประมาณเพื่อเสนอจำนวน TA ภาระงาน และค่าตอบแทนประมาณการ ให้อาจารย์ใช้ประกอบการวางแผน")}</p>
        <ul className={styles.guideList}><li>{t("ขอ TA น้อยกว่าหรือมากกว่าจำนวนที่ระบบแนะนำได้")}</li><li>{t("ปรับคนที่รับผิดชอบ Section กิจกรรม และชั่วโมงให้เหมาะกับการสอนจริงได้")}</li><li>{t("ไม่จำเป็นต้องกดใช้แผนแนะนำ สามารถกำหนดจำนวนและกรอกภาระงานเองได้ทั้งหมด")}</li></ul>
        <div className={styles.guideCallout}><strong>{t("จำนวนแนะนำไม่ใช่จำนวนขั้นต่ำหรือสูงสุดของคำขอ")}</strong><p>{t("เมื่อใช้แผนแล้วก็ยังแก้ไขต่อได้ ส่วนงบประมาณและเงื่อนไขชั่วโมงจะตรวจจากข้อมูลที่อาจารย์กรอกจริง แยกจากคำแนะนำ")}</p></div>
      </section>
      <p className={styles.guideReminder}>{t("แผนของระบบเป็นเพียงคำแนะนำ อาจารย์เลือกจำนวน TA และปรับภาระงานตามความเหมาะสมได้")}</p>
    </div>
  </Modal>;
}
