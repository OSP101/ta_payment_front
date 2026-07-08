import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Me } from "./api";

const backend = process.env.API_URL ?? "http://localhost:8080";

// Server-side helper: fetch current user by forwarding cookies.
export async function getMe(): Promise<Me | null> {
  const c = await cookies();
  const token = c.get("access_token")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${backend}/api/v1/me`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

export async function requireRole(...roles: string[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!roles.some(r => me.roles.includes(r))) redirect("/");
  return me;
}

// Server-side fetch of the TA profile approval status. Returns "pending",
// "submitted", "approved", "rejected", "needs_fix", or null when there is no
// profile row yet (fresh account). Never throws — the layout must render
// even when the network call fails.
export async function getTAProfileStatus(): Promise<string | null> {
  const c = await cookies();
  const token = c.get("access_token")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${backend}/api/v1/me/profile`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const b = (await res.json()) as { status?: string };
    return b.status ?? null;
  } catch {
    return null;
  }
}

// Client-side (browser) — never expose to server components
export function clientApi() { return api; }
