import { scenarioBlocks } from "../sequence-scenarios";
import { workflowBlocks, monthlyPayoutBlocks, transferCoverPage } from "../workflow-content";
import {
  type DocPage, text, callout, steps, screenshot, gif, statusTable, table,
} from "../types";

/** English copy of staffPages, from page 17 ("review") to the end. */
export const staffPagesEnB: DocPage[] = [
  {
    slug: "review",
    audience: "staff",
    section: "Step 2: Review TA documents",
    order: 60,
    gettingStarted: 9,
    title: "Review TA documents",
    description: "Review each TA's documents file by file. Once all 3 files are approved, the system approves the TA for you",
    since: "1.0",
    routes: ["/staff/review"],
    keywords: ["review ta documents", "return document", "download quota", "id card copy", "bank book page", "creditor form", "document review", "approve ta"],
    blocks: [
      text(
        "Each TA must submit 3 files: a **copy of their national ID card**, a **copy of their bank book page** and the **creditor form**. " +
        "Review them and approve or return each file one by one. Once all 3 files are approved, the system approves that TA for you",
      ),
      screenshot("S-RV-01", "The Awaiting review and Approved tabs, the document queue and the search box"),
      text("The **Awaiting review** tab is your to-do list. The **Approved** tab lists the TAs who have passed; use it to download their documents later"),
      screenshot("S-RV-02", "The document review page: 3 files, the Approve and Return buttons, and the watermark"),
      screenshot("S-RV-03", "The return dialog, with 4 reasons to choose from"),
      text("Each file has an **Approve** and a **Return** button. If you return a file, choose a reason (document unclear, not yet signed, wrong file attached, or other and type your own). The TA sees the reason and uploads a new file in its place"),
      text("The system sends the TA **a single e-mail** once every submitted file has been reviewed, giving the result for all 3 files (passed or not, with reasons). Until you have reviewed them all, the TA gets no e-mail, so try to review every file in one go"),
      callout("info", "Every document page carries a watermark showing the officer's name and the time it was opened"),
      screenshot("S-RV-04", "The password confirmation before download, and the quota notice"),
      callout(
        "warn",
        "These documents contain personal data. You must **confirm your password** every time before downloading, and each person has a **limited download quota**. " +
        "Approved files are **deleted automatically within 7 days**, so download and keep them as soon as all files are approved",
      ),
      screenshot("S-RV-05", "The “Not yet complete” table"),
      gif("S-RV-G1", "Open a TA's documents, approve the first file, return the second with a reason, then go back to the queue"),
    ],
  },
  {
    slug: "appointments",
    audience: "staff",
    section: "Step 1: Review TA requests",
    order: 55,
    gettingStarted: 10,
    title: "TA appointments",
    description: "Issue appointment orders for approved TAs in rounds. A TA without an order cannot be paid",
    since: "1.0",
    routes: ["/staff/appointments"],
    keywords: ["ta appointments", "appointment order", "issue order", "signatory", "docx order", "order number", "skipped course"],
    blocks: [
      callout("danger", "A TA who has no appointment order yet **cannot be reviewed for payment or have documents exported**. Issue the order on this page first"),
      screenshot("S-AO-01", "The round to issue, the list of names, and the courses skipped with reasons"),
      text("A TA without an order shows the **Awaiting appointment order** badge on the review and export page, and the dashboard counts it among your to-dos"),
      text("The system gathers approved TAs who have no order yet for you. Courses that are not ready (a TA still awaiting review) are **skipped** until the next round, with the reason shown"),
      screenshot("S-AO-02", "The 4-field form: order number, signatory, order date and effective date"),
      table(
        ["Field", "Example"],
        [
          ["Order no.", "Order number/Thai (BE) year, e.g. `6/2569`"],
          ["Signatory", "Choose from the executives list. If it is not the dean, the system prints “acting on behalf of” for you"],
          ["Order date / effective from", "Pick from the calendar; the date in Thai format is shown under the field for you to check"],
        ],
      ),
      steps([{ title: "Fill in all 4 fields, then press “Create order file (.docx)”", body: "You get the order file, and every TA in this round counts as having an order. The system immediately e-mails every requesting lecturer named in this round, attaching the order file (.docx) and a summary of each TA's course, name, student ID, year and section. Downloading an earlier order again from the history does not send the e-mail again" }]),
      screenshot("S-AO-04", "Example of the first page of an issued order"),
      screenshot("S-AO-03", "Order history and the button to download the original file"),
      gif("S-AO-G1", "Fill in the 4 fields, create the order and download the file; the status of the names changes immediately"),
      callout("tip", "If there is no signatory name yet, set the dean or deputy dean under **Settings**, tab **Executives**"),
      ...scenarioBlocks("appointment", "en"),
    ],
    related: ["staff:settings/admins"],
  },
  {
    slug: "payouts/list",
    audience: "staff",
    section: "Step 3: Review and export documents",
    order: 70,
    gettingStarted: 11,
    title: "Review and export documents (course list)",
    description: "Review courses and issue a combined monthly package after submission closes",
    since: "1.0",
    routes: ["/staff/payouts"],
    keywords: ["export documents", "certifier", "ready to export", "payouts", "month-end", "disbursement documents", "zip", "fiscal year rounds"],
    blocks: [
      ...monthlyPayoutBlocks("en"),
      screenshot("S-PO-03", "Selecting the term certifier"),
    ],
    related: ["staff:appointments", "staff:payouts/detail"],
  },
  {
    slug: "payouts/detail",
    audience: "staff",
    section: "Step 3: Review and export documents",
    order: 71,
    title: "Course workspace: monthly review",
    description: "The TA table by month: view, approve, return, and edit hours on a TA's behalf",
    since: "1.0",
    routes: ["/staff/payouts/[tcId]"],
    keywords: ["monthly review", "edit hours for ta", "added by ta", "return month", "work log review", "weekly timetable", "approve month"],
    blocks: [
      callout("info", "Use this section to review a course. Issue new documents from the monthly package panel on the course list. After closing, officers may correct existing entries with the required password and reason, but cannot add new late entries. Issued entries must follow the return workflow before correction."),
      text("Use this page to review a course and its monthly entries. Return to the course list to issue the combined monthly package when ready."),
      screenshot("S-PO-04", "The TA table by month; each cell has View, Approve and Return buttons"),
      text(
        "Each cell is **one TA in one month**. Green means reviewed; yellow means some entries are still awaiting lecturer approval or TA submission; " +
        "grey means ready for you to review, or no hours logged yet; red means the deadline has passed with no hours logged, so that month is forfeited. " +
        "The **View** button opens the day-by-day entries, **✓** means passed review, and **↩** means return, which always needs a reason for the TA",
      ),
      screenshot("S-PO-05", "Daily details: the weekly timetable next to the entries, and rows the TA added themselves"),
      text("The review window shows a **weekly timetable** next to the work log entries. Hover over a row and the matching session in the timetable lights up, so you can check that the logged time matches a real teaching session"),
      callout("warn", "Rows with the **Added by TA** badge (yellow) deserve an especially careful check"),
      gif("S-PO-G1", "Open the details, hover over a row to see its session in the timetable, then approve"),
      screenshot("S-PO-06", "The form for editing hours on a TA's behalf: a reason of at least 10 characters and your password are required"),
      text(
        "To edit hours on a TA's behalf, click the pencil icon, make the change, then press **Save changes**. You must enter **a reason of at least 10 characters** " +
        "and may attach up to 3 photos as evidence. The system notifies the lecturer and the TA for you",
      ),
      callout(
        "warn",
        "Editing **an entry the lecturer has already approved** needs extra confirmation: enter a reason and **your password** in the “Confirm it's you” box. " +
        "The reason is sent to every lecturer of the course and kept permanently in the edit history",
      ),
      gif("S-PO-G2", "Press Return, type a reason and confirm; the system notifies the TA immediately"),
    ],
  },
  {
    slug: "payouts/export",
    audience: "staff",
    section: "Step 3: Review and export documents",
    order: 72,
    title: "Issue monthly claim packages and download existing files",
    description: "Check readiness, issue one month and preserve frozen amounts",
    since: "1.0",
    // No `routes:` here: this is the lower section of the SAME single-scroll
    // /staff/payouts/[tcId] page as payouts/detail (which claims the route
    // and documents the page top to bottom) — there's no separate URL for
    // "just the export part" to disambiguate against.
    keywords: ["export zip", "spread pay", "actual pay", "budget cap", "lock month", "download zip", "export history", "amount mismatch"],
    blocks: [
      ...monthlyPayoutBlocks("en"),
    ],
    related: ["staff:payouts/raw-worklog"],
  },
  {
    slug: "payouts/raw-worklog",
    audience: "staff",
    section: "Step 3: Review and export documents",
    order: 73,
    title: "Raw work logs (edit for the whole term)",
    description: "The work log table of every TA, for changes the course workspace cannot make",
    since: "1.0",
    routes: ["/staff/worklog"],
    keywords: ["raw work log", "edit hours", "work log table", "bulk edit", "edit on behalf", "all tas"],
    blocks: [
      callout("info", "Use this section to review a course. Issue new documents from the monthly package panel on the course list. After closing, officers may correct existing entries with the required password and reason, but cannot add new late entries. Issued entries must follow the return workflow before correction."),
      screenshot("S-WL-01", "The work log table of every TA, with Add, Edit and Delete buttons"),
      text(
        "Normally make changes in the course workspace first (click the course name on the review and export page), because that page records the reason and sends notifications for you. " +
        "Use this page only for special cases, such as editing hours across several courses at once, or a change the course page cannot make",
      ),
    ],
  },

  /* ---------------------------- Budget ---------------------------- */
  {
    slug: "budget-summary",
    audience: "staff",
    section: "Budget",
    order: 80,
    gettingStarted: 13,
    title: "Budget usage summary",
    description: "Compare monthly amounts and download budget reports",
    since: "1.0",
    routes: ["/staff/budget-summary"],
    keywords: ["budget summary", "direct payment cover sheet", "graduate documents", "remaining budget", "monthly disbursement", "excel summary", "transfer cover"],
    blocks: [
      text("Review the term budget, choose months to compare, check the on-screen totals and download the report. Viewing a summary does not issue a claim package."),
      callout("info", "Issued months retain their frozen amounts and the first frozen lump-sum basis. Later allocations use only the remaining balance."),
      text("For a direct-payment cover sheet, open the separate **Direct-payment cover sheet** menu and choose an issued claim month."),
    ],
    related: ["staff:transfer-cover", "staff:payouts/list"],
  },

  /* ---------------------------- Tracking ---------------------------- */
  {
    slug: "progress",
    audience: "staff",
    section: "Operations",
    order: 90,
    gettingStarted: 14,
    title: "Update document progress",
    description: "Track the paper documents after they are exported from the system",
    since: "1.0",
    routes: ["/staff/progress"],
    keywords: ["document progress", "paper routing", "stepper", "signing checklist", "signature reminder", "send to finance", "dean signature"],
    blocks: [
      callout("info", "Select the correct month and document version before updating. Issue the claim package before signing. Signatures are not reused across months; corrected versions require a new checklist review. Progress does not confirm a bank transfer."),
      text(
        "After exporting from the system, use this page to track **the paper documents** in order: TA signs → lecturer signs → certifier signs → send to finance → dean signs. " +
        "Everyone in the system sees the status you update here",
      ),
      screenshot("S-PG-01", "The “Courses not yet exported” condition bar (steps still disabled)"),
      callout("warn", "You must **issue documents for every course in the selected month** first. This bar shows which courses are left; once all are done you can press the steps below"),
      screenshot("S-PG-02", "The 5-step bar and the note box"),
      text(
        "**Click the circle** of the step the documents have reached. Clicking the current step again moves back one step. You can add a **Note**, such as “Waiting for Dr. A to sign”. " +
        "The system records the time and the name of whoever updated it",
      ),
      screenshot("S-PG-03", "The confirmation box when moving back one step"),
      screenshot("S-PG-04-1", "Step 1, TA signs: a checklist per course"),
      screenshot("S-PG-04-2", "Step 2, lecturer signs, with a button to e-mail a reminder to lecturers who have not signed"),
      text("Each course's signing checklist is split by role. **Click a card** to tick it as signed; click again to undo. The **e-mail a reminder to lecturers who have not signed** button goes only to those still outstanding"),
      gif("S-PG-G1", "Click the step 2 circle, add a note, save, tick a signer's card, then send the reminder e-mail"),
      ...workflowBlocks("paper", "en"),
    ],
  },

  /* ---------------------------- System ---------------------------- */
  {
    slug: "holidays",
    audience: "staff",
    section: "System",
    order: 100,
    title: "Public holidays",
    description: "The holiday calendar the system uses to stop TAs logging hours",
    since: "1.0",
    routes: ["/staff/holidays"],
    keywords: ["public holidays", "import holidays", "holiday calendar", "faculty holiday", "tdbm", "block work log", "make-up"],
    blocks: [
      text(
        "The system uses this holiday calendar to **block work logging** for TAs. If a class session falls on a holiday, the TA cannot log hours until the lecturer schedules a make-up. " +
        "Most holidays are pulled automatically every hour from the college's own TDBM; you don't need to sync anything",
      ),
      screenshot("S-HD-01", "The monthly holiday list, the “From TDBM” badge, and the Edit and Delete buttons"),
      text("**Add manually**: choose the date, enter the holiday name (in Thai), and choose a type (public, university, faculty or other). A **faculty** holiday can cover just part of the day, e.g. only 08:00 to 12:00"),
      screenshot("S-HD-02", "The add-holiday form, the faculty holiday type and the time range"),
      text("**Import several**: paste one day per line in the format `YYYY-MM-DD | holiday name`. For a partial-day holiday, add `| HH:MM-HH:MM` at the end"),
      screenshot("S-HD-03", "The bulk import box and an example of the line format"),
      text("The buttons at the end of each row are **Edit** (change the name, note and time range) and **Delete**. The date and type cannot be edited; if they are wrong, delete the holiday and add it again"),
    ],
  },
  {
    slug: "tdbm",
    audience: "staff",
    section: "System",
    order: 101,
    title: "Data from TDBM",
    description: "Check that the system pulls make-up teaching days from TDBM correctly",
    since: "1.0",
    routes: ["/staff/tdbm"],
    keywords: ["tdbm", "make-up days", "sync failed", "make-up session", "sync", "section matching"],
    blocks: [
      text(
        "This page shows the data pulled from TDBM and how it was matched to courses and sections. It is view only. " +
        "Changing or approving make-up teaching days is still done in the college's TDBM system; this page is for checking that the data arrived complete and correct",
      ),
      screenshot("S-TD-01", "The table of make-up teaching days from TDBM and their matching status"),
      screenshot("S-TD-02", "The “Last sync failed” warning box"),
      callout("info", "If a sync fails, check the connection to TDBM first. If the problem is in the TDBM data itself, fix it in TDBM and wait for the next sync (every hour)"),
    ],
  },
  {
    slug: "audit",
    audience: "staff",
    section: "System",
    order: 102,
    title: "Activity log",
    description: "Look back at who did what in the system. View only",
    since: "1.0",
    routes: ["/staff/audit"],
    keywords: ["audit log", "activity log", "audit trail", "who changed", "reference number", "investigate", "export csv", "ip address"],
    blocks: [
      text("Records who did what, to what, when, and from which device. Use it to look back when something is in question. This page is **view only**, kept for 5 years, and cannot be altered after the fact"),
      screenshot("S-AU-01", "The activity log page in the simple view"),
      text(
        "This page has 2 views, switched at the top right. **Simple** shows sentences grouped by day, good for an overview. " +
        "**Investigate** shows every stored row with technical details, for administrators",
      ),
      text(
        "The top of the simple view summarises **things worth checking** in the chosen period, such as repeated failed sign-ins, reversing or editing something already approved, " +
        "and changes to account permissions. Click an item to see the related entries. Next to it is the list of **people using the system right now**, with the devices they use",
      ),
      text(
        "Choose a **period** or set your own dates, then search by person name, course code, words you see in the entries, IP address or **reference number** (e.g. AL-001366). " +
        "Filter by category with the buttons above the list. Large batches of work the system did at the same time are folded into one line with a count; click it to see each entry",
      ),
      screenshot("S-AU-02", "Event details, showing what changed from the old value to the new one"),
      text(
        "Click an entry to see its details: what changed from which value to which, who did it, from which device, and a **reference number** you can copy into an official memo. " +
        "The **Export** button downloads the filtered entries as a CSV file that opens in Excel, up to 10,000 rows at a time, and every export is itself logged",
      ),
      callout("tip", "A common case: if someone asks who changed a TA's hours, type the TA's name or the course code in the search box, then choose the **Work hours** category"),
    ],
  },

  /* ---------------------------- Admin ---------------------------- */
  {
    slug: "pdpa-requests",
    audience: "staff",
    section: "Admin",
    order: 110,
    title: "Data deletion requests (PDPA)",
    description: "Administrators only: decide on users' requests to delete their data",
    since: "1.0",
    routes: ["/staff/data-deletion-requests"],
    keywords: ["pdpa", "data deletion request", "admin", "delete personal data", "right to erasure", "privacy"],
    blocks: [
      callout("info", "This page works only for **administrator** accounts. Regular staff can see the menu item, but the system will not let them in"),
      screenshot("S-PD-01", "The list of deletion requests"),
      screenshot("S-PD-02", "The deletion request review box and the decision"),
      text("Review the request, then approve or reject it. If you approve, the account is deactivated and data that is no longer needed is deleted, except financial data, which must be kept under the regulations"),
    ],
    related: ["common:my-data"],
  },
  {
    slug: "admin-tools",
    audience: "staff",
    section: "Admin",
    order: 111,
    title: "Unlock and step back (administrator rights)",
    description: "Unlocking an export and cancelling send to finance can only be done by an administrator",
    since: "1.0",
    // No `routes:` here either — see payouts/export's comment; this is the
    // same /staff/payouts/[tcId] page payouts/detail already claims.
    keywords: ["unlock", "cancel send to finance", "admin only", "step back", "reverse status", "unlock export"],
    blocks: [
      text(
        "The principle is: **staff can always move work forward, including the download that locks it, but only an administrator can move it back**. " +
        "This is deliberate, not a loophole: it prevents exported documents from being reversed without careful checking",
      ),
      screenshot("S-AD-01", "The Unlock and Cancel send to finance buttons that only administrators have, with the confirmation box"),
      screenshot("S-AD-02", "The same page opened with a regular staff account: these buttons are not there"),
      callout("warn", "Every unlock or step back is recorded in the audit log with its reason. Use it only when truly necessary, e.g. the wrong course was exported or an error was found after export"),
    ],
    related: ["staff:audit"],
  },
  {
    slug: "admin-manual",
    audience: "staff",
    section: "Admin",
    order: 112,
    title: "Administrator manual",
    description: "Starting a new semester, backing up and restoring data, and rotating encryption keys",
    since: "1.0",
    keywords: ["administrator manual", "backup", "restore", "new semester", "rotate keys", "encryption key", "server"],
    blocks: [
      callout("info", "Only **administrator** accounts see this page. More details are in the development team's `deploy/README.md` and `ta_payment_back/docs/SECURITY.md`"),
      text("**New semester checklist**"),
      steps([
        { title: "Set the new semester's pay rates (if they change)" },
        { title: "Create the new semester and set it as the current semester" },
        { title: "Set the TA application period and create the 5 monthly claim rounds" },
        { title: "Import the courses from the new semester's registrar file" },
        { title: "Check that every course has its student numbers and class schedule filled in" },
      ]),
      text("**Back up and restore data**"),
      text("Use the development team's `deploy/scripts/backup-db.sh` and `restore-db.sh` scripts, run on the server where the system is installed. This cannot be done from this website"),
      text("**Rotate encryption keys**"),
      text("Use the backend's `cmd/rotate-*` commands when you suspect an encryption key has leaked. This needs direct access to the server"),
      callout("warn", "Backup, restore and key rotation are server tasks. They must be done by an administrator with access to the server machine, not through the website"),
    ],
    related: ["staff:audit", "staff:admin-tools"],
  },

  /* ---------------------------- Reference ---------------------------- */
  {
    slug: "reference/status",
    audience: "staff",
    section: "Reference",
    order: 120,
    title: "System-wide status table (staff view)",
    description: "The statuses of a monthly round from start to finish, and who can move it forward or back",
    since: "1.0",
    keywords: ["status table", "monthly status", "workflow", "status codes", "awaiting review", "exported", "finance sent"],
    blocks: [
      statusTable([
        { status: "Awaiting review", tone: "neutral", meaning: "The TA logs and submits hours, the lecturer approves each month, then it waits for staff review. All of this happens in this status (system code: `pending`)", whoActsNext: "TA, lecturer, then staff" },
        { status: "Reviewed", tone: "warn", meaning: "Staff have reviewed it; waiting to be exported (system code: `staff_reviewed`)", whoActsNext: "Staff" },
        { status: "Exported", tone: "success", meaning: "Documents exported; can no longer be edited (system code: `exported`)" },
        { status: "Sent to finance", tone: "success", meaning: "Process complete (system code: `finance_sent`)" },
      ]),
      callout(
        "info",
        "**Staff can always move a status forward**, including the download that locks it, but **only an administrator can move it back**. " +
        "This is by design, not a bug",
      ),
    ],
  },

  {
    slug: "faq",
    audience: "staff",
    section: "Frequently asked questions",
    order: 130,
    title: "Frequently asked questions (staff)",
    description: "The questions staff ask most often",
    since: "1.0",
    keywords: ["staff faq", "faq", "help", "common questions", "troubleshooting", "import error", "unlock export"],
    blocks: [
      steps([
        { title: "The system total is lower than my hand count. Is something wrong?", body: "Not necessarily. Most often a make-up day has been **forfeited**, meaning no hours were logged on the scheduled make-up day. Check the course's make-up days first before concluding the system is wrong" },
        { title: "I've already exported the documents but need to change something. What do I do?", body: "Normally staff can return it themselves (unlocking one step back). If you need to go back more than one step, or it has already been sent to finance, an administrator must unlock it" },
        { title: "A TA changed study level mid-semester. Does the pay rate change immediately?", body: "It changes from the actual date of the change: hours before that date use the old rate, hours after it use the new rate. The system keeps each TA's education history, so it never applies the current level retroactively" },
        { title: "The registrar file won't import (error). What should I check?", body: "Check that the file really is .xlsx (not .xls or just a renamed extension), is within the size limit, and that its columns match the original registrar file. The preview before saving separates errors (cannot be imported) from warnings (can be imported but worth checking)" },
        { title: "I can't create the budget summary or cover sheet. What should I check?", body: "Check appointment orders and monthly periods. A new direct-payment cover sheet also requires an issued claim package for that month. Open the separate cover-sheet menu and resolve the reported blockers before downloading." },
      ]),
    ],
  },
  transferCoverPage("en"),
];
