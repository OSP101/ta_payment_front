"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Accordion } from "@heroui/react";
import {
  AlertTriangle, Save, Upload, Download, CheckCircle2, Circle, XCircle,
  IdCard, Wallet, FileSignature, CreditCard, BookOpen,
} from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import {
  THAI_BANKS, findBank, normalizeAccountNo, normalizeNationalID, STUDENT_ID_PATTERN,
} from "../../../lib/banks";
import { THAI_PREFIXES, isThaiPrefix } from "../../../lib/prefixes";
import Signature from "../../../components/Signature";
import {
  PageHeader, Panel, Button, TextInput, FieldGroup, StatusChip, Alert, Chip,
  SelectField,
} from "../../../components/ui";
/* -------------------------------------------------------------------------- */
/* Upload constraints — enforced in the browser so users get instant feedback  */
/* and again on the server (see maxDocBytes / kind checks) for real safety.    */
/* -------------------------------------------------------------------------- */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ACCEPT_MIME = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png";

// Returns null if OK, otherwise a Thai reason describing why the file is
// rejected. Matches the server-side kinds/limits so the user never uploads
// something the server will reject anyway.
function validateUploadFile(f: File): string | null {
  if (f.size > MAX_UPLOAD_BYTES) {
    const mb = (f.size / (1024 * 1024)).toFixed(2);
    return `ไฟล์ใหญ่เกิน 2 MB (${mb} MB) — โปรดย่อขนาดก่อนอัปโหลด`;
  }
  // Some browsers omit type for uncommon files; fall back to extension.
  if (f.type && !ACCEPT_MIME.includes(f.type)) {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      return "รองรับเฉพาะไฟล์ PDF, JPG, หรือ PNG เท่านั้น";
    }
  }
  return null;
}

interface Profile {
  student_id: string;
  prefix: string;
  phone: string;
  national_id: string; bank_name: string; bank_branch: string; branch_code: string;
  account_no: string; account_name: string;
  signature_svg: string; signature_png_b64: string;
  status: string; reject_reason?: string;
}
interface Doc { id: string; kind: string; filename: string; status: string; reject_reason?: string; }

const emptyProfile: Profile = {
  student_id: "", prefix: "", phone: "",
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
  { id: "creditor_form", n: 2, title: "แบบแจ้งเจ้าหนี้ (PDF)",           subtitle: "ตรวจฟอร์มที่ระบบกรอกจากข้อมูลขั้นตอนที่ 1 แล้วยืนยัน",       icon: FileSignature },
  { id: "national_id",   n: 3, title: "สำเนาบัตรประชาชน",                subtitle: "รับรอง “สำเนาถูกต้อง” พร้อมเซ็นชื่อบนสำเนา ก่อนอัปโหลด",          icon: CreditCard },
  { id: "bank_book",     n: 4, title: "หน้าสมุดบัญชี",                    subtitle: "หน้าที่มีเลขที่บัญชีและชื่อบัญชี · ต้องผูกพร้อมเพย์กับเลขบัตร ปชช.", icon: BookOpen },
];

// A step is "done" enough to unlock the next when the user has taken the
// concrete on-page action for it — regardless of staff review status,
// which is a separate signal (StatusChip) shown alongside.
function isProfileStepDone(p: Profile | undefined) {
  if (!p) return false;
  return validateProfile(p) === null && !!p.signature_svg;
}

// Thai national-ID checksum (mod-11). The 13th digit is a check digit derived
// from the first 12, so a single-digit typo is caught before submit.
function isValidThaiID(id: string): boolean {
  const d = (id ?? "").replace(/[^0-9]/g, "");
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(d[12]);
}

