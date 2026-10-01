"use client";
import {
  AlertTriangle, Info, PartyPopper, Newspaper, Radio,
} from "lucide-react";
import type { Attachment } from "../../components/AttachmentGallery";
import { Chip } from "../../components/ui";

// ============================================================================
// Types
// ============================================================================

export type Category = "info" | "news" | "warning" | "urgent" | "event";
export type Status = "draft" | "scheduled" | "live" | "expired";

export interface Recipient {
  email: string;
  name?: string;
  user_id?: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  sent_at?: string | null;
  read_at?: string | null;
  error?: string;
}

export interface Ann {
  id: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_key?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  announced_at?: string | null;
  reminded_at?: string | null;
  created_at?: string;
  updated_at?: string;
  status: Status;
  is_public?: boolean;
  target_course_ids?: string[];
  target_user_ids?: string[];
  target_filters?: string[];
  /** Names behind the target ids. Filled by /announcements/:id only. */
  target_courses?: { id: string; code: string; name: string }[];
  target_users?: PickedUser[];
  /** Ledger totals. The list carries them; /announcements/:id adds the rows. */
  audience_count?: number;
  failed_count?: number;
  pending_count?: number;
  read_count?: number;
  recipients?: Recipient[];
  attachments?: Attachment[];
}

export interface PickedUser { id: string; name: string; email: string }

export interface AudiencePreview {
  total: number;
  everyone: boolean;
  empty: boolean;
  names: PickedUser[];
}

/** Children take the state setter itself: several of them update from async
 *  callbacks (uploads), where a captured `draft` would be stale by the time it
 *  lands and would overwrite whatever was typed in the meantime. Every write
 *  therefore goes through the functional form, `setDraft(d => …)`. */
export type SetDraft = React.Dispatch<React.SetStateAction<Draft>>;

export interface Draft {
  id?: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_key: string | null;
  cover_image_url: string | null;
  /** When it goes out. Saving as a draft is a button, not a third mode. */
  when: "now" | "scheduled";
  publishDate: string; // YYYY-MM-DD
  publishTime: string; // HH:MM
  expires: boolean;
  expireDate: string;
  expireTime: string;
  /** published_at of the row being edited, kept so that editing a live
   *  announcement does not move its publish time to "now". */
  originalPublishedAt?: string | null;
  /** Status of the row being edited; undefined for a new one. */
  originalStatus?: Status;
  isPublic: boolean;
  targetUsers: PickedUser[];
  targetCourses: { id: string; label: string }[];
  targetFilters: string[];
  attachments: Attachment[];
}

export const emptyDraft: Draft = {
  title: "",
  body: "",
  category: "info",
  // Nothing ticked: who it goes to is a decision, not a default. The three
  // roles used to be pre-ticked, so a notice written for one course went to
  // everybody unless the officer remembered to untick them.
  audience: [],
  pinned: false,
  cover_image_key: null,
  cover_image_url: null,
  when: "now",
  publishDate: "",
  publishTime: "",
  expires: false,
  expireDate: "",
  expireTime: "",
  originalPublishedAt: null,
  isPublic: false,
  targetUsers: [],
  targetCourses: [],
  targetFilters: [],
  attachments: [],
};

// ============================================================================
// Constants
// ============================================================================

export const ROLES = [
  { value: "ta",       label: "ผู้ช่วยสอน" },
  { value: "lecturer", label: "อาจารย์" },
  { value: "staff",    label: "เจ้าหน้าที่" },
  { value: "admin",    label: "ผู้ดูแลระบบ" },
] as const;

export const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label ?? r;

