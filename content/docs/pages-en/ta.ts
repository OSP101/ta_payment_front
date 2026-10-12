import {
  type DocPage, journey, text, callout, steps, screenshot, gif, statusTable, table, uiPath, since, goToApp, tryInDemo,
} from "../types";

export const taPagesEn: DocPage[] = [
  {
    slug: "start",
    audience: "ta",
    section: "Getting started",
    order: -1,
    title: "Your first time",
    description: "What a teaching assistant needs to do, in the real order, from signing in to getting paid",
    since: "1.1",
    keywords: ["getting started", "first time", "new ta", "new teaching assistant", "ta steps", "what to do", "quick start", "onboarding", "checklist"],
    blocks: [
      text(
        "Read from top to bottom, in order. Steps with a **number** are things you do. " +
        "Steps with an **hourglass** are when you wait for someone else. Whenever it is your turn, the system emails you.",
      ),
      callout(
        "warn",
        "You must **submit your work log by each month's deadline**. If a month closes before you submit it, you are treated as not wishing to log hours for that month. " +
        "You cannot submit it late, and you can no longer claim pay for that month.",
        "The most important rule",
      ),
      journey([
        {
          kind: "do",
          title: "Sign in",
          when: "First time",
          body:
            "- Press **Sign in with KKU Account** and use your @kkumail.com account, or use the email and temporary password you got from your lecturer or staff\n" +
            "- If you use a temporary password, the system asks you to set a new one, then sign in again with the new password\n" +
            "- The first time, a **PDPA consent** window appears. Read it and give consent to start using the system",
          screenshot: "C-02",
          more: "common:first-login",
        },
        {
          kind: "do",
          title: "Submit your disbursement documents in 4 steps",
          when: "Once only",
          body:
            "Open **My documents** and work through the steps in order\n" +
            "1. Personal details, bank account and signature\n" +
            "2. Check the creditor form the system fills in for you, then confirm it\n" +
            "3. Upload a copy of your national ID card\n" +
            "4. Upload a copy of your bank book page\n\n" +
            "Files must be PDF, no larger than 10 MB. On the ID card copy, write “certified true copy” (สำเนาถูกต้อง) and sign it before scanning",
          notice:
            "Press **View submitted file** to open a file you sent and check it again. If you sent the wrong file, just upload a new one without waiting for it to be returned. " +
            "Staff send you one email once every file has been reviewed, saying which files passed and which did not. " +
            "If a file is returned, fix it and resend only that file. Until your documents pass, you cannot log hours",
          screenshot: "T-DC-01",
          go: { label: "Go to My documents", route: "/ta/documents" },
          more: "documents/overview",
        },
        {
          kind: "do",
          title: "Import your class schedule",
          when: "Start of semester",
          body:
            "The system uses your class schedule to check that the sessions you assist in do not clash with your own classes. Without a class schedule, any request with your name on it stays at Awaiting decision\n" +
            "- Download your class schedule file (.ics) from the registrar system `reg.kku.ac.th`\n" +
            "- Open **My class schedule**, upload the file, check the preview and confirm\n" +
            "- If you have no regular classes and you are a 4th-year (or later) undergraduate or a graduate student, choose the WBA option instead",
          gif: "T-SC-G1",
          go: { label: "Go to My class schedule", route: "/ta/schedule" },
          more: "schedule/overview",
        },
        {
          kind: "wait",
          title: "The lecturer sends a request and staff issue the appointment order",
          body: "The lecturer sends a request with your name on it, the system checks it against the rules, and staff issue the appointment order",
          notice:
            "When you are appointed, you get the email **You have been appointed as a teaching assistant**, which gives the course, section " +
            "and the work log deadline for each month. A card for that course also appears on your home page.",
        },
        {
          kind: "do",
          title: "Create work log entries for the whole semester",
          when: "After you are appointed",
          body:
            "- Press the course card on your home page, then open **Work log**\n" +
            "- Press **Auto-generate**. The system creates entries for the whole semester from the teaching schedule, skipping holidays, exam periods and sessions that clash with your classes\n" +
            "- Edit or delete any day you did not actually work. You can add other work, such as grading, yourself\n" +
            "- Sessions that fall on a holiday cannot be logged until the lecturer schedules a make-up. You can press **Remind lecturer** in **Holidays and make-up days**",
          gif: "T-WL-G1",
          go: { label: "Go to home page", route: "/ta" },
          more: "worklog/generate",
        },
        {
          kind: "do",
          title: "Submit for approval before every monthly deadline",
          when: "Every month",
          body:
            "- Check that the month's entries match the work you actually did\n" +
            "- Press **Submit for approval**. The deadline is shown at the top of each month's box. You may submit early\n" +
            "- Once submitted, you cannot edit that month's entries until the lecturer approves them or returns them",
          warn: "Don't wait until the last day. A month that closes before you submit it **can no longer be claimed**",
          notice: "If the deadline is near and you have not submitted, the system sends the email **Work log deadline approaching**",
          gif: "T-WL-G4",
          more: "worklog/submit",
        },
        {
          kind: "wait",
          title: "The lecturer reviews and approves",
          notice:
            "When the lecturer approves, you get the email **Work log approved**. " +
            "If it is returned, the email gives the reason. Fix the rows shown in red and submit again.",
        },
        {
          kind: "do",
          title: "Follow your payment status",
          when: "After the lecturer approves",
          body:
            "Open **Payment status** to see where each month of each course is, for example waiting for the lecturer, waiting for staff, " +
            "or sent to finance. If staff ask you to come and sign paper documents, go and sign them as arranged\n\n" +
            "After that, log your hours and submit for approval like this every month until the semester ends",
          screenshot: "T-RM-02",
          go: { label: "Go to Payment status", route: "/ta/reminders" },
          more: "reminders",
        },
      ]),
      callout(
        "info",
        "Stuck somewhere? Type the message you see on screen into the manual's search box, or press the manual button at the top of that page in the system. " +
        "It opens the explanation for that page straight away.",
      ),
    ],
    related: ["faq", "reference/rules"],
  },

  {
    slug: "home",
    audience: "ta",
    section: "Getting started",
    order: 0,
    title: "My home page",
    description: "What to do before you start work, choosing a semester, and the courses you are a TA for",
    since: "1.0",
    routes: ["/ta"],
    keywords: ["ta home", "home page", "checklist", "action needed", "not wishing to log hours", "course card", "to-do", "semester"],
    errors: ["ถือว่าไม่ประสงค์ลงเวลา", "Treated as not wishing to log hours"],
    blocks: [
      text(
        "Before starting work, a TA must do 2 things: **submit 3 document files** and **create your own class schedule**. " +
        "After that, your regular work is to **log hours** in each course and **submit for approval** to the lecturer before every monthly deadline. " +
        "You get paid once the lecturer approves and staff send the claim.",
      ),
      screenshot("T-HM-01", "Home page of a new TA account, to-do list at 0/2"),
      text("Until both are done, the home page shows how many you have finished, with a button to continue. While your documents have not passed, you can open the menus but cannot save or submit anything yet."),
      screenshot("T-HM-02", "1/2 done after submitting documents, while waiting for staff review"),
      screenshot("T-HM-03", "The “Action needed” box, for example a returned document, a log the lecturer returned, or a deadline coming up"),
      callout("warn", "A month that closed before you submitted it shows **Treated as not wishing to log hours**. It cannot be submitted late. There are no exceptions."),
      screenshot("T-HM-05", "The “Treated as not wishing to log hours” message for a month that closed without being submitted"),
      screenshot("T-HM-04", "Course cards in 3 states: not yet submitted, awaiting lecturer approval, and returned by the lecturer"),
      text("Each card shows approved hours, hours awaiting approval, the estimated amount and this month's status. Press a card to work in that course."),
      tryInDemo("Try the TA home page in the sandbox", "ta", "ta-home"),
    ],
    related: ["ta:documents/overview", "ta:schedule/overview"],
  },

  /* ---------------------------- Documents ---------------------------- */
  {
    slug: "documents/overview",
    audience: "ta",
    section: "Documents",
    order: 10,
    gettingStarted: 2,
    title: "Disbursement documents (overview)",
    description: "The 4 steps you must finish before you can log hours and get paid",
    since: "1.0",
    routes: ["/ta/documents"],
    keywords: ["ta documents", "submit documents", "needs revision", "awaiting review", "my documents", "disbursement documents", "upload", "document steps"],
    blocks: [
      text(
        "Every TA must complete these 4 steps in order, to send 3 document files for staff review. " +
        "Once all of them pass, the system automatically lets you log hours and claim pay.",
      ),
      screenshot("T-DC-01", "The documents page at the start, 0/4"),
      table(
        ["Step", "Document"],
        [
          ["1", "Personal details, bank account and signature"],
          ["2", "Creditor form (a PDF the system fills in for you)"],
          ["3", "Copy of national ID card"],
          ["4", "Bank book page"],
        ],
      ),
      text("The system opens the next step for you. If you see a **Needs revision** tag, staff have returned it. Fix only that item."),
      screenshot("T-DC-02", "All 4/4 done, awaiting review"),
    ],
    related: ["ta:documents/step1-profile", "ta:documents/rejected"],
  },
  {
    slug: "documents/step1-profile",
    audience: "ta",
    section: "Documents",
    order: 11,
    title: "Step 1: Personal details, bank account and signature",
    description: "Student ID, phone number, national ID number, bank account and signature",
    since: "1.0",
    // No `routes:` here: all 4 document steps are accordion sections on the
    // same /ta/documents page — documents/overview above already claims it.
    keywords: ["student id", "national id number", "bank account", "signature", "promptpay", "personal details", "phone number"],
    blocks: [
      table(
        ["Field", "Format"],
        [
          ["Student ID", "`653020123-4`"],
          ["Phone number", "9–10 digits"],
          ["National ID number", "13 digits"],
          ["Bank account", "Choose the bank, then enter the account number. The system checks the number of digits for that bank"],
        ],
      ),
      screenshot("T-DC-03", "Personal details fully filled in"),
      screenshot("T-DC-04", "Warning when the account number's digit count does not match the bank"),
      steps([
        { title: "Sign inside the box with your mouse or finger", gif: "T-DC-G1" },
      ]),
      callout("warn", "The account you use must be **linked to PromptPay with the national ID number** you enter in this step. An account not linked to PromptPay cannot be used."),
      callout("info", "Your national ID number is stored encrypted. Your bank details and signature are not stored in the system (PDPA); they are used only to create the PDF form."),
    ],
  },
  {
    slug: "documents/step2-creditor-form",
    audience: "ta",
    section: "Documents",
    order: 12,
    title: "Step 2: Creditor form",
    description: "The system fills in the PDF from your step 1 details; you check it and confirm",
    since: "1.0",
    keywords: ["creditor form", "invoice", "blank form", "pdf form", "confirm document"],
    blocks: [
      screenshot("T-DC-05", "The creditor form filled in by the system, shown on screen before you confirm"),
      steps([
        { title: "Check that the document on screen is correct" },
        { title: "Press “Confirm and save this document”" },
      ]),
      callout("tip", "If the system filled it in wrongly, download the **blank form**, fill it in yourself, scan it as a PDF and upload that instead."),
      screenshot("T-DC-06", "The blank form download button and the upload box for a form you filled in yourself"),
    ],
  },
  {
    slug: "documents/step3-4-uploads",
    audience: "ta",
    section: "Documents",
    order: 13,
    title: "Steps 3–4: Upload document copies",
    description: "National ID card copy and bank book page, file requirements and virus scanning",
    since: "1.0",
    keywords: ["national id card copy", "bank book page", "certified true copy", "pdf 10mb", "upload", "file size", "virus scan"],
    errors: ["ไฟล์ต้องเป็น PDF ไม่เกิน 10 MB", "File must be a PDF no larger than 10 MB"],
    blocks: [
      table(
        ["File", "Must have"],
        [
          ["Copy of national ID card", "Write “certified true copy” (สำเนาถูกต้อง) and sign the copy before scanning"],
          ["Bank book page", "The page where the account number and account name are clearly visible"],
        ],
      ),
      screenshot("T-DC-07", "Example of an ID card copy marked “certified true copy” (สำเนาถูกต้อง) before upload"),
      callout("warn", "Only **PDF files up to 10 MB** are accepted. If you took a photo, convert it to PDF first. You see a preview before uploading, and the system scans every file for viruses."),
      screenshot("T-DC-08", "Warning when a file is not a PDF or is larger than 10 MB"),
      gif("T-DC-G2", "Choose a file, check the preview, upload, then wait for the virus scan to finish"),
    ],
  },
  {
    slug: "documents/rejected",
    audience: "ta",
    section: "Documents",
    order: 14,
    title: "What to do when a document is returned",
    description: "Read the reason from staff, then resend only the returned file",
    since: "1.0",
    keywords: ["document returned", "needs revision", "resend documents", "rejected", "fix document", "staff reason"],
    blocks: [
      text(
        "After you submit, the status is **Awaiting review**. Staff review one file at a time. As soon as all 3 files pass, the system opens every menu for you. " +
        "If a file is returned, a reason tells you what to fix. Resend only that file, not the whole set.",
      ),
      screenshot("T-DC-09", "A returned step, with the “Needs revision” tag and the reason from staff"),
      table(
        ["Common reason", "How to fix"],
        [
          ["Document is unclear", "Scan it again more clearly"],
          ["Not signed, or “certified true copy” not written", "Write and sign on the copy, then scan it again"],
          ["Wrong file attached", "Make sure you chose the right file for the right box, then upload again"],
        ],
      ),
    ],
  },

  /* ---------------------------- Class schedule ---------------------------- */
  {
    slug: "schedule/overview",
    audience: "ta",
    section: "Class schedule",
    order: 20,
    gettingStarted: 3,
    title: "My class schedule",
    description: "Why you need a class schedule, and the fastest way to create one",
    since: "1.0",
    routes: ["/ta/schedule"],
    keywords: ["class schedule", "ics", "reg.kku.ac.th", "awaiting decision", "timetable", "import schedule", "time clash", "upload ics"],
    blocks: [
      text(
        "The system uses your class schedule to check that **the teaching sessions your lecturer assigns do not clash with your classes**. If you do not create a class schedule, any TA request " +
        "with your name on it stays at **Awaiting decision**.",
      ),
      screenshot("T-SC-01", "An empty class schedule page, with the .ics upload button, the add session button and the WBA option"),
      text("**The fastest way:** download your class schedule file (.ics) from the registrar system `reg.kku.ac.th` and upload it on this page. The system reads your weekly classes and replaces your whole existing schedule. You get a preview to check before importing."),
      screenshot("T-SC-02", "The registrar system page with the .ics download button"),
      gif("T-SC-G1", "Upload the .ics file, check the preview, then confirm"),
      tryInDemo("Try uploading a class schedule in the sandbox", "ta", "ta-schedule"),
    ],
    related: ["ta:schedule/manual-draw", "ta:schedule/wba"],
  },
  {
    slug: "schedule/manual-draw",
    audience: "ta",
    section: "Class schedule",
    order: 21,
    title: "Or draw your schedule yourself",
    description: "Drag to create, move, stretch or edit class sessions yourself",
    since: "1.0",
    keywords: ["draw schedule", "drag to create session", "add class", "edit session", "manual schedule", "drag and drop"],
    blocks: [
      gif("T-SC-G2", "Drag to create a session, drag to move it, pull an edge to change the time, and edit the course code. The system saves for you"),
      table(
        ["What you do", "Result"],
        [
          ["Drag on an empty slot", "Creates a new session"],
          ["Drag a session", "Moves it to another day or time"],
          ["Pull the left or right edge", "Makes it longer or shorter"],
          ["Click a session", "Edit details such as the course code (`SC363001`), lecture or lab, and sec"],
        ],
      ),
      callout("info", "Times can only be between 08:00 and 20:00."),
      screenshot("T-SC-03", "The add session form for typing times, for anyone who prefers not to drag"),
      text("The system saves automatically all the time. Check the top-right corner to see whether it has saved."),
    ],
  },
  {
    slug: "schedule/wba",
    audience: "ta",
    section: "Class schedule",
    order: 22,
    title: "No class schedule (WBA, year 4)",
    description: "Undergraduate TAs in year 4 or above, or graduate TAs, with no regular classes choose this option instead",
    since: "1.0",
    keywords: ["wba", "no class schedule", "year 4", "graduate student", "no regular classes", "special case"],
    blocks: [
      text(
        "This option is in the **Special cases** box at the bottom of the class schedule page. Use it instead of creating a schedule when you have no regular classes. The system then does not check for time clashes. " +
        "Two groups can use it: undergraduates in **year 4 or above**, and **master's or doctoral** students in any year.",
      ),
      text(
        "Undergraduates see the option **I'm a 4th-year / WBA student (no regular classes)**. " +
        "Graduate students see the option **I have no regular classes (graduate student)**.",
      ),
      callout("info", "The system works out your year from the student ID you entered in the personal details form. If you are an undergraduate but cannot choose this option, check that you have entered your student ID and that it is correct."),
      screenshot("T-SC-04", "The WBA option turned on, and the confirmation window"),
      callout("danger", "Turning on WBA **deletes every class session you have entered**. If you still have some classes, do not choose this option."),
    ],
  },
  {
    slug: "schedule/locked",
    audience: "ta",
    section: "Class schedule",
    order: 23,
    title: "When the semester is locked",
    description: "After the semester's documents are exported, the class schedule can no longer be edited",
    since: "1.0",
    keywords: ["class schedule locked", "cannot edit", "read only", "semester locked", "exported", "drop a course"],
    blocks: [
      text("Once staff have exported the semester's disbursement documents, your class schedule for that semester becomes **view only and cannot be edited**, so it matches the documents already issued."),
      callout("warn", "Once your TA request for that semester is approved, you can still **add class sessions**, but you **cannot delete existing sessions or shorten them yourself**, because teaching sessions that clashed with your classes have already been removed from your workload. If your class schedule really changes, for example you drop a course, contact staff."),
      screenshot("T-SC-05", "The “This semester is locked, read only” bar"),
    ],
  },

  /* ---------------------------- Courses ---------------------------- */
  {
    slug: "course-overview",
    audience: "ta",
    section: "Courses",
    order: 30,
    title: "Course overview and switching courses",
    description: "Summary figures for the course you assist in, and the teaching schedule",
    since: "1.0",
    routes: ["/ta/courses/[tcId]"],
    keywords: ["course overview", "switch course", "course switcher", "approved hours", "pending hours", "estimated pay", "teaching schedule"],
    blocks: [
      screenshot("T-CO-01", "The course overview page, the 4 summary figures, and the red number on the work log menu"),
      table(
        ["Figure", "Meaning"],
        [
          ["Status", "This month's status"],
          ["Approved hrs", "Hours the lecturer has approved"],
          ["Pending hrs", "Hours waiting for the lecturer's review"],
          ["Estimated amount", "Based on approved hours"],
        ],
      ),
      text("If you are a TA for several courses, press the course name in the top bar to switch to another course straight away, without going back to the home page."),
      screenshot("T-CO-02", "The course list in the top bar, showing every course you are a teaching assistant for"),
      screenshot("T-CO-03", "The “Sessions removed because they clash with your class schedule” warning and the section's teaching schedule"),
      goToApp("Go to the home page and choose your course", "/ta"),
    ],
    related: ["ta:worklog/rules"],
  },

  /* ---------------------------- Work log ---------------------------- */
  {
    slug: "worklog/rules",
    audience: "ta",
    section: "Work log",
    order: 40,
    gettingStarted: 4,
    title: "Work log: the rules",
    description: "Draft, submit for approval, lecturer approval, and the monthly deadline you must not miss",
    since: "1.0",
    routes: ["/ta/courses/[tcId]/worklog"],
    keywords: ["log hours", "worklog", "work log", "deadline", "not wishing to log hours", "draft", "monthly deadline", "submit"],
    errors: ["ถือว่าไม่ประสงค์ลงเวลา", "Treated as not wishing to log hours"],
    blocks: [
      text(
        "This page is for recording your working hours day by day. Entries stay as **Draft** until you press **Submit for approval** for the lecturer to review. " +
        "Hours count towards your pay only after the lecturer approves them.",
      ),
      callout("danger", "You must submit by **each month's deadline**. A month that closes before you submit it is treated as **not wishing to log hours**. It cannot be submitted late. There are no exceptions."),
      screenshot("T-WL-01", "An empty work log page, with the auto-generate button, the add entry button and the monthly boxes"),
      screenshot("T-WL-02", "The top of a monthly box: the deadline and the number of draft, awaiting-lecturer and approved entries"),
    ],
    related: ["ta:worklog/generate", "ta:worklog/submit"],
  },
  {
    slug: "worklog/generate",
    audience: "ta",
    section: "Work log",
    order: 41,
    title: "Auto-generate (recommended)",
    description: "One press gives you entries for the whole semester from the section's teaching schedule",
    since: "1.0",
    keywords: ["auto-generate", "generate worklog", "create entries", "whole semester", "teaching schedule", "overwrite"],
    errors: ["ปุ่มจะใช้ไม่ได้หากมีรายการที่ส่งอนุมัติไปแล้ว", "The button is disabled if any entries have already been submitted for approval"],
    blocks: [
      text(
        "With one press, the system creates entries for the whole semester from the **section's teaching schedule**, skipping holidays, exam periods and sessions that clash with your classes. " +
        "You can then edit or delete individual days afterwards.",
      ),
      screenshot("T-WL-03", "The auto-generate button and the window confirming it will overwrite existing entries"),
      callout("warn", "If any entries have already been submitted for approval, this button is disabled. Generating again overwrites all existing entries."),
      gif("T-WL-G1", "Press auto-generate and entries for the whole semester appear in each month"),
    ],
  },
  {
    slug: "worklog/manual-entry",
    audience: "ta",
    section: "Work log",
    order: 42,
    title: "Add, edit or delete entries yourself",
    description: "Enter one entry at a time when you are not using auto-generate",
    since: "1.0",
    keywords: ["add work log entry", "edit work log", "delete entry", "activity type", "holiday warning", "weekly quota"],
    blocks: [
      text(
        "For each entry, fill in the **activity type** (lecture, lab, grading, make-up, or other, as the lecturer set in the request), " +
        "the **date** and the **start and end time**. The system works out the hours. One entry can be at most 7 hours.",
      ),
      screenshot("T-WL-04", "The add entry form and the list of activity types to choose from"),
      callout("warn", "If that day is a holiday, or the hours go over the weekly quota, the system warns you before saving."),
      screenshot("T-WL-05", "The “This day is a holiday” and “Over the weekly quota” warnings"),
      gif("T-WL-G2", "Edit the time on a draft row; the system recalculates the hours and saves, then delete a row you do not need"),
    ],
  },
  {
    slug: "worklog/multi-section",
    audience: "ta",
    section: "Work log",
    order: 43,
    title: "Assisting several sections",
    description: "Each section has its own card and must be submitted separately",
    since: "1.0",
    keywords: ["several sections", "multiple sections", "submit each section", "section card", "unsubmitted"],
    blocks: [
      screenshot("T-WL-06", "Cards for several sections, with the number not yet submitted"),
      callout("warn", "If you are a TA for several sections of the same course, you must **log hours and submit for approval separately for every section**. After submitting one section, don't forget the rest. The card tells you how many sections are still outstanding."),
    ],
  },
  {
    slug: "worklog/duty-schedule",
    audience: "ta",
    section: "Work log",
    order: 44,
    title: "Regular duty schedule (grading and other work)",
    description: "Set your regular weekly times and auto-generate fills them in for the whole semester",
    since: "1.0",
    keywords: ["duty schedule", "regular duties", "grading", "weekly hours", "other work", "auto-generate"],
    blocks: [
      text("If the lecturer included grading or other work hours in the request, first set the **regular weekly time slots** for that work in this section, then press auto-generate. The system adds entries every week for the whole semester."),
      screenshot("T-WL-07", "The regular duty schedule section, setting the time slots for each week"),
      callout("warn", "Total hours per week **must not exceed** what the lecturer set in the TA request."),
      gif("T-WL-G3", "Set your regular duty times, then press auto-generate; grading entries appear every week"),
    ],
  },
  {
    slug: "worklog/submit",
    audience: "ta",
    section: "Work log",
    order: 45,
    gettingStarted: 5,
    title: "Submit for approval before the deadline",
    description: "When your log is complete, submit it. After that you cannot edit until the lecturer approves or returns it",
    since: "1.0",
    keywords: ["submit for approval", "month closed", "forfeit", "deadline", "submit early", "returned", "choose months"],
    blocks: [
      text(
        "When the month's hours are complete, press **Submit for approval**. The confirmation window lists every month with entries ready to send, all ticked for you. " +
        "Untick any month you don't want to send yet. That month stays as a draft, and you can submit it later as long as the month has not closed. " +
        "Once submitted, you cannot edit until the lecturer approves or returns it.",
      ),
      text(
        "You may submit **in advance**. Draft entries for days that have not happened yet are sent too, then wait for lecturer approval and staff review as usual. " +
        "After submitting, you can still add 2 kinds of entries: days after the last day you submitted in the same month, and make-up days the lecturer sets later. " +
        "You cannot add days earlier than days you have already submitted.",
      ),
      screenshot("T-WL-08", "The Submit for approval button and the confirmation window"),
      gif("T-WL-G4", "Press Submit for approval, confirm, and the month's status changes to awaiting the lecturer"),
      screenshot("T-WL-09", "After submitting, rows show “Awaiting lecturer” and cannot be edited"),
      screenshot("T-WL-10", "A returned row in red, with the lecturer's reason and the resubmit button"),
      callout("danger", "Don't wait until the last day. If the month closes before you submit, you **forfeit that month** and can no longer claim pay for it."),
    ],
    related: ["ta:worklog/troubleshoot"],
  },
  {
    slug: "worklog/troubleshoot",
    audience: "ta",
    section: "Work log",
    order: 46,
    title: "If the work log buttons don't work",
    description: "Common causes and how to fix them",
    since: "1.0",
    keywords: ["button disabled", "locked", "waiting for staff to approve documents", "greyed out", "cannot log hours", "troubleshoot"],
    errors: ["รอเจ้าหน้าที่อนุมัติเอกสาร", "Waiting for staff to approve documents"],
    blocks: [
      screenshot("T-WL-11", "All buttons disabled, with the message “Waiting for staff to approve documents”"),
      table(
        ["Symptom", "Cause", "Fix"],
        [
          ["All buttons are grey, with the message “Waiting for staff to approve documents”", "Your 3 document files have not passed review yet", "Go to the documents page and see which file is still awaiting review or was returned"],
          ["A session on that day cannot be logged", "The session falls on a holiday and has no make-up day yet", "Go to the “Holidays and make-up days” page of that course"],
          ["A row is grey and cannot be edited", "That month has closed, or it has already been submitted for approval", "If you had not submitted it, it is forfeited. If you had, wait for the lecturer's review as usual"],
          ["The auto-generate button is disabled", "Some entries in that month have already been submitted for approval", "Add or edit the remaining entries yourself"],
        ],
      ),
    ],
  },

  /* ---------------------------- Make-up days ---------------------------- */
  {
    slug: "holidays",
    audience: "ta",
    section: "Make-up days",
    order: 50,
    title: "Holidays and make-up days",
    description: "Sessions that fall on a holiday cannot be logged until there is a make-up day",
    since: "1.0",
    routes: ["/ta/courses/[tcId]/holidays"],
    keywords: ["make-up day", "holiday", "remind lecturer", "make-up session", "public holiday", "tdbm"],
    blocks: [
      text("Teaching sessions that fall on a holiday **cannot be logged** until there is a make-up day. This page shows every session affected by a holiday, with its status."),
      screenshot("T-HL-01", "A holiday that affects a session but has no make-up day yet, and the Remind lecturer button"),
      text("Make-up days are set by **the lecturer** or pulled from **the TDBM system**. Teaching assistants cannot set, edit or delete make-up days themselves. If a session has no make-up day yet, press **Remind lecturer**. You can press it once every 24 hours per holiday."),
      screenshot("T-HL-02", "After pressing “Remind lecturer” the status shows sent; you can press it again after 24 hours"),
      text("Once there is a make-up day, log your hours on the **make-up day** instead of the original day."),
      text("If the lecturer cancels class for leave or a meeting (not a public holiday), the lecturer sets the make-up day themselves, and you see it on this page in the same way."),
    ],
  },

  /* ---------------------------- Tracking ---------------------------- */
  {
    slug: "reminders",
    audience: "ta",
    section: "Tracking",
    order: 60,
    gettingStarted: 6,
    title: "Payment status",
    description: "See which stage each month of each course has reached",
    since: "1.1",
    routes: ["/ta/reminders"],
    keywords: ["payment status", "disbursement status", "claim status", "track status", "monthly reminders", "when do i get paid", "approval steps"],
    blocks: [
      uiPath("Left menu", "Tracking", "Payment status"),
      text("Open it from the left menu of the home page, or, if you are on a course page, from the user menu in the top-right corner."),
      text("This page is for viewing only; there is nothing to press. It shows which stage each month of each course has reached: awaiting lecturer approval, awaiting staff export, or sent to finance."),
      screenshot("T-RM-01", "The box for each month, and its open and close dates"),
      screenshot("T-RM-02", "The 3 approval steps of a course, when expanded"),
      text(
        "Expand a course to see the 3 steps of the **approval status**: **Lecturer approved every work log entry**, " +
        "**Staff reviewed and exported the disbursement files**, and **Claim sent to finance**.",
      ),
      callout("tip", "If it stays at **Awaiting lecturer approval** for a long time, contact the lecturer directly. TAs have no button to chase it in the system."),
    ],
  },
  {
    slug: "timetable-form",
    audience: "ta",
    section: "Tracking",
    order: 61,
    title: "Print your class and work schedule",
    description: "The college's class schedule and work schedule form, which you can print or save as PDF",
    since: "1.1",
    routes: ["/timetable-form"],
    keywords: ["class schedule form", "print schedule", "work schedule", "print document", "pdf", "timetable form", "save as pdf"],
    blocks: [
      since("1.1", "Added the print schedule button to the My class schedule page"),
      text(
        "This form combines your class schedule and your TA work sessions in one weekly table, in the college's format. " +
        "Use it when your home department or a lecturer asks for an official class schedule.",
      ),
      steps([
        { title: "Open My class schedule", body: "It is in the left menu, under **My items**" },
        { title: "Choose the semester", body: "You can choose it at the top of the page" },
        { title: "Press “Print schedule”", body: "The form opens in a new tab. Print it or save it as PDF from your browser" },
      ]),
      screenshot("T-RM-03", "The class schedule and work schedule form, opened from the print schedule button"),
      callout("tip", "The form pulls the latest data every time you open it. If you have just edited your class schedule, wait until it has saved before pressing print."),
    ],
    related: ["ta:schedule/overview"],
  },

  /* ---------------------------- Reference ---------------------------- */
  {
    slug: "reference/status",
    audience: "ta",
    section: "Reference",
    order: 70,
    title: "All TA statuses",
    description: "What the statuses of documents, work log entries and monthly rounds mean",
    since: "1.0",
    keywords: ["status table", "document status", "work log status", "monthly status", "draft", "approved", "returned", "statuses"],
    blocks: [
      text("**Documents**"),
      statusTable([
        { status: "Awaiting review", tone: "info", meaning: "Submitted, waiting for staff to review" },
        { status: "Needs revision", tone: "warn", meaning: "Returned, with a reason given", whoActsNext: "The TA fixes that file and resubmits it" },
        { status: "Passed", tone: "success", meaning: "All 3 files passed; you can log hours now" },
      ]),
      text("**Work log entries**"),
      statusTable([
        { status: "Draft", tone: "neutral", meaning: "Not submitted yet; you can edit it" },
        { status: "Awaiting lecturer", tone: "info", meaning: "Submitted, waiting for the lecturer to review", whoActsNext: "Lecturer" },
        { status: "Approved", tone: "success", meaning: "Counts towards your pay" },
        { status: "Returned", tone: "danger", meaning: "The lecturer returned it with a reason", whoActsNext: "The TA fixes it and resubmits" },
      ]),
      text("**Monthly rounds**"),
      statusTable([
        { status: "Not submitted", tone: "neutral", meaning: "The month is still open and you have not pressed Submit for approval yet" },
        { status: "Awaiting lecturer approval", tone: "info", meaning: "Submitted, waiting for the lecturer", whoActsNext: "Lecturer" },
        { status: "Awaiting staff export", tone: "warn", meaning: "The lecturer approved; waiting for staff to review and export", whoActsNext: "Staff" },
        { status: "Sent to finance", tone: "success", meaning: "The documents were exported and are now with finance" },
        { status: "Not wishing to log hours", tone: "danger", meaning: "The month closed before it was submitted; that month is forfeited for good" },
      ]),
    ],
  },
  {
    slug: "reference/rules",
    audience: "ta",
    section: "Reference",
    order: 71,
    title: "Rules and numbers to remember",
    description: "The limits the system enforces",
    since: "1.0",
    keywords: ["rules", "numbers", "limits", "10-12 hrs", "3 courses", "7 hours", "10 mb", "weekly workload"],
    blocks: [
      table(
        ["Rule", "Number"],
        [
          ["Courses you can be a TA for per semester", "As set by staff (default 3 courses)"],
          ["Hours per work log entry", "At most 7 hrs per entry"],
          ["Workload for master's and doctoral students", "10–12 hrs per week in total, under the graduate school regulations"],
          ["Uploaded document files", "PDF only, up to 10 MB"],
          ["Reminding the lecturer about a make-up day", "Once every 24 hrs per holiday"],
        ],
      ),
    ],
  },

  {
    slug: "faq",
    audience: "ta",
    section: "FAQ",
    order: 80,
    title: "Frequently asked questions (TA)",
    description: "Questions teaching assistants often ask",
    since: "1.0",
    keywords: ["faq", "ta faq", "frequently asked questions", "when do i get paid", "forgot to submit", "change bank account", "awaiting decision"],
    blocks: [
      steps([
        { title: "When is my pay sent?", body: "After the lecturer approves that month's hours, staff review and export the documents, then pass the claim to finance on the college's schedule. How long it takes varies from month to month. You can check on the **Payment status** page" },
        { title: "I forgot to submit a month for approval. What can I do?", body: "Nothing can be done any more. A closed month is treated as not wishing to log hours, and the system cannot reopen it. Check the deadline at the top of each month's box ahead of time so you don't miss it" },
        { title: "What happens if I change semester or education level partway through?", body: "The system keeps your education history (see the education history section in account settings). Pay is calculated using your education level at that time. Hours approved before the change stay the same" },
        { title: "Can I change my bank account after my documents have passed?", body: "You can edit it on the documents page if that month's export has not happened yet, but staff need to review it again. Let staff know in advance so it doesn't affect an upcoming claim round" },
        { title: "Why is my name on a TA request stuck at “Awaiting decision”?", body: "Usually because you have not created your class schedule yet. Go to the class schedule page and fill it in completely. The system decides the request as soon as you finish" },
      ]),
    ],
  },
];
