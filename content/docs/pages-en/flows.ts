import { type DocPage, type SeqParticipant, text, callout, sequence, table } from "../types";

/**
 * English copy of `../pages/flows.ts`: same pages, slugs, order, routes,
 * participant ids and diagram structure; only the human-readable text differs.
 */

const SECTION = "Workflows (Sequence Diagrams)";

/* Participants shared by several diagrams. */
const P = {
  user:     { id: "user", label: "User", kind: "actor", tone: "brand" },
  ta:       { id: "ta", label: "TA", kind: "actor", tone: "ta" },
  lecturer: { id: "lec", label: "Lecturer", kind: "actor", tone: "lecturer" },
  staff:    { id: "staff", label: "Staff", kind: "actor", tone: "staff" },
  web:      { id: "web", label: "Web page", sub: "COCO TAS in the browser", kind: "system", tone: "brand" },
  api:      { id: "api", label: "Server", sub: "COCO TAS API", kind: "system", tone: "brand" },
  db:       { id: "db", label: "Database", kind: "db" },
  mail:     { id: "mail", label: "Email", sub: "KKU mail server", kind: "external" },
  sso:      { id: "sso", label: "KKU SSO", sub: "KKU sign-in service", kind: "external" },
} satisfies Record<string, SeqParticipant>;

const READ_GUIDE = text(
  "**How to read the diagrams** The boxes at the top are the parties involved. The dashed line below each box is that party's timeline; read from top to bottom. " +
  "A solid arrow is a command or request, a dashed arrow is a reply, and the number on an arrow is the step number. " +
  "A frame labelled `alt` is a fork where only one branch happens, `opt` is a step that happens only when its condition is met, " +
  "`loop` is a repeated step, and `break` is a case where the system stops the matter right there. Text in square brackets is the condition.",
);

