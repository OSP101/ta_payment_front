import { type DocPage, text, callout, table } from "../types";
import { workflowBlocks, concurrentEditHelp, monthlyPayoutBlocks } from "../workflow-content";
import { scenarioBlocks } from "../sequence-scenarios";

const SECTION = "Workflows (Sequence Diagrams)";

export const flowPagesEn: DocPage[] = [
  /* ================================================================ common */
  {
    slug: "flows/overview",
    audience: "common",
    section: SECTION,
    order: 200,
    title: "Overview of the whole semester",
    description: "Who does what, from term preparation to routing documents to finance",
    since: "1.2",
    keywords: ["sequence diagram", "workflow", "flow", "process", "all stages", "overview", "semester", "แผนภาพลำดับ", "ลำดับการทำงาน"],
    blocks: [
      ...scenarioBlocks("overview", "en"),
    ],
    related: ["common:intro", "common:flows/login"],
  },

  {
    slug: "flows/login",
    audience: "common",
    section: SECTION,
    order: 201,
    title: "Signing in",
    description: "How the system checks who you are: KKU Account, email and password, 2FA, and session timeouts",
    since: "1.2",
    routes: [],
    keywords: ["sequence diagram", "sign in", "login", "sso", "kku account", "2fa", "temporary password", "session", "account lockout", "แผนภาพลำดับ", "เข้าสู่ระบบ"],
    blocks: [
      ...scenarioBlocks("login", "en"),
      ...scenarioBlocks("password", "en"),
      ...scenarioBlocks("session", "en"),
    ],
    related: ["common:first-login", "common:two-factor", "common:session-timeout"],
  },

  /* ================================================================== ta */
  {
    slug: "flows/documents",
    audience: "ta",
    section: SECTION,
    order: 210,
    title: "Submitting and reviewing TA documents",
    description: "Submit required documents, receive staff review and check the result",
    since: "1.2",
    keywords: ["sequence diagram", "documents", "pdpa", "creditor form", "bank book", "id card", "returned documents", "document review", "แผนภาพลำดับ", "เอกสาร"],
    blocks: [
      ...scenarioBlocks("documents", "en"),
    ],
    related: ["ta:documents/overview", "ta:documents/rejected", "staff:review"],
  },

  {
    slug: "flows/worklog",
    audience: "ta",
    section: SECTION,
    order: 211,
    title: "Logging hours and submitting for approval",
    description: "How the system creates work log entries from the teaching schedule, who gets them after you submit, and what happens after the closing date",
    since: "1.2",
    keywords: ["sequence diagram", "work log", "log hours", "auto-generate", "submit for approval", "closing date", "deadline", "forfeit", "not wishing to log hours", "worklog", "แผนภาพลำดับ", "ลงเวลา"],
    blocks: [
      ...workflowBlocks("worklog", "en"),
    ],
    related: ["ta:worklog/generate", "ta:worklog/submit", "ta:reference/status", "lecturer:flows/approve-worklog"],
  },

  /* ============================================================= lecturer */
  {
    slug: "flows/ta-request",
    audience: "lecturer",
    section: SECTION,
    order: 220,
    title: "Requesting TAs and how requests are decided",
    description: "What the system checks after you send a request, how it decides, and who is notified when",
    since: "1.2",
    keywords: ["sequence diagram", "ta request", "request a ta", "automatic approval", "rules", "criteria", "cancel request", "class schedule", "แผนภาพลำดับ", "คำขอ ta"],
    blocks: [
      ...workflowBlocks("request", "en"),
      ...scenarioBlocks("request-waiting", "en"),
      ...scenarioBlocks("request-cancel", "en"),
    ],
    related: ["lecturer:request/overview", "lecturer:request/submit", "lecturer:request/rejected-troubleshoot"],
  },

  {
    slug: "flows/approve-worklog",
    audience: "lecturer",
    section: SECTION,
    order: 221,
    title: "Approving work logs",
    description: "The lecturer approves or returns work logs, and who receives the notification",
    since: "1.2",
    keywords: ["sequence diagram", "approve work log", "approve hours", "return", "remove entry", "reports", "แผนภาพลำดับ", "อนุมัติบันทึกเวลา"],
    blocks: [
      ...scenarioBlocks("approve-worklog", "en"),
      ...scenarioBlocks("return-worklog", "en"),
    ],
    related: ["lecturer:reports", "ta:flows/worklog", "lecturer:reference/status"],
  },

  /* ================================================================ staff */
  {
    slug: "flows/index",
    audience: "staff",
    section: SECTION,
    order: 199,
    title: "All diagrams",
    description: "Every workflow sequence diagram, grouped by the manual it is in",
    since: "1.2",
    keywords: ["sequence diagram", "all diagrams", "diagram index", "workflow", "committee", "แผนภาพลำดับ", "รวมแผนภาพ"],
    blocks: [
      text(
        "This section explains the system with **workflow sequence diagrams (UML Sequence Diagrams)**, one page per topic. " +
        "Every diagram follows how the system really works as of the version stated on the page. Staff can open every page; " +
        "for pages in the lecturer or TA manual, press the link below and the view switches for you.",
      ),
      table(
        ["No.", "Topic", "Manual"],
        [
          ["1", "Overview of the whole semester", "Everyone"],
          ["2", "Signing in (KKU Account, password, 2FA, timeouts)", "Everyone"],
          ["3", "Setting up the semester", "Staff"],
          ["4", "Creating user accounts", "Staff"],
          ["5", "Requesting TAs and how requests are decided", "Lecturers"],
          ["6", "Issuing appointment orders", "Staff"],
          ["7", "Submitting and reviewing TA documents", "TAs"],
          ["8", "Logging hours and submitting for approval", "TAs"],
          ["9", "Approving work logs", "Lecturers"],
          ["10", "Reviewing and exporting disbursement documents", "Staff"],
          ["11", "Routing paper documents and sending to finance", "Staff"],
        ],
      ),

      callout(
        "tip",
        "Need a document for a presentation? Open the page you want and print it (⌘P or Ctrl+P), choosing Save as PDF. " +
        "The diagrams are real text and lines, not images, so they stay sharp at any paper size.",
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
    title: "Setting up the semester",
    description: "Set up the semester, request window and billing rounds, import courses, and enter student numbers from Excel",
    since: "1.2",
    keywords: ["sequence diagram", "semester setup", "request window", "billing rounds", "import courses", "reg", "student numbers", "budget cap", "แผนภาพลำดับ", "ตั้งภาคเรียน"],
    blocks: [
      ...scenarioBlocks("term-setup", "en"),
    ],
    related: ["staff:settings/terms", "staff:teaching/import", "staff:teaching/students"],
  },

  {
    slug: "flows/accounts",
    audience: "staff",
    section: SECTION,
    order: 231,
    title: "Creating user accounts",
    description: "Who can create accounts, how the temporary password reaches the user, and password resets",
    since: "1.2",
    keywords: ["sequence diagram", "create account", "new user", "temporary password", "send sign-in details", "reset password", "แผนภาพลำดับ", "สร้างบัญชี"],
    blocks: [
      ...scenarioBlocks("accounts", "en"),
    ],
    related: ["staff:users", "common:flows/login", "lecturer:request/create-ta-account"],
  },

  {
    slug: "flows/appointment",
    audience: "staff",
    section: SECTION,
    order: 232,
    title: "Issuing appointment orders",
    description: "From approved requests to the appointment order that opens the way to payment",
    since: "1.2",
    keywords: ["sequence diagram", "appointment order", "appointment", "ta appointment", "แผนภาพลำดับ", "คำสั่งแต่งตั้ง"],
    blocks: [
      ...scenarioBlocks("appointment", "en"),
    ],
    related: ["staff:appointments", "lecturer:flows/ta-request", "staff:flows/payout"],
  },

  {
    slug: "flows/payout",
    audience: "staff",
    section: SECTION,
    order: 233,
    title: "Reviewing and exporting disbursement documents",
    description: "Review work logs the lecturer has approved, return them, or export the ZIP file, which locks that month",
    since: "1.2",
    keywords: ["sequence diagram", "disbursement review", "export", "zip", "lock", "return", "exported", "staff_reviewed", "แผนภาพลำดับ", "ตรวจเบิกจ่าย"],
    blocks: [
      ...monthlyPayoutBlocks("en"),
    ],
    related: ["staff:payouts/list", "staff:payouts/export", "lecturer:flows/approve-worklog", "staff:flows/paper"],
  },

  {
    slug: "flows/paper",
    audience: "staff",
    section: SECTION,
    order: 234,
    title: "Routing paper documents and sending to finance",
    description: "The direct-payment cover sheet, the signing checklist, reminding lecturers, and updating document progress",
    since: "1.2",
    keywords: ["sequence diagram", "transfer cover sheet", "direct payment cover", "signing", "signatures", "document progress", "send to finance", "dean", "แผนภาพลำดับ", "ปะหน้าจ่ายตรง"],
    blocks: [
      ...workflowBlocks("paper", "en"),
      ...concurrentEditHelp("en"),
    ],
    related: ["staff:progress", "staff:transfer-cover", "common:document-progress"],
  },
];
