import { type DocPage, text, callout, table } from "../types";
import { workflowBlocks, concurrentEditHelp, monthlyPayoutBlocks } from "../workflow-content";
import { scenarioBlocks } from "../sequence-scenarios";

const SECTION = "ลำดับการทำงาน (Sequence Diagram)";

export const flowPages: DocPage[] = [
  /* ================================================================ common */
  {
    slug: "flows/overview",
    audience: "common",
    section: SECTION,
    order: 200,
    title: "ภาพรวมตลอดภาคเรียน",
    description: "ใครทำอะไร ส่งต่อให้ใคร ตั้งแต่เตรียมภาคเรียนจนส่งเอกสารให้การเงิน",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "ลำดับการทำงาน", "ขั้นตอนทั้งหมด", "ภาพรวม", "flow", "workflow", "กระบวนการ"],
    blocks: [
      ...scenarioBlocks("overview", "th"),
    ],
    related: ["common:intro", "common:flows/login"],
  },

  {
    slug: "flows/login",
    audience: "common",
    section: SECTION,
    order: 201,
    title: "การเข้าสู่ระบบ",
    description: "ระบบตรวจตัวตนอย่างไร ทั้งเข้าด้วย KKU Account อีเมลกับรหัสผ่าน 2FA และการหมดเวลาใช้งาน",
    since: "1.2",
    routes: [],
    keywords: ["sequence diagram", "แผนภาพลำดับ", "เข้าสู่ระบบ", "sso", "kku account", "2fa", "รหัสผ่านชั่วคราว", "เซสชัน", "session", "ล็อกบัญชี"],
    blocks: [
      ...scenarioBlocks("login", "th"),
      ...scenarioBlocks("password", "th"),
      ...scenarioBlocks("session", "th"),
    ],
    related: ["common:first-login", "common:two-factor", "common:session-timeout"],
  },

  /* ================================================================== ta */
  {
    slug: "flows/documents",
    audience: "ta",
    section: SECTION,
    order: 210,
    title: "ส่งและตรวจเอกสารผู้ช่วยสอน",
    description: "ส่งเอกสารตามข้อมูลของ TA เจ้าหน้าที่ตรวจและแจ้งผล",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "เอกสาร", "pdpa", "แบบฟอร์มเจ้าหนี้", "สมุดบัญชี", "บัตรประชาชน", "ตีกลับเอกสาร"],
    blocks: [
      ...scenarioBlocks("documents", "th"),
    ],
    related: ["ta:documents/overview", "ta:documents/rejected", "staff:review"],
  },

  {
    slug: "flows/worklog",
    audience: "ta",
    section: SECTION,
    order: 211,
    title: "ลงเวลาและส่งอนุมัติ",
    description: "ระบบสร้างรายการลงเวลาจากตารางสอนอย่างไร ส่งอนุมัติแล้วไปที่ใคร และเกิดอะไรเมื่อพ้นวันปิดรับ",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "ลงเวลา", "สร้างอัตโนมัติ", "ส่งอนุมัติ", "วันปิดรับ", "ไม่ประสงค์ลงเวลา", "worklog"],
    blocks: [
      ...workflowBlocks("worklog", "th"),
    ],
    related: ["ta:worklog/generate", "ta:worklog/submit", "ta:reference/status", "lecturer:flows/approve-worklog"],
  },

  /* ============================================================= lecturer */
  {
    slug: "flows/ta-request",
    audience: "lecturer",
    section: SECTION,
    order: 220,
    title: "ขอผู้ช่วยสอนและการตัดสินคำขอ",
    description: "ส่งคำขอแล้วระบบตรวจอะไร ตัดสินอย่างไร และใครได้รับแจ้งเมื่อไร",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "คำขอ ta", "ขอผู้ช่วยสอน", "อนุมัติอัตโนมัติ", "เกณฑ์", "ยกเลิกคำขอ", "ตารางเรียน"],
    blocks: [
      ...workflowBlocks("request", "th"),
      ...scenarioBlocks("request-waiting", "th"),
      ...scenarioBlocks("request-cancel", "th"),
    ],
    related: ["lecturer:request/overview", "lecturer:request/submit", "lecturer:request/rejected-troubleshoot"],
  },

  {
    slug: "flows/approve-worklog",
    audience: "lecturer",
    section: SECTION,
    order: 221,
    title: "อนุมัติบันทึกเวลา",
    description: "อาจารย์อนุมัติ แก้ หรือส่งกลับบันทึกเวลา แล้วระบบแจ้งใครต่อ",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "อนุมัติบันทึกเวลา", "ส่งกลับ", "ตัดรายการ", "รายงาน"],
    blocks: [
      ...scenarioBlocks("approve-worklog", "th"),
      ...scenarioBlocks("return-worklog", "th"),
    ],
    related: ["lecturer:reports", "ta:flows/worklog", "lecturer:reference/status"],
  },

  /* ================================================================ staff */
  {
    slug: "flows/index",
    audience: "staff",
    section: SECTION,
    order: 199,
    title: "รวมแผนภาพทั้งหมด",
    description: "รายการแผนภาพลำดับการทำงานทุกเรื่อง แยกตามคู่มือที่อยู่",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "รวมแผนภาพ", "ลำดับการทำงาน", "กรรมการ"],
    blocks: [
      text(
        "หมวดนี้อธิบายระบบด้วย **แผนภาพลำดับการทำงาน (UML Sequence Diagram)** หนึ่งหน้าต่อหนึ่งเรื่อง " +
        "ทุกแผนภาพเขียนตามการทำงานจริงของระบบ ณ เวอร์ชันที่ระบุไว้ในหน้า เจ้าหน้าที่เปิดได้ทุกหน้า " +
        "หน้าที่อยู่ในคู่มืออาจารย์หรือผู้ช่วยสอน กดลิงก์ด้านล่างแล้วระบบจะสลับมุมมองให้",
      ),
      table(
        ["ลำดับ", "เรื่อง", "คู่มือ"],
        [
          ["1", "ภาพรวมตลอดภาคเรียน", "ทุกคน"],
          ["2", "การเข้าสู่ระบบ (KKU Account, รหัสผ่าน, 2FA, หมดเวลา)", "ทุกคน"],
          ["3", "เตรียมภาคเรียน", "เจ้าหน้าที่"],
          ["4", "สร้างบัญชีผู้ใช้", "เจ้าหน้าที่"],
          ["5", "ขอผู้ช่วยสอนและการตัดสินคำขอ", "อาจารย์"],
          ["6", "ออกคำสั่งแต่งตั้ง", "เจ้าหน้าที่"],
          ["7", "ส่งและตรวจเอกสารผู้ช่วยสอน", "ผู้ช่วยสอน"],
          ["8", "ลงเวลาและส่งอนุมัติ", "ผู้ช่วยสอน"],
          ["9", "อนุมัติบันทึกเวลา", "อาจารย์"],
          ["10", "ตรวจและส่งออกเอกสารเบิกจ่าย", "เจ้าหน้าที่"],
          ["11", "เดินเอกสารกระดาษและส่งการเงิน", "เจ้าหน้าที่"],
        ],
      ),

      callout(
        "tip",
        "ต้องการเอกสารไปประกอบการนำเสนอ เปิดหน้าที่ต้องการแล้วสั่งพิมพ์ (⌘P หรือ Ctrl+P) เลือกบันทึกเป็น PDF " +
        "แผนภาพเป็นตัวอักษรและเส้นจริง ไม่ใช่รูปภาพ จึงคมชัดทุกขนาดกระดาษ",
      ),
    ],
    related: [
      "common:flows/overview", "common:flows/login", "staff:flows/term-setup", "staff:flows/accounts",
      "lecturer:flows/ta-request", "staff:flows/appointment", "ta:flows/documents", "ta:flows/worklog",
      "lecturer:flows/approve-worklog", "staff:flows/payout", "staff:flows/paper",
    ],
  },

  {
    slug: "flows/term-setup",
    audience: "staff",
    section: SECTION,
    order: 230,
    title: "เตรียมภาคเรียน",
    description: "ตั้งภาคเรียน ช่วงรับคำขอ รอบเบิกจ่าย นำเข้ารายวิชา และกรอกจำนวนนักศึกษาจาก Excel",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "ตั้งภาคเรียน", "ช่วงรับคำขอ", "รอบเบิกจ่าย", "นำเข้ารายวิชา", "reg", "จำนวนนักศึกษา", "เพดานงบ"],
    blocks: [
      ...scenarioBlocks("term-setup", "th"),
    ],
    related: ["staff:settings/terms", "staff:teaching/import", "staff:teaching/students"],
  },

  {
    slug: "flows/accounts",
    audience: "staff",
    section: SECTION,
    order: 231,
    title: "สร้างบัญชีผู้ใช้",
    description: "ใครสร้างบัญชีได้ รหัสผ่านชั่วคราวไปถึงผู้ใช้อย่างไร และการรีเซ็ตรหัสผ่าน",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "สร้างบัญชี", "รหัสผ่านชั่วคราว", "ส่งข้อมูลเข้าสู่ระบบ", "รีเซ็ตรหัสผ่าน"],
    blocks: [
      ...scenarioBlocks("accounts", "th"),
    ],
    related: ["staff:users", "common:flows/login", "lecturer:request/create-ta-account"],
  },

  {
    slug: "flows/appointment",
    audience: "staff",
    section: SECTION,
    order: 232,
    title: "ออกคำสั่งแต่งตั้ง",
    description: "จากคำขอที่อนุมัติแล้ว สู่คำสั่งแต่งตั้งที่เปิดทางให้เบิกจ่าย",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "คำสั่งแต่งตั้ง", "ใบแต่งตั้ง", "appointment"],
    blocks: [
      ...scenarioBlocks("appointment", "th"),
    ],
    related: ["staff:appointments", "lecturer:flows/ta-request", "staff:flows/payout"],
  },

  {
    slug: "flows/payout",
    audience: "staff",
    section: SECTION,
    order: 233,
    title: "ตรวจและส่งออกเอกสารเบิกจ่าย",
    description: "ตรวจบันทึกเวลาที่อาจารย์อนุมัติแล้ว ส่งกลับ หรือส่งออกไฟล์ ZIP ซึ่งล็อกเดือนนั้น",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "ตรวจเบิกจ่าย", "ส่งออก", "zip", "ล็อก", "ส่งกลับ", "exported", "staff_reviewed"],
    blocks: [
      ...monthlyPayoutBlocks("th"),
    ],
    related: ["staff:payouts/list", "staff:payouts/export", "lecturer:flows/approve-worklog", "staff:flows/paper"],
  },

  {
    slug: "flows/paper",
    audience: "staff",
    section: SECTION,
    order: 234,
    title: "เดินเอกสารกระดาษและส่งการเงิน",
    description: "ใบปะหน้าจ่ายตรง เช็กลิสต์การลงนาม การเตือนอาจารย์ และการอัปเดตความคืบหน้าเอกสาร",
    since: "1.2",
    keywords: ["sequence diagram", "แผนภาพลำดับ", "ปะหน้าจ่ายตรง", "ลงนาม", "ความคืบหน้าเอกสาร", "ส่งการเงิน", "คณบดี"],
    blocks: [
      ...workflowBlocks("paper", "th"),
      ...concurrentEditHelp("th"),
    ],
    related: ["staff:progress", "staff:transfer-cover", "common:document-progress"],
  },
];
