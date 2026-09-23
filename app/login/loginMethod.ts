/**
 * Which way this browser last signed in, so /login can open with the email
 * form already expanded for people who use it (staff, admin) and folded for
 * everyone who uses KKU SSO.
 *
 * A cookie rather than localStorage because page.tsx reads it on the server:
 * the form renders in the right state in the first HTML, with no jump after
 * hydration. It is a UI preference, not a credential — nothing trusts it.
 *
 * Kept out of LoginForm.tsx on purpose: a value exported from a "use client"
 * module reaches a server component as a client reference, not as the string.
 */
export const LOGIN_METHOD_COOKIE = "login_method";

export type LoginMethod = "email" | "sso";

export function rememberLoginMethod(method: LoginMethod) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Path=/login covers /login/sso too; nothing else needs to see it.
  document.cookie = `${LOGIN_METHOD_COOKIE}=${method}; Path=/login; Max-Age=31536000; SameSite=Lax${secure}`;
}
