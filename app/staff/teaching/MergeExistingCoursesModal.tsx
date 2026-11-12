"use client";
import { useEffect, useRef, useState } from "react";
import { GitMerge } from "lucide-react";
import { api } from "../../lib/api";
import { Modal, Button, Alert } from "../../components/ui";
import { useI18n } from "../../lib/i18n/client";
import REGSearchSelect from "./REGSearchSelect";

type Section = { id: string; sec_no: string; track: string; students: number; data: { schedules: { day_of_week: number; start_time: string; end_time: string; kind: string; room?: string }[]; exams: { kind: string; exam_date: string; start_time: string; end_time: string }[]; reg_pending_schedule?: boolean } };
type Course = { id: string; code: string; name: string; alt_codes: string[]; credits: number; lecture: number; lab: number; self: number; level: string; sections: Section[]; data: { lecturers: { name: string; email: string; is_primary: boolean }[] } };
type Preview = { source: Course; target: Course; blockers: string[]; token: string };
export default function MergeExistingCoursesModal({ termId, courses, onClose, onMerged }: {
 termId: string; courses: { id: string; code: string; name_th: string; exported_at?: string | null }[]; onClose: () => void; onMerged: () => void;
}) {
 const { t } = useI18n();
 const [target, setTarget] = useState(""); const [source, setSource] = useState("");
 const [preview, setPreview] = useState<Preview | null>(null);
 const [mapping, setMapping] = useState<Record<string, string>>({});
 const [checkedToken, setCheckedToken] = useState(""); const [approved, setApproved] = useState(false);
 const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 const serial = useRef(0);
 useEffect(() => { serial.current++; setTarget(""); setSource(""); setPreview(null); setMapping({}); setCheckedToken(""); setApproved(false); setBusy(false); setError(""); }, [termId]);
 function change(which: "target" | "source", value: string) {
  serial.current++; if (which === "target") setTarget(value); else setSource(value);
  setPreview(null); setMapping({}); setCheckedToken(""); setApproved(false); setError("");
 }
 const mappings = () => Object.entries(mapping).filter(([,v])=>v!=="?").map(([source,target])=>({source,target:target||null}));
 async function inspect() {
  if (!target || !source || target===source) return;
  const request = ++serial.current; setBusy(true); setError(""); setApproved(false); setCheckedToken("");
  try { const data = await api.post<Preview>(`/teaching-courses/${target}/merge-existing`,{source_id:source,mappings:mappings()});
   if (request!==serial.current) return;
   setPreview(data);
   if (Object.keys(mapping).length===0) setMapping(Object.fromEntries(data.source.sections.map(s=>[s.id,"?"])));
   if (data.blockers.length===0) setCheckedToken(data.token);
  } catch(e) { if(request===serial.current) setError((e as Error).message); }
  finally { if(request===serial.current) setBusy(false); }
 }
 async function commit() {
  if (!approved || !checkedToken || busy) return;
  setBusy(true); setError("");
  try { await api.post(`/teaching-courses/${target}/merge-existing?commit=1`,{source_id:source,mappings:mappings(),token:checkedToken,confirmed:true}); onMerged(); }
  catch(e) { setError((e as Error).message); setCheckedToken(""); setApproved(false); }
  finally { setBusy(false); }
 }
 const weekdays=[t("อาทิตย์"),t("จันทร์"),t("อังคาร"),t("พุธ"),t("พฤหัสบดี"),t("ศุกร์"),t("เสาร์")];
 function timetable(section: Section) { return <div className="mt-2 space-y-1 text-xs text-muted">{section.data.schedules.map((s,i)=><p key={i}>{weekdays[s.day_of_week]} {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {s.kind} · {s.room||t("ไม่ระบุห้อง")}</p>)}{!section.data.schedules.length&&<p>{t("ยังไม่มีตารางเรียน")}</p>}{section.data.exams.map((e,i)=><p key={`exam-${i}`}>{t("สอบ")} {e.kind} · {e.exam_date} {e.start_time}–{e.end_time}</p>)}</div>; }
 const eligible=courses.filter(c=>!c.exported_at);
 return <Modal open onClose={()=>{if(!busy)onClose();}} title={t("รวมวิชาที่เปิดแล้ว")} icon={<GitMerge size={18}/>} size="3xl" footer={<div className="flex w-full flex-wrap items-center justify-end gap-2"><Button variant="tertiary" disabled={busy} onPress={onClose}>{t("ยกเลิก")}</Button><Button variant="secondary" disabled={busy||!target||!source||target===source} isPending={busy} onPress={inspect}>{preview?t("ตรวจตัวอย่างอีกครั้ง"):t("ดูข้อมูลก่อนรวม")}</Button><Button variant="primary" disabled={busy||!approved||!checkedToken} onPress={commit}>{t("ยืนยันรวมวิชา")}</Button></div>}>
  <div className="space-y-5">
   <p className="text-sm text-muted">{t("ใช้เมื่อเปิดวิชาแยกกันไปแล้ว เลือกวิชาหลักที่จะเก็บชื่อ หน่วยกิต และผู้รับผิดชอบไว้ ระบบจะรวมรหัส อาจารย์ และจำนวนผู้เรียน โดยวิชาที่นำมารวมจะไม่แสดงเป็นวิชาแยกอีก")}</p>
   {error&&<Alert status="danger" title={t("รวมวิชาไม่สำเร็จ")} description={error}/>}
   <div className="grid gap-4 sm:grid-cols-2">
    <REGSearchSelect label={t("วิชาหลักที่จะเก็บไว้")} placeholder={t("เลือกวิชาหลัก")} searchLabel={t("ค้นหาวิชาหลักด้วยรหัสหรือชื่อ")} emptyText={t("ไม่พบวิชา")} value={target} disabled={busy} options={eligible.filter(c=>c.id!==source).map(c=>({id:c.id,label:c.code,description:c.name_th}))} onChange={v=>change("target",v)}/>
    <REGSearchSelect label={t("วิชาที่จะนำมารวม")} placeholder={t("เลือกวิชาที่เปิดแยกไว้")} searchLabel={t("ค้นหาวิชาที่จะรวมด้วยรหัสหรือชื่อ")} emptyText={t("ไม่พบวิชา")} value={source} disabled={busy} options={eligible.filter(c=>c.id!==target).map(c=>({id:c.id,label:c.code,description:c.name_th}))} onChange={v=>change("source",v)}/>
   </div>
   <p className="text-xs text-muted">{t("รวมได้ในภาคการศึกษาเดียวกัน และยังไม่มีข้อมูลใช้งานผูกอยู่ วิชาที่ส่งออกเอกสารแล้วจะไม่อยู่ในรายการ ให้เลือก CP เป็นวิชาหลักก่อน SC และรหัสตัวเลข")}</p>
   {preview&&<>
    {preview.blockers.length>0&&<Alert status="warning" title={t("รายการที่ต้องจัดการก่อนรวม")} description={preview.blockers.join("\n")}/>}
    <div className="grid gap-4 sm:grid-cols-2">{[preview.target,preview.source].map((c,i)=><section key={c.id} className="min-w-0 rounded-lg border border-(--hairline) bg-(--panel-bg) p-4"><h3 className="font-semibold">{i===0?t("วิชาหลัก"):t("วิชาที่จะรวม")}: {c.code}</h3><p className="mt-1 text-sm">{c.name}</p><p className="mt-1 text-sm">{t("หน่วยกิต")} {c.credits} ({c.lecture}-{c.lab}-{c.self}) · {c.level}</p><p className="mt-2 text-sm">{t("ผู้เรียน")} {c.sections.reduce((n,s)=>n+s.students,0)} {t("คน")}</p><ul className="mt-2 space-y-1 text-xs text-muted">{c.data.lecturers.map((l,j)=><li key={j}>{l.name} · {l.email}{l.is_primary?` (${t("ผู้รับผิดชอบหลัก")})`:""}</li>)}</ul>{c.sections.map(s=><div key={s.id} className="mt-3 border-t border-(--hairline) pt-3"><strong className="text-sm">Section {s.sec_no} · {s.track==="special"?t("พิเศษ"):t("ปกติ")} · {s.students} {t("คน")}</strong>{timetable(s)}</div>)}</section>)}</div>
    <fieldset disabled={busy} className="space-y-4"><legend className="mb-3 font-semibold">{t("กำหนด Section หลังรวม")}</legend>
     {preview.source.sections.map(s=><label key={s.id} className="block rounded-lg border border-(--hairline) p-3 text-sm"><span className="mb-2 block font-medium">{preview.source.code} · Section {s.sec_no} · {s.track==="special"?t("พิเศษ"):t("ปกติ")} · {s.students} {t("คน")}</span><select aria-label={`${t("จัดการ Section")} ${s.sec_no} ${s.track}`} className="w-full rounded-md border border-(--hairline) bg-(--panel-bg) p-2" value={mapping[s.id]??"?"} onChange={e=>{setMapping({...mapping,[s.id]:e.target.value});setCheckedToken("");setApproved(false);}}><option value="?">{t("เลือกวิธีจัดการ Section")}</option><option value="">{t("คงเป็น Section แยก พร้อมตารางและกำหนดสอบเดิม")}</option>{preview.target.sections.filter(dst=>dst.track===s.track).map(dst=><option key={dst.id} value={dst.id}>{t("รวมผู้เรียนเข้ากับ")} {preview.target.code} · Section {dst.sec_no} ({dst.students+s.students} {t("คน")})</option>)}</select></label>)}
    </fieldset>
    <Alert status="default" title={t("ตารางและกำหนดสอบหลังรวม")} description={t("เมื่อรวมผู้เรียนเข้า Section ของวิชาหลัก จะใช้ตารางและกำหนดสอบของ Section ปลายทาง ส่วน Section ที่คงแยกจะเก็บตารางเดิม ข้อมูลก่อนรวมทั้งหมดจะเก็บในประวัติการตรวจสอบ")}/>
    <section className="rounded-lg border border-(--hairline) p-4"><h3 className="mb-3 font-semibold">{t("ตัวอย่างผู้เรียนหลังรวมตามการเลือก")}</h3><ul className="space-y-2 text-sm">{preview.target.sections.map(dst=><li key={dst.id}>{preview.target.code} · Section {dst.sec_no} · {dst.track==="special"?t("พิเศษ"):t("ปกติ")}: {dst.students+preview.source.sections.filter(s=>mapping[s.id]===dst.id).reduce((n,s)=>n+s.students,0)} {t("คน")}</li>)}{preview.source.sections.filter(s=>mapping[s.id]==="").map(s=><li key={s.id}>{preview.source.code} · Section {s.sec_no} ({t("คงแยก")}): {s.students} {t("คน")}</li>)}</ul></section>
    <p className="font-medium">{t("จำนวนผู้เรียนรวมหลังรวม")} {preview.target.sections.concat(preview.source.sections).reduce((n,s)=>n+s.students,0)} {t("คน")}</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={!checkedToken||busy} onChange={e=>setApproved(e.target.checked)}/>{t("ฉันตรวจวิชาหลัก การจับคู่ Section ตารางเรียน และจำนวนผู้เรียนแล้ว และยืนยันว่าวิชาเหล่านี้เรียนรวมกันจริง")}</label>
   </>}
  </div>
 </Modal>;
}
