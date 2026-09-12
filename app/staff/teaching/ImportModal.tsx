"use client";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "@heroui/react";
import {
  CheckCircle2, Upload, AlertTriangle, FileSpreadsheet,
  ChevronRight, Loader2, GitMerge,
} from "lucide-react";
import { api } from "../../lib/api";
import { Modal, Button, Chip, FieldGroup, Alert } from "../../components/ui";
import { pickPrimaryCode } from "../../lib/courseCode";

interface PreviewCourse {
  code: string;
  name: string;
  status: "new" | "existing" | "unmatched_officer";
  section_count: number;
  schedule_count: number;
  officer_raw: string;
  // อาจเป็น null ได้ — Go marshal nil slice เป็น null (ไม่ใช่ []) จึงต้องกันทุกจุด
  officer_names: string[] | null;
  matched_lecturer_ids: string[] | null;
  unmatched_names?: string[] | null;
  note?: string;
}

// One code inside a same-name group: a course in the file, or one already
// open in the term that the file's course could be folded into.
interface MergeMember {
  code: string;
  status: "new" | "existing" | "unmatched_officer";
  existing_id?: string;
  alt_codes: string[];
  lecturers: string[];
  section_count: number;
  students: number;
  suggested: boolean;
}

interface MergeGroup {
  name: string;
  members: MergeMember[];
}

interface Preview {
  filename: string;
  courses: PreviewCourse[];
  new_count: number;
  existing_count: number;
  blocked_count: number;
  merge_groups: MergeGroup[] | null;
}

interface CommitResult {
  row_count: number;
  created_ids?: string[];
  skipped_codes?: string[];
  merged_codes?: string[];
  error_count: number;
  errors?: string[];
}

// Staff's answer for one same-name group: which codes become one course.
// `primary` is the code the merge is written against — an existing course
// when one is ticked (the file's courses fold INTO it), else the first ticked.
// Which code PRINTS is not a choice: the backend promotes the newest
// curriculum's code (CP > SC > six digits, see pickPrimaryCode). Fewer than
// two codes means "open them separately".
interface MergeChoice { codes: string[]; primary: string }
type MergeChoices = Record<string, MergeChoice>;

// Default answer: the members the system thinks are the same class (same
// lecturer or a section at the same slot), an existing course as primary
// when one is in the group. Nothing suggested → nothing ticked.
function seedMergeChoices(groups: MergeGroup[]): MergeChoices {
  const out: MergeChoices = {};
  for (const g of groups) {
    const codes = g.members.filter(m => m.suggested).map(m => m.code);
    out[g.name] = { codes: codes.length >= 2 ? codes : [], primary: "" };
    out[g.name].primary = defaultPrimary(g, out[g.name].codes);
  }
  return out;
}

function defaultPrimary(g: MergeGroup, codes: string[]): string {
  const existing = g.members.find(m => m.status === "existing" && codes.includes(m.code));
  return existing?.code ?? codes[0] ?? "";
}

// code → primary it folds into, for every group with two or more ticked codes.
function mergeTargets(choices: MergeChoices): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of Object.values(choices)) {
    if (c.codes.length < 2 || !c.primary) continue;
    for (const code of c.codes) if (code !== c.primary) m.set(code, c.primary);
  }
  return m;
}

function mergePayload(choices: MergeChoices): { primary: string; codes: string[] }[] {
  return Object.values(choices)
    .filter(c => c.codes.length >= 2 && c.primary)
    .map(c => ({ primary: c.primary, codes: c.codes.filter(x => x !== c.primary) }));
}

type Phase = "upload" | "preview" | "committing" | "done";

// For unmatched-officer courses, staff must pick per-course whether to
// proceed unassigned or skip. Other statuses ignore this map.
type UnmatchedDecision = "proceed" | "skip";

