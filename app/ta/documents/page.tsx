"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Accordion } from "@heroui/react";
import {
  AlertTriangle, Save, Upload, Download, CheckCircle2, Circle,
  IdCard, Wallet, FileSignature, CreditCard, BookOpen,
} from "lucide-react";
import { api } from "../../lib/api";
import Signature from "../../components/Signature";
import {
  PageHeader, Panel, Button, TextInput, FieldGroup, StatusChip, Alert, Chip,
} from "../../components/ui";
import { SampleToggle } from "./SampleDocs";

interface Profile {
  student_id: string;
  national_id: string; bank_name: string; bank_branch: string; branch_code: string;
  account_no: string; account_name: string;
  signature_svg: string; signature_png_b64: string;
  status: string; reject_reason?: string;
}
interface Doc { id: string; kind: string; filename: string; status: string; reject_reason?: string; }

const emptyProfile: Profile = {
  student_id: "",
  national_id: "", bank_name: "", bank_branch: "", branch_code: "",
  account_no: "", account_name: "",
  signature_svg: "", signature_png_b64: "", status: "pending",
};

type DocKind = "creditor_form" | "national_id" | "bank_book";

const STEP_META: Array<{
  id: string;
  n: number;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: "profile",       n: 1, title: "ข้อมูลส่วนตัว + บัญชี + ลายเซ็น", subtitle: "รหัสนักศึกษา, เลขบัตรประชาชน, บัญชีรับเงิน, ลายเซ็น",         icon: IdCard },
  { id: "creditor_form", n: 2, title: "แบบแจ้งเจ้าหนี้ (PDF)",           subtitle: "ดาวน์โหลด → เซ็น → สแกน → อัปโหลดกลับ",                       icon: FileSignature },
  { id: "national_id",   n: 3, title: "สำเนาบัตรประชาชน",                subtitle: "รับรอง “สำเนาถูกต้อง” พร้อมเซ็นชื่อบนสำเนา ก่อนอัปโหลด",          icon: CreditCard },
  { id: "bank_book",     n: 4, title: "หน้าสมุดบัญชี",                    subtitle: "หน้าที่มีเลขที่บัญชีและชื่อบัญชี · ต้องผูกพร้อมเพย์กับเลขบัตร ปชช.", icon: BookOpen },
];

// A step is "done" enough to unlock the next when the user has taken the
// concrete on-page action for it — regardless of staff review status,
// which is a separate signal (StatusChip) shown alongside.
function isProfileStepDone(p: Profile | undefined) {
  if (!p) return false;
  return (
    !!p.student_id &&
    p.national_id.replace(/-/g, "").length === 13 &&
    !!p.account_name && !!p.account_no && !!p.bank_name &&
    !!p.signature_svg
  );
}
function findDoc(docs: Doc[] | undefined, kind: DocKind): Doc | undefined {
  return (docs ?? []).find(d => d.kind === kind);
}

