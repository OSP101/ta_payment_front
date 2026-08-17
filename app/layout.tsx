import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import SWRProvider from "./components/SWRProvider";
import SessionActivityGuard from "./components/SessionActivityGuard";
import DemoBanner from "./components/DemoBanner";
import DemoGuidePanel from "./components/DemoGuidePanel";
import TopLoadingBar from "./components/TopLoadingBar";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "COCO TAS",
  description: "ระบบบริหารจัดการและเบิกจ่ายค่าตอบแทนผู้ช่วยสอน วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
          <DemoGuidePanel />
        </SWRProvider>
      </body>
    </html>
  );
}
