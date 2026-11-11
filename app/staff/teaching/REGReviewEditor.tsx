"use client";

import { cloneElement, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardCheck, FileText, List, TriangleAlert } from "lucide-react";
import { Button } from "../../components/ui";
import REGSearchSelect from "./REGSearchSelect";
import REGReviewBulkTools from "./REGReviewBulkTools";
import { useI18n } from "../../lib/i18n/client";

export interface REGIssue { id: string; kind?: string; severity: "error" | "warning"; code: string; section_id?: string; message: string }
export interface REGSlot { day: number; start: string; end: string; kind: string; room: string; pending: boolean; raw: string }
export interface REGSection {
  source_rows?: { row: number; cells: string[] }[]; source_capacity?: number;
  source_cells: string[]; id: string; source_row: number; sec_no: string; track: string; reserved_for: string;
  curriculum: string; students: number | null; pending_reason: string; schedules: REGSlot[];
}
export interface REGCourse {
  source_format?: string; source_headers?: string[];
  source_cells: string[]; code: string; name: string; unit: string; level: string; source_row: number; officer_raw: string;
  lecturer_ids: string[]; unassigned_reason: string; skip: boolean; skip_reason: string;
  unmatched_officer_names?: string[];
  lecturer_match_verified?: boolean;
  existing_id: string; existing_version: string; merge_into: string; sections: REGSection[];
}
export interface REGReview {
  file_sha256: string; validation_hash: string; courses: REGCourse[]; acknowledged: string[];
  confirmed: boolean; issues: REGIssue[]; lecturers: { id: string; name: string; email?: string }[]; ready: boolean;
}

type Attention = "error" | "warning" | undefined;
const control = "reg-review-control";
const rawSourceHeaders = ["รหัสวิชา", "ชื่อวิชา", "หน่วยกิต", "วิชาบังคับก่อน", "Section", "สำหรับ", "จำนวนรับ", "วันเรียน", "เวลาเรียน", "วันที่สอบกลางภาค", "เวลาสอบกลางภาค", "วันที่สอบปลายภาค", "เวลาสอบปลายภาค", "อาจารย์ประจำวิชา"];
function SourceCells({ cells, headers }: { cells: string[]; headers?: string[] }) {
  const { t } = useI18n();
  return <dl className="mt-3 grid gap-2 sm:grid-cols-2">{cells.map((cell, i) => cell ? <div key={i} className="min-w-0"><dt className="font-medium">{t((headers ?? rawSourceHeaders)[i] || `Column ${i + 1}`)}</dt><dd className="break-words whitespace-pre-wrap">{cell}</dd></div> : null)}</dl>;
}

function Field({ label, children, attention }: { label: string; children: React.ReactNode; attention?: Attention }) {
  const id = useId();
  const { t } = useI18n();
  return <div className="reg-review-field" data-severity={attention}>
    <div className="reg-field-label"><label htmlFor={id}>{label}</label>{attention && <span>{attention === "error" ? t("ต้องแก้") : t("ต้องตรวจ")}</span>}</div>
    {cloneElement(children as ReactElement<{ id: string; "aria-invalid"?: boolean }>, { id, "aria-invalid": attention === "error" || undefined })}
  </div>;
}

function IssueMarker({ issues, acknowledged }: { issues: REGIssue[]; acknowledged: Set<string> }) {
  const { t } = useI18n();
  const errors = issues.filter(i => i.severity === "error").length;
  const pending = issues.filter(i => i.severity === "warning" && !acknowledged.has(i.id)).length;
  if (!issues.length) return null;
  return <span className="reg-status" data-severity={errors ? "error" : pending ? "warning" : "complete"}>
    {errors ? <AlertCircle size={14} /> : pending ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}
    {errors ? t("ต้องแก้ {n}", { n: errors }) : pending ? t("รอยืนยัน {n}", { n: pending }) : t("ยืนยันแล้ว")}
  </span>;
}

/** Each section is kept intact, with its complete multiline REG text beside
 * editable timetable rows. Editing invalidates the server validation token. */