export default function ProfilePage() {
  const { data } = useSWR<Profile>(
    "/me/profile",
    (p: string) => api.get<Profile>(p).catch(() => emptyProfile),
  );
  const { data: docs } = useSWR<Doc[]>("/me/documents");
  const [form, setForm] = useState<Profile>(emptyProfile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["profile"]));

  useEffect(() => { if (data) setForm(data); }, [data]);

  const doneMap = useMemo(() => ({
    profile:       isProfileStepDone(data ?? undefined),
    creditor_form: !!findDoc(docs, "creditor_form"),
    national_id:   !!findDoc(docs, "national_id"),
    bank_book:     !!findDoc(docs, "bank_book"),
  }), [data, docs]);

  const doneCount = Object.values(doneMap).filter(Boolean).length;
  const total = STEP_META.length;
  const allDone = doneCount === total;

  return (
    <div>
      <PageHeader
        title="เอกสารสำหรับการเบิกจ่าย"
        description="กรอกข้อมูลบัญชี ลายเซ็น และอัปโหลดเอกสารประกอบให้ครบตามลำดับ"
        actions={data?.status ? <StatusChip status={data.status} /> : undefined}
      />

      {data?.status === "rejected" && (
        <div className="mb-4">
          <Alert
            status="danger"
            icon={<AlertTriangle size={18} />}
            title="ไม่ผ่านการตรวจสอบ กรุณาแก้ไขและส่งใหม่"
            description={`เหตุผล: ${data.reject_reason ?? "-"}`}
          />
        </div>
      )}

      {/* Progress summary */}
      <Panel className="mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-sm font-semibold text-foreground">
                ขั้นตอนการเริ่มต้นสำหรับ TA
              </div>
              <div className="text-sm tabular text-muted">
                {doneCount}/{total}
              </div>
            </div>
            <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${(doneCount / total) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted">
              {allDone
                ? "ครบทุกขั้นตอนแล้ว รอเจ้าหน้าที่ตรวจสอบและอนุมัติ"
                : "ทำแต่ละขั้นตอนตามลำดับ — เมื่อครบทั้งหมด เจ้าหน้าที่จะตรวจสอบและอนุมัติภายในภายหลัง"}
            </div>
          </div>
        </div>
      </Panel>

      <Accordion
        allowsMultipleExpanded={false}
        expandedKeys={expanded}
        onExpandedChange={(keys) => setExpanded(new Set(Array.from(keys, String)))}
        variant="surface"
        className="mb-4"
      >
        {STEP_META.map(step => (
          <Accordion.Item key={step.id} id={step.id}>
            <Accordion.Heading>
              <Accordion.Trigger className="hover:bg-surface-secondary">
                <StepHead
                  n={step.n}
                  title={step.title}
                  subtitle={step.subtitle}
                  done={doneMap[step.id as keyof typeof doneMap]}
                  isNext={!doneMap[step.id as keyof typeof doneMap] && Object.entries(doneMap).every(
                    ([k, v]) => (STEP_META.find(s => s.id === k)!.n < step.n ? v : true)
                  )}
                />
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="pb-4">
                {step.id === "profile" ? (
                  <ProfileStep
                    form={form}
                    setForm={setForm}
                    saved={data?.status && data.status !== "pending"}
                    onSaved={() => {
                      // Auto-advance to the next step after a successful save.
                      setExpanded(new Set(["creditor_form"]));
                    }}
                  />
                ) : (
                  <DocStep
                    kind={step.id as DocKind}
                    doc={findDoc(docs, step.id as DocKind)}
                    onUploaded={() => {
                      const next = STEP_META.find(s => s.n === step.n + 1)?.id;
                      if (next) setExpanded(new Set([next]));
                    }}
                    profileReady={doneMap.profile}
                  />
                )}
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      {allDone && data?.status !== "approved" && (
        <Alert
          status="success"
          icon={<CheckCircle2 size={18} />}
          title="ส่งเอกสารครบแล้ว รอเจ้าหน้าที่ตรวจสอบ"
          description="ระบบจะปลดล็อกเมนูอื่น ๆ ให้อัตโนมัติเมื่อเจ้าหน้าที่กด “อนุมัติ”"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step header                                                                */
/* -------------------------------------------------------------------------- */

function StepHead({
  n, title, subtitle, done, isNext,
}: { n: number; title: string; subtitle: string; done: boolean; isNext: boolean }) {
  return (
    <div className="flex items-center gap-3 flex-1 text-start">
      <div
        className={
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm " +
          (done
            ? "bg-emerald-100 text-emerald-700"
            : isNext
              ? "bg-accent-soft text-accent-soft-foreground ring-2 ring-accent"
              : "bg-slate-100 text-slate-500")
        }
      >
        {done ? <CheckCircle2 size={18} /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm text-foreground">{title}</div>
          {done && <Chip tone="success">เสร็จแล้ว</Chip>}
          {isNext && !done && <Chip tone="brand">ถัดไป</Chip>}
        </div>
        <div className="text-xs text-muted mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1: profile + bank + signature                                         */
/* -------------------------------------------------------------------------- */

function ProfileStep({
  form, setForm, saved, onSaved,
}: {
  form: Profile;
  setForm: (p: Profile) => void;
  saved: string | boolean | undefined;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null); setSaving(true);
    try {
      await api.put("/me/profile", form);
      setMsg("บันทึกเรียบร้อย");
      await mutate("/me/profile");
      onSaved();
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-3">
        <FieldGroup label="รหัสนักศึกษา">
          <TextInput value={form.student_id}
            onChange={e => setForm({ ...form, student_id: e.target.value })}
            placeholder="เช่น 653020123-4" />
        </FieldGroup>
        <FieldGroup label="เลขบัตรประชาชน (13 หลัก)">
          <TextInput value={form.national_id}
            onChange={e => setForm({ ...form, national_id: e.target.value })} />
        </FieldGroup>
        <FieldGroup label="ชื่อบัญชี">
          <TextInput value={form.account_name}
            onChange={e => setForm({ ...form, account_name: e.target.value })} />
        </FieldGroup>
        <FieldGroup label="ธนาคาร">
          <TextInput value={form.bank_name}
            onChange={e => setForm({ ...form, bank_name: e.target.value })} />
        </FieldGroup>
        <FieldGroup label="สาขา">
          <TextInput value={form.bank_branch}
            onChange={e => setForm({ ...form, bank_branch: e.target.value })} />
        </FieldGroup>
        <FieldGroup label="รหัสสาขา">
          <TextInput value={form.branch_code}
            onChange={e => setForm({ ...form, branch_code: e.target.value })} />
        </FieldGroup>
        <FieldGroup label="เลขที่บัญชี">
          <TextInput value={form.account_no}
            onChange={e => setForm({ ...form, account_no: e.target.value })} />
        </FieldGroup>
      </div>

      <div className="mt-4">
        <Alert
          status="warning"
          icon={<Wallet size={16} />}
          title="บัญชีที่แนบต้องผูกพร้อมเพย์กับเลขบัตรประชาชน 13 หลักที่กรอก"
        />
      </div>

      <div className="mt-5">
        <FieldGroup label="ลายเซ็น">
          <Signature
            value={form.signature_svg}
            onChange={(svg, png) => setForm({ ...form, signature_svg: svg, signature_png_b64: png })}
          />
        </FieldGroup>
      </div>

      <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-[var(--hairline)]">
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? "กำลังบันทึก…" : "บันทึกและทำขั้นตอนถัดไป"}
        </Button>
        {saved && (
          <a href="/api/v1/me/creditor-form.docx">
            <Button variant="secondary"><Download size={14} /> ดาวน์โหลดแบบแจ้งเจ้าหนี้ (.docx)</Button>
          </a>
        )}
        {msg && <div className="text-sm text-muted ml-auto">{msg}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps 2–4: document uploaders                                              */
/* -------------------------------------------------------------------------- */

function DocStep({
  kind, doc, onUploaded, profileReady,
}: { kind: DocKind; doc: Doc | undefined; onUploaded: () => void; profileReady: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setMsg(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      await api.upload("/me/documents", fd);
      setFile(null);
      setMsg("อัปโหลดเรียบร้อย");
      await mutate("/me/documents");
      onUploaded();
    } catch (e) {
      setMsg((e as Error).message);
    }
    finally { setUploading(false); }
  }

  return (
    <div>
      {kind === "creditor_form" && !profileReady && (
        <div className="mb-3">
          <Alert
            status="warning"
            icon={<AlertTriangle size={16} />}
            title="กรอกข้อมูลในขั้นตอนที่ 1 ให้ครบก่อน"
            description="ระบบจะสร้าง PDF ให้อัตโนมัติจากข้อมูลที่บันทึกไว้"
          />
        </div>
      )}

      {kind === "creditor_form" && profileReady && (
        <div className="mb-3">
          <a href="/api/v1/me/creditor-form.docx">
            <Button variant="secondary">
              <Download size={14} /> ดาวน์โหลด PDF ที่กรอกล่วงหน้าให้แล้ว
            </Button>
          </a>
          <div className="text-xs text-muted mt-1.5">
            เปิดไฟล์ → เซ็นชื่อ → สแกน/ถ่ายรูป → อัปโหลดกลับด้านล่าง
          </div>
        </div>
      )}

      {doc ? (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--hairline)] mb-3 bg-surface-secondary">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{doc.filename}</div>
            {doc.reject_reason && (
              <div className="text-xs text-danger mt-0.5">เหตุผล: {doc.reject_reason}</div>
            )}
          </div>
          <StatusChip status={doc.status} />
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 text-sm text-muted">
          <Circle size={14} /> ยังไม่ได้อัปโหลด
        </div>
      )}

      <SampleToggle kind={kind} className="mb-3" />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <FieldGroup label={doc ? "อัปโหลดใหม่ (จะแทนที่ไฟล์เดิม)" : "เลือกไฟล์"}>
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--ink-2)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-soft)] file:text-[var(--brand)] hover:file:brightness-95"
          />
        </FieldGroup>
        <Button variant="primary" onClick={upload} disabled={!file || uploading}>
          <Upload size={14} /> {uploading ? "กำลังอัปโหลด…" : "อัปโหลด"}
        </Button>
      </div>
      {msg && <div className="text-xs text-muted mt-2">{msg}</div>}
    </div>
  );
}
