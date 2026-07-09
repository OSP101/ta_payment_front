// Small typed API client for the TA Payment backend.
// Uses relative /api/v1/* which Next.js rewrites to the Fiber backend.

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

// Backend error codes that carry a specific redirect/UX meaning rather than a
// human message.
const CODE_MESSAGES: Record<string, string> = {
  password_change_required: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน",
  ta_profile_not_approved: "เอกสารของคุณยังไม่ได้รับการอนุมัติ",
};

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

/** Handle auth-related statuses with a client-side redirect where appropriate. */
function handleAuthRedirect(path: string, status: number, code?: string) {
  if (typeof window === "undefined") return;
  // Never redirect away from the auth endpoints themselves — a 401 there just
  // means "wrong credentials".
  if (path.startsWith("/auth/")) return;
  const here = window.location.pathname + window.location.search;
  if (status === 401 && !here.startsWith("/login")) {
    window.location.assign(`/login?next=${encodeURIComponent(here)}`);
    return;
  }
  if (status === 403 && code === "password_change_required" && !here.startsWith("/change-password")) {
    window.location.assign("/change-password");
  }
}

async function parseError(path: string, res: Response): Promise<ApiError> {
  let raw = "";
  try {
    const b = (await res.json()) as ApiErrorBody;
    raw = b?.error ?? "";
  } catch {
    /* non-JSON error body */
  }
  handleAuthRedirect(path, res.status, raw || undefined);
  return new ApiError(res.status, humanMessage(res.status, raw), raw || undefined);
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
      res = await fetch(`/api/v1${path}`, {
        method: "POST",
        body: form,
        credentials: "include",
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
};

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
  must_change_password?: boolean;
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
