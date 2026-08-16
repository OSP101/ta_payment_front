"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  FieldError as HFieldError,
  Input as HInput,
  Label as HLabel,
  TextField as HTextField,
  type SortDescriptor,
} from "@heroui/react";
import { Check, Copy, KeyRound, LockOpen, Pencil, Plus, ShieldAlert, ShieldOff, UserCheck, UserX } from "lucide-react";
import { api, errMessage, mfaAdminReset, type Me } from "../../lib/api";
import { THAI_BANKS } from "../../lib/banks";
import { notify } from "../../lib/notify";
import { formatFullName } from "../../lib/prefixes";
import {
  Alert, Button, Chip, FieldGroup, Modal,
  PageHeader, Panel, Select,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

/** Returns `value` after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

interface User {
  id: string;
  email: string;
  title?: string | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  study_level?: string | null;
  study_year?: number | null;
  roles: string[];
  /** สิทธิ์ผู้บริหาร — เห็นแดชบอร์ดสถิติงบแบบอ่านอย่างเดียว (ไม่ใช่ role) */
  is_executive?: boolean;
  /** ตำแหน่งบริหาร เช่น "หัวหน้าสาขาวิชา..." — ป้ายแสดงผลเฉยๆ ไม่มีผลต่อสิทธิ์หรือเอกสาร */
  admin_position?: string | null;
  is_active: boolean;
  /** เปิดใช้งาน 2FA แล้วหรือยัง — บังคับสำหรับ admin/staff/ผู้บริหาร */
  totp_enabled?: boolean;
}

/**
 * What the search box matches against. Carries BOTH spellings of the name: the
 * row now reads "ผศ. ดร.วรัญญา" (title runs into the given name), so someone
 * typing what they see has to match, and so does someone typing "วรัญญา" alone.
 */
function userHaystack(u: User): string {
  return `${formatFullName(u)} ${u.title ?? ""} ${u.first_name} ${u.last_name} ${u.email} ${u.admin_position ?? ""}`;
}

// ตำแหน่งทางวิชาการนำหน้าคุณวุฒิเสมอ (เช่น "รศ. ดร." ไม่ใช่ "ดร. รศ.")
const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "อาจารย์", "อ. ดร.", "ผศ.", "ผศ. ดร.", "รศ. ดร.", "ศ. ดร."];
const STUDY_LEVELS: { value: string; label: string }[] = [
  { value: "undergrad", label: "ปริญญาตรี" },
  { value: "master", label: "ปริญญาโท" },
  { value: "phd", label: "ปริญญาเอก" },
];
const ROLE_OPTIONS = ["staff", "lecturer", "ta"] as const;
// Full role set for the edit multi-select — includes admin so an admin user
// stays fully editable instead of being silently demoted.
const ALL_ROLES = ["admin", "staff", "lecturer", "ta"] as const;

// "ผู้บริหาร" now names the executive FLAG (read-only budget analytics), so
// admin reverts to the name the backend's own messages use — ผู้ดูแลระบบ.
// Keeping both as "ผู้บริหาร" would put two different powers under one word.
const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
};

/** Order-independent comparison of two role lists. */
function sameRoles(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
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
  // เบอร์โทรศัพท์ไทย: ตัวเลข 10 หลัก ขึ้นต้นด้วย 0
  if (!/^0\d{9}$/.test(s)) return "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (ขึ้นต้นด้วย 0)";
  return null;
}
/** เก็บเฉพาะตัวเลข ตัดให้เหลือไม่เกิน 10 หลัก — ใช้กับช่องเบอร์โทร */
function onlyPhoneDigits(v: string): string {
  return v.replace(/\D/g, "").slice(0, 10);
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

/** Multi-select role editor (checkbox chips) — preserves every assigned role. */
function RolesField({
  label, value, onChange, error, show,
}: {
  label: React.ReactNode;
  value: string[];
  onChange: (roles: string[]) => void;
  error: string | null;
  show: boolean;
}) {
  const invalid = show && !!error;
  return (
    <FieldGroup label={label} error={invalid ? error : undefined}>
      <div className="flex gap-2 flex-wrap">
        {ALL_ROLES.map(r => {
          const on = value.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(on ? value.filter(x => x !== r) : [...value, r])}
              className={`chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`}
              aria-pressed={on}
            >
              {on ? <Check size={12} className="me-1 inline" /> : null}
              {ROLE_LABEL[r] ?? r}
            </button>
          );
        })}
      </div>
    </FieldGroup>
  );
}

