/* -------------------------------------------------------------------------- *
 * The words the audit screen speaks.
 *
 * The table used to print the action name straight from the database —
 * `payout.queue.view`, `auth.2fa_ok`, `submission_period.finance_revert`. Those
 * are identifiers, written for the code that raises them. The person reading
 * this screen is a finance officer, and their question is "did something bad
 * happen", which a dotted lowercase string cannot answer.
 *
 * Kept in the frontend, next to the screen that shows it, for the same reason
 * ROLE_LABEL is: this is interface copy. The backend deliberately returns raw
 * counts and raw action names so that the vocabulary lives in exactly one
 * place — two copies would drift, and the one users read would be the stale one.
 * -------------------------------------------------------------------------- */

/** How loudly a row should read.
 *
 *  - danger: someone was refused, locked out, or something was destroyed.
 *  - warn:   a decision that had already been made was undone or overridden.
 *  - normal: ordinary work.
 *  - quiet:  somebody looked at something. The bulk of the table.
 */
export type Severity = "danger" | "warn" | "normal" | "quiet";

/** Exact matches first — the specific reading always beats the family rule. */
const LABELS: Record<string, string> = {
  // ── Signing in ──────────────────────────────────────────────────────────
  "auth.login": "เข้าสู่ระบบ",
  "auth.login_failed": "รหัสผ่านผิด",
  "auth.login_unknown_account": "พยายามเข้าด้วยอีเมลที่ไม่มีในระบบ",
  "auth.login_locked": "บัญชีถูกล็อก (ผิดหลายครั้ง)",
  "auth.2fa_ok": "ยืนยัน 2 ชั้นผ่าน",
  "auth.2fa_failed": "รหัส 2 ชั้นผิด",
  "auth.2fa_locked": "ถูกล็อกจากรหัส 2 ชั้นผิดหลายครั้ง",
  "auth.2fa_recovery_used": "ใช้รหัสสำรองแทน 2 ชั้น",

  // ── Accounts and permissions ────────────────────────────────────────────
  "user.create": "สร้างบัญชีผู้ใช้",
  "user.update": "แก้ไขบัญชี / สิทธิ์",
  "user.activate": "เปิดใช้งานบัญชี",
  "user.deactivate": "ปิดใช้งานบัญชี",
  "user.reset_password": "รีเซ็ตรหัสผ่านให้ผู้อื่น",
  "user.2fa_reset": "ล้างการยืนยัน 2 ชั้นของผู้อื่น",
  "user.2fa_disabled": "ปิดการยืนยัน 2 ชั้น",
  "user.2fa_enabled": "เปิดการยืนยัน 2 ชั้น",
  "user.password_gate_unlock": "ปลดล็อกการยืนยันตัวตน",
  "user.pdpa_erasure": "ลบข้อมูลส่วนบุคคลตามคำขอ",
  "user.data_export": "ดาวน์โหลดข้อมูลส่วนตัวของตนเอง",
  "admin_officer.reassign": "เปลี่ยนตัวผู้ดำรงตำแหน่ง",
  "appointment_order.build": "ออกคำสั่งแต่งตั้ง",
  "appointment_order.reprint": "พิมพ์คำสั่งแต่งตั้งซ้ำ",

  // ── Hours and money ─────────────────────────────────────────────────────
  "worklog.approve": "อนุมัติชั่วโมง",
  "worklog.reject": "ตีกลับชั่วโมง",
  "worklog.delete": "ลบรายการชั่วโมง",
  "worklog.update": "แก้ไขชั่วโมง",
  "worklog.staff_edit": "เจ้าหน้าที่แก้ชั่วโมง",
  "worklog.staff_edit_batch": "เจ้าหน้าที่แก้ชั่วโมงหลายรายการ",
  "pay_rate.create": "เปลี่ยนอัตราค่าตอบแทน",
  "budget_cap.create": "เปลี่ยนเพดานงบ",
  "course.settlement_mode": "เปลี่ยนวิธีแบ่งงบของวิชา",

  // ── The paperwork ───────────────────────────────────────────────────────
  "submission.staff_reviewed": "เจ้าหน้าที่ตรวจผ่าน",
  "submission_period.exported": "ส่งออกเอกสารเบิกจ่าย",
  "submission_period.finance_sent": "ส่งการเงิน",
  "submission_period.finance_revert": "ดึงกลับจากการเงิน",
  "submission_period.sent_back": "ตีกลับให้แก้",
  "submission_period.delete": "ลบงวดส่ง",
  "course.unexport": "ปลดล็อกวิชาที่ส่งออกแล้ว",
  "document_progress.set_stage": "เปลี่ยนขั้นความคืบหน้าเอกสาร",
  "signature_checklist.toggle": "ติ๊ก/ยกเลิกการลงนาม",

  // ── Looking at things ───────────────────────────────────────────────────
  "users.list.view": "เปิดดูรายชื่อผู้ใช้ทั้งหมด",
  "user.record.view": "เปิดดูประวัติผู้ใช้",
  "dashboard.executive.view": "เปิดดูแดชบอร์ดเงินทั้งวิทยาลัย",
  "payout.queue.view": "เปิดดูรายการเบิกจ่าย",
  "export.course.preview": "ดูตัวอย่างเอกสารเบิกจ่าย",
  "export.course_summary.preview": "ดูตัวอย่างสรุปงบรายวิชา",
  "export.course": "ดาวน์โหลดเอกสารเบิกจ่าย",
  "export.batch_download": "ดาวน์โหลดเอกสารหลายวิชา",
  "ta_doc.view": "เปิดดูเอกสารของผู้ช่วยสอน",
  "ta_doc.view_watermarked": "เปิดดูเอกสาร (มีลายน้ำ)",
  "ta_docs.download_all": "ดาวน์โหลดเอกสารทั้งหมด",
  "ta_profile.citizen_id.reveal": "เปิดดูเลขบัตรประชาชน",
  "audit_log.search": "ค้นหาในบันทึกนี้",
  "audit_log.purge": "ล้างบันทึกที่พ้นอายุเก็บ 5 ปี",
};

