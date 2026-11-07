import { type Block, type SeqParticipant, text, sequence, table, callout } from "./types";
type Language = "th" | "en";
interface Scenario { title: string[]; rows: string[][]; note: string[] }
const labels: Record<string, string[]> = {"system": ["ระบบ COCO TAS", "COCO TAS"], "staff": ["เจ้าหน้าที่", "Officer"], "lec": ["อาจารย์", "Lecturer"], "ta": ["ผู้ช่วยสอน", "TA"], "user": ["ผู้ใช้", "User"], "sso": ["KKU Account", "KKU Account"]};
const scenarios: Record<string, Scenario> = {
  "overview": {
    "title": [
      "ภาพรวมงานตลอดภาคเรียน",
      "Semester workflow"
    ],
    "rows": [
      [
        "staff",
        "system",
        "ตั้งเทอม นำเข้าวิชา และกำหนดช่วงรับคำขอ",
        "Set up the term, import courses and configure request windows"
      ],
      [
        "lec",
        "system",
        "ส่งคำขอ TA และตรวจผลรายคน",
        "Submit TA requests and check individual results"
      ],
      [
        "ta",
        "system",
        "ส่งเอกสารและบันทึกเวลาตามงานจริง",
        "Submit documents and log actual work"
      ],
      [
        "lec",
        "system",
        "ตรวจและอนุมัติบันทึกเวลา",
        "Review and approve work logs"
      ],
      [
        "staff",
        "system",
        "ตรวจรายการ ออกชุดเบิกรายเดือน แล้วติดตามเอกสารลงนาม",
        "Review claims, issue a monthly package and track paper signatures"
      ]
    ],
    "note": [
      "ภาพรวมแสดงการส่งต่องาน ไม่แสดงทุกเงื่อนไข การจ่ายเงินจริงดำเนินการนอกระบบ ดูรายละเอียดในหน้าของแต่ละฟังก์ชัน",
      "This overview shows handoffs, not every condition. Actual payment is handled outside the system. See each function for details."
    ]
  },
  "login": {
    "title": [
      "เข้าสู่ระบบด้วย KKU Account",
      "Sign in with KKU Account"
    ],
    "rows": [
      [
        "user",
        "system",
        "กดเข้าสู่ระบบด้วย KKU Account",
        "Choose Sign in with KKU Account"
      ],
      [
        "system",
        "sso",
        "ส่งต่อไปตรวจตัวตนที่มหาวิทยาลัย",
        "Delegate authentication to the university"
      ],
      [
        "sso",
        "system",
        "ส่งผลตรวจตัวตนกลับผ่านเบราว์เซอร์",
        "Return authentication results through the browser",
        "reply"
      ],
      [
        "system",
        "user",
        "แสดงบัญชีให้ตรวจและยืนยัน",
        "Show the account for confirmation",
        "reply"
      ],
      [
        "user",
        "system",
        "ตรวจบัญชีแล้วกดยืนยันเข้าสู่ระบบ",
        "Check the account and confirm sign-in"
      ],
      [
        "system",
        "user",
        "เปิดหน้าตามสิทธิ์ หรือขั้นตอนที่ต้องทำก่อนเข้าใช้",
        "Open the permitted page or required onboarding step",
        "reply"
      ]
    ],
    "note": [
      "ภาพนี้แสดงทาง KKU Account ที่ตรวจตัวตนสำเร็จ หากยังไม่มีบัญชีในระบบให้ติดต่อเจ้าหน้าที่ การยินยอม PDPA หรือขั้นตอนความปลอดภัยขึ้นกับบัญชี",
      "This shows successful KKU authentication. Contact the officer if the account is not registered. PDPA consent and security steps depend on the account."
    ]
  },
  "password": {
    "title": [
      "เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน",
      "Sign in with email and password"
    ],
    "rows": [
      [
        "user",
        "system",
        "ส่งอีเมลและรหัสผ่าน",
        "Submit email and password"
      ],
      [
        "system",
        "user",
        "หากเปิด 2FA ให้แสดงหน้ากรอกรหัสยืนยัน",
        "If 2FA is enabled, request a verification code",
        "reply"
      ],
      [
        "user",
        "system",
        "ส่งรหัสยืนยันเมื่อระบบร้องขอ",
        "Submit a verification code when requested"
      ],
      [
        "system",
        "user",
        "ตรวจข้อมูลแล้วเปิดขั้นตอนถัดไปตามบัญชี",
        "Validate credentials and open the next required account step",
        "reply"
      ]
    ],
    "note": [
      "ขั้นรหัสยืนยันใช้เฉพาะบัญชีที่เปิด 2FA หากข้อมูลไม่ถูกต้องระบบไม่อนุญาตให้เข้าใช้ รหัสผ่านชั่วคราวต้องเปลี่ยนตามที่ระบบกำหนด",
      "Verification-code steps apply only to accounts with 2FA. Invalid credentials do not grant access. Temporary passwords require the change requested by the system."
    ]
  },
  "documents": {
    "title": [
      "ส่งเอกสารและรับผลตรวจ",
      "Submit documents and receive review results"
    ],
    "rows": [
      [
        "ta",
        "system",
        "กรอกข้อมูล ยินยอม PDPA และส่งเอกสารตามที่หน้าจอกำหนด",
        "Complete the profile, provide PDPA consent and upload the required documents"
      ],
      [
        "system",
        "ta",
        "แสดงสถานะเอกสารรอตรวจ",
        "Show documents awaiting review",
        "reply"
      ],
      [
        "staff",
        "system",
        "เปิดเอกสารแล้วบันทึกผลตรวจแต่ละไฟล์",
        "Review each file and record its result"
      ],
      [
        "system",
        "staff",
        "บันทึกผลตรวจ",
        "Confirm the recorded review",
        "reply"
      ],
      [
        "system",
        "ta",
        "แจ้งผลตามเงื่อนไขการตรวจเอกสาร",
        "Notify the TA according to the document-review rules",
        "async"
      ]
    ],
    "note": [
      "หากส่งกลับ ให้อ่านเหตุผล แก้เอกสารและส่งใหม่ ชนิดเอกสารขึ้นกับข้อมูลและสัญชาติของ TA ให้ยึดรายการที่หน้าจอแสดง",
      "If returned, read the reason, correct the document and upload it again. Requirements depend on the TA profile and nationality; follow the on-screen list."
    ]
  },
  "approve-worklog": {
    "title": [
      "อาจารย์อนุมัติบันทึกเวลา",
      "Lecturer approves work logs"
    ],
    "rows": [
      [
        "lec",
        "system",
        "เปิดรายการรออนุมัติและตรวจวัน เวลา กลุ่มเรียน",
        "Open pending logs and check dates, times and sections"
      ],
      [
        "system",
        "lec",
        "แสดงรายการและสถานะล่าสุด",
        "Show entries and current status",
        "reply"
      ],
      [
        "lec",
        "system",
        "ยืนยันอนุมัติเดือนที่ตรวจแล้ว",
        "Approve the reviewed month"
      ],
      [
        "system",
        "lec",
        "บันทึกผลอนุมัติสำเร็จ",
        "Confirm approval",
        "reply"
      ],
      [
        "system",
        "ta",
        "แจ้งผลอนุมัติ",
        "Notify the TA of approval",
        "async"
      ]
    ],
    "note": [
      "หากข้อมูลไม่ถูกต้อง ให้ส่งกลับพร้อมเหตุผลแทนการอนุมัติ ดูภาพการส่งกลับด้านล่าง การอนุมัติยังไม่ใช่การโอนเงิน",
      "If entries are incorrect, return them with a reason instead of approving. See the return scenario below. Approval does not transfer money."
    ]
  },
  "return-worklog": {
    "title": [
      "ส่งบันทึกเวลากลับแก้ไข",
      "Return work logs for correction"
    ],
    "rows": [
      [
        "lec",
        "system",
        "ส่งกลับรายการพร้อมเหตุผล",
        "Return entries with a reason"
      ],
      [
        "system",
        "lec",
        "ตรวจสิทธิ์และเงื่อนไข แล้วบันทึกการส่งกลับ",
        "Check permissions and conditions, then confirm the return",
        "reply"
      ],
      [
        "system",
        "ta",
        "แจ้งให้แก้ไขพร้อมเหตุผล",
        "Notify the TA of the reason and required corrections",
        "async"
      ],
      [
        "ta",
        "system",
        "แก้รายการและส่งอนุมัติใหม่เมื่อยังอยู่ในกรอบที่อนุญาต",
        "Correct and resubmit while permitted"
      ],
      [
        "system",
        "ta",
        "แสดงผลการส่งล่าสุด",
        "Show the resubmission result",
        "reply"
      ]
    ],
    "note": [
      "หากปิดรับหรือรายการถูกล็อก ให้ติดต่อเจ้าหน้าที่ ไม่สามารถเพิ่มรายการย้อนหลังใหม่ได้ตามใจ",
      "Contact the officer if submission is closed or entries are frozen. New late entries cannot be added freely."
    ]
  },
  "term-setup": {
    "title": [
      "เตรียมภาคเรียนและข้อมูลรายวิชา",
      "Prepare the term and course data"
    ],
    "rows": [
      [
        "staff",
        "system",
        "ตั้งภาคเรียน อัตราจ่าย ช่วงรับคำขอ และรอบส่งเวลารายเดือน",
        "Configure the term, rates, request window and monthly submission periods"
      ],
      [
        "system",
        "staff",
        "บันทึกการตั้งค่า",
        "Confirm the settings",
        "reply"
      ],
      [
        "staff",
        "system",
        "อัปโหลดรายวิชา Excel ตรวจตัวอย่างแล้วนำเข้า",
        "Upload the course Excel file, review the preview and import"
      ],
      [
        "system",
        "staff",
        "แสดงผลนำเข้าและสิ่งที่ต้องแก้",
        "Show import results and issues to resolve",
        "reply"
      ],
      [
        "staff",
        "system",
        "กรอกจำนวนนักศึกษาหรือวางข้อมูลในแท็บ Excel",
        "Enter student counts or paste them in the Excel tab"
      ],
      [
        "system",
        "staff",
        "แสดงจำนวนและข้อมูลรายวิชาที่บันทึกแล้ว",
        "Show saved counts and course data",
        "reply"
      ]
    ],
    "note": [
      "พักการดึงจำนวนนักศึกษาจาก KKU REG ชั่วคราว ให้ใช้ Excel แทน ตรวจข้อมูลก่อนยืนยันเสมอ",
      "KKU REG student-count fetching is temporarily disabled. Use Excel instead and always review the preview before confirming."
    ]
  },
  "accounts": {
    "title": [
      "สร้างบัญชีและส่งข้อมูลเข้าใช้",
      "Create an account and deliver sign-in details"
    ],
    "rows": [
      [
        "staff",
        "system",
        "กรอกข้อมูลบัญชีและบทบาท แล้วบันทึก",
        "Enter account details and roles, then save"
      ],
      [
        "system",
        "staff",
        "แสดงข้อมูลเข้าใช้และรหัสผ่านชั่วคราวตามผลการสร้าง",
        "Show sign-in details and the temporary password when generated",
        "reply"
      ],
      [
        "staff",
        "user",
        "ส่งข้อมูลเข้าใช้ให้เจ้าของบัญชีผ่านช่องทางที่เหมาะสม",
        "Deliver sign-in details to the account owner securely",
        "async"
      ],
      [
        "user",
        "system",
        "เข้าสู่ระบบครั้งแรกและทำขั้นตอนที่ระบบร้องขอ",
        "Sign in for the first time and complete the requested steps"
      ]
    ],
    "note": [
      "คัดลอกรหัสผ่านชั่วคราวเมื่อระบบแสดง อย่าสมมติว่าระบบส่งรหัสให้เจ้าของบัญชีอัตโนมัติ",
      "Copy the temporary password when displayed. Do not assume that the system automatically delivers it to the account owner."
    ]
  },
  "appointment": {
    "title": [
      "ออกคำสั่งแต่งตั้ง TA",
      "Issue TA appointment orders"
    ],
    "rows": [
      [
        "staff",
        "system",
        "เปิดรายชื่อที่รอออกคำสั่งแต่งตั้ง",
        "Open TAs awaiting appointment orders"
      ],
      [
        "system",
        "staff",
        "แสดงรายชื่อที่พร้อมและรายการที่ถูกข้าม",
        "Show eligible names and skipped entries",
        "reply"
      ],
      [
        "staff",
        "system",
        "กรอกข้อมูลคำสั่ง ตรวจรายชื่อ แล้วสร้างไฟล์ .docx",
        "Complete order details, check names and create the .docx file"
      ],
      [
        "system",
        "staff",
        "ส่งไฟล์และบันทึกประวัติคำสั่ง",
        "Return the file and record the order history",
        "reply"
      ],
      [
        "system",
        "lec",
        "ส่งอีเมลแจ้งพร้อมไฟล์คำสั่ง",
        "Email the notification and order file",
        "async"
      ]
    ],
    "note": [
      "ภาพนี้เป็นการสร้างคำสั่งใหม่ การดาวน์โหลดฉบับเดิมจากประวัติไม่ส่งอีเมลซ้ำ รายชื่อที่ยังไม่พร้อมต้องแก้สาเหตุก่อน",
      "This shows a new order. Downloading an existing order from history does not resend email. Resolve blockers for skipped names first."
    ]
  },
  "request-waiting": {
    "title": [
      "คำขอที่รอตารางเรียน",
      "Request awaiting a class schedule"
    ],
    "rows": [
      [
        "ta",
        "system",
        "บันทึกตารางเรียนหรือเลือกกรณีไม่มีตารางตามสิทธิ์",
        "Save a class schedule or choose the permitted no-schedule option"
      ],
      [
        "system",
        "system",
        "ตรวจคำขอที่เกี่ยวข้องและประเมินเกณฑ์อีกครั้ง",
        "Re-evaluate the related requests against eligibility rules"
      ],
      [
        "system",
        "ta",
        "แสดงผลการบันทึกตารางเรียน",
        "Confirm the schedule update",
        "reply"
      ],
      [
        "system",
        "lec",
        "แจ้งผลเมื่อคำขอถูกตัดสิน",
        "Notify the lecturer when the request is decided",
        "async"
      ]
    ],
    "note": [
      "ใช้เมื่อคำขอรอตัดสินเพราะตารางเรียน ผลอาจผ่านหรือไม่ผ่านตามเกณฑ์ ไม่ใช่การอนุมัติอัตโนมัติทุกครั้ง",
      "Use when a request is pending because of a missing schedule. Re-evaluation may approve or reject it; providing a schedule does not guarantee approval."
    ]
  },
  "session": {
    "title": [
      "เซสชันหมดอายุและเข้าใช้อีกครั้ง",
      "Session expiry and signing in again"
    ],
    "rows": [
      [
        "user",
        "system",
        "เปิดหน้าที่ต้องเข้าสู่ระบบเมื่อเซสชันใช้ไม่ได้แล้ว",
        "Open a protected page after the session is no longer valid"
      ],
      [
        "system",
        "user",
        "แจ้งให้เข้าสู่ระบบอีกครั้ง",
        "Request sign-in again",
        "reply"
      ],
      [
        "user",
        "system",
        "เข้าสู่ระบบตามขั้นตอนของบัญชี",
        "Sign in using the account’s required steps"
      ],
      [
        "system",
        "user",
        "เปิดหน้าตามสิทธิ์หลังตรวจตัวตนสำเร็จ",
        "Open the permitted page after successful authentication",
        "reply"
      ]
    ],
    "note": [
      "เก็บข้อความที่ยังไม่บันทึกไว้ก่อน หากใช้รหัสผ่านชั่วคราวหรือระบบร้องขอตั้งค่า 2FA ให้ทำขั้นตอนนั้นก่อนใช้งาน",
      "Keep a copy of unsaved text. Complete temporary-password changes or required 2FA setup before proceeding."
    ]
  },
  "request-cancel": {
    "title": [
      "ยกเลิกคำขอ TA",
      "Cancel a TA request"
    ],
    "rows": [
      [
        "lec",
        "system",
        "เลือกคำขอแล้วกดยกเลิก",
        "Select a request and choose Cancel"
      ],
      [
        "system",
        "system",
        "ตรวจสิทธิ์ สถานะ และเงื่อนไขก่อนยกเลิก",
        "Check ownership, status and cancellation conditions"
      ],
      [
        "system",
        "lec",
        "ยกเลิกสำเร็จ หรือแสดงสาเหตุที่ยกเลิกไม่ได้",
        "Confirm cancellation or show why it is blocked",
        "reply"
      ]
    ],
    "note": [
      "หากมีบันทึกเวลา อยู่ในคำสั่งแต่งตั้ง หรือส่งออกเอกสารแล้ว อาจยกเลิกไม่ได้ ให้ตรวจข้อความที่ระบบแจ้ง คำขอที่เคยอนุมัติแล้วมีการแจ้ง TA เมื่อยกเลิก",
      "Existing logs, appointment orders or exports can block cancellation; follow the reported reason. Cancelling a previously approved request notifies the TA."
    ]
  },
  "reprint": {
    "title": [
      "ดาวน์โหลดชุดเบิกเดิม",
      "Download an existing claim package"
    ],
    "rows": [
      [
        "staff",
        "system",
        "เลือกเดือนที่ออกชุดแล้ว กดดาวน์โหลดชุดเดิม",
        "Select an issued month and download the existing package"
      ],
      [
        "system",
        "system",
        "ตรวจว่าฉบับเดิมยังใช้ได้และไม่ถูกส่งกลับแก้ไข",
        "Check that the archived issue is current and has not been returned for correction"
      ],
      [
        "system",
        "staff",
        "ส่งไฟล์ฉบับเดิมโดยไม่สร้างฉบับใหม่",
        "Return the archived files without creating a new version",
        "reply"
      ]
    ],
    "note": [
      "ถ้าชุดเดิมถูกส่งกลับ ต้องดำเนินการแก้ไขและออกฉบับใหม่ก่อน ตรวจเช็กลิสต์ลงนามและความคืบหน้าใหม่ ไม่ใช้การดาวน์โหลดซ้ำเพื่อเปลี่ยนยอดที่ล็อกไว้",
      "A returned package requires corrections and a replacement issue. Review its new signature checklist and progress. Re-downloading does not change frozen amounts."
    ]
  }
};
/** Single structure for both languages; each scenario uses stable message numbering. */
export function scenarioBlocks(key: string, lang: Language): Block[] {
  const s = scenarios[key];
  if (!s) throw new Error(`Unknown manual scenario: ${key}`);
  const l = lang === "th" ? 0 : 1;
  const ids = [...new Set(s.rows.flatMap(r => r.slice(0, 2)))];
  const participants: SeqParticipant[] = ids.map(id => ({id, label: labels[id][l], kind: id === "system" ? "system" : id === "sso" ? "external" : "actor"}));
  const messages = s.rows.map(r => ({from:r[0], to:r[1], text:r[2+l], kind:(r[4] ?? "sync") as "sync" | "reply" | "async"}));
  const items = key === "password" ? [messages[0], {
    frag: "opt" as const, branches: [{guard: lang === "th" ? "บัญชีเปิด 2FA" : "2FA enabled", items: [messages[1], messages[2]]}],
  }, messages[3]] : messages;
  return [
    text(lang === "th" ? "**ลำดับการทำงาน** อ่านจากบนลงล่าง ลูกศรเส้นประคือคำตอบกลับผู้ส่งคำขอ ส่วนหัวลูกศรโปร่งบนเส้นทึบคือการแจ้งหรือส่งงานโดยไม่รอคำตอบ" : "**How it works** Read top to bottom. Dashed arrows reply to a request; open arrowheads on solid lines indicate a notification or handoff without waiting for a reply."),
    sequence({title:s.title[l], participants, activation: "none", items, caption: s.note[l]}),
    table(lang === "th" ? ["ขั้น", "ผู้ดำเนินการ", "สิ่งที่เกิดขึ้น"] : ["Step", "From → To", "What happens"], s.rows.map((r,i) => [String(i+1), `${labels[r[0]][l]} → ${labels[r[1]][l]}`, r[2+l]])),
    callout("info", s.note[l]),
  ];
}
