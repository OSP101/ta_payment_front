"use client";
import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";
import { I18nProvider as AriaI18nProvider } from "react-aria-components";
import {
  DEFAULT_LOCALE, formatDate, intlLocale, interpolate, translate, monthName, displayYear,
  type Locale, type Messages, type Vars,
} from "./core";

type Ctx = { locale: Locale; messages: Messages };
const I18nContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, messages: {} });

// Module-level copy for code that is not a component (toast, api error text,
// confirm dialogs). Browser only: during SSR a module variable would be shared
// between requests, so these helpers return the Thai key there — none of them
// run during SSR anyway (they fire on clicks and fetch failures).
let clientCtx: Ctx = { locale: DEFAULT_LOCALE, messages: {} };

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  if (typeof window !== "undefined") clientCtx = value;
  // HeroUI's fields (time segments, calendars) word their own labels through
  // react-aria. Thai readers keep react-aria's default (the browser), as
  // before this provider existed; English readers get English there too.
  const inner = locale === "en" ? <AriaI18nProvider locale="en-GB">{children}</AriaI18nProvider> : children;
  return <I18nContext.Provider value={value}>{inner}</I18nContext.Provider>;
}

export type TFn = ((key: string, vars?: Vars) => string) & {
  /** Like t(), but a var may be a React node: t.rich("ส่ง {course} แล้ว", { course: <b>…</b> }). */
  rich: (key: string, vars: Record<string, ReactNode>) => ReactNode;
};

function makeT(ctx: Ctx): TFn {
  const t = ((key: string, vars?: Vars) => translate(ctx.messages, key, vars)) as TFn;
  t.rich = (key, vars) => {
    const s = translate(ctx.messages, key);
    const out: ReactNode[] = [];
    let last = 0;
    s.replace(/\{(\w+)\}/g, (m, k: string, at: number) => {
      out.push(s.slice(last, at));
      out.push(<Fragment key={at}>{k in vars ? vars[k] : m}</Fragment>);
      last = at + m.length;
      return m;
    });
    out.push(s.slice(last));
    return <>{out}</>;
  };
  return t;
}

export type I18n = {
  locale: Locale;
  t: TFn;
  /** For toLocaleString / toLocaleDateString / Intl: "th-TH" or "en-GB". */
  intl: string;
  /** ISO date → "15 มิ.ย. 2569" / "15 Jun 2026". Replaces thaiDate(). */
  fmtDate: (iso?: string | null, opts?: { long?: boolean }) => string;
  monthName: (m: number, short?: boolean) => string;
  /** Calendar year for display: BE in Thai, CE in English. */
  year: (ce: number) => number;
};

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  return useMemo(() => ({
    locale: ctx.locale,
    t: makeT(ctx),
    intl: intlLocale(ctx.locale),
    fmtDate: (iso, opts) => formatDate(ctx.locale, iso, opts),
    monthName: (m, short = true) => monthName(ctx.locale, m, short),
    year: ce => displayYear(ctx.locale, ce),
  }), [ctx]);
}

/** Shortcut when only t is needed. */
export function useT(): TFn {
  return useI18n().t;
}

/** t() for non-component code that runs in the browser (toasts, thrown API
 *  errors, confirm()). Returns the Thai key during SSR. */
export function tc(key: string, vars?: Vars): string {
  return translate(clientCtx.messages, key, vars);
}

/** The browser's current locale for non-component code. */
export function clientLocale(): Locale {
  return clientCtx.locale;
}

export { interpolate };
export { msg } from "./core";
