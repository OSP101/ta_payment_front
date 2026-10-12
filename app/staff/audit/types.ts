/* -------------------------------------------------------------------------- *
 * What the audit API returns, and the few words this screen adds on top.
 *
 * The wording of every action — its label, category, severity, outcome — comes
 * from the server (internal/audit/catalog.go). This file used to be
 * vocabulary.ts and carried its own copy, which is how about 120 actions ended
 * up on screen as a family name or a raw identifier. What is left here is only
 * what belongs to the interface: how a role, an outcome or a network is said,
 * and how a date is written.
 * -------------------------------------------------------------------------- */

import { msg, type Vars } from "../../lib/i18n/core";

export type Severity = "info" | "notice" | "warn" | "danger";
export type Outcome = "ok" | "failed" | "denied";
export type ActorKind = "user" | "system" | "anonymous" | "unknown";

export interface Change {
  key: string;
  label: string;
  /** null = that side was not recorded (a create has no before). */
  before: string | null;
  after: string | null;
}

export interface Row {
  id: number;
  at: string;
  actor_id?: string | null;
  actor_name?: string;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  subject_name?: string;
  ip?: string | null;
  user_agent?: string | null;
  method?: string | null;
  path?: string | null;
  request_id?: string | null;
  session_id?: string | null;
  note?: string | null;
  before?: unknown;
  after?: unknown;

  // Derived by the server.
  ref: string;
  label: string;
  category: string;
  category_label: string;
  severity: Severity;
  outcome: Outcome;
  actor_kind: ActorKind;
  automatic?: boolean;
  device?: string;
  network?: string;
  details?: string[];
  changes?: Change[];
  /** How many stored rows this line stands for (a folded burst). */
  count: number;
}

export interface CategoryCount {
  id: string;
  label: string;
  events: number;
}

export interface Attention {
  action: string;
  label: string;
  severity: Severity;
  outcome: Outcome;
  actor_id?: string | null;
  actor_name?: string;
  entity: string;
  entity_id?: string | null;
  subject_name?: string;
  subjects: number;
  count: number;
  distinct_ips: number;
  last_at: string;
  last_id: number;
  ref: string;
}

export interface Actor {
  id: string;
  name: string;
  role?: string;
  count: number;
}

export interface Summary {
  actors: Actor[];
  categories: CategoryCount[];
  attention: Attention[];
  events: number;
  rows: number;
}

export interface CatalogEntry {
  action: string;
  label: string;
  category: string;
  severity: Severity;
  outcome: Outcome;
}

export interface Catalog {
  categories: { id: string; label: string }[];
  actions: CatalogEntry[];
}

export interface Session {
  id: string;
  user_id: string;
  name: string;
  roles: string[];
  device?: string;
  ip?: string;
  network?: string;
  created_at: string;
  last_activity_at: string;
}

/** A pinned question that replaces the filters: one request, one login
 *  session, or one burst (a request and the action it repeated). */
export type Trace =
  | { kind: "request"; id: string; action?: string }
  | { kind: "session"; id: string };

export const ROLE_LABEL: Record<string, string> = {
  admin: msg("ผู้ดูแลระบบ"),
  staff: msg("เจ้าหน้าที่"),
  lecturer: msg("อาจารย์"),
  ta: msg("ผู้ช่วยสอน"),
  executive: msg("ผู้บริหาร"),
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: msg("สำเร็จ"),
  failed: msg("ไม่สำเร็จ"),
  denied: msg("ถูกปฏิเสธ"),
};

export const NETWORK_LABEL: Record<string, string> = {
  local: msg("เครื่องเซิร์ฟเวอร์เอง"),
  private: msg("เครือข่ายภายใน"),
  public: msg("อินเทอร์เน็ตภายนอก"),
};

/** t() from useI18n(), handed to the text helpers below. */
type T = (key: string, vars?: Vars) => string;

/** Who was behind a row, in words. A missing actor is three different things
 *  and the screen used to call all of them "ระบบ". */
