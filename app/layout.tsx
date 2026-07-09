import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import SWRProvider from "./components/SWRProvider";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TA Payment",
  description: "ระบบบริหารจัดการและเบิกจ่ายค่าตอบแทนผู้ช่วยสอน วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
