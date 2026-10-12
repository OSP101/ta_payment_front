import {
  type DocPage, shareLink, text, callout, steps, screenshot, gif, statusTable, table, uiPath, since, goToApp, tryInDemo,
} from "../types";

/**
 * English copy of the first 16 pages of `../pages/staff.ts` (home → approvals).
 * Same pages, slugs, order, media ids, hotspots and routes; only the
 * human-readable text differs. Pages 17 onward live in `staff.b.ts`.
 */
export const staffPagesEnA: DocPage[] = [
  {
    slug: "home",
    audience: "staff",
    section: "Getting started",
    order: 0,
    title: "Dashboard",
    description: "Your pending work and a semester overview: is the budget enough, are courses requesting too many TAs, and where is work stuck",
    since: "1.1",
    routes: ["/staff"],
    keywords: ["staff dashboard", "to do", "pending work", "budget forecast", "near cap", "too many tas", "end-of-semester forecast", "download excel", "overview", "แดชบอร์ดเจ้าหน้าที่", "excel"],
    blocks: [
      since("1.1", "New dashboard, organized as questions and answers"),
      screenshot("S-DB-01", "The full dashboard: what to do now, the 3-question bar, and the left menu"),
      text(
        "The left menu has 4 groups: **To do** (the 3 routine stages), **Manage** (setup data), " +
        "**Operations** and **System**. A red number at the end of a menu item is the count of pending work. " +
        "Almost every page shows data for the **semester** selected at the top.",
      ),
      screenshot("S-DB-03", "The semester picker. Almost every page shows data for the selected semester"),
      text("**What to do now**"),
      screenshot("S-DB-02", "The “What to do now” box, with blocking items at the top"),
      text("The top box gathers pending work from every queue. Each row shows how many items are waiting and has a button that takes you to the page where you deal with them. If nothing is pending, the box says so."),
      table(
        ["Item", "Where to do it"],
        [
          ["Student numbers not entered yet (blocking)", "Courses offered"],
          ["TA requests awaiting review", "TA requests"],
          ["Creditor forms awaiting review", "TA document review"],
          ["TAs awaiting an appointment order", "TA appointment orders"],
          ["Courses awaiting review / export", "Review and export documents"],
        ],
      ),
      callout("warn", "Items marked **Blocking** must be fixed first, otherwise you cannot export the documents."),
      text("**Semester overview**"),
      text(
        "Below that is an overview the system summarizes from the latest data. At the top are 4 key figures " +
        "(courses requesting TAs, active TAs, amount disbursed, items pending) and a box of **Observations to decide on or follow up**. " +
        "The rest is split into questions; click the bar at the top to jump to the question you want.",
      ),
      screenshot("S-DB-04", "The 4 key figures and the observations box"),
      table(
        ["Question", "What it shows"],
        [
          [
            "**Will the budget last until the end of the semester?**",
            "Total budget, remaining budget and the end-of-semester forecast (the low end is the hours already logged; the high end assumes spending continues at the current pace), " +
            "courses at or near their budget cap, a cumulative disbursement chart, and budget use by curriculum.",
          ],
          [
            "**Is any course requesting more TAs than recommended?**",
            "Student numbers compared with the TAs requested, the number the system recommends, and the cap. It lists courses to review because they asked for more than recommended, and courses that may not have enough TAs.",
          ],
          [
            "**Where is work stuck?**",
            "Who each monthly claim round is waiting on (TA, lecturer or staff), the status of TA documents, and the next work log submission round.",
          ],
          ["**Courses**", "A table of every course in the semester. You can search it and see each course's budget status."],
        ],
      ),
      screenshot("S-DB-06", "The “Will the budget last until the end of the semester?” question: forecast, courses near the cap, and the cumulative chart"),
      table(
        ["Term", "Meaning"],
        [
          ["Total budget", "The sum of the budgets of every course that has sent a TA request or been approved. The system calculates it; you do not enter it."],
          ["Near cap", "The course's forecast has reached **90%** of that course's budget cap."],
          ["Over cap", "Hours have been logged, but the course's budget is not enough to pay them."],
          ["Active TAs", "TAs with at least 1 approved work log entry in this semester."],
          ["Recommended number of TAs", "Calculated from class groups that meet at the same time, using the same rule lecturers see on their home page."],
        ],
      ),
      callout("info", "Budget cannot be moved between courses, so the system looks at each course before the total. Even when the semester total still has money left, some courses may already be over their cap."),
      text(
        "Choose **Compare with semester** to see the figures next to an earlier semester. " +
        "Click **Download Excel** to take the overview and course data elsewhere.",
      ),
      text("At the bottom of the page is a **Shortcuts** box with links to pages you use often, such as approving TA requests, reviewing documents and exporting documents."),
      screenshot("S-DB-05", "The shortcuts box to frequently used pages"),
      tryInDemo("Try the staff dashboard in the sandbox", "staff", "dashboard"),
    ],
    related: ["staff:settings/terms", "staff:teaching/import", "lecturer:executive"],
  },

  {
    slug: "share-manual",
    audience: "staff",
    section: "Getting started",
    order: 1,
    title: "Send the manual to lecturers and TAs",
    description: "Links to each role's first-time setup page, with a message ready to send by e-mail or LINE",
    since: "1.1",
    keywords: ["send manual", "manual link", "share manual", "how to use", "new lecturer", "new ta", "onboarding", "getting started", "ส่งคู่มือ", "ลิงก์คู่มือ"],
    blocks: [
      text(
        "For lecturers and TAs who are just starting, send them the link to their role's **Getting started** page instead of teaching each person one by one. " +
        "That page lays out the steps in the order the real work happens, says what to click, and which e-mails they will get while waiting for others.",
      ),
      shareLink(
        "Link for lecturers",
        "/docs/lecturer/start",
        "Dear lecturer,\n\n" +
        "The College of Computing uses COCO TAS to request teaching assistants and to approve TAs' work logs. " +
        "The steps are laid out in the manual at the link below. " +
        "You can sign in right away with your KKU Account (@kku.ac.th).",
      ),
      shareLink(
        "Link for TAs",
        "/docs/ta/start",
        "To teaching assistants,\n\n" +
        "TA compensation is claimed through COCO TAS. The steps, from sending your documents and logging hours to submitting each month for approval, " +
        "are in the manual at the link below. Please submit your work log by each month's deadline. Once a month's deadline has passed, it cannot be submitted later.",
      ),
      callout(
        "info",
        "Only people with an account in the system can open the manual. If the recipient is not signed in yet, they see the sign-in page first, and the system then brings them back to the manual page.",
      ),
      callout(
        "tip",
        "Before you send a link, make sure the recipient already has an account. A lecturer needs an account whose @kku.ac.th e-mail matches the one registered. " +
        "TAs whose accounts were created by a lecturer when sending a request get a temporary password from that lecturer.",
      ),
    ],
    related: ["lecturer:start", "ta:start", "users"],
  },

  /* ---------------------------- Settings ---------------------------- */
  {
    slug: "settings/rates",
    audience: "staff",
    section: "Settings",
    order: 10,
    gettingStarted: 2,
    title: "Settings: pay rates",
    description: "TA pay rates are versioned and can be scheduled ahead. Set this first at the start of every semester",
    since: "1.1",
    routes: ["/staff/settings"],
    keywords: ["pay rates", "pay rate", "hourly rate", "40 baht", "50 baht", "scheduled rate", "effective date", "rate version", "max courses per ta", "อัตราค่าตอบแทน"],
    blocks: [
      text(
        "The **Settings** page has 7 tabs: Pay rates, Semesters, Term calendar, " +
        "Curricula, Executives, Notification e-mail and Sandbox access. **When a new semester starts**, begin with the Pay rates tab.",
      ),
      screenshot("S-SE-01", "The pay rate versions table, effective dates, and the add version button"),
      text(
        "TA pay rates are stored as **versions**. Each change creates a new version with an **effective date**, and older versions are kept as history. " +
        "The rates under the KKU announcement are: undergraduate regular program 40 baht/hr, special program 50 baht/hr; graduate regular program 50 baht/hr, special program a lump sum of 4,000 baht per person per course per semester.",
      ),
      text(
        "The **Max TA courses per person per semester** field (1–10, default 3) is the cap the system uses to decide TA requests immediately: " +
        "when a lecturer picks TAs, when the system auto-approves, and on the request review page. A change applies to requests sent after it; requests already approved are not cancelled retroactively.",
      ),
      text("**Scheduled rate**"),
      text(
        "If the effective date is in the future, that version goes into the **Scheduled rates (not in effect yet)** box. " +
        "The system keeps using the current rate until the effective date, then switches to the new rate by itself.",
      ),
      screenshot("S-SE-09", "The Scheduled rates (not in effect yet) box and the Withdraw this version button"),
      callout("info", "Only an **administrator** can withdraw a scheduled version. If you set the wrong date, ask an administrator to withdraw it, then set it again."),
      callout("warn", "If you pick an effective date in the past, the system warns you before saving, because compensation for past entries may change."),
      screenshot("S-SE-02", "The “See a calculation example” window"),
      gif("S-SE-G1", "Add a new version, fill in the 4 rates and the effective date, then save"),
    ],
    related: ["staff:settings/terms"],
  },
  {
    slug: "settings/terms",
    audience: "staff",
    section: "Settings",
    order: 11,
    gettingStarted: 3,
    title: "Settings: academic years and semesters",
    description: "Create the academic year (BE) first, then add semesters to it",
    since: "1.0",
    // No `routes:` here on purpose: /staff/settings is one page with tabs
    // switched by client-side state, not by URL (see the Thai source).
    keywords: ["semester", "academic year", "current semester", "exam period", "course budget cap", "term setup", "new semester", "ภาคเรียน", "ปีการศึกษา"],
    blocks: [
      screenshot("S-SE-03", "The list of academic years and semesters, with the “Current” badge"),
      text(
        "Create the **academic year** first (in the Buddhist Era, e.g. 2568), then add a **semester** (first, second or summer) to that year. Fill in the teaching dates, " +
        "the number of months (used to calculate pay) and the **midterm/final exam periods**; TAs cannot log hours during exam periods.",
      ),
      screenshot("S-SE-04", "The add semester form: teaching dates, number of months, exam periods, and setting it as the current semester"),
      callout("warn", "Always tick **“Set as current semester”** for the semester actually in use, because the semester picker at the top of every page starts from this value."),
      text(
        "The **Course budget cap** column is for when the faculty has a rule limiting the budget per course (e.g. no more than 20,000 baht). One value applies to every course in that semester. " +
        "Choose **Not set** = each course's budget follows the formula, or **Set a cap** = the system uses whichever is lower, the formula budget or the cap. " +
        "A newly created semester copies the value from the latest semester. Lecturers see a note that the faculty has a budget cap rule on their course budget page.",
      ),
      callout("info", "If any course already has TAs or approved hours, the system lists the courses whose budget would change and asks you to confirm first. It will not allow the change if any course has already had its disbursement documents exported."),
      gif("S-SE-G2", "Create an academic year, add the first semester, fill in the details, then set it as the current semester"),
    ],
  },
  {
    slug: "settings/calendar",
    audience: "staff",
    section: "Settings",
    order: 12,
    gettingStarted: 4,
    title: "Settings: term calendar",
    description: "The TA application period, e-mail notices to lecturers, and the monthly disbursement rounds",
    since: "1.0",
    // Same shared, tab-switched /staff/settings page, so no `routes:` claim.
    keywords: ["term calendar", "deadline", "application period", "disbursement rounds", "auto-create 5 months", "notify lecturers by e-mail", "monthly rounds", "late request", "ปฏิทินเทอม"],
    blocks: [
      text("The **TA application period** is when lecturers can send TA requests. If it is not set yet, or the opening date has not arrived, lecturers cannot send requests. After the deadline they can still send, but the request counts as “late”. There is a “Set a 30-day deadline” shortcut button. When you add a new semester, the system brings you straight to this tab."),
      screenshot("S-SE-05", "The request period and the 30-day deadline button"),
      text(
        "Turn on the **Notify lecturers by e-mail** switch and the system e-mails lecturers **on the day applications open**, " +
        "then reminds them again **3 days before the deadline**, only for courses that have no request yet. E-mails go only to lecturers who already have a course in this semester. " +
        "Lecturers assigned to a course later get the e-mail automatically, and nobody gets the same e-mail twice.",
      ),
      screenshot("S-SE-10", "The “Notify lecturers by e-mail” switch and the readiness box"),
      callout(
        "tip",
        "Check the **Readiness before notifying lecturers** box before turning the switch on. If some courses still have no lecturer, nobody for that course gets the e-mail " +
        "until you assign a lecturer on the Courses offered page.",
      ),
      text("The **Monthly disbursement rounds** are the document signing rounds for each month. Click **Auto-create 5 months** and the system lays out the rounds from the semester's start and end dates, and reminds TAs 3 days before each deadline. For a month with no round, TAs cannot log hours or submit for approval, and the course does not appear on the review and export page."),
      screenshot("S-SE-06", "5 monthly disbursement rounds after clicking auto-create"),
      gif("S-SE-G3", "Click auto-create, change the closing date of the round you need, then save"),
    ],
  },
  {
    slug: "settings/admins",
    audience: "staff",
    section: "Settings",
    order: 13,
    title: "Settings: executives",
    description: "The people who sign official documents",
    since: "1.0",
    // Same shared, tab-switched /staff/settings page, so no `routes:` claim.
    keywords: ["executives", "signatories", "signer", "acting", "dean", "position holder", "official documents", "executive dashboard", "ฝ่ายบริหาร", "ผู้ลงนาม"],
    blocks: [
      screenshot("S-SE-07", "The executive positions table, position holders, and enabled or disabled status"),
      text(
        "Executive positions such as the dean, associate deans and heads of department are a **fixed list**; you cannot add or remove positions. " +
        "This page sets who holds each position. The holder's name is printed on official documents.",
      ),
      text(
        "Click **Edit** on a position's row to open the **Change position holder** window. Type a name or e-mail to search for a user account in the system, then click **Save**. " +
        "The name and title always come from the user account and cannot be typed in by hand. If the name is wrong, fix it on the user management page.",
      ),
      screenshot("S-SE-08", "The Change position holder window: account picker, status switch, and a preview of how it prints on documents"),
      callout("info", "A position holder who is **Enabled** sees the executive dashboard automatically; you do not need to grant anything extra on the user management page."),
      callout(
        "warn",
        "If the person signing the appointment order does not hold the dean position, the system automatically prints **“Acting for”** (รักษาการแทน) after the position. " +
        "The same goes for the certifier on disbursement documents: if they do not hold the head of department position, the system prints that they are acting for the head of department.",
      ),
      text("If a position is vacant, click **Close** at the end of its row. A closed position is not used on new documents, and its holder no longer sees the executive dashboard."),
    ],
  },

  {
    slug: "settings/curricula",
    audience: "staff",
    section: "Settings",
    order: 14,
    title: "Settings: curricula",
    description: "The sheet name and full curriculum name printed on documents",
    since: "1.1",
    // Tab of the shared /staff/settings page (see settings/terms).
    keywords: ["curricula", "curriculum", "curriculum name", "sheet name", "full name", "program", "rename curriculum", "หลักสูตร"],
    blocks: [
      text(
        "The list of curricula, with the **Sheet name** and **Full name** printed on the summary of courses using TAs and on the direct-payment cover sheet. " +
        "If the college renames a curriculum (e.g. IT to ITII), change it on this tab; no code changes are needed.",
      ),
      screenshot("S-SE-11", "The curricula table: code, sheet name, full name and level"),
    ],
  },
  {
    slug: "settings/email",
    audience: "staff",
    section: "Settings",
    order: 15,
    title: "Settings: notification e-mail",
    description: "The contact details shown at the bottom of every notification e-mail",
    since: "1.1",
    keywords: ["notification e-mail", "email footer", "contact details", "contact unit", "sample e-mail", "notifications", "email", "อีเมลแจ้งเตือน"],
    blocks: [
      text(
        "Every notification e-mail sent to lecturers and TAs ends with a footer saying who to contact with questions. " +
        "This tab is where you edit that text.",
      ),
      table(
        ["Field", "Used for"],
        [
          ["Heading", "The bold first line of the footer"],
          ["Contact unit", "The name of the office or the officer responsible"],
          ["Contact details", "One channel per line, such as building and room, phone number, e-mail; up to 6 lines"],
        ],
      ),
      screenshot("S-SE-12", "The e-mail footer contact form and the sample e-mail"),
      text("Click **Sample e-mail** to see how the real e-mail looks before saving. Once saved, the next e-mail uses the new text right away."),
    ],
    related: ["common:notifications", "staff:settings/calendar"],
  },
  {
    slug: "settings/demo-access",
    audience: "staff",
    section: "Settings",
    order: 16,
    title: "Settings: sandbox access",
    description: "Choose which e-mail addresses can use the sandbox (demo)",
    since: "1.1",
    keywords: ["sandbox", "demo", "sandbox access", "testers", "demo access", "allow list", "try the system", "ห้องทดลอง"],
    blocks: [
      text(
        "Add the e-mails of people allowed to use the sandbox. E-mails not on the list cannot enter the sandbox. " +
        "Lecturers see only the lecturer and TA roles; TAs see only their own TA role.",
      ),
      screenshot("S-SE-13", "The list of people with sandbox access, and the add button"),
      callout("info", "This tab works only on servers with demo mode turned on. If it is off, the tab says so."),
    ],
    related: ["common:demo-sandbox"],
  },

  /* ---------------------------- Courses ---------------------------- */
  {
    slug: "teaching/import",
    audience: "staff",
    section: "Courses",
    order: 20,
    gettingStarted: 5,
    title: "Courses offered: import from Excel",
    description: "Do this first every semester: bring courses into the system from the registrar's file",
    since: "1.0",
    routes: ["/staff/teaching"],
    keywords: ["import courses", "excel", "xlsx", "registrar", "courses offered", "import preview", "lecturer matching", "new semester", "นำเข้ารายวิชา", "ทะเบียน"],
    blocks: [
      screenshot("S-TC-01", "The Courses offered page: Import Excel button, Open a course manually button, course table, and warning bars"),
      text(
        "At the start of a new semester, upload the file `รายวิชาที่เปิดสอน-<เทอม>-<ปี>.xlsx` (courses offered, semester, year) from the registrar's system. The system shows a **Preview before saving**, " +
        "split into new courses, courses that already exist (skipped), and items you need to decide on. Check it, then click **Confirm import**.",
      ),
      screenshot("S-TC-02", "The preview before saving: new courses, existing courses to skip, and items to decide on"),
      text(
        "The lecturer column in the preview shows the **full name of the lecturer the system matched**. Hover over the cell to see the name as written in the file. " +
        "Matched lecturers become the course's lecturers, so check the names before you confirm.",
      ),
      callout(
        "info",
        "The registrar's file has only the lecturers' first names, so some courses cannot be matched. Add the lecturer later on the course management page. " +
        "If lecturer e-mail notices are turned on, the lecturer gets an e-mail when added to a course.",
      ),
      gif("S-TC-G1", "Choose the .xlsx file, check the preview, then confirm the import"),
      screenshot("S-TC-03", "Import history"),
    ],
    related: ["staff:teaching/students"],
  },
  {
    slug: "teaching/manual-open",
    audience: "staff",
    section: "Courses",
    order: 21,
    title: "Open a course manually",
    description: "For courses that are not in the registrar's file",
    since: "1.0",
    // No `routes:` here: a modal on the same /staff/teaching page.
    keywords: ["open course manually", "add course", "new course", "manual course", "course not in file", "sections", "เปิดรายวิชาเอง", "เพิ่มวิชา"],
    blocks: [
      text(
        "Use this for courses that are not in the registrar's file. Fill in, in order: the **Course code** (e.g. `CP353201`), credits (lecture-lab-self study), " +
        "at least 1 **Lecturer**, the number of regular and special program **sections**, then the **student numbers and class schedule** of each section.",
      ),
      screenshot("S-TC-04", "The open a course manually form"),
    ],
  },
  {
    slug: "teaching/students",
    audience: "staff",
    section: "Courses",
    order: 22,
    gettingStarted: 6,
    title: "Course table and entering student numbers",
    description: "Student numbers must be entered before documents can be exported, because the budget is calculated from them",
    since: "1.0",
    // No `routes:` here either; teaching/import claims /staff/teaching.
    keywords: ["student numbers", "course budget", "budget cap", "update student numbers", "fetch from REG", "registrar system", "TA request", "enrolment", "paste from excel", "จำนวนนักศึกษา", "REG"],
    blocks: [
      screenshot("S-TC-05", "The row buttons: edit student numbers, budget, settings and delete course"),
      table(
        ["Column", "Meaning"],
        [
          ["Students (regular/special)", "Click the pencil to enter them. **They must be entered before documents can be exported**, because the budget is calculated from them."],
          ["Budget", "Amount used compared with the course's budget. A **Cap** badge means the formula budget exceeds the faculty's course budget cap, so the cap is used instead."],
          ["Gear button", "Opens the course management page, the same one lecturers see"],
          ["Bin", "Deletes the course; only possible for courses with no TA data yet"],
        ],
      ),
      screenshot("S-TC-06", "The yellow and red warning bars above the table, with filter buttons"),
      callout(
        "warn",
        "A **yellow** bar means some courses have no student numbers yet. A **red** bar means some courses have no class times, " +
        "and lecturers cannot send TA requests for them until the schedule is filled in. Click the button on the bar to see only the courses with problems.",
      ),
      gif("S-TC-G3", "Click the pencil, enter regular and special program student numbers, then save. The budget recalculates right away"),
      text(
        "Once you have the actual student numbers from the registrar, you do not need to edit course by course. Click **Update student numbers** at the top of the page, " +
        "copy a table from Excel and paste it, with the columns in this order: **Course code | Regular program count | Special program count** (if any), then click **Check**. " +
        "The system shows each course's old and new numbers first; then click **Save**. " +
        "For course codes merged into one course (e.g. CP245201 and SC363001) the system adds the numbers together. Codes it cannot find, and courses already exported, are reported and skipped.",
      ),
      text(
        "This window has 2 tabs. The **Fetch from registrar system (REG)** tab reads the **actually enrolled** numbers (the \"ลง\" column) of every class group from reg.kku.ac.th, " +
        "split into regular and special programs. Choose whether to fetch **Only courses with TA requests** (recommended, fast) or **All courses in the semester**, then click **Start fetching**. " +
        "The system sends one request at a time with pauses, and searches by group (CP*, SC* and old codes) when fetching many courses. A whole semester takes about 1 minute. It does not fetch courses already exported, and reuses results fetched within the last 10 minutes. " +
        "Once you have the numbers, click **Check** and **Save** as before. For codes it could not fetch, enter them in the **Paste from Excel** tab. " +
        "If a course that already has students would drop to 0 (e.g. fetched before registration opened), the system skips that course for now; you must tick a confirmation to save it as 0.",
      ),
      callout("info", "Click a **Course code** in the table to open that course's page on reg.kku.ac.th for the selected semester."),
      callout(
        "info",
        "The **Course budget cap** is set once under Settings > Academic years and semesters and applies to every course. If it is set, a notice bar appears above this table.",
      ),
      text(
        "The badge next to a course name shows its **TA request** status (TAs requested and approved / awaiting approval / TA request draft), and the **TA request** filter above the table " +
        "shows only courses where the lecturer has requested TAs, courses with a draft not yet sent, or courses with no TA request yet.",
      ),
    ],
  },
  {
    slug: "teaching/sections",
    audience: "staff",
    section: "Courses",
    order: 23,
    title: "Manage sections and class schedules",
    description: "Only staff can edit this page; lecturers can only view it",
    since: "1.0",
    routes: ["/staff/teaching/[tcId]"],
    keywords: ["manage sections", "edit lecturers", "delete course", "class schedule", "section type", "merged course codes", "locked course", "add section", "จัดการ section", "ลบรายวิชา"],
    blocks: [
      text("Only **staff** can edit this page; lecturers can only view it. Use it to add, edit or delete sections and set each section's weekly class schedule."),
      screenshot("S-TC-07", "Section details, teaching schedule, and the save button"),
      text("To add a section, enter the **Section number** (a number such as 1, 2), the **Number of students**, and choose the **Type**: regular or special program."),
      screenshot("S-TC-08", "The add section form, with a warning that the type cannot be changed later"),
      callout("danger", "A section's type **cannot be changed later**. If you chose the wrong one, delete it and add it again."),
      text("You can also edit the **list of lecturers** on this page, even after the course is open."),
      gif("S-TC-G4", "Edit the list of lecturers, then save"),
      callout(
        "info",
        "Courses with **merged codes** (e.g. SC363001/342372) are one class. Sections of the merged-in code are folded into the course's section " +
        "with the same number and type (Sec 1 regular folds into Sec 1 regular), student numbers are added together, and the original course's class schedule is used. " +
        "So the lecturer picks the section once in the TA request, the TA logs one set of hours, and make-ups are scheduled once. " +
        "If a section has no match, it shows a **Not merged** badge. Click **Merge into sec…** and choose the section that meets with it (only the same type can be merged).",
      ),
      screenshot("S-TC-09", "The “Locked” badge and the delete course area"),
      callout(
        "warn",
        "Once disbursement documents have been exported, the course shows a **Locked** badge and its sections and schedule can no longer be edited. " +
        "Deleting a course is only for courses opened by mistake or with no data yet. If it has TAs, work logs, or has been exported, the system will not let you delete it.",
      ),
    ],
  },

  /* ---------------------------- Users ---------------------------- */
  {
    slug: "users",
    audience: "staff",
    section: "Users",
    order: 30,
    gettingStarted: 7,
    title: "User management",
    description: "Every user account lives here: create, edit, reset passwords, and enable or disable accounts",
    since: "1.0",
    routes: ["/staff/users"],
    keywords: ["user management", "create account", "reset password", "disable account", "reset 2fa", "temporary password", "education history", "creditor form", "จัดการผู้ใช้", "รีเซ็ต 2fa"],
    blocks: [
      screenshot("S-US-01", "The user management page: create user button, search box, filters, and row buttons"),
      text(
        "To create a user, enter the **E-mail** (e.g. you@kkumail.com), **Title + first and last name**, **Phone number** (optional; 10 digits starting with 0), " +
        "then choose one **Access role**: staff, lecturer or teaching assistant (TA).",
      ),
      screenshot("S-US-02", "The create user form: single-choice access role and the TA's education level"),
      callout("warn", "Choose the right role when you create the account. **The role cannot be changed after the account is created.** If it needs to change, create a new account with the correct role."),
      callout("info", "For a TA you must also choose the **Education level**. You do not enter the year of study: the system works it out from the first 2 digits of the student ID compared with the current academic year (e.g. 67… in 2569 = year 3) and moves it up every year. The TA must enter their student ID in the personal information form."),
      callout("info", "One e-mail **can have only 1 active account at a time**. If an account was created wrongly and has been disabled, you can create a new account with the same e-mail, but you cannot re-enable the old one until the new one is disabled first."),
      steps([{ title: "Click Save", body: "The system creates a **temporary password** and shows it only once. Copy it and send it to the account owner right away.", screenshot: "S-US-03" }]),
      screenshot("S-US-04", "The edit user window"),
      text(
        "Search by name or e-mail, and filter by **Role** or **Status** from the bar above the table. At the end of each row are the **Edit details** and **Reset password** icons (hover to see their names); other actions are in the **⋯** button. " +
        "You can edit the e-mail, title, first and last name, phone number and profile picture (the role is shown for reference only). Reset password issues a new temporary password. The **⋯** button has **Reset 2FA** and **Disable account** or **Enable account**. " +
        "Staff can reset 2FA for TA and lecturer accounts (e.g. when a user loses their phone); staff and administrator accounts must be reset by an administrator.",
      ),
      text(
        "TA rows have extra **Education history** and **Class schedule** buttons. Moving a TA up an education level (bachelor's → master's → doctoral) is done with the **Education history** button. " +
        "If a TA entered the wrong **student ID, national ID number or title**, have the TA show their card at the administrative office, then fix it in the **Edit** window under \"Information entered by the TA\". You must give a reason every time, and the system notifies the TA. " +
        "If you change the ID number or title, the system creates a new creditor form from the one the TA signed (bank details and signature stay the same) and downloads it right away. " +
        "You must enter your own staff password to confirm. You can also click **Create new creditor form** on its own, for example after correcting a name.",
      ),
      screenshot("S-US-06", "The reset password and reset 2FA buttons, with their results"),
      screenshot("S-US-05", "The disable account box: type the account's e-mail to confirm"),
      callout("warn", "The system never deletes accounts permanently; use **Disable** instead. Before disabling, you must **type that account's e-mail** to confirm, so you do not disable the wrong person. You can re-enable it at any time."),
      gif("S-US-G1", "Create a new TA account, copy the temporary password, then search for the name in the table"),
    ],
  },

  /* ---------------------------- Announcements ---------------------------- */
  {
    slug: "announce",
    audience: "staff",
    section: "Announcements",
    order: 40,
    title: "Announcements",
    description: "Write announcements to groups of users, delivered as in-app notifications and e-mail",
    since: "1.0",
    routes: ["/staff/announce"],
    keywords: ["announcement", "write announcement", "pin", "publish", "schedule announcement", "recipients", "cover image", "delivery results", "remind unread", "ประกาศ", "ปักหมุด"],
    blocks: [
      text("Write announcements to groups of users. When you publish, recipients get both **an in-app notification and an e-mail**."),
      screenshot("S-AN-01", "The announcements page: the list on the left, details and delivery results on the right"),
      text(
        "The list of announcements is on the left; you can search it or filter by status. Click an announcement to see the content as recipients see it, the recipients, and **delivery results per person**. " +
        "The edit, pin, unpublish and delete buttons are at the top of the details.",
      ),
      text(
        "Click **Write announcement**, then fill in the **Heading** (up to 200 characters) and the **Content** (up to 8,000 characters). Choose a **Category** (general information, news, event, reminder or urgent). " +
        "You can attach a **Cover image** (JPEG, PNG or WebP, up to 5MB, 16:9 recommended).",
      ),
      text(
        "Click **Calendar** at the top right to see announcements by month. Each announcement is a bar from its publish date to its expiry date, " +
        "with work log closing dates and holidays shown for reference. Drag a **Draft** onto a date to open it for editing with that publish date already set, " +
        "or drag a **Scheduled** announcement to another day to reschedule it. On a phone, the calendar shows as a list for that month.",
      ),
      screenshot("S-AN-02", "The write announcement form, with a live preview next to it as you type"),
      text(
        "No cover image? You can make one on this page: in the **Images and attachments** section, click **Type text onto a template image**, then fill in the large headline, heading, details and note. " +
        "The system places the text on a college background and resizes it to fit. Click **Use as cover image**, or **Download image** to post it elsewhere.",
      ),
      text(
        "You can add new backgrounds yourself without any code changes: click **Add background**, then choose a PNG, JPEG or WebP image in 16:9, at least 1600×900 pixels (e.g. 1920×1080), up to 8MB. " +
        "Give it a name and choose whether it is a light or dark background, so the system picks the text color. Leave empty space in the middle of the image for the text.",
      ),
      text(
        "**Send to** lets you choose a recipient group, then narrow it by course or condition. For example, choosing “Teaching assistants” and one course reaches only that course's TAs. " +
        "**Add individuals** always sends to the people you name. The system shows the actual number and list of recipients every time you change something. If nothing is selected, the announcement cannot be published.",
      ),
      text(
        "**Save as draft** does not send anything yet. **Review and publish** opens a review page showing the number of recipients, publish time and expiry date before you confirm. " +
        "You can publish right away or schedule it, set an **Expiry date**, and **Pin** it to the top of the announcements page.",
      ),
      screenshot("S-AN-03", "The review page before publishing: number of recipients, time and expiry date"),
      text(
        "After publishing, the **Delivery results** section shows how many people it reached and how many have read it. **Resend** works only for people whose e-mail failed, and **Remind those who have not read it** can be used once a day per announcement. " +
        "Editing the text of, or pinning, a published announcement does not send the notice again, unless you change the recipients, in which case the system asks you to review first.",
      ),
      statusTable([
        { status: "Draft", tone: "neutral", meaning: "Not published yet" },
        { status: "Scheduled", tone: "info", meaning: "Will publish on its own at the scheduled time" },
        { status: "Published", tone: "success", meaning: "Recipients can see it" },
        { status: "Expired", tone: "neutral", meaning: "Past the expiry date that was set" },
      ]),
      gif("S-AN-G1", "Write a heading and content, choose recipients, review before publishing, then check the delivery results"),
    ],
  },

  /* ---------------------------- Stages 1-3 ---------------------------- */
  {
    slug: "approvals",
    audience: "staff",
    section: "Step 1: Review TA requests",
    order: 50,
    gettingStarted: 8,
    title: "TA requests",
    description: "See the review results of lecturers' TA requests, which the system decides by itself according to the rules",
    since: "1.0",
    routes: ["/staff/approvals"],
    keywords: ["review requests", "automatic review", "ta requests", "approved", "rejected", "rule check", "schedule conflict", "max courses per semester", "ตรวจคำขอ", "ผลตรวจอัตโนมัติ"],
    blocks: [
      text(
        "The system decides lecturers' TA requests by itself according to the rules; staff do not need to click approve. " +
        "This page is for **seeing the results**: why each request passed or did not.",
      ),
      screenshot("S-AP-01", "The TA requests page: filters, approved and rejected counts, and the list of requests"),
      text("You can choose the **Academic year** and **Semester**. The default is the semester selected at the top, or you can choose “All years”. Search by course code, course name or lecturer name."),
      screenshot("S-AP-02", "An expanded row showing the result of each rule check"),
      text("Expand a row to see the result of each check, such as TA documents, class schedule, the cap on courses per semester (set on the Settings page) and overlapping schedules."),
      statusTable([
        { status: "✓ Passed", tone: "success", meaning: "That condition passed" },
        { status: "⚠ Follow up", tone: "warn", meaning: "Passed with conditions" },
        { status: "✕ Failed", tone: "danger", meaning: "Caused the request to be rejected" },
      ]),
      screenshot("S-AP-03", "A TA card in a request, with badges saying some sessions or the whole group were removed"),
      text("The **Some sessions removed** and **Whole group removed** badges mean the system has already taken out sessions that clash with the TA's own class schedule. The reason is in the yellow box."),
      callout("tip", "If a request is rejected, ask the lecturer to fix the cause, for example get the TA to send their documents or fill in the class schedule, then **send a new request**. The system checks it again right away."),
    ],
  },
];
