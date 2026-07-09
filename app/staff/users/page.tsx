"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  FieldError as HFieldError,
  Input as HInput,
  Label as HLabel,
  TextField as HTextField,
} from "@heroui/react";
import { Copy, KeyRound, Pencil, Plus, UserX } from "lucide-react";
import { api } from "../../lib/api";
import {
  Alert, Button, Chip, FieldGroup, Modal,
  PageHeader, Panel, Select,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

interface User {
  id: string;
  email: string;
  title?: string | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  study_level?: string | null;
  roles: string[];
  is_active: boolean;
  bank_name?: string | null;
  bank_branch?: string | null;
  branch_code?: string | null;
  account_no?: string | null;
}

const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "อาจารย์", "อ. ดร.", "ดร. ผศ.", "ดร. รศ.", "ดร. ศ."];
const STUDY_LEVELS: { value: string; label: string }[] = [
  { value: "undergrad", label: "ปริญญาตรี" },
  { value: "master", label: "ปริญญาโท" },
  { value: "phd", label: "ปริญญาเอก" },
];
const ROLE_OPTIONS = ["staff", "lecturer", "ta"] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้บริหาร",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
};

function primaryRole(roles: string[]): string {
  if (roles.includes("ta")) return "ta";
  if (roles.includes("lecturer")) return "lecturer";
  if (roles.includes("staff")) return "staff";
  return roles[0] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function vRequired(v: string, msg = "กรุณากรอกข้อมูล"): string | null {
  return v.trim() === "" ? msg : null;
}
function vEmail(v: string): string | null {
  if (!v.trim()) return "กรุณากรอกอีเมล";
  if (!EMAIL_RE.test(v.trim())) return "รูปแบบอีเมลไม่ถูกต้อง";
  return null;
}
function vName(v: string, label: string): string | null {
  if (!v.trim()) return `กรุณากรอก${label}`;
  if (v.trim().length > 100) return `${label}ยาวเกินไป`;
  return null;
}
function vPhone(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9\-+ ()]{6,20}$/.test(s)) return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 12) return "เบอร์โทรควรมี 9–12 หลัก";
  return null;
}
function vAccountNo(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9\- ]{6,25}$/.test(s)) return "เลขที่บัญชีต้องเป็นตัวเลข";
  return null;
}
function vBranchCode(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9]{3,6}$/.test(s)) return "รหัสสาขาต้องเป็นตัวเลข 3–6 หลัก";
  return null;
}
function vSelect(v: string, allowed: readonly string[]): string | null {
  return allowed.includes(v) ? null : "กรุณาเลือกจากรายการ";
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** HeroUI validated text field. Errors shown only when `show` is true. */
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
    <HTextField
      value={value}
      onChange={onChange}
      isInvalid={invalid}
      isRequired={required}
      autoFocus={autoFocus}
    >
      <HLabel>{label}</HLabel>
      <HInput type={type} placeholder={placeholder} />
      {invalid && <HFieldError>{error}</HFieldError>}
    </HTextField>
  );
}

/** Native <select> wrapped in a field group with visible error text. */
function VSelect({
  label, value, onChange, error, show, children,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  show: boolean;
  children: React.ReactNode;
}) {
  const invalid = show && !!error;
  return (
    <FieldGroup label={label} error={invalid ? error : undefined}>
      <Select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
      >
        {children}
      </Select>
    </FieldGroup>
  );
}

/* -------------------------------------------------------------------------- */

