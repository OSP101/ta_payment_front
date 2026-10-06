import { cookies } from "next/headers";
import LoginForm, { type SSOConfig } from "./LoginForm";
import { type LoginNotices } from "./LoginNotices";
import { LOGIN_METHOD_COOKIE } from "./loginMethod";
import { backendURL } from "../lib/site";

/**
 * Asks the backend whether KKU SSO is on while rendering, so the KKU button
 * arrives in the same HTML as the form instead of popping in after hydration
 * and pushing the form down.
 *
 * Always production's /api/v1, never a demo slot: /login is real auth (see
 * LoginForm's setDemoApiPrefix(null)). The answer is config, not per-user,
 * and the backend marks it no-store, so it is fetched on every render.
 */
async function getSSOConfig(): Promise<SSOConfig | null | undefined> {
  try {
    const res = await fetch(`${backendURL()}/api/v1/auth/sso/url`, {
      cache: "no-store",
      // A stalled backend must not hold the login page hostage; LoginForm
      // falls back to asking from the browser.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return undefined;
    const r = (await res.json()) as { enabled: boolean; url?: string; logout_url?: string };
    return r.enabled && r.url ? { url: r.url, logoutUrl: r.logout_url ?? null } : null;
  } catch {
    return undefined;
  }
}

/**
 * The announcement cards (open TA-request window, claim-document stage). Same
 * rules as the SSO lookup: rendered into the first HTML so nothing pops in, a
 * short timeout so a slow backend cannot hold the page, and any failure just
 * means no cards.
 */
async function getLoginNotices(): Promise<LoginNotices | null> {
  try {
    const res = await fetch(`${backendURL()}/api/v1/public/login-notices`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    return (await res.json()) as LoginNotices;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sso, params, jar, notices] = await Promise.all([getSSOConfig(), searchParams, cookies(), getLoginNotices()]);
  // The email form starts folded behind the KKU button, except when that
  // would leave someone looking for it: SSO is off or its state unknown,
  // they just set a new password (so they are about to type it), or this
  // browser signed in with email last time.
  const emailFormOpen =
    !sso ||
    params.reason === "password_changed" ||
    jar.get(LOGIN_METHOD_COOKIE)?.value === "email";
  return <LoginForm initialSso={sso} emailFormOpen={emailFormOpen} notices={notices} />;
}
