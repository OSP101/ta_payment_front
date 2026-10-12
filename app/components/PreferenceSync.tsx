"use client";
import { useEffect } from "react";
import { readPrefCookie, THEME_COOKIE, writePrefCookie, type ThemePref } from "../lib/preferences";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n/core";

/**
 * Two page-wide theme chores. Renders nothing.
 *
 * Paper is always light: for the length of a print (Ctrl+P or a page's own
 * print button — the timetable form, appointment orders) the dark class comes
 * off <html>, then goes back. Without this a dark-theme print put light-grey
 * text on white paper, since browsers drop backgrounds but keep text colour.
 *
 * When signed in, the account's saved theme and language are copied into this browser's
 * cookie, so a pre-login page (or the page after signing out) still opens in
 * the theme the person chose — even on a device where they never touched the
 * switch.
 */
export default function PreferenceSync({ theme, locale, signedIn }: { theme: ThemePref; locale: Locale; signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;
    if (readPrefCookie(THEME_COOKIE) !== theme) writePrefCookie(THEME_COOKIE, theme);
    // The API reads this cookie too, to answer errors in the same language.
    if (readPrefCookie(LOCALE_COOKIE) !== locale) writePrefCookie(LOCALE_COOKIE, locale);
  }, [theme, locale, signedIn]);

  useEffect(() => {
    const html = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = html.classList.contains("dark");
      if (!wasDark) return;
      html.classList.replace("dark", "light");
      html.dataset.theme = "light";
    };
    const after = () => {
      if (!wasDark) return;
      html.classList.replace("light", "dark");
      html.dataset.theme = "dark";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