export default function UsersPage() {
  const { data } = useSWR<{ items: User[]; total: number }>("/users?limit=500");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);

  const columns: DataColumn<User>[] = [
    {
      id: "name", label: "ชื่อ", sortable: true, isRowHeader: true,
      sortValue: u => `${u.first_name} ${u.last_name}`,
      className: "font-medium",
      render: u => [u.title, u.first_name, u.last_name].filter(Boolean).join(" "),
    },
    {
      id: "email", label: "อีเมล", sortable: true,
      sortValue: u => u.email,
      className: "text-(--ink-3)",
      render: u => u.email,
    },
    {
      id: "roles", label: "บทบาท",
      render: u => (
        <div className="flex gap-1 flex-wrap">
          {u.roles.map(r => <Chip key={r} tone="neutral">{ROLE_LABEL[r] ?? r}</Chip>)}
        </div>
      ),
    },
    {
      id: "level", label: "ระดับ",
      className: "text-(--ink-3)",
      render: u => u.study_level
        ? (STUDY_LEVELS.find(l => l.value === u.study_level)?.label ?? u.study_level)
        : "-",
    },
    {
      id: "status", label: "สถานะ",
      render: u => u.is_active
        ? <Chip tone="success">ใช้งาน</Chip>
        : <Chip tone="danger">ปิด</Chip>,
    },
    {
      id: "actions", label: <span className="sr-only">การจัดการ</span>,
      className: "text-right",
      render: u => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
            <Pencil size={14} /> แก้ไข
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
            <KeyRound size={14} /> รีเซ็ตรหัส
          </Button>
          {u.is_active && (
            <Button variant="danger-soft" size="sm" onClick={() => setDeactivating(u)}>
              <UserX size={14} /> ปิด
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="จัดการผู้ใช้"
        description={data?.total ? `ทั้งหมด ${data.total} รายชื่อ` : "ผู้ใช้ทั้งหมดในระบบ"}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> สร้างผู้ใช้
          </Button>
        }
      />

      <Panel padded={false}>
        <div className="p-4">
          <DataTable
            ariaLabel="ผู้ใช้ทั้งหมดในระบบ"
            rows={data?.items}
            loading={!data}
            rowKey={u => u.id}
            searchFn={u => `${u.title ?? ""} ${u.first_name} ${u.last_name} ${u.email}`}
            searchPlaceholder="ค้นหาชื่อ / อีเมล…"
            filters={[
              {
                id: "role",
                placeholder: "ทุกบทบาท",
                options: [
                  { id: "", label: "ทุกบทบาท" },
                  { id: "admin", label: "Admin / ผู้บริหาร" },
                  { id: "staff", label: "เจ้าหน้าที่" },
                  { id: "lecturer", label: "อาจารย์" },
                  { id: "ta", label: "ผู้ช่วยสอน (TA)" },
                ],
                predicate: (u, v) => u.roles.includes(v),
              },
              {
                id: "active",
                placeholder: "ทุกสถานะ",
                options: [
                  { id: "", label: "ทุกสถานะ" },
                  { id: "active", label: "ใช้งาน" },
                  { id: "inactive", label: "ปิดใช้งาน" },
                ],
                predicate: (u, v) => (v === "active" ? u.is_active : !u.is_active),
              },
            ]}
            initialSort={{ column: "name", direction: "ascending" }}
            pageSize={15}
            emptyTitle="ไม่พบผู้ใช้"
            emptyDescription="ลองปรับเงื่อนไขการค้นหา"
            columns={columns}
          />
        </div>
      </Panel>

      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {deactivating && <DeactivateModal user={deactivating} onClose={() => setDeactivating(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    email: "", title: "นาย", first_name: "", last_name: "",
    role: "ta", study_level: "undergrad",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ email: "", title: "นาย", first_name: "", last_name: "", role: "ta", study_level: "undergrad" });
      setErr(null); setTempPassword(null); setShowErrors(false);
    }
  }, [open]);

  const errors = useMemo(() => ({
    email: vEmail(form.email),
    title: vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(form.first_name, "ชื่อ"),
    last_name: vName(form.last_name, "นามสกุล"),
    role: vSelect(form.role, ROLE_OPTIONS),
    study_level: form.role === "ta" ? vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)) : null,
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      const body = {
        email: form.email.trim(),
        title: form.title,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        roles: [form.role],
        study_level: form.role === "ta" ? form.study_level : undefined,
      };
      const res = await api.post<{ user: User; temp_password: string }>("/users", body);
      mutate((k: string) => k.startsWith("/users"));
      setTempPassword(res.temp_password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tempPassword ? "สร้างผู้ใช้สำเร็จ" : "สร้างผู้ใช้ใหม่"}
      size="lg"
      footer={
        tempPassword
          ? <Button variant="primary" onClick={onClose}>ปิด</Button>
          : <>
              <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
              <Button variant="primary" onClick={submit}
                disabled={pending || (showErrors && hasErrors)}>บันทึก</Button>
            </>
      }
    >
      {tempPassword ? (
        <TempPasswordPanel email={form.email} password={tempPassword} />
      ) : (
        <div className="space-y-3">
          <VField
            label="อีเมล" required type="email" placeholder="you@kkumail.com"
            value={form.email} onChange={v => setForm({ ...form, email: v })}
            error={errors.email} show={showErrors}
          />
          <div className="grid grid-cols-[140px_1fr_1fr] gap-3">
            <VSelect label="คำนำหน้า" value={form.title}
              onChange={v => setForm({ ...form, title: v })}
              error={errors.title} show={showErrors}
            >
              {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </VSelect>
            <VField label="ชื่อ" required value={form.first_name}
              onChange={v => setForm({ ...form, first_name: v })}
              error={errors.first_name} show={showErrors}
            />
            <VField label="นามสกุล" required value={form.last_name}
              onChange={v => setForm({ ...form, last_name: v })}
              error={errors.last_name} show={showErrors}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VSelect label="สิทธิ์การใช้งาน" value={form.role}
              onChange={v => setForm({ ...form, role: v })}
              error={errors.role} show={showErrors}
            >
              <option value="staff">เจ้าหน้าที่</option>
              <option value="lecturer">อาจารย์</option>
              <option value="ta">ผู้ช่วยสอน (TA)</option>
            </VSelect>
            {form.role === "ta" && (
              <VSelect label="ระดับการศึกษา" value={form.study_level}
                onChange={v => setForm({ ...form, study_level: v })}
                error={errors.study_level} show={showErrors}
              >
                {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </VSelect>
            )}
          </div>
          {err && <Alert status="danger" title="ไม่สามารถสร้างผู้ใช้ได้" description={err} />}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [form, setForm] = useState({
    email: user.email,
    title: user.title ?? "",
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone ?? "",
    role: primaryRole(user.roles),
    study_level: user.study_level ?? "undergrad",
    bank_name: user.bank_name ?? "",
    bank_branch: user.bank_branch ?? "",
    branch_code: user.branch_code ?? "",
    account_no: user.account_no ?? "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const errors = useMemo(() => ({
    email: vEmail(form.email),
    title: form.title === "" ? null : vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(form.first_name, "ชื่อ"),
    last_name: vName(form.last_name, "นามสกุล"),
    role: vSelect(form.role, ROLE_OPTIONS),
    study_level: form.role === "ta" ? vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)) : null,
    phone: vPhone(form.phone),
    account_no: vAccountNo(form.account_no),
    branch_code: vBranchCode(form.branch_code),
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      await api.patch(`/users/${user.id}`, {
        email: form.email.trim(),
        title: form.title,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        roles: [form.role],
        study_level: form.role === "ta" ? form.study_level : "",
        bank_name: form.bank_name.trim(),
        bank_branch: form.bank_branch.trim(),
        branch_code: form.branch_code.trim(),
        account_no: form.account_no.trim(),
      });
      mutate((k: string) => k.startsWith("/users"));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขข้อมูลผู้ใช้"
      size="xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={submit}
          disabled={pending || (showErrors && hasErrors)}>บันทึกการแก้ไข</Button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted mb-2">ข้อมูลทั่วไป</div>
          <div className="space-y-3">
            <VField label="อีเมล" required type="email"
              value={form.email} onChange={v => setForm({ ...form, email: v })}
              error={errors.email} show={showErrors}
            />
            <div className="grid grid-cols-[140px_1fr_1fr] gap-3">
              <VSelect label="คำนำหน้า" value={form.title}
                onChange={v => setForm({ ...form, title: v })}
                error={errors.title} show={showErrors}
              >
                <option value="">-</option>
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </VSelect>
              <VField label="ชื่อ" required value={form.first_name}
                onChange={v => setForm({ ...form, first_name: v })}
                error={errors.first_name} show={showErrors}
              />
              <VField label="นามสกุล" required value={form.last_name}
                onChange={v => setForm({ ...form, last_name: v })}
                error={errors.last_name} show={showErrors}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <VSelect label="สิทธิ์การใช้งาน" value={form.role}
                onChange={v => setForm({ ...form, role: v })}
                error={errors.role} show={showErrors}
              >
                <option value="staff">เจ้าหน้าที่</option>
                <option value="lecturer">อาจารย์</option>
                <option value="ta">ผู้ช่วยสอน (TA)</option>
              </VSelect>
              {form.role === "ta" && (
                <VSelect label="ระดับการศึกษา" value={form.study_level}
                  onChange={v => setForm({ ...form, study_level: v })}
                  error={errors.study_level} show={showErrors}
                >
                  {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </VSelect>
              )}
              <VField label="เบอร์โทร" placeholder="0812345678"
                value={form.phone} onChange={v => setForm({ ...form, phone: v })}
                error={errors.phone} show={showErrors}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted mb-2">ข้อมูลบัญชีธนาคาร</div>
          <div className="grid grid-cols-2 gap-3">
            <VField label="ธนาคาร" value={form.bank_name}
              onChange={v => setForm({ ...form, bank_name: v })}
              error={null} show={showErrors}
            />
            <VField label="เลขที่บัญชี" value={form.account_no}
              onChange={v => setForm({ ...form, account_no: v })}
              error={errors.account_no} show={showErrors}
            />
            <VField label="รหัสสาขา" value={form.branch_code}
              onChange={v => setForm({ ...form, branch_code: v })}
              error={errors.branch_code} show={showErrors}
            />
            <VField label="ชื่อสาขา" value={form.bank_branch}
              onChange={v => setForm({ ...form, bank_branch: v })}
              error={null} show={showErrors}
            />
          </div>
        </div>

        {err && <Alert status="danger" title="บันทึกไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState<string | null>(null);

  async function submit() {
    setPending(true); setErr(null);
    try {
      const res = await api.post<{ temp_password: string }>(`/users/${user.id}/reset-password`);
      setPw(res.temp_password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pw ? "รีเซ็ตรหัสผ่านสำเร็จ" : "ยืนยันการรีเซ็ตรหัสผ่าน"}
      size="md"
      footer={pw
        ? <Button variant="primary" onClick={onClose}>ปิด</Button>
        : <>
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button variant="primary" onClick={submit} disabled={pending}>รีเซ็ตรหัสผ่าน</Button>
          </>}
    >
      {pw ? (
        <TempPasswordPanel email={user.email} password={pw} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            ระบบจะสร้างรหัสผ่านชั่วคราวใหม่ให้กับ
            <span className="font-medium"> {user.first_name} {user.last_name} </span>
            ({user.email}) และจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งถัดไป
          </p>
          {err && <Alert status="danger" title="รีเซ็ตไม่สำเร็จ" description={err} />}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function DeactivateModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showError, setShowError] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailError = useMemo<string | null>(() => {
    if (!confirmEmail.trim()) return "กรุณากรอกอีเมลเพื่อยืนยัน";
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase())
      return "อีเมลไม่ตรงกับบัญชีที่จะปิดใช้งาน";
    return null;
  }, [confirmEmail, user.email]);

  async function submit() {
    setShowError(true);
    if (emailError) return;
    setPending(true); setErr(null);
    try {
      await api.post(`/users/${user.id}/deactivate`, { confirm_email: confirmEmail });
      mutate((k: string) => k.startsWith("/users"));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ปิดการใช้งานบัญชี"
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="danger" onClick={submit} disabled={pending || !!emailError}>
          ยืนยันการปิดใช้งาน
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          บัญชีของ <span className="font-medium">{user.first_name} {user.last_name}</span> จะไม่สามารถเข้าใช้งานระบบได้อีก
          กรุณากรอกอีเมลของผู้ใช้งานเพื่อยืนยัน
        </p>
        <VField
          label={<>พิมพ์ <code className="text-xs">{user.email}</code> เพื่อยืนยัน</>}
          required autoFocus placeholder={user.email}
          value={confirmEmail}
          onChange={v => { setConfirmEmail(v); setShowError(true); }}
          error={emailError} show={showError}
        />
        {err && <Alert status="danger" title="ปิดใช้งานไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

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
        description="โปรดคัดลอกและส่งให้ผู้ใช้งาน ระบบจะบังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งแรก รหัสนี้จะไม่แสดงอีกครั้ง"
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
