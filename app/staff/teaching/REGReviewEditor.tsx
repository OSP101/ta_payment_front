"use client";

import { cloneElement, useId, useMemo, useState, type ReactElement } from "react";
import { Button, Alert } from "../../components/ui";
import { useI18n } from "../../lib/i18n/client";

export interface REGIssue { id: string; severity: "error" | "warning"; code: string; section_id?: string; message: string }
export interface REGSlot { day: number; start: string; end: string; kind: string; room: string; pending: boolean; raw: string }
export interface REGSection {
  source_cells: string[]; id: string; source_row: number; sec_no: string; track: string; reserved_for: string;
  curriculum: string; students: number | null; pending_reason: string; schedules: REGSlot[];
}
export interface REGCourse {
  source_cells: string[]; code: string; name: string; unit: string; level: string; source_row: number; officer_raw: string;
  lecturer_ids: string[]; unassigned_reason: string; skip: boolean; skip_reason: string;
  existing_id: string; existing_version: string; merge_into: string; sections: REGSection[];
}
export interface REGReview {
  file_sha256: string; validation_hash: string; courses: REGCourse[]; acknowledged: string[];
  confirmed: boolean; issues: REGIssue[]; lecturers: { id: string; name: string; email?: string }[]; ready: boolean;
}

const control = "w-full min-w-0 rounded-md border border-(--hairline) bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-slate-50 disabled:text-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return <div className="grid min-w-0 gap-1 text-sm"><label htmlFor={id} className="font-medium">{label}</label>{cloneElement(children as ReactElement<{ id: string }>, { id })}</div>;
}

/** Each section is kept intact, with its complete multiline REG text beside
 * editable timetable rows. Editing invalidates the server validation token. */