export function actorText(r: Pick<Row, "actor_kind" | "actor_name" | "actor_id">, t: T): string {
  switch (r.actor_kind) {
    case "user":
      return r.actor_name || t("ผู้ใช้ที่ไม่มีชื่อในระบบ");
    case "system":
      return t("ระบบ");
    case "anonymous":
      return t("ผู้ที่ยังไม่ได้เข้าสู่ระบบ");
    default:
      return t("ไม่ได้บันทึกผู้กระทำ");
  }
}

/** The subject, unless it is the actor themself — "สมชาย เข้าสู่ระบบ · สมชาย"
 *  says the same name twice and nothing else. */
export function subjectText(r: Pick<Row, "subject_name" | "entity" | "entity_id" | "actor_id">): string {
  if (!r.subject_name) return "";
  if ((r.entity === "user" || r.entity === "ta_profile") && r.entity_id && r.entity_id === r.actor_id) return "";
  return r.subject_name;
}

/** The headline of a row as plain text (also what a screen reader hears). */
export function headline(r: Row, t: T): { who: string; what: string } {
  // Something the system did by itself: its label already says so, and the
  // person whose request set it off did not do it. (The label comes from the
  // backend catalog, Thai or English.)
  if (r.automatic) {
    const saysSystem = r.label.startsWith("ระบบ") || r.label.startsWith("System"); // i18n-ignore — matched against backend text
    return { who: saysSystem ? "" : t("ระบบ"), what: r.label };
  }
  return { who: actorText(r, t), what: r.label };
}

// Formatters per interface language (intl from useI18n(): "th-TH" or "en-GB").
const fmtCache = new Map<string, ReturnType<typeof makeFmts>>();
function makeFmts(intl: string) {
  return {
    day: new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", hour12: false }),
    full: new Intl.DateTimeFormat(intl, {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }),
    short: new Intl.DateTimeFormat(intl, {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }),
    stamp: new Intl.DateTimeFormat(intl, {
      day: "2-digit", month: "2-digit", year: "numeric",
    }),
    sec: new Intl.DateTimeFormat(intl, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }),
  };
}
function fmts(intl: string) {
  let f = fmtCache.get(intl);
  if (!f) { f = makeFmts(intl); fmtCache.set(intl, f); }
  return f;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "วันนี้ · วันพุธที่ 30 กันยายน 2569" — the day heading of the timeline. */
export function dayHeading(iso: string, t: T, intl: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const full = fmts(intl).day.format(d);
  if (localDayKey(d) === localDayKey(now)) return t("วันนี้ · {date}", { date: full });
  if (localDayKey(d) === localDayKey(yesterday)) return t("เมื่อวาน · {date}", { date: full });
  return full;
}

export const dayKey = (iso: string) => localDayKey(new Date(iso));
export const clock = (iso: string, intl: string) => fmts(intl).time.format(new Date(iso));
export const clockSeconds = (iso: string, intl: string) => fmts(intl).sec.format(new Date(iso));
export const fullDateTime = (iso: string, intl: string) => fmts(intl).full.format(new Date(iso));
export const shortDateTime = (iso: string, intl: string) => fmts(intl).short.format(new Date(iso));
export const dateStamp = (iso: string, intl: string) => fmts(intl).stamp.format(new Date(iso));

/** "5 นาทีก่อน" — for the list of sessions in use right now. */
export function ago(iso: string, t: T, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t("เมื่อสักครู่");
  if (mins < 60) return t("{n} นาทีก่อน", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("{n} ชั่วโมงก่อน", { n: hours });
  return t("{n} วันก่อน", { n: Math.round(hours / 24) });
}

/** One change as a short phrase: "ชั่วโมง 3 → 2", "สถานะ อนุมัติแล้ว". The
 *  label and values come from the backend catalog. */
export function changePhrase(c: Change, t: T): string {
  const show = (v: string | null) => (v === null ? "" : v === "" ? t("(ว่าง)") : v);
  if (c.before !== null && c.after !== null) return `${c.label} ${show(c.before)} → ${show(c.after)}`;
  if (c.after !== null) return `${c.label} ${show(c.after)}`;
  return `${c.label} ${show(c.before)}`;
}