// Category metadata drives icon, chip tone, and the mailer prefix on the
// backend. Keep the value list in sync with backend `validCategories`.
export const CATEGORIES: {
  value: Category; label: string; icon: React.ReactNode;
  tone: "info" | "success" | "warn" | "danger" | "brand"; description: string;
}[] = [
  { value: "info",    label: "ข้อมูลทั่วไป", icon: <Info size={14} />,        tone: "info",   description: "ข่าวสารทั่วไปที่ต้องการให้ทราบ" },
  { value: "news",    label: "ข่าวประชาสัมพันธ์", icon: <Newspaper size={14} />, tone: "brand",  description: "ข่าวใหม่หรือประกาศจากคณะ/สาขา" },
  { value: "event",   label: "กิจกรรม / อบรม",  icon: <PartyPopper size={14} />, tone: "success",description: "งาน กิจกรรม หรืออบรมที่มีวันจัด" },
  { value: "warning", label: "แจ้งเตือน",       icon: <AlertTriangle size={14} />, tone: "warn",  description: "เตือนให้ปฏิบัติภายในกำหนด อีเมลจะขึ้นต้นหัวเรื่องด้วย [แจ้งเตือน]" },
  { value: "urgent",  label: "ด่วน",           icon: <Radio size={14} />,       tone: "danger", description: "เรื่องเร่งด่วน อีเมลจะขึ้นต้นหัวเรื่องด้วย [ด่วน]" },
];

export const CAT_META = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c]),
) as Record<Category, typeof CATEGORIES[number]>;

/** The subject line the mailer and the bell will show. Mirrors the backend's
 *  announceSubject, so the pre-publish preview cannot promise another one. */
export function mailSubject(category: Category, title: string): string {
  const prefix = category === "urgent" ? "[ด่วน] "
    : category === "warning" ? "[แจ้งเตือน] "
    : category === "event" ? "[กิจกรรม] " : "";
  return prefix + title;
}

export const STATUS_LABEL: Record<Status, string> = {
  live: "เผยแพร่อยู่",
  scheduled: "ตั้งเวลาไว้",
  draft: "ฉบับร่าง",
  expired: "หมดอายุ",
};

// Cover image constraints — mirrored on the backend and shown to the user.
export const IMG = {
  maxBytes: 5 * 1024 * 1024,
  maxWidth: 1600,
  maxHeight: 900,
  minWidth: 800,
  aspectHint: "16:9",
  accept: "image/jpeg,image/png,image/webp",
  acceptLabel: "JPEG, PNG, WebP",
};

export const LIST_KEY = "/announcements?scope=all";

// ============================================================================
// Small pieces
// ============================================================================

export function CategoryChip({ category }: { category: Category }) {
  const meta = CAT_META[category] ?? CAT_META.info;
  return (
    <Chip tone={meta.tone}>
      <span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span>
    </Chip>
  );
}

export function StatusChip({ status, publishedAt }: { status: Status; publishedAt?: string | null }) {
  const tone = { live: "success", scheduled: "info", draft: "neutral", expired: "warn" }[status] as
    "success" | "info" | "neutral" | "warn";
  const label = status === "scheduled" && publishedAt
    ? `ตั้งเวลา ${fmtDateTime(publishedAt)}`
    : STATUS_LABEL[status];
  return <Chip tone={tone}>{label}</Chip>;
}

// ============================================================================
// Dates
// ============================================================================

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> the local date and time the two pickers speak. */
export function toLocalParts(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(+d)) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Local date + time -> Date, or null while either half is missing. */
export function fromLocalParts(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return isNaN(+d) ? null : d;
}

