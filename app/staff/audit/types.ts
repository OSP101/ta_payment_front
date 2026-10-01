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
  admin: "ผู้ดูแลระบบ",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
  executive: "ผู้บริหาร",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: "สำเร็จ",
  failed: "ไม่สำเร็จ",
  denied: "ถูกปฏิเสธ",
};

export const NETWORK_LABEL: Record<string, string> = {
  local: "เครื่องเซิร์ฟเวอร์เอง",
  private: "เครือข่ายภายใน",
  public: "อินเทอร์เน็ตภายนอก",
};

/** Who was behind a row, in words. A missing actor is three different things
 *  and the screen used to call all of them "ระบบ". */
export function actorText(r: Pick<Row, "actor_kind" | "actor_name" | "actor_id">): string {
  switch (r.actor_kind) {
    case "user":
      return r.actor_name || "ผู้ใช้ที่ไม่มีชื่อในระบบ";
    case "system":
      return "ระบบ";
    case "anonymous":
      return "ผู้ที่ยังไม่ได้เข้าสู่ระบบ";
    default:
      return "ไม่ได้บันทึกผู้กระทำ";
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
export function headline(r: Row): { who: string; what: string } {
  // Something the system did by itself: its label already says so, and the
  // person whose request set it off did not do it.
  if (r.automatic) {
    return { who: r.label.startsWith("ระบบ") ? "" : "ระบบ", what: r.label };
  }
  return { who: actorText(r), what: r.label };
}

const dayFmt = new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
const fullFmt = new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const shortFmt = new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});
const stampFmt = new Intl.DateTimeFormat("th-TH", {
  day: "2-digit", month: "2-digit", year: "numeric",
});
const secFmt = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "วันนี้ · วันพุธที่ 30 กันยายน 2569" — the day heading of the timeline. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const full = dayFmt.format(d);
  if (localDayKey(d) === localDayKey(now)) return `วันนี้ · ${full}`;
  if (localDayKey(d) === localDayKey(yesterday)) return `เมื่อวาน · ${full}`;
  return full;
}

export const dayKey = (iso: string) => localDayKey(new Date(iso));
export const clock = (iso: string) => timeFmt.format(new Date(iso));
export const clockSeconds = (iso: string) => secFmt.format(new Date(iso));
export const fullDateTime = (iso: string) => fullFmt.format(new Date(iso));
export const shortDateTime = (iso: string) => shortFmt.format(new Date(iso));
export const dateStamp = (iso: string) => stampFmt.format(new Date(iso));

/** "5 นาทีก่อน" — for the list of sessions in use right now. */
export function ago(iso: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีก่อน`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงก่อน`;
  return `${Math.round(hours / 24)} วันก่อน`;
}

/** One change as a short phrase: "ชั่วโมง 3 → 2", "สถานะ อนุมัติแล้ว". */
export function changePhrase(c: Change): string {
  const show = (v: string | null) => (v === null ? "" : v === "" ? "(ว่าง)" : v);
  if (c.before !== null && c.after !== null) return `${c.label} ${show(c.before)} → ${show(c.after)}`;
  if (c.after !== null) return `${c.label} ${show(c.after)}`;
  return `${c.label} ${show(c.before)}`;
}