/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 15;

/** Maps a sortable column to the key the API understands. */
const SORT_KEY: Record<string, string> = { name: "name", email: "email" };

export default function UsersPage() {
  // Search / filters / sort / page live here rather than inside DataTable,
  // because each one has to reach the API: the table now shows one page at a
  // time and cannot answer "which 15 of 51" on its own.
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortDescriptor>({ column: "name", direction: "ascending" });
  const [page, setPage] = useState(1);

  // Typing hits the API on every keystroke otherwise. The debounce is on the
  // value that goes INTO the request, not on the input, so the box stays
  // responsive while the fetch lags a moment behind.
  const debouncedQuery = useDebounced(query, 300);

  // Reduce every input to a primitive before it reaches a dependency array.
  // `sort` is an object and React Aria hands back a fresh one on each change,
  // so depending on its identity re-ran the effects below on every render.
  const sortKey = SORT_KEY[String(sort.column)] ?? "name";
  const sortDir = sort.direction === "descending" ? "desc" : "asc";
  const roleFilter = filterValues.role ?? "";
  const statusFilter = filterValues.active ?? "";
  const trimmedQuery = debouncedQuery.trim();

  const listKey = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
      sort: sortKey,
      dir: sortDir,
    });
    if (trimmedQuery) p.set("q", trimmedQuery);
    if (roleFilter) p.set("role", roleFilter);
    if (statusFilter) p.set("status", statusFilter);
    return `/users?${p.toString()}`;
  }, [page, sortKey, sortDir, trimmedQuery, roleFilter, statusFilter]);

  const { data, isLoading, error } = useSWR<{ items: User[]; total: number }>(listKey, {
    // Each page is its own SWR key with no cached data, so without this the
    // table blanks to a spinner on every page step instead of holding the old
    // rows while the next page arrives.
    keepPreviousData: true,
  });

  // Anything that changes WHICH rows match has to send the user back to page 1
  // — otherwise a search narrowing 51 rows to 2 leaves them stranded on page 3
  // looking at an empty table.
  useEffect(() => { setPage(1); }, [trimmedQuery, roleFilter, statusFilter, sortKey, sortDir]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [reactivating, setReactivating] = useState<User | null>(null);
  const [unlocking, setUnlocking] = useState<User | null>(null);
  const [resetting2FA, setResetting2FA] = useState<User | null>(null);

  // The password-gate unlock is admin-only, and the API additionally refuses an
  // admin unlocking themselves (see service.ClearPasswordGateLockout — otherwise
  // a stolen admin session could grind the gate and keep letting itself back in).
  // Both rules are mirrored here so the button is never offered where the request
  // would come back 403; the server stays the one enforcing them.
  const { data: me } = useSWR<Me>("/me");
  const isAdmin = (me?.roles ?? []).includes("admin");
  const canUnlock = (u: User) => isAdmin && u.id !== me?.id;
  // 2FA reset is admin-only, NOT adminOrStaff — see router.go's
  // RequireRole(rbac.RoleAdmin) on this route and MFAService.AdminReset's own
  // doc comment: staff already hold unrestricted password reset, so letting
  // staff also reset 2FA would chain into a one-click admin takeover. Also
  // refused on self, mirroring AdminReset's own refusal — an admin who still
  // has access must disable their OWN 2FA from /account (password + code),
  // not this weaker admin path (password only).
  const canReset2FA = (u: User) => isAdmin && u.id !== me?.id;

  const columns: DataColumn<User>[] = [
    {
      id: "name", label: "ชื่อ", sortable: true, isRowHeader: true,
      sortValue: u => `${u.first_name} ${u.last_name}`,
      className: "font-medium",
      render: u => (
        <div>
          <div>{formatFullName(u)}</div>
          {/* ป้ายแสดงผลเฉยๆ ต่อจากชื่อ — ตำแหน่งบริหารไม่ใช่บทบาท จึงไม่ใช่ Chip */}
          {u.admin_position && (
            <div className="text-xs font-normal text-muted mt-0.5">{u.admin_position}</div>
          )}
        </div>
      ),
    },
    {
      id: "email", label: "อีเมล", sortable: true,
      sortValue: u => u.email,
      className: "text-(--ink-3)",
      render: u => u.email,
    },
    {
      id: "roles", label: "บทบาท",
      render: u => {
        // 2FA is mandatory for admin/staff/ผู้บริหาร (see AccountGuard's
        // mfa_setup_required) — only flag the gap for those, since a
        // lecturer/TA without it is just someone who hasn't opted in, not a
        // policy violation worth an admin's attention.
        const mandatory = u.roles.includes("admin") || u.roles.includes("staff") || u.is_executive;
        return (
          <div className="flex gap-1 flex-wrap">
            {u.roles.map(r => <Chip key={r} tone="neutral">{ROLE_LABEL[r] ?? r}</Chip>)}
            {u.is_executive && <Chip tone="info">ผู้บริหาร</Chip>}
            {u.totp_enabled ? (
              <Chip tone="success">2FA</Chip>
            ) : mandatory ? (
              <Chip tone="danger"><ShieldAlert size={11} className="me-1" /> ยังไม่ตั้ง 2FA</Chip>
            ) : null}
          </div>
        );
      },
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
          {canUnlock(u) && (
            <Button variant="ghost" size="sm" onClick={() => setUnlocking(u)}>
              <LockOpen size={14} /> ปลดล็อก
            </Button>
          )}
          {canReset2FA(u) && u.totp_enabled && (
            <Button variant="ghost" size="sm" onClick={() => setResetting2FA(u)}>
              <ShieldOff size={14} /> รีเซ็ต 2FA
            </Button>
          )}
          {u.is_active ? (
            <Button variant="danger-soft" size="sm" onClick={() => setDeactivating(u)}>
              <UserX size={14} /> ปิด
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setReactivating(u)}>
              <UserCheck size={14} /> เปิดใช้งาน
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
          <span data-tour="users-create">
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> สร้างผู้ใช้
            </Button>
          </span>
        }
      />

      <Panel padded={false} data-tour="users-table">
        <div className="p-4">
          <DataTable
            ariaLabel="ผู้ใช้ทั้งหมดในระบบ"
            rows={data?.items}
            loading={isLoading}
            error={error}
            onRetry={() => mutate(listKey)}
            rowKey={u => u.id}
            searchFn={userHaystack}
            searchPlaceholder="ค้นหาชื่อ / อีเมล…"
            filters={[
              {
                id: "role",
                placeholder: "ทุกบทบาท",
                options: [
                  { id: "", label: "ทุกบทบาท" },
                  { id: "admin", label: "Admin / ผู้ดูแลระบบ" },
                  { id: "staff", label: "เจ้าหน้าที่" },
                  { id: "lecturer", label: "อาจารย์" },
                  { id: "ta", label: "ผู้ช่วยสอน (TA)" },
                ],
                // Unused in server mode — the API applies these. Kept so the
                // component keeps working if the table is ever taken off it.
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
            pageSize={PAGE_SIZE}
            emptyTitle="ไม่พบผู้ใช้"
            emptyDescription="ลองปรับเงื่อนไขการค้นหา"
            columns={columns}
            server={{
              total: data?.total ?? 0,
              page,
              onPageChange: setPage,
              query,
              onQueryChange: setQuery,
              filterValues,
              onFilterChange: setFilterValues,
              sort,
              onSortChange: setSort,
            }}
          />
        </div>
      </Panel>

      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {deactivating && <DeactivateModal user={deactivating} onClose={() => setDeactivating(null)} />}
      {reactivating && <ReactivateModal user={reactivating} onClose={() => setReactivating(null)} />}
      {unlocking && <UnlockPasswordGateModal user={unlocking} onClose={() => setUnlocking(null)} />}
      {resetting2FA && <Reset2FAModal user={resetting2FA} onClose={() => setResetting2FA(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    email: "", title: "นาย", first_name: "", last_name: "", phone: "",
    role: "ta", study_level: "undergrad", study_year: "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ email: "", title: "นาย", first_name: "", last_name: "", phone: "", role: "ta", study_level: "undergrad", study_year: "" });
      setErr(null); setTempPassword(null); setShowErrors(false);
    }
  }, [open]);

  const showYear = form.role === "ta" && form.study_level === "undergrad";

  // The duplicate-email warning used to compare against the loaded user list.
  // That list is now ONE PAGE, so it would have quietly stopped warning about
  // everyone not on screen — the account you would most want flagged is the one
  // you cannot see. Ask the server about this exact address instead.
  const typedEmail = form.email.trim().toLowerCase();
  const emailToCheck = vEmail(form.email) === null ? typedEmail : "";
  const debouncedEmail = useDebounced(emailToCheck, 400);
  const { data: emailMatches } = useSWR<{ items: User[] }>(
    debouncedEmail ? `/users?q=${encodeURIComponent(debouncedEmail)}&limit=5` : null,
  );
  // `q` is a substring match, so narrow it back down to an exact address.
  const emailTaken = !!emailMatches?.items?.some(u => u.email.toLowerCase() === debouncedEmail);

  const errors = useMemo(() => ({
    email: vEmail(form.email) ??
      (emailTaken && debouncedEmail === typedEmail ? "อีเมลนี้มีผู้ใช้อยู่แล้ว" : null),
    title: vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(form.first_name, "ชื่อ"),
    last_name: vName(form.last_name, "นามสกุล"),
    role: vSelect(form.role, ROLE_OPTIONS),
    study_level: form.role === "ta" ? vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)) : null,
    phone: vPhone(form.phone),
  }), [form, emailTaken, debouncedEmail, typedEmail]);
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
        phone: form.phone.trim() || undefined,
        roles: [form.role],
        study_level: form.role === "ta" ? form.study_level : undefined,
        study_year: showYear && form.study_year ? Number(form.study_year) : undefined,
      };
      const res = await api.post<{ user: User; temp_password: string }>("/users", body);
      mutate((k: string) => k.startsWith("/users"));
      setTempPassword(res.temp_password);
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
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
          <VField label="เบอร์โทรศัพท์" type="tel" placeholder="0812345678"
            value={form.phone} onChange={v => setForm({ ...form, phone: onlyPhoneDigits(v) })}
            error={errors.phone} show={showErrors}
          />
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
          {showYear && (
            <VSelect label="ชั้นปี (สำหรับ TA ปริญญาตรี จำเป็นสำหรับการใช้โหมด WBA ปี 4)"
              value={form.study_year}
              onChange={v => setForm({ ...form, study_year: v })}
              error={null} show={showErrors}
            >
              <option value="">ไม่ระบุ</option>
              <option value="1">ปี 1</option>
              <option value="2">ปี 2</option>
              <option value="3">ปี 3</option>
              <option value="4">ปี 4</option>
            </VSelect>
          )}
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
    // Preserve the full role set (incl. admin) rather than collapsing to one.
    roles: [...user.roles],
    is_executive: user.is_executive === true,
    admin_position: user.admin_position ?? "",
    study_level: user.study_level ?? "undergrad",
    study_year: user.study_year != null ? String(user.study_year) : "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isTa = form.roles.includes("ta");
  const errors = useMemo(() => ({
    email: vEmail(form.email),
    title: form.title === "" ? null : vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(form.first_name, "ชื่อ"),
    last_name: vName(form.last_name, "นามสกุล"),
    roles: form.roles.length === 0 ? "เลือกบทบาทอย่างน้อยหนึ่งอย่าง" : null,
    study_level: form.roles.includes("ta") ? vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)) : null,
    phone: vPhone(form.phone),
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      const rolesChanged = !sameRoles(form.roles, user.roles);
      await api.patch(`/users/${user.id}`, {
        email: form.email.trim(),
        title: form.title,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        // Only send roles when they actually changed, so an unrelated edit never
        // rewrites the user's role set.
        ...(rolesChanged ? { roles: form.roles } : {}),
        ...(form.is_executive !== (user.is_executive === true)
          ? { is_executive: form.is_executive }
          : {}),
        ...(form.admin_position !== (user.admin_position ?? "")
          ? { admin_position: form.admin_position.trim() }
          : {}),
        study_level: isTa ? form.study_level : null,
        // null clears study_year server-side; the request-validation layer
        // rejects a literal 0 (gte=1) before Update's own clear-sentinel
        // logic ever runs, so non-applicable saves must send null, not 0.
        study_year: isTa && form.study_level === "undergrad"
          ? (form.study_year ? Number(form.study_year) : null)
          : null,
      });
      mutate((k: string) => k.startsWith("/users"));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
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
            <RolesField
              label="บทบาท (เลือกได้หลายอย่าง)"
              value={form.roles}
              onChange={roles => setForm({ ...form, roles })}
              error={errors.roles} show={showErrors}
            />
            {/* ป้ายแสดงผลเฉยๆ: คนคนหนึ่งอาจมีตำแหน่งบริหารควบคู่กับบทบาทสอน เช่น
                หัวหน้าสาขาวิชา — ไม่ผูกกับสิทธิ์การใช้งานหรือเอกสารที่ออกจากระบบ
                (เอกสารทางการใช้รายชื่อแยกที่หน้า "ตั้งค่า") */}
            <VField label="ตำแหน่งบริหาร (ถ้ามี)" value={form.admin_position}
              onChange={v => setForm({ ...form, admin_position: v })}
              error={null} show={false}
              placeholder="เช่น หัวหน้าสาขาวิชาวิทยาการคอมพิวเตอร์"
            />
            {/* สิทธิ์ ไม่ใช่บทบาท: เห็นเฉพาะหน้าสถิติงบแบบอ่านอย่างเดียว
                (/executive) ไม่เพิ่มเมนูงานหรืออำนาจแก้ไขใด ๆ */}
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--brand)]"
                checked={form.is_executive}
                onChange={e => setForm({ ...form, is_executive: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-medium">สิทธิ์ผู้บริหาร</span>
                <span className="block text-xs text-muted mt-0.5">
                  ให้เข้าดูหน้ามุมมองผู้บริหาร (สรุปการใช้งบประมาณ) ได้อย่างเดียว แก้ไขข้อมูลไม่ได้
                </span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {isTa && (
                <VSelect label="ระดับการศึกษา" value={form.study_level}
                  onChange={v => setForm({ ...form, study_level: v })}
                  error={errors.study_level} show={showErrors}
                >
                  {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </VSelect>
              )}
              {isTa && form.study_level === "undergrad" && (
                <VSelect label="ชั้นปี (ระบบคำนวณอัตโนมัติจากรหัส นศ. เมื่อมี)" value={form.study_year}
                  onChange={v => setForm({ ...form, study_year: v })}
                  error={null} show={showErrors}
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="1">ปี 1</option>
                  <option value="2">ปี 2</option>
                  <option value="3">ปี 3</option>
                  <option value="4">ปี 4</option>
                </VSelect>
              )}
              <VField label="เบอร์โทรศัพท์" type="tel" placeholder="0812345678"
                value={form.phone} onChange={v => setForm({ ...form, phone: onlyPhoneDigits(v) })}
                error={errors.phone} show={showErrors}
              />
            </div>
          </div>
        </div>

        {/* ข้อมูลบัญชีธนาคารถูกถอดออก — ระบบไม่จัดเก็บลงฐานข้อมูลแล้ว (PDPA,
            migration 0047) เจ้าหน้าที่ดูจากไฟล์แบบฟอร์มเจ้าหนี้ที่ TA ส่งมา
            ในหน้า "ตรวจสอบแบบฟอร์มใบแจ้งหนี้" แทน */}

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
      notify.success("ปิดใช้งานบัญชีเรียบร้อยแล้ว");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
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

function ReactivateModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setPending(true); setErr(null);
    try {
      await api.post(`/users/${user.id}/activate`);
      mutate((k: string) => k.startsWith("/users"));
      notify.success("เปิดใช้งานบัญชีเรียบร้อยแล้ว");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="เปิดใช้งานบัญชี"
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>ยกเลิก</Button>
        <Button variant="primary" onClick={submit} disabled={pending} isPending={pending}>
          <UserCheck size={14} /> เปิดใช้งาน
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          เปิดใช้งานบัญชีของ <span className="font-medium">{user.first_name} {user.last_name}</span> ({user.email})
          อีกครั้ง ผู้ใช้จะสามารถเข้าสู่ระบบได้ตามปกติ
        </p>
        {err && <Alert status="danger" title="เปิดใช้งานไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Clears the re-authentication lockout that guards the document-bundle download
 * and the staff worklog editor. Five wrong passwords at that prompt shut it for
 * 15 minutes; this is the shortcut past the wait, not the only way out.
 *
 * Distinct from "รีเซ็ตรหัสผ่าน" and worth keeping distinct in the wording: this
 * does NOT change the password. An admin who reaches for the wrong one of the two
 * hands the officer a temporary password they never asked for.
 *
 * The success message branches on was_locked because "unlocked" and "there was
 * nothing to unlock" are genuinely different answers — the second means the
 * officer's problem is something else, and saying "สำเร็จ" to both would send the
 * admin away believing they had fixed it.
 */
function UnlockPasswordGateModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setPending(true); setErr(null);
    try {
      const res = await api.post<{ was_locked: boolean }>(`/users/${user.id}/unlock-password-gate`);
      notify.success(res.was_locked
        ? "ปลดล็อกเรียบร้อยแล้ว ผู้ใช้ยืนยันรหัสผ่านได้ทันที"
        : "บัญชีนี้ไม่ได้ถูกล็อกอยู่ จึงไม่มีอะไรต้องปลด");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ปลดล็อกการยืนยันรหัสผ่าน"
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>ยกเลิก</Button>
        <Button variant="primary" onClick={submit} disabled={pending} isPending={pending}>
          <LockOpen size={14} /> ปลดล็อก
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          ล้างการนับรหัสผ่านผิดของ
          <span className="font-medium"> {user.first_name} {user.last_name} </span>
          ({user.email}) เพื่อให้กลับมายืนยันตัวตนตอนดาวน์โหลดเอกสารหรือแก้ไขเวลาปฏิบัติงานได้ทันที
          โดยไม่ต้องรอจนครบ 15 นาที
        </p>
        <p className="text-sm text-(--ink-3)">
          การดำเนินการนี้ <span className="font-medium">ไม่เปลี่ยนรหัสผ่าน</span> ของผู้ใช้
          หากผู้ใช้จำรหัสผ่านไม่ได้ ให้ใช้ &ldquo;รีเซ็ตรหัส&rdquo; แทน
          ทั้งนี้ระบบจะบันทึกผู้ปลดล็อกไว้ในประวัติการใช้งาน
        </p>
        {err && <Alert status="danger" title="ปลดล็อกไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

// Admin-only (see canReset2FA above and router.go's RequireRole(rbac.RoleAdmin)
// on this route). Requires the ACTING admin's own password, unlike
// UnlockPasswordGateModal above — resetting 2FA removes a security control
// entirely, not just a temporary rate-limit, so it gets the stronger gate.
function Reset2FAModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!password) {
      setErr("กรุณากรอกรหัสผ่านของคุณเพื่อยืนยัน");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await mfaAdminReset(user.id, password);
      notify.success(`รีเซ็ต 2FA ของ ${user.first_name} ${user.last_name} แล้ว`);
      mutate((k: string) => k.startsWith("/users"));
      onClose();
    } catch (e) {
      setErr(errMessage(e));
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="รีเซ็ต 2FA"
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>ยกเลิก</Button>
        <Button variant="danger" onClick={submit} disabled={pending} isPending={pending}>
          <ShieldOff size={14} /> รีเซ็ต 2FA
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          ล้างการยืนยันตัวตนสองขั้นตอนของ
          <span className="font-medium"> {user.first_name} {user.last_name} </span>
          ({user.email}) ผู้ใช้จะเข้าสู่ระบบด้วยรหัสผ่านเพียงอย่างเดียว และต้องตั้งค่า 2FA ใหม่
        </p>
        <p className="text-sm text-(--ink-3)">
          ใช้เมื่อผู้ใช้ทำอุปกรณ์ยืนยันตัวตนหายและไม่มีรหัสสำรองเหลืออยู่
        </p>
        <VField
          label="รหัสผ่านของคุณ (ยืนยันตัวตน)"
          value={password}
          onChange={setPassword}
          error={err}
          show={!!err}
          type="password"
          required
        />
      </div>
    </Modal>
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
