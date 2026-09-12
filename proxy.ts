import { NextResponse, type NextRequest } from "next/server";

/**
 * QUAL-02: Content-Security-Policy ต้องออกจาก proxy.ts (เดิมชื่อ middleware.ts
 * — Next.js 16 เปลี่ยนชื่อ file convention นี้เป็น proxy, ดู
 * node_modules/next/dist/docs/.../file-conventions/proxy.md) ไม่ใช่
 * next.config.ts เพราะ Next ฝัง inline script ของตัวเองในทุกหน้า จึงต้องมี
 * nonce ที่ต่างกันต่อรีเควสต์ — header ใน next.config.ts เป็นค่าคงที่
 * ใส่ nonce ไม่ได้ Next จะอ่าน nonce จาก response header นี้เองแล้วแปะให้
 * script/style ที่มันฝังเอง (ดู proxy.md's "Adding a nonce" section)
 *
 * connect-src จำกัดไว้ที่ 'self' (บวก NEXT_PUBLIC_API_ORIGIN ถ้าถูกตั้ง — ดู
 * app/lib/api.ts's UPLOAD_ORIGIN, ค่าเริ่มต้นใน deploy/docker-compose.yml คือ
 * "" คือ same-origin ผ่าน next.config.ts rewrites) โดยตั้งใจ: นี่คือบรรทัดที่
 * เปลี่ยน XSS จาก "ดูดไฟล์บัตรประชาชนของทุกคนออกไปได้" เป็น "ยิงรีเควสต์ออก
 * นอกโดเมนไม่ได้" ถ้าต้องเพิ่มปลายทางภายนอก ให้เพิ่มทีละอันพร้อมเหตุผล ห้ามใส่ *
 *
 * ก่อนใส่แบบไม่มี -Report-Only เต็มรูป ควรทดสอบทุกหน้าหลักก่อน โดยเฉพาะ
 * เส้นทางอัปโหลดถ้า NEXT_PUBLIC_API_ORIGIN ถูกตั้งเป็นค่าอื่นที่ไม่ใช่ "" —
 * แนะนำให้ deploy ด้วย Content-Security-Policy-Report-Only ก่อน 1 สัปดาห์
 * เก็บ violation แล้วค่อยสลับเป็น Content-Security-Policy จริง
 */
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const connectSrc = ["'self'"];
  const uploadOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
  if (uploadOrigin) connectSrc.push(uploadOrigin);

  const csp = [
    `default-src 'self'`,
    // 'unsafe-eval' in dev only — React's dev-mode error reconstruction
    // needs it; neither React nor Next use eval in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(" ")}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
