"use client";
import { useState } from "react";
import { Button } from "../../components/ui";
import { useI18n } from "../../lib/i18n/client";
import type { REGReview } from "./REGReviewEditor";
import REGSearchSelect from "./REGSearchSelect";
import { canBulkAcknowledge, planREGBulk, REG_CURRICULA, regIssueKind, type REGBulkAction } from "./regReviewBulk";

const kindLabels: Record<string, string> = {
  lecturer_match: "รายชื่ออาจารย์ที่จับคู่แล้ว", name_lines: "ชื่อวิชาหลายบรรทัด", shared_name: "ชื่อวิชาเหมือนกัน", merge: "ยืนยันเรียนรวม",
  zero: "จำนวนรับเป็นศูนย์", multi_programme: "รับหลายหลักสูตร", shared: "ข้อความเรียนรวมใน REG", pending: "ตารางยังไม่ครบ",
  room: "ยังไม่ระบุห้อง", rooms: "หลายห้องในเวลาเดียวกัน", hours: "ชั่วโมงไม่ตรงหน่วยกิต", track_override: "ประเภทภาคต่างจาก REG",
  total: "จำนวนรับรวมสูง", day_alias: "การแปลรหัสวันเรียน", alignment: "จำนวนบรรทัดวันและเวลา", correction: "ค่าที่แก้ไขจาก REG", other: "รายการอื่น — อ่านรายละเอียดแต่ละรายการ",
};
export default function REGReviewBulkTools({ review, visibleCodes, selectedCode, disabled, onChange, onClose }: {
  review: REGReview; visibleCodes: string[]; selectedCode: string; disabled: boolean; onChange: (review: REGReview) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [codes, setCodes] = useState([selectedCode]);
  const [type, setType] = useState<REGBulkAction["type"]>("curriculum");
  const [curriculum, setCurriculum] = useState("");
  const [track, setTrack] = useState("regular");
  const [level, setLevel] = useState("undergrad");
  const [lecturer, setLecturer] = useState("");
  const [primary, setPrimary] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [kinds, setKinds] = useState<string[]>([]);
  const [approved, setApproved] = useState("");
  const [applied, setApplied] = useState(0);
  const courses = review.courses.filter(c => visibleCodes.includes(c.code) && !c.skip && !c.existing_id);
  const scoped = codes.filter(code => courses.some(c => c.code === code));
  const action: REGBulkAction = type === "curriculum" ? { type, value: curriculum, onlyMissing }
    : type === "track" ? { type, value: track } : type === "level" ? { type, value: level }
    : type === "lecturer" ? { type, value: lecturer, primary } : { type, kinds };
  const plan = planREGBulk(review, scoped, action);
  const signature = JSON.stringify([action, scoped, plan.changes]);
  const groups = [...new Set(review.issues.filter(i => scoped.includes(i.code) && canBulkAcknowledge(i) && !review.acknowledged.includes(i.id)).map(regIssueKind))];
  const manualCount = review.issues.filter(i => scoped.includes(i.code) && i.severity === "warning" && !canBulkAcknowledge(i) && !review.acknowledged.includes(i.id)).length;
  const displayValue = (value: string) => ({ regular: t("ภาคปกติ"), special: t("ภาคพิเศษ"), undergrad: t("ปริญญาตรี"), graduate: t("บัณฑิตศึกษา") }[value] || value || t("ยังไม่ระบุ"));
  return <section className="reg-review-block reg-bulk-tools" aria-label={t("จัดการหลายรายการ")}>
    <div className="reg-block-heading"><h4>{t("กำหนดขอบเขตและค่าใหม่")}</h4><Button size="sm" variant="tertiary" onPress={onClose}>{t("ปิดเครื่องมือ")}</Button></div>
    <p className="text-sm text-muted">{t("เลือกวิชาและตรวจรายการที่จะเปลี่ยนก่อนใช้ค่า ทุกการเปลี่ยนแปลงจะถูกตรวจซ้ำก่อนบันทึกจริง")}</p>
    {applied > 0 && <p role="status" className="reg-bulk-result">{t("ใช้ค่ากับ {n} รายการแล้ว", { n: applied })}</p>}
    <fieldset disabled={disabled} className="reg-bulk-form">
      <legend className="sr-only">{t("กำหนดขอบเขตและค่าใหม่")}</legend>
      <div className="reg-bulk-scope">
        <div className="reg-bulk-scope-heading"><strong>{t("วิชาที่เลือก {n} จาก {total} วิชา", { n: scoped.length, total: courses.length })}</strong>
          <Button size="sm" variant="secondary" onPress={() => setCodes(courses.map(c => c.code))}>{t("เลือกทุกวิชาที่แสดง")}</Button>
          <Button size="sm" variant="tertiary" onPress={() => setCodes([])}>{t("ล้างการเลือกวิชา")}</Button></div>
        <p className="text-xs text-muted">{t("อิงผลค้นหาและตัวกรองด้านซ้าย ข้ามวิชาที่มีอยู่ในระบบและวิชาที่เลือกข้ามเสมอ")}</p>
        <div className="reg-bulk-course-options" role="group" aria-label={t("เลือกวิชาสำหรับทำพร้อมกัน")}>
          {courses.map(c => <label key={c.code}><input type="checkbox" checked={scoped.includes(c.code)} onChange={e => setCodes(e.target.checked ? [...codes, c.code] : codes.filter(code => code !== c.code))} /><span><strong>{c.code}</strong> {c.name}<small>REG: {c.officer_raw || t("ไม่ระบุอาจารย์")}</small></span></label>)}
          {!courses.length && <p>{t("ไม่มีวิชาที่แก้ไขได้ในผลค้นหานี้")}</p>}
        </div>
      </div>
      <label className="reg-review-field"><span>{t("สิ่งที่ต้องการทำพร้อมกัน")}</span><select aria-label={t("สิ่งที่ต้องการทำพร้อมกัน")} className="reg-review-control" value={type} onChange={e => { setType(e.target.value as REGBulkAction["type"]); setApplied(0); }}>
        <option value="curriculum">{t("กำหนดกลุ่มหลักสูตร")}</option><option value="track">{t("กำหนดประเภทภาค")}</option><option value="level">{t("กำหนดระดับการศึกษา")}</option><option value="lecturer">{t("เพิ่มอาจารย์ผู้สอน")}</option><option value="acknowledge">{t("ยืนยันคำเตือนที่ตรวจแล้ว")}</option>
      </select></label>
      {type === "curriculum" && <><label className="reg-review-field"><span>{t("กลุ่มหลักสูตรที่จะใช้")}</span><select aria-label={t("กลุ่มหลักสูตรที่จะใช้")} className="reg-review-control" value={curriculum} onChange={e => setCurriculum(e.target.value)}><option value="">{t("เลือกกลุ่มหลักสูตร")}</option>{REG_CURRICULA.map(k => <option key={k} value={k}>{k === "OTHER" ? t("OTHER — คณะอื่น / กลุ่มทั่วไป") : k}</option>)}</select></label><label className="reg-bulk-choice"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />{t("เติมเฉพาะ Section ที่ยังไม่มีกลุ่มหลักสูตรที่ถูกต้อง")}</label></>}
      {type === "track" && <label className="reg-review-field"><span>{t("ประเภทภาคที่จะใช้")}</span><select aria-label={t("ประเภทภาคที่จะใช้")} className="reg-review-control" value={track} onChange={e => setTrack(e.target.value)}><option value="regular">{t("ภาคปกติ")}</option><option value="special">{t("ภาคพิเศษ")}</option></select></label>}
      {type === "level" && <label className="reg-review-field"><span>{t("ระดับการศึกษาที่จะใช้")}</span><select aria-label={t("ระดับการศึกษาที่จะใช้")} className="reg-review-control" value={level} onChange={e => setLevel(e.target.value)}><option value="undergrad">{t("ปริญญาตรี")}</option><option value="graduate">{t("บัณฑิตศึกษา")}</option></select></label>}
      {type === "lecturer" && <><REGSearchSelect label={t("อาจารย์ที่จะเพิ่มให้วิชาที่เลือก")} placeholder={t("เลือกอาจารย์")} searchLabel={t("ค้นหาอาจารย์สำหรับหลายวิชา")} emptyText={t("ไม่พบอาจารย์ ลองค้นหาด้วยอีเมล")} value={lecturer} options={review.lecturers.map(l => ({ id: l.id, label: l.name, description: l.email }))} disabled={disabled} onChange={setLecturer} /><label className="reg-bulk-choice"><input type="checkbox" checked={primary} onChange={e => setPrimary(e.target.checked)} />{t("ให้อาจารย์คนนี้เป็นผู้รับผิดชอบหลักของวิชาที่เลือก")}</label><p className="text-xs text-muted">{t("คงอาจารย์เดิมไว้ เพิ่มบัญชีที่เลือกโดยไม่ซ้ำ ตรวจชื่อเต็มและอีเมลก่อนใช้กับหลายวิชา")}</p></>}
      {type === "acknowledge" && <div className="reg-bulk-kinds"><strong>{t("เลือกประเภทคำเตือนที่ตรวจแล้ว")}</strong>{groups.map(kind => <label className="reg-bulk-choice" key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={e => setKinds(e.target.checked ? [...kinds, kind] : kinds.filter(k => k !== kind))} />{t(kindLabels[kind] || kindLabels.other)} ({review.issues.filter(i => scoped.includes(i.code) && regIssueKind(i) === kind && canBulkAcknowledge(i) && !review.acknowledged.includes(i.id)).length})</label>)}
        {!groups.length && <p>{t("ไม่มีคำเตือนที่ยืนยันพร้อมกันได้ในวิชาที่เลือก")}</p>}
        {manualCount > 0 && <p className="text-xs text-muted">{t("อีก {n} รายการเกี่ยวกับชื่ออาจารย์ที่ยังจับคู่ไม่ได้หรือยังไม่ผูกบัญชี ต้องตรวจและตัดสินใจทีละรายการ", { n: manualCount })}</p>}
        {!review.validation_hash && <p role="status" className="reg-stale-notice">{t("รอผลตรวจล่าสุดก่อนยืนยันหลายรายการ")}</p>}
      </div>}
      <div className="reg-bulk-preview"><strong>{t("รายการที่จะเปลี่ยน {n} รายการ", { n: plan.changes.length })}</strong>
        <div className="reg-bulk-preview-scroll" tabIndex={0} role="region" aria-label={t("ตัวอย่างรายการที่จะเปลี่ยน")}>
          {plan.changes.map(change => <div key={change.id}><strong>{change.code}{change.section ? ` · Section ${change.section}` : ""}{change.track ? ` · ${displayValue(change.track)}` : ""}{change.sourceRow ? ` · ${t("แถว")} ${change.sourceRow}` : ""}</strong>
            {change.message ? <><p>{change.message}</p>{regIssueKind(review.issues.find(i => i.id === change.id)!) === "lecturer_match" && <p>{t("บัญชีที่เลือก")}: {review.courses.find(c => c.code === change.code)?.lecturer_ids.map(id => { const l = review.lecturers.find(l => l.id === id); return `${l?.name} (${l?.email || id})`; }).join(", ")}</p>}</> : <p>{displayValue(change.before)} → {displayValue(change.after)}</p>}
          </div>)}
          {!plan.changes.length && <p className="text-muted">{t("เลือกวิชาและค่าที่จะใช้ ระบบจะแสดงรายการที่เปลี่ยนจริงที่นี่")}</p>}
        </div>
      </div>
      <label className="reg-bulk-choice"><input type="checkbox" checked={approved === signature && plan.changes.length > 0} disabled={!plan.changes.length} onChange={e => setApproved(e.target.checked ? signature : "")} />{t("ฉันตรวจรายละเอียดและขอบเขตรายการข้างต้นแล้ว")}</label>
      <Button variant="primary" disabled={!plan.changes.length || approved !== signature || disabled} onPress={() => { onChange(plan.review); setApplied(plan.changes.length); setApproved(""); }}>{type === "acknowledge" ? t("ยืนยัน {n} รายการ", { n: plan.changes.length }) : t("ใช้ค่ากับ {n} รายการ", { n: plan.changes.length })}</Button>
    </fieldset>
  </section>;
}
