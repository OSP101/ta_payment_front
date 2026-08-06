"use client";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "@heroui/react";
import {
  CheckCircle2, Upload, AlertTriangle, FileSpreadsheet,
  ChevronRight, Loader2,
} from "lucide-react";
import { api } from "../../lib/api";
import { Modal, Button, Chip, FieldGroup, Alert } from "../../components/ui";

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

interface Preview {
  filename: string;
  courses: PreviewCourse[];
  new_count: number;
  existing_count: number;
  blocked_count: number;
}

interface CommitResult {
  row_count: number;
  created_ids?: string[];
  skipped_codes?: string[];
  error_count: number;
  errors?: string[];
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
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setPhase("upload");
    setFile(null);
    setPreview(null);
    setDecisions({});
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
      const res = await api.upload<CommitResult>("/teaching-courses/import", form);
      setResult(res);
      setPhase("done");
      toast.success("นำเข้าเรียบร้อยแล้ว", {
        description: `สร้าง ${res.created_ids?.length ?? 0} รายวิชา`,
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
            {phase === "preview" && preview && <PreviewSummary p={preview} decisions={decisions} />}
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
                disabled={pending || !hasWorkToDo(preview, decisions)}
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
        <PreviewTable p={preview} decisions={decisions} setDecisions={setDecisions} />
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

function hasWorkToDo(p: Preview, decisions: Record<string, UnmatchedDecision>): boolean {
  return p.courses.some(c => {
    if (c.status === "new") return true;
    if (c.status === "unmatched_officer") return decisions[c.code] !== "skip";
    return false;
  });
}

function PreviewSummary({ p, decisions }: { p: Preview; decisions: Record<string, UnmatchedDecision> }) {
  const willCreate = p.courses.filter(c =>
    c.status === "new" || (c.status === "unmatched_officer" && decisions[c.code] !== "skip"),
  ).length;
  return (
    <span className="inline-flex items-center gap-2">
      <span>จะสร้าง <b className="text-(--ink-1)">{willCreate}</b></span>
      <span>· ข้าม {p.existing_count + p.courses.filter(c => c.status === "unmatched_officer" && decisions[c.code] === "skip").length}</span>
    </span>
  );
}

function PreviewTable({
  p, decisions, setDecisions,
}: {
  p: Preview;
  decisions: Record<string, UnmatchedDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, UnmatchedDecision>>>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <SummaryChip tone="success" label="ใหม่ (จะสร้าง)" count={p.new_count} icon={<CheckCircle2 size={12} />} />
        <SummaryChip tone="neutral" label="มีแล้ว ข้าม" count={p.existing_count} />
        <SummaryChip tone="warn" label="ต้องตัดสินใจ" count={p.blocked_count} icon={<AlertTriangle size={12} />} />
      </div>

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
  c, decision, onDecide,
}: {
  c: PreviewCourse;
  decision?: UnmatchedDecision;
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
        {c.status === "new" && <span className="text-emerald-700">จะสร้าง</span>}
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
              <span>สร้างโดยยังไม่ผูก</span>
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
        description={`ข้าม ${r.skipped_codes?.length ?? 0} รายการ · error ${r.error_count} รายการ`}
      />
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