export default function REGReviewEditor({ review, onChange, disabled }: {
  review: REGReview; onChange: (r: REGReview) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(review.courses[0]?.code ?? "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const acknowledged = new Set(review.acknowledged);
  const issuesByCode = useMemo(() => {
    const result = new Map<string, REGIssue[]>();
    for (const issue of review.issues) result.set(issue.code, [...(result.get(issue.code) ?? []), issue]);
    return result;
  }, [review.issues]);
  const unresolved = (code: string) => (issuesByCode.get(code) ?? []).filter(i => i.severity === "error" || !acknowledged.has(i.id));
  const visible = review.courses.filter(c => {
    if (!`${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase())) return false;
    return filter === "all" || (filter === "pending" && unresolved(c.code).length > 0) || (filter === "skipped" && c.skip);
  });
  const course = review.courses.find(c => c.code === selected);
  const courseIssues = course ? issuesByCode.get(course.code) ?? [] : [];
  const remaining = review.courses.filter(c => unresolved(c.code).length > 0).length;
  function edit(code: string, update: (c: REGCourse) => REGCourse) {
    const ids = new Set((issuesByCode.get(code) ?? []).map(i => i.id));
    onChange({ ...review, courses: review.courses.map(c => c.code === code ? update(c) : c),
      acknowledged: review.acknowledged.filter(id => !ids.has(id)), confirmed: false, ready: false, validation_hash: "" });
  }
  function section(id: string, patch: Partial<REGSection>) {
    if (course) edit(course.code, c => ({ ...c, sections: c.sections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }
  function slot(sec: REGSection, index: number, patch: Partial<REGSlot>) {
    section(sec.id, { schedules: sec.schedules.map((s, i) => i === index ? { ...s, ...patch } : s) });
  }
  function acknowledge(id: string, checked: boolean) {
    onChange({ ...review, acknowledged: checked ? [...new Set([...review.acknowledged, id])] : review.acknowledged.filter(x => x !== id),
      validation_hash: "", confirmed: false, ready: false });
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted">{t("ตรวจรายวิชา Section วัน เวลา ห้อง และการจับคู่อาจารย์ให้ครบ รายการที่ยังไม่ทราบต้องระบุเหตุผล ข้อมูลจะบันทึกพร้อมกันเมื่อผ่านการตรวจสอบทั้งชุด")}</p>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-(--hairline) pb-3 text-sm" aria-live="polite">
      <span>{t("ทั้งหมด")} <strong>{review.courses.length}</strong> {t("วิชา")}</span>
      <span>{t("ต้องตรวจหรือยืนยัน")} <strong>{remaining}</strong> {t("วิชา")}</span>
      <span>{t("ข้าม")} <strong>{review.courses.filter(c => c.skip).length}</strong> {t("วิชา")}</span>
      {!review.validation_hash && <span className="font-medium">{t("มีการแก้ไข กรุณากดตรวจสอบอีกครั้ง")}</span>}
    </div>
    <fieldset disabled={disabled} className="grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <legend className="sr-only">{t("ตรวจสอบข้อมูลนำเข้า REG")}</legend>
      <aside className="min-w-0 space-y-3">
        <Field label={t("ค้นหารหัสหรือชื่อวิชา")}><input className={control} value={search} onChange={e => setSearch(e.target.value)} type="search" /></Field>
        <Field label={t("แสดงรายวิชา")}><select className={control} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{t("ทั้งหมด")}</option><option value="pending">{t("ต้องตรวจหรือยืนยัน")}</option><option value="skipped">{t("ข้ามการนำเข้า")}</option>
        </select></Field>
        <nav aria-label={t("รายวิชาจาก REG")} className="max-h-56 space-y-1 overflow-y-auto lg:max-h-[65vh]">
          {visible.map(c => <button key={c.code} type="button" aria-current={selected === c.code ? "true" : undefined}
            onClick={() => setSelected(c.code)} className={`w-full rounded-md px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-accent ${selected === c.code ? "bg-accent-soft text-accent-soft-foreground" : "hover:bg-slate-50"}`}>
            <span className="flex justify-between gap-2 font-semibold"><span>{c.code}</span><span>{c.skip ? t("ข้าม") : unresolved(c.code).length ? `${unresolved(c.code).length} ${t("รายการ")}` : t("ตรวจครบ")}</span></span>
            <span className="mt-1 block break-words whitespace-pre-wrap">{c.name}</span>
          </button>)}
          {visible.length === 0 && <p className="p-3 text-sm text-muted">{t("ไม่พบรายวิชาตามตัวกรอง")}</p>}
        </nav>
      </aside>
      {course && <article className="min-w-0 space-y-6" aria-label={`${t("ตรวจวิชา")} ${course.code}`}>
        <div className="space-y-2 border-b border-(--hairline) pb-4">
          <h3 className="text-lg font-semibold">{course.code} · {t("แถว")} {course.source_row}</h3>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={course.skip} disabled={!!course.existing_id}
            onChange={e => edit(course.code, c => ({ ...c, skip: e.target.checked }))} />{course.existing_id ? t("มีในระบบแล้ว — ข้ามและเก็บข้อมูลเดิม") : t("ข้ามวิชานี้ โดยไม่ลบออกจากประวัติการตรวจสอบ")}</label>
          {course.skip && <Field label={t("เหตุผลที่ข้าม")}><input className={control} value={course.skip_reason} onChange={e => edit(course.code, c => ({ ...c, skip_reason: e.target.value }))} /></Field>}
        </div>
        {!course.skip && <>
          <details className="rounded-md bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-medium">{t("ข้อมูลวิชาต้นฉบับจาก REG")}</summary><p className="mt-2 break-words whitespace-pre-wrap">{course.source_cells?.slice(0, 4).filter(Boolean).join("\n") || course.code}</p></details>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("ชื่อวิชา")}><textarea rows={2} className={control} value={course.name} onChange={e => edit(course.code, c => ({ ...c, name: e.target.value }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("หน่วยกิต (บรรยาย-ปฏิบัติ-ศึกษาด้วยตนเอง)")}><input className={control} value={course.unit} onChange={e => edit(course.code, c => ({ ...c, unit: e.target.value }))} /></Field>
              <Field label={t("ระดับการศึกษา")}><select className={control} value={course.level} onChange={e => edit(course.code, c => ({ ...c, level: e.target.value }))}><option value="undergrad">{t("ปริญญาตรี")}</option><option value="graduate">{t("บัณฑิตศึกษา")}</option></select></Field>
            </div>
          </div>
          <section className="space-y-3" aria-label={t("อาจารย์ผู้สอน")}>
            <h4 className="font-semibold">{t("อาจารย์ผู้สอนและผู้รับผิดชอบหลัก")}</h4>
            <p className="break-words whitespace-pre-wrap text-sm">{t("ข้อความจาก REG")}: {course.officer_raw || t("ไม่ระบุ")}</p>
            <p className="text-sm text-muted">{t("ลำดับแรกเป็นผู้รับผิดชอบหลัก ตรวจชื่อที่จับคู่ก่อนยืนยัน")}</p>
            {course.lecturer_ids.map((id, i) => <div className="flex min-w-0 gap-2" key={`${id}:${i}`}>
              <select aria-label={`${t("อาจารย์ลำดับ")} ${i + 1}`} className={control} value={id} onChange={e => edit(course.code, c => ({ ...c, lecturer_ids: c.lecturer_ids.map((x, n) => n === i ? e.target.value : x) }))}>
                <option value="">{t("เลือกอาจารย์")}</option>{review.lecturers.map(l => <option key={l.id} value={l.id}>{l.name}{l.email ? ` · ${l.email}` : ""}</option>)}
              </select>
              {i > 0 && <Button size="sm" variant="secondary" onClick={() => edit(course.code, c => ({ ...c, lecturer_ids: [id, ...c.lecturer_ids.filter((_, n) => n !== i)] }))}>{t("ตั้งเป็นหลัก")}</Button>}
              <Button size="sm" variant="secondary" onClick={() => edit(course.code, c => ({ ...c, lecturer_ids: c.lecturer_ids.filter((_, n) => n !== i) }))}>{t("นำออก")}</Button>
            </div>)}
            <Button size="sm" variant="secondary" onClick={() => edit(course.code, c => ({ ...c, lecturer_ids: [...c.lecturer_ids, ""] }))}>{t("เพิ่มอาจารย์")}</Button>
            {course.lecturer_ids.length === 0 && <Field label={t("เหตุผลที่ยังไม่ผูกอาจารย์ (ต้องเติมภายหลัง)")}><input className={control} value={course.unassigned_reason} onChange={e => edit(course.code, c => ({ ...c, unassigned_reason: e.target.value }))} /></Field>}
          </section>
          <Field label={t("รหัสวิชาหลัก หากยืนยันว่าเรียนรวมกัน (ว่าง = เปิดแยก)")}>
            <select className={control} value={course.merge_into} onChange={e => edit(course.code, c => ({ ...c, merge_into: e.target.value }))}>
              <option value="">{t("เปิดแยกเป็นรายวิชา")}</option>{review.courses.filter(c => c.code !== course.code && (!c.skip || c.existing_id)).map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
          <p className="text-sm text-muted">{t("การเรียนรวมจะรวมจำนวนผู้เรียนเข้าวิชาหลักและใช้ตารางของวิชาหลักเมื่อ Section ตรงกัน ตรวจให้แน่ใจก่อนเลือก")}</p>
          <div className="space-y-6">
            {course.sections.map(sec => <section key={sec.id} className="min-w-0 space-y-4 border-t border-(--hairline) pt-5" aria-label={`Section ${sec.sec_no} ${sec.track}`}>
              <h4 className="font-semibold">Section {sec.sec_no} · {sec.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")} · {t("แถว")} {sec.source_row}</h4>
              <details className="rounded-md bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-medium">{t("ดูข้อความต้นฉบับ REG ทั้งหมดของ Section")}</summary>
                <p className="mt-2 break-words whitespace-pre-wrap">{sec.reserved_for || t("ไม่ระบุกลุ่มผู้เรียน")}</p>
                {sec.source_cells?.length ? <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[t("รหัสวิชา"), t("ชื่อวิชา"), t("หน่วยกิต"), t("วิชาบังคับก่อน"), "Section", t("สำหรับ"), t("จำนวนรับ"), t("วันเรียน"), t("เวลาเรียน"), t("วันที่สอบกลางภาค"), t("เวลาสอบกลางภาค"), t("วันที่สอบปลายภาค"), t("เวลาสอบปลายภาค"), t("อาจารย์ประจำวิชา")].map((label, i) => sec.source_cells[i] ? <div key={i} className="min-w-0"><dt className="font-medium">{label}</dt><dd className="break-words whitespace-pre-wrap">{sec.source_cells[i]}</dd></div> : null)}
                </dl> : <pre className="mt-2 break-words whitespace-pre-wrap font-sans">{sec.schedules.map(s => s.raw).filter(Boolean).join("\n") || t("REG ไม่มีเวลาเรียน")}</pre>}
              </details>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label={t("เลข Section")}><input className={control} value={sec.sec_no} onChange={e => section(sec.id, { sec_no: e.target.value })} /></Field>
                <Field label={t("ประเภทภาค")}><select className={control} value={sec.track} onChange={e => section(sec.id, { track: e.target.value })}><option value="regular">{t("ปกติ")}</option><option value="special">{t("พิเศษ")}</option></select></Field>
                <Field label={t("จำนวนรับจาก REG (ยังไม่ใช่ยอดลงทะเบียนจริง)")}><input className={control} type="number" min={0} max={3000} step={1} value={sec.students ?? ""} onChange={e => section(sec.id, { students: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label={t("กลุ่มหลักสูตรหลัก")}><select className={control} value={sec.curriculum} onChange={e => section(sec.id, { curriculum: e.target.value })}><option value="">{t("ต้องเลือก")}</option>{["CS", "IT", "GIS", "AI", "CY", "KKBS", "OTHER"].map(k => <option value={k} key={k}>{k === "OTHER" ? t("OTHER — คณะอื่น / กลุ่มทั่วไป") : k}</option>)}</select></Field>
              </div>
              <div className="space-y-3">
                {sec.schedules.map((sch, i) => <div key={i} className="space-y-2 rounded-md bg-slate-50 p-3" aria-label={`${t("คาบที่")} ${i + 1}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={sch.pending} onChange={e => slot(sec, i, { pending: e.target.checked })} />{t("ยังไม่กำหนดตาราง เก็บไว้เติมภายหลัง")}</label>
                    <Button size="sm" variant="secondary" onClick={() => section(sec.id, { schedules: sec.schedules.filter((_, n) => n !== i) })}>{t("ลบคาบ")}</Button></div>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <Field label={t("วันเรียน")}><select className={control} value={sch.day} onChange={e => slot(sec, i, { day: Number(e.target.value) })}><option value={-1}>{t("ยังไม่ระบุ")}</option>{[t("อาทิตย์"), t("จันทร์"), t("อังคาร"), t("พุธ"), t("พฤหัสบดี"), t("ศุกร์"), t("เสาร์")].map((d, n) => <option key={n} value={n}>{d}</option>)}</select></Field>
                    <Field label={t("เริ่ม")}><input className={control} type="time" value={sch.start} onChange={e => slot(sec, i, { start: e.target.value })} /></Field>
                    <Field label={t("สิ้นสุด")}><input className={control} type="time" value={sch.end} onChange={e => slot(sec, i, { end: e.target.value })} /></Field>
                    <Field label={t("ประเภทคาบ")}><select className={control} value={sch.kind} onChange={e => slot(sec, i, { kind: e.target.value })}><option value="">{t("เลือกประเภทคาบ")}</option><option value="lecture">Lec</option><option value="lab">Lab</option></select></Field>
                    <Field label={t("ห้อง (เว้นว่างได้)")}><input className={control} value={sch.room} onChange={e => slot(sec, i, { room: e.target.value })} /></Field>
                  </div>
                </div>)}
                <Button size="sm" variant="secondary" onClick={() => section(sec.id, { schedules: [...sec.schedules, { day: -1, start: "", end: "", kind: "lecture", room: "", pending: false, raw: "" }] })}>{t("เพิ่มคาบเรียน")}</Button>
                {(sec.schedules.length === 0 || sec.schedules.some(s => s.pending)) && <Field label={t("เหตุผลที่ตารางยังไม่ครบ และสิ่งที่ต้องเติมภายหลัง")}><textarea className={control} rows={2} value={sec.pending_reason} onChange={e => section(sec.id, { pending_reason: e.target.value })} /></Field>}
              </div>
            </section>)}
          </div>
        </>}
        {courseIssues.length > 0 && <section className="space-y-3 border-t border-(--hairline) pt-4" aria-label={t("ผลตรวจรายวิชา")}>
          <h4 className="font-semibold">{t("ผลตรวจและรายการที่ต้องยืนยัน")}</h4>
          {!review.validation_hash && <p className="text-sm text-muted">{t("ผลตรวจนี้มาจากการตรวจครั้งล่าสุด กดตรวจสอบอีกครั้งเพื่ออัปเดตตามค่าที่แก้ไข")}</p>}
          {courseIssues.map(issue => issue.severity === "error" ? <Alert key={issue.id} status="danger" title={issue.message} /> :
            <label key={issue.id} className="flex items-start gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-1 shrink-0" checked={acknowledged.has(issue.id)} onChange={e => acknowledge(issue.id, e.target.checked)} /><span className="min-w-0 break-words whitespace-pre-wrap">{issue.message}</span></label>)}
        </section>}
      </article>}
    </fieldset>
  </div>;
}
