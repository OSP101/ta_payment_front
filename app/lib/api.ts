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
 */
const REAUTH_PATHS = [
  "/auth/",
  "/ta-review/download-all-token",
];
function isReauthPath(path: string): boolean {
  if (path === "/auth/heartbeat") return false;
  // zip-token carries a user id in the middle, hence the suffix test.
  return REAUTH_PATHS.some(p => path.startsWith(p)) || path.endsWith("/zip-token");
}

/** Handle auth-related statuses with a client-side redirect where appropriate. */
function handleAuthRedirect(path: string, status: number, code?: string) {
  if (typeof window === "undefined") return;
  if (isReauthPath(path)) return;
  const here = window.location.pathname + window.location.search;
  if (status === 401 && !here.startsWith("/login")) {
    const reason = code && (SESSION_REASONS as readonly string[]).includes(code) ? `&reason=${code}` : "";
    window.location.assign(`/login?next=${encodeURIComponent(here)}${reason}`);
    return;
  }
  if (status === 403 && code === "password_change_required" && !here.startsWith("/change-password")) {
    window.location.assign("/change-password");
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
    res = await fetch(`/api/v1${path}`, {
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

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) => req<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => req<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => req<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${UPLOAD_ORIGIN}/api/v1${path}`, {
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
    xhr.open("POST", `${UPLOAD_ORIGIN}/api/v1${path}`, true);
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
}

export interface Term {
  id: string;
  academic_year: number;
  semester: number;
  starts_on?: string;
  ends_on?: string;
  is_active: boolean;
}