/** Family fallbacks, so an action added later still reads as a sentence rather
 *  than as an identifier. Longest prefix wins. */
const FAMILIES: [string, string][] = [
  ["auth.", "การเข้าสู่ระบบ"],
  ["user.", "จัดการบัญชีผู้ใช้"],
  ["worklog.", "รายการชั่วโมง"],
  ["submission_period.", "งวดส่งเอกสาร"],
  ["ta_request.", "คำร้องขอผู้ช่วยสอน"],
  ["ta_doc", "เอกสารผู้ช่วยสอน"],
  ["ta_profile.", "ประวัติผู้ช่วยสอน"],
  ["export.", "การส่งออกเอกสาร"],
  ["teaching_course.", "ข้อมูลรายวิชา"],
  ["section.", "กลุ่มเรียน"],
  ["term.", "ภาคการศึกษา"],
  ["holiday.", "วันหยุด"],
  ["announce.", "ประชาสัมพันธ์"],
  ["makeup.", "คาบชดเชย"],
  ["document_progress", "ความคืบหน้าเอกสาร"],
  ["audit_log.", "บันทึกการใช้งาน"],
  ["users.", "รายชื่อผู้ใช้"],
  ["admin_officer.", "ตำแหน่งบริหาร"],
  ["appointment_order.", "คำสั่งแต่งตั้ง"],
  ["course.", "รายวิชา"],
  ["dashboard.", "แดชบอร์ด"],
  ["export_batch.", "ชุดเอกสารที่ส่งออก"],
  ["payout.", "การเบิกจ่าย"],
  ["signature_checklist.", "รายการลงนาม"],
  ["submission.", "การตรวจของเจ้าหน้าที่"],
  ["ta_review_schedule.", "ตารางงานผู้ช่วยสอน"],
  ["ta_window.", "ช่วงเปิดรับคำขอ"],
  ["curriculum.", "หลักสูตร"],
  ["schedule.", "ตารางเรียน"],
  ["pay_rate.", "อัตราค่าตอบแทน"],
  ["budget_cap.", "เพดานงบ"],
  ["review_date.", "วันตรวจงาน"],
  ["ta_deletion_request.", "คำขอลบข้อมูล"],
  ["ta_enrollment.", "การศึกษาของผู้ช่วยสอน"],
];

