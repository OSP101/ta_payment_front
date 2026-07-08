// Small typed API client for the TA Payment backend.
// Uses relative /api/v1/* which Next.js rewrites to the Fiber backend.

export type ApiError = { error: string };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = (await res.json()) as ApiError;
      msg = b.error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") ?? "";
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
    const res = await fetch(`/api/v1${path}`, { method: "POST", body: form, credentials: "include" });
    if (!res.ok) {
      let msg = res.statusText;
      try { const b = (await res.json()) as ApiError; msg = b.error ?? msg; } catch {}
      throw new Error(msg);
    }
    return (await res.json()) as T;
  },
};

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
