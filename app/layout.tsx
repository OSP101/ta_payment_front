import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { Kanit } from "next/font/google";
import "./globals.css";
import SWRProvider from "./components/SWRProvider";
import SessionActivityGuard from "./components/SessionActivityGuard";
import DemoBanner from "./components/DemoBanner";
import DemoGuidePanel from "./components/DemoGuidePanel";
import TopLoadingBar from "./components/TopLoadingBar";
import StaffWatermark from "./components/StaffWatermark";
import ErrorReportingUser from "./components/ErrorReportingUser";
import { getMe } from "./lib/session";
import { browserConfigFromEnv, CONFIG_META } from "./lib/errorReporting";
import { isThemePref, THEME_BOOT_SCRIPT, THEME_COOKIE, type ThemePref } from "./lib/preferences";
import PreferenceSync from "./components/PreferenceSync";
import InlineScript from "./components/InlineScript";
import { I18nProvider } from "./lib/i18n/client";
import { getLocale, getMessages, getT } from "./lib/i18n/server";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    // Server-rendered pages (the manual, the public /p links) give just their
    // own name; client pages set the same "name | COCO TAS" via useDocumentTitle.
    title: { default: "COCO TAS", template: "%s | COCO TAS" },
    description: t("ระบบบริหารจัดการและเบิกจ่ายค่าตอบแทนผู้ช่วยสอน วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น"),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // proxy.ts puts a fresh nonce on the CSP header of every request; Next
  // only stamps that nonce onto its own inline/runtime scripts for pages it
  // renders dynamically — a page prerendered as static HTML at build time
  // has no nonce baked into it at all, so its scripts fail CSP the instant
  // that build's HTML is served behind a per-request nonce (this bit
  // /login and a handful of other pages that had nothing forcing them
  // dynamic). connection() opts the entire tree under this layout out of
  // static rendering, so nonce-carrying pages are what actually get built.
  await connection();
  // Only an admin/staff session is handed down; everyone else gets no
  // watermark and no client-side /me fetch. login and logout both
  // router.refresh(), so this layout re-renders when the account changes.
  const me = await getMe();
  const staffMe = me && (me.roles.includes("admin") || me.roles.includes("staff")) ? me : null;
  // Read per request, not at build time: the image is built before the
  // GlitchTip project (and so the DSN) exists. Absent = reporting off, and
  // instrumentation-client.ts never starts the SDK.
  const errorReporting = browserConfigFromEnv();
  // Theme: the account's choice wins when signed in (it follows the person
  // across devices); otherwise this browser's cookie; otherwise the device.
  // An explicit light/dark is rendered straight into <html>, so no script is
  // involved; only "system" needs THEME_BOOT_SCRIPT to ask the device before
  // first paint. suppressHydrationWarning because that script may have
  // changed <html>'s class by the time React hydrates.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme: ThemePref = isThemePref(me?.ui_theme) ? me.ui_theme
    : isThemePref(cookieTheme) ? cookieTheme : "system";
  const themeClass = theme === "system" ? "" : ` ${theme}`;
  const nonce = theme === "system" ? (await headers()).get("x-nonce") ?? undefined : undefined;
  // Language: same precedence as the theme (account, then cookie, then Thai).
  // Thai readers get an empty dictionary — the keys are the Thai text.
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <html lang={locale} suppressHydrationWarning data-theme-pref={theme}
          data-theme={theme === "system" ? undefined : theme}
          className={`${kanit.variable} h-full antialiased${themeClass}`}>
      <head>
        {theme === "system" && <InlineScript nonce={nonce} html={THEME_BOOT_SCRIPT} />}
        {errorReporting && <meta name={CONFIG_META} content={JSON.stringify(errorReporting)} />}
      </head>
      {/* paddingRight reserves space for DemoGuidePanel's fixed dock — see
          that component's own doc comment. 0px outside demo mode (the var
          is unset), so this is a no-op for every non-demo page/session. */}
      <body className="min-h-full flex flex-col" style={{ paddingRight: "var(--demo-panel-w, 0px)" }}>
        <TopLoadingBar />
        <I18nProvider locale={locale} messages={messages}>
        <SWRProvider>
          <DemoBanner />
          <SessionActivityGuard />
          {children}
          {/* DemoGuidePanel pulls in useScenarioEngine, which calls
              useSearchParams() unconditionally (before its own `if
              (!active) return null`, since hooks can't be conditional) —
              Suspense here is what lets /_not-found and other fully-static
              routes prerender instead of failing the build. */}
          <Suspense fallback={null}>
            <DemoGuidePanel />
          </Suspense>
          <StaffWatermark initial={staffMe} />
          <PreferenceSync theme={theme} locale={locale} signedIn={!!me} />
          {errorReporting && <ErrorReportingUser id={me?.id ?? null} role={me ? actingRole(me.roles) : null} />}
        </SWRProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

// The one role an error report is filed under: the most privileged the
// account holds, the same rule the API's audit rows use (actingRole in
// ta_payment_back/internal/handler/observability.go).
function actingRole(roles: string[]): string | null {
  for (const r of ["admin", "staff", "lecturer", "ta"]) if (roles.includes(r)) return r;
  return roles[0] ?? null;
}