export function actionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  let best = "";
  let label = "";
  for (const [prefix, text] of FAMILIES) {
    if (action.startsWith(prefix) && prefix.length > best.length) {
      best = prefix;
      label = text;
    }
  }
  return label || action;
}

/** Actions that mean somebody was refused or something was destroyed. */
const DANGER = new Set([
  "auth.login_failed",
  "auth.login_unknown_account",
  "auth.login_locked",
  "auth.2fa_failed",
  "auth.2fa_locked",
  "user.pdpa_erasure",
  "user.reset_password",
  "user.2fa_reset",
  "user.deactivate",
]);

/** Actions that undo or override a decision already taken. These are not
 *  failures — they are the ones worth a second look. */
const WARN = new Set([
  "submission_period.finance_revert",
  "submission_period.sent_back",
  "course.unexport",
  "worklog.staff_edit",
  "worklog.staff_edit_batch",
  "worklog.reject",
  "worklog.delete",
  "makeup.unwaive",
  "pay_rate.create",
  "budget_cap.create",
  "course.settlement_mode",
  "user.update",
  "admin_officer.reassign",
  "auth.2fa_recovery_used",
  "ta_profile.citizen_id.reveal",
]);

export function severityOf(action: string): Severity {
  if (DANGER.has(action)) return "danger";
  if (WARN.has(action)) return "warn";
  if (action.endsWith(".view") || action.endsWith(".preview") ||
      action.endsWith(".search") || action.includes("download")) {
    return "quiet";
  }
  return "normal";
}

/** One line of the overview strip: a named group of actions, its count, and
 *  what it means. Groups are deliberately few — the strip answers one question
 *  and stops. */
export interface SummaryGroup {
  id: string;
  label: string;
  /** Shown under the number, in words, when the count is non-zero. */
  detail: (count: number, ips: number) => string;
  severity: Severity;
  /** Actions this group counts. The screen filters to these when clicked. */
  actions: string[];
}

export const SUMMARY_GROUPS: SummaryGroup[] = [
  {
    id: "signin_failed",
    label: "เข้าระบบไม่สำเร็จ",
    // The address count is the whole point: many tries from ONE machine is a
    // forgotten password; the same number from many machines is not.
    detail: (n, ips) =>
      ips > 1
        ? `${n} ครั้ง จาก ${ips} เครื่อง — ควรตรวจสอบ`
        : `${n} ครั้ง จากเครื่องเดียว`,
    severity: "danger",
    actions: ["auth.login_failed", "auth.login_unknown_account", "auth.2fa_failed"],
  },
  {
    id: "locked",
    label: "บัญชีถูกล็อก",
    detail: n => `${n} ครั้ง`,
    severity: "danger",
    actions: ["auth.login_locked", "auth.2fa_locked"],
  },
  {
    id: "reversed",
    label: "ย้อน/แก้สิ่งที่อนุมัติแล้ว",
    detail: n => `${n} ครั้ง`,
    severity: "warn",
    actions: [
      "submission_period.finance_revert", "course.unexport",
      "worklog.staff_edit", "worklog.staff_edit_batch", "submission_period.sent_back",
    ],
  },
  {
    id: "permissions",
    label: "เปลี่ยนสิทธิ์ / รหัสผ่าน",
    detail: n => `${n} ครั้ง`,
    severity: "warn",
    actions: [
      "user.update", "user.reset_password", "user.2fa_reset",
      "user.deactivate", "user.password_gate_unlock", "admin_officer.reassign",
    ],
  },
  {
    id: "sensitive_reads",
    label: "เปิดดูข้อมูลอ่อนไหว",
    detail: (n, ips) => `${n} ครั้ง${ips > 1 ? ` จาก ${ips} เครื่อง` : ""}`,
    severity: "quiet",
    actions: [
      "dashboard.executive.view", "users.list.view", "user.record.view",
      "ta_profile.citizen_id.reveal", "ta_doc.view_watermarked", "ta_docs.download_all",
    ],
  },
];