// Returns null when the profile is submittable, otherwise the reason (Thai).
// Kept as a single function so the Save button and the "step done" indicator
// use identical rules — otherwise we'd have UX drift between the two.
function validateProfile(p: Profile): string | null {
  const sid = (p.student_id ?? "").trim();
  if (!STUDENT_ID_PATTERN.test(sid)) {
    return "รหัสนักศึกษาต้องอยู่ในรูป XXXXXXXXX-X (11 อักษรรวมขีด)";
  }
  if (!isThaiPrefix(p.prefix)) {
    return "โปรดเลือกคำนำหน้าชื่อ (นาย / นาง / นางสาว)";
  }
  const phone = (p.phone ?? "").replace(/[^0-9]/g, "");
  if (phone.length !== 9 && phone.length !== 10) {
    return "เบอร์โทรศัพท์ต้องมี 9-10 หลัก";
  }
  const nid = normalizeNationalID(p.national_id);
  if (nid.length !== 13) {
    return "เลขบัตรประชาชนต้องมี 13 หลัก";
  }
  // Note: `isValidThaiID` (mod-11 check-digit) is used only for the field-level
  // *warning* (see nidChecksumWarn below). It's advisory, not blocking — some
  // legitimate old IDs / test data don't satisfy the check, and staff review
  // the physical card copy anyway.
  const bank = findBank(p.bank_name);
  if (!bank) {
    return "โปรดเลือกธนาคารจากรายการ";
  }
  if (!p.bank_branch.trim()) {
    return "โปรดกรอกสาขาของธนาคาร";
  }
  const branchCode = (p.branch_code ?? "").replace(/[^0-9]/g, "");
  if (branchCode.length !== 4) {
    return "รหัสสาขาต้องเป็นตัวเลข 4 หลัก";
  }
  const acct = normalizeAccountNo(p.account_no);
  if (!bank.accountLen.includes(acct.length)) {
    const expected = bank.accountLen.join(" หรือ ");
    return `เลขที่บัญชี${bank.name} ต้องมี ${expected} หลัก (กรอกมา ${acct.length} หลัก)`;
  }
  if (!p.account_name.trim()) {
    return "โปรดกรอกชื่อบัญชี";
  }
  if (!p.signature_svg) {
    return "โปรดวาดลายเซ็นก่อนบันทึก";
  }
  return null;
}
function findDoc(docs: Doc[] | undefined, kind: DocKind): Doc | undefined {
  return (docs ?? []).find(d => d.kind === kind);
}

/* -------------------------------------------------------------------------- */
/* Input formatters                                                           */
/*                                                                            */
/* Digits-only vs letters-only is enforced onChange so the field can never    */
/* hold a value that would fail validation on submit. Paste, IME, and mobile  */
/* keyboards all funnel through onChange, so a single filter is enough — we   */
/* don't need onKeyDown blocking (which breaks paste and Cmd+A).              */
/* -------------------------------------------------------------------------- */