export default function REGReviewEditor({ review, onChange, disabled, validationState = "idle", onRefreshLecturers }: {
  review: REGReview; onChange: (r: REGReview) => void; disabled: boolean;
  onRefreshLecturers?: () => void;
  validationState?: "idle" | "waiting" | "checking" | "failed";
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(review.courses[0]?.code ?? "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [mobilePane, setMobilePane] = useState<"courses" | "details" | "issues">("details");
  const [activeTarget, setActiveTarget] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addingLecturer, setAddingLecturer] = useState(false);
  const [lecturerSearch, setLecturerSearch] = useState({ index: -1, request: 0 });
  const detailScroll = useRef<HTMLDivElement>(null);
  const issueScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { detailScroll.current?.scrollTo({ top: 0 }); issueScroll.current?.scrollTo({ top: 0 }); setActiveTarget(""); setAddingLecturer(false); setLecturerSearch({ index: -1, request: 0 }); }, [selected]);
  const acknowledged = new Set(review.acknowledged);
  const issuesByCode = useMemo(() => {
    const result = new Map<string, REGIssue[]>();
    for (const issue of review.issues) result.set(issue.code, [...(result.get(issue.code) ?? []), issue]);
    return result;
  }, [review.issues]);
  const unresolved = (code: string) => (issuesByCode.get(code) ?? []).filter(i => i.severity === "error" || !acknowledged.has(i.id));
  const lecturerByID = useMemo(() => new Map(review.lecturers.map(l => [l.id, l])), [review.lecturers]);
  const visible = review.courses.filter(c => {
    const teachers = c.lecturer_ids.map(id => lecturerByID.get(id)).map(l => l ? `${l.name} ${l.email ?? ""}` : "").join(" ");
    const haystack = `${c.code} ${c.name} ${c.officer_raw} ${teachers}`.normalize("NFC").toLocaleLowerCase();
    if (!search.trim().normalize("NFC").toLocaleLowerCase().split(/\s+/).every(word => haystack.includes(word))) return false;
    return filter === "all" || (filter === "pending" && unresolved(c.code).length > 0) || (filter === "skipped" && c.skip);
  });
  const course = review.courses.find(c => c.code === selected);
  const courseIssues = (course ? [...(issuesByCode.get(course.code) ?? [])] : []).sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error"));
  const activeIssues = courseIssues.filter(i => i.severity === "error" || !acknowledged.has(i.id));
  const completedIssues = courseIssues.filter(i => i.severity === "warning" && acknowledged.has(i.id));
  function attention(sectionID: string, terms?: RegExp): Attention {
    const pending = courseIssues.filter(i => (i.section_id ?? "") === sectionID && (!terms || terms.test(i.message)) && (i.severity === "error" || !acknowledged.has(i.id)));
    return pending.some(i => i.severity === "error") ? "error" : pending.length ? "warning" : undefined;
  }
  function goToIssue(issue: REGIssue) {
    const target = issue.section_id || (/อาจารย์/.test(issue.message) ? "lecturers" : /เรียนรวม|รหัสหลัก/.test(issue.message) ? "merge" : "basic");
    setMobilePane("details"); setBulkOpen(false); setActiveTarget(target);
    requestAnimationFrame(() => {
      const scroller = detailScroll.current;
      const node = Array.from(scroller?.querySelectorAll<HTMLElement>("[data-reg-target]") ?? []).find(n => n.dataset.regTarget === target);
      if (!scroller || !node) return;
      scroller.scrollTo({ top: node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12, behavior: "instant" });
      node.focus({ preventScroll: true });
    });
  }
  const remaining = review.courses.filter(c => unresolved(c.code).length > 0).length;
  function edit(code: string, update: (c: REGCourse) => REGCourse) {
    // Server issue IDs include the relevant facts. Unrelated corrections keep
    // their acknowledgements; changed facts generate new, unacknowledged IDs.
    onChange({ ...review, courses: review.courses.map(c => c.code === code ? update(c) : c),
      confirmed: false, ready: false, validation_hash: "" });
  }
  function section(id: string, patch: Partial<REGSection>) {
    if (course) edit(course.code, c => ({ ...c, sections: c.sections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }
  function slot(sec: REGSection, index: number, patch: Partial<REGSlot>) {
    section(sec.id, { schedules: sec.schedules.map((s, i) => i === index ? { ...s, ...patch } : s) });
  }
  function changeLecturer(index: number, id: string) {
    if (!course) return;
    setLecturerSearch(s => ({ ...s, index: -1 }));
    if (index === course.lecturer_ids.length) {
      if (!id) return;
      edit(course.code, c => ({ ...c, lecturer_ids: [...c.lecturer_ids, id] }));
      setAddingLecturer(false);
    } else edit(course.code, c => ({ ...c, lecturer_ids: id ? c.lecturer_ids.map((old, i) => i === index ? id : old) : c.lecturer_ids.filter((_, i) => i !== index) }));
  }
  function removeLecturer(index: number) {
    if (!course) return;
    setLecturerSearch(s => ({ ...s, index: -1 }));
    if (index === course.lecturer_ids.length) setAddingLecturer(false);
    else edit(course.code, c => ({ ...c, lecturer_ids: c.lecturer_ids.filter((_, i) => i !== index) }));
  }
  function acknowledge(id: string, checked: boolean) {
    onChange({ ...review, acknowledged: checked ? [...new Set([...review.acknowledged, id])] : review.acknowledged.filter(x => x !== id),
      validation_hash: "", confirmed: false, ready: false });
  }

  const errors = review.issues.filter(i => i.severity === "error").length;
  const pendingWarnings = review.issues.filter(i => i.severity === "warning" && !acknowledged.has(i.id)).length;
  const validationMessage = validationState === "failed" ? t("ตรวจสอบไม่สำเร็จ กดตรวจสอบอีกครั้ง") : validationState === "checking" ? t("กำลังตรวจสอบการแก้ไข…") : t("รอตรวจสอบการแก้ไขอัตโนมัติ…");
  function issueCard(issue: REGIssue) {
    return <div key={issue.id} className="reg-issue" data-severity={issue.severity} data-acknowledged={acknowledged.has(issue.id)}>
      <div className="reg-issue-title">{issue.severity === "error" ? <AlertCircle size={17} /> : acknowledged.has(issue.id) ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}<strong>{issue.severity === "error" ? t("ต้องแก้ก่อนบันทึก") : acknowledged.has(issue.id) ? t("ยืนยันแล้ว") : t("ต้องตรวจและยืนยัน")}</strong></div>
      {issue.severity === "warning" ? <label className="reg-issue-choice"><input type="checkbox" checked={acknowledged.has(issue.id)} onChange={e => acknowledge(issue.id, e.target.checked)} /><span>{issue.message}</span></label> : <p>{issue.message}</p>}
      <button type="button" className="reg-issue-jump" onClick={() => goToIssue(issue)}>{t("ไปจุดที่ต้องตรวจ")}<ChevronRight size={15} /></button>
    </div>;
  }
  return <div className="reg-review-editor">
    <div className="reg-review-toolbar" aria-live="polite">
      <div className="reg-review-totals"><span>{t("ทั้งหมด")} <strong>{review.courses.length}</strong> {t("วิชา")}</span><span>{t("ค้างตรวจ")} <strong>{remaining}</strong></span><span>{t("ข้าม")} <strong>{review.courses.filter(c => c.skip).length}</strong></span></div>
      <Button size="sm" variant="secondary" disabled={disabled} onPress={() => { setBulkOpen(true); setMobilePane("details"); detailScroll.current?.scrollTo({ top: 0 }); }}>{t("จัดการหลายรายการ")}</Button>
      <span className="reg-status" data-severity={errors ? "error" : review.ready ? "complete" : "warning"}>
        {errors ? <AlertCircle size={15} /> : review.ready ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
        {!review.validation_hash ? validationMessage : errors ? t("ต้องแก้ {n} รายการ", { n: errors }) : pendingWarnings ? t("รอยืนยัน {n} รายการ", { n: pendingWarnings }) : t("ตรวจสอบครบ พร้อมยืนยันบันทึก")}
      </span>
    </div>
    <div className="reg-mobile-tabs" role="tablist" aria-label={t("ส่วนตรวจสอบไฟล์")} onKeyDown={event => {
      const ids = ["courses", "details", "issues"] as const;
      const current = ids.indexOf(mobilePane);
      const next = event.key === "ArrowRight" ? (current + 1) % 3 : event.key === "ArrowLeft" ? (current + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
      if (next < 0) return;
      event.preventDefault(); setMobilePane(ids[next]); event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
    }}>
      {([{ id: "courses", label: t("วิชา"), icon: List, count: review.courses.length }, { id: "details", label: t("รายละเอียด"), icon: FileText, count: null }, { id: "issues", label: t("ต้องตรวจ"), icon: ClipboardCheck, count: courseIssues.filter(i => i.severity === "error" || !acknowledged.has(i.id)).length }] as const).map(pane => <button key={pane.id} type="button" role="tab" id={`reg-tab-${pane.id}`} aria-controls={`reg-pane-${pane.id}`} aria-selected={mobilePane === pane.id} tabIndex={mobilePane === pane.id ? 0 : -1} onClick={() => setMobilePane(pane.id)}><pane.icon size={16} />{pane.label}{pane.count != null && <span>{pane.count}</span>}</button>)}
    </div>
    <fieldset disabled={disabled} className="reg-workbench" aria-busy={disabled}>
      <legend className="sr-only">{t("ตรวจสอบข้อมูลนำเข้า REG")}</legend>
      <aside className="reg-pane reg-course-pane" id="reg-pane-courses" data-mobile-active={mobilePane === "courses"} aria-label={t("เลือกวิชาที่ตรวจสอบ")}>
        <div className="reg-pane-heading"><h3><List size={17} />{t("รายวิชา")}</h3><span>{visible.length} / {review.courses.length}</span></div>
        <div className="reg-course-filters">
          <Field label={t("ค้นหารหัสวิชา ชื่อวิชา หรืออาจารย์")}><input className={control} value={search} onChange={e => setSearch(e.target.value)} type="search" /></Field>
          <Field label={t("แสดงรายวิชา")}><select className={control} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("ทั้งหมด")}</option><option value="pending">{t("ต้องตรวจหรือยืนยัน")}</option><option value="skipped">{t("ข้ามการนำเข้า")}</option></select></Field>
        </div>
        <nav aria-label={t("รายวิชาจาก REG")} className="reg-course-scroll" tabIndex={0}>
          {visible.map(c => <button key={c.code} type="button" aria-current={selected === c.code ? "true" : undefined} data-selected={selected === c.code} data-severity={(issuesByCode.get(c.code) ?? []).some(i => i.severity === "error") ? "error" : unresolved(c.code).length ? "warning" : undefined} onClick={() => { setSelected(c.code); setBulkOpen(false); setMobilePane("details"); requestAnimationFrame(() => detailScroll.current?.focus({ preventScroll: true })); }}>
            <span className="reg-course-line"><strong>{c.code}</strong><span className="reg-course-count">{c.skip ? t("ข้าม") : unresolved(c.code).length ? `${unresolved(c.code).length} ${t("รายการ")}` : t("ตรวจครบ")}</span></span>
            <span className="reg-course-name">{c.name}</span>
          </button>)}
          {visible.length === 0 && <p className="reg-empty">{t("ไม่พบรายวิชาตามตัวกรอง")}</p>}
        </nav>
      </aside>
      {course && <article className="reg-pane reg-details-pane" id="reg-pane-details" data-mobile-active={mobilePane === "details"} aria-label={`${t("ตรวจวิชา")} ${course.code}`}>
        <header className="reg-detail-heading"><div><h3>{bulkOpen ? t("จัดการหลายรายการ") : <>{course.code} <span>{t("แถว")} {course.source_row}</span></>}</h3><p>{bulkOpen ? t("เลือกขอบเขต ตรวจรายละเอียด แล้วใช้ค่าพร้อมกัน") : course.name}</p></div>{!bulkOpen && <IssueMarker issues={courseIssues} acknowledged={acknowledged} />}</header>
        <div className="reg-detail-scroll" ref={detailScroll} tabIndex={0} role="region" aria-label={t("รายละเอียดที่แก้ไขได้")}>
          {bulkOpen ? <REGReviewBulkTools review={review} visibleCodes={visible.map(c => c.code)} selectedCode={selected} disabled={disabled} onChange={onChange} onClose={() => setBulkOpen(false)} /> : <>
          <div className="reg-inclusion">
            <label><input type="checkbox" checked={course.skip} disabled={!!course.existing_id} onChange={e => edit(course.code, c => ({ ...c, skip: e.target.checked }))} />{course.existing_id ? t("มีในระบบแล้ว — ข้ามและเก็บข้อมูลเดิม") : t("ข้ามวิชานี้ โดยไม่ลบออกจากประวัติการตรวจสอบ")}</label>
            {course.skip && <Field label={t("เหตุผลที่ข้าม")}><input className={control} value={course.skip_reason} onChange={e => edit(course.code, c => ({ ...c, skip_reason: e.target.value }))} /></Field>}
          </div>
        {!course.skip && <>
          <section className="reg-review-block" data-reg-target="basic" data-active={activeTarget === "basic"} data-severity={attention("", /ชื่อวิชา|หน่วยกิต|ระดับ/)} tabIndex={-1}>
          <div className="reg-block-heading"><h4>{t("ข้อมูลวิชา")}</h4><IssueMarker issues={courseIssues.filter(i => !i.section_id && /ชื่อวิชา|หน่วยกิต|ระดับ/.test(i.message))} acknowledged={acknowledged} /></div>
          <details className="reg-source"><summary>{course.source_format === "programme" ? t("ข้อมูลวิชาต้นฉบับจากไฟล์หลักสูตร") : t("ข้อมูลวิชาต้นฉบับจาก REG")}</summary><SourceCells cells={course.source_cells ?? []} headers={course.source_headers} /></details>
          <div className="reg-form-grid">
            <Field label={t("ชื่อวิชา")} attention={attention("", /ชื่อวิชา/)}><textarea rows={2} className={control} value={course.name} onChange={e => edit(course.code, c => ({ ...c, name: e.target.value }))} /></Field>
            <div className="reg-form-grid">
              <Field label={t("หน่วยกิต (บรรยาย-ปฏิบัติ-ศึกษาด้วยตนเอง)")} attention={attention("", /หน่วยกิต/)}><input className={control} value={course.unit} onChange={e => edit(course.code, c => ({ ...c, unit: e.target.value }))} /></Field>
              <Field label={t("ระดับการศึกษา")}><select className={control} value={course.level} onChange={e => edit(course.code, c => ({ ...c, level: e.target.value }))}><option value="undergrad">{t("ปริญญาตรี")}</option><option value="graduate">{t("บัณฑิตศึกษา")}</option></select></Field>
            </div>
          </div>
          </section>
          <section className="reg-review-block" aria-label={t("อาจารย์ผู้สอน")} data-reg-target="lecturers" data-active={activeTarget === "lecturers"} data-severity={attention("", /อาจารย์/)} tabIndex={-1}>
            <div className="reg-block-heading"><h4>{t("อาจารย์ผู้สอนและผู้รับผิดชอบหลัก")}</h4><IssueMarker issues={courseIssues.filter(i => !i.section_id && /อาจารย์/.test(i.message))} acknowledged={acknowledged} /></div>
            <p className="break-words whitespace-pre-wrap text-sm">{course.source_format === "programme" ? t("ข้อความจากไฟล์หลักสูตร") : t("ข้อความจาก REG")}: {course.officer_raw || t("ไม่ระบุ")}</p>
            {!!course.officer_raw && (!!course.unmatched_officer_names?.length || !course.lecturer_ids.length || courseIssues.some(i => i.kind === "unmatched_names" || /ชื่อจาก REG ที่ไม่พบหรือกำกวม/.test(i.message))) && <div className="reg-lecturer-help" role="note">
              <strong>{t("มีชื่อใน REG แต่ยังจับคู่บัญชีได้ไม่ครบ")}</strong>
              {!!course.unmatched_officer_names?.length && <p>{t("ชื่อที่ต้องตรวจ")}: {course.unmatched_officer_names.join(", ")}</p>}
              <p>{t("สาเหตุที่เป็นไปได้ และวิธีตรวจสอบ")}</p>
              <ul>
                <li>{t("ชื่อสะกดต่างกัน หรือ REG มีเพียงชื่อสั้น — ลองค้นหาชื่อเต็ม นามสกุล หรืออีเมล แล้วเลือกบัญชีที่ถูกต้อง")}</li>
                <li>{t("ยังไม่มีบัญชีอาจารย์ หรือบัญชียังไม่เปิดใช้งานหรือไม่มีบทบาทอาจารย์ — ตรวจในหน้าจัดการผู้ใช้ แล้วกลับมารีเฟรชรายชื่อ")}</li>
                <li>{t("มีอาจารย์ชื่อเหมือนกันมากกว่าหนึ่งคน — เทียบนามสกุลและอีเมลก่อนเลือก ระบบจะไม่ตัดสินใจแทนเจ้าหน้าที่")}</li>
              </ul>
              <div className="reg-help-actions">
                <Button size="sm" variant="secondary" disabled={disabled} onPress={() => { setAddingLecturer(true); setLecturerSearch(s => ({ index: course.lecturer_ids.length, request: s.request + 1 })); }}>{t("ค้นหาและเลือกบัญชีอาจารย์")}</Button>
                <a href="/staff/users" target="_blank" rel="noopener noreferrer">{t("เปิดจัดการผู้ใช้ในแท็บใหม่")}</a>
                {onRefreshLecturers && <Button size="sm" variant="tertiary" disabled={disabled} onPress={onRefreshLecturers}>{t("รีเฟรชรายชื่ออาจารย์")}</Button>}
              </div>
              {course.lecturer_ids.length === 0 && <p>{t("หากยังเลือกไม่ได้ ให้ระบุเหตุผลที่ยังไม่ผูกอาจารย์ไว้ด้านล่าง และติดตามให้ครบภายหลัง")}</p>}
            </div>}
            <p className="text-sm text-muted">{course.lecturer_match_verified && review.validation_hash ? t("จับคู่ชื่อกับบัญชีที่เปิดใช้งานได้ครบและไม่กำกวมแล้ว ผู้รับผิดชอบหลักคือคนแรก") : t("ลำดับแรกเป็นผู้รับผิดชอบหลัก ตรวจชื่อที่จับคู่ก่อนยืนยัน")}</p>
            {[...course.lecturer_ids, ...(addingLecturer ? [""] : [])].map((id, i) => <div className="flex min-w-0 flex-wrap items-start gap-2 sm:flex-nowrap" key={`${course.code}:${i}`}>
              <REGSearchSelect label={`${t("อาจารย์ลำดับ")} ${i + 1}`} hideLabel
                openRequest={lecturerSearch.index === i ? lecturerSearch.request : 0}
                placeholder={t("เลือกอาจารย์")} searchLabel={t("ค้นหาชื่อ นามสกุล หรืออีเมลอาจารย์")}
                emptyText={t("ไม่พบอาจารย์ที่ตรงกับคำค้นหา ลองชื่อหรืออีเมลอื่น")}
                value={id} disabled={disabled}
                options={review.lecturers.filter(l => l.id === id || !course.lecturer_ids.includes(l.id)).map(l => ({ id: l.id, label: l.name, description: l.email }))}
                onChange={next => changeLecturer(i, next)} />
              {i > 0 && id && <Button size="sm" variant="secondary" onClick={() => edit(course.code, c => ({ ...c, lecturer_ids: [id, ...c.lecturer_ids.filter((_, n) => n !== i)] }))}>{t("ตั้งเป็นหลัก")}</Button>}
              <Button size="sm" variant="secondary" onClick={() => removeLecturer(i)}>{t("นำออก")}</Button>
            </div>)}
            <Button size="sm" variant="secondary" disabled={addingLecturer} onClick={() => setAddingLecturer(true)}>{t("เพิ่มอาจารย์")}</Button>
            {course.lecturer_ids.length === 0 && <Field label={t("เหตุผลที่ยังไม่ผูกอาจารย์ (ต้องเติมภายหลัง)")}><input className={control} value={course.unassigned_reason} onChange={e => edit(course.code, c => ({ ...c, unassigned_reason: e.target.value }))} /></Field>}
          </section>
          <section className="reg-review-block" data-reg-target="merge" data-active={activeTarget === "merge"} data-severity={attention("", /เรียนรวม|รหัสหลัก/)} tabIndex={-1}>
          <div className="reg-block-heading"><h4>{t("การเรียนรวม")}</h4><IssueMarker issues={courseIssues.filter(i => !i.section_id && /เรียนรวม|รหัสหลัก/.test(i.message))} acknowledged={acknowledged} /></div>
          <REGSearchSelect label={t("รหัสวิชาหลัก หากยืนยันว่าเรียนรวมกัน (ว่าง = เปิดแยก)")}
            placeholder={t("เปิดแยกเป็นรายวิชา")} searchLabel={t("ค้นหารหัสหรือชื่อวิชาที่เรียนรวม")}
            emptyText={t("ไม่พบวิชาที่ตรงกับคำค้นหา ลองรหัสหรือชื่อวิชาอื่น")}
            value={course.merge_into} disabled={disabled}
            options={review.courses.filter(c => c.code !== course.code && (!c.skip || c.existing_id)).map(c => ({ id: c.code, label: c.code, description: c.name }))}
            onChange={next => edit(course.code, c => ({ ...c, merge_into: next }))} />
          <p className="text-sm text-muted">{t("การเรียนรวมจะรวมจำนวนผู้เรียนเข้าวิชาหลักและใช้ตารางของวิชาหลักเมื่อ Section ตรงกัน ตรวจให้แน่ใจก่อนเลือก")}</p>
          </section>
          <div className="reg-section-roster">
            <h4 className="reg-roster-heading">{t("Section และตารางเรียน")} <span>{course.sections.length} {t("กลุ่ม")}</span></h4>
            {course.sections.map(sec => <section key={sec.id} className="reg-review-block reg-section-block" data-reg-target={sec.id} data-active={activeTarget === sec.id} data-severity={attention(sec.id)} tabIndex={-1} aria-label={`Section ${sec.sec_no} ${sec.track}`}>
              <div className="reg-block-heading"><h4>Section {sec.sec_no} · {sec.track === "special" ? t("ภาคพิเศษ") : sec.track === "regular" ? t("ภาคปกติ") : t("ยังไม่ระบุภาค")} · {t("แถว")} {sec.source_row}</h4><IssueMarker issues={courseIssues.filter(i => i.section_id === sec.id)} acknowledged={acknowledged} /></div>
              <details className="reg-source"><summary>{course.source_format === "programme" ? t("ดูข้อมูลต้นฉบับทั้งหมดของ Section") : t("ดูข้อความต้นฉบับ REG ทั้งหมดของ Section")}</summary>
                <p className="mt-2 break-words whitespace-pre-wrap">{sec.reserved_for || t("ไม่ระบุกลุ่มผู้เรียน")}</p>
                {sec.source_rows?.length ? sec.source_rows.map(row => <div key={row.row} className="mt-3"><strong>{t("แถว")} {row.row}</strong><SourceCells cells={row.cells} headers={course.source_headers} /></div>) : sec.source_cells?.length ? <SourceCells cells={sec.source_cells} headers={course.source_headers} /> : <pre className="mt-2 break-words whitespace-pre-wrap font-sans">{sec.schedules.map(s => s.raw).filter(Boolean).join("\n") || t("REG ไม่มีเวลาเรียน")}</pre>}
              </details>
              <div className="reg-section-fields">
                <Field label={t("เลข Section")} attention={attention(sec.id, /เลข Section|เลข.*ซ้ำ/)}><input className={control} value={sec.sec_no} onChange={e => section(sec.id, { sec_no: e.target.value })} /></Field>
                <Field label={t("ประเภทภาค")} attention={attention(sec.id, /ประเภทภาค|เลือกภาค/)}><select className={control} value={sec.track} onChange={e => section(sec.id, { track: e.target.value })}><option value="">{t("ต้องเลือก")}</option><option value="regular">{t("ปกติ")}</option><option value="special">{t("พิเศษ")}</option></select></Field>
                <div><Field label={course.source_format === "programme" ? t("จำนวนผู้ลงทะเบียนจริงจากไฟล์") : t("จำนวนรับจาก REG (ยังไม่ใช่ยอดลงทะเบียนจริง)")} attention={attention(sec.id, /จำนวนรับ|จำนวนผู้ลงทะเบียน|จำนวน.*คน|จำนวนที่นั่ง/)}><input className={control} type="number" min={0} max={3000} step={1} value={sec.students ?? ""} onChange={e => section(sec.id, { students: e.target.value === "" ? null : Number(e.target.value) })} /></Field>{sec.source_capacity != null && <p className="mt-1 text-xs text-muted">{t("จำนวนรับตามไฟล์ {n} คน", { n: sec.source_capacity })}</p>}</div>
                <Field label={t("กลุ่มหลักสูตรหลัก")} attention={attention(sec.id, /หลักสูตร|กลุ่มหลัก/)}><select className={control} value={sec.curriculum} onChange={e => section(sec.id, { curriculum: e.target.value })}><option value="">{t("ต้องเลือก")}</option>{["CS", "IT", "GIS", "AI", "CY", "KKBS", "OTHER"].map(k => <option value={k} key={k}>{k === "OTHER" ? t("OTHER — คณะอื่น / กลุ่มทั่วไป") : k}</option>)}</select></Field>
              </div>
              <div className="space-y-3">
                {sec.schedules.map((sch, i) => <div key={i} className="reg-slot" data-pending={sch.pending} aria-label={`${t("คาบที่")} ${i + 1}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={sch.pending} onChange={e => slot(sec, i, { pending: e.target.checked })} />{t("ยังไม่กำหนดตาราง เก็บไว้เติมภายหลัง")}</label>
                    <Button size="sm" variant="secondary" onClick={() => section(sec.id, { schedules: sec.schedules.filter((_, n) => n !== i) })}>{t("ลบคาบ")}</Button></div>
                  <div className="reg-slot-fields">
                    <Field label={t("วันเรียน")}><select className={control} value={sch.day} onChange={e => slot(sec, i, { day: Number(e.target.value) })}><option value={-1}>{t("ยังไม่ระบุ")}</option>{[t("อาทิตย์"), t("จันทร์"), t("อังคาร"), t("พุธ"), t("พฤหัสบดี"), t("ศุกร์"), t("เสาร์")].map((d, n) => <option key={n} value={n}>{d}</option>)}</select></Field>
                    <Field label={t("เริ่ม")}><input className={control} type="time" value={sch.start} onChange={e => slot(sec, i, { start: e.target.value })} /></Field>
                    <Field label={t("สิ้นสุด")}><input className={control} type="time" value={sch.end} onChange={e => slot(sec, i, { end: e.target.value })} /></Field>
                    <Field label={t("ประเภทคาบ")}><select className={control} value={sch.kind} onChange={e => slot(sec, i, { kind: e.target.value })}><option value="">{t("เลือกประเภทคาบ")}</option><option value="lecture">Lec</option><option value="lab">Lab</option></select></Field>
                    <Field label={t("ห้อง (เว้นว่างได้)")}><input className={control} value={sch.room} onChange={e => slot(sec, i, { room: e.target.value })} /></Field>
                  </div>
                </div>)}
                <Button size="sm" variant="secondary" onClick={() => section(sec.id, { schedules: [...sec.schedules, { day: -1, start: "", end: "", kind: "lecture", room: "", pending: false, raw: "" }] })}>{t("เพิ่มคาบเรียน")}</Button>
                {(sec.schedules.length === 0 || sec.schedules.some(s => s.pending)) && <Field label={t("เหตุผลที่ตารางยังไม่ครบ และสิ่งที่ต้องเติมภายหลัง")} attention={attention(sec.id, /ระบุเหตุผล|ตารางยังไม่ครบ|ไม่กำหนดวัน/)}><textarea className={control} rows={2} value={sec.pending_reason} onChange={e => section(sec.id, { pending_reason: e.target.value })} /></Field>}
              </div>
            </section>)}
          </div>
        </>}
        </>}
        </div>
      </article>}
      <aside className="reg-pane reg-issues-pane" id="reg-pane-issues" data-mobile-active={mobilePane === "issues"} aria-label={t("ผลตรวจรายวิชา")}>
        <div className="reg-pane-heading reg-issues-heading"><h3><ClipboardCheck size={18} />{t("จุดที่ต้องตรวจ")}</h3><span>{course?.code}</span></div>
        <div className="reg-issue-summary"><span data-severity={courseIssues.some(i => i.severity === "error") ? "error" : undefined}>{t("ต้องแก้")} <strong>{courseIssues.filter(i => i.severity === "error").length}</strong></span><span data-severity={courseIssues.some(i => i.severity === "warning" && !acknowledged.has(i.id)) ? "warning" : undefined}>{t("รอยืนยัน")} <strong>{courseIssues.filter(i => i.severity === "warning" && !acknowledged.has(i.id)).length}</strong></span></div>
        <div className="reg-issue-scroll" ref={issueScroll} tabIndex={0}>
          {!review.validation_hash && <p className="reg-stale-notice" role="status">{validationMessage} {t("รายการด้านล่างเป็นผลตรวจครั้งก่อน")}</p>}
          {activeIssues.length === 0 && <div className="reg-empty"><CheckCircle2 size={24} /><p>{review.validation_hash ? t("ไม่มีรายการค้างตรวจของวิชานี้") : t("ยืนยันรายการแล้ว กำลังรอผลตรวจล่าสุด")}</p></div>}
          {activeIssues.map(issueCard)}
          {completedIssues.length > 0 && <details className="reg-source reg-completed-issues" key={course?.code}>
            <summary>{t("ยืนยันแล้ว")} {completedIssues.length} {t("รายการ")}</summary>
            <div className="mt-3">{completedIssues.map(issueCard)}</div>
          </details>}
        </div>
      </aside>
    </fieldset>
  </div>;
}
