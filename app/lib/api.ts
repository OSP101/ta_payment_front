// Small typed API client for the TA Payment backend.
// Uses relative /api/v1/* which Next.js rewrites to the Fiber backend.
//
// Uploads are the exception — see UPLOAD_ORIGIN below.

export type ApiErrorBody = { error: string };

/** Typed error carrying the HTTP status so callers/UI can branch on it. */
export class ApiError extends Error {
  status: number;
  /** Machine-readable code the backend may send in the `error` field. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 20000;

/**
 * BETA-only: lets the demo sandbox (app/demo, see internal/demo on the
 * backend) reuse every existing page unmodified. Every real page in this app
 * calls api.get/post/etc, which always resolved to a literal "/api/v1"
 * prefix — fine for exactly one backend, but the sandbox needs each visitor
 * routed to their own isolated workspace at "/api/demo/w/<n>" instead.
 *
 * Rather than duplicate every page under app/demo/staff, app/demo/lecturer,
 * etc., app/demo/enter/page.tsx calls setApiPrefix once after claiming a
 * workspace, and every existing page's calls transparently go to that
 * workspace's backend from then on — no page needed to know the sandbox
 * exists. Persisted to sessionStorage (not localStorage: a demo workspace
 * belongs to one browser session, not "this device forever") so a reload
 * mid-walkthrough doesn't silently drop back to hitting production.
 *
 * Deliberately module-level mutable state, not React context: api.ts is
 * called from far outside the component tree (SWR fetchers, event handlers
 * with no provider above them), and the prefix changes at most once per
 * demo session, not something anything needs to re-render on.
 */
const DEMO_PREFIX_KEY = "ta-payment:demo-api-prefix";
let apiPrefix = "/api/v1";
if (typeof window !== "undefined") {
  try {
    // Landing on /login (a hard load or a browser-restored tab, not a
    // client-side navigation — this runs once at module load) is an
    // unambiguous "this must be production" signal. Never hydrate a stale
    // demo prefix there: a tab that visited /demo earlier and never
    // clicked "ออกจากโหมดทดลอง" would otherwise start this fresh /login
    // load still demo-prefixed, misrouting the real login POST at a demo
    // slot's own route tree. app/login/page.tsx's own mount-time clear
    // covers the client-side-navigation-TO-/login case; this covers the
    // hard-load case that fix's effect runs too late for (DemoBanner reads
    // this same module-level apiPrefix synchronously on its own first
    // render, before that effect fires).
    if (!window.location.pathname.startsWith("/login")) {
      const saved = window.sessionStorage.getItem(DEMO_PREFIX_KEY);
      if (saved) apiPrefix = saved;
    }
  } catch {
    /* storage blocked — stay on production */
  }
}

export function setDemoApiPrefix(prefix: string | null) {
  apiPrefix = prefix ?? "/api/v1";
  if (typeof window === "undefined") return;
  try {
    if (prefix) window.sessionStorage.setItem(DEMO_PREFIX_KEY, prefix);
    else window.sessionStorage.removeItem(DEMO_PREFIX_KEY);
  } catch {
    /* not fatal — apiPrefix itself is already updated for this tab */
  }
}

export function isDemoMode(): boolean {
  return apiPrefix !== "/api/v1";
}

export function getDemoBasePath(): string | null {
  return isDemoMode() ? apiPrefix : null;
}

/**
 * Origin that file uploads POST to, bypassing the Next.js rewrite.
 *
 * Next buffers the ENTIRE body of a proxied request in memory so it can be read
 * twice, and caps that buffer (proxyClientMaxBodySize). With a 10 MB document
 * limit that meant every upload was held in the Next process on top of being
 * held again in the Go process for virus scanning — two copies of the same file,
 * for the several seconds a scan takes. Posting straight to the API removes the
 * first copy entirely; nothing else about the request changes.
 *
 * Empty (the default) keeps the old relative path, so an environment that has
 * not set this — or one where the API is not reachable from the browser — is
 * unaffected. Only uploads use it; every other call still goes through the
 * rewrite, which is what keeps them same-origin and free of CORS entirely.
 *
 * Two things must hold when it IS set:
 *   - The API must allow this page's origin in CORS_ORIGINS, with credentials.
 *   - The session cookie must actually be sent. It is SameSite=Lax, which
 *     covers a different PORT on the same host (ports are not part of a "site")
 *     and a different subdomain of the same registrable domain. A backend on a
 *     genuinely different domain would need SameSite=None; Secure instead —
 *     check this before pointing it at one.
 */
const UPLOAD_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/$/, "");