export default function ImportModal({
  open, onClose, termId, termLabel,
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, UnmatchedDecision>>({});
  const [merges, setMerges] = useState<MergeChoices>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setPhase("upload");
    setFile(null);
    setPreview(null);
    setDecisions({});
    setMerges({});
    setPending(false);
    setResult(null);
    setErr(null);
  }

  function handleClose() {
    if (pending) return;
    if (phase === "done") {
      // Trigger the parent list to refresh SWR for this term.
      mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
    }
    reset();
    onClose();
  }

  async function loadPreview() {
    if (!file || !termId) return;
    setPending(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("term_id", termId);
      form.append("file", file);
      const res = await api.upload<Preview>("/teaching-courses/import?dry_run=1", form);
      setPreview(res);
      // Default decision for unmatched courses is "proceed" — the least
      // destructive choice. Staff can flip to "skip" per row.
      const seed: Record<string, UnmatchedDecision> = {};
      for (const c of res.courses) {
        if (c.status === "unmatched_officer") seed[c.code] = "proceed";
      }
      setDecisions(seed);
      setMerges(seedMergeChoices(res.merge_groups ?? []));
      setPhase("preview");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    if (!file || !termId || !preview) return;
    setPending(true);
    setErr(null);
    setPhase("committing");
    try {
      const skipCodes = Object.entries(decisions)
        .filter(([, v]) => v === "skip")
        .map(([code]) => code);
      const form = new FormData();
      form.append("term_id", termId);
      form.append("file", file);
      if (skipCodes.length > 0) form.append("skip_codes", skipCodes.join(","));
      const payload = mergePayload(merges);
      if (payload.length > 0) form.append("merges", JSON.stringify(payload));
      const res = await api.upload<CommitResult>("/teaching-courses/import", form);
      setResult(res);
      setPhase("done");
      const merged = res.merged_codes?.length ?? 0;
      toast.success("นำเข้าเรียบร้อยแล้ว", {
        description: `สร้าง ${res.created_ids?.length ?? 0} รายวิชา${merged ? ` · รวม ${merged} รหัส` : ""}`,
      });
    } catch (e) {
      setErr((e as Error).message);
      setPhase("preview");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      icon={<FileSpreadsheet size={18} />}
      title={`นำเข้ารายวิชา · ${termLabel}`}
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="text-xs text-muted">
            {phase === "preview" && preview && <PreviewSummary p={preview} decisions={decisions} merges={merges} />}
          </div>
          <div className="flex gap-2">
            <Button variant="tertiary" onPress={handleClose} disabled={pending}>
              {phase === "done" ? "ปิด" : "ยกเลิก"}
            </Button>
            {phase === "upload" && (
              <Button variant="primary" onPress={loadPreview} disabled={!file || pending} isPending={pending}>
                <ChevronRight size={14} /> อ่านไฟล์
              </Button>
            )}
            {phase === "preview" && preview && (
              <Button
                variant="primary"
                onPress={commit}
                disabled={pending || !hasWorkToDo(preview, decisions, merges)}
                isPending={pending}
              >
                <CheckCircle2 size={14} /> ยืนยันนำเข้า
              </Button>
            )}
          </div>
        </div>
      }
    >
      {err && (
        <div className="mb-3">
          <Alert status="danger" title="เกิดข้อผิดพลาด" description={err} />
        </div>
      )}

      {phase === "upload" && (
        <FieldGroup
          label="ไฟล์ Excel"
          hint="ไฟล์ 'รายวิชาที่เปิดสอน-<เทอม>-<ปี>.xlsx' จากระบบทะเบียน ระบบสร้างวิชาจากไฟล์โดยตรง (อ่านชีต 'Normalized' หรือไฟล์ดิบ 'sysTitle' ก็ได้)"
        >
          <input
            type="file"
            accept=".xlsx"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-(--hairline) bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700"
          />
          {file && (
            <p className="mt-2 text-xs text-muted inline-flex items-center gap-1">
              <FileSpreadsheet size={12} /> {file.name} · {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
        </FieldGroup>
      )}

      {phase === "preview" && preview && (
        <PreviewTable
          p={preview} decisions={decisions} setDecisions={setDecisions}
          merges={merges} setMerges={setMerges}
        />
      )}

      {phase === "committing" && (
        <div className="py-8 text-center text-sm text-muted inline-flex flex-col items-center gap-2">
          <Loader2 size={20} className="animate-spin" />
          กำลังบันทึกลงฐานข้อมูล…
        </div>
      )}

      {phase === "done" && result && (
        <ResultView r={result} />
      )}
    </Modal>
  );
}

// A file course is imported unless staff skipped it. Whether it becomes its
// own course or folds into another is the merge choice.
function isImported(c: PreviewCourse, decisions: Record<string, UnmatchedDecision>): boolean {
  if (c.status === "new") return true;
  if (c.status === "unmatched_officer") return decisions[c.code] !== "skip";
  return false;
}

function tally(p: Preview, decisions: Record<string, UnmatchedDecision>, merges: MergeChoices) {
  const targets = mergeTargets(merges);
  let create = 0, merge = 0, skip = 0;
  for (const c of p.courses) {
    if (!isImported(c, decisions)) { skip++; continue; }
    if (targets.has(c.code)) merge++; else create++;
  }
  return { create, merge, skip };
}

function hasWorkToDo(p: Preview, decisions: Record<string, UnmatchedDecision>, merges: MergeChoices): boolean {
  const t = tally(p, decisions, merges);
  return t.create + t.merge > 0;
}

function PreviewSummary({ p, decisions, merges }: {
  p: Preview; decisions: Record<string, UnmatchedDecision>; merges: MergeChoices;
}) {
  const t = tally(p, decisions, merges);
  return (
    <span className="inline-flex items-center gap-2">
      <span>จะสร้าง <b className="text-(--ink-1)">{t.create}</b></span>
      {t.merge > 0 && <span>· รวมเข้าวิชาอื่น <b className="text-(--ink-1)">{t.merge}</b></span>}
      <span>· ข้าม {t.skip}</span>
    </span>
  );
}

function PreviewTable({
  p, decisions, setDecisions, merges, setMerges,
}: {
  p: Preview;
  decisions: Record<string, UnmatchedDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, UnmatchedDecision>>>;
  merges: MergeChoices;
  setMerges: React.Dispatch<React.SetStateAction<MergeChoices>>;
}) {
  const groups = p.merge_groups ?? [];
  const targets = mergeTargets(merges);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <SummaryChip tone="success" label="ใหม่ (จะสร้าง)" count={p.new_count} icon={<CheckCircle2 size={12} />} />
        <SummaryChip tone="neutral" label="มีแล้ว ข้าม" count={p.existing_count} />
        <SummaryChip tone="warn" label="ต้องตัดสินใจ" count={p.blocked_count} icon={<AlertTriangle size={12} />} />
      </div>

      {groups.length > 0 && (
        <MergeGroups groups={groups} merges={merges} setMerges={setMerges} />
      )}

      <div className="overflow-x-auto rounded-md border border-(--hairline)">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-(--ink-3)">
            <tr>
              <th className="px-2 py-1.5 text-left">รหัส</th>
              <th className="px-2 py-1.5 text-left">ชื่อวิชา</th>
              <th className="px-2 py-1.5 text-right">Sec</th>
              <th className="px-2 py-1.5 text-right">คาบ</th>
              <th className="px-2 py-1.5 text-left">อาจารย์</th>
              <th className="px-2 py-1.5 text-left">สถานะ</th>
              <th className="px-2 py-1.5 text-left">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--hairline)">
            {p.courses.map(c => (
              <PreviewRow
                key={c.code}
                c={c}
                decision={decisions[c.code]}
                mergeInto={targets.get(c.code)}
                onDecide={v => setDecisions(prev => ({ ...prev, [c.code]: v }))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewRow({
  c, decision, mergeInto, onDecide,
}: {
  c: PreviewCourse;
  decision?: UnmatchedDecision;
  /** Primary code this row folds into, when staff chose to merge it. */
  mergeInto?: string;
  onDecide: (v: UnmatchedDecision) => void;
}) {
  const isSkipped =
    c.status === "existing"
    || (c.status === "unmatched_officer" && decision === "skip");
  return (
    <tr className={isSkipped ? "bg-slate-50/40 text-(--ink-3)" : ""}>
      <td className="px-2 py-1.5 font-medium tabular-nums">{c.code}</td>
      <td className="px-2 py-1.5">{c.name}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{c.section_count}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{c.schedule_count}</td>
      <td className="px-2 py-1.5">
        <OfficerCell c={c} />
      </td>
      <td className="px-2 py-1.5">
        <StatusChip status={c.status} />
      </td>
      <td className="px-2 py-1.5">
        {c.status === "new" && (
          mergeInto
            ? <span className="text-sky-700">รวมเข้า {mergeInto}</span>
            : <span className="text-emerald-700">จะสร้าง</span>
        )}
        {c.status === "existing" && <span>ข้าม (มีอยู่แล้ว)</span>}
        {c.status === "unmatched_officer" && (
          <div className="inline-flex flex-col gap-0.5">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name={`d-${c.code}`}
                checked={decision === "proceed"}
                onChange={() => onDecide("proceed")}
              />
              <span>{mergeInto ? `รวมเข้า ${mergeInto}` : "สร้างโดยยังไม่ผูก"}</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name={`d-${c.code}`}
                checked={decision === "skip"}
                onChange={() => onDecide("skip")}
              />
              <span>ข้าม</span>
            </label>
          </div>
        )}
      </td>
    </tr>
  );
}

// Same name, different codes: staff decide per group whether the codes are one
// course (students added together, one budget) or separate courses.
function MergeGroups({
  groups, merges, setMerges,
}: {
  groups: MergeGroup[];
  merges: MergeChoices;
  setMerges: React.Dispatch<React.SetStateAction<MergeChoices>>;
}) {
  // A course already open in the term can only be the primary — the file's
  // courses fold INTO it, never the other way round — so at most one existing
  // course may be ticked per group, and ticking it makes it the primary.
  const isExisting = (g: MergeGroup, code: string) =>
    g.members.find(m => m.code === code)?.status === "existing";
  function toggle(g: MergeGroup, code: string) {
    setMerges(prev => {
      const cur = prev[g.name] ?? { codes: [], primary: "" };
      const codes = cur.codes.includes(code) ? cur.codes.filter(c => c !== code) : [...cur.codes, code];
      const existing = codes.find(c => isExisting(g, c));
      const primary = existing ?? (codes.includes(cur.primary) ? cur.primary : defaultPrimary(g, codes));
      return { ...prev, [g.name]: { codes, primary } };
    });
  }
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/20 p-3 space-y-3">
      <div className="text-xs">
        <p className="font-medium text-(--ink-1) inline-flex items-center gap-1">
          <GitMerge size={13} /> วิชาชื่อเดียวกันแต่คนละรหัส {groups.length} กลุ่ม
        </p>
        <p className="text-(--ink-3) mt-0.5">
          ติ๊กรหัสที่เป็นวิชาเดียวกัน ระบบจะรวมเป็นวิชาเดียว นับนักศึกษารวมกันและคิดงบก้อนเดียว
          รหัสที่ไม่ติ๊กเปิดแยกตามปกติ · เอกสารใช้รหัสหลักรหัสเดียว: CP ก่อน SC ก่อนเลข 6 หลัก
        </p>
      </div>
      {groups.map(g => {
        const choice = merges[g.name] ?? { codes: [], primary: "" };
        const merging = choice.codes.length >= 2;
        const existingOn = g.members.find(m => m.status === "existing" && choice.codes.includes(m.code));
        return (
          <div key={g.name} className="rounded border border-(--hairline) bg-white dark:bg-transparent">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-(--hairline)">
              <span className="text-xs font-medium">{g.name}</span>
              <span className="text-[11px] text-(--ink-3)">
                {merging
                  ? `รวม ${choice.codes.length} รหัสเป็นวิชาเดียว · รหัสหลัก ${pickPrimaryCode(choice.codes)}`
                  : "เปิดแยกทุกรหัส"}
              </span>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-(--hairline)">
                {g.members.map(m => {
                  const on = choice.codes.includes(m.code);
                  // Second existing course in one group: cannot be merged here.
                  const blocked = !on && m.status === "existing" && !!existingOn;
                  return (
                    <tr key={m.code} className={on ? "" : "text-(--ink-3)"}>
                      <td className="px-2 py-1.5 w-8">
                        <input
                          type="checkbox"
                          aria-label={`รวม ${m.code}`}
                          checked={on}
                          disabled={blocked}
                          title={blocked ? "รวมวิชาที่เปิดอยู่แล้วสองวิชาเข้าด้วยกันไม่ได้จากหน้านี้" : undefined}
                          onChange={() => toggle(g, m.code)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium tabular-nums whitespace-nowrap">
                        {m.code}
                        {m.alt_codes.map(a => <span key={a} className="font-normal text-(--ink-3)"> / {a}</span>)}
                      </td>
                      <td className="px-2 py-1.5">
                        {m.status === "existing"
                          ? <Chip tone="neutral">เปิดอยู่แล้ว</Chip>
                          : <Chip tone="success">ในไฟล์</Chip>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {m.lecturers.length > 0 ? m.lecturers.join(", ") : <span className="text-(--ink-4)">(ไม่ระบุอาจารย์)</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {m.section_count} sec · {m.students} คน
                      </td>
                      <td className="px-2 py-1.5 w-20 text-(--ink-3)">
                        {on && merging && pickPrimaryCode(choice.codes) === m.code && (
                          <span className="whitespace-nowrap">รหัสหลัก</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function OfficerCell({ c }: { c: PreviewCourse }) {
  const officers = c.officer_names ?? [];
  const matched = c.matched_lecturer_ids ?? [];
  const unmatched = c.unmatched_names ?? [];
  if (officers.length === 0 && unmatched.length === 0) {
    return <span className="text-(--ink-4)">(ไม่ระบุ)</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {matched.length > 0 && (
        <Chip tone="success">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} /> {matched.length} คน</span>
        </Chip>
      )}
      {unmatched.map(n => (
        <Chip key={n} tone="warn">
          <span className="inline-flex items-center gap-1"><AlertTriangle size={10} /> {n}</span>
        </Chip>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: PreviewCourse["status"] }) {
  switch (status) {
    case "new": return <Chip tone="success">ใหม่</Chip>;
    case "existing": return <Chip tone="neutral">มีแล้ว</Chip>;
    case "unmatched_officer": return <Chip tone="warn">ต้องตัดสินใจ</Chip>;
  }
}

function SummaryChip({
  tone, label, count, icon,
}: {
  tone: "success" | "neutral" | "warn" | "danger";
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-(--hairline) px-2 py-1 flex items-center justify-between">
      <span className="inline-flex items-center gap-1 text-(--ink-3)">
        {icon}
        {label}
      </span>
      <Chip tone={tone}>{count}</Chip>
    </div>
  );
}

function ResultView({ r }: { r: CommitResult }) {
  return (
    <div className="space-y-3 text-sm">
      <Alert
        status="success"
        title={`นำเข้าเรียบร้อย · สร้าง ${r.created_ids?.length ?? 0} รายวิชา`}
        description={`${r.merged_codes?.length ? `รวม ${r.merged_codes.length} รหัส · ` : ""}ข้าม ${r.skipped_codes?.length ?? 0} รายการ · error ${r.error_count} รายการ`}
      />
      {(r.merged_codes?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-(--ink-2)">รหัสที่รวมเป็นวิชาเดียว</p>
          <p className="text-xs text-(--ink-3) font-mono">{r.merged_codes!.join(", ")}</p>
        </div>
      )}
      {(r.errors?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-(--ink-2)">รายการที่มีปัญหา</p>
          <ul className="text-xs space-y-1 max-h-48 overflow-y-auto rounded border border-(--hairline) p-2">
            {r.errors!.map((e, i) => (
              <li key={i} className="text-red-700">• {e}</li>
            ))}
          </ul>
        </div>
      )}
      {(r.skipped_codes?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-(--ink-2)">รหัสวิชาที่ข้าม</p>
          <p className="text-xs text-(--ink-3) font-mono">{r.skipped_codes!.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
