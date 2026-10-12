/**
 * Shared pieces of error reporting to the self-hosted GlitchTip (Sentry
 * protocol). The SDK is set up in instrumentation-client.ts (browser) and
 * instrumentation.ts (Next server); the browser's events reach GlitchTip
 * through app/api/client-events/route.ts.
 *
 * ทำไมต้องมี: ช่วงทดสอบ ผู้ใช้มักบอกไม่ได้ว่ากดอะไรแล้วพัง GlitchTip เก็บ error
 * ที่เกิดจริงพร้อมเส้นทางที่ผู้ใช้เดินมาก่อนพัง (breadcrumbs) และรวม error
 * เดียวกันเป็น issue เดียว
 *
 * PDPA: ระบบนี้มีเลขบัตรประชาชน เลขพาสปอร์ต บัญชีธนาคาร ทุกอย่างที่ออกจาก
 * browser จึงผ่าน scrubEvent/scrubBreadcrumb ก่อน: ตัด query string ทุก URL,
 * ไม่ส่ง cookie/header/body, ผู้ใช้ส่งแค่ id กับ role
 */
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/** Same-origin path the browser SDK posts envelopes to (the "tunnel"). Kept
 *  free of words like "sentry"/"error"/"track" that ad blockers match on. */
export const TUNNEL_PATH = "/api/client-events";

/** <meta name> the root layout renders when reporting is on. Its presence is
 *  the switch: no DSN on the server = no meta = the browser SDK never starts. */
export const CONFIG_META = "coco-client-events";

export interface BrowserConfig {
  dsn: string;
  environment: string;
  release?: string;
}

/** Server-side: what the layout hands the browser, or null when off. */
export function browserConfigFromEnv(): BrowserConfig | null {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    release: process.env.SENTRY_RELEASE || undefined,
  };
}

/** Drops the query string and fragment: search boxes, ?next= targets and
 *  share-link parameters all travel there. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Masks runs of 10+ digits: a citizen ID is 13, a bank account 10-12, a
 *  phone 10. Error messages are written by code, and code sometimes puts the
 *  value it choked on into the message. Shorter numbers (ids, years, counts)
 *  are left alone because they are what makes a message useful. */
export function maskDigits(text: string): string {
  // Not inside a longer token: the 12-digit tail of a UUID (a request id,
  // a record id) is preceded by "-" and must survive.
  return text.replace(/(?<![\w-])\d[\d -]{8,}\d(?![\w-])/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[ตัวเลขถูกซ่อน]" : m)); // i18n-ignore — goes into the error report, not shown to the reader
}

/** Last pass over every event before it leaves the process. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = maskDigits(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = maskDigits(ex.value);
  }
  if (event.request) {
    const ua = event.request.headers?.["User-Agent"] ?? event.request.headers?.["user-agent"];
    event.request = {
      url: event.request.url ? stripQuery(event.request.url) : undefined,
      method: event.request.method,
      // User-Agent only: it is what says "Safari on an old iPad". Cookie,
      // Authorization and the forwarded-for chain must never leave.
      headers: ua ? { "User-Agent": ua } : undefined,
    };
  }
  if (event.user) {
    event.user = { id: event.user.id, segment: event.user.segment };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  // The tunnel's own requests are noise in every trail.
  if (typeof b.data?.url === "string" && b.data.url.includes(TUNNEL_PATH)) return null;
  if (b.data) {
    const data = { ...b.data };
    for (const k of ["url", "from", "to"]) {
      if (typeof data[k] === "string") data[k] = stripQuery(data[k] as string);
    }
    // fetch/xhr breadcrumbs can carry request/response bodies in newer SDKs.
    delete data.request_body;
    delete data.response_body;
    b = { ...b, data };
  }
  if (typeof b.message === "string") {
    b = { ...b, message: maskDigits(b.category === "navigation" ? stripQuery(b.message) : b.message) };
  }
  return b;
}
