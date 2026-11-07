// Tokens represent the FIRST data read by this browser, not the latest SWR
// refresh. Replacing them on a background refresh could silently permit an
// old open form to overwrite somebody else's change.
const readViews = new Map<string, string>();
const ownWrites = new Map<string, string>();
const intents = new Map<string, {key: string; at: number}>();

export function resetEditViews() { readViews.clear(); ownWrites.clear(); intents.clear(); }

export function rememberEditViews(prefix: string, response: Response, write: boolean) {
  if (typeof window === "undefined" || !response.ok) return;
  let views: Record<string, string>;
  try { views = JSON.parse(response.headers.get("X-Edit-Views") ?? "{}"); } catch { return; }
  for (const [scope, token] of Object.entries(views)) {
    if (typeof token !== "string") continue;
    const key = `${prefix}|${scope}`;
    if (write) { if (!scope.endsWith(":*")) ownWrites.set(key, token); }
    else if (!readViews.has(key)) readViews.set(key, token);
  }
}

export async function editRequestHeaders(prefix: string, path: string, init: RequestInit): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return {};
  const views: Record<string, string> = {};
  const marker = `${prefix}|`;
  for (const [key, token] of readViews) if (key.startsWith(marker)) views[key.slice(marker.length)] = token;
  for (const [key, token] of ownWrites) if (key.startsWith(marker)) views[key.slice(marker.length)] = token;
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