// Backend error codes that carry a specific redirect/UX meaning rather than a
// human message.
const CODE_MESSAGES: Record<string, string> = {
  password_change_required: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน",
  // See internal/handler/middleware.go's AccountGuard — the mandatory-2FA
  // twin of password_change_required, same shape: every admin/staff/
  // executive account without totp_enabled_at set gets this on every
  // endpoint except /me, /me/2fa/*, and /auth/heartbeat.
  mfa_setup_required: "กรุณาตั้งค่าการยืนยันตัวตนสองขั้นตอน (2FA) ก่อนใช้งาน",
  ta_profile_not_approved: "เอกสารของคุณยังไม่ได้รับการอนุมัติ",
  // See internal/handler/middleware.go's AccountGuard — these three all come
  // back as a plain 401 with one of these as the `error` field. SESSION_REASONS
  // below is the subset the login page turns into a banner via ?reason=; the
  // messages here are what shows in an inline toast for a request that fails
  // mid-page instead of at the moment of redirect (e.g. a background poll).
  session_idle: "ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 15 นาที",
  session_superseded: "บัญชีนี้ถูกเข้าใช้งานจากอุปกรณ์อื่น คุณจึงถูกออกจากระบบที่นี่",
  session_revoked: "เซสชันนี้สิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่",
};

/** The subset of CODE_MESSAGES that the login page shows as a ?reason= banner. */
export const SESSION_REASONS = ["session_idle", "session_superseded", "session_revoked"] as const;
export type SessionReason = (typeof SESSION_REASONS)[number];

function humanMessage(status: number, raw: string): string {
  if (raw && CODE_MESSAGES[raw]) return CODE_MESSAGES[raw];
  if (raw && raw.trim() !== "") return raw;
  if (status === 0) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  if (status === 401) return "กรุณาเข้าสู่ระบบใหม่";
  if (status === 403) return "คุณไม่มีสิทธิ์ดำเนินการนี้";
  if (status === 404) return "ไม่พบข้อมูลที่ต้องการ";
  if (status === 408 || status === 504) return "การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่";
  if (status === 429) return "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (status >= 500) return "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง";
  return `ทำรายการไม่สำเร็จ (รหัส ${status})`;
}

/**
 * Endpoints where a 401 means "you typed the wrong password", not "your session
 * expired". Redirecting to /login on those is destructive: the officer is asked
 * to re-enter their password mid-task to release a document bundle, and a typo
 * threw them out of the review workspace — losing the session roster, which is
 * what decides who is in the download. They then had to log in again and start
 * over, with no idea what they had done wrong, because the inline error the modal
 * is built to show never got the chance to render.
 *
 * `/auth/` is here for the original reason: a failed login is not an expired
 * session either. `/auth/heartbeat` is carved back OUT of that: its whole job
 * is to surface exactly this kind of 401 (see SessionActivityGuard), so it is
 * the one `/auth/*` path that must still redirect.
 *
 * Matched with `includes`, not `startsWith`: every OTHER caller of this goes
 * through req() with a path relative to apiPrefix (e.g. "/auth/login"), but
 * demoFetch (demoLogin) passes an ABSOLUTE path instead — "/api/demo/w/3
 * /auth/login" — since apiPrefix isn't set yet at that point in the demo
 * entry flow. `startsWith` alone never matches that, so a demo login's own
 * 401 fell through to the "session expired" branch below and hard-navigated
 * the tab away before the entry page's own catch block could show the
 * user why their login actually failed.
 */
const REAUTH_PATHS = [
  "/auth/",
  "/ta-review/download-all-token",
  // MFAHandler.Enable/Disable/RegenerateRecoveryCodes (internal/handler/mfa.go)
  // return 401 for a wrong TOTP/recovery code or a wrong password — the exact
  // same "not a dead session" shape as the two entries above, found live: a
  // mistyped enrolment code hard-navigated straight to /login instead of
  // showing the inline FieldError /setup-2fa is built to render, discarding
  // the in-progress QR scan.
  "/me/2fa/",
];
function isReauthPath(path: string): boolean {
  if (path.endsWith("/auth/heartbeat")) return false;
  // zip-token carries a user id in the middle, hence the suffix test.
  // /2fa/reset (POST /users/:id/2fa/reset, MFAHandler.AdminReset) is the same
  // shape again, with the target user's id in the middle the same way
  // zip-token's is — a staff member mistyping their OWN confirming password
  // must not be logged out of /staff/users over it.
  return REAUTH_PATHS.some(p => path.startsWith(p) || path.includes(p))
    || path.endsWith("/zip-token") || path.endsWith("/2fa/reset");
}

