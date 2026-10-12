import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getMe } from "../session";
import { DEFAULT_LOCALE, formatDate, intlLocale, isLocale, LOCALE_COOKIE, translate, type Locale, type Messages, type Vars } from "./core";
import en from "../../../messages/en.json";

/** The reader's language: the account's choice when signed in (it follows
 *  them across devices), otherwise this browser's cookie, otherwise Thai. */
export const getLocale = cache(async (): Promise<Locale> => {
  const me = await getMe();
  if (me && isLocale(me.ui_locale)) return me.ui_locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
});

/** The dictionary for a locale. Thai needs none: the keys are Thai. */
export function getMessages(locale: Locale): Messages {
  return locale === "en" ? (en as Messages) : {};
}

/** t() for server components. */
export async function getT() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  const t = (key: string, vars?: Vars) => translate(messages, key, vars);
  return { t, locale, intl: intlLocale(locale), fmtDate: (iso?: string | null) => formatDate(locale, iso) };
}