export function todayLocal(): string {
  return toLocalParts(new Date().toISOString()).date;
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// ============================================================================
// Text
// ============================================================================

/** The body with its markup taken off, for one-line previews. The list used
 *  to show the raw source, so every row read "**สำคัญ** :::center". */
export function plainText(body: string): string {
  return (body ?? "")
    .split("\n")
    .filter(l => !/^:::(center|right|left)\s*$/.test(l.trim()))
    .map(l => l.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/, ""))
    .join(" ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// Draft <-> server
// ============================================================================

export function draftFromAnn(a: Ann): Draft {
  const pub = toLocalParts(a.published_at);
  const exp = toLocalParts(a.expires_at);
  const scheduled = !!a.published_at && new Date(a.published_at) > new Date();
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    audience: a.audience ?? [],
    pinned: a.pinned,
    cover_image_key: a.cover_image_key ?? null,
    cover_image_url: a.cover_image_url ?? null,
    when: scheduled ? "scheduled" : "now",
    publishDate: scheduled ? pub.date : "",
    publishTime: scheduled ? pub.time : "",
    expires: !!a.expires_at,
    expireDate: exp.date,
    expireTime: exp.time,
    originalPublishedAt: a.published_at ?? null,
    originalStatus: a.status,
    isPublic: !!a.is_public,
    targetUsers: a.target_users ?? [],
    targetCourses: (a.target_courses ?? []).map(c => ({ id: c.id, label: `${c.code} ${c.name}` })),
    targetFilters: a.target_filters ?? [],
    attachments: a.attachments ?? [],
  };
}

export interface AudienceRule {
  roles: string[];
  course_ids: string[];
  user_ids: string[];
  filters: string[];
}

export function ruleOf(d: Draft): AudienceRule {
  return {
    roles: d.audience,
    course_ids: d.targetCourses.map(c => c.id),
    user_ids: d.targetUsers.map(u => u.id),
    filters: d.targetFilters,
  };
}

export function ruleIsEmpty(r: AudienceRule): boolean {
  return !r.roles.length && !r.course_ids.length && !r.user_ids.length && !r.filters.length;
}

export interface UpsertPayload {
  id?: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_key: string | null;
  published_at: string | null;
  expires_at: string | null;
  is_public: boolean;
  target_course_ids: string[];
  target_user_ids: string[];
  target_filters: string[];
  attachments: Attachment[];
}

/**
 * Turns the form into the upsert document, or says what is missing.
 *
 * `asDraft` saves without a publish time — nothing is checked beyond the title
 * and body, so a half-decided announcement can be put away.
 */
export function buildPayload(d: Draft, asDraft: boolean): UpsertPayload | { error: string } {
  const title = d.title.trim();
  const body = d.body.trim();
  if (!title) return { error: "กรุณากรอกหัวข้อ" };
  if (title.length > 200) return { error: "หัวข้อยาวเกิน 200 ตัวอักษร" };
  if (!body) return { error: "กรุณากรอกเนื้อหา" };
  if (body.length > 8000) return { error: "เนื้อหายาวเกิน 8000 ตัวอักษร" };

  const alreadyOut = d.originalStatus === "live" || d.originalStatus === "expired";
  let publishedAt: string | null = null;
  if (asDraft) {
    publishedAt = null;
  } else if (alreadyOut && d.originalPublishedAt) {
    // Editing something already published keeps its original publish time.
    publishedAt = d.originalPublishedAt;
  } else if (d.when === "scheduled") {
    const at = fromLocalParts(d.publishDate, d.publishTime);
    if (!at) return { error: "กรุณาระบุวันและเวลาที่จะเผยแพร่" };
    if (at.getTime() <= Date.now()) return { error: "เวลาที่ตั้งเผยแพร่ต้องอยู่ในอนาคต" };
    publishedAt = at.toISOString();
  } else {
    publishedAt = new Date().toISOString();
  }

  let expiresAt: string | null = null;
  if (d.expires) {
    const at = fromLocalParts(d.expireDate, d.expireTime);
    if (!at) return { error: "กรุณาระบุวันและเวลาหมดอายุ" };
    if (publishedAt && at.getTime() <= new Date(publishedAt).getTime()) {
      return { error: "วันหมดอายุต้องอยู่หลังวันเผยแพร่" };
    }
    if (!asDraft && at.getTime() <= Date.now()) {
      return { error: "วันหมดอายุผ่านมาแล้ว กรุณาเลื่อนออกไปหรือเอาวันหมดอายุออก" };
    }
    expiresAt = at.toISOString();
  }

  return {
    id: d.id,
    title, body, category: d.category,
    audience: d.audience,
    pinned: d.pinned,
    cover_image_key: d.cover_image_key,
    published_at: publishedAt,
    expires_at: expiresAt,
    is_public: d.isPublic,
    target_course_ids: d.targetCourses.map(c => c.id),
    target_user_ids: d.targetUsers.map(u => u.id),
    target_filters: d.targetFilters,
    attachments: d.attachments,
  };
}

// Convert a list row into the upsert document so the pin toggle can reuse the
// shared endpoint without dropping fields.
export function toPinPayload(a: Ann, pinned: boolean) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    audience: a.audience,
    pinned,
    cover_image_key: a.cover_image_key ?? null,
    published_at: a.published_at ?? null,
    expires_at: a.expires_at ?? null,
    // is_public, the target fields and the attachments are deliberately
    // absent: the server reads a missing field as "leave it alone".
  };
}