/** Handle auth-related statuses with a client-side redirect where appropriate. */
function handleAuthRedirect(path: string, status: number, code?: string) {
  if (typeof window === "undefined") return;
  if (isReauthPath(path)) return;
  const here = window.location.pathname + window.location.search;
  // A demo session that idles out or gets superseded must land back on
  // /demo, never /login — /login authenticates against production, which a
  // sandbox visitor almost certainly has no real account for, and sending
  // them there reads as "you got logged out of the real system".
  const authPage = isDemoMode() ? "/demo" : "/login";
  if (status === 401 && !here.startsWith(authPage)) {
    const reason = code && (SESSION_REASONS as readonly string[]).includes(code) ? `&reason=${code}` : "";
    window.location.assign(`${authPage}?next=${encodeURIComponent(here)}${reason}`);
    return;
  }
  if (status === 403 && code === "password_change_required" && !here.startsWith("/change-password")) {
    window.location.assign("/change-password");
    return;
  }
  if (status === 403 && code === "mfa_setup_required" && !here.startsWith("/setup-2fa")) {
    window.location.assign("/setup-2fa");
  }
}

/** Build an ApiError from a status and a raw (possibly non-JSON) body string. */
function toApiError(path: string, status: number, body: string): ApiError {
  let raw = "";
  try {
    raw = (JSON.parse(body) as ApiErrorBody)?.error ?? "";
  } catch {
    /* non-JSON error body */
  }
  handleAuthRedirect(path, status, raw || undefined);
  return new ApiError(status, humanMessage(status, raw), raw || undefined);
}

