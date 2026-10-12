"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  FieldError as HFieldError,
  Input as HInput,
  Label as HLabel,
  TextField as HTextField,
  type SortDescriptor,
} from "@heroui/react";
import { CalendarDays, Camera, Copy, Files, GraduationCap, KeyRound, LockOpen, MoreHorizontal, Pencil, Plus, ShieldAlert, ShieldOff, Trash2, UserCheck, UserX } from "lucide-react";
import { Button as HButton, Dropdown, Label } from "@heroui/react";
import { api, errMessage, mfaAdminReset, type Enrollment, type Me, type Term } from "../../lib/api";
import { STUDENT_ID_PATTERN, THAI_BANKS } from "../../lib/banks";
import { notify } from "../../lib/notify";
import { formatFullName } from "../../lib/prefixes";
import { isForeign, passportError, passportNumber, type Nationality } from "../../lib/nationality";
import NationalityPicker from "../../components/NationalityPicker";
import {
  Alert, Button, Chip, FieldGroup, IconButton, Modal,
  PageHeader, Select, TextArea, Tip,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import UserAvatar from "../../components/UserAvatar";
import TermSelect from "../../components/TermSelect";
import AvatarCropper from "../../components/AvatarCropper";
import SendCredentialsButton from "../../components/SendCredentialsButton";
import { SkelList } from "../../components/Skeletons";
import { msg, useI18n, type TFn } from "../../lib/i18n/client";

/** Mirrors ProfilePhotoCard's own picker rules (app/components/ProfilePhotoCard.tsx)
 *  — kept in sync by hand since the two forms upload to different endpoints. */
const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const AVATAR_MAX_PICK_BYTES = 12 * 1024 * 1024;

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
  /** Denormalized copy of the TA's currently-active ta_enrollments row (see
   *  migration 0094) — kept in sync by EnrollmentService.RecordTransition, not
   *  editable directly here. Use the "ประวัติการศึกษา" action to change it. */
  student_id?: string | null;
  /** "thai" | "foreign" — decides which ID and documents a TA gives (0151). */
  nationality?: Nationality;
  roles: string[];
  /** สิทธิ์ผู้บริหาร — เห็นแดชบอร์ดสถิติงบแบบอ่านอย่างเดียว (ไม่ใช่ role) */
  is_executive?: boolean;
  /** ตำแหน่งบริหาร เช่น "หัวหน้าสาขาวิชา..." — ป้ายแสดงผลเฉยๆ ไม่มีผลต่อสิทธิ์หรือเอกสาร */
  admin_position?: string | null;
  is_active: boolean;
  /** เปิดใช้งาน 2FA แล้วหรือยัง — บังคับสำหรับ admin/staff/ผู้บริหาร */
  totp_enabled?: boolean;
  avatar_url?: string | null;
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
// รศ. / ศ. without ดร. and plain ดร. were missing: a rank outside this list
// could not be picked at all, and the officer seat printed no rank for it.
// i18n-ignore-next-line — titles are stored and printed on the official forms as written
const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "อาจารย์", "อ. ดร.", "ดร.", "ผศ.", "ผศ. ดร.", "รศ.", "รศ. ดร.", "ศ.", "ศ. ดร."];
const STUDY_LEVELS: { value: string; label: string }[] = [
  { value: "undergrad", label: msg("ปริญญาตรี") },
  { value: "master", label: msg("ปริญญาโท") },
  { value: "phd", label: msg("ปริญญาเอก") },
];
const ROLE_OPTIONS = ["staff", "lecturer", "ta"] as const;

/** "ปริญญาตรี ปี 3" — the year is the server's derivation from the student id
 *  (UserService.applyDerivedStudyYear), never something staff type in. */
function levelLabel(t: TFn, u: Pick<User, "study_level" | "study_year">): string {
  if (!u.study_level) return "-";
  const label = t(STUDY_LEVELS.find(l => l.value === u.study_level)?.label ?? u.study_level);
  return u.study_level === "undergrad" && u.study_year ? t("{level} ปี {year}", { level: label, year: u.study_year }) : label;
}

// "ผู้บริหาร" now names the executive FLAG (read-only budget analytics), so
// admin reverts to the name the backend's own messages use — ผู้ดูแลระบบ.
// Keeping both as "ผู้บริหาร" would put two different powers under one word.
const ROLE_LABEL: Record<string, string> = {
  admin: msg("ผู้ดูแลระบบ"),
  staff: msg("เจ้าหน้าที่"),
  lecturer: msg("อาจารย์"),
  ta: msg("ผู้ช่วยสอน"),
};

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Validators return Thai keys (msg); VField / VSelect translate them when shown.
function vRequired(v: string, message: string = msg("กรุณากรอกข้อมูล")): string | null {
  return v.trim() === "" ? message : null;
}
function vEmail(v: string): string | null {
  if (!v.trim()) return msg("กรุณากรอกอีเมล");
  if (!EMAIL_RE.test(v.trim())) return msg("รูปแบบอีเมลไม่ถูกต้อง");
  return null;
}
function vName(t: TFn, v: string, label: string): string | null {
  if (!v.trim()) return t("กรุณากรอก{label}", { label: t(label) });
  if (v.trim().length > 100) return t("{label}ยาวเกินไป", { label: t(label) });
  return null;
}
function vPhone(v: string, foreign = false): string | null {
  const s = v.trim();
  if (!s) return null;
  // ชาวต่างชาติอาจมีแต่เบอร์ต่างประเทศ: รับรหัสประเทศได้ สูงสุด 15 หลัก (E.164)
  if (foreign) {
    return /^\d{9,15}$/.test(s) ? null : msg("เบอร์โทรศัพท์ต้องเป็นตัวเลข 9–15 หลัก (ใส่รหัสประเทศได้)");
  }
  // เบอร์โทรศัพท์ไทย: ตัวเลข 10 หลัก ขึ้นต้นด้วย 0
  if (!/^0\d{9}$/.test(s)) return msg("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (ขึ้นต้นด้วย 0)");
  return null;
}
/** 0812345678 → 081-234-5678; 9-digit landline 043123456 → 04-312-3456.
 *  Anything else (a foreign number with its country code) is shown as +digits. */