function onlyDigits(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

// Keep letters (Thai + Latin), spaces, and a few name punctuation marks. No
// digits, no ASCII symbols like @ or #. Thai block is U+0E00-U+0E7F.
function onlyLetters(s: string): string {
  return s.replace(/[^A-Za-z฀-๿\s.'\-]/g, "");
}

// Student ID renders as `XXXXXXXXX-X`. We keep digits only, cap at 10, and
// auto-insert the dash after the 9th digit so the user can type straight
// through without worrying about punctuation.
function formatStudentID(s: string): string {
  const d = onlyDigits(s).slice(0, 10);
  if (d.length <= 9) return d;
  return d.slice(0, 9) + "-" + d.slice(9);
}

// National ID renders as `X-XXXX-XXXXX-XX-X`. Same auto-formatting so users
// can paste `1101800123456` or `1-1018-00123-45-6` and both display cleanly.
function formatNationalID(s: string): string {
  const d = onlyDigits(s).slice(0, 13);
  const parts = [
    d.slice(0, 1),
    d.slice(1, 5),
    d.slice(5, 10),
    d.slice(10, 12),
    d.slice(12, 13),
  ].filter(Boolean);
  return parts.join("-");
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

  // A doc step is "done" only when a file exists AND staff hasn't sent it
  // back for fixes. Otherwise the step is either untouched or needs the TA's
  // attention — we surface those distinctly so a rejected doc doesn't parade
  // as complete alongside its red "ไม่ผ่าน" chip.
  const isDocDone = (d: Doc | undefined) =>
    !!d && d.status !== "rejected" && d.status !== "needs_fix";
  const isDocNeedsFix = (d: Doc | undefined) =>
    !!d && (d.status === "rejected" || d.status === "needs_fix");

  const profileNeedsFix =
    data?.status === "rejected" || data?.status === "needs_fix";

  const doneMap = useMemo(() => ({
    profile:       isProfileStepDone(data ?? undefined) && !profileNeedsFix,
    creditor_form: isDocDone(findDoc(docs, "creditor_form")),
    national_id:   isDocDone(findDoc(docs, "national_id")),
    bank_book:     isDocDone(findDoc(docs, "bank_book")),
  }), [data, docs, profileNeedsFix]);

  const needsFixMap = useMemo(() => ({
    profile:       profileNeedsFix,
    creditor_form: isDocNeedsFix(findDoc(docs, "creditor_form")),
    national_id:   isDocNeedsFix(findDoc(docs, "national_id")),
    bank_book:     isDocNeedsFix(findDoc(docs, "bank_book")),
  }), [docs, profileNeedsFix]);

  const doneCount = Object.values(doneMap).filter(Boolean).length;
  const total = STEP_META.length;
  const allDone = doneCount === total;
  const anyNeedsFix = Object.values(needsFixMap).some(Boolean);

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
            description={`เหตุผล: ${data.reject_reason ?? "-"}\nแก้ไขข้อมูล/อัปโหลดไฟล์ที่ถูกตีกลับ แล้วกด “บันทึกและทำขั้นตอนถัดไป” เพื่อส่งอีกครั้ง — ประวัติการส่งเดิมยังเก็บไว้ให้เจ้าหน้าที่ตรวจสอบย้อนหลังได้`}
          />
        </div>
      )}
      {data?.status === "needs_fix" && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<AlertTriangle size={18} />}
            title="เจ้าหน้าที่ขอให้แก้ไขบางส่วน"
            description={data.reject_reason ?? "โปรดตรวจสอบเอกสารที่ติดสถานะ “ต้องแก้ไข” ด้านล่างและส่งใหม่"}
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
              {anyNeedsFix
                ? "มีบางขั้นตอนถูกตีกลับให้แก้ไข — โปรดตรวจสอบและส่งใหม่"
                : allDone
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
                  needsFix={needsFixMap[step.id as keyof typeof needsFixMap]}
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
                ) : step.id === "creditor_form" ? (
                  <CreditorFormStep
                    doc={findDoc(docs, "creditor_form")}
                    profileReady={doneMap.profile}
                    onDone={() => {
                      const next = STEP_META.find(s => s.n === step.n + 1)?.id;
                      if (next) setExpanded(new Set([next]));
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
                  />
                )}
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      {allDone && !anyNeedsFix && data?.status !== "approved" && (
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
  n, title, subtitle, done, needsFix, isNext,
}: { n: number; title: string; subtitle: string; done: boolean; needsFix: boolean; isNext: boolean }) {
  return (
    <div className="flex items-center gap-3 flex-1 text-start">
      <div
        className={
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm " +
          (needsFix
            ? "bg-rose-100 text-rose-700 ring-2 ring-rose-400"
            : done
              ? "bg-emerald-100 text-emerald-700"
              : isNext
                ? "bg-accent-soft text-accent-soft-foreground ring-2 ring-accent"
                : "bg-slate-100 text-slate-500")
        }
      >
        {needsFix ? <XCircle size={18} /> : done ? <CheckCircle2 size={18} /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm text-foreground">{title}</div>
          {needsFix && <Chip tone="danger">ต้องแก้ไข</Chip>}
          {!needsFix && done && <Chip tone="success">เสร็จแล้ว</Chip>}
          {!needsFix && !done && isNext && <Chip tone="brand">ถัดไป</Chip>}
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const bank = useMemo(() => findBank(form.bank_name), [form.bank_name]);
  const acctDigits = useMemo(() => normalizeAccountNo(form.account_no), [form.account_no]);
  const nidDigits  = useMemo(() => normalizeNationalID(form.national_id), [form.national_id]);
  const phoneDigits = useMemo(() => (form.phone ?? "").replace(/[^0-9]/g, ""), [form.phone]);
  const formErr    = useMemo(() => validateProfile(form), [form]);

  // Field-level errors only surface after the user has interacted with that
  // field — new-form users shouldn't see red before they've typed anything.
  const sidErr =
    touched.student_id && form.student_id && !STUDENT_ID_PATTERN.test(form.student_id.trim())
      ? "รูปแบบต้องเป็น XXXXXXXXX-X (11 อักษรรวมขีด)"
      : undefined;
  const phoneErr =
    touched.phone && phoneDigits.length > 0 && phoneDigits.length !== 9 && phoneDigits.length !== 10
      ? `กรอก ${phoneDigits.length} หลัก (ต้องมี 9-10 หลัก)`
      : undefined;
  // Hard error: length only. The mod-11 mismatch is a soft warning (nidChecksumWarn)
  // shown as amber hint text — it flags likely typos without blocking save.
  const nidErr =
    touched.national_id && nidDigits.length > 0 && nidDigits.length !== 13
      ? `กรอก ${nidDigits.length}/13 หลัก`
      : undefined;
  const nidChecksumWarn =
    touched.national_id && nidDigits.length === 13 && !isValidThaiID(nidDigits)
      ? "หลักตรวจสอบไม่ตรงกับ 12 หลักแรก — โปรดตรวจว่าพิมพ์ถูกทุกหลัก (บันทึกได้ปกติหากยืนยันว่าถูกต้อง)"
      : undefined;
  const branchCodeErr =
    touched.branch_code && form.branch_code.length > 0 && form.branch_code.length !== 4
      ? `กรอก ${form.branch_code.length}/4 หลัก`
      : undefined;
  const acctErr =
    touched.account_no && bank && acctDigits.length > 0 && !bank.accountLen.includes(acctDigits.length)
      ? `${bank.name}ต้องมี ${bank.accountLen.join(" หรือ ")} หลัก (กรอก ${acctDigits.length})`
      : undefined;

  async function save() {
    if (formErr) {
      // Ensure the offending field's error message is visible.
      setTouched({
        student_id: true, phone: true, national_id: true, bank_name: true,
        bank_branch: true, branch_code: true, account_no: true, account_name: true,
      });
      notify.error(formErr);
      return;
    }
    setSaving(true);
    try {
      await api.put("/me/profile", form);
      notify.success("บันทึกข้อมูลเรียบร้อย");
      await mutate("/me/profile");
      onSaved();
    } catch (e) { notify.error(e); }
    finally { setSaving(false); }
  }

  const bankOptions = useMemo(
    () => THAI_BANKS.map(b => ({ id: b.name, label: `${b.name} (${b.short})`, textValue: `${b.name} ${b.short}` })),
    []
  );
  const prefixOptions = useMemo(
    () => THAI_PREFIXES.map(p => ({ id: p, label: p, textValue: p })),
    []
  );

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-3">
        <FieldGroup label="คำนำหน้าชื่อ" hint="ระบบใช้ค่านี้วงกลมในแบบแจ้งเจ้าหนี้อัตโนมัติ">
          <SelectField
            placeholder="— เลือกคำนำหน้า —"
            value={form.prefix}
            onChange={v => setForm({ ...form, prefix: v })}
            options={prefixOptions}
          />
        </FieldGroup>
        <FieldGroup label="รหัสนักศึกษา" hint="รูปแบบ XXXXXXXXX-X (เช่น 653020123-4)" error={sidErr}>
          <TextInput value={form.student_id}
            onChange={e => setForm({ ...form, student_id: formatStudentID(e.target.value) })}
            onBlur={() => setTouched(t => ({ ...t, student_id: true }))}
            inputMode="numeric"
            maxLength={11}
            placeholder="เช่น 653020123-4" />
        </FieldGroup>
        <FieldGroup label="เบอร์โทรศัพท์" hint="9-10 หลัก (ใช้กรอกในแบบแจ้งเจ้าหนี้)" error={phoneErr}>
          <TextInput value={form.phone}
            onChange={e => setForm({ ...form, phone: onlyDigits(e.target.value).slice(0, 10) })}
            onBlur={() => setTouched(t => ({ ...t, phone: true }))}
            inputMode="tel"
            maxLength={10}
            placeholder="เช่น 0812345678" />
        </FieldGroup>
        <FieldGroup
          label="เลขบัตรประชาชน (13 หลัก)"
          hint={
            nidChecksumWarn
              ? <span className="text-warning">{nidChecksumWarn}</span>
              : nidDigits.length > 0 && !nidErr
                ? `กรอกครบ ${nidDigits.length}/13`
                : undefined
          }
          error={nidErr}
        >
          <TextInput value={form.national_id}
            onChange={e => setForm({ ...form, national_id: formatNationalID(e.target.value) })}
            onBlur={() => setTouched(t => ({ ...t, national_id: true }))}
            inputMode="numeric"
            maxLength={17}
            placeholder="X-XXXX-XXXXX-XX-X" />
        </FieldGroup>
        <FieldGroup label="ชื่อบัญชี" hint="ตัวอักษรและช่องว่างเท่านั้น (ห้ามใส่ตัวเลข)">
          <TextInput value={form.account_name}
            onChange={e => setForm({ ...form, account_name: onlyLetters(e.target.value) })}
            onBlur={() => setTouched(t => ({ ...t, account_name: true }))}
            placeholder="เช่น นายสมชาย ใจดี" />
        </FieldGroup>
        <FieldGroup
          label="ธนาคาร"
          hint={bank ? `เลขที่บัญชีของ${bank.name}ต้องมี ${bank.accountLen.join(" หรือ ")} หลัก` : "เลือกจากรายการ เพื่อให้ระบบตรวจสอบความยาวเลขที่บัญชีให้อัตโนมัติ"}
        >
          <SelectField
            placeholder="— เลือกธนาคาร —"
            value={form.bank_name}
            onChange={v => setForm({ ...form, bank_name: v })}
            options={bankOptions}
          />
        </FieldGroup>
        <FieldGroup label="สาขา">
          <TextInput value={form.bank_branch}
            onChange={e => setForm({ ...form, bank_branch: e.target.value })}
            placeholder="เช่น ขอนแก่น" />
        </FieldGroup>
        <FieldGroup label="รหัสสาขา" hint="ตัวเลข 4 หลัก" error={branchCodeErr}>
          <TextInput value={form.branch_code}
            onChange={e => setForm({ ...form, branch_code: onlyDigits(e.target.value).slice(0, 4) })}
            onBlur={() => setTouched(t => ({ ...t, branch_code: true }))}
            inputMode="numeric"
            maxLength={4}
            placeholder="เช่น 0555" />
        </FieldGroup>
        <FieldGroup
          label="เลขที่บัญชี"
          hint={bank
            ? (acctDigits.length && !acctErr
                ? `กรอกครบ ${acctDigits.length}/${Math.max(...bank.accountLen)}`
                : `${bank.accountLen.join(" หรือ ")} หลัก (ไม่ต้องใส่ขีด)`)
            : "โปรดเลือกธนาคารก่อน"}
          error={acctErr}
        >
          <TextInput value={form.account_no}
            onChange={e => setForm({ ...form, account_no: onlyDigits(e.target.value) })}
            onBlur={() => setTouched(t => ({ ...t, account_no: true }))}
            inputMode="numeric"
            maxLength={bank ? Math.max(...bank.accountLen) : 16}
            placeholder="เฉพาะตัวเลข" />
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

      {/* Inline error summary — pinned right above the save button so users
          don't need to hunt for a top-right toast when a field is missing.
          Only shown after the user has interacted with at least one field. */}
      {formErr && Object.values(touched).some(Boolean) && (
        <div className="mt-4">
          <Alert
            status="danger"
            icon={<AlertTriangle size={16} />}
            title="กรอกข้อมูลไม่ครบถ้วน"
            description={formErr}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-[var(--hairline)]">
        <Button variant="primary" onClick={save} disabled={saving} isPending={saving}>
          <Save size={14} /> {saving ? "กำลังบันทึก…" : "บันทึกและทำขั้นตอนถัดไป"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2: creditor form — PDF overlay preview + confirm-attach + fallback    */
/*                                                                            */
/* The server stamps the TA's step-1 data onto the official PDF template and  */
/* streams the result inline. On "ยืนยัน" the server generates it again and   */
/* attaches it as the creditor_form document (superseding any prior one), so  */
/* review flows through the normal pipeline. If the overlay looks wrong the   */
/* TA can download a blank form, fill by hand, and upload manually below.     */
/* -------------------------------------------------------------------------- */

function CreditorFormStep({
  doc, profileReady, onDone,
}: { doc: Doc | undefined; profileReady: boolean; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  // Bump the nonce to force the iframe to re-fetch (browsers cache PDF blobs
  // aggressively — even with Cache-Control: no-store the embedded viewer will
  // hold onto the last render otherwise).
  const [nonce, setNonce] = useState(() => Date.now());

  async function confirm() {
    setConfirming(true);
    try {
      await api.post("/me/creditor-form/confirm", {});
      notify.success("บันทึกเอกสารที่ระบบสร้างเรียบร้อย");
      await mutate("/me/documents");
      onDone();
    } catch (e) {
      notify.error(e);
    } finally {
      setConfirming(false);
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    const err = validateUploadFile(f);
    if (err) {
      // Clear the native input so the rejected filename doesn't linger and
      // re-selecting the same file still re-fires onChange.
      setFile(null); e.target.value = ""; notify.error(err); return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kind", "creditor_form");
      fd.append("file", file);
      await api.upload("/me/documents", fd);
      setFile(null);
      notify.success("อัปโหลดเรียบร้อย");
      await mutate("/me/documents");
      onDone();
    } catch (e) {
      notify.error(e);
    } finally {
      setUploading(false);
    }
  }

  if (!profileReady) {
    return (
      <Alert
        status="warning"
        icon={<AlertTriangle size={16} />}
        title="กรอกข้อมูลในขั้นตอนที่ 1 ให้ครบก่อน"
        description="ระบบจะสร้างฟอร์มให้อัตโนมัติจากข้อมูลที่บันทึกไว้"
      />
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm text-muted flex-1">
            ตรวจดูฟอร์มที่ระบบกรอกให้ล่วงหน้าด้านล่าง — หากถูกต้อง กด{" "}
            <span className="font-medium">“ยืนยันและบันทึกเอกสารนี้”</span>
          </div>
          <button
            type="button"
            onClick={() => { setShowGrid(g => !g); setNonce(Date.now()); }}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {showGrid ? "ซ่อนตาราง" : "ตาราง (debug)"}
          </button>
          <button
            type="button"
            onClick={() => setNonce(Date.now())}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            รีเฟรช
          </button>
        </div>
        <div className="border border-[var(--hairline)] rounded-md overflow-hidden bg-slate-100">
          <iframe
            src={`/api/v1/me/creditor-form.pdf?v=${nonce}${showGrid ? "&grid=1" : ""}`}
            title="แบบแจ้งข้อมูลเจ้าหนี้บุคลากร (ล่วงหน้า)"
            className="w-full h-[720px] block"
          />
        </div>
      </div>

      {doc && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--hairline)] mb-3 bg-surface-secondary">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{doc.filename}</div>
            {doc.reject_reason && (
              <div className="text-xs text-danger mt-0.5">เหตุผล: {doc.reject_reason}</div>
            )}
          </div>
          <StatusChip status={doc.status} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="primary" onClick={confirm} disabled={confirming}>
          <CheckCircle2 size={14} /> {confirming ? "กำลังบันทึก…" : "ยืนยันและบันทึกเอกสารนี้"}
        </Button>
        <a href="/api/v1/creditor-form/blank.pdf" target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">
            <Download size={14} /> ดาวน์โหลดฟอร์มเปล่า
          </Button>
        </a>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
        <div className="text-xs text-muted mb-2">
          หากระบบกรอกไม่ตรง คุณกรอกลงในฟอร์มเปล่าเอง แล้วสแกน/ถ่ายรูปมาแนบที่นี่แทนได้
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <FieldGroup
            label={doc ? "อัปโหลดใหม่ (จะแทนที่ไฟล์เดิม)" : "เลือกไฟล์ที่กรอกเอง"}
            hint="รับเฉพาะ PDF / JPG / PNG · ขนาดไม่เกิน 2 MB"
          >
            <input
              type="file" accept={ACCEPT_ATTR}
              onChange={pickFile}
              className="block w-full text-sm text-[var(--ink-2)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-soft)] file:text-[var(--brand)] hover:file:brightness-95"
            />
          </FieldGroup>
          <Button variant="secondary" onClick={upload} disabled={!file || uploading} isPending={uploading}>
            <Upload size={14} /> {uploading ? "กำลังอัปโหลด…" : "อัปโหลดไฟล์ที่กรอกเอง"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps 3–4: document uploaders                                              */
/* -------------------------------------------------------------------------- */

function DocStep({
  kind, doc, onUploaded,
}: { kind: DocKind; doc: Doc | undefined; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    const err = validateUploadFile(f);
    if (err) {
      // Clear the native input so the rejected filename doesn't linger and
      // re-selecting the same file still re-fires onChange.
      setFile(null); e.target.value = ""; notify.error(err); return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      await api.upload("/me/documents", fd);
      setFile(null);
      notify.success("อัปโหลดเรียบร้อย");
      await mutate("/me/documents");
      onUploaded();
    } catch (e) {
      notify.error(e);
    }
    finally { setUploading(false); }
  }

  return (
    <div>
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

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <FieldGroup
          label={doc ? "อัปโหลดใหม่ (จะแทนที่ไฟล์เดิม)" : "เลือกไฟล์"}
          hint="รับเฉพาะ PDF / JPG / PNG · ขนาดไม่เกิน 2 MB"
        >
          <input
            type="file" accept={ACCEPT_ATTR}
            onChange={pickFile}
            className="block w-full text-sm text-[var(--ink-2)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-soft)] file:text-[var(--brand)] hover:file:brightness-95"
          />
        </FieldGroup>
        <Button variant="primary" onClick={upload} disabled={!file || uploading} isPending={uploading}>
          <Upload size={14} /> {uploading ? "กำลังอัปโหลด…" : "อัปโหลด"}
        </Button>
      </div>
    </div>
  );
}
