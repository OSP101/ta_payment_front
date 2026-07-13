"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  Plus, Send, Trash2, ClipboardList, Wallet, CheckCircle2, AlertCircle, Info,
  UserPlus, Copy, CalendarClock, Clock,
} from "lucide-react";
import {
  Breadcrumbs,
  RadioGroup, Radio, Description, Label,
  NumberField,
  Checkbox, CheckboxGroup,
  Autocomplete, ListBox, SearchField, useFilter,
  EmptyState as HEmptyState,
  Input as HInput,
  Label as HLabel,
  TextField as HTextField,
  FieldError as HFieldError,
  toast,
  type Key,
} from "@heroui/react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, TextInput, Select, FieldGroup, Chip, EmptyState, Alert, Modal,
} from "../../../../components/ui";
import { RequestsTable, type TARequestRow } from "../../../RequestsTable";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Section { id: string; sec_no: string; track: string; }
interface TA { id: string; first_name: string; last_name: string; email: string; study_level?: string; }
interface SectionConflict { section_id: string; messages: string[]; }
interface ConflictsResp { conflicts: SectionConflict[]; }
interface Assignment {
  // A TA can be assigned to multiple sections in one course; the workload
  // hours below are the TA's declaration across all of them (shared), while
  // section_ids drives which sections appear in worklog for that TA.
  section_ids: string[];
  ta_id: string;
  level: string;
  workload: {
    help_teach_hrs: number; help_teach_desc: string;
    prep_hrs: number; prep_desc: string;
    grade_hrs: number; grade_desc: string;
    other_hrs: number; other_desc: string;
    check_work_hrs: number; attendance_hrs: number; ug_other_hrs: number; ug_other_desc: string;
    lab_hrs: number;
  };
}

interface RequestWindow {
  id: string;
  term_id: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  note?: string | null;
}

type WindowState =
  | { phase: "none" }
  | { phase: "open"; window: RequestWindow; closesAt: number; remainingMs: number }
  | { phase: "upcoming"; window: RequestWindow; opensAt: number; untilMs: number }
  | { phase: "closed"; lastWindow?: RequestWindow };

const GRAD_MIN_HRS = 10;
const GRAD_MAX_HRS = 12;

const emptyWorkload = (): Assignment["workload"] => ({
  help_teach_hrs: 0, help_teach_desc: "",
  prep_hrs: 0, prep_desc: "",
  grade_hrs: 0, grade_desc: "",
  other_hrs: 0, other_desc: "",
  check_work_hrs: 0, attendance_hrs: 0, ug_other_hrs: 0, ug_other_desc: "",
  lab_hrs: 0,
});

/* -------------------------------------------------------------------------- */
/* Main page                                                                   */
/* -------------------------------------------------------------------------- */

