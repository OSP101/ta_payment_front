// Keep the latest successful read/write together. A background revalidation
// replaces the data on screen, so its edit snapshot must advance as well.
// Snapshots are PostgreSQL xmin:xmax:in-progress lists, signed by the server.
// Comparing visibility prevents a slow older response from rolling us back.
const editViews = new Map<string, string>();
const intents = new Map<string, {key: string; at: number}>();

type Snapshot = { max: bigint; active: Set<bigint> };
function snapshot(token: string): Snapshot | undefined {
  try {
    const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(encoded);
    if (!/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(raw)) return;
    const [, max, active] = raw.split(":");
    return { max: BigInt(max), active: new Set(active ? active.split(",").map(BigInt) : []) };
  } catch { return; }
}

function atLeastAsRecent(candidate: string, current: string): boolean {
  const next = snapshot(candidate);
  const previous = snapshot(current);
  // Unknown formats remain opaque. The server still validates every token.
  if (!next || !previous) return true;
  if (next.max < previous.max) return false;
  // A transaction visible in the current view must remain visible in the next.
  for (const id of next.active) {
    if (id < previous.max && !previous.active.has(id)) return false;
  }
  return true;
}

export function resetEditViews() { editViews.clear(); intents.clear(); }

export function rememberEditViews(prefix: string, response: Response, write: boolean) {
  if (typeof window === "undefined" || !response.ok) return;
  let views: Record<string, string>;
  try { views = JSON.parse(response.headers.get("X-Edit-Views") ?? "{}"); } catch { return; }
  if (!views || typeof views !== "object" || Array.isArray(views)) return;
  const marker = `${prefix}|`;
  for (const [scope, token] of Object.entries(views)) {
    if (typeof token !== "string" || !token) continue;
    // A collection write does not mean its other rows have been reviewed.
    if (write && scope.endsWith(":*")) continue;
    const key = marker + scope;
    const current = editViews.get(key);
    if (current && !atLeastAsRecent(token, current)) continue;
    if (!scope.endsWith(":*") && !scope.startsWith("table:")) {
      const collection = editViews.get(marker + scope.split(":")[0] + ":*");
      if (collection && !atLeastAsRecent(token, collection)) continue;
    }
    editViews.set(key, token);
    if (scope.endsWith(":*")) {
      // The server prefers an exact token over a collection token. An old exact
      // token (including one from our last write) must not mask a fresh list.
      const family = marker + scope.slice(0, -1);
      for (const [otherKey, otherToken] of editViews) {
        if (otherKey !== key && otherKey.startsWith(family) && atLeastAsRecent(token, otherToken)) {
          editViews.delete(otherKey);
        }
      }
    }
  }
}

export async function editRequestHeaders(prefix: string, path: string, init: RequestInit): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return {};
  const views: Record<string, string> = {};
  const marker = `${prefix}|`;
  for (const [key, token] of editViews) if (key.startsWith(marker)) views[key.slice(marker.length)] = token;
  // Keep below the server's header limit. Collection snapshots are retained;
  // exact rows are the most recently visited when many courses are opened.
  const entries = Object.entries(views);
  while (JSON.stringify(Object.fromEntries(entries)).length > 6000) {
    const index = entries.findIndex(([scope]) => !scope.endsWith(":*"));
    if (index < 0) { entries.shift(); continue; }
    entries.splice(index,1);
  }
  const headers: Record<string, string> = {"X-Edit-Views": JSON.stringify(Object.fromEntries(entries))};
  // Every mutation receives a reusable intent ID, including PUT/PATCH whose
  // implementation may also send notifications or create audit entries.
  // No request payload is persisted.
  if (["POST","PUT","PATCH","DELETE"].includes(method)) {
    let description = typeof init.body === "string" ? init.body : "";
    if (init.body instanceof FormData) description = JSON.stringify(Array.from(init.body.entries()).map(([key,value]) => [key, typeof value === "string" ? value : [value.name,value.size,value.lastModified]]));
    const bytes = new TextEncoder().encode(`${prefix}|${method}|${path}|${description}`);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
    const now = Date.now();
    let intent = intents.get(hash);
    if (!intent || now - intent.at > 60_000) {
      intent = {key: crypto.randomUUID(), at: now}; intents.set(hash,intent);
    }
    headers["Idempotency-Key"] = intent.key;
    for (const [key,value] of intents) if (now-value.at>60_000) intents.delete(key);
  }
  return headers;
}
