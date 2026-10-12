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
    description: "Month-end work: review the hours lecturers have approved, then export the documents as a ZIP",
    since: "1.0",
    routes: ["/staff/payouts"],
    keywords: ["export documents", "certifier", "ready to export", "payouts", "month-end", "disbursement documents", "zip", "fiscal year rounds"],
    blocks: [
      text("Month-end work: review each course's lecturer-approved hours, then export the disbursement documents as a ZIP file. Click a course name to start"),
      screenshot("S-PO-01", "The course list, the certifier, and the statuses awaiting your action, exported, or not your turn yet"),
      screenshot("S-PO-03", "Choosing the certifier, and the message for an acting appointment"),
      text("Choose whose name is printed as the certifier on this semester's disbursement documents. The default is **By position: head of department**. Your choice is saved immediately"),
      screenshot("S-PO-02", "The status badge after each course name, telling you what that course needs next"),
      text("The badge after a course name tells you what to do next. Each course shows one badge, chosen by the priority order in this table"),
      statusTable([
        { status: "N awaiting review", tone: "warn", meaning: "There are months to review" },
        { status: "Awaiting appointment order", tone: "warn", meaning: "A TA is not yet in an appointment order", whoActsNext: "Issue the order on the TA appointments page" },
        { status: "N more rounds to send", tone: "warn", meaning: "The semester spans two fiscal years and a round is still left to export" },
        { status: "All rounds sent", tone: "success", meaning: "The semester spans two fiscal years and both rounds have been exported" },
        { status: "Exported (date)", tone: "success", meaning: "Exported; you can download it again" },
        { status: "Partly exportable", tone: "info", meaning: "You can export now, but some entries are still awaiting lecturer approval or TA submission" },
        { status: "Ready to export", tone: "info", meaning: "Fully reviewed, waiting for you to download" },
        { status: "Not your turn yet", tone: "neutral", meaning: "Nothing for staff to do yet" },
      ]),
      text("Once you download a course's ZIP, the exported months are **locked** and can no longer be edited, but you can always download them again"),
      text("A TA who is not yet in an appointment order shows the **Awaiting appointment order** badge in the course row. Hover over the badge to see the names. Issue the next round of orders first; only then can you export that TA's documents"),
      callout("info", "The number of courses “not your turn yet” is shown at the bottom of the page. The reason is that the TA has not submitted hours, the lecturer has not approved them, or **no appointment order has been issued** (issue it from the “TA appointments” menu)"),
      callout(
        "warn",
        "**A semester that spans the end of the fiscal year (30 September) needs 2 separate rounds of documents.** " +
        "Round 1 (June to September) is paid from the budget of the year that is closing; round 2 (October) is paid from the new year's budget. They are separate documents from separate budgets, " +
        "so a course may have round 1 complete but round 2 still outstanding. The list page automatically puts these in a separate group, **“Round 2 not yet sent”**, " +
        "apart from round 1's “Awaiting your action” group",
      ),
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
      text("This page follows the order of the work: **monthly review at the top, export at the bottom**"),
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
    title: "Export the document ZIP (locks)",
    description: "A summary of amounts; the system spreads the money for you when it exceeds the budget, then you download the ZIP",
    since: "1.0",
    // No `routes:` here: this is the lower section of the SAME single-scroll
    // /staff/payouts/[tcId] page as payouts/detail (which claims the route
    // and documents the page top to bottom) — there's no separate URL for
    // "just the export part" to disambiguate against.
    keywords: ["export zip", "spread pay", "actual pay", "budget cap", "lock month", "download zip", "export history", "amount mismatch"],
    blocks: [
      screenshot("S-PO-07", "The export bar, the totals table, the Actual pay column and the Download ZIP button"),
      text(
        "This section sums up the pay of every TA. If the total exceeds the budget, the system **spreads the money automatically**, and the “Actual pay” column shows the amount after spreading. " +
        "When everyone's data is ready, tick the **confirmation box** and press **Download ZIP (locks)**",
      ),
      callout("danger", "Once you download, the work logs of fully approved months are **locked immediately**. They can be edited again only if staff return them or an administrator unlocks them"),
      text("If the download button is still disabled, the system shows the **reason** above the button, for example"),
      table(
        ["Message", "What to do"],
        [
          ["Not yet in an appointment order", "Issue the next round of appointment orders on the TA appointments page"],
          ["Approved, but overlaps the TA's current class schedule", "First return or edit the entries that clash with the TA's own class times"],
          ["N more rounds to send", "The semester spans two fiscal years; you also need to export the remaining round"],
        ],
      ),
      callout(
        "warn",
        "If you download again and the amount for an already-exported month differs from last time, the system shows you the old and new amounts. " +
        "Check that month's pay rate and work logs first, because the new set of documents will not match the set already sent to finance",
      ),
      screenshot("S-PO-08", "The files inside the ZIP after extracting it"),
      gif("S-PO-G3", "Tick the confirmation, download the ZIP, and that month becomes locked"),
      screenshot("S-PO-09", "Extra tools and the export history"),
      text("**View/edit work logs** opens the raw work log table of every TA, where you can add, edit or delete rows one at a time. **Export history** shows who exported, when, and for how much"),
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
    title: "Budget summary and direct-payment cover sheet",
    description: "See the budget summary on screen, then download the summary, the direct-payment cover sheet and the graduate documents",
    since: "1.0",
    routes: ["/staff/budget-summary"],
    keywords: ["budget summary", "direct payment cover sheet", "graduate documents", "remaining budget", "monthly disbursement", "excel summary", "transfer cover"],
    blocks: [
      screenshot("S-BS-01", "The budget summary page: choose the document, choose the months, the summary table and the download button"),
      text("Choose the document you need and the months to include. The summary table is always shown on screen for you to check before you download"),
      screenshot("S-BS-02", "The per-course summary table: one disbursement column per month and a remaining column at the end"),
      callout(
        "info",
        "There is one **Disbursed (month)** column for each month you choose. Each column splits regular and special amounts and never adds up amounts across months. " +
        "There is a single **Remaining** column at the end of the table: the **Requested budget** minus the disbursements of all the months you chose. The Excel file works the same way",
      ),
      screenshot("S-BS-03", "The “Some items should be checked before downloading” box"),
      text("If anything looks unusual, the system warns you before downloading. Choose **Download without merging the rest** to continue while leaving out the flagged items, or **Cancel download** to go back and fix them first"),
      screenshot("S-BS-04", "Example direct-payment cover sheet with 5 columns and a note"),
      text("The direct-payment cover sheet (ใบปะหน้าจ่ายตรง) has 5 main columns following the college's form. The **Note** column is shown on screen only and is not printed on the document"),
      screenshot("S-BS-05", "Example graduate documents (.xls and .docx)"),
      screenshot("S-BS-06", "Document creation history and the conditions box"),
      callout(
        "warn",
        "If a document cannot be created, check 2 things: **the TA appointment order has been issued** (TA appointments page) " +
        "and **the claim round for that month has been set** (Settings, semester calendar tab). If either is missing, the system cannot create the summary documents",
      ),
      gif("S-BS-G1", "Choose 2 months, the table updates, then download the summary and the cover sheet"),
    ],
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
      text(
        "After exporting from the system, use this page to track **the paper documents** in order: TA signs → lecturer signs → certifier signs → send to finance → dean signs. " +
        "Everyone in the system sees the status you update here",
      ),
      screenshot("S-PG-01", "The “Courses not yet exported” condition bar (steps still disabled)"),
      callout("warn", "You must **export documents for every course** in the semester first. This bar shows which courses are left; once all are done you can press the steps below"),
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
    keywords: ["status table", "monthly status", "workflow", "status codes", "lecturer approved", "exported", "finance sent"],
    blocks: [
      statusTable([
        { status: "Not sent", tone: "neutral", meaning: "Waiting for the TA to submit for approval (system code: `pending`)" },
        { status: "Lecturer approved", tone: "info", meaning: "Waiting for staff review (system code: `lecturer_approved`)", whoActsNext: "Staff" },
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
        { title: "I can't create the budget summary or cover sheet. What should I check?", body: "Check 2 things: whether the TA appointment order for that round has been issued, and whether the claim round for that month has been set in the semester calendar. If either is missing, the documents cannot be created" },
      ]),
    ],
  },
];