export default function RequestPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: course } = useSWR<{
    id: string; code: string; name_th: string; term_id?: string;
    lecture_hrs?: number; lab_hrs?: number;
    sections?: Section[];
  }>(
    tcId ? `/teaching-courses/${tcId}` : null,
  );
  const { data: allReqs } = useSWR<TARequestRow[]>("/ta-requests");
  const { data: windows } = useSWR<RequestWindow[]>(
    course?.term_id ? `/ta-request/windows?term_id=${course.term_id}` : null,
  );
  const [formOpen, setFormOpen] = useState(false);

  const courseReqs = (allReqs ?? []).filter(
    r => r.teaching_course_id === tcId || r.course_code === course?.code,
  );

  const windowState = useWindowState(windows);
  const windowLoading = !!course?.term_id && !windows;
  const canSend = windowLoading || windowState.phase === "open";

  return (
    <div>
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/lecturer">รายวิชาที่สอน</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/lecturer/courses/${tcId}`}>
          {course ? `${course.code} — ${course.name_th}` : "…"}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>คำขอ TA</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title="คำขอผู้ช่วยสอน"
        description={course
          ? `${course.code} — ${course.name_th} · ประวัติคำขอทั้งหมดของวิชานี้`
          : "ประวัติคำขอทั้งหมดของวิชานี้"}
        actions={
          <Button
            variant="primary"
            onClick={() => setFormOpen(true)}
            disabled={!canSend}
          >
            <Send size={16} /> ส่งคำขอ TA
          </Button>
        }
      />

      <WindowStatusBanner state={windowState} loading={windowLoading} />

      <RequestsTable rows={courseReqs} loading={!allReqs} />

      <RequestFormModal
        open={formOpen}
        tcId={tcId}
        course={course}
        onClose={() => setFormOpen(false)}
        onSubmitted={() => {
          setFormOpen(false);
          mutate("/ta-requests");
          toast.success("ส่งคำขอ TA เรียบร้อยแล้ว", { description: "รอเจ้าหน้าที่ตรวจสอบและอนุมัติ" });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Request form modal                                                          */
/* -------------------------------------------------------------------------- */

function RequestFormModal({
  open, tcId, course, onClose, onSubmitted,
}: {
  open: boolean;
  tcId: string;
  course?: {
    id: string; code: string; name_th: string;
    lecture_hrs?: number; lab_hrs?: number;
    sections?: Section[];
  };
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { data: tas } = useSWR<{ items: TA[] }>(open ? "/users?role=ta&limit=200" : null);

  // Q&A rule 3: default reimburse_scope from the course's credit hours.
  //   lecture-only → "lecture"; lab-only → "lab"; both → "both".
  // User can still override to handle mismatch cases (e.g. old IT curriculum
  // where a course has lab credits but the lecturer only teaches lecture).
  const defaultScope = useMemo<"lecture" | "lab" | "both">(() => {
    const lec = course?.lecture_hrs ?? 0;
    const lab = course?.lab_hrs ?? 0;
    if (lec > 0 && lab === 0) return "lecture";
    if (lab > 0 && lec === 0) return "lab";
    return "both";
  }, [course?.id, course?.lecture_hrs, course?.lab_hrs]);

  const [scope, setScope] = useState<"lecture" | "lab" | "both">(defaultScope);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creatingTa, setCreatingTa] = useState(false);
  // Schedule-conflict cache lifted from AssignmentBlock: keyed by TA id so the
  // modal can gate Submit on "no picked section conflicts anywhere".
  const [conflictsByTa, setConflictsByTa] = useState<Record<string, SectionConflict[]>>({});
  const reportConflicts = useCallback((taId: string, list: SectionConflict[]) => {
    setConflictsByTa(prev => {
      const cur = prev[taId];
      if (cur && cur.length === list.length && cur.every((c, i) => c.section_id === list[i].section_id)) return prev;
      return { ...prev, [taId]: list };
    });
  }, []);

  // Fresh form every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setAssignments([]);
    setScope(defaultScope);
    setErr(null);
    setConflictsByTa({});
  }, [open, course?.id, defaultScope]);

  /* --- derived --------------------------------------------------------- */
  const firstSectionId = course?.sections?.[0]?.id ?? "";

  const taChosen = assignments.length > 0 && assignments.every(a => a.ta_id);
  // Grad TAs must land in [10, 12] hr/week (regulation for บัณฑิตศึกษา);
  // undergrad just needs > 0. The >12 side is prevented via per-field caps so
  // here we only need to gate the lower bound.
  const workloadOk = assignments.length > 0 && assignments.every(a => {
    const t = sumWorkload(a);
    if (a.level === "master" || a.level === "phd") return t >= GRAD_MIN_HRS && t <= GRAD_MAX_HRS;
    return t > 0;
  });
  const sectionChosen = assignments.length > 0 && assignments.every(a => a.section_ids.length > 0);
  // Block submit if any TA has a picked section that conflicts with either
  // their own class schedule or an already-approved TA duty elsewhere. The
  // lecturer must remove that TA before the request can go through.
  const anyScheduleConflict = assignments.some(a => {
    if (!a.ta_id) return false;
    const conflicts = conflictsByTa[a.ta_id];
    if (!conflicts?.length) return false;
    const bad = new Set(conflicts.map(c => c.section_id));
    return a.section_ids.some(sid => bad.has(sid));
  });

  const canSubmit = taChosen && workloadOk && sectionChosen && !anyScheduleConflict;

  /* --- helpers --------------------------------------------------------- */
  function addAssignment(secId?: string, taId = "", level = "undergrad") {
    const initial = secId ?? firstSectionId;
    setAssignments(a => [...a, {
      section_ids: initial ? [initial] : [],
      ta_id: taId,
      level,
      workload: emptyWorkload(),
    }]);
  }
  function removeAssignment(idx: number) {
    setAssignments(a => a.filter((_, i) => i !== idx));
  }
  function updateAssign(idx: number, patch: Partial<Assignment>) {
    setAssignments(a => a.map((x, i) => i === idx ? { ...x, ...patch } : x));
  }
  function updateWorkload(idx: number, patch: Partial<Assignment["workload"]>) {
    setAssignments(a => a.map((x, i) => i === idx ? { ...x, workload: { ...x.workload, ...patch } } : x));
  }

  async function submit() {
    if (!tcId) return;
    setErr(null); setPending(true);
    try {
      // Derive per-section counts from the assignment list so the backend
      // still receives the "ta_request_counts" rows it expects. A TA on N
      // sections is counted once per section — matching how the backend
      // materialises N ta_request_assignments rows for the same TA.
      const bySection = new Map<string, { undergrad_count: number; graduate_count: number }>();
      for (const s of course?.sections ?? []) {
        bySection.set(s.id, { undergrad_count: 0, graduate_count: 0 });
      }
      for (const a of assignments) {
        for (const sid of a.section_ids) {
          const c = bySection.get(sid) ?? { undergrad_count: 0, graduate_count: 0 };
          if (a.level === "master" || a.level === "phd") c.graduate_count += 1;
          else c.undergrad_count += 1;
          bySection.set(sid, c);
        }
      }
      const res = await api.post<{
        id: string;
        status: "approved" | "rejected";
        reject_reason?: string;
      }>("/ta-requests", {
        teaching_course_id: tcId,
        reimburse_scope: scope,
        counts: [...bySection.entries()].map(([section_id, c]) => ({ section_id, ...c })),
        assignments,
      });
      if (res.status === "rejected") {
        // Under the auto-decide model, business-rule failures come back as a
        // 200 with status='rejected'. Show the system-generated reason inline
        // so the lecturer can fix it and resubmit.
        const reason = res.reject_reason || "ระบบตัดสินว่าคำขอไม่ผ่านเกณฑ์";
        setErr(reason);
        notify.error(reason);
        return;
      }
      notify.success("ระบบอนุมัติคำขอเรียบร้อยแล้ว");
      onSubmitted();
    } catch (e) {
      // Structural failures (bad section, negative workload, TA doesn't exist)
      // still throw at Create time — surface the Thai message so the lecturer
      // can correct the form.
      setErr((e as Error).message);
      notify.error(e);
    }
    finally { setPending(false); }
  }

  const steps = [
    { n: 1, label: "ประเภทการเบิก", icon: <Wallet size={14} />, ok: true },
    { n: 2, label: "เลือก TA", icon: <ClipboardList size={14} />, ok: taChosen },
    { n: 3, label: "ภาระงาน", icon: <CheckCircle2 size={14} />, ok: workloadOk },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ส่งคำขอผู้ช่วยสอน"
      icon={<Send size={18} />}
      size="2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-3">
          <div className="flex items-center gap-3 text-xs text-ink-3">
            <span>เพิ่มแล้ว <b className="text-ink-1">{assignments.length}</b> คน</span>
            <span>เบิก <b className="text-ink-1">{scope === "lecture" ? "บรรยาย" : scope === "lab" ? "ปฏิบัติการ" : "บรรยาย+ปฏิบัติการ"}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={!canSubmit || pending}
              isPending={pending}
            >
              <Send size={16} />
              {pending ? "กำลังส่ง…" : `ส่งคำขอ (${assignments.length} คน)`}
            </Button>
          </div>
        </div>
      }
    >
      {/* Step progress indicator */}
      <div className="rounded-xl border border-border bg-panel p-3 mb-4 overflow-x-auto">
        <ol className="flex items-center gap-2 min-w-max">
          {steps.map((s, i) => (
            <li key={s.n} className="flex items-center gap-2">
              <StepPill n={s.n} label={s.label} icon={s.icon} ok={s.ok} />
              {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        {/* Step 1 --------------------------------------------------------- */}
        <StepPanel n={1} title="ประเภทการเบิกค่าตอบแทน" description="เลือกให้ตรงกับหน่วยกิตวิชา">
          <RadioGroup
            value={scope}
            onChange={v => setScope(v as "lecture" | "lab" | "both")}
            orientation="horizontal"
            className="w-full"
          >
            <Label className="sr-only">ประเภทการเบิก</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full">
              <ScopeRadio value="lecture" label="เฉพาะบรรยาย" desc="Lecture only" />
              <ScopeRadio value="lab" label="เฉพาะปฏิบัติการ" desc="Lab only" />
              <ScopeRadio value="both" label="บรรยาย + ปฏิบัติการ" desc="Lec. + Lab" />
            </div>
          </RadioGroup>
        </StepPanel>

        {/* Step 2 --------------------------------------------------------- */}
        <StepPanel
          n={2}
          title="เพิ่มรายชื่อ TA และกำหนดภาระงาน"
          description="เพิ่ม TA ทีละคน เลือก section และกรอกภาระงานของแต่ละคน"
          status={
            assignments.length === 0
              ? { tone: "warn", text: "ยังไม่ได้เพิ่ม TA" }
              : !taChosen
              ? { tone: "warn", text: "ยังไม่ได้เลือก TA" }
              : !sectionChosen
              ? { tone: "warn", text: "ยังไม่ได้เลือก section" }
              : anyScheduleConflict
              ? { tone: "danger", text: "มี TA ที่ตารางทับซ้อน — เอาชื่อออกก่อน" }
              : !workloadOk
              ? { tone: "warn", text: "ภาระงานยังไม่ครบตามระเบียบ" }
              : { tone: "success", text: `${assignments.length} คน · พร้อมส่ง` }
          }
        >
          {!course?.sections?.length ? (
            <EmptyState title="ยังไม่มี section ในรายวิชานี้" />
          ) : (
            <div className="space-y-3">
              {/* Toolbar with add + create buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 border border-hairline px-3 py-2">
                <div className="text-xs text-ink-3">
                  รวม TA ในวิชานี้ <b className="text-ink-1">{assignments.length}</b> คน
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreatingTa(true)}
                  >
                    <UserPlus size={14} /> สร้างบัญชี TA ใหม่
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => addAssignment()}
                  >
                    <Plus size={14} /> เพิ่ม TA
                  </Button>
                </div>
              </div>

              {/* Unified assignment list */}
              {assignments.length === 0 ? (
                <div className="text-xs text-ink-3 text-center py-8 border border-dashed border-hairline rounded-lg">
                  ยังไม่ได้เพิ่ม TA — กดปุ่ม "เพิ่ม TA" ด้านบน
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a, idx) => {
                    const takenElsewhere = new Set(
                      assignments.filter((_, i) => i !== idx).map(x => x.ta_id).filter(Boolean),
                    );
                    return (
                      <AssignmentBlock
                        key={idx}
                        idx={idx}
                        n={idx + 1}
                        assignment={a}
                        sections={course?.sections ?? []}
                        tas={(tas?.items ?? []).filter(t => !takenElsewhere.has(t.id))}
                        scope={scope}
                        lectureHrs={course?.lecture_hrs ?? 0}
                        labHrs={course?.lab_hrs ?? 0}
                        tcId={tcId}
                        onConflicts={reportConflicts}
                        onUpdate={updateAssign}
                        onWorkload={updateWorkload}
                        onRemove={() => removeAssignment(idx)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </StepPanel>

        {err && (
          <Alert status="danger" title="ส่งคำขอไม่สำเร็จ" description={err} icon={<AlertCircle size={18} />} />
        )}
      </div>

      {/* Create-TA modal (stacked on top of the form modal) */}
      <CreateTaModal
        open={creatingTa}
        onClose={() => setCreatingTa(false)}
        onCreated={ta => {
          mutate("/users?role=ta&limit=200");
          addAssignment(undefined, ta.id, ta.study_level ?? "undergrad");
        }}
      />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StepPill({
  n, label, icon, ok,
}: { n: number; label: string; icon: React.ReactNode; ok: boolean }) {
  return (
    <div className={
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap " +
      (ok
        ? "bg-brand-soft text-brand border border-brand/20"
        : "bg-slate-50 text-ink-3 border border-hairline")
    }>
      <span className={
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold " +
        (ok ? "bg-brand text-white" : "bg-white border border-border")
      }>
        {ok ? <CheckCircle2 size={12} /> : n}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function StepPanel({
  n, title, description, status, children,
}: {
  n: number;
  title: string;
  description?: string;
  status?: { tone: "success" | "warn" | "danger" | "neutral"; text: string };
  children: React.ReactNode;
}) {
  return (
    <Panel padded={false}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-hairline">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center font-semibold shrink-0">
            {n}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm">{title}</div>
            {description && <div className="text-xs text-ink-3 mt-0.5">{description}</div>}
          </div>
        </div>
        {status && (
          <Chip tone={status.tone === "warn" ? "warn" : status.tone === "danger" ? "danger" : status.tone === "success" ? "success" : "neutral"}>
            {status.text}
          </Chip>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Panel>
  );
}

function ScopeRadio({ value, label, desc }: { value: string; label: string; desc: string }) {
  return (
    <Radio value={value} className="border border-border rounded-lg px-3 py-2 hover:bg-slate-50 data-selected:bg-brand-soft data-selected:border-brand/40">
      <Radio.Content>
        <Radio.Control>
          <Radio.Indicator />
        </Radio.Control>
        <div className="flex flex-col">
          <span className="font-medium">{label}</span>
          <Description className="text-xs text-ink-3">{desc}</Description>
        </div>
      </Radio.Content>
    </Radio>
  );
}

function sumWorkload(a: Assignment): number {
  const w = a.workload;
  if (a.level === "master" || a.level === "phd") {
    return w.help_teach_hrs + w.prep_hrs + w.grade_hrs + w.other_hrs;
  }
  return w.check_work_hrs + w.attendance_hrs + w.ug_other_hrs + w.lab_hrs;
}

function AssignmentBlock({
  idx, n, assignment: a, sections, tas, scope, lectureHrs, labHrs, tcId, onConflicts, onUpdate, onWorkload, onRemove,
}: {
  idx: number;
  n: number;
  assignment: Assignment;
  sections: Section[];
  tas: TA[];
  scope: "lecture" | "lab" | "both";
  lectureHrs: number;
  labHrs: number;
  tcId: string;
  onConflicts: (taId: string, list: SectionConflict[]) => void;
  onUpdate: (idx: number, patch: Partial<Assignment>) => void;
  onWorkload: (idx: number, patch: Partial<Assignment["workload"]>) => void;
  onRemove: () => void;
}) {
  const isGrad = a.level === "master" || a.level === "phd";
  const total = sumWorkload(a);

  // Preview schedule conflicts for this TA against every section of the
  // course. Runs whenever a TA is picked; the modal's Submit gate consumes
  // this data via onConflicts so a conflicting TA can't be sent through.
  const { data: conflictsData } = useSWR<ConflictsResp>(
    a.ta_id && tcId ? `/ta-requests/preview-conflicts?ta_id=${a.ta_id}&teaching_course_id=${tcId}` : null,
  );
  const conflicts = conflictsData?.conflicts ?? [];
  useEffect(() => {
    if (a.ta_id) onConflicts(a.ta_id, conflicts);
  }, [a.ta_id, conflicts, onConflicts]);
  const conflictBySection = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of conflicts) m.set(c.section_id, c.messages);
    return m;
  }, [conflicts]);
  const pickedConflicts = a.section_ids
    .map(sid => ({ sid, msgs: conflictBySection.get(sid) ?? [] }))
    .filter(x => x.msgs.length > 0);
  const blocked = pickedConflicts.length > 0;
  // Q&A rule 1: the 10–12 hr/week range is now advisory. Payment references
  // ตารางปฏิบัติงาน — this form's numbers are for course-planning only.
  // Per-field cap = course credit hrs × sections the TA covers. Guards against
  // a lecturer entering more hours than the physical class time the TA is
  // actually present for.
  const nSecs = a.section_ids.length;
  const lectureCap = lectureHrs * nSecs;
  const labCap = labHrs * nSecs;

  const ta = tas.find(t => t.id === a.ta_id);

  return (
    <div className={
      "rounded-lg border bg-white overflow-hidden " +
      (blocked ? "border-red-300" : "border-hairline")
    }>
      {/* Header */}
      <div className={
        "flex items-center justify-between gap-2 px-3 py-2 border-b " +
        (blocked ? "bg-red-50 border-red-200" : "bg-slate-50 border-hairline")
      }>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Chip tone={blocked ? "danger" : "brand"}>คนที่ {n}</Chip>
          {ta ? (
            <>
              <span className="font-medium text-sm truncate">{ta.first_name} {ta.last_name}</span>
              <span className="text-xs text-ink-3 truncate">{ta.email}</span>
            </>
          ) : (
            <span className="text-xs text-ink-3">ยังไม่ได้เลือก TA</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="ลบ">
          <Trash2 size={14} />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {/* TA + level picker */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
          <TaAutocomplete
            tas={tas}
            value={a.ta_id}
            onChange={(taId, level) => onUpdate(idx, { ta_id: taId, level })}
          />
          <FieldGroup label="ระดับ">
            <div className="h-9 flex items-center">
              <Chip tone={isGrad ? "brand" : "neutral"}>
                {a.level === "undergrad" ? "ปริญญาตรี" : a.level === "master" ? "ปริญญาโท" : a.level === "phd" ? "ปริญญาเอก" : a.level}
              </Chip>
            </div>
          </FieldGroup>
        </div>

        {/* Section multi-select — a TA may cover more than one section in the
            same course; each selected section becomes its own worklog target.
            Conflicting sections are surfaced inline so the lecturer sees the
            problem while picking, not after clicking Send. */}
        <SectionPicker
          sections={sections}
          value={a.section_ids}
          onChange={v => onUpdate(idx, { section_ids: v })}
          conflictBySection={conflictBySection}
        />

        {/* Blocking banner when the TA's currently-picked sections clash with
            their own class schedule or an approved TA duty elsewhere. */}
        {blocked && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle size={13} />
              TA คนนี้มีตารางทับซ้อน — กรุณาเอาชื่อออกหรือเปลี่ยน section
            </div>
            <ul className="pl-5 list-disc space-y-0.5">
              {pickedConflicts.flatMap(x =>
                x.msgs.map((m, i) => <li key={`${x.sid}-${i}`}>{m}</li>),
              )}
            </ul>
          </div>
        )}

        {/* Workload section — disabled visually and via pointer-events while
            a schedule conflict is unresolved so the lecturer must fix the
            picking before entering hours. */}
        <div className={blocked ? "opacity-50 pointer-events-none select-none" : ""}>
        {isGrad ? (
          // Grad regulation: total workload must sit in [10, 12] ชม./สัปดาห์.
          // Per-field cap = value + (12 - total) so increment buttons refuse
          // to push the sum above 12; the < 10 side is gated at submit-time.
          (() => {
            const gradRemaining = Math.max(0, GRAD_MAX_HRS - total);
            const cap = (v: number) => v + gradRemaining;
            return (
              <div>
                <div className="text-xs font-medium text-ink-2 mb-2">ภาระงาน (บัณฑิตศึกษา) — 10 ถึง 12 ชม./สัปดาห์</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <HrsRow label="ช่วยสอน" hrs={a.workload.help_teach_hrs} desc={a.workload.help_teach_desc}
                    max={cap(a.workload.help_teach_hrs)}
                    onH={v => onWorkload(idx, { help_teach_hrs: v })} onD={v => onWorkload(idx, { help_teach_desc: v })} />
                  <HrsRow label="เตรียมการสอน" hrs={a.workload.prep_hrs} desc={a.workload.prep_desc}
                    max={cap(a.workload.prep_hrs)}
                    onH={v => onWorkload(idx, { prep_hrs: v })} onD={v => onWorkload(idx, { prep_desc: v })} />
                  <HrsRow label="ตรวจแบบทดสอบ" hrs={a.workload.grade_hrs} desc={a.workload.grade_desc}
                    max={cap(a.workload.grade_hrs)}
                    onH={v => onWorkload(idx, { grade_hrs: v })} onD={v => onWorkload(idx, { grade_desc: v })} />
                  <HrsRow label="อื่น ๆ" hrs={a.workload.other_hrs} desc={a.workload.other_desc}
                    max={cap(a.workload.other_hrs)}
                    onH={v => onWorkload(idx, { other_hrs: v })} onD={v => onWorkload(idx, { other_desc: v })} />
                </div>
              </div>
            );
          })()
        ) : (
          <UndergradWorkload
            idx={idx}
            workload={a.workload}
            scope={scope}
            lectureHrs={lectureHrs}
            labHrs={labHrs}
            lectureCap={lectureCap}
            labCap={labCap}
            nSecs={nSecs}
            onWorkload={onWorkload}
          />
        )}
        </div>

        {/* Total footer */}
        {(() => {
          const gradUnder = isGrad && total < GRAD_MIN_HRS;
          const gradOver = isGrad && total > GRAD_MAX_HRS;
          const bad = gradUnder || gradOver || (!isGrad && total === 0);
          const msg = gradUnder
            ? `ต้องกรอกอย่างน้อย ${GRAD_MIN_HRS} ชม./สัปดาห์ ตามระเบียบบัณฑิตศึกษา — ยังส่งคำขอไม่ได้`
            : gradOver
            ? `เกินขีดจำกัด ${GRAD_MAX_HRS} ชม./สัปดาห์`
            : !isGrad && total === 0
            ? "ยังไม่ได้ระบุภาระงาน"
            : isGrad
            ? "อยู่ในช่วง 10–12 ชม./สัปดาห์"
            : "ภาระงานรวม";
          return (
            <div className={
              "flex items-center justify-between rounded-md px-3 py-2 text-xs " +
              (bad ? "bg-amber-50 text-amber-800" : total === 0 ? "bg-slate-50 text-ink-3" : "bg-brand-soft text-brand")
            }>
              <span className="flex items-center gap-1.5">
                {bad ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                {msg}
              </span>
              <span className="font-semibold">{total.toFixed(1)} ชม./สัปดาห์</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function UndergradWorkload({
  idx, workload, scope, lectureHrs, labHrs, lectureCap, labCap, nSecs, onWorkload,
}: {
  idx: number;
  workload: Assignment["workload"];
  scope: "lecture" | "lab" | "both";
  // Two levels of cap per category:
  //  • lectureCap / labCap = credit_hrs × n_sections — for activities that
  //    happen inside class time (ช่วยตรวจงาน, เช็คชื่อ, ปฏิบัติการ) whose
  //    ceiling scales with class exposure.
  //  • lectureHrs / labHrs = raw credit_hrs — for "อื่น ๆ" (prep, admin)
  //    which by rule cannot exceed the course's credit hours regardless of
  //    how many sections the TA covers.
  lectureHrs: number;
  labHrs: number;
  lectureCap: number;
  labCap: number;
  nSecs: number;
  onWorkload: (idx: number, patch: Partial<Assignment["workload"]>) => void;
}) {
  const showLec = scope === "lecture" || scope === "both";
  const showLab = scope === "lab" || scope === "both";
  const groupHint = (cap: number, unit: number) =>
    nSecs === 0
      ? "เลือก section ก่อนเพื่อกำหนดขีดจำกัด"
      : `สูงสุด ${cap.toFixed(1)} ชม./สัปดาห์ (${unit.toFixed(1)} × ${nSecs} sec)`;
  const otherHint = (hrs: number) =>
    nSecs === 0
      ? "เลือก section ก่อน"
      : `อื่น ๆ สูงสุด ${hrs.toFixed(1)} ชม./สัปดาห์ (= หน่วยกิต)`;

  return (
    <div className="space-y-3">
      {showLec && (
        <div className="rounded-md border border-hairline p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-medium text-ink-2">1. ชั่วโมงบรรยาย (ปริญญาตรี)</div>
            <div className="text-[11px] text-ink-3">{groupHint(lectureCap, lectureHrs)}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CheckHrs
              label="ช่วยตรวจงาน"
              hrs={workload.check_work_hrs}
              max={lectureCap}
              onH={v => onWorkload(idx, { check_work_hrs: v })}
            />
            <CheckHrs
              label="เช็คชื่อ / เก็บใบงาน"
              hrs={workload.attendance_hrs}
              max={lectureCap}
              onH={v => onWorkload(idx, { attendance_hrs: v })}
            />
            <div className="md:col-span-2">
              <CheckHrs
                label="อื่น ๆ"
                hrs={workload.ug_other_hrs}
                desc={workload.ug_other_desc}
                max={lectureHrs}
                hint={otherHint(lectureHrs)}
                onH={v => onWorkload(idx, { ug_other_hrs: v })}
                onD={v => onWorkload(idx, { ug_other_desc: v })}
              />
            </div>
          </div>
        </div>
      )}
      {showLab && (
        <div className="rounded-md border border-hairline p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-medium text-ink-2">2. ชั่วโมงปฏิบัติการ</div>
            <div className="text-[11px] text-ink-3">{groupHint(labCap, labHrs)}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CheckHrs
              label="จำนวนชั่วโมง"
              hrs={workload.lab_hrs}
              max={labCap}
              onH={v => onWorkload(idx, { lab_hrs: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Row with a checkbox (auto-enabled when hrs > 0) + hours + optional description.
 * Mirrors the "checkbox activity + hr/wk" pattern from the design mock-up.
 */
function CheckHrs({
  label, hrs, desc, max, hint, onH, onD,
}: {
  label: string;
  hrs: number;
  desc?: string;
  max?: number;
  hint?: string;
  onH: (v: number) => void;
  onD?: (v: string) => void;
}) {
  const enabled = hrs > 0;
  // Disable the whole row when the cap is 0 (no sections picked yet, or the
  // course simply has no credit hours in this category).
  const disabled = max !== undefined && max <= 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Checkbox
          isSelected={enabled}
          isDisabled={disabled}
          onChange={sel => { if (!sel) onH(0); else if (hrs === 0) onH(1); }}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="text-sm">{label}</span>
          </Checkbox.Content>
        </Checkbox>
        {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
      </div>
      <div className={"flex items-center gap-2 pl-6 " + (enabled && !disabled ? "" : "opacity-50 pointer-events-none")}>
        <HourInput value={hrs} onChange={onH} maxValue={max ?? 99} />
        {onD && (
          <TextInput
            value={desc ?? ""}
            onChange={e => onD(e.target.value)}
            placeholder="กิจกรรมที่ปฏิบัติ"
            className="flex-1"
          />
        )}
      </div>
    </div>
  );
}

function HrsRow({
  label, hrs, desc, onH, onD, max,
}: { label: string; hrs: number; desc: string; onH: (v: number) => void; onD: (v: string) => void; max?: number }) {
  return (
    <FieldGroup label={label}>
      <div className="flex items-center gap-2">
        <HourInput value={hrs} onChange={onH} maxValue={max} />
        <TextInput
          value={desc}
          onChange={e => onD(e.target.value)}
          placeholder="รายละเอียดกิจกรรม"
          className="flex-1"
        />
      </div>
    </FieldGroup>
  );
}

function SectionPicker({
  sections, value, onChange, conflictBySection,
}: {
  sections: Section[];
  value: string[];
  onChange: (ids: string[]) => void;
  // Conflicting sections (by id) with reason strings. Rendered as red chips
  // with a title tooltip so the lecturer can see the problem before picking.
  conflictBySection?: Map<string, string[]>;
}) {
  const invalid = value.length === 0;
  return (
    <CheckboxGroup
      value={value}
      onChange={onChange}
      className="w-full"
    >
      <Label className="text-sm font-medium">
        Section <span className="text-red-500">*</span>{" "}
        <span className="text-xs text-ink-3 font-normal">(เลือกได้มากกว่า 1 กลุ่ม)</span>
      </Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {sections.map(s => {
          const on = value.includes(s.id);
          const conflictMsgs = conflictBySection?.get(s.id);
          const bad = !!conflictMsgs?.length;
          return (
            <Checkbox
              key={s.id}
              value={s.id}
              aria-label={bad ? `Sec ${s.sec_no} — ${conflictMsgs?.join("; ")}` : `Sec ${s.sec_no}`}
              className={
                "border rounded-lg px-3 py-1.5 transition-colors cursor-pointer " +
                (bad && on
                  ? "border-red-400 bg-red-50"
                  : bad
                  ? "border-red-300 bg-red-50/60"
                  : on
                  ? "border-brand/40 bg-brand-soft"
                  : "border-border hover:bg-slate-50")
              }
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="text-sm">
                  Sec {s.sec_no}
                  {s.track === "special" ? (
                    <span className="text-xs text-ink-3 ml-1">· ภาคพิเศษ</span>
                  ) : null}
                  {bad && <span className="text-[10px] text-red-600 ml-1">· ตารางทับซ้อน</span>}
                </span>
              </Checkbox.Content>
            </Checkbox>
          );
        })}
      </div>
      {invalid && (
        <div className="text-xs text-red-600 mt-1">กรุณาเลือก section อย่างน้อย 1 กลุ่ม</div>
      )}
    </CheckboxGroup>
  );
}

function TaAutocomplete({
  tas, value, onChange,
}: {
  tas: TA[];
  value: string;
  onChange: (taId: string, level: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = tas.find(t => t.id === value) ?? null;

  return (
    <Autocomplete
      selectionMode="single"
      value={value || null}
      onChange={(k: Key | null) => {
        const id = k ? String(k) : "";
        const t = tas.find(x => x.id === id);
        onChange(id, t?.study_level ?? "undergrad");
      }}
      className="w-full"
      placeholder="พิมพ์ชื่อหรืออีเมลเพื่อค้นหา…"
    >
      <Label>เลือก TA</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {({ defaultChildren, isPlaceholder }) => {
            if (isPlaceholder || !selected) return defaultChildren;
            return (
              <span className="truncate">
                {selected.first_name} {selected.last_name}
                <span className="text-ink-3 text-xs ml-1">· {selected.email}</span>
              </span>
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="ta-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="ค้นหา TA…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox renderEmptyState={() => <HEmptyState>ไม่พบ TA ที่ตรงกัน</HEmptyState>}>
            {tas.map(t => (
              <ListBox.Item
                key={t.id}
                id={t.id}
                textValue={`${t.first_name} ${t.last_name} ${t.email}`}
              >
                <div className="flex flex-col min-w-0">
                  <Label>{t.first_name} {t.last_name}</Label>
                  <Description className="text-xs">
                    {t.email} · {t.study_level === "master" ? "ป.โท" : t.study_level === "phd" ? "ป.เอก" : "ป.ตรี"}
                  </Description>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

function HourInput({
  value, onChange, maxValue,
}: { value: number; onChange: (v: number) => void; maxValue?: number }) {
  return (
    <NumberField
      value={value}
      onChange={onChange}
      minValue={0}
      maxValue={maxValue}
      step={0.5}
      formatOptions={{ maximumFractionDigits: 1 }}
      className="w-32 shrink-0"
      aria-label="ชั่วโมง/สัปดาห์"
    >
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-TA modal — mirrors the staff CreateUserModal but locked to role=ta  */
/* -------------------------------------------------------------------------- */

const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว"];
const STUDY_LEVELS: { value: string; label: string }[] = [
  { value: "undergrad", label: "ปริญญาตรี" },
  { value: "master", label: "ปริญญาโท" },
  { value: "phd", label: "ปริญญาเอก" },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function CreateTaModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ta: TA) => void;
}) {
  const [form, setForm] = useState({
    email: "", title: "นาย", first_name: "", last_name: "", study_level: "undergrad",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ user: TA; temp_password: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ email: "", title: "นาย", first_name: "", last_name: "", study_level: "undergrad" });
      setErr(null); setCreated(null); setShowErrors(false);
    }
  }, [open]);

  const errors = useMemo(() => ({
    email: !form.email.trim()
      ? "กรุณากรอกอีเมล"
      : !EMAIL_RE.test(form.email.trim())
      ? "รูปแบบอีเมลไม่ถูกต้อง"
      : null,
    first_name: !form.first_name.trim() ? "กรุณากรอกชื่อ" : null,
    last_name: !form.last_name.trim() ? "กรุณากรอกนามสกุล" : null,
    study_level: STUDY_LEVELS.some(l => l.value === form.study_level) ? null : "กรุณาเลือกระดับการศึกษา",
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      const res = await api.post<{ user: TA; temp_password: string }>("/users", {
        email: form.email.trim(),
        title: form.title,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        roles: ["ta"],
        study_level: form.study_level,
      });
      setCreated(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function useAndClose() {
    if (created) onCreated(created.user);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? "สร้างบัญชี TA สำเร็จ" : "สร้างบัญชี TA ใหม่"}
      size="lg"
      icon={<UserPlus size={18} />}
      footer={
        created ? (
          <>
            <Button variant="ghost" onClick={onClose}>ปิด</Button>
            <Button variant="primary" onClick={useAndClose}>
              <Plus size={14} /> เพิ่มเข้ารายวิชานี้
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button variant="primary" onClick={submit}
              disabled={pending || (showErrors && hasErrors)} isPending={pending}>
              สร้างบัญชี
            </Button>
          </>
        )
      }
    >
      {created ? (
        <TempPasswordPanel email={created.user.email} password={created.temp_password} />
      ) : (
        <div className="space-y-3">
          <Alert
            status="accent"
            title="บัญชีนี้จะได้รับสิทธิ์ผู้ช่วยสอน (TA)"
            description="สร้างบัญชีสำหรับ TA ใหม่ที่ยังไม่มีในระบบ ระบบจะสร้างรหัสผ่านชั่วคราวให้"
            icon={<Info size={16} />}
          />
          <VField
            label="อีเมล" required type="email" placeholder="ta@kkumail.com"
            value={form.email} onChange={v => setForm({ ...form, email: v })}
            error={errors.email} show={showErrors}
          />
          <div className="grid grid-cols-[140px_1fr_1fr] gap-3">
            <FieldGroup label="คำนำหน้า">
              <Select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}>
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FieldGroup>
            <VField label="ชื่อ" required
              value={form.first_name} onChange={v => setForm({ ...form, first_name: v })}
              error={errors.first_name} show={showErrors}
            />
            <VField label="นามสกุล" required
              value={form.last_name} onChange={v => setForm({ ...form, last_name: v })}
              error={errors.last_name} show={showErrors}
            />
          </div>
          <FieldGroup label="ระดับการศึกษา">
            <Select value={form.study_level} onChange={e => setForm({ ...form, study_level: e.target.value })}>
              {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          </FieldGroup>
          {err && <Alert status="danger" title="สร้างบัญชีไม่สำเร็จ" description={err} />}
        </div>
      )}
    </Modal>
  );
}

function VField({
  label, value, onChange, error, show, type = "text", placeholder, required, autoFocus,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  show: boolean;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const invalid = show && !!error;
  return (
    <HTextField value={value} onChange={onChange} isInvalid={invalid} isRequired={required} autoFocus={autoFocus}>
      <HLabel>{label}</HLabel>
      <HInput type={type} placeholder={placeholder} />
      {invalid && <HFieldError>{error}</HFieldError>}
    </HTextField>
  );
}

function TempPasswordPanel({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }
  return (
    <div className="space-y-3">
      <Alert
        status="success"
        title="รหัสผ่านชั่วคราวถูกสร้างแล้ว"
        description="โปรดคัดลอกและส่งให้ TA ระบบจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งแรก รหัสนี้จะไม่แสดงอีก"
        icon={<CheckCircle2 size={18} />}
      />
      <div>
        <div className="text-xs text-muted mb-1">อีเมล</div>
        <div className="text-sm font-mono">{email}</div>
      </div>
      <div>
        <div className="text-xs text-muted mb-1">รหัสผ่านชั่วคราว</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-md bg-default text-sm font-mono select-all">
            {password}
          </code>
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Submission-window status banner                                             */
/* -------------------------------------------------------------------------- */

function useWindowState(windows: RequestWindow[] | undefined): WindowState {
  // Re-render every minute so the countdown ticks down without a manual refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return useMemo<WindowState>(() => {
    if (!windows || windows.length === 0) return { phase: "none" };

    const active = windows.find(w => {
      if (!w.is_open) return false;
      const o = new Date(w.opens_at).getTime();
      const c = new Date(w.closes_at).getTime();
      return o <= now && now <= c;
    });
    if (active) {
      const c = new Date(active.closes_at).getTime();
      return { phase: "open", window: active, closesAt: c, remainingMs: c - now };
    }

    const upcoming = windows
      .filter(w => w.is_open && new Date(w.opens_at).getTime() > now)
      .sort((a, b) => new Date(a.opens_at).getTime() - new Date(b.opens_at).getTime())[0];
    if (upcoming) {
      const o = new Date(upcoming.opens_at).getTime();
      return { phase: "upcoming", window: upcoming, opensAt: o, untilMs: o - now };
    }

    const last = windows
      .slice()
      .sort((a, b) => new Date(b.closes_at).getTime() - new Date(a.closes_at).getTime())[0];
    return { phase: "closed", lastWindow: last };
  }, [windows, now]);
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "หมดเวลาแล้ว";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} วัน ${hours} ชั่วโมง`;
  if (hours > 0) return `${hours} ชั่วโมง ${minutes} นาที`;
  return `${minutes} นาที`;
}

const THAI_MONTHS_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${d.getFullYear() + 543}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm} น.`;
}

function WindowStatusBanner({ state, loading }: { state: WindowState; loading: boolean }) {
  if (loading) return null;

  if (state.phase === "open") {
    const urgent = state.remainingMs < 24 * 60 * 60 * 1000;
    return (
      <div
        className={
          "mb-3 rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 " +
          (urgent
            ? "border-amber-300 bg-amber-50"
            : "border-emerald-300 bg-emerald-50")
        }
      >
        <Chip tone={urgent ? "warn" : "success"}>
          <CheckCircle2 size={12} /> เปิดรับคำขอ
        </Chip>
        <div className="flex flex-col min-w-0">
          <div className={"text-sm font-medium " + (urgent ? "text-amber-900" : "text-emerald-900")}>
            <Clock size={14} className="inline -mt-0.5 mr-1" />
            เหลืออีก {formatRemaining(state.remainingMs)} จะปิดรับ
          </div>
          <div className={"text-xs " + (urgent ? "text-amber-800" : "text-emerald-800")}>
            ปิดรับ: {formatThaiDateTime(state.window.closes_at)}
            {state.window.note ? ` · ${state.window.note}` : ""}
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "upcoming") {
    return (
      <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 flex flex-wrap items-center gap-3">
        <Chip tone="info"><CalendarClock size={12} /> ยังไม่เปิดรับ</Chip>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium text-sky-900">
            จะเปิดรับใน {formatRemaining(state.untilMs)}
          </div>
          <div className="text-xs text-sky-800">
            เปิดรับ: {formatThaiDateTime(state.window.opens_at)}
            {" → "}
            ปิดรับ: {formatThaiDateTime(state.window.closes_at)}
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "closed") {
    return (
      <div className="mb-3 rounded-lg border border-hairline bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-3">
        <Chip tone="neutral"><AlertCircle size={12} /> ปิดรับคำขอแล้ว</Chip>
        <div className="text-sm text-ink-2">
          {state.lastWindow
            ? `ช่วงล่าสุดปิดรับเมื่อ ${formatThaiDateTime(state.lastWindow.closes_at)}`
            : "ไม่มีช่วงเวลารับสมัครที่เปิดอยู่"}
          {" — โปรดติดต่อเจ้าหน้าที่หากต้องการยื่นคำขอ"}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-hairline bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-3">
      <Chip tone="neutral"><AlertCircle size={12} /> ยังไม่กำหนดช่วงเวลารับสมัคร</Chip>
      <div className="text-sm text-ink-2">
        เจ้าหน้าที่ยังไม่ได้กำหนดช่วงเวลารับคำขอ TA สำหรับภาคเรียนนี้
      </div>
    </div>
  );
}
