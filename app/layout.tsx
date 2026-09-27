import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Kanit } from "next/font/google";
import "./globals.css";
import SWRProvider from "./components/SWRProvider";
import SessionActivityGuard from "./components/SessionActivityGuard";
import DemoBanner from "./components/DemoBanner";
import DemoGuidePanel from "./components/DemoGuidePanel";
import TopLoadingBar from "./components/TopLoadingBar";
import StaffWatermark from "./components/StaffWatermark";
import { getMe } from "./lib/session";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // Server-rendered pages (the manual, the public /p links) give just their
  // own name; client pages set the same "name | COCO TAS" via useDocumentTitle.
  title: { default: "COCO TAS", template: "%s | COCO TAS" },
  description: "ระบบบริหารจัดการและเบิกจ่ายค่าตอบแทนผู้ช่วยสอน วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น",
};

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
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      {/* paddingRight reserves space for DemoGuidePanel's fixed dock — see
          that component's own doc comment. 0px outside demo mode (the var
          is unset), so this is a no-op for every non-demo page/session. */}
      <body className="min-h-full flex flex-col" style={{ paddingRight: "var(--demo-panel-w, 0px)" }}>
        <TopLoadingBar />
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
        </SWRProvider>
      </body>
    </html>
  );
}