function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d.length > 10 ? `+${d}` : d;
}
function telHref(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.startsWith("0") ? d : `+${d}`;
}
/** เก็บเฉพาะตัวเลข ตัดให้เหลือไม่เกิน 10 หลัก (15 สำหรับเบอร์ต่างประเทศ) — ใช้กับช่องเบอร์โทร */
function onlyPhoneDigits(v: string, foreign = false): string {
  return v.replace(/\D/g, "").slice(0, foreign ? 15 : 10);
}
function vAccountNo(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9\- ]{6,25}$/.test(s)) return msg("เลขที่บัญชีต้องเป็นตัวเลข");
  return null;
}
function vBranchCode(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9]{3,6}$/.test(s)) return msg("รหัสสาขาต้องเป็นตัวเลข 3–6 หลัก");
  return null;
}
function vSelect(v: string, allowed: readonly string[]): string | null {
  return allowed.includes(v) ? null : msg("กรุณาเลือกจากรายการ");
}
function vStudentID(v: string): string | null {
  return STUDENT_ID_PATTERN.test(v.trim()) ? null : msg("รูปแบบรหัสนักศึกษาไม่ถูกต้อง (XXXXXXXXX-X)");
}
// Student ID renders as `XXXXXXXXX-X` — same auto-formatting as the TA's own
// documents/page.tsx so pasting either `123456789-0` or `1234567890` works.
function formatStudentID(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, 10);
  return d.length <= 9 ? d : d.slice(0, 9) + "-" + d.slice(9);
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
  const { t } = useI18n();
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
      {invalid && <HFieldError>{t(error!)}</HFieldError>}
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
  const { t } = useI18n();
  const invalid = show && !!error;
  return (
    <FieldGroup label={label} error={invalid ? t(error!) : undefined}>
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

/**
 * Revalidates every cached `/users…` page. The `typeof` guard is load-bearing:
 * SWR hands the filter EVERY key in the cache, and the help panel caches under
 * an array key (["docs-index"]). Calling `.startsWith` on that threw inside
 * SWR's mutate, so after any create/edit/deactivate the table never refetched
 * and staff had to reload the page to see their own change.
 */
function refreshUsers() {
  return mutate((k: unknown) => typeof k === "string" && k.startsWith("/users"));
}

const PAGE_SIZE = 15;

/** Maps a sortable column to the key the API understands. */
const SORT_KEY: Record<string, string> = { name: "name", email: "email" };

export default function UsersPage() {
  // Search / filters / sort / page live here rather than inside DataTable,
  // because each one has to reach the API: the table now shows one page at a
  // time and cannot answer "which 15 of 51" on its own.
  const { t, locale } = useI18n();
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
  const [historyFor, setHistoryFor] = useState<User | null>(null);
  const [timetableFor, setTimetableFor] = useState<User | null>(null);

  // The password-gate unlock is admin-only, and the API additionally refuses an
  // admin unlocking themselves (see service.ClearPasswordGateLockout — otherwise
  // a stolen admin session could grind the gate and keep letting itself back in).
  // Both rules are mirrored here so the button is never offered where the request
  // would come back 403; the server stays the one enforcing them.
  const { data: me } = useSWR<Me>("/me");
  const isAdmin = (me?.roles ?? []).includes("admin");
  const canUnlock = (u: User) => isAdmin && u.id !== me?.id;
  // 2FA reset: admin for anyone; staff only for accounts whose 2FA is
  // optional (TA, lecturer) — the same reach staff have for password reset,
  // enforced again in MFAHandler.AdminReset. A privileged target stays with
  // admin so password reset + 2FA reset never chain into a takeover. Also
  // refused on self: an account that still has access disables its OWN 2FA
  // from /account (password + code), not this weaker path (password only).
  const privileged = (u: User) => u.roles.includes("admin") || u.roles.includes("staff") || !!u.is_executive;
  const canReset2FA = (u: User) => u.id !== me?.id && (isAdmin || !privileged(u));
  // Admin accounts are managed by admins only (UserService.assertMayManage):
  // staff get no edit / reset / on-off buttons on an admin row, rather than
  // buttons that fail with a 403.
  const canManage = (u: User) => isAdmin || !u.roles.includes("admin");

  const columns: DataColumn<User>[] = [
    {
      id: "name", width: 200, minWidth: 140, label: t("ชื่อ"), sortable: true, isRowHeader: true,
      sortValue: u => `${u.first_name} ${u.last_name}`,
      className: "font-medium",
      render: u => (
        // Picture, name, and the admin position as a quieter second line —
        // the one deliberate two-line cell (user's choice, 03/10/2026). The
        // position is display only, not a role, so it is not a Chip.
        <span className="inline-flex items-center gap-3">
          <UserAvatar firstName={u.first_name} lastName={u.last_name} src={u.avatar_url} size="sm" />
          <span className="inline-flex flex-col leading-tight">
            <span>{formatFullName(u)}</span>
            {u.admin_position && (
              <span className="text-xs font-normal text-muted mt-0.5">{u.admin_position}</span>
            )}
          </span>
        </span>
      ),
    },
    {
      id: "email", width: 230, minWidth: 140, label: t("อีเมล"), sortable: true,
      sortValue: u => u.email,
      className: "text-(--ink-3) whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: u => u.email,
    },
    {
      // ติดต่อ TA กรณีเหตุฉุกเฉิน — TA กรอกเองในแบบฟอร์มข้อมูลส่วนตัว
      // (UpsertProfile writes users.phone), staff may also set it here.
      id: "phone", width: 140, minWidth: 110, label: t("เบอร์โทรศัพท์"),
      className: "text-(--ink-3) whitespace-nowrap tabular-nums",
      headerClassName: "whitespace-nowrap",
      render: u => u.phone
        ? <a href={`tel:${telHref(u.phone)}`} className="hover:underline underline-offset-2">{formatPhone(u.phone)}</a>
        : "-",
    },
    {
      id: "roles", width: 170, minWidth: 110, label: t("บทบาท"),
      headerClassName: "whitespace-nowrap",
      render: u => {
        // 2FA is mandatory for admin/staff/ผู้บริหาร (see AccountGuard's
        // mfa_setup_required) — only flag the gap for those, since a
        // lecturer/TA without it is just someone who hasn't opted in, not a
        // policy violation worth an admin's attention.
        const mandatory = u.roles.includes("admin") || u.roles.includes("staff") || u.is_executive;
        return (
          // Roles as plain text: a grey chip per role added boxes without
          // telling them apart. The 2FA chip stays — its colour is the point.
          <div className="inline-flex items-center gap-2">
            <span className="text-sm">
              {[...u.roles.map(r => t(ROLE_LABEL[r] ?? r)), ...(u.is_executive ? [t("ผู้บริหาร")] : [])].join(", ") || "-"}
            </span>
            {u.totp_enabled ? (
              <Tip content={t("เปิดใช้การยืนยันตัวตนสองขั้นตอนแล้ว")}>
                <span className="inline-flex"><Chip tone="success">2FA</Chip></span>
              </Tip>
            ) : mandatory ? (
              <Tip content={t("บัญชีนี้ต้องเปิดใช้การยืนยันตัวตนสองขั้นตอน แต่ยังไม่ได้ตั้งค่า")}>
                <span className="inline-flex"><Chip tone="danger"><ShieldAlert size={11} className="me-1" /> {t("ยังไม่ตั้ง 2FA")}</Chip></span>
              </Tip>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "level", width: 140, minWidth: 100, label: t("ระดับ"),
      className: "text-(--ink-3) whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: u => (
        <span className="inline-flex items-center gap-1.5">
          {levelLabel(t, u)}
          {u.roles.includes("ta") && isForeign(u.nationality) && <Chip tone="info">{t("ต่างชาติ")}</Chip>}
        </span>
      ),
    },
    {
      id: "student_id", width: 140, minWidth: 110, label: t("รหัสนักศึกษา"),
      className: "text-(--ink-3) whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: u => u.student_id ?? "-",
    },
    {
      id: "status", width: 100, minWidth: 80, label: t("สถานะ"),
      className: "whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: u => u.is_active
        ? <Chip tone="success">{t("ใช้งาน")}</Chip>
        // "ปิด" alone is also the Close button's key, so English reads the
        // filter's own wording for this state instead.
        : <Chip tone="danger">{locale === "th" ? "ปิด" /* i18n-ignore */ : t("ปิดใช้งาน")}</Chip>,
    },
    {
      id: "actions", width: 120, minWidth: 120, label: <span className="sr-only">{t("การจัดการ")}</span>,
      className: "text-right whitespace-nowrap",
      // The two everyday actions stay as icons (label in the tooltip); the
      // rarely used ones fold into a "⋯" menu. Each keeps its slot — an
      // empty one where it does not apply — so the icons line up row to row.
      render: u => {
        const spacer = <span className="inline-block w-8" aria-hidden />;
        const ta = u.roles.includes("ta");
        const more: Array<{ id: string; label: string; icon: React.ReactNode; run: () => void; danger?: boolean }> = [];
        if (ta) {
          more.push({ id: "history", label: t("ประวัติการศึกษา"), icon: <GraduationCap className="size-4" />, run: () => setHistoryFor(u) });
          more.push({ id: "timetable", label: t("ตารางเรียน"), icon: <CalendarDays className="size-4" />, run: () => setTimetableFor(u) });
        }
        if (canUnlock(u)) more.push({ id: "unlock", label: t("ปลดล็อกการยืนยันรหัสผ่าน"), icon: <LockOpen className="size-4" />, run: () => setUnlocking(u) });
        if (canReset2FA(u) && u.totp_enabled) more.push({ id: "2fa", label: t("รีเซ็ต 2FA"), icon: <ShieldOff className="size-4" />, run: () => setResetting2FA(u) });
        if (canManage(u)) more.push(u.is_active
          ? { id: "deactivate", label: t("ปิดใช้งานบัญชี"), icon: <UserX className="size-4 text-danger" />, run: () => setDeactivating(u), danger: true }
          : { id: "activate", label: t("เปิดใช้งานบัญชี"), icon: <UserCheck className="size-4" />, run: () => setReactivating(u) });
        return (
          <div className="flex gap-1 justify-end">
            {canManage(u)
              ? <IconButton variant="ghost" size="sm" label={t("แก้ไขข้อมูล")} onClick={() => setEditing(u)}><Pencil size={15} /></IconButton>
              : spacer}
            {canManage(u)
              ? <IconButton variant="ghost" size="sm" label={t("รีเซ็ตรหัสผ่าน")} onClick={() => setResetting(u)}><KeyRound size={15} /></IconButton>
              : spacer}
            {more.length === 0 ? spacer : (
              <Dropdown>
                <HButton variant="ghost" size="sm" isIconOnly aria-label={t("การจัดการเพิ่มเติมของ {name}", { name: formatFullName(u) })}>
                  <MoreHorizontal size={16} />
                </HButton>
                <Dropdown.Popover placement="bottom end">
                  <Dropdown.Menu onAction={(key: React.Key) => more.find(m => m.id === String(key))?.run()}>
                    {more.map(m => (
                      <Dropdown.Item key={m.id} id={m.id} textValue={m.label} variant={m.danger ? "danger" : undefined}>
                        {m.icon}
                        <Label>{m.label}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("จัดการผู้ใช้")}
        description={data?.total ? t("ทั้งหมด {n} รายชื่อ", { n: data.total }) : t("ผู้ใช้ทั้งหมดในระบบ")}
        actions={
          <span data-tour="users-create">
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> {t("สร้างผู้ใช้")}
            </Button>
          </span>
        }
      />

      <div data-tour="users-table">
        <DataTable
          ariaLabel={t("ผู้ใช้ทั้งหมดในระบบ")}
          rows={me ? data?.items : undefined}
          // Rows wait for /me too: which action icons a row gets depends on
          // who is looking, and drawing them a moment later made them pop in.
          loading={isLoading || !me}
          error={error}
          onRetry={() => mutate(listKey)}
          rowKey={u => u.id}
          searchFn={userHaystack}
          searchPlaceholder={t("ค้นหาชื่อ / อีเมล…")}
          filters={[
            {
              id: "role",
              placeholder: t("ทุกบทบาท"),
              options: [
                { id: "", label: t("ทุกบทบาท") },
                { id: "admin", label: t("Admin / ผู้ดูแลระบบ") },
                { id: "staff", label: t("เจ้าหน้าที่") },
                { id: "lecturer", label: t("อาจารย์") },
                { id: "ta", label: t("ผู้ช่วยสอน (TA)") },
              ],
              // Unused in server mode — the API applies these. Kept so the
              // component keeps working if the table is ever taken off it.
              predicate: (u, v) => u.roles.includes(v),
            },
            {
              id: "active",
              placeholder: t("ทุกสถานะ"),
              options: [
                { id: "", label: t("ทุกสถานะ") },
                { id: "active", label: t("ใช้งาน") },
                { id: "inactive", label: t("ปิดใช้งาน") },
              ],
              predicate: (u, v) => (v === "active" ? u.is_active : !u.is_active),
            },
          ]}
          pageSize={PAGE_SIZE}
          emptyTitle={t("ไม่พบผู้ใช้")}
          emptyDescription={t("ลองปรับเงื่อนไขการค้นหา")}
          // Level and student id belong to TAs only: filtered to staff, admin
          // or lecturers the two columns would be nothing but dashes.
          columns={roleFilter && roleFilter !== "ta"
            ? columns.filter(c => c.id !== "level" && c.id !== "student_id")
            : columns}
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

      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {deactivating && <DeactivateModal user={deactivating} onClose={() => setDeactivating(null)} />}
      {reactivating && <ReactivateModal user={reactivating} onClose={() => setReactivating(null)} />}
      {unlocking && <UnlockPasswordGateModal user={unlocking} onClose={() => setUnlocking(null)} />}
      {resetting2FA && <Reset2FAModal user={resetting2FA} onClose={() => setResetting2FA(null)} />}
      {historyFor && <EnrollmentHistoryModal user={historyFor} onClose={() => setHistoryFor(null)} />}
      {timetableFor && <TimetableCorrectionModal user={timetableFor} onClose={() => setTimetableFor(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<{
    email: string; title: string; first_name: string; last_name: string; phone: string;
    role: string; study_level: string; nationality: Nationality;
  }>({
    email: "", title: "นาย", first_name: "", last_name: "", phone: "", // i18n-ignore
    role: "ta", study_level: "undergrad", nationality: "thai",
  });
  // Nationality only means something for a TA account.
  const foreign = form.role === "ta" && isForeign(form.nationality);
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Profile picture, staged locally until the account exists. There is no
  // user id to upload against until `submit()` returns one, so the cropped
  // blob just sits here — see the upload-after-create step in submit().
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null); // pre-crop, feeds AvatarCropper
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null); // post-crop, ready to upload
  const [photoPreview, setPhotoPreview] = useState<string | null>(null); // object URL for photoBlob

  useEffect(() => {
    if (open) {
      setForm({ email: "", title: "นาย", first_name: "", last_name: "", phone: "", role: "ta", study_level: "undergrad", nationality: "thai" }); // i18n-ignore
      setErr(null); setTempPassword(null); setShowErrors(false);
      setPickedPhoto(null); setPhotoBlob(null); setPhotoPreview(null);
    }
  }, [open]);

  // Revoke the previous object URL whenever it's replaced or the modal unmounts
  // — otherwise every re-crop leaks the last preview's memory.
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  function pickPhoto(f: File | undefined | null) {
    if (!f) return;
    if (!AVATAR_ACCEPT.split(",").includes(f.type)) {
      notify.error(t("รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP"));
      return;
    }
    if (f.size > AVATAR_MAX_PICK_BYTES) {
      notify.error(t("ไฟล์ใหญ่เกิน 12MB กรุณาเลือกไฟล์ที่เล็กกว่านี้"));
      return;
    }
    setPickedPhoto(f);
  }

  function confirmPhoto(blob: Blob) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(blob);
    setPhotoPreview(URL.createObjectURL(blob));
    setPickedPhoto(null);
  }

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
  // Only an ACTIVE account blocks the address (migration 0143): a closed one —
  // typically the account that was created wrong — keeps its history and lets
  // a fresh account take the same e-mail.
  const sameEmail = (emailMatches?.items ?? []).filter(u => u.email.toLowerCase() === debouncedEmail);
  const activeHolder = sameEmail.find(u => u.is_active);
  const emailTaken = !!activeHolder;
  const closedHolders = debouncedEmail === typedEmail ? sameEmail.filter(u => !u.is_active) : [];

  const errors = useMemo(() => ({
    email: vEmail(form.email) ??
      (emailTaken && debouncedEmail === typedEmail
        ? t("อีเมลนี้ผูกกับบัญชีที่เปิดใช้งานอยู่ ({name}) ต้องปิดบัญชีนั้นก่อน", { name: activeHolder ? formatFullName(activeHolder) : "" })
        : null),
    title: vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(t, form.first_name, msg("ชื่อ")),
    last_name: vName(t, form.last_name, msg("นามสกุล")),
    role: vSelect(form.role, ROLE_OPTIONS),
    study_level: form.role === "ta" ? vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)) : null,
    phone: vPhone(form.phone, foreign),
  }), [form, foreign, emailTaken, activeHolder, debouncedEmail, typedEmail, t]);
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
        nationality: form.role === "ta" ? form.nationality : undefined,
      };
      const res = await api.post<{ user: User; temp_password: string }>("/users", body);
      refreshUsers();
      // The account exists now, so the staged picture can finally go somewhere.
      // A failure here must not hide the temp password the user still needs —
      // it's reported alongside success, not in place of it.
      if (photoBlob) {
        try {
          const photoForm = new FormData();
          photoForm.append("file", photoBlob, "avatar.jpg");
          await api.upload(`/users/${res.user.id}/avatar`, photoForm);
        } catch (e) {
          notify.error(errMessage(e) || t("อัปโหลดรูปโปรไฟล์ไม่สำเร็จ ผู้ใช้ถูกสร้างแล้วและอัปโหลดรูปเองภายหลังได้"));
        }
      }
      setCreatedId(res.user.id);
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
      title={tempPassword ? t("สร้างผู้ใช้สำเร็จ") : t("สร้างผู้ใช้ใหม่")}
      size="lg"
      footer={
        tempPassword
          ? <Button variant="primary" onClick={onClose}>{t("ปิด")}</Button>
          : <>
              <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
              <Button variant="primary" onClick={submit}
                disabled={pending || (showErrors && hasErrors)}>{t("บันทึก")}</Button>
            </>
      }
    >
      {tempPassword ? (
        <TempPasswordPanel
          userId={createdId ?? ""}
          name={`${form.first_name} ${form.last_name}`.trim()}
          email={form.email}
          password={tempPassword}
          role={t(ROLE_LABEL[form.role] ?? form.role)}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <UserAvatar
                firstName={form.first_name}
                lastName={form.last_name}
                src={photoPreview}
                className="size-16 text-lg"
              />
              <Tip content={photoBlob ? t("เปลี่ยนรูปโปรไฟล์") : t("เพิ่มรูปโปรไฟล์")}><button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                aria-label={photoBlob ? t("เปลี่ยนรูปโปรไฟล์") : t("เพิ่มรูปโปรไฟล์")}
                className="absolute bottom-0 -end-0.5 size-6 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-sm ring-2 ring-surface hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Camera size={12} />
              </button></Tip>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">{t("รูปโปรไฟล์ (ไม่บังคับ)")}</div>
              <div className="text-xs text-muted mt-0.5">
                {t("JPEG, PNG, WebP ขนาดไม่เกิน 12MB — ครอบตัด/ซูม/หมุน/กลับด้านได้ก่อนบันทึก")}
              </div>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }}
            />
          </div>
          <VField
            label={t("อีเมล")} required type="email" placeholder="you@kkumail.com"
            value={form.email} onChange={v => setForm({ ...form, email: v })}
            error={errors.email} show={showErrors}
          />
          {!emailTaken && closedHolders.length > 0 && (
            <Alert
              status="accent"
              title={t("อีเมลนี้เคยใช้กับบัญชีที่ปิดไปแล้ว")}
              description={t("{names} (ปิดใช้งาน) บัญชีใหม่จะแยกจากบัญชีเดิม ข้อมูลเดิมยังอยู่ครบ และจะเปิดบัญชีเดิมกลับมาไม่ได้ตราบที่บัญชีใหม่ยังเปิดใช้งาน", { names: closedHolders.map(u => formatFullName(u)).join(", ") })}
            />
          )}
          {form.role === "ta" && (
            <>
              <NationalityPicker value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
              {foreign && (
                <p className="text-xs text-muted -mt-1">
                  {t("กรอกชื่อ-นามสกุลเป็นภาษาอังกฤษตาม Passport ส่วนคำนำหน้ายังใช้ นาย/นาง/นางสาว ตามแบบฟอร์มเจ้าหนี้ ผู้ช่วยสอนจะกรอกเลข Passport แทนเลขบัตรประชาชน (ใช้เป็นเลขพร้อมเพย์ในใบปะหน้าด้วย) และแนบสำเนา Passport แทนสำเนาบัตรประชาชน")}
                </p>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[140px_1fr_1fr]">
            <VSelect label={t("คำนำหน้า")} value={form.title}
              onChange={v => setForm({ ...form, title: v })}
              error={errors.title} show={showErrors}
            >
              {TITLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </VSelect>
            <VField label={foreign ? t("ชื่อ (ภาษาอังกฤษ)") : t("ชื่อ")} required value={form.first_name}
              onChange={v => setForm({ ...form, first_name: v })}
              error={errors.first_name} show={showErrors}
            />
            <VField label={foreign ? t("นามสกุล (ภาษาอังกฤษ)") : t("นามสกุล")} required value={form.last_name}
              onChange={v => setForm({ ...form, last_name: v })}
              error={errors.last_name} show={showErrors}
            />
          </div>
          <VField label={t("เบอร์โทรศัพท์")} type="tel" placeholder={foreign ? t("0812345678 หรือ 8613812345678") : "0812345678"}
            value={form.phone} onChange={v => setForm({ ...form, phone: onlyPhoneDigits(v, foreign) })}
            error={errors.phone} show={showErrors}
          />
          <div className="grid grid-cols-2 gap-3">
            <VSelect label={t("สิทธิ์การใช้งาน")} value={form.role}
              onChange={v => setForm({ ...form, role: v })}
              error={errors.role} show={showErrors}
            >
              <option value="staff">{t("เจ้าหน้าที่")}</option>
              <option value="lecturer">{t("อาจารย์")}</option>
              <option value="ta">{t("ผู้ช่วยสอน (TA)")}</option>
            </VSelect>
            {form.role === "ta" && (
              <VSelect label={t("ระดับการศึกษา")} value={form.study_level}
                onChange={v => setForm({ ...form, study_level: v })}
                error={errors.study_level} show={showErrors}
              >
                {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{t(l.label)}</option>)}
              </VSelect>
            )}
          </div>
          {form.role === "ta" && form.study_level === "undergrad" && (
            <p className="text-xs text-muted">
              {t("ไม่ต้องกรอกชั้นปี ระบบคำนวณจากรหัสนักศึกษาที่ผู้ช่วยสอนกรอกในแบบฟอร์มข้อมูลส่วนตัว (2 หลักแรกเทียบกับปีการศึกษาปัจจุบัน) และเลื่อนชั้นให้เองทุกปี")}
            </p>
          )}
          {err && <Alert status="danger" title={t("ไม่สามารถสร้างผู้ใช้ได้")} description={err} />}
        </div>
      )}
      <AvatarCropper
        file={pickedPhoto}
        open={!!pickedPhoto}
        onCancel={() => setPickedPhoto(null)}
        onConfirm={confirmPhoto}
      />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    email: user.email,
    title: user.title ?? "",
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone ?? "",
    nationality: (user.nationality ?? "thai") as Nationality,
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isTa = user.roles.includes("ta");
  const foreign = isTa && isForeign(form.nationality);
  const errors = useMemo(() => ({
    email: vEmail(form.email),
    title: form.title === "" ? null : vSelect(form.title, TITLE_OPTIONS),
    first_name: vName(t, form.first_name, msg("ชื่อ")),
    last_name: vName(t, form.last_name, msg("นามสกุล")),
    phone: vPhone(form.phone, foreign),
  }), [form, foreign, t]);
  const hasErrors = Object.values(errors).some(Boolean);

  // Photo edits upload immediately (the account already exists, unlike the
  // create form which has to stage the crop until it gets an id back) — same
  // endpoint added for the create flow, see internal/handler/avatar.go.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  // `user` is a snapshot taken when this modal opened — mutate() refetches
  // the table behind it, but won't push a new prop into an already-open
  // modal. Track the just-uploaded URL locally so the preview updates without
  // the admin having to close and reopen the form.
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);

  function pickPhoto(f: File | undefined | null) {
    if (!f) return;
    if (!AVATAR_ACCEPT.split(",").includes(f.type)) {
      notify.error(t("รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP"));
      return;
    }
    if (f.size > AVATAR_MAX_PICK_BYTES) {
      notify.error(t("ไฟล์ใหญ่เกิน 12MB กรุณาเลือกไฟล์ที่เล็กกว่านี้"));
      return;
    }
    setPickedPhoto(f);
  }

  async function confirmPhoto(blob: Blob) {
    setPhotoSaving(true);
    try {
      const photoForm = new FormData();
      photoForm.append("file", blob, "avatar.jpg");
      const res = await api.upload<{ avatar_url: string }>(`/users/${user.id}/avatar`, photoForm);
      setAvatarUrl(res.avatar_url);
      refreshUsers();
      setPickedPhoto(null);
      notify.success(t("บันทึกรูปโปรไฟล์แล้ว"));
    } catch (e) {
      notify.error(e);
    } finally {
      setPhotoSaving(false);
    }
  }

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
        // Only when changed: the server refuses any change once the TA's
        // documents are approved, and re-sending the same value must not
        // block an unrelated edit like a phone number.
        nationality: isTa && form.nationality !== (user.nationality ?? "thai") ? form.nationality : undefined,
        // Roles are deliberately never sent from here — see the read-only
        // "สิทธิ์การใช้งาน" field below for why.
        // study_level is deliberately NOT sent here — changing it now goes
        // through the "ประวัติการศึกษา" action (EnrollmentHistoryModal) only,
        // so every level change is captured in ta_enrollments. See that
        // modal's comment for why this form no longer edits it at all.
        // study_year is not sent either: it is derived from the student id
        // on every read (UserService.applyDerivedStudyYear), so a typed value
        // would only go stale when the TA moves up a year.
      });
      refreshUsers();
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
      title={t("แก้ไขข้อมูลผู้ใช้")}
      size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
        <Button variant="primary" onClick={submit}
          disabled={pending || (showErrors && hasErrors)}>{t("บันทึกการแก้ไข")}</Button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted mb-2">{t("ข้อมูลทั่วไป")}</div>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <UserAvatar
                  firstName={form.first_name}
                  lastName={form.last_name}
                  src={avatarUrl}
                  className="size-16 text-lg"
                />
                <Tip content={avatarUrl ? t("เปลี่ยนรูปโปรไฟล์") : t("เพิ่มรูปโปรไฟล์")}><button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label={avatarUrl ? t("เปลี่ยนรูปโปรไฟล์") : t("เพิ่มรูปโปรไฟล์")}
                  className="absolute bottom-0 -end-0.5 size-6 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-sm ring-2 ring-surface hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Camera size={12} />
                </button></Tip>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground">{t("รูปโปรไฟล์")}</div>
                <div className="text-xs text-muted mt-0.5">
                  {t("JPEG, PNG, WebP ขนาดไม่เกิน 12MB — ครอบตัด/ซูม/หมุน/กลับด้านได้ก่อนบันทึก")}
                </div>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="hidden"
                onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
            <VField label={t("อีเมล")} required type="email"
              value={form.email} onChange={v => setForm({ ...form, email: v })}
              error={errors.email} show={showErrors}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[140px_1fr_1fr]">
              <VSelect label={t("คำนำหน้า")} value={form.title}
                onChange={v => setForm({ ...form, title: v })}
                error={errors.title} show={showErrors}
              >
                <option value="">-</option>
                {TITLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </VSelect>
              <VField label={foreign ? t("ชื่อ (ภาษาอังกฤษ)") : t("ชื่อ")} required value={form.first_name}
                onChange={v => setForm({ ...form, first_name: v })}
                error={errors.first_name} show={showErrors}
              />
              <VField label={foreign ? t("นามสกุล (ภาษาอังกฤษ)") : t("นามสกุล")} required value={form.last_name}
                onChange={v => setForm({ ...form, last_name: v })}
                error={errors.last_name} show={showErrors}
              />
            </div>
            <VField label={t("เบอร์โทรศัพท์")} type="tel" placeholder={foreign ? t("0812345678 หรือ 8613812345678") : "0812345678"}
              value={form.phone} onChange={v => setForm({ ...form, phone: onlyPhoneDigits(v, foreign) })}
              error={errors.phone} show={showErrors}
            />
            {isTa && (
              <div>
                <NationalityPicker value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
                <div className="text-xs text-muted mt-1.5">
                  {t("เปลี่ยนได้จนกว่าเอกสารของผู้ช่วยสอนจะอนุมัติ เพราะชุดเอกสารที่ต้องส่งเปลี่ยนตามสัญชาติ")}
                </div>
              </div>
            )}
            {/* Read-only by design: reassigning a role is a security-sensitive
                action (it can grant admin/staff access), so it does not belong
                in a general-purpose edit form where it is easy to change by
                accident alongside a phone number or title. There is currently
                no supported way to change a role after creation — recreate the
                account under the new role if one is genuinely needed. */}
            <div>
              <div className="text-sm text-foreground mb-1.5">{t("สิทธิ์การใช้งาน")}</div>
              <div className="flex gap-1 flex-wrap">
                {user.roles.map(r => <Chip key={r} tone="neutral">{t(ROLE_LABEL[r] ?? r)}</Chip>)}
              </div>
              <div className="text-xs text-muted mt-1.5">
                {t("เปลี่ยนบทบาทหลังสร้างบัญชีไม่ได้ — หากต้องการเปลี่ยน ให้สร้างบัญชีใหม่ด้วยบทบาทที่ถูกต้อง")}
              </div>
            </div>
            {/* สิทธิ์ผู้บริหารไม่ได้ติ๊กตรงนี้อีกต่อไป — มาจากการถือตำแหน่งฝ่ายบริหาร
                ที่ยังเปิดใช้งานอยู่ (หน้า "ตั้งค่า > ฝ่ายบริหาร") เท่านั้น ที่นี่แสดง
                ผลลัพธ์ให้ดูอย่างเดียวเพื่อไม่ให้สับสนว่าทำไมช่องติ๊กหายไป */}
            {user.is_executive && (
              <div className="text-sm rounded-lg border border-border bg-surface px-3 py-2.5">
                <span className="font-medium">{t("สิทธิ์ผู้บริหาร: มี")}</span>
                <span className="block text-xs text-muted mt-0.5">
                  {t("มาจากการดำรงตำแหน่งฝ่ายบริหารที่เปิดใช้งานอยู่ — จัดการที่หน้า \"ตั้งค่า > ฝ่ายบริหาร\"")}
                </span>
              </div>
            )}
            {isTa && (
              <div className="text-sm rounded-lg border border-border bg-surface px-3 py-2.5">
                <span className="text-muted">{t("ระดับการศึกษาปัจจุบัน:")} </span>
                <span className="font-medium">{levelLabel(t, user)}</span>
                <span className="block text-xs text-muted mt-0.5">
                  {t("เลื่อนระดับ (ตรี → โท → เอก) ใช้ปุ่ม \"ประวัติการศึกษา\" ในตาราง ส่วนรหัสที่กรอกผิด แก้ได้ในหัวข้อด้านล่าง")}
                </span>
              </div>
            )}
            {isTa && <TAIdentityFix userId={user.id} />}
          </div>
        </div>

        {/* ข้อมูลบัญชีธนาคารถูกถอดออก — ระบบไม่จัดเก็บลงฐานข้อมูลแล้ว (PDPA,
            migration 0047) เจ้าหน้าที่ดูจากไฟล์แบบฟอร์มเจ้าหนี้ที่ TA ส่งมา
            ในหน้า "ตรวจสอบแบบฟอร์มใบแจ้งหนี้" แทน */}

        {err && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={err} />}
      </div>
      <AvatarCropper
        file={pickedPhoto}
        open={!!pickedPhoto}
        isSaving={photoSaving}
        onCancel={() => { if (!photoSaving) setPickedPhoto(null); }}
        onConfirm={confirmPhoto}
      />
    </Modal>
  );
}

/**
 * Staff fix of what a TA typed wrong on their own profile form: the TA comes to
 * the office with their card, staff correct it here. Not a level change — that
 * opens a new period through "ประวัติการศึกษา". The citizen ID is never shown
 * back in full; the last 4 digits are enough to compare against the card.
 */
function TAIdentityFix({ userId }: { userId: string }) {
  const { t } = useI18n();
  const key = `/users/${userId}/ta-identity`;
  const { data } = useSWR<{
    student_id: string | null; prefix: string | null; citizen_id_last4: string | null; has_profile: boolean;
    foreign?: boolean;
  }>(key);
  // A foreign TA's stored number is their passport number (0151).
  const foreign = !!data?.foreign;
  const idLabel = foreign ? t("เลข Passport") : t("เลขบัตรประชาชน");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: "", national_id: "", prefix: "", reason: "", password: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Named for the Thai case; for a foreign TA it holds the passport number.
  const nidDigits = foreign ? passportNumber(form.national_id) : form.national_id.replace(/\D/g, "");
  // The creditor form prints the prefix and the citizen ID, so correcting
  // either rebuilds it — and the rebuilt file carries the full ID and bank
  // details, hence the officer's own password, like every such download.
  const rebuildsForm = !!data?.has_profile && (nidDigits !== "" || form.prefix !== "");
  const errors = {
    student_id: form.student_id.trim() === "" ? null : vStudentID(form.student_id),
    national_id: nidDigits === "" ? null
      : foreign ? passportError(nidDigits)
      : nidDigits.length === 13 ? null : t("เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"),
    reason: vRequired(form.reason, msg("กรุณาระบุเหตุผล เช่น ผู้ช่วยสอนแสดงบัตรนักศึกษาที่ห้องธุรการ")),
    nothing: form.student_id.trim() === "" && nidDigits === "" && form.prefix === "" ? msg("กรอกอย่างน้อย 1 ช่องที่ต้องการแก้") : null,
    password: rebuildsForm && form.password === "" ? msg("กรอกรหัสผ่านของคุณเพื่อดาวน์โหลดแบบฟอร์มเจ้าหนี้ฉบับใหม่") : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  async function rebuildCreditorForm(password: string) {
    const pdf = await api.post<Blob>(`/users/${userId}/creditor-form/regenerate`, { password });
    const url = URL.createObjectURL(pdf);
    const a = document.createElement("a");
    a.href = url;
    a.download = `แบบแจ้งเจ้าหนี้-${data?.student_id ?? userId}.pdf`; // i18n-ignore — the official form's file name
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify.success(t("สร้างแบบฟอร์มเจ้าหนี้ฉบับใหม่และดาวน์โหลดแล้ว"));
  }

  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPw, setRegenPw] = useState("");
  const [regenErr, setRegenErr] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  async function regenOnly() {
    if (!regenPw) { setRegenErr(t("กรอกรหัสผ่านของคุณ")); return; }
    setRegenPending(true); setRegenErr(null);
    try {
      await rebuildCreditorForm(regenPw);
      setRegenOpen(false); setRegenPw("");
    } catch (e) {
      setRegenErr(errMessage(e));
    } finally {
      setRegenPending(false);
    }
  }

  async function save() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      await api.post(key, {
        student_id: form.student_id.trim() || undefined,
        national_id: nidDigits || undefined,
        prefix: form.prefix || undefined,
        reason: form.reason.trim(),
      });
      await mutate(key);
      refreshUsers();
      notify.success(t("แก้ไขข้อมูลผู้ช่วยสอนแล้ว และแจ้งผู้ช่วยสอนแล้ว"));
      if (rebuildsForm) {
        try {
          await rebuildCreditorForm(form.password);
        } catch (e) {
          // The correction itself is saved; only the rebuild failed — the
          // separate "สร้างแบบฟอร์มเจ้าหนี้ใหม่" button retries it.
          notify.error(t("บันทึกการแก้ไขแล้ว แต่สร้างแบบฟอร์มเจ้าหนี้ใหม่ไม่สำเร็จ: {error}", { error: errMessage(e) }));
        }
      }
      setForm({ student_id: "", national_id: "", prefix: "", reason: "", password: "" });
      setShowErrors(false);
      setOpen(false);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">{t("ข้อมูลที่ผู้ช่วยสอนกรอก")}</div>
          <div className="text-xs text-muted mt-0.5">
            {t("รหัสนักศึกษา {sid} · คำนำหน้า {prefix} · {idLabel} {last4}", {
              sid: data?.student_id ?? "-",
              prefix: data?.prefix ?? "-",
              idLabel,
              last4: data?.citizen_id_last4 ? t("ลงท้าย {n}", { n: data.citizen_id_last4 }) : "-",
            })}
          </div>
        </div>
        {!open && (
          <div className="flex flex-wrap gap-1 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <Pencil size={14} /> {t("แก้ข้อมูลที่กรอกผิด")}
            </Button>
            {data?.has_profile && !regenOpen && (
              <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}>
                <Files size={14} /> {t("สร้างแบบฟอร์มเจ้าหนี้ใหม่")}
              </Button>
            )}
          </div>
        )}
      </div>
      {!open && regenOpen && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {t("สร้างแบบฟอร์มเจ้าหนี้ใหม่จากฉบับที่ผู้ช่วยสอนเซ็นไว้ โดยใช้คำนำหน้า ชื่อ-นามสกุล และเลขบัตรปัจจุบันในระบบ (ข้อมูลธนาคารและลายเซ็นคงเดิม) แทนฉบับเก่า แล้วดาวน์โหลดทันที")}
          </p>
          <VField label={t("รหัสผ่านของคุณ (ยืนยันก่อนดาวน์โหลด)")} type="password" required
            value={regenPw} onChange={setRegenPw} error={regenErr} show={!!regenErr}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setRegenOpen(false); setRegenPw(""); setRegenErr(null); }}>{t("ยกเลิก")}</Button>
            <Button variant="primary" size="sm" onClick={regenOnly} disabled={regenPending} isPending={regenPending}>{t("สร้างและดาวน์โหลด")}</Button>
          </div>
        </div>
      )}
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {t("เว้นว่างช่องที่ไม่ต้องแก้ ใช้เมื่อผู้ช่วยสอนกรอกผิดและมาแสดงหลักฐานที่ห้องธุรการ การแก้รหัสนักศึกษาจะแก้ในทุกคำขอ TA ของช่วงการศึกษาปัจจุบันด้วย")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-3">
            <VField label={t("รหัสนักศึกษาที่ถูกต้อง")} placeholder="XXXXXXXXX-X"
              value={form.student_id} onChange={v => setForm({ ...form, student_id: formatStudentID(v) })}
              error={errors.student_id} show={showErrors}
            />
            <VField label={foreign ? t("เลข Passport ที่ถูกต้อง") : t("เลขบัตรประชาชนที่ถูกต้อง")} placeholder={foreign ? t("เช่น AB1234567") : t("13 หลัก")}
              value={form.national_id} onChange={v => setForm({ ...form, national_id: foreign ? passportNumber(v) : v.replace(/[^\d-]/g, "").slice(0, 17) })}
              error={errors.national_id} show={showErrors}
            />
            <VSelect label={t("คำนำหน้า")} value={form.prefix}
              onChange={v => setForm({ ...form, prefix: v })} error={null} show={false}
            >
              <option value="">{t("ไม่แก้")}</option>
              {/* i18n-ignore-next-line — the prefix as stored and printed on the creditor form */}
              <option value="นาย">นาย</option>
              {/* i18n-ignore-next-line */}
              <option value="นาง">นาง</option>
              {/* i18n-ignore-next-line */}
              <option value="นางสาว">นางสาว</option>
            </VSelect>
          </div>
          {data && !data.has_profile && (form.national_id || form.prefix) && (
            <Alert status="warning" title={t("ยังไม่มีแบบฟอร์มข้อมูลส่วนตัว")}
              description={t("ผู้ช่วยสอนยังไม่เคยส่งแบบฟอร์ม จึงแก้เลขบัตรหรือคำนำหน้าไม่ได้ (แก้รหัสนักศึกษาได้)")} />
          )}
          <VField label={t("เหตุผล (บันทึกในประวัติการใช้งานและแจ้งผู้ช่วยสอน)")} required
            value={form.reason} onChange={v => setForm({ ...form, reason: v })}
            error={errors.reason ?? errors.nothing} show={showErrors}
          />
          {rebuildsForm && (
            <>
              <p className="text-xs text-muted">
                {t("เลขบัตรและคำนำหน้าอยู่ในแบบฟอร์มเจ้าหนี้ ระบบจะสร้างแบบฟอร์มฉบับใหม่จากฉบับที่ผู้ช่วยสอนเซ็นไว้ (ข้อมูลธนาคารและลายเซ็นคงเดิม) แทนฉบับเก่าในระบบ และดาวน์โหลดให้ทันที")}
              </p>
              <VField label={t("รหัสผ่านของคุณ (ยืนยันก่อนดาวน์โหลด)")} type="password" required
                value={form.password} onChange={v => setForm({ ...form, password: v })}
                error={errors.password} show={showErrors}
              />
            </>
          )}
          {err && <Alert status="danger" title={t("แก้ไขไม่สำเร็จ")} description={err} />}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setErr(null); setShowErrors(false); setForm(f => ({ ...f, password: "" })); }}>{t("ยกเลิก")}</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={pending} isPending={pending}>{t("บันทึกการแก้ไข")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * History (view-only) + "record a level transition" for one TA's
 * ta_enrollments (migration 0094). This is the ONLY place staff change a
 * TA's student_id/study_level after their first profile submission —
 * EditUserModal above deliberately no longer edits study_level, so every
 * later change is captured here instead of silently overwriting
 * users.study_level with no history. Submitting closes the TA's current
 * active period and opens a new one in the same backend transaction
 * (EnrollmentService.RecordTransition) — there is no separate "close" step.
 */
interface ClassBlockRow {
  id?: string;
  course_code?: string;
  course_name?: string;
  course_label?: string;
  kind?: string;
  sec_no?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  note?: string;
  is_wba?: boolean;
}

const DAY_TH = [msg("อาทิตย์"), msg("จันทร์"), msg("อังคาร"), msg("พุธ"), msg("พฤหัสบดี"), msg("ศุกร์"), msg("เสาร์")];

/**
 * Staff correction of a TA's own timetable. Once a TA has an approved request
 * in a term, the TA may only ADD classes (removing one would win back periods
 * the decision trimmed), and the save error tells them to contact staff — this
 * is where staff do it. The save goes through PUT /users/:id/schedule, audited
 * under the staff member, and re-runs pending request decisions like a TA save.
 */
function TimetableCorrectionModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState("");
  useEffect(() => {
    if (!termId && terms?.length) setTermId((terms.find(t => t.is_active) ?? terms[0]).id);
  }, [terms, termId]);
  const key = termId ? `/users/${user.id}/schedule?term_id=${termId}` : null;
  const { data, isLoading } = useSWR<{ blocks: ClassBlockRow[]; locked: boolean; lock_reason: string }>(key);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  useEffect(() => { setRemoved(new Set()); }, [key]);

  const blocks = data?.blocks ?? [];
  const hhmm = (t: string) => t.slice(0, 5);

  async function save() {
    if (!key) return;
    setPending(true);
    try {
      await api.put(key, blocks.filter((_, i) => !removed.has(i)));
      await mutate(key);
      notify.success(t("บันทึกตารางเรียนของผู้ช่วยสอนแล้ว"));
      onClose();
    } catch (e) {
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("ตารางเรียนของ {name}", { name: formatFullName(user) })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
          <Button variant="primary" onClick={save} disabled={pending || removed.size === 0 || !!data?.locked}>
            {t("บันทึกการแก้ไข")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TermSelect terms={terms} value={termId} onChange={setTermId} className="w-48" />
        <p className="text-sm text-muted">
          {t("ใช้เมื่อตารางเรียนของผู้ช่วยสอนเปลี่ยนจริง (เช่น ถอนวิชา) หลังคำขอ TA ได้รับอนุมัติแล้ว ผู้ช่วยสอนเพิ่มคาบเองได้ แต่ลบหรือลดคาบเองไม่ได้ การบันทึกที่นี่จะถูกบันทึกในประวัติการใช้งาน")}
        </p>
        {data?.locked && <Alert status="warning" title={t("แก้ไขไม่ได้")} description={data.lock_reason} />}
        {isLoading ? (
          <SkelList />
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted">{t("ยังไม่มีตารางเรียนในภาคเรียนนี้")}</p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)]">
            {blocks.map((b, i) => {
              const gone = removed.has(i);
              return (
                <li key={i} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${gone ? "opacity-50 line-through" : ""}`}>
                  <span>
                    {b.is_wba ? t("WBA (ไม่มีตารางเรียน)") : (
                      t.rich("{code} {name} วัน{day} {start}–{end} น.", {
                        code: <b>{b.course_code || b.course_label}</b>,
                        name: b.course_name,
                        day: DAY_TH[b.day_of_week] ? t(DAY_TH[b.day_of_week]) : b.day_of_week,
                        start: hhmm(b.start_time),
                        end: hhmm(b.end_time),
                      })
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!data?.locked}
                    onClick={() => setRemoved(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    })}
                  >
                    <Trash2 size={14} /> {gone ? t("เลิกลบ") : t("ลบคาบนี้")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function EnrollmentHistoryModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t, intl } = useI18n();
  const key = `/users/${user.id}/enrollments`;
  const { data, isLoading, error } = useSWR<{ items: Enrollment[] }>(key);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ student_id: "", study_level: "undergrad", note: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const errors = useMemo(() => ({
    student_id: vStudentID(form.student_id),
    study_level: vSelect(form.study_level, STUDY_LEVELS.map(l => l.value)),
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      await api.post(`/users/${user.id}/enrollments`, {
        student_id: form.student_id.trim(),
        study_level: form.study_level,
        note: form.note.trim() || undefined,
      });
      mutate(key);
      // The table's "ระดับ"/"รหัสนักศึกษา" columns read users.student_id/
      // study_level, which RecordTransition just kept in sync — refresh them.
      refreshUsers();
      setForm({ student_id: "", study_level: "undergrad", note: "" });
      setShowErrors(false);
      setAdding(false);
    } catch (e) {
      setErr((e as Error).message);
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={t("ประวัติการศึกษา — {name}", { name: formatFullName(user) })}
      size="lg"
      footer={<Button variant="ghost" onClick={onClose}>{t("ปิด")}</Button>}
    >
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted mb-2">{t("ช่วงการศึกษาที่ผ่านมา")}</div>
          {isLoading ? (
            <SkelList items={2} icon={false} bordered />
          ) : error ? (
            <Alert status="danger" title={t("โหลดประวัติไม่สำเร็จ")} description={errMessage(error)} />
          ) : items.length === 0 ? (
            <div className="text-sm text-muted">{t("ยังไม่มีประวัติ")}</div>
          ) : (
            <div className="space-y-2">
              {items.map(e => (
                <div key={e.id} className="rounded-lg border border-border px-3 py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {e.student_id} — {t(STUDY_LEVELS.find(l => l.value === e.study_level)?.label ?? e.study_level)}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(e.started_at).toLocaleDateString(intl)}
                      {" – "}
                      {e.ended_at ? new Date(e.ended_at).toLocaleDateString(intl) : t("ปัจจุบัน")}
                    </div>
                    {e.note && <div className="text-xs text-muted mt-0.5">{e.note}</div>}
                  </div>
                  {!e.ended_at && <Chip tone="success">active</Chip>}
                </div>
              ))}
            </div>
          )}
        </div>

        {adding ? (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="text-xs text-muted">
              {t("บันทึกการเปลี่ยนระดับ — ช่วงเดิมที่ยัง active อยู่จะถูกปิดโดยอัตโนมัติ")}
            </div>
            <VField label={t("รหัสนักศึกษาใหม่")} required placeholder="XXXXXXXXX-X"
              value={form.student_id} onChange={v => setForm({ ...form, student_id: formatStudentID(v) })}
              error={errors.student_id} show={showErrors}
            />
            <VSelect label={t("ระดับการศึกษาใหม่")} value={form.study_level}
              onChange={v => setForm({ ...form, study_level: v })}
              error={errors.study_level} show={showErrors}
            >
              {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{t(l.label)}</option>)}
            </VSelect>
            <FieldGroup label={t("หมายเหตุ (ถ้ามี)")}>
              <TextArea rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </FieldGroup>
            {err && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={err} />}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>{t("ยกเลิก")}</Button>
              <Button variant="primary" onClick={submit} disabled={pending || (showErrors && hasErrors)}>
                {t("บันทึก")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> {t("บันทึกการเปลี่ยนระดับ")}
          </Button>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
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
      title={pw ? t("รีเซ็ตรหัสผ่านสำเร็จ") : t("ยืนยันการรีเซ็ตรหัสผ่าน")}
      size="md"
      footer={pw
        ? <Button variant="primary" onClick={onClose}>{t("ปิด")}</Button>
        : <>
            <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
            <Button variant="primary" onClick={submit} disabled={pending}>{t("รีเซ็ตรหัสผ่าน")}</Button>
          </>}
    >
      {pw ? (
        <TempPasswordPanel
          userId={user.id}
          name={`${user.first_name} ${user.last_name}`.trim()}
          email={user.email}
          password={pw}
          role={user.roles.map(r => t(ROLE_LABEL[r] ?? r)).join(", ")}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {t.rich("ระบบจะสร้างรหัสผ่านชั่วคราวใหม่ให้กับ {name} ({email}) และจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งถัดไป", {
              name: <span className="font-medium">{user.first_name} {user.last_name}</span>,
              email: user.email,
            })}
          </p>
          {err && <Alert status="danger" title={t("รีเซ็ตไม่สำเร็จ")} description={err} />}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function DeactivateModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showError, setShowError] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailError = useMemo<string | null>(() => {
    if (!confirmEmail.trim()) return msg("กรุณากรอกอีเมลเพื่อยืนยัน");
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase())
      return msg("อีเมลไม่ตรงกับบัญชีที่จะปิดใช้งาน");
    return null;
  }, [confirmEmail, user.email]);

  async function submit() {
    setShowError(true);
    if (emailError) return;
    setPending(true); setErr(null);
    try {
      await api.post(`/users/${user.id}/deactivate`, { confirm_email: confirmEmail });
      refreshUsers();
      notify.success(t("ปิดใช้งานบัญชีเรียบร้อยแล้ว"));
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
      title={t("ปิดการใช้งานบัญชี")}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("ยกเลิก")}</Button>
        <Button variant="danger" onClick={submit} disabled={pending || !!emailError}>
          {t("ยืนยันการปิดใช้งาน")}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          {t.rich("บัญชีของ {name} จะไม่สามารถเข้าใช้งานระบบได้อีก กรุณากรอกอีเมลของผู้ใช้งานเพื่อยืนยัน", {
            name: <span className="font-medium">{user.first_name} {user.last_name}</span>,
          })}
        </p>
        <VField
          label={t.rich("พิมพ์ {email} เพื่อยืนยัน", { email: <code className="text-xs">{user.email}</code> })}
          required autoFocus placeholder={user.email}
          value={confirmEmail}
          onChange={v => { setConfirmEmail(v); setShowError(true); }}
          error={emailError} show={showError}
        />
        {err && <Alert status="danger" title={t("ปิดใช้งานไม่สำเร็จ")} description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ReactivateModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // One address, one ACTIVE account (migration 0143). Say so before the click
  // instead of letting the request bounce; the server refuses it either way.
  const { data: sameEmail } = useSWR<{ items: User[] }>(
    `/users?q=${encodeURIComponent(user.email)}&status=active&limit=5`,
  );
  const otherActive = sameEmail?.items?.find(
    u => u.id !== user.id && u.is_active && u.email.toLowerCase() === user.email.toLowerCase(),
  );

  async function submit() {
    setPending(true); setErr(null);
    try {
      await api.post(`/users/${user.id}/activate`);
      refreshUsers();
      notify.success(t("เปิดใช้งานบัญชีเรียบร้อยแล้ว"));
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
      title={t("เปิดใช้งานบัญชี")}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>{t("ยกเลิก")}</Button>
        <Button variant="primary" onClick={submit} disabled={pending || !!otherActive} isPending={pending}>
          <UserCheck size={14} /> {t("เปิดใช้งาน")}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          {t.rich("เปิดใช้งานบัญชีของ {name} ({email}) อีกครั้ง ผู้ใช้จะสามารถเข้าสู่ระบบได้ตามปกติ", {
            name: <span className="font-medium">{user.first_name} {user.last_name}</span>,
            email: user.email,
          })}
        </p>
        {otherActive && (
          <Alert
            status="warning"
            title={t("ต้องปิดอีกบัญชีก่อน")}
            description={t("อีเมลนี้ผูกกับบัญชีที่เปิดใช้งานอยู่แล้ว ({name}) อีเมลหนึ่งเปิดใช้งานได้ครั้งละ 1 บัญชี กรุณาปิดบัญชีนั้นก่อนจึงจะเปิดบัญชีนี้ได้", { name: formatFullName(otherActive) })}
          />
        )}
        {err && <Alert status="danger" title={t("เปิดใช้งานไม่สำเร็จ")} description={err} />}
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
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setPending(true); setErr(null);
    try {
      const res = await api.post<{ was_locked: boolean }>(`/users/${user.id}/unlock-password-gate`);
      notify.success(res.was_locked
        ? t("ปลดล็อกเรียบร้อยแล้ว ผู้ใช้ยืนยันรหัสผ่านได้ทันที")
        : t("บัญชีนี้ไม่ได้ถูกล็อกอยู่ จึงไม่มีอะไรต้องปลด"));
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
      title={t("ปลดล็อกการยืนยันรหัสผ่าน")}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>{t("ยกเลิก")}</Button>
        <Button variant="primary" onClick={submit} disabled={pending} isPending={pending}>
          <LockOpen size={14} /> {t("ปลดล็อก")}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          {t.rich("ล้างการนับรหัสผ่านผิดของ {name} ({email}) เพื่อให้กลับมายืนยันตัวตนตอนดาวน์โหลดเอกสารหรือแก้ไขเวลาปฏิบัติงานได้ทันที โดยไม่ต้องรอจนครบ 15 นาที", {
            name: <span className="font-medium">{user.first_name} {user.last_name}</span>,
            email: user.email,
          })}
        </p>
        <p className="text-sm text-(--ink-3)">
          {t.rich("การดำเนินการนี้ {notChange} ของผู้ใช้ หากผู้ใช้จำรหัสผ่านไม่ได้ ให้ใช้ “รีเซ็ตรหัส” แทน ทั้งนี้ระบบจะบันทึกผู้ปลดล็อกไว้ในประวัติการใช้งาน", {
            notChange: <span className="font-medium">{t("ไม่เปลี่ยนรหัสผ่าน")}</span>,
          })}
        </p>
        {err && <Alert status="danger" title={t("ปลดล็อกไม่สำเร็จ")} description={err} />}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

// Admin, or staff for TA/lecturer accounts (see canReset2FA above). Requires
// the ACTING officer's own password, unlike
// UnlockPasswordGateModal above — resetting 2FA removes a security control
// entirely, not just a temporary rate-limit, so it gets the stronger gate.
function Reset2FAModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!password) {
      setErr(t("กรุณากรอกรหัสผ่านของคุณเพื่อยืนยัน"));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await mfaAdminReset(user.id, password);
      notify.success(t("รีเซ็ต 2FA ของ {name} แล้ว", { name: `${user.first_name} ${user.last_name}` }));
      refreshUsers();
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
      title={t("รีเซ็ต 2FA")}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>{t("ยกเลิก")}</Button>
        <Button variant="danger" onClick={submit} disabled={pending} isPending={pending}>
          <ShieldOff size={14} /> {t("รีเซ็ต 2FA")}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm">
          {t.rich("ล้างการยืนยันตัวตนสองขั้นตอนของ {name} ({email}) ผู้ใช้จะเข้าสู่ระบบด้วยรหัสผ่านเพียงอย่างเดียว และต้องตั้งค่า 2FA ใหม่", {
            name: <span className="font-medium">{user.first_name} {user.last_name}</span>,
            email: user.email,
          })}
        </p>
        <p className="text-sm text-(--ink-3)">
          {t("ใช้เมื่อผู้ใช้ทำอุปกรณ์ยืนยันตัวตนหายและไม่มีรหัสสำรองเหลืออยู่")}
        </p>
        <VField
          label={t("รหัสผ่านของคุณ (ยืนยันตัวตน)")}
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

function TempPasswordPanel({ userId, name, email, password, role }: { userId: string; name: string; email: string; password: string; role?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(
        `Name: ${name}\nEmail: ${email}\n${role ? `Role: ${role}\n` : ""}Password: ${password}`
      );
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch { /* noop */ }
  }
  return (
    <div className="space-y-3">
      <Alert
        status="success"
        title={t("รหัสผ่านชั่วคราวถูกสร้างแล้ว")}
        description={t("โปรดคัดลอกหรือส่งทางอีเมลให้ผู้ใช้งาน ระบบจะบังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งแรก รหัสนี้จะไม่แสดงอีกครั้ง")}
      />
      <div>
        <div className="text-xs text-muted mb-1">{t("อีเมล")}</div>
        <div className="text-sm font-mono">{email}</div>
      </div>
      {role && (
        <div>
          <div className="text-xs text-muted mb-1">{t("บทบาท")}</div>
          <div className="text-sm">{role}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-muted mb-1">{t("รหัสผ่านชั่วคราว")}</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-md bg-default text-sm font-mono select-all">
            {password}
          </code>
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy size={14} /> {copied ? t("คัดลอกแล้ว") : t("คัดลอก")}
          </Button>
        </div>
      </div>
      <Button variant="primary" size="sm" className="w-full" onClick={copyAll}>
        <Files size={14} /> {copiedAll ? t("คัดลอกแล้ว") : t("คัดลอกอีเมลและรหัสผ่าน")}
      </Button>
      {userId && <SendCredentialsButton userId={userId} email={email} password={password} />}
    </div>
  );
}
