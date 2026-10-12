import {
  type DocPage, journey, text, callout, steps, screenshot, gif, statusTable, table, uiPath, since, goToApp, tryInDemo,
} from "../types";

export const lecturerPagesEn: DocPage[] = [
  {
    slug: "start",
    audience: "lecturer",
    section: "Getting started",
    order: -1,
    title: "Your first time in the system",
    description: "Everything a lecturer does across the semester, in order, from signing in to approving the last month's work logs",
    since: "1.1",
    keywords: ["getting started", "first time", "new lecturer", "lecturer steps", "what do I need to do", "quick start", "onboarding", "overview"],
    blocks: [
      text(
        "Read from top to bottom. Steps with a **number** are the work you do; steps with an **hourglass** are when you wait for someone else. " +
        "You do not need to sign in during those waits. Whenever it is your turn, the system sends you an e-mail.",
      ),
      callout(
        "tip",
        "A lecturer has 3 jobs: **request TAs** at the start of the semester, **approve the work logs** of your TAs every month, " +
        "and **schedule a make-up** when a class session falls on a holiday.",
        "In short",
      ),
      journey([
        {
          kind: "do",
          title: "Sign in",
          when: "First time",
          body:
            "- Click **Sign in with KKU Account** and use the same @kku.ac.th account you use for other university systems\n" +
            "- Check the e-mail address on the confirmation card, then click **Sign in as …** (your name)\n" +
            "- On your first visit the system asks for your **PDPA consent**. Read it and click to agree",
          warn: "If you see that your account **is not registered in the system**, contact staff with the e-mail address shown on the screen. Staff will open an account for you.",
          screenshot: "C-02",
          more: "common:first-login",
        },
        {
          kind: "do",
          title: "See your courses on the home page",
          body:
            "The home page shows every course you teach this semester. Anything waiting for you is gathered in the **Action needed** box at the top. " +
            "Click a course card to work on that course. If a course has no TA yet, the card also shows the **number of TAs the system recommends**.",
          screenshot: "L-HM-01",
          go: { label: "Go to the home page", route: "/lecturer" },
          more: "home",
        },
        {
          kind: "do",
          title: "Enter section schedules (only for courses the system flags)",
          when: "Start of semester",
          body:
            "Most courses already have their schedule from the registration system, so **you can skip this step**. " +
            "Do it only when the Action needed box says **class times not set (WBA)**\n" +
            "- Open the course, then choose **Course settings** from the menu\n" +
            "- Click **Set schedule**, add the lecture and lab sessions, then save",
          warn: "You can enter this **only once**. Check the days and times carefully before saving. If something needs fixing later, contact staff.",
          gif: "L-ST-G1",
          more: "settings-schedule",
        },
        {
          kind: "do",
          title: "Submit a TA request",
          when: "When you receive the e-mail saying requests are open",
          body:
            "- Open the course, then choose **Request TAs** from the menu\n" +
            "- **Step 1**: choose the claim type that matches the course credits\n" +
            "- **Step 2**: search for the TA by name or e-mail, pick the sections, and fill in the hours until the summary bar turns blue. " +
            "If the TA has no account yet, click **Create new TA account** right there\n" +
            "- Click **Submit request**. The system decides the result against the rules immediately; there is no wait for staff",
          notice:
            "The result is sent to you by e-mail. If the request does not pass, the e-mail and the request page tell you what to fix. " +
            "If you have not submitted yet, the system sends one more reminder e-mail 3 days before requests close.",
          gif: "L-RQ-G3",
          more: "request/overview",
        },
        {
          kind: "wait",
          title: "TAs send their documents and start logging hours",
          body:
            "There is nothing for you to do here. Your TAs send their documents for staff to check, and staff then issue the appointment order. " +
            "After that, your TAs log their working hours and send them to you every month.",
          notice:
            "When staff issue the order, you receive an e-mail titled **ออกคำสั่งแต่งตั้งผู้ช่วยสอนแล้ว** (TA appointment order issued) with the order file attached and a list of the TAs in each of your courses " +
            "(name, student ID, year, section). When a TA sends a work log, you receive an e-mail titled **มีบันทึกเวลาปฏิบัติงานรอการอนุมัติ** (work log awaiting approval) with a link to that course's approval page.",
        },
        {
          kind: "do",
          title: "Schedule a make-up (when a session falls on a holiday)",
          when: "When there is a holiday or a cancelled class",
          body:
            "If the Action needed box says **make-up needs scheduling**, open the course and choose **Holidays and make-ups** from the menu. " +
            "Pick the day and time of the make-up session, then save. If you do not schedule one, your TA cannot log hours for that session\n" +
            "- If you cancelled class because of leave or a meeting, use the **Add make-up (other reason)** button on the same page",
          notice: "Your TA can send you a reminder. You will receive an e-mail titled **ผู้ช่วยสอนแจ้งให้กำหนดวันสอนชดเชย** (your TA asks you to schedule a make-up).",
          screenshot: "L-HL-01",
          more: "holidays",
        },
        {
          kind: "do",
          title: "Approve your TAs' work logs",
          when: "Every month",
          body:
            "- Open the link in the e-mail, or open the course and choose **Approve TA reports** from the menu\n" +
            "- Click each TA's card, then open one month at a time and check each session against the teaching that actually happened\n" +
            "- If it is correct, click **Approve**. If not, click **Return** and write a reason; the TA fixes it and sends it again\n" +
            "- You approve **1 TA for 1 month** at a time. If every month is correct, click **Approve all months** to do them in one go",
          warn: "Staff cannot claim your TA's pay until you approve. Once you get the e-mail, please check it as soon as you can.",
          gif: "L-RP-G1",
          more: "reports",
        },
        {
          kind: "wait",
          title: "Staff check and export the disbursement documents",
          body: "Staff check the approved hours and prepare the disbursement documents in the College's format.",
          notice: "When the documents are ready to sign, staff let you know by an e-mail titled **เอกสารเบิกจ่ายผู้ช่วยสอนรอการลงนาม** (TA disbursement documents awaiting signature).",
        },
        {
          kind: "do",
          title: "Sign the disbursement documents",
          when: "After staff export the documents",
          body:
            "Sign the paper documents staff bring to you. This step does not happen in the system. You can see which stage the documents are at on the **Document progress** page.\n\n" +
            "After that, you approve work logs and sign documents like this every month until the semester ends.",
          go: { label: "View document progress", route: "/document-progress" },
          more: "common:document-progress",
        },
      ]),
      callout(
        "info",
        "If you get stuck, type the message you see on the screen into the manual's search box, " +
        "or click the manual button at the top corner of that page in the system to open the help for that page.",
      ),
    ],
    related: ["faq", "reference/status"],
  },

  {
    slug: "home",
    audience: "lecturer",
    section: "Getting started",
    order: 0,
    title: "My home page",
    description: "A lecturer's 3 main jobs, and choosing the semester",
    since: "1.0",
    routes: ["/lecturer"],
    keywords: ["lecturer home", "home page", "main tasks", "action needed", "course cards", "choose semester", "recommended TAs"],
    blocks: [
      text(
        "A lecturer has 3 main jobs: **request TAs** at the start of the term, **approve the work logs** of your TAs every month, " +
        "and **schedule a make-up** when a class session falls on a holiday. You do all of them on each course's own pages.",
      ),
      screenshot("L-HM-01", "The lecturer home page, showing the semester, the work that needs action, your courses and announcements"),
      text("The courses shown belong to the term selected at the top. The term with the **active** tag is the current term."),
      screenshot("L-HM-02", "The Action needed box, e.g. WBA courses with no class times yet, make-ups to schedule and work logs awaiting approval"),
      table(
        ["Urgent item", "Why it is urgent"],
        [
          ["Class times not set (WBA)", "You must fill in the schedule before you can request TAs"],
          ["Make-up needs scheduling", "Without it, your TA cannot log hours for that day"],
          ["Work logs awaiting approval", "Staff cannot continue the disbursement until you approve"],
        ],
      ),
      screenshot("L-HM-03", "A course card with no TA yet, with the request status tag"),
      screenshot("L-HM-04", "A course card with TAs, showing the number of TAs, hours awaiting review and budget used"),
      text(
        "Next to the number of students, the course card shows **Recommended TAs: N**, which the system works out from the sections that meet at the same time. " +
        "Hover over this text to see the maximum you should not go over. Use it to help you decide before you request TAs.",
      ),
      tryInDemo("Try the lecturer home page in the sandbox", "lecturer", "lect-home"),
    ],
    related: ["lecturer:request/overview", "lecturer:reports"],
  },

  {
    slug: "course-overview",
    audience: "lecturer",
    section: "Courses",
    order: 10,
    title: "Course overview and switching courses",
    description: "See the status of everything in a course on one page",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]"],
    keywords: ["course overview", "switch course", "status cards", "course page", "budget card", "TA report card"],
    blocks: [
      screenshot("L-CO-01", "The course overview page: summary, 3 cards and the menu on the left"),
      text("If the number of students is still 0, ask staff to enter it first. Only then can the system calculate the budget."),
      table(
        ["Card", "What it tells you"],
        [
          ["Budget", "How much has been used out of the budget cap"],
          ["TA requests", "The status of all requests"],
          ["TA reports", "How many work logs are awaiting your approval"],
        ],
      ),
      screenshot("L-CO-03", "Monthly progress for each TA"),
      text(
        "**Awaiting lecturer approval** is your job: go to the report approval page. **Awaiting staff export** and " +
        "**Sent to finance** are staff stages.",
      ),
      goToApp("Go to the home page and choose your course", "/lecturer"),
    ],
  },

  {
    slug: "settings-schedule",
    audience: "lecturer",
    section: "Courses",
    order: 11,
    gettingStarted: 2,
    title: "Course settings: enter section schedules",
    description: "A start-of-semester task; without it you cannot submit a TA request",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]/settings"],
    keywords: ["course settings", "wba", "enter section schedule", "class times", "only once", "set schedule", "lecture lab session"],
    blocks: [
      text(
        "Most course information comes from the registration file, and only staff can change it. " +
        "On this page a lecturer has one job: **fill in the schedule for any section that does not have one** (WBA courses).",
      ),
      screenshot("L-ST-01", "The section table: a row marked “not set” and the Set schedule button"),
      steps([
        { title: "Click Set schedule", body: "Choose the **type** (lecture or lab, 1 session of each), the **day** and the **start and end time**", screenshot: "L-ST-02" },
      ]),
      callout("danger", "You can enter this **only once**. After saving, only staff can change it. Check that everything is correct and complete before you click Save."),
      gif("L-ST-G1", "Set the schedule, add lecture and lab sessions, then save. The row's status changes straight away"),
      callout(
        "warn",
        "While any section still has no schedule, this course **cannot submit a TA request**. The system uses this schedule to check that teaching times do not clash with the TA's own classes. " +
        "Once staff export the documents, this page is **locked** and becomes read-only.",
      ),
    ],
    related: ["lecturer:request/overview"],
  },

  /* ---------------------------- TA requests ---------------------------- */
  {
    slug: "request/overview",
    audience: "lecturer",
    section: "TA requests",
    order: 20,
    gettingStarted: 3,
    title: "Submitting a TA request and the deadline",
    description: "Request teaching assistants for a course; the system decides against the rules",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]/request"],
    keywords: ["submit ta request", "request tas", "deadline", "late submission", "budget calculator", "requests open e-mail", "automatic decision"],
    blocks: [
      text(
        "Fill in a 2-step form and submit. The system **decides immediately** against the rules, such as the TA's documents, class schedule, " +
        "the per-TA course limit and the budget. There is no wait for staff approval.",
      ),
      screenshot("L-RQ-01", "The request page: deadline bar, budget calculator, steps 1 and 2, the submit button and request history"),
      screenshot("L-RQ-02-1", "The deadline bar before the deadline, showing the time left"),
      screenshot("L-RQ-02-2", "After the deadline you can still submit as usual, but the request gets a “Late” tag"),
      text(
        "When staff open requests, you receive an **e-mail saying requests are open**, listing your courses for that semester. " +
        "If any of your courses still has no request, you get one more reminder **3 days before the deadline**. " +
        "For courses that do not need a TA, you do not need to do anything.",
      ),
      callout("warn", "After the deadline you **can still submit**, but the request gets a “Late” tag and the disbursement will be later as well."),
      gif("L-RQ-G1", "Adjusting the number of students and TAs in the budget calculator. The figures update instantly but nothing is saved"),
    ],
    related: ["lecturer:request/step2-add-ta"],
  },
  {
    slug: "request/step1-type",
    audience: "lecturer",
    section: "TA requests",
    order: 21,
    title: "Step 1: claim type",
    description: "Choose the one that matches the course credits",
    since: "1.0",
    keywords: ["claim type", "lecture lab", "lecture only", "lab only", "course credits", "step 1"],
    blocks: [
      screenshot("L-RQ-03", "Step 1: choosing one of the 3 claim types"),
      table(
        ["Option", "When to use it"],
        [
          ["Lecture only", "The course has lecture hours only"],
          ["Lab only", "The course has lab hours only"],
          ["Lecture + lab", "The course has both"],
        ],
      ),
      text("The system pre-selects one based on the credits. Check that it is right before you continue."),
    ],
  },
  {
    slug: "request/step2-add-ta",
    audience: "lecturer",
    section: "TA requests",
    order: 22,
    title: "Step 2: add a TA who already has an account",
    description: "Search by name or e-mail, check each person's details, then choose sections",
    since: "1.0",
    keywords: ["add ta", "choose ta", "select ta", "teaching n/3", "course limit", "search ta", "step 2"],
    blocks: [
      screenshot("L-RQ-04", "The toolbar: Add TA button, Create new TA account button and the counter"),
      gif("L-RQ-G2", "Click Add TA, type a name, pick from the list, and the system fills in the education level"),
      text("On each TA card, click the **Select TA** box and type a name or e-mail to search. Each entry in the list shows the following:"),
      table(
        ["Information in the list", "What it means"],
        [
          ["E-mail and level (undergraduate/master's/doctoral)", "The level affects the pay rate and the hour rules"],
          ["Teaching n/m courses", "How many courses the TA already has, compared with the per-semester limit set by staff (3 courses by default)"],
          ["Orange tag “Class schedule not created”", "You can still choose this TA, but the request stays at **Submitted · Awaiting approval** until the TA fills in their class schedule"],
        ],
      ),
      screenshot("L-RQ-05", "Search results: e-mail, education level, courses already taken and an orange warning tag"),
      callout("info", "Entries you **cannot click** show the reason, such as “Already in a request for this course” or “Already teaching m courses”."),
      text("Once you choose a TA, the **Level** box next to it fills in automatically from the TA's details."),
    ],
    related: ["lecturer:request/step2-sections-hours", "lecturer:request/create-ta-account"],
  },
  {
    slug: "request/step2-sections-hours",
    audience: "lecturer",
    section: "TA requests",
    order: 23,
    title: "Step 2: choose sections and enter hours",
    description: "Choose sections that do not clash with the TA's classes, then enter hours that meet the rules",
    since: "1.0",
    keywords: ["choose section", "schedule clash", "10-12 hrs", "hour cap", "hours per week", "graduate rules", "undergraduate hours"],
    blocks: [
      text(
        "You can tick **several sections**. If two sections are taught together at the same time, tick both; the system claims them as one, so the hours are not counted twice.",
      ),
      screenshot("L-RQ-06", "Several sections can be chosen; red sections cannot be chosen because they clash with the TA's classes"),
      callout("warn", "A section shown in **red, “Cannot select: schedule clash”** means its teaching sessions clash with this TA's own classes. Choose another section or another TA."),
      text("**The hours form depends on the TA's level**"),
      table(
        ["Level", "Form layout", "Rule"],
        [
          ["Master's / doctoral", "4 boxes: teaching assistance, teaching preparation, grading tests, and other", "All boxes together must total 10–12 hrs/week under the graduate school regulations. Under 10 cannot be submitted"],
          ["Undergraduate", "2 work groups: lecture hours (grading, attendance, other) and lab hours (teaching labs or other)", "Each group has a cap based on the actual teaching schedule, shown as “Total x / cap” at the right"],
        ],
      ),
      screenshot("L-RQ-07", "The hours form for a master's or doctoral TA. The blue summary bar says the hours are within range"),
      screenshot("L-RQ-08", "The hours form for an undergraduate TA with 2 work groups. Grey boxes are sessions that clash with the TA's classes"),
      text("A **grey box you cannot click**, with the message “Clashes with the TA's class schedule in every session”, means the TA is in class at that time and cannot do that activity. You can still choose work outside class time, such as grading or other."),
      gif("L-RQ-G3", "Entering hours until the summary bar changes from yellow to blue. The step 2 tag changes to “Ready to submit”"),
      statusTable([
        { status: "Blue with a tick", tone: "success", meaning: "Meets the rules. For a master's or doctoral TA it says “Within 10–12 hrs/week”" },
        { status: "Yellow: enter at least 10 hrs/week", tone: "warn", meaning: "Below the graduate minimum", whoActsNext: "Add hours in the remaining boxes" },
        { status: "Yellow: more than … hrs/week that can actually be logged", tone: "warn", meaning: "Over the cap in the official notice, which is the daily cap times 5 working days", whoActsNext: "Reduce the hours" },
      ]),
      text("When every card is blue, the tag at the top of step 2 changes to **Ready to submit**."),
    ],
  },
  {
    slug: "request/create-ta-account",
    audience: "lecturer",
    section: "TA requests",
    order: 24,
    title: "Create a new TA account",
    description: "When the TA does not have an account in the system yet",
    since: "1.0",
    keywords: ["create ta account", "new ta account", "temporary password", "new user", "add ta to course", "account for student"],
    blocks: [
      text("Click the **Create new TA account** button at the top of step 2, then fill in the 5-field form."),
      table(
        ["Field", "Notes"],
        [
          ["E-mail", "For example `ta@kkumail.com`. Used as the sign-in name"],
          ["Title", "Mr / Mrs / Ms"],
          ["First name and last name", "-"],
          ["Education level", "Bachelor's, master's or doctoral. It affects the pay rate, so choose correctly"],
        ],
      ),
      screenshot("L-RQ-09", "The 5-field form for creating a new TA account"),
      steps([
        { title: "Click Create account", body: "The system shows a **one-time temporary password**", screenshot: "L-RQ-10" },
        { title: "Click Copy", body: "Then send the password to the TA yourself. The system does not send it" },
        { title: "Click Add to this course", body: "The TA's name goes straight into a card on the form" },
      ]),
      callout(
        "info",
        "Also tell the TA that on first sign-in they must **set a new password**, then **fill in their own class schedule** " +
        "and **send 3 document files** for staff to check. Only then can the request go ahead.",
      ),
      gif("L-RQ-G4", "Creating a new TA account, copying the temporary password, then adding the TA to the course"),
    ],
  },
  {
    slug: "request/submit",
    audience: "lecturer",
    section: "TA requests",
    order: 25,
    title: "Submit the request and read the result",
    description: "The 3 possible results, and the history of requests you have sent",
    since: "1.0",
    keywords: ["submit request", "approved immediately", "pending decision", "seat reserved", "request result", "request history", "rejected"],
    blocks: [
      screenshot("L-RQ-11", "The Submit request button, and the confirmation box when a TA has not filled in their class schedule"),
      text("When the tag on step 2 shows **Ready to submit**, click **Submit request**. There are 3 possible results:"),
      statusTable([
        { status: "Approved", tone: "success", meaning: "Passed. The TA can start logging hours right away" },
        { status: "Rejected", tone: "danger", meaning: "Did not pass; the reason is shown", whoActsNext: "Fix it according to the reason and submit again" },
        { status: "Submitted · Awaiting approval", tone: "info", meaning: "A TA has not filled in their class schedule, so the system has not decided yet", whoActsNext: "The system decides on its own once the TA fills in their class schedule" },
      ]),
      text("The status names in this table are the tags shown in the request history table."),
      screenshot("L-RQ-12", "The 3 results: approved, rejected with a reason, and submitted awaiting approval"),
      callout("warn", "Once you submit, **that TA counts towards their course limit immediately**, even before the system decides. To start the form again from scratch, click **Clear form**."),
      screenshot("L-RQ-13", "The request history table. Hover over the red icon to see the reason for rejection"),
    ],
    related: ["lecturer:request/rejected-troubleshoot"],
  },
  {
    slug: "request/rejected-troubleshoot",
    audience: "lecturer",
    section: "TA requests",
    order: 26,
    title: "Request rejected: what to fix",
    description: "Why a request did not pass, and what to fix before submitting again",
    since: "1.0",
    keywords: ["request rejected", "fix request", "rejection reason", "documents incomplete", "over course limit", "budget not enough", "schedule clash"],
    blocks: [
      table(
        ["Reason given by the system", "What to fix"],
        [
          ["TA documents incomplete", "Ask the TA to send the 3 document files for staff to check first"],
          ["No class schedule yet", "Ask the TA to fill in their own class schedule"],
          ["Over the per-semester course limit", "Choose another TA, or wait until that TA has room in their limit"],
          ["Schedule clash", "Change the section or the person"],
          ["Budget not enough", "Reduce the number of TAs or the workload so it stays within the cap"],
        ],
      ),
      text("After fixing it, **submit a new request**. The system checks it immediately; there is no wait for staff."),
    ],
  },

  /* ---------------------------- Reports ---------------------------- */
  {
    slug: "reports",
    audience: "lecturer",
    section: "Reports",
    order: 30,
    gettingStarted: 5,
    title: "Approving TA work log reports",
    description: "A lecturer's monthly job: approve 1 TA for 1 month at a time",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]/reports"],
    keywords: ["approve reports", "approve work log", "return for revision", "approve all months", "monthly approval", "check hours"],
    blocks: [
      text(
        "Every month your TAs send their work logs for you to check. You click **Approve**, or **Return** them for revision. " +
        "You approve **1 TA for 1 month** at a time. Staff cannot proceed with the disbursement until you approve.",
      ),
      screenshot("L-RP-01", "The work log approval page: queue summary, a card per TA, and history"),
      screenshot("L-RP-02", "A card expanded down to individual sessions, with the Approve, Return and Approve all months buttons"),
      text("Click the card header to see the **months**, then click a month to see each **session** with its date, time and activity, so you can compare it with your teaching schedule."),
      table(
        ["Button", "What it does"],
        [
          ["Approve", "Approves that month"],
          ["Return", "Sends it back to the TA to fix. A reason is always required, e.g. “The hours on the 5th do not match the teaching schedule”"],
          ["Approve all months", "Approves every month for that TA in one go"],
        ],
      ),
      screenshot("L-RP-03", "The Return box. A reason is always required"),
      gif("L-RP-G1", "Opening a card and a month, checking each session, then clicking Approve"),
      gif("L-RP-G2", "Clicking Return, typing a reason, then confirming"),
      callout("warn", "Once approved, the TA can no longer edit that month. If anything still needs fixing, click **Return** instead."),
      screenshot("L-RP-04", "The red bar warning that the budget is not enough"),
      callout("info", "The red budget bar means that if you approve everything the TAs logged, the course budget will not cover it. You can **still approve as usual**. The system keeps all the hours, but sessions over the budget are not claimed, and this applies equally to every TA."),
    ],
  },

  /* ---------------------------- Make-ups ---------------------------- */
  {
    slug: "holidays",
    audience: "lecturer",
    section: "Make-ups",
    order: 40,
    gettingStarted: 4,
    title: "Holidays and make-ups",
    description: "Schedule a make-up when a class session falls on a holiday",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]/holidays"],
    keywords: ["make-up", "make-up session", "holiday", "public holiday", "cancelled class", "schedule a make-up", "other reason"],
    blocks: [
      text("If a class session falls on a holiday, **your TA cannot log hours for that day** until you schedule a **make-up**. Without a make-up, your TA cannot claim pay for that session."),
      screenshot("L-HL-01", "The holiday box, the affected sessions in each section, and the Schedule a make-up button"),
      steps([
        { title: "Click Schedule a make-up at the end of the row", body: "Choose the **date** and the **start and end time**. The system fills in the original session's time for you", screenshot: "L-HL-02" },
      ]),
      text("If only **part of the day** is off, for example a faculty event in the morning, you can hold the make-up on the same day in a free slot. Make-ups you have scheduled can be edited or deleted."),
      text("If you cancelled class because of leave or a meeting, which is not a public holiday, click **Add make-up (other reason)** at the top right, then choose the section, the original date that was cancelled, the session, and the date and time of the make-up. Your TA logs hours on the make-up date instead."),
      screenshot("L-HL-03", "The Add make-up (other reason) button: choose the section, original date, session and make-up date"),
      gif("L-HL-G1", "Scheduling, saving, editing and deleting a make-up. The system warns you before deleting if the TA already has draft entries"),
      callout("danger", "When you delete a make-up, your TA's **draft hour entries** on that day are deleted too. If any hours have already been sent for approval, the system will not let you delete it."),
    ],
  },

  /* ---------------------------- Budget ---------------------------- */
  {
    slug: "budget",
    audience: "lecturer",
    section: "Budget",
    order: 50,
    title: "Budget calculation",
    description: "See this course's TA budget, calculated from the credits and the actual number of students",
    since: "1.0",
    routes: ["/lecturer/courses/[tcId]/budget"],
    keywords: ["budget calculation", "budget cap", "workload", "regular program", "special program", "how it is calculated", "remaining budget"],
    blocks: [
      text("This page is read-only. It shows the course's TA budget, which the system works out from the credits and the actual number of students."),
      screenshot("L-BG-01", "The budget calculation page: course details, the 2-sided calculation, totals and the Show calculation button"),
      text("The **Where the budget cap comes from** box shows the credits (Lec/Lab) and the course's budget cap."),
      text("The **Regular program** and **Special program** boxes sit side by side. Each shows the weekly workload, the monthly budget and the total for the term (monthly budget times the number of months in the semester). Click the **i** icon to see how that side is calculated."),
      screenshot("L-BG-02", "The explanation of the regular program calculation, shown when you click the i icon"),
      text("The **Total budget** box sums up the whole course: total for the term, used so far, and remaining. If it is red, the course is over the cap and you need to reduce the number of TAs or the workload."),
      screenshot("L-BG-03", "The “Show calculation” window, with the step-by-step calculation using the course's real figures"),
      text("Click **Show calculation** to see the calculation step by step with this course's real figures. The formula is the same as the faculty's ค่า-TA (TA cost) sheet."),
    ],
  },

  /* ---------------------------- Executive ---------------------------- */
  {
    slug: "executive",
    audience: "lecturer",
    section: "Executive",
    order: 60,
    title: "Executive view",
    description: "Is the budget enough, is each course requesting a sensible number of TAs, and where is work waiting — for lecturers with executive access",
    since: "1.1",
    routes: ["/executive"],
    keywords: ["executive", "executive view", "executive dashboard", "is the budget enough", "too many tas", "download excel", "compare semesters", "budget forecast"],
    blocks: [
      since("1.1", "Changed to a question-and-answer layout, using the same set of questions as the staff dashboard"),
      text(
        "Lecturers who have **executive** access on top of lecturer access see an **Executive view** item in the left menu. " +
        "This page is read-only; it has no approve or edit buttons.",
      ),
      screenshot("X-01", "The “Executive view” item in the left menu"),
      screenshot("X-02", "The full executive view: the question bar and the key figures"),
      text("Choose the academic year and semester at the top right, then read one question at a time. Click the bar at the top to jump to the question you want."),
      table(
        ["Question", "What you see"],
        [
          ["Will the budget last until the end of term?", "Total budget, remaining, end-of-term forecast, courses at or near their budget cap, and a chart of cumulative disbursement"],
          ["Is each course requesting more TAs than recommended?", "Number of students against TAs requested, the recommended number, and a list of courses to review"],
          ["Where is work waiting?", "Who each monthly claim round is waiting on, and the status of TA documents"],
          ["Courses", "A table of all courses in the semester"],
        ],
      ),
      callout("info", "Total budget is the sum of the budgets of courses that have requested TAs or been approved. “Near the cap” means a course whose forecast reaches 90% of its course budget cap."),
      screenshot("X-03", "The Download Excel button and the compare-with-semester option"),
      text("Click **Download Excel** to take the data to a meeting or into a report. To compare with an earlier semester, choose **Compare with semester**."),
      callout("info", "Executive accounts must set up **2FA** (two-factor authentication) before use, just like staff and administrator accounts."),
    ],
    related: ["staff:home"],
  },

  /* ---------------------------- Reference ---------------------------- */
  {
    slug: "reference/status",
    audience: "lecturer",
    section: "Reference",
    order: 70,
    title: "Statuses and rules (lecturer view)",
    description: "What the TA request statuses and work log report statuses mean",
    since: "1.0",
    keywords: ["status table", "request status", "report status", "status meaning", "awaiting approval", "sent to finance"],
    blocks: [
      text("**TA request statuses**"),
      statusTable([
        { status: "Approved", tone: "success", meaning: "The TA can start logging hours" },
        { status: "Submitted, awaiting approval", tone: "info", meaning: "Waiting for the system to decide, or for the TA to fill in their class schedule" },
        { status: "Draft", tone: "neutral", meaning: "Not submitted yet" },
        { status: "Rejected", tone: "danger", meaning: "Did not pass; the reason is shown", whoActsNext: "The lecturer fixes it according to the reason and submits again" },
      ]),
      text("**Work log report statuses**"),
      statusTable([
        { status: "Awaiting lecturer approval", tone: "warn", meaning: "The TA has sent it and it is waiting for you to check", whoActsNext: "Lecturer" },
        { status: "Awaiting staff export", tone: "info", meaning: "You have approved it; waiting for staff", whoActsNext: "Staff" },
        { status: "Sent to finance", tone: "success", meaning: "The process is complete" },
      ]),
    ],
  },

  {
    slug: "faq",
    audience: "lecturer",
    section: "FAQ",
    order: 80,
    title: "Frequently asked questions (lecturers)",
    description: "The questions lecturers ask most often",
    since: "1.0",
    keywords: ["lecturer faq", "faq", "questions", "add ta mid-semester", "change ta", "ta resigned", "budget not enough", "forgot to approve"],
    blocks: [
      steps([
        { title: "Can I request more TAs in the middle of the term?", body: "Yes. You can submit another request at any time without waiting for a new term, but it still counts towards that TA's per-semester course limit." },
        { title: "How do I change a TA who has already been approved?", body: "Contact staff to adjust the request. The lecturer pages have no button to remove or replace an approved TA, because that would affect the hours and budget already calculated." },
        { title: "What do I do if a TA resigns mid-term?", body: "Ask staff to stop that TA's work in the system. Hours approved before the TA resigned can still be claimed as usual." },
        { title: "The course budget is not enough. What should I do before approving the last month?", body: "Check on the budget calculation page which side is over, then adjust the workload or the number of TAs in your next request. For months already approved that go over budget, the system spreads the money automatically when staff export." },
        { title: "What happens if I forget to approve work logs until the month is about to close?", body: "You can still approve after the month closes, but your TA will be paid late for that whole round. Please approve before the due date every month." },
      ]),
    ],
  },
];