async function parseError(path: string, res: Response): Promise<ApiError> {
  return toApiError(path, res.status, await res.text().catch(() => ""));
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiPrefix}${path}`, {
      ...init,
      credentials: "include",
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    // Network failure or timeout — no HTTP status.
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError(408, humanMessage(408, ""));
    }
    throw new ApiError(0, humanMessage(0, ""));
  }
  if (!res.ok) throw await parseError(path, res);

  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204) return undefined as unknown as T;
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

/**
 * BETA-only: the two calls app/demo/page.tsx makes before setDemoApiPrefix
 * has anything to point at, so they cannot go through req() (which always
 * targets apiPrefix — see its doc comment). Both live outside /api/v1
 * entirely: /api/demo/enter claims a workspace and returns where its routes
 * live; the returned base_path is then what api.ts prefixes for every OTHER
 * call for the rest of the demo session, including the actual login below.
 */
export interface DemoAccount { email: string; label: string; roles: string[] }
/** tier is the caller's OWN resolved permission tier (see internal/demo/tiers.go)
 *  — accounts is already filtered to what that tier may log into; nothing
 *  client-side needs to filter again. */
export interface DemoEnterResult { base_path: string; accounts: DemoAccount[]; tier: DemoTester["tier"]; demo_password: string }

async function demoFetch<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, humanMessage(0, ""));
  }
  if (!res.ok) throw await parseError(path, res);
  return (await res.json()) as T;
}

export const demoEnter = (email: string) =>
  demoFetch<DemoEnterResult>("/api/demo/enter", { email });

export const demoResetWorkspace = (email: string) =>
  demoFetch<{ base_path: string }>("/api/demo/reset", { email });

export const demoLogin = (basePath: string, email: string, password: string) =>
  demoFetch<{ user: Me }>(`${basePath}/auth/login`, { email, password });

// The simulator panel's own two endpoints — unlike demoEnter/demoLogin
// above, these run AFTER login, under the claimed slot's own prefix, so
// they go through the normal api.get/post (apiPrefix-aware) below rather
// than demoFetch.
/** Matches internal/demo's tiers.go — which seeded account's point of view a
 *  scenario/problem step is written from. See DemoScenarioEvent.actor_role. */
export type DemoActorRole = "staff" | "lecturer" | "ta";

export interface DemoScenarioEvent {
  key: string;
  label: string;
  description: string;
  /** Whether this step's effect is already present — a cheap DB read, not a
   *  guarantee the step can be re-run without error (see internal/demo's
   *  ScenarioEventStatus doc comment). */
  done: boolean;
  /** Staff page that shows this step's real effect, if it has one — see
   *  internal/demo's ScenarioEvent.RelatedPath doc comment. */
  related_path?: string;
  /** Which seeded role this step is written from the POV of — see
   *  internal/demo's ScenarioEvent.ActorRole doc comment. Used to decide
   *  whether to offer navigating to related_path at all: a lecturer/TA
   *  tester has no access to a staff-actor step's (always staff-only)
   *  related_path, so offering that link would just send them into a 403. */
  actor_role: DemoActorRole;
}

export const demoScenarioEvents = () => api.get<{ items: DemoScenarioEvent[] }>("/scenario/events");
export const demoRunScenarioEvent = (key: string) => api.post<{ message: string }>(`/scenario/events/${key}`);

/** Problem-case events have no `done` flag — see internal/demo/scenario_problems.go:
 *  they're repeatable demonstrations, not one-time setup steps. */
export interface DemoProblemEvent {
  key: string;
  label: string;
  description: string;
  related_path?: string;
  actor_role: DemoActorRole;
}

export const demoProblemEvents = () => api.get<{ items: DemoProblemEvent[] }>("/scenario/problems");
export const demoRunProblemEvent = (key: string) => api.post<{ message: string }>(`/scenario/problems/${key}`);

/** "บันทึกจุดตรวจสอบ" / "ย้อนกลับไปจุดตรวจสอบ" — see internal/demo/checkpoint.go.
 *  One checkpoint per workspace; saving overwrites whatever was there before. */
export const demoCheckpointStatus = () => api.get<{ saved_at: string | null }>("/scenario/checkpoint");
export const demoSaveCheckpoint = () => api.post<{ ok: true }>("/scenario/checkpoint");
export const demoRestoreCheckpoint = () => api.post<{ ok: true }>("/scenario/checkpoint/restore");

/**
 * Who may enter the demo sandbox, and at what tier — managed from
 * /staff/settings (DemoTestersSection), unlike everything else on this page
 * which runs from INSIDE a claimed demo slot. These calls go through the
 * normal api.get/post/del (production /api/v1 prefix, real staff session),
 * not demoFetch — see internal/demo/admin.go's own doc comment for why these
 * endpoints live on the production router instead of under /api/demo.
 */
export interface DemoTester {
  email: string;
  tier: "staff" | "lecturer" | "ta";
  note: string;
  added_by: string;
  created_at: string;
}
export const demoTesters = () => api.get<{ items: DemoTester[] }>("/demo-testers");
export const demoAddTester = (email: string, tier: DemoTester["tier"], note: string) =>
  api.post<{ ok: true }>("/demo-testers", { email, tier, note });
export const demoRemoveTester = (email: string) =>
  api.del<{ ok: true }>(`/demo-testers/${encodeURIComponent(email)}`);

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) => req<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => req<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => req<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${UPLOAD_ORIGIN}${apiPrefix}${path}`, {
        method: "POST",
        body: form,
        // Required both ways: same-origin through the rewrite, and cross-origin
        // when UPLOAD_ORIGIN is set — without it the cookie is dropped and every
        // upload 401s.
        credentials: "include",
        // Deliberately not setting Content-Type: the browser has to generate the
        // multipart boundary. Setting it by hand also turns this into a
        // preflighted request for no benefit.
        signal: AbortSignal.timeout(TIMEOUT_MS * 3), // uploads may be large
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new ApiError(408, humanMessage(408, ""));
      }
      throw new ApiError(0, humanMessage(0, ""));
    }
    if (!res.ok) throw await parseError(path, res);
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 204 || !ct.includes("application/json")) return undefined as unknown as T;
    return (await res.json()) as T;
  },
  uploadWithProgress,
};

/**
 * What the client can honestly say an upload is doing.
 *
 * "sending" is measured — the browser reports bytes flushed to the socket.
 * "processing" is inferred, and the inference is sound: the request body is
 * fully sent and no response byte has arrived, so the server is inside the
 * handler. On the document endpoints that window is dominated by the virus
 * scan (see service.scanUpload), which is why it is worth showing at all — a
 * 10 MB PDF can sit there for seconds with nothing else to explain the wait.
 *
 * There is no progress WITHIN "processing". clamd reports no percentage, and
 * inventing a creeping bar would be a lie that also erodes trust in the real
 * one above it. An indeterminate indicator is the honest rendering.
 */
