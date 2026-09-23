/**
 * Data model for the in-app user manual (`app/docs/`).
 *
 * Content is authored as plain TS data (arrays of `DocPage`), not MDX — this
 * codebase's Next.js version carries its own breaking changes (see AGENTS.md)
 * and already has a working convention for exactly this shape of content:
 * the onboarding tours (each role's own tours/definitions.ts) are arrays of typed
 * step objects rendered by a small engine. Docs pages follow the same idea:
 * a page is a list of typed `Block`s, rendered by `DocBlocks` in
 * `app/components/docs/Blocks.tsx`. No new template language, no MDX
 * toolchain, no risk of it fighting the Next 16 build.
 *
 * Body text (`RichText`d strings) uses the SAME tiny markup as
 * `app/components/RichText.tsx` (announcements): `**bold**`, `*italic*`,
 * `- bullet`, `1. numbered`, `[label](url)`, plus one addition this module's
 * renderer supports that RichText doesn't: `` `code` `` spans, because the
 * tours this content is adapted from lean on inline code for field names,
 * file patterns and route paths. See `app/components/docs/DocRichText.tsx`.
 */

export type Audience = "common" | "ta" | "lecturer" | "staff";

/** Roles from `Me.roles` (+ `is_executive`) that may open a given audience.
 *  Nested by responsibility: staff/admin read every manual, a lecturer reads
 *  their own AND the TA manual (they approve TA hours and field TA questions,
 *  so they need to see what the TA's screen tells them), a TA reads only
 *  their own. */
export const AUDIENCE_ROLES: Record<Audience, (me: { roles: string[]; is_executive?: boolean }) => boolean> = {
  common: () => true,
  ta: (me) => me.roles.includes("ta") || me.roles.includes("lecturer") || !!me.is_executive || me.roles.includes("admin") || me.roles.includes("staff"),
  lecturer: (me) => me.roles.includes("lecturer") || !!me.is_executive || me.roles.includes("admin") || me.roles.includes("staff"),
  staff: (me) => me.roles.includes("admin") || me.roles.includes("staff"),
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  common: "ทั่วไป",
  ta: "ผู้ช่วยสอน",
  lecturer: "อาจารย์",
  staff: "เจ้าหน้าที่",
};

/** Order the switch shows audiences in (common is never a switch option). */
export const AUDIENCE_ORDER: Audience[] = ["staff", "lecturer", "ta"];

export type CalloutTone = "info" | "tip" | "warn" | "danger";

export type Block =
  | { type: "text"; body: string }
  | { type: "callout"; tone: CalloutTone; title?: string; body: string }
  | { type: "steps"; items: StepBlock[] }
  | { type: "screenshot"; id: string; caption?: string; hotspots?: Hotspot[] }
  | { type: "gif"; id: string; caption?: string }
  | { type: "statusTable"; rows: StatusRow[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "uiPath"; path: string[] }
  | { type: "since"; version: string; note?: string }
  | { type: "goToApp"; label: string; route: string }
  | { type: "tryInDemo"; label: string; tourKey?: string; role: "staff" | "lecturer" | "ta" };

export interface StepBlock {
  title: string;
  body?: string;
  screenshot?: string;
  gif?: string;
  callout?: { tone: CalloutTone; body: string };
}

export interface Hotspot {
  /** Percent position within the image, top-left origin. */
  x: number;
  y: number;
  label: string;
}

export interface StatusRow {
  status: string;
  tone: "success" | "info" | "warn" | "danger" | "neutral";
  meaning: string;
  whoActsNext?: string;
}

export interface DocPage {
  slug: string; // e.g. "worklog/generate" — joined under /docs/[audience]/
  audience: Audience;
  section: string; // sidebar group label
  order: number;
  title: string;
  description: string;
  since: string; // system version this content is accurate for
  /** App routes this page documents — used by the in-app "?" button and by
   *  `scripts/check-docs-coverage.ts` to flag pages the manual never covers. */
  routes?: string[];
  keywords: string[];
  /** Verbatim error/toast strings from the app — lets a user paste the exact
   *  message they saw into search and land on the page that explains it. */
  errors?: string[];
  related?: string[]; // other slugs, same audience unless "audience:slug"
  gettingStarted?: number; // position in the audience's Getting Started path, if any
  blocks: Block[];
}

/** Small helpers mirroring the tours' `step()` convention. */
export const text = (body: string): Block => ({ type: "text", body });
export const callout = (tone: CalloutTone, body: string, title?: string): Block => ({ type: "callout", tone, body, title });
export const steps = (items: StepBlock[]): Block => ({ type: "steps", items });
export const screenshot = (id: string, caption?: string, hotspots?: Hotspot[]): Block => ({ type: "screenshot", id, caption, hotspots });
export const gif = (id: string, caption?: string): Block => ({ type: "gif", id, caption });
export const statusTable = (rows: StatusRow[]): Block => ({ type: "statusTable", rows });
export const table = (headers: string[], rows: string[][]): Block => ({ type: "table", headers, rows });
export const uiPath = (...path: string[]): Block => ({ type: "uiPath", path });
export const since = (version: string, note?: string): Block => ({ type: "since", version, note });
export const goToApp = (label: string, route: string): Block => ({ type: "goToApp", label, route });
export const tryInDemo = (label: string, role: "staff" | "lecturer" | "ta", tourKey?: string): Block => ({ type: "tryInDemo", label, role, tourKey });
