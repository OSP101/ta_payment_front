# ta_payment_front

หน้าเว็บของ **ระบบบริหารจัดการและเบิกจ่ายค่าตอบแทนผู้ช่วยสอน (TA Payment System)**
ของวิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น เขียนด้วย [Next.js](https://nextjs.org)
(App Router) + [HeroUI React v3](https://heroui.com) คุยกับ API หลังบ้านที่
[`ta_payment_back`](../ta_payment_back) ผ่าน rewrite เดียว (`/api/v1/*`) ให้เบราว์เซอร์
เห็นเป็น origin เดียวกันเสมอ

ดูภาพรวมการดีพลอยทั้ง stack (nginx + frontend + backend + Postgres + ClamAV) ที่
[`deploy/README.md`](../deploy/README.md) และคู่มือผู้ใช้งาน/ผู้ดูแลระบบที่ `docs/manual/`
(เมื่อจัดทำแล้ว)

## เริ่มต้นพัฒนา

ต้องมี backend รันอยู่ก่อน (ดู [`ta_payment_back/README`](../ta_payment_back) หรือใช้
`docker compose up` ที่ `deploy/`) แล้วจึง

```bash
cp .env.example .env.local   # ปรับค่าตามต้องการ ค่า default ใช้กับ backend local ได้เลย
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

ตัวแปรแวดล้อมหลัก (ดูรายละเอียดและเหตุผลของแต่ละตัวใน [`.env.example`](.env.example)):

| ตัวแปร | ความหมาย |
|---|---|
| `API_URL` | ปลายทางที่ Next rewrite ส่ง `/api/v1/*` ไปหา (ฝั่งเซิร์ฟเวอร์) |
| `NEXT_PUBLIC_API_ORIGIN` | origin ที่การอัปโหลดไฟล์ยิงตรง โดยข้าม rewrite (ว่าง = ผ่าน rewrite เหมือนปกติ) |
| `SITE_URL` | origin สาธารณะของเว็บนี้ ใช้สร้างลิงก์ `og:url`/`og:image` แบบ absolute สำหรับ preview การประกาศที่แชร์ผ่าน LINE/Facebook |

## โครงสร้างหน้าเว็บ (`app/`)

แบ่งตามบทบาทผู้ใช้งานตาม route group:

| เส้นทาง | บทบาท | เนื้อหาโดยสรุป |
|---|---|---|
| `app/staff/` | เจ้าหน้าที่ / ผู้ดูแลระบบ | ตั้งค่าปี-เทอม-เกณฑ์ค่าตอบแทน, นำเข้าตารางสอน, จัดการผู้ใช้, อนุมัติคำขอ TA, ตรวจเอกสาร, ตรวจ/ส่งออกเบิกจ่าย, ประกาศ, วันหยุด/ชดเชย, audit log |
| `app/lecturer/` | อาจารย์ผู้รับผิดชอบรายวิชา | ดูรายวิชา, เสนอชื่อ TA (พร้อมเครื่องมือวางแผนงบ), กำหนดวันชดเชย, อนุมัติ/ปฏิเสธบันทึกเวลา |
| `app/ta/` | นักศึกษาผู้ช่วยสอน | กรอกโปรไฟล์+เอกสาร, ตารางเรียน, บันทึกเวลาปฏิบัติงาน, ดูสถานะรายเดือน |
| `app/executive/` | ผู้บริหาร (อ่านอย่างเดียว) | แดชบอร์ดภาพรวมและรายงานวิเคราะห์งบประมาณ |
| `app/p/` | สาธารณะ (ไม่ต้องล็อกอิน) | หน้าประกาศ/ติดตามความคืบหน้าเอกสารที่แชร์ผ่านลิงก์ |
| `app/demo/` | ห้องทดลอง (sandbox) | สภาพแวดล้อมแยกต่างหากสำหรับทดลองใช้ระบบโดยไม่กระทบข้อมูลจริง |

โค้ดที่ใช้ร่วมกันอยู่ใน `app/components/` (UI primitives ที่ `app/components/ui.tsx`) และ
`app/lib/` (API client, การจัดรูปแบบ, ค่าคงที่)

## เอกสาร HeroUI

โปรเจกต์นี้ปักหมุดที่ HeroUI React **v3** ซึ่งต่างจาก v2 หลายจุด — ก่อนแก้ไขคอมโพเนนต์ UI
ใด ๆ ให้ค้นเอกสารที่ `.heroui-docs/react` ก่อนเสมอ (ดูรายละเอียดใน `CLAUDE.md`/`AGENTS.md`)

## คำสั่งที่ใช้บ่อย

```bash
npm run dev      # dev server พร้อม hot reload
npm run build    # production build
npm run start    # รัน production build ที่ build ไว้แล้ว
npx tsc --noEmit # ตรวจชนิดข้อมูลทั้งโปรเจกต์
```