export type UploadPhase = "sending" | "processing";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0–100 while sending. Meaningless (and left at 100) once processing. */
  percent: number;
  loaded: number;
  total: number;
}

/**
 * Upload with progress reporting. Uses XMLHttpRequest, not fetch, for one
 * reason: fetch cannot report REQUEST progress. (Streaming request bodies can,
 * but they force HTTP/2, disable the browser's own multipart encoding, and are
 * unsupported in Safari — far too much to give up for a progress bar.)
 *
 * Behaviour is otherwise identical to api.upload, including the cross-origin
 * UPLOAD_ORIGIN and the credentials, so the two can be used interchangeably.
 */
function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (p: UploadProgress) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${UPLOAD_ORIGIN}${apiPrefix}${path}`, true);
    // The XHR spelling of credentials: "include".
    xhr.withCredentials = true;
    xhr.timeout = TIMEOUT_MS * 3;
    // Ask for text so error bodies are readable regardless of content type;
    // JSON parsing is ours to do (see toApiError).
    xhr.responseType = "text";

    let phase: UploadPhase = "sending";
    const report = (p: UploadProgress) => { try { onProgress?.(p); } catch { /* never fail an upload over UI */ } };

    xhr.upload.onprogress = e => {
      if (phase !== "sending") return;
      // lengthComputable is false when the body length is unknown; a FormData
      // of files always has one, but don't divide by zero if it doesn't.
      const total = e.lengthComputable ? e.total : 0;
      const percent = total > 0 ? Math.min(99, Math.round((e.loaded / total) * 100)) : 0;
      report({ phase: "sending", percent, loaded: e.loaded, total });
    };
    // The last byte is out; everything from here is the server working.
    xhr.upload.onload = () => {
      phase = "processing";
      report({ phase: "processing", percent: 100, loaded: 0, total: 0 });
    };

    xhr.onload = () => {
      const body = xhr.responseText ?? "";
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(toApiError(path, xhr.status, body));
        return;
      }
      const ct = xhr.getResponseHeader("content-type") ?? "";
      if (xhr.status === 204 || !ct.includes("application/json") || body === "") {
        resolve(undefined as unknown as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new ApiError(xhr.status, "อ่านคำตอบจากเซิร์ฟเวอร์ไม่ได้"));
      }
    };
    // A CORS rejection also lands here with status 0 — indistinguishable from
    // an offline browser by design, so the generic "cannot connect" is right.
    xhr.onerror = () => reject(new ApiError(0, humanMessage(0, "")));
    xhr.ontimeout = () => reject(new ApiError(408, humanMessage(408, "")));
    xhr.onabort = () => reject(new ApiError(0, "ยกเลิกการอัปโหลดแล้ว"));

    xhr.send(form);
  });
}

/** Extract a user-safe message from any thrown value. */
export function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

// SWR-compatible fetcher — typed for direct use as `useSWR(key, fetcher)`.
export const fetcher = <T>(path: string): Promise<T> => api.get<T>(path);

export interface Me {
  id: string;
  email: string;
  title?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  study_level?: string;
  study_year?: number;
  student_id?: string;
  is_active: boolean;
  profile_completed: boolean;
  /** API path that streams the profile picture, carrying a ?v= cache-buster.
   *  Absent when the user has not set one — draw initials instead. */
  avatar_url?: string | null;
  must_change_password?: boolean;
  /** Read-only executive dashboard (/executive). A flag staff tick per user —
   *  not a value in `roles`. */
  is_executive?: boolean;
  /** Free-text administrative position (e.g. "หัวหน้าสาขาวิชา...") shown next
   *  to the role label. Display-only — staff set it, nothing reads it back. */
  admin_position?: string | null;
  roles: string[];
  /** Whether this account has completed 2FA enrolment. Mandatory for
   *  admin/staff/executive — see AccountGuard's mfa_setup_required. */
  totp_enabled: boolean;
  /** 0 when totp_enabled is false. Shown on /account so a user notices
   *  before they run out. */
  recovery_codes_remaining: number;
  /** When this TA accepted the current PDPA notice version, or absent if
   *  never. app/ta/(home)/documents/page.tsx gates the profile form (Step 1)
   *  behind PdpaConsentModal until this is set. */
  pdpa_consented_at?: string | null;
}

/**
 * Two-factor authentication. Login is now two steps — see
 * internal/handler/auth.go's AuthHandler.Login/LoginTwoFactor: step 1
 * (password) returns either {user} directly (2FA off) or {mfa_required,
 * challenge} (2FA on, no session/cookie yet); step 2 redeems the challenge
 * with a TOTP or recovery code and returns {user}, same shape either path
 * used to return alone.
 */
export type LoginResult = { user: Me } | { mfa_required: true; challenge: string };
export const login = (email: string, password: string) =>
  api.post<LoginResult>("/auth/login", { email, password });
export const loginTwoFactor = (challenge: string, code: string) =>
  api.post<{ user: Me }>("/auth/login/2fa", { challenge, code });

/** What /me/2fa/setup renders on the enrolment screen. secret is included so
 *  the page can offer "can't scan? type this instead" — the same secret is
 *  embedded in otpauth_url/the QR image, not additional exposure. */
export interface MFASetupResult {
  secret: string;
  otpauth_url: string;
  qr_png_base64: string;
}
export const mfaSetup = () => api.post<MFASetupResult>("/me/2fa/setup");
export const mfaEnable = (code: string) =>
  api.post<{ recovery_codes: string[] }>("/me/2fa/enable", { code });
export const mfaDisable = (password: string, code: string) =>
  api.post<{ ok: true }>("/me/2fa/disable", { password, code });
export const mfaRegenerateRecoveryCodes = (password: string) =>
  api.post<{ recovery_codes: string[] }>("/me/2fa/recovery-codes", { password });
/** Admin-only — see router.go's RequireRole(rbac.RoleAdmin) on this route and
 *  MFAService.AdminReset's doc comment for why staff cannot call this. */
export const mfaAdminReset = (userId: string, password: string) =>
  api.post<{ ok: true }>(`/users/${userId}/2fa/reset`, { password });

/** Records that the TA accepted the PDPA notice shown by PdpaConsentModal
 *  before the profile form unlocks — see internal/service/pdpa_consent.go. */
export const pdpaConsent = () => api.post<{ ok: true }>("/me/pdpa-consent");

/**
 * PDPA self-service data access/erasure — see internal/service/data_export.go
 * and data_deletion.go. Mirrors those Go types field-for-field.
 */
export interface MyDataExport {
  profile: {
    email: string;
    title?: string;
    first_name: string;
    last_name: string;
    phone?: string;
    student_id?: string;
    department?: string;
    roles: string[];
    totp_enabled: boolean;
  };
  ta_profile?: { citizen_id_last4?: string; status: string };
  pdpa_consent?: { version: number; consented_at: string };
  sessions: Array<{
    id: string; created_at: string; last_activity_at: string;
    ip?: string; user_agent?: string; revoked_at?: string; revoke_reason?: string;
  }>;
  documents: Array<{ kind: string; filename: string; status: string; uploaded_at: string }>;
  recent_activity: Array<{ at: string; action: string; entity: string; entity_id?: string; ip?: string }>;
}
export const dataExport = () => api.get<MyDataExport>("/me/data-export");

/** Password-gated — reuses DocsService.RevealCitizenID's audited decrypt
 *  path with actor == target == the caller. */
export const citizenIdReveal = (password: string) =>
  api.post<{ national_id: string }>("/me/citizen-id/reveal", { password });

export interface DataDeletionRequest {
  id: string;
  user_id: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  review_note?: string;
  executed_at?: string;
}
export interface DataDeletionRequestForReview extends DataDeletionRequest {
  requester_email: string;
  requester_name: string;
  has_payment_history: boolean;
}
export const requestDataDeletion = (reason: string) =>
  api.post<{ ok: true }>("/me/data-deletion-request", { reason });
/** null when the TA has never submitted a request. */
export const myDeletionRequest = () =>
  api.get<DataDeletionRequest | null>("/me/data-deletion-request");
/** Admin-only — see router.go's RequireRole(rbac.RoleAdmin) on this route. */
export const listDeletionRequests = (status?: string) =>
  api.get<DataDeletionRequestForReview[]>(
    `/staff/data-deletion-requests${status ? `?status=${status}` : ""}`);
export const reviewDeletionRequest = (id: string, approve: boolean, note: string) =>
  api.post<{ ok: true }>(`/staff/data-deletion-requests/${id}/review`, { approve, note });

export interface Term {
  id: string;
  academic_year: number;
  semester: number;
  starts_on?: string;
  ends_on?: string;
  is_active: boolean;
}
