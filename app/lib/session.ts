import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Me } from "./api";

const backend = process.env.API_URL ?? "http://localhost:8080";

/**
 * BETA-only: which backend URL + cookie a server-rendered request should
 * use — production's own "/api/v1" + "access_token", or a claimed demo
 * slot's own path + "demo_access_token" (see internal/demo/auth.go, which
 * sets both cookies at Path "/" specifically so a server component
 * rendering ANY page — not just one under app/demo — can read them; every
 * role layout (app/staff/layout.tsx and its siblings) calls requireRole
 * before rendering anything, so without this every one of those would
 * redirect a demo visitor straight to /login).
 */
async function resolveSession(): Promise<{ apiBase: string; cookieHeader: string } | null> {
  const c = await cookies();
  const demoToken = c.get("demo_access_token")?.value;
  const demoBasePath = c.get("demo_base_path")?.value;
  if (demoToken && demoBasePath) {
    return { apiBase: `${backend}${demoBasePath}`, cookieHeader: `demo_access_token=${demoToken}` };
  }
  const token = c.get("access_token")?.value;
  if (!token) return null;
  return { apiBase: `${backend}/api/v1`, cookieHeader: `access_token=${token}` };
}

// Server-side helper: fetch current user by forwarding cookies.
export async function getMe(): Promise<Me | null> {
  const session = await resolveSession();
  if (!session) return null;
  try {
    const res = await fetch(`${session.apiBase}/me`, {
      headers: { Cookie: session.cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

/**
 * Mirrors mfaMandatoryFor in internal/handler/middleware.go: an admin/staff
 * account, or any account carrying the executive flag, must enrol TOTP
 * before touching anything beyond GET /me and GET /me/2fa/* — AccountGuard
 * 403s every other API call with mfa_setup_required until it does.
 *
 * Checked here too (not just left to the client-side 403 handler in api.ts)
 * so the redirect happens during the server render, before the page ships
 * and fires its own data fetches — otherwise a freshly created staff/admin
 * account saw the real page for a couple of seconds before one of those
 * fetches 403'd and bounced it to /setup-2fa.
 */
export function mfaSetupRequired(me: Me): boolean {
  return !me.totp_enabled && (me.roles.includes("admin") || me.roles.includes("staff") || !!me.is_executive);
}

export async function requireRole(...roles: string[]): Promise<Me> {
  const c = await cookies();
  const me = await getMe();
  if (!me) {
    // A visitor who has a demo_base_path cookie but no (or an expired)
    // demo_access_token is mid-sandbox, not mid-production — send them back
    // to /demo to re-enter, never to /login, which authenticates against a
    // real account they almost certainly don't have.
    redirect(c.get("demo_base_path")?.value ? "/demo" : "/login");
  }
  if (!roles.some(r => me.roles.includes(r))) redirect("/");
  // Demo slots never enforce mandatory 2FA (Cfg.IsDemoSlot skips AccountGuard's
  // mustEnroll branch entirely — see mfaSetupRequired's own comment), so a demo
  // staff/admin walkthrough account's real totp_enabled: false must not bounce
  // it to /setup-2fa here.
  if (!c.get("demo_base_path")?.value && mfaSetupRequired(me)) redirect("/setup-2fa");
  return me;
}

// Server-side fetch of the TA profile approval status. Returns "pending",
// "submitted", "approved", "rejected", "needs_fix", or null when there is no
// profile row yet (fresh account). Never throws — the layout must render
// even when the network call fails.
export async function getTAProfileStatus(): Promise<string | null> {
  const session = await resolveSession();
  if (!session) return null;
  try {
    const res = await fetch(`${session.apiBase}/me/profile`, {
      headers: { Cookie: session.cookieHeader },
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
