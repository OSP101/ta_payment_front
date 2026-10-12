import { api } from "./api";
import { LOCALE_COOKIE, type Locale } from "./i18n/core";

/**
 * Display preferences: colour theme now, interface language next.
 *
 * Kept in two places on purpose. The account (users.ui_theme, migration
 * 0153) is the source of truth for a signed-in user, so the choice follows
 * them to every device. The cookie is what the root layout reads on every
 * request, so the very first paint is already in the right theme — including
 * /login, where there is no account yet. app/layout.tsx prefers the account
 * value whenever there is one; PreferenceSync copies it back into the cookie.
 */

export type ThemePref = "light" | "dark" | "system";

export const THEME_COOKIE = "ui_theme";

export function isThemePref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

const YEAR = 60 * 60 * 24 * 365;

export function writePrefCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

export function readPrefCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1] : null;
}

/** Puts the theme on <html> right now, without waiting for a re-render.
 *  Must stay in step with THEME_BOOT_SCRIPT and app/layout.tsx. */
export function applyTheme(pref: ThemePref) {
  const html = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.dataset.themePref = pref;
  html.classList.toggle("dark", dark);
  html.classList.toggle("light", !dark);
  html.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: pref }));
}

/** Fired by applyTheme so every ThemeSwitch on the page (header menu,
 *  account page) shows the same choice. */
export const THEME_EVENT = "ui-theme-change";

/** The choice in force on this page — what app/layout.tsx rendered, or what
 *  applyTheme set since. */
export function currentThemePref(): ThemePref {
  const v = document.documentElement.dataset.themePref;
  return isThemePref(v) ? v : "system";
}

/** Applies, remembers in the cookie, and — when signed in — saves to the
 *  account. A failed save is not worth an error: the cookie already holds
 *  the choice on this device. */
export async function setThemePref(pref: ThemePref, signedIn: boolean) {
  applyTheme(pref);
  writePrefCookie(THEME_COOKIE, pref);
  if (signedIn) {
    try { await api.put("/me/preferences", { theme: pref }); } catch { /* cookie still holds it */ }
  }
}

/**
 * Inline script for <head>, run before first paint. Only "system" needs it:
 * an explicit light/dark is rendered into <html> on the server already. It
 * also follows the device switching between light and dark while the page
 * is open.
 */
export const THEME_BOOT_SCRIPT = `(function(){var h=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){if(h.dataset.themePref!=="system")return;var d=m.matches;h.classList.toggle("dark",d);h.classList.toggle("light",!d);h.dataset.theme=d?"dark":"light"}a();m.addEventListener("change",a)})()`;

/** Saves the interface language the same two ways as the theme. The caller
 *  must then router.refresh(): unlike the theme, the words come from the
 *  server render (and the dictionary with them). */
export async function setLocalePref(locale: Locale, signedIn: boolean) {
  writePrefCookie(LOCALE_COOKIE, locale);
  document.documentElement.lang = locale;
  if (signedIn) {
    try { await api.put("/me/preferences", { locale }); } catch { /* cookie still holds it */ }
  }
}
