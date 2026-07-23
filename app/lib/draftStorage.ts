// Draft-persistence utility for the TA worklog page. Backs the "your work
// isn't lost when you reload" UX — draft edits are mirrored to localStorage
// so a browser close / reload / accidental navigation doesn't drop them.
//
// Key schema (versioned + user-namespaced so a shared device stays clean):
//   tapay:worklog-drafts:v1:{userId}:{aid}    → { drafts, savedAt }
//   tapay:worklog-add-form:v1:{userId}:{aid}  → { form, savedAt }
//
// Every browser API call is wrapped in try/catch: Safari private mode + quota
// exhaustion are the failure modes and we prefer a silently-degraded in-memory
// experience over a crash. Nothing here throws.
//
// SSR-safe: all functions early-return when `window` is undefined, so imports
// from server components don't blow up.

const NS = "tapay";
const V = "v1";
const KEY_DRAFTS = "worklog-drafts";
const KEY_ADD_FORM = "worklog-add-form";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface StoredDrafts<T> {
  drafts: Record<string, T>;
  savedAt: number;
}

export interface StoredAddForm<F> {
  form: F;
  savedAt: number;
}

function draftsKey(userId: string, aid: string): string {
  return `${NS}:${KEY_DRAFTS}:${V}:${userId}:${aid}`;
}

function addFormKey(userId: string, aid: string): string {
  return `${NS}:${KEY_ADD_FORM}:${V}:${userId}:${aid}`;
}

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // QuotaExceededError or private-mode denial — nothing we can do; the app
    // keeps working with in-memory drafts.
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// readDrafts returns the persisted drafts slice for (userId, aid), or null if
// nothing is stored or the payload is malformed / stale. Callers should treat
// null as "no recovery available" and continue with an empty draft map.
export function readDrafts<T>(userId: string, aid: string): StoredDrafts<T> | null {
  if (!userId || !aid) return null;
  const raw = safeGet(draftsKey(userId, aid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDrafts<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (!parsed.drafts || typeof parsed.drafts !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

// writeDrafts persists the current drafts slice. Empty slices are cleared
// instead of writing an empty object, so the recovery banner never fires on
// "you had 0 unsaved edits."
export function writeDrafts<T>(userId: string, aid: string, drafts: Record<string, T>): void {
  if (!userId || !aid) return;
  if (Object.keys(drafts).length === 0) {
    clearDrafts(userId, aid);
    return;
  }
  const payload: StoredDrafts<T> = { drafts, savedAt: Date.now() };
  safeSet(draftsKey(userId, aid), JSON.stringify(payload));
}

export function clearDrafts(userId: string, aid: string): void {
  if (!userId || !aid) return;
  safeRemove(draftsKey(userId, aid));
}

// readAddForm / writeAddForm / clearAddForm — same shape but for the "add
// new row" modal state, so a half-filled form survives a modal-close reopen.
export function readAddForm<F>(userId: string, aid: string): StoredAddForm<F> | null {
  if (!userId || !aid) return null;
  const raw = safeGet(addFormKey(userId, aid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAddForm<F>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (!parsed.form) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAddForm<F>(userId: string, aid: string, form: F): void {
  if (!userId || !aid) return;
  const payload: StoredAddForm<F> = { form, savedAt: Date.now() };
  safeSet(addFormKey(userId, aid), JSON.stringify(payload));
}

export function clearAddForm(userId: string, aid: string): void {
  if (!userId || !aid) return;
  safeRemove(addFormKey(userId, aid));
}

// sweepStale walks every key under our namespace and drops entries whose
// savedAt is older than MAX_AGE_MS (or missing / unparseable). Call once on
// page mount to keep long-lived tabs from accumulating cruft indefinitely.
export function sweepStale(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(`${NS}:`)) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) { doomed.push(k); continue; }
      try {
        const parsed = JSON.parse(raw) as { savedAt?: number };
        if (typeof parsed?.savedAt !== "number") { doomed.push(k); continue; }
        if (Date.now() - parsed.savedAt > MAX_AGE_MS) doomed.push(k);
      } catch {
        doomed.push(k);
      }
    }
    for (const k of doomed) safeRemove(k);
  } catch {
    // ignore — even iterating localStorage can throw in edge cases
  }
}