export const flowPagesEn: DocPage[] = [
  /* ================================================================ common */
  {
    slug: "flows/overview",
    audience: "common",
    section: SECTION,
    order: 200,
    title: "Overview of the whole semester",
    description: "Who does what and hands over to whom, from the start of the semester until the money reaches the TA's account",
    since: "1.2",
    keywords: ["sequence diagram", "workflow", "flow", "process", "all stages", "overview", "semester", "แผนภาพลำดับ", "ลำดับการทำงาน"],
    blocks: [
      text(
        "This page sums up the whole semester's work in one diagram, so you can see how the work is handed on. " +
        "The details of each stage are on the next pages of this section. Every page is written from how the system really works, not from a plan.",
      ),
      READ_GUIDE,
      sequence({
        title: "One TA's work, from the start to the end of the semester",
        participants: [P.staff, P.lecturer, P.ta, { ...P.api, label: "COCO TAS", sub: "Web and database" }, { id: "fin", label: "Finance", sub: "Signers and the finance office", kind: "external" }],
        items: [
          { phase: "Start of semester: setting up the system" },
          { from: "staff", to: "api", text: "Set up the semester, pay rates, request window and monthly billing rounds" },
          { from: "staff", to: "api", text: "Import courses and sections from the registrar's file" },
          { from: "api", to: "staff", text: "Courses are ready for lecturers to request TAs", kind: "reply" },
          { phase: "Request window: requesting TAs" },
          { from: "api", to: "lec", text: "Announce that requests are open, with the lecturer's courses", kind: "async" },
          { from: "lec", to: "api", text: "Send a TA request: choose sections, hours and the TAs" },
          { from: "api", to: "api", text: "Split into one request per TA, then check the rules and decide automatically" },
          { from: "api", to: "lec", text: "The result for each TA shows on screen right away", kind: "reply" },
          { from: "api", to: "ta", text: "Notify the TA of the appointment, or of a rejection with the reason", kind: "async" },
          { from: "api", to: "lec", text: "Summary email of the whole request", kind: "async" },
          { from: "staff", to: "api", text: "Issue the appointment order (.docx) for the approved TAs" },
          { from: "api", to: "lec", text: "Send the appointment order file to the lecturer", kind: "async" },
          { phase: "Before work starts: TA documents" },
          { from: "ta", to: "api", text: "Fill in details, accept the PDPA notice and upload documents" },
          { from: "staff", to: "api", text: "Review the documents one file at a time" },
          { from: "api", to: "ta", text: "Send the review result once every file is reviewed", kind: "async" },
          {
            frag: "loop",
            branches: [{
              guard: "Every month with work",
              items: [
                { from: "ta", to: "api", text: "Create work log entries from the teaching schedule, edit them, then submit for approval" },
                { from: "lec", to: "api", text: "Approve the work log, or return it for revision" },
                { from: "staff", to: "api", text: "Review, then download the disbursement documents (ZIP)" },
                { from: "api", to: "api", text: "Lock that month; it can no longer be edited" },
                { from: "api", to: "staff", text: "Disbursement document files and the cover sheet", kind: "reply" },
                { from: "staff", to: "fin", text: "Route the documents until fully signed, then send them to finance" },
                { from: "fin", to: "ta", text: "TA compensation is paid into the TA's account", kind: "async" },
              ],
            }],
          },
        ],
        caption: "The start of the semester happens once. The steps inside the `loop` frame repeat every month until the semester ends.",
      }),
      table(
        ["Stage", "Detailed diagram", "In the manual for"],
        [
          ["Signing in", "Signing in", "Everyone"],
          ["Start of semester", "Setting up the semester, and creating user accounts", "Staff"],
          ["Request window", "Requesting TAs and how requests are decided", "Lecturers"],
          ["After request results", "Issuing appointment orders", "Staff"],
          ["Before work starts", "Submitting and reviewing TA documents", "TAs and staff"],
          ["Every month", "Logging hours and submitting for approval", "TAs"],
          ["Every month", "Approving work logs", "Lecturers"],
          ["Every month", "Reviewing and exporting disbursement documents", "Staff"],
          ["After export", "Routing paper documents and sending to finance", "Staff"],
        ],
      ),
      callout(
        "info",
        "The manual is split by role. TAs see the diagrams for their own work, lecturers see those for lecturers and TAs, " +
        "and staff can see all of them by switching the view with the buttons at the top of the manual.",
      ),
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
      text(
        "There are 2 ways in: KKU Account, and email with password. Both end at the same point: " +
        "the server creates a new session and stores a cookie in the browser. This page has 3 diagrams: " +
        "signing in with a KKU Account, signing in with email and password, and what the system checks every time after you are in.",
      ),
      READ_GUIDE,

      sequence({
        title: "Diagram 1: Signing in with a KKU Account",
        participants: [P.user, P.web, P.api, P.db, P.sso],
        items: [
          { from: "user", to: "web", text: "Press **Sign in with KKU Account**" },
          { from: "web", to: "api", text: "Start signing in `GET /auth/sso/login`" },
          { from: "api", to: "web", text: "Store a one-time code (nonce) in a cookie for 10 minutes, then hand over to KKU", kind: "reply" },
          { from: "web", to: "sso", text: "Open the university's sign-in page" },
          { from: "user", to: "sso", text: "Enter the KKU account and password" },
          { from: "sso", to: "web", text: "Send the user back with a temporary code", kind: "reply" },
          { from: "web", to: "api", text: "Send the code `POST /auth/sso/exchange`" },
          {
            frag: "alt",
            branches: [
              {
                guard: "No nonce, or it has expired",
                items: [{ from: "api", to: "web", text: "Refuse: “The sign-in link has expired or has already been used”", kind: "reply" }],
              },
              {
                guard: "Nonce is valid",
                items: [
                  { from: "api", to: "sso", text: "Verify the code with the system's secret" },
                  { from: "sso", to: "api", text: "Email of the KKU account", kind: "reply" },
                  { from: "api", to: "db", text: "Find an active account with this email" },
                  { from: "db", to: "api", text: "Search result", kind: "reply" },
                  {
                    frag: "alt",
                    branches: [
                      {
                        guard: "No account found",
                        items: [
                          { from: "api", to: "web", text: "Show “Not registered in the system”; no account is created automatically", kind: "reply" },
                        ],
                      },
                      {
                        guard: "Account found",
                        items: [
                          { from: "api", to: "web", text: "A confirmation ticket (valid 5 minutes) and the name on record", kind: "reply" },
                          { from: "web", to: "user", text: "Confirmation card “Sign in as …”", kind: "reply" },
                          { from: "user", to: "web", text: "Press confirm" },
                          { from: "web", to: "api", text: "Confirm the ticket `POST /auth/sso/confirm`" },
                          {
                            frag: "alt",
                            branches: [
                              { guard: "Account has 2FA on", items: [{ from: "api", to: "web", text: "Ask for the 6-digit code; continue as in the 2FA part of Diagram 2", kind: "reply" }] },
                              {
                                guard: "2FA not on",
                                items: [
                                  { from: "api", to: "db", text: "Close the old session, create a new one" },
                                  { from: "db", to: "api", text: "Session ID", kind: "reply" },
                                  { from: "api", to: "web", text: "Store the sign-in cookie", kind: "reply" },
                                  { from: "web", to: "user", text: "Open the home page for the user's role", kind: "reply" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      text("**What to take from Diagram 1**"),
      text(
        "- The KKU password is entered only on the university's page. COCO TAS never sees or stores it.\n" +
        "- Steps 2 to 8 are tied to the nonce. If someone sends you a link containing a code, the system will not accept it, because the nonce lives only in the browser of the person who started signing in.\n" +
        "- The system matches accounts by email. If staff have not opened an account with that email, the system does not create one, so not just anyone with a KKU account can get in.\n" +
        "- The confirmation card in step 14 prevents signing in to the wrong account when the browser remembers someone else's KKU account.",
      ),

      sequence({
        title: "Diagram 2: Signing in with email and password",
        participants: [P.user, P.web, P.api, P.db],
        items: [
          { from: "user", to: "web", text: "Enter email and password" },
          { from: "web", to: "api", text: "`POST /auth/login`" },
          { frag: "break", branches: [{ guard: "The same device sends more than 10 times in 1 minute", items: [{ from: "api", to: "web", text: "Refuse; ask to wait a moment", kind: "reply" }] }] },
          { from: "api", to: "db", text: "Find an active account with this email" },
          { from: "db", to: "api", text: "Account details and the hashed password", kind: "reply" },
          { frag: "break", branches: [{ guard: "Account is locked (7 failures in a row)", items: [{ from: "api", to: "web", text: "Ask to wait 15 minutes", kind: "reply" }] }] },
          {
            frag: "break",
            branches: [{
              guard: "No account found, or the password does not match",
              items: [
                { from: "api", to: "api", text: "Count the failure and record it in the history" },
                { from: "api", to: "web", text: "“Incorrect email or password”, the same message in both cases", kind: "reply" },
              ],
            }],
          },
          {
            frag: "opt",
            branches: [{
              guard: "Account has 2FA on",
              items: [
                { from: "api", to: "db", text: "Record a verification request, valid 5 minutes" },
                { from: "api", to: "web", text: "Ask for the 6-digit code (no cookie yet)", kind: "reply" },
                { from: "user", to: "web", text: "Enter the code from the authenticator app, or a recovery code" },
                { from: "web", to: "api", text: "`POST /auth/login/2fa`" },
                { from: "api", to: "db", text: "Check the request: not expired, used no more than 5 times" },
                { from: "db", to: "api", text: "Check result", kind: "reply" },
                { frag: "break", branches: [{ guard: "Wrong code", items: [{ from: "api", to: "web", text: "“Incorrect code”; 7 failures in a row locks the account for 15 minutes", kind: "reply" }] }] },
              ],
            }],
          },
          { from: "api", to: "db", text: "Close this account's old session, create a new one lasting at most 12 hours" },
          { from: "db", to: "api", text: "Session ID", kind: "reply" },
          { from: "api", to: "web", text: "Store the `access_token` cookie, which scripts on the page cannot read", kind: "reply" },
          {
            frag: "alt",
            branches: [
              { guard: "Still on a temporary password", items: [{ from: "web", to: "user", text: "Go to the set-new-password page", kind: "reply" }] },
              { guard: "Normal password", items: [{ from: "web", to: "user", text: "Open the page the user meant to visit, or the home page", kind: "reply" }] },
            ],
          },
        ],
      }),
      text("**What to take from Diagram 2**"),
      text(
        "- The system gives the same message when the email is not found and when the password is wrong, so someone guessing emails cannot tell which ones have accounts.\n" +
        "- Step 21 always closes the old session first, so one account works on only 1 device at a time. The earlier device is signed out.\n" +
        "- An account with 2FA on gets no cookie until the 6-digit code is correct, so knowing the password alone is not enough to get in.",
      ),

      sequence({
        title: "Diagram 3: After signing in: temporary passwords, timeouts and signing out",
        participants: [P.user, P.web, P.api, P.db],
        items: [
          {
            frag: "opt",
            branches: [{
              guard: "New account, or the password was just reset",
              items: [
                { from: "web", to: "api", text: "Request data for any page" },
                { from: "api", to: "web", text: "Refuse: “You must change your password first”", kind: "reply" },
                { from: "user", to: "web", text: "Set a new password that meets the conditions the screen ticks off" },
                { from: "web", to: "api", text: "`POST /me/password`" },
                { from: "api", to: "db", text: "Save the new password and close every session of this account" },
                { from: "db", to: "api", text: "Done", kind: "reply" },
                { from: "api", to: "web", text: "Done", kind: "reply" },
                { from: "web", to: "user", text: "Back to the sign-in page to sign in with the new password", kind: "reply" },
              ],
            }],
          },
          {
            frag: "opt",
            branches: [{
              guard: "Admin, staff or executive account without 2FA",
              items: [{ from: "web", to: "user", text: "Go to the 2FA setup page before using anything else", kind: "reply" }],
            }],
          },
          {
            frag: "loop",
            branches: [{
              guard: "Every time the page requests data",
              items: [
                { from: "web", to: "api", text: "Request with the cookie" },
                { from: "api", to: "db", text: "Check the session is still valid and when it was last used" },
                { from: "db", to: "api", text: "Session status", kind: "reply" },
                {
                  frag: "alt",
                  branches: [
                    { guard: "Idle for more than 15 minutes", items: [{ from: "api", to: "web", text: "“Signed out automatically”", kind: "reply" }] },
                    { guard: "This account has signed in on another device", items: [{ from: "api", to: "web", text: "“Signed in on another device”", kind: "reply" }] },
                    { guard: "Normal session", items: [{ from: "api", to: "web", text: "The requested data, limited to what this role may see", kind: "reply" }] },
                  ],
                },
              ],
            }],
          },
          { from: "user", to: "web", text: "Press **Sign out**" },
          { from: "web", to: "api", text: "`POST /auth/logout`" },
          { from: "api", to: "db", text: "Close this session" },
          { from: "db", to: "api", text: "Done", kind: "reply" },
          { from: "api", to: "web", text: "Delete the cookie", kind: "reply" },
          { note: "This signs out of COCO TAS only; the KKU account in the browser stays signed in", over: ["web", "api"] },
        ],
      }),
      callout(
        "tip",
        "While the user is typing, clicking or scrolling, the page signals the server at most once a minute, " +
        "so the 15-minute count restarts every time you use the system. It does not count from when you signed in.",
      ),
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
    description: "From accepting the PDPA notice and sending 3 files to staff review and the result email",
    since: "1.2",
    keywords: ["sequence diagram", "documents", "pdpa", "creditor form", "bank book", "id card", "returned documents", "document review", "แผนภาพลำดับ", "เอกสาร"],
    blocks: [
      text(
        "A TA must send 3 files: the **Creditor form**, a **Bank book page copy** and a **National ID card copy** " +
        "(foreign TAs send a passport copy instead of the ID card). These documents are used for payment. Until they pass, " +
        "staff cannot export that month's disbursement documents.",
      ),
      READ_GUIDE,
      sequence({
        title: "Send documents, review, and notify the result",
        participants: [P.ta, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.staff],
        items: [
          { from: "ta", to: "sys", text: "Open the **Documents** page" },
          {
            frag: "opt",
            branches: [{
              guard: "Has not accepted the current PDPA notice",
              items: [
                { from: "sys", to: "ta", text: "Show the privacy notice", kind: "reply" },
                { from: "ta", to: "sys", text: "Press accept" },
                { from: "sys", to: "db", text: "Record the acceptance with the time and device used" },
                { from: "db", to: "sys", text: "Saved", kind: "reply" },
              ],
            }],
          },
          { from: "ta", to: "sys", text: "Step 1: fill in personal details, student ID and payment account" },
          { from: "sys", to: "db", text: "Store the details; ID and account numbers are stored encrypted" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "ta", to: "sys", text: "Step 2: create the creditor form from the details entered" },
          { from: "sys", to: "ta", text: "A PDF to check before confirming", kind: "reply" },
          {
            frag: "loop",
            branches: [{
              guard: "One file at a time, until all 3 are in",
              items: [
                { from: "ta", to: "sys", text: "Steps 3 and 4: upload a PDF file" },
                { from: "sys", to: "sys", text: "Check it is no larger than 10 MB, is a real PDF, opens, and passes a virus scan" },
                {
                  frag: "alt",
                  branches: [
                    { guard: "File fails", items: [{ from: "sys", to: "ta", text: "Show the reason; the file is not kept", kind: "reply" }] },
                    {
                      guard: "File passes",
                      items: [
                        { from: "sys", to: "db", text: "Store the file as **Awaiting review**, replacing the old file of the same kind" },
                        { from: "db", to: "sys", text: "Saved", kind: "reply" },
                        { from: "sys", to: "ta", text: "Upload successful", kind: "reply" },
                      ],
                    },
                  ],
                },
              ],
            }],
          },
          { note: "The system does not notify staff for each new file. The TA's name appears in the **Awaiting review** queue once all files are sent", over: ["sys", "db"] },
          { from: "staff", to: "sys", text: "Open the review queue and choose the TA" },
          { from: "sys", to: "staff", text: "The documents, watermarked with the staff member's name and the time opened", kind: "reply" },
          {
            frag: "loop",
            branches: [{
              guard: "Every file",
              items: [
                {
                  frag: "alt",
                  branches: [
                    {
                      guard: "Correct",
                      items: [
                        { from: "staff", to: "sys", text: "Press **Approve**" },
                        { from: "sys", to: "db", text: "The file passes, and is scheduled for deletion in 7 days" },
                        { from: "db", to: "sys", text: "Saved", kind: "reply" },
                      ],
                    },
                    {
                      guard: "Needs fixing",
                      items: [
                        { from: "staff", to: "sys", text: "Press **Return** with a reason" },
                        { from: "sys", to: "db", text: "The file fails; the TA's details become **Needs revision**" },
                        { from: "db", to: "sys", text: "Saved", kind: "reply" },
                      ],
                    },
                  ],
                },
              ],
            }],
          },
          { from: "sys", to: "sys", text: "Does every file have a verdict yet?" },
          {
            frag: "alt",
            branches: [
              { guard: "Some files still awaiting review", items: [{ note: "No email yet; wait until all are reviewed", over: ["sys"] }] },
              {
                guard: "All files pass",
                items: [
                  { from: "sys", to: "db", text: "Approve the TA's details automatically" },
                  { from: "sys", to: "ta", text: "One email: “All your documents have passed review”", kind: "async" },
                ],
              },
              {
                guard: "Some files fail",
                items: [
                  { from: "sys", to: "ta", text: "One email with the result for every file and the reasons for failing", kind: "async" },
                  { from: "ta", to: "sys", text: "Upload new files to replace the failed ones, then it goes back to staff for review" },
                ],
              },
            ],
          },
        ],
        caption: "System notifications are sent both in the app (the bell) and by email.",
      }),
      text("**Good to know**"),
      text(
        "- Review results are combined into one email, so you do not get an email per file. If staff review some files and stop, the TA gets no email yet.\n" +
        "- Once the details are approved, you cannot edit them or send new files yourself. Contact staff.\n" +
        "- Approved files are deleted within 7 days so personal data is not kept longer than needed. After that the original files cannot be opened.",
      ),
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
      text(
        "Each work log entry has its own status. It starts as **Draft**; once submitted it becomes **Awaiting approval**; " +
        "when the lecturer approves it, it is **Approved**. If it is sent back it becomes **Returned**, and goes back to draft when the TA edits it. " +
        "Before you start, staff must have opened the billing round for that month. It normally closes on the 5th of the following month.",
      ),
      READ_GUIDE,
      sequence({
        title: "Create entries, edit them, and submit for approval",
        participants: [P.ta, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.lecturer],
        items: [
          { from: "ta", to: "sys", text: "Press **Auto-generate** on the course's work log page" },
          { from: "sys", to: "db", text: "Read the section's teaching schedule, the TA's class schedule, holidays, exam periods, and months already closed or locked" },
          { from: "db", to: "sys", text: "All the data", kind: "reply" },
          { from: "sys", to: "sys", text: "Keep months already submitted as they are, delete only drafts in open months, then rebuild the whole semester" },
          { from: "sys", to: "sys", text: "Skip holidays, exam periods, days clashing with the TA's classes or other courses, and anything over the hour or money cap" },
          { from: "sys", to: "db", text: "Save the entries as **Draft**" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "ta", text: "The entries created, with the reasons days were skipped", kind: "reply" },
          {
            frag: "loop",
            branches: [{
              guard: "When entries need editing, adding or deleting by hand",
              items: [
                { from: "ta", to: "sys", text: "Edit, add or delete an entry" },
                { from: "sys", to: "sys", text: "Check the date is in the semester, not in a closed month, has a billing round, is under the cap, and clashes with nothing" },
                {
                  frag: "alt",
                  branches: [
                    { guard: "Breaks a condition", items: [{ from: "sys", to: "ta", text: "Show the reason; not saved", kind: "reply" }] },
                    {
                      guard: "Passes",
                      items: [
                        { from: "sys", to: "db", text: "Save as **Draft**" },
                        { from: "db", to: "sys", text: "Saved", kind: "reply" },
                        { from: "sys", to: "ta", text: "Saved", kind: "reply" },
                      ],
                    },
                  ],
                },
              ],
            }],
          },
          { from: "ta", to: "sys", text: "Press **Submit for approval** and choose the months to send" },
          { from: "sys", to: "db", text: "Change draft and returned entries in the chosen months to **Awaiting approval**, skipping closed months" },
          { from: "db", to: "sys", text: "Months submitted successfully", kind: "reply" },
          {
            frag: "alt",
            branches: [
              {
                guard: "Nothing could be submitted",
                items: [{ from: "sys", to: "ta", text: "Show the reason, such as the billing round not open yet or the month already closed", kind: "reply" }],
              },
              {
                guard: "Submitted",
                items: [
                  { from: "sys", to: "ta", text: "Submitted", kind: "reply" },
                  { from: "sys", to: "lec", text: "Notify every lecturer of the course: “Work log awaiting approval”", kind: "async" },
                ],
              },
            ],
          },
        ],
        caption: "System notifications are sent both in the app (the bell) and by email.",
      }),
      text("**Good to know**"),
      text(
        "- You can press Auto-generate again. The system does not touch months already submitted or closed; it overwrites only drafts in open months. Entries you added by hand in those months are removed too.\n" +
        "- You can submit in advance. Entries for days that have not come yet can be submitted for approval, by faculty decision. The lecturer checks whether the work was really done.\n" +
        "- You can choose which months to submit; you do not have to send every month at once.",
      ),

      sequence({
        title: "Near and after the closing date (done by the system)",
        participants: [{ ...P.api, id: "sys", label: "COCO TAS", sub: "Scheduled jobs" }, P.db, P.ta],
        items: [
          {
            frag: "loop",
            branches: [{
              guard: "Every hour",
              items: [
                { from: "sys", to: "db", text: "Find months with 3 days or less before closing that still have unsent entries or no hours logged" },
                { from: "db", to: "sys", text: "List of TAs to remind", kind: "reply" },
                {
                  frag: "opt",
                  branches: [{
                    guard: "Not reminded in the last 24 hours",
                    items: [{ from: "sys", to: "ta", text: "Remind: “Work log submission deadline is near”", kind: "async" }],
                  }],
                },
              ],
            }],
          },
          {
            frag: "loop",
            branches: [{
              guard: "Every day",
              items: [
                { from: "sys", to: "db", text: "Close rounds more than 1 day past their due date" },
                { from: "db", to: "sys", text: "Closed", kind: "reply" },
              ],
            }],
          },
          {
            note: "Entries still in draft or returned in a closed month are treated as **not wishing to log hours**. They cannot be submitted late, and they do not hold up payment of that month's other entries",
            over: ["sys", "db", "ta"],
          },
        ],
      }),
      callout(
        "warn",
        "A closed month is final; the TA cannot add to it. If you still have work outstanding, submit it before the due date shown on the work log page.",
      ),
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
      text(
        "TA requests **do not wait for staff approval**. The system checks them against the rules and decides as soon as they are sent. " +
        "One submission with several TAs is split into one request per TA, and each TA passes or fails separately.",
      ),
      READ_GUIDE,
      sequence({
        title: "Diagram 1: Sending a request and the decision",
        participants: [P.lecturer, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.ta],
        items: [
          { from: "lec", to: "sys", text: "Open the course's TA request page" },
          { from: "sys", to: "db", text: "Read the course, request window, budget and the TAs that can be chosen" },
          { from: "db", to: "sys", text: "Data", kind: "reply" },
          { from: "sys", to: "lec", text: "Recommended number of TAs, estimated budget, and each TA's status", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "The TA has no account in the system yet",
              items: [
                { from: "lec", to: "sys", text: "Create a new TA account" },
                { from: "sys", to: "db", text: "Create the account with a temporary password" },
                { from: "db", to: "sys", text: "Created", kind: "reply" },
                { from: "sys", to: "lec", text: "Temporary password, shown once", kind: "reply" },
              ],
            }],
          },
          {
            frag: "loop",
            branches: [{
              guard: "Every TA chosen",
              items: [
                { from: "sys", to: "db", text: "Check sessions that clash with the TA's class schedule and other courses the TA assists" },
                { from: "db", to: "sys", text: "Clashing sessions", kind: "reply" },
                { from: "sys", to: "lec", text: "Grey out clashing sessions; a clash with another course blocks sending", kind: "reply" },
              ],
            }],
          },
          { from: "lec", to: "sys", text: "Press **Send request**" },
          { from: "sys", to: "sys", text: "Check before saving: requests are open, every section has a teaching schedule, no duplicate TAs, hours within the rules" },
          { frag: "break", branches: [{ guard: "Any check fails", items: [{ from: "sys", to: "lec", text: "Show the reason; the request is not saved", kind: "reply" }] }] },
          {
            frag: "loop",
            branches: [{
              guard: "Every TA in this submission",
              items: [
                { from: "sys", to: "db", text: "Save 1 request with status **Awaiting decision**" },
                {
                  frag: "alt",
                  branches: [
                    {
                      guard: "The TA has not filled in a class schedule",
                      items: [{ note: "On hold; decided when the TA fills in the class schedule (Diagram 2)", over: ["sys", "db"] }],
                    },
                    {
                      guard: "Class schedule already in",
                      items: [
                        { from: "sys", to: "sys", text: "Remove sessions that clash with the TA's classes, then check the rules" },
                        { from: "sys", to: "db", text: "Save the result **Approved** or **Not approved** with the reason" },
                        { from: "sys", to: "ta", text: "Notify “You have been appointed as a TA” or “Not approved” with the reason", kind: "async" },
                      ],
                    },
                  ],
                },
              ],
            }],
          },
          { from: "db", to: "sys", text: "Whole submission saved", kind: "reply" },
          { from: "sys", to: "lec", text: "Each TA's result on screen; those who failed stay in the form with the reason", kind: "reply" },
          {
            frag: "alt",
            branches: [
              { guard: "Every TA decided", items: [{ from: "sys", to: "lec", text: "One summary email for this submission", kind: "async" }] },
              { guard: "Some TAs still waiting for a class schedule", items: [{ note: "Wait until all are decided, or 24 hours pass, before sending the summary", over: ["sys"] }] },
            ],
          },
        ],
        caption: "System notifications are sent both in the app (the bell) and by email.",
      }),
      table(
        ["Rule the system checks", "If it fails"],
        [
          ["The TA has filled in a class schedule", "The request is on hold until they do"],
          ["This TA has no request in this course yet", "Not approved; add sections instead"],
          ["The number of courses the TA assists this semester is within the cap (3 courses by default)", "Not approved"],
          ["Workload: 10 to 12 hours a week for master's and doctoral TAs, more than 0 for undergraduates", "Not approved"],
          ["No time overlap with another course the TA is already approved for", "Not approved"],
          ["Sessions remain after removing those that clash with the TA's classes", "If none remain, not approved"],
          ["The TA's documents have passed", "Warning only; does not cause a rejection"],
        ],
      ),
      callout(
        "info",
        "The budget on screen is an estimate to help planning. The system does not use the budget to decide requests. If the total budget is short, pay is pro-rated at disbursement.",
      ),

      sequence({
        title: "Diagram 2: Requests waiting for the TA's class schedule",
        participants: [P.ta, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.lecturer],
        items: [
          { from: "ta", to: "sys", text: "Fill in the class schedule for this semester" },
          { from: "sys", to: "db", text: "Save the class schedule" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "ta", text: "Saved", kind: "reply" },
          { from: "sys", to: "db", text: "Find this TA's requests awaiting decision, and those already approved" },
          { from: "db", to: "sys", text: "List of requests", kind: "reply" },
          {
            frag: "loop",
            branches: [{
              guard: "Every request awaiting decision",
              items: [
                { from: "sys", to: "sys", text: "Decide with the same rules as Diagram 1" },
                { from: "sys", to: "db", text: "Save the result" },
                { from: "sys", to: "ta", text: "Notify the request result", kind: "async" },
              ],
            }],
          },
          {
            frag: "opt",
            branches: [{
              guard: "An approved request where the new class schedule clashes with every session",
              items: [
                { from: "sys", to: "db", text: "Change it to **Not approved**" },
                { from: "sys", to: "ta", text: "Notify that the request was cancelled because of the time clash", kind: "async" },
              ],
            }],
          },
          { from: "sys", to: "lec", text: "Summary email of the request once the whole submission is decided", kind: "async" },
          { note: "An hourly scheduled job also checks pending requests and sends summaries that have reached 24 hours", over: ["sys", "db"] },
        ],
      }),

      sequence({
        title: "Diagram 3: Cancelling a request",
        participants: [P.lecturer, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.ta],
        items: [
          { from: "lec", to: "sys", text: "Press **Cancel** on the request" },
          { from: "sys", to: "db", text: "Lock the request, check ownership, and that the status is awaiting decision or approved" },
          { from: "db", to: "sys", text: "Request details", kind: "reply" },
          {
            frag: "break",
            branches: [{
              guard: "Work logs exist, it is already in an appointment order, or a month has already been exported",
              items: [{ from: "sys", to: "lec", text: "Cannot cancel, with the reason", kind: "reply" }],
            }],
          },
          { from: "sys", to: "db", text: "Change to **Cancelled** and give back the TA's course quota" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "lec", text: "Cancelled", kind: "reply" },
          {
            frag: "opt",
            branches: [{ guard: "The request had been approved", items: [{ from: "sys", to: "ta", text: "Notify “TA appointment cancelled”", kind: "async" }] }],
          },
        ],
      }),
      callout(
        "tip",
        "Staff can send or cancel a request on a lecturer's behalf. Every step is the same, except the system records the staff member as the one who acted " +
        "and emails the lecturer that staff acted on their behalf.",
      ),
    ],
    related: ["lecturer:request/overview", "lecturer:request/submit", "lecturer:request/rejected-troubleshoot"],
  },

  {
    slug: "flows/approve-worklog",
    audience: "lecturer",
    section: SECTION,
    order: 221,
    title: "Approving work logs",
    description: "The lecturer approves, edits or returns work logs, and whom the system notifies next",
    since: "1.2",
    keywords: ["sequence diagram", "approve work log", "approve hours", "return", "remove entry", "reports", "แผนภาพลำดับ", "อนุมัติบันทึกเวลา"],
    blocks: [
      text(
        "When a TA submits for approval, every lecturer of the course is notified, and any one of them may approve. " +
        "You can approve several TAs at once, one month at a time. When every entry of a month is approved, that month moves on to wait for staff review by itself.",
      ),
      READ_GUIDE,
      sequence({
        title: "Approve, edit or return",
        participants: [P.lecturer, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.ta],
        items: [
          { from: "lec", to: "sys", text: "Open the course's **Reports** page" },
          { from: "sys", to: "db", text: "Read entries awaiting approval, grouped by TA and month" },
          { from: "db", to: "sys", text: "Entries", kind: "reply" },
          { from: "sys", to: "lec", text: "Entries awaiting approval, months still in draft, and months already closed", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "Some entries have the wrong time or were not really worked",
              items: [
                { from: "lec", to: "sys", text: "Edit the time or remove the entry, with a reason" },
                { from: "sys", to: "db", text: "Edit the entry and keep a history of who changed what" },
                { from: "db", to: "sys", text: "Saved", kind: "reply" },
                { from: "sys", to: "ta", text: "Notify that the lecturer edited or removed entries, with the reason", kind: "async" },
              ],
            }],
          },
          {
            frag: "alt",
            branches: [
              {
                guard: "Approve",
                items: [
                  { from: "lec", to: "sys", text: "Choose the TAs and month, then press **Approve**" },
                  { from: "sys", to: "db", text: "Check again: the month is not locked, within daily and weekly caps, no clash with classes" },
                  { frag: "break", branches: [{ guard: "Fails", items: [{ from: "db", to: "sys", text: "Refuse with the reason", kind: "reply" }] }] },
                  { from: "sys", to: "db", text: "Change the entries to **Approved**, recording the approver and time" },
                  { from: "db", to: "sys", text: "Saved", kind: "reply" },
                  { from: "sys", to: "lec", text: "Approved", kind: "reply" },
                  { from: "sys", to: "ta", text: "Notify “Your work log has been approved”", kind: "async" },
                ],
              },
              {
                guard: "Return for revision",
                items: [
                  { from: "lec", to: "sys", text: "Press **Return** and type a reason" },
                  { from: "sys", to: "db", text: "Change that month's entries to **Returned** with the reason" },
                  { from: "db", to: "sys", text: "Saved", kind: "reply" },
                  { from: "sys", to: "lec", text: "Returned", kind: "reply" },
                  { from: "sys", to: "ta", text: "Notify “Your work log was returned for revision” with the reason", kind: "async" },
                  { note: "The TA can fix and resubmit while the round is open. If the round has closed, those entries are treated as not wishing to log hours", over: ["db", "ta"] },
                ],
              },
            ],
          },
          { note: "When every entry of a month is approved, that month appears in the staff review queue by itself", over: ["sys", "db"] },
        ],
        caption: "System notifications are sent both in the app (the bell) and by email.",
      }),
      callout(
        "warn",
        "If you return entries close to the closing date, the TA may not have time to fix them, and returned entries that are not fixed in time are not paid. " +
        "For small mistakes, editing the time or removing just those entries and approving the rest keeps the TA from losing the whole month.",
      ),
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
      READ_GUIDE,
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
    description: "Set up the semester, request window and billing rounds, import courses, and fetch student numbers from REG",
    since: "1.2",
    keywords: ["sequence diagram", "semester setup", "request window", "billing rounds", "import courses", "reg", "student numbers", "budget cap", "แผนภาพลำดับ", "ตั้งภาคเรียน"],
    blocks: [
      text(
        "Start-of-semester work has 2 parts. The first is the settings that act as gates for the work that follows: " +
        "with no request window, lecturers cannot send requests; with no billing round for a month, TAs cannot log hours for that month. " +
        "The second part is bringing the courses into the system.",
      ),
      READ_GUIDE,
      sequence({
        title: "Diagram 1: Semester, request window and billing rounds",
        participants: [P.staff, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.lecturer],
        items: [
          { from: "staff", to: "sys", text: "Create the semester: year, term, start date, end date and exam dates" },
          { from: "sys", to: "sys", text: "Check the dates, no duplicate year and term, no overlap with another semester" },
          { from: "sys", to: "db", text: "Save the semester, using the previous semester's budget cap as the default" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "staff", text: "Go to the semester's calendar page", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "Adjust the budget cap",
              items: [
                { from: "staff", to: "sys", text: "Enter a new budget cap" },
                { from: "sys", to: "db", text: "Check the courses affected" },
                { from: "db", to: "sys", text: "Courses with approved TAs or already exported", kind: "reply" },
                {
                  frag: "alt",
                  branches: [
                    { guard: "Some courses already sent to finance", items: [{ from: "sys", to: "staff", text: "Not saved", kind: "reply" }] },
                    { guard: "Some courses already have TAs", items: [{ from: "sys", to: "staff", text: "List the courses and ask to confirm again", kind: "reply" }] },
                    { guard: "No impact, or confirmed", items: [{ from: "sys", to: "db", text: "Save; each course's budget = the lower of the formula and the cap" }] },
                  ],
                },
              ],
            }],
          },
          { from: "staff", to: "sys", text: "Set the request window's opening and closing dates" },
          { from: "sys", to: "db", text: "Save the request window" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "staff", text: "Saved", kind: "reply" },
          {
            frag: "loop",
            branches: [{
              guard: "After saving, and every hour during the request window",
              items: [
                { from: "sys", to: "db", text: "Find lecturers not yet notified" },
                { from: "db", to: "sys", text: "List of names", kind: "reply" },
                { from: "sys", to: "lec", text: "Notify “TA requests are open” with each lecturer's courses, once per person", kind: "async" },
                {
                  frag: "opt",
                  branches: [{
                    guard: "3 days or less before closing, and the course has no request yet",
                    items: [{ from: "sys", to: "lec", text: "Notify “TA requests close soon”", kind: "async" }],
                  }],
                },
              ],
            }],
          },
          { from: "staff", to: "sys", text: "Create billing rounds for the whole semester" },
          { from: "sys", to: "db", text: "Create one round per month, closing on the 5th of the next month with a 3-day reminder; existing months are left alone" },
          { from: "db", to: "sys", text: "Rounds created", kind: "reply" },
          { from: "sys", to: "staff", text: "List of billing rounds", kind: "reply" },
        ],
      }),
      callout("info", "Requests can be sent after the closing date; the system accepts them but marks them as late. The request window's on/off switch controls the notification emails to lecturers."),

      sequence({
        title: "Diagram 2: Importing courses and fetching student numbers from REG",
        participants: [P.staff, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, { id: "reg", label: "REG", sub: "reg.kku.ac.th", kind: "external" }],
        items: [
          { from: "staff", to: "sys", text: "Upload the registrar's .xlsx course file" },
          { from: "sys", to: "sys", text: "Check it is a real Excel file, no larger than 20 MB" },
          { from: "sys", to: "db", text: "Compare with existing courses and match lecturer names" },
          { from: "db", to: "sys", text: "Comparison result", kind: "reply" },
          { from: "sys", to: "staff", text: "Preview before import: new courses, existing ones, bad data, lecturers not found, and courses that should be merged", kind: "reply" },
          { from: "staff", to: "sys", text: "Choose courses to skip or merge, then press **Import**" },
          {
            frag: "loop",
            branches: [{
              guard: "One course at a time",
              items: [
                { from: "sys", to: "db", text: "Save the course, lecturers, sections and teaching schedule" },
                { from: "db", to: "sys", text: "Saved", kind: "reply" },
              ],
            }],
          },
          { from: "sys", to: "staff", text: "Import summary", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "Real student numbers are needed",
              items: [
                { from: "staff", to: "sys", text: "Press **Fetch from the registrar (REG)** (only courses with requests, or all courses)" },
                { from: "sys", to: "staff", text: "Start a background job and show progress", kind: "reply" },
                {
                  frag: "loop",
                  branches: [{
                    guard: "One course code at a time, 1 to 1.5 seconds apart",
                    items: [
                      { from: "sys", to: "reg", text: "Look up the number of enrolled students" },
                      { from: "reg", to: "sys", text: "Numbers per section", kind: "reply" },
                    ],
                  }],
                },
                { from: "staff", to: "sys", text: "Check the preview and confirm saving" },
                { from: "sys", to: "db", text: "Save student numbers, skipping courses already exported" },
                { from: "db", to: "sys", text: "Saved", kind: "reply" },
              ],
            }],
          },
        ],
      }),
      text(
        "- The system reads only the **number** of students from REG, never the student list, and spaces out every request so it does not load the university's system.\n" +
        "- Student numbers affect the budget and the recommended number of TAs. If a course already has approved TAs, the system asks you to confirm again before changing it.",
      ),
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
      text(
        "There is no sign-up page. Staff can create accounts for every role except admin accounts, which only admins can create. " +
        "Lecturers can create TA accounts only, from the TA request page.",
      ),
      READ_GUIDE,
      sequence({
        title: "Create an account and send sign-in details",
        participants: [
          { id: "maker", label: "Account creator", sub: "Staff or lecturer", kind: "actor", tone: "staff" },
          { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" },
          P.db,
          { id: "newu", label: "New user", kind: "actor", tone: "ta" },
        ],
        items: [
          { from: "maker", to: "sys", text: "Enter email, name and role" },
          { frag: "break", branches: [{ guard: "A lecturer creates a non-TA account, or staff create an admin account", items: [{ from: "sys", to: "maker", text: "Not permitted", kind: "reply" }] }] },
          { from: "sys", to: "db", text: "Check this email has no active account yet" },
          { from: "db", to: "sys", text: "Check result", kind: "reply" },
          { frag: "break", branches: [{ guard: "Email already used", items: [{ from: "sys", to: "maker", text: "Say this account already exists", kind: "reply" }] }] },
          { from: "sys", to: "sys", text: "Generate a random 12-character temporary password" },
          { from: "sys", to: "db", text: "Create the account, force a password change at first sign-in, and record the history" },
          { from: "db", to: "sys", text: "Created", kind: "reply" },
          { from: "sys", to: "maker", text: "Temporary password, shown once", kind: "reply" },
          {
            frag: "alt",
            branches: [
              {
                guard: "Press **Send by email**",
                items: [
                  { from: "maker", to: "sys", text: "Send the sign-in details" },
                  { from: "sys", to: "db", text: "Check the temporary password has not been used yet" },
                  { from: "db", to: "sys", text: "Not used yet", kind: "reply" },
                  { from: "sys", to: "newu", text: "Email “Your sign-in details” (TAs also get the getting-started guide attached)", kind: "async" },
                  { from: "sys", to: "maker", text: "Sent, or a message that sending failed", kind: "reply" },
                ],
              },
              {
                guard: "Do not press send",
                items: [{ from: "maker", to: "newu", text: "Pass on the password yourself; the system does not email it automatically", kind: "async" }],
              },
            ],
          },
          { from: "newu", to: "sys", text: "Sign in for the first time, then set a new password" },
          { note: "If a KKU account matches this email, the user can sign in with KKU Account right away without the temporary password", over: ["sys", "newu"] },
        ],
      }),
      callout(
        "info",
        "**Password reset** works the same way: the system creates a new temporary password, closes every open session of that account, and lets you send it by email. " +
        "Staff cannot reset staff, admin or executive accounts.",
      ),
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
      text(
        "A request the system approves is a decision inside the system. The document the faculty and finance actually use is the **appointment order**. " +
        "A TA whose name is not yet in an order does not appear on the disbursement review page, and their documents cannot be exported.",
      ),
      READ_GUIDE,
      sequence({
        title: "Issuing appointment orders in rounds",
        participants: [P.staff, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.lecturer],
        items: [
          { from: "staff", to: "sys", text: "Open the **TA appointment orders** page" },
          { from: "sys", to: "db", text: "Gather approved TAs not yet in any order" },
          { from: "db", to: "sys", text: "List of names", kind: "reply" },
          { from: "sys", to: "staff", text: "Names for this round, courses skipped because requests are still awaiting decision, and TAs skipped with the reason", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "Some TAs have not filled in a class schedule",
              items: [{ from: "staff", to: "sys", text: "Send a reminder email to fill in the class schedule" }],
            }],
          },
          { from: "staff", to: "sys", text: "Enter the order number, signer, order date and effective date, then create the file" },
          { from: "sys", to: "sys", text: "Create the order file (.docx)" },
          { from: "sys", to: "db", text: "Save the order round and its names together with creating the file" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "staff", text: "Order file", kind: "reply" },
          { from: "sys", to: "lec", text: "Email with the order file attached and a summary of the TAs for the lecturer's courses", kind: "async" },
          { note: "The original can be downloaded again from the history at any time, without creating a new round or re-sending emails", over: ["sys", "db"] },
        ],
      }),
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
      text(
        "The status of each TA in each course and month moves in order: **Awaiting review** (pending), " +
        "**Signed off** (staff_reviewed), **Exported** (exported) and **Sent to finance** (finance_sent). " +
        "The key point is the first download of the ZIP file, which locks that month against further edits.",
      ),
      READ_GUIDE,
      sequence({
        title: "Diagram 1: Reviewing work logs",
        participants: [P.staff, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.ta, P.lecturer],
        items: [
          { from: "staff", to: "sys", text: "Open the **Review & export** page" },
          { from: "sys", to: "db", text: "Review queue, only TAs named in an appointment order" },
          { from: "db", to: "sys", text: "Queue", kind: "reply" },
          { from: "sys", to: "staff", text: "Entries fully approved, and entries still waiting for the lecturer", kind: "reply" },
          {
            frag: "opt",
            branches: [{
              guard: "The lecturer has not approved everything",
              items: [
                { from: "staff", to: "sys", text: "Press **Remind lecturer**" },
                { from: "sys", to: "lec", text: "Notify “TA work logs are awaiting your approval”, at most once a day per course", kind: "async" },
              ],
            }],
          },
          {
            frag: "alt",
            branches: [
              {
                guard: "Data is correct",
                items: [
                  { from: "staff", to: "sys", text: "Press **Sign off this month**" },
                  { from: "sys", to: "db", text: "Lock the entries, check every entry is approved and the TA's documents have passed" },
                  { from: "db", to: "sys", text: "Check result", kind: "reply" },
                  { from: "sys", to: "db", text: "Status becomes **Signed off**" },
                  { from: "sys", to: "staff", text: "Signed off", kind: "reply" },
                ],
              },
              {
                guard: "Needs fixing",
                items: [
                  { from: "staff", to: "sys", text: "Press **Return for revision** with a reason" },
                  { frag: "break", branches: [{ guard: "That month's round has closed", items: [{ from: "sys", to: "staff", text: "Extend the closing date first", kind: "reply" }] }] },
                  { from: "sys", to: "db", text: "Status goes back to **Awaiting review** and that month's entries become **Returned**" },
                  { from: "db", to: "sys", text: "Saved", kind: "reply" },
                  { from: "sys", to: "ta", text: "Notify the TA to fix the work log, with the reason", kind: "async" },
                  { from: "sys", to: "lec", text: "Notify that approval is needed again after the TA fixes it", kind: "async" },
                ],
              },
            ],
          },
          { note: "If a work log is edited after sign-off, the database puts the status back to awaiting review by itself and notifies staff in the app", over: ["sys", "db"] },
        ],
        caption: "System notifications are sent both in the app (the bell) and by email.",
      }),

      sequence({
        title: "Diagram 2: Exporting the ZIP file and locking the month",
        participants: [P.staff, { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" }, P.db, P.ta],
        items: [
          { from: "staff", to: "sys", text: "Choose the course and month, and preview before export" },
          { from: "sys", to: "staff", text: "Anything still blocking, if any", kind: "reply" },
          { from: "staff", to: "sys", text: "Press **Download**" },
          {
            frag: "alt",
            branches: [
              {
                guard: "This month was already exported and has not been sent back",
                items: [
                  { from: "sys", to: "db", text: "Read the original file set" },
                  { from: "db", to: "sys", text: "Original files", kind: "reply" },
                  { from: "sys", to: "staff", text: "The original file set; no second lock", kind: "reply" },
                ],
              },
              {
                guard: "First export, or after being sent back",
                items: [
                  { from: "sys", to: "db", text: "Compute a fingerprint of the work logs going into the documents" },
                  { from: "db", to: "sys", text: "Fingerprint", kind: "reply" },
                  { from: "sys", to: "sys", text: "Check: student numbers present, TA documents passed, all signed off, no class clashes, and in an appointment order" },
                  { frag: "break", branches: [{ guard: "Any check fails", items: [{ from: "sys", to: "staff", text: "The blocking items; no file is created yet", kind: "reply" }] }] },
                  { from: "sys", to: "sys", text: "Create the ZIP: disbursement form, graduate evidence, workload form and class schedule" },
                  { from: "sys", to: "db", text: "Lock the work log table, then compute the fingerprint again" },
                  { from: "db", to: "sys", text: "Latest fingerprint", kind: "reply" },
                  { frag: "break", branches: [{ guard: "Data changed while the file was being created", items: [{ from: "sys", to: "staff", text: "Press download again; not locked yet", kind: "reply" }] }] },
                  { from: "sys", to: "db", text: "Status becomes **Exported**, and the amounts paid are recorded permanently" },
                  { from: "db", to: "sys", text: "Saved", kind: "reply" },
                  { from: "sys", to: "ta", text: "Notify “Staff have prepared the disbursement documents” with the locked month", kind: "async" },
                  { from: "sys", to: "staff", text: "ZIP file", kind: "reply" },
                ],
              },
            ],
          },
          { note: "From here on the database itself refuses edits to work logs in the locked month, whichever screen the edit comes from", over: ["sys", "db"] },
        ],
      }),
      text("**Why the fingerprint is computed twice**"),
      text(
        "Creating the files takes several seconds, and someone may approve or edit an entry at that very moment. " +
        "So the system computes a fingerprint of the data before creating the files, and again after locking the table. If they differ, the files do not match the latest data, " +
        "and the system neither locks nor hands out those files. The numbers in the files and in the system therefore always match.",
      ),
      callout(
        "warn",
        "Staff can send back a month that has already been exported. The system unlocks that month and tells the TA a corrected document will follow. " +
        "For months already sent to finance, only an admin can move the status back.",
      ),
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
      text(
        "After the files are exported, the remaining work is on paper. The system is used to track where the documents are, " +
        "so TAs and lecturers can check for themselves without phoning to ask.",
      ),
      READ_GUIDE,
      sequence({
        title: "Cover sheet, signing and document progress",
        participants: [
          P.staff,
          { ...P.api, id: "sys", label: "COCO TAS", sub: "Web page and server" },
          P.db,
          { id: "sign", label: "Signers", sub: "TAs, lecturers, certifier", kind: "actor", tone: "lecturer" },
          { id: "fin", label: "Finance", sub: "Finance office and the dean", kind: "external" },
        ],
        items: [
          { from: "staff", to: "sys", text: "Download the direct-payment cover sheet, confirming with your password" },
          { from: "sys", to: "sys", text: "Check every course at that level is exported and the chosen months are in the same fiscal year" },
          { frag: "break", branches: [{ guard: "Some courses not exported yet", items: [{ from: "sys", to: "staff", text: "List of courses still outstanding", kind: "reply" }] }] },
          { from: "sys", to: "db", text: "Keep a copy of the cover sheet and the download history" },
          { from: "db", to: "sys", text: "Saved", kind: "reply" },
          { from: "sys", to: "staff", text: "Cover sheet file", kind: "reply" },
          { from: "staff", to: "sign", text: "Send the paper documents for signing", kind: "async" },
          {
            frag: "loop",
            branches: [{
              guard: "Until everyone has signed",
              items: [
                { from: "sign", to: "staff", text: "Sign and return", kind: "async" },
                { from: "staff", to: "sys", text: "Tick the card of each person who has signed" },
                { from: "sys", to: "db", text: "Save the checklist" },
                {
                  frag: "opt",
                  branches: [{
                    guard: "Some lecturers have not signed",
                    items: [
                      { from: "staff", to: "sys", text: "Press **Email a reminder to lecturers who haven't signed**" },
                      { from: "sys", to: "sign", text: "Reminder email to lecturers who have not signed, at most every 12 hours", kind: "async" },
                    ],
                  }],
                },
              ],
            }],
          },
          { from: "staff", to: "sys", text: "Move the progress to the next stage" },
          { from: "sys", to: "db", text: "Check every course is exported and the previous stage is fully signed" },
          { from: "db", to: "sys", text: "Check result", kind: "reply" },
          { from: "sys", to: "staff", text: "The new stage, with the time and name of who updated it", kind: "reply" },
          { from: "staff", to: "fin", text: "Send the documents to the finance office", kind: "async" },
          { from: "fin", to: "sign", text: "The dean signs, then TA compensation is transferred to the TAs' accounts", kind: "async" },
          { note: "Everyone in the system sees the current stage on the **Document progress** page, and a link can be shared with people outside the system", over: ["sys", "db"] },
        ],
      }),
      table(
        ["Stage", "Meaning", "Can move on when"],
        [
          ["1", "TAs sign", "Every course in the semester is exported and everyone is ticked"],
          ["2", "Lecturers sign", "Lecturers are ticked for every course"],
          ["3", "Certifier signs", "The certifier is ticked"],
          ["4", "Sent to finance", "Stages 1 to 3 are complete"],
          ["5", "Dean signs", "Stage 4 is done"],
        ],
      ),
      callout("info", "You can always move back a stage, but the times of the stages after it are cleared. The system asks you to confirm every time."),
    ],
    related: ["staff:progress", "staff:budget-summary", "common:document-progress"],
  },
];
