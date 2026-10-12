import {
  type DocPage, text, callout, steps, screenshot, gif, statusTable, table, uiPath, since, goToApp, diagram,
} from "../types";

const SECTION = "Account and access";

/**
 * English copy of `../pages/common.ts` — same pages, slugs, order, media ids
 * and routes; only the human-readable text differs.
 */
export const commonPagesEn: DocPage[] = [
  {
    slug: "intro",
    audience: "common",
    section: SECTION,
    order: 0,
    title: "What is this system?",
    description: "The system works in 4 stages, and this is how the money moves each month",
    since: "1.0",
    keywords: ["overview", "about the system", "coco tas", "ta payment system", "system map", "all stages", "money flow", "workflow", "ภาพรวม", "เกี่ยวกับระบบ"],
    blocks: [
      text(
        "**COCO TAS** is the teaching assistant management system of the College of Computing, Khon Kaen University. " +
        "It covers everything from TA documents, TA requests, logging hours and budget checks through to claiming TA compensation. " +
        "Staff, lecturers and TAs all work in the same system.",
      ),
      diagram("system-map"),
      text(
        "The system does a lot of the work for you: it recommends how many TAs a course needs based on its sections, works out the budget before a request is sent, " +
        "decides requests against the rules, creates work log entries from the teaching schedule, and produces disbursement documents in the college's own format.",
      ),
      text("**How the money moves each month**"),
      text("Each month's work log goes through these 5 stages before the money reaches the TA's bank account."),
      diagram("money-flow"),
      text("**Common terms**"),
      statusTable([
        { status: "Section", tone: "neutral", meaning: "A class group of a course. Each section has its own teaching schedule and number of students." },
        { status: "Billing month", tone: "neutral", meaning: "One monthly disbursement round, with its own opening and closing dates." },
        { status: "Locked", tone: "warn", meaning: "Can no longer be edited. This happens when staff export the documents for that month." },
        { status: "WBA", tone: "neutral", meaning: "No regular class schedule. Used for undergraduate TAs in year 4 or above, or graduate TAs who have no class schedule." },
        { status: "Transfer cover sheet", tone: "neutral", meaning: "A payment summary sheet attached to the disbursement documents sent to finance." },
      ]),
    ],
  },

  {
    slug: "first-login",
    audience: "common",
    section: SECTION,
    order: 1,
    gettingStarted: 1,
    title: "Signing in",
    description: "Sign in with your KKU Account or with email and password, and set a new password the first time",
    since: "1.1",
    routes: ["/login", "/login/sso", "/change-password"],
    keywords: ["sign in", "log in", "login", "kku account", "sso", "kkumail", "temporary password", "forgot password", "new password", "first login"],
    errors: [
      "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "ยังไม่ได้ลงทะเบียนในระบบ",
      "ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว",
      "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
      "รหัสผ่านนี้พบได้บ่อยเกินไป",
    ],
    blocks: [
      since("1.1", "Added signing in with a KKU Account"),
      text(
        "There is no sign-up page. Every account is created by staff, " +
        "or by a lecturer who adds a new TA while sending a request. You can sign in in 2 ways.",
      ),
      screenshot("C-02", "The sign-in page: the KKU Account button and the collapsed email and password section"),
      table(
        ["Method", "Best for", "What you need"],
        [
          ["**Sign in with KKU Account**", "Lecturers and TAs", "An @kku.ac.th or @kkumail.com account that matches the email staff registered for you"],
          ["**Sign in with email and password**", "Staff, administrators, and anyone without a KKU account", "The email and password you received from whoever created your account"],
        ],
      ),
      text("**Method 1: KKU Account**"),
      steps([
        { title: "Click “Sign in with KKU Account”", body: "You are taken to the university's sign-in page. Use the same account and password as for other KKU systems." },
        {
          title: "Check the account name on the confirmation page",
          body:
            "When you come back to the system, you will see the **email and name** of the KKU account you are about to use. If it is correct, click **Sign in as …**. " +
            "If it is not your account, click **Use a different KKU account**.",
          screenshot: "C-22",
        },
        { title: "If you have turned on 2FA", body: "The system asks for the 6-digit code from your authenticator app, just as when you sign in with a password." },
      ]),
      callout(
        "warn",
        "If you see the message **“The account … is not registered in the system”**, there is no account with this email yet. " +
        "The system does not create accounts by itself. Tell staff, including the email shown in the message, so they can open an account for you.",
      ),
      text("**Method 2: Email and password**"),
      steps([
        { title: "Click “Sign in with email and password”, then enter your email and password", body: "The system remembers the method you used last time, so next time the fields are already open." },
        {
          title: "Set a new password (first time only)",
          body:
            "If you were given a temporary password, the system asks you to set a new one right away. Your password must be at least 8 characters long " +
            "and include at least one uppercase letter, one lowercase letter, one number and one special character, and it must not be a commonly used password. " +
            "As you type, the screen ticks off each rule.",
          screenshot: "C-03",
        },
        { title: "Sign in again with your new password", body: "Once your new password is set, the system signs you out and takes you back to the sign-in page." },
      ]),
      screenshot("C-04", "The message shown when the email or password is wrong"),
      callout(
        "info",
        "There is no **Forgot password** button. If you forget your password, contact staff to **reset your password**. " +
        "Or, if you have a KKU account that matches your email in the system, use Method 1 instead and skip the password altogether.",
      ),
    ],
    related: ["common:two-factor", "common:session-timeout"],
  },

  {
    slug: "two-factor",
    audience: "common",
    section: SECTION,
    order: 2,
    title: "Two-factor authentication (2FA)",
    description: "Who must use 2FA and how to set it up",
    since: "1.0",
    // "/login" is claimed by first-login (which the "?" button already
    // reaches from the login screen itself) — /setup-2fa alone is unique
    // enough to bring readers here when the OTP/QR screen is what's open.
    routes: ["/setup-2fa"],
    keywords: ["2fa", "otp", "authenticator", "two-factor authentication", "recovery code", "backup code", "qr code", "google authenticator", "microsoft authenticator", "6-digit code"],
    errors: ["mfa_setup_required"],
    blocks: [
      text(
        "**Staff**, **administrator** and **executive** accounts must set up 2FA before they can use the rest of the system. " +
        "Until it is set up, you can only see your own profile. 2FA is optional for lecturers and TAs, " +
        "but you can turn it on yourself in account settings.",
      ),
      steps([
        { title: "Scan the QR code", body: "Use an authenticator app such as Google Authenticator or Microsoft Authenticator to scan the QR code on screen.", screenshot: "C-05" },
        { title: "Enter the 6-digit code", body: "Type the code the app is showing right now, to confirm the app is linked correctly." },
        {
          title: "Keep your recovery codes (backup codes)",
          body: "The system shows your recovery codes **only once**. Copy or download them and keep them safe. You can use one in place of the 6-digit code if you lose your phone.",
          screenshot: "C-06",
        },
      ]),
      text("**From now on, every time you sign in**, after you enter the correct password the system asks for a 6-digit code (OTP) as an extra step."),
      screenshot("C-07", "The OTP page shown after a correct password"),
      callout("danger", "If you cannot use 2FA, for example because you changed phones, deleted the app or have no recovery codes left, contact staff to **reset 2FA**. Do not keep guessing codes, because the system will temporarily lock further attempts."),
    ],
  },

  {
    slug: "pdpa-consent",
    audience: "common",
    section: SECTION,
    order: 3,
    gettingStarted: 2,
    title: "PDPA consent",
    description: "The window that appears the first time you sign in, and what happens if you consent or do not consent",
    since: "1.0",
    keywords: ["pdpa", "consent", "personal data", "privacy", "data protection", "do not consent", "first sign-in"],
    blocks: [
      text(
        "The first time you sign in, a window asks for your consent to collect and use your personal data under the Personal Data Protection Act (PDPA). " +
        "You must choose before you can continue.",
      ),
      screenshot("C-09", "The PDPA consent window on first sign-in"),
      statusTable([
        { status: "Consent", tone: "success", meaning: "You can use the system as normal." },
        { status: "Do not consent", tone: "warn", meaning: "The window cannot be closed until you choose, and tasks that need personal data, such as submitting disbursement documents, will not be available.", whoActsNext: "If you have questions before deciding, contact staff." },
      ]),
      text("To see what data the system keeps and how to ask for it to be deleted, go to **My data**."),
    ],
    related: ["common:my-data"],
  },

  {
    slug: "interface",
    audience: "common",
    section: SECTION,
    order: 4,
    title: "Finding your way around",
    description: "The menu, the top bar and the buttons found on every page",
    since: "1.0",
    keywords: ["sidebar", "menu", "side menu", "semester", "term", "bell", "interface", "layout", "tour", "mobile menu"],
    blocks: [
      screenshot("C-10", "The main screen. The numbers in the image match the list below"),
      text(
        "1. The left menu, with all of your work\n" +
        "2. The semester picker. Almost every page shows data for the term you choose here\n" +
        "3. The notification bell\n" +
        "4. The user menu, for viewing your profile and signing out\n" +
        "5. The **Tour** button, which walks you through this page one part at a time",
      ),
      text(
        "You can collapse the left menu down to icons only with the button at the top of the menu, to get more room to work. " +
        "The system remembers whether it is collapsed or expanded in that browser.",
      ),
      screenshot("C-11", "The left menu collapsed to icons only"),
      callout("tip", "Every page has a **Tour** button at the top right. Click it any time and the system walks you through that page one part at a time."),
      gif("C-G1", "Click the Tour button and the system explains each part in turn. Click ✕ to close it at any time"),
      text("**On a phone** the menu is hidden. Tap the ☰ icon at the top left to open it."),
      screenshot("C-12", "The menu on a phone, opened"),
    ],
  },

  {
    slug: "account-settings",
    audience: "common",
    section: SECTION,
    order: 5,
    title: "Account settings",
    description: "View your personal details, change your profile picture, change your password and manage 2FA",
    since: "1.0",
    routes: ["/account"],
    keywords: ["account settings", "profile", "change password", "profile picture", "avatar", "security", "education history", "personal details"],
    blocks: [
      screenshot("C-13", "The account settings page, with personal details, profile picture, password and 2FA"),
      text(
        "What you can change yourself on this page is your **profile picture**: upload a picture and crop it before saving. " +
        "Your **personal details** (full name, email and phone number) are shown for reference only. If they need changing, please contact staff.",
      ),
      gif("C-G2", "Upload a profile picture, crop it, then save"),
      uiPath("Account settings", "Security"),
      text("Change your password and manage 2FA here. Turning on 2FA does not need your current password, but changing your password does."),
      text("**Teaching assistant (TA)** accounts also have an **Education history** section, showing your study level and any changes of level."),
    ],
    related: ["common:two-factor"],
  },

  {
    slug: "my-data",
    audience: "common",
    section: SECTION,
    order: 6,
    title: "My data (PDPA)",
    description: "See the data the system keeps about you, download it, or ask for it to be deleted",
    since: "1.0",
    routes: ["/account/my-data"],
    keywords: ["pdpa", "my data", "delete my data", "download my data", "data deletion request", "personal data", "privacy"],
    blocks: [
      screenshot("C-15", "The My data page, showing the data categories, the download button and the delete request button"),
      text("This page shows all the personal data the system keeps about you, such as your personal details, national ID number (stored encrypted) and uploaded documents. You can download a copy, as is your right as the data owner under the PDPA."),
      steps([
        { title: "Click Request deletion of my data", body: "The system sends the request to staff for review. Your data is not deleted right away." },
        { title: "Wait for the decision", body: "Staff review the request and let you know the outcome.", screenshot: "C-16" },
      ]),
      callout(
        "info",
        "If the request is approved, **your account is closed and data that is no longer needed is deleted**. " +
        "However, financial data (if any) must be kept under accounting and tax regulations, so it cannot all be deleted at once.",
      ),
    ],
    related: ["common:pdpa-consent"],
  },

  {
    slug: "announcements",
    audience: "common",
    section: SECTION,
    order: 7,
    title: "Announcements and notifications",
    description: "Read announcements from staff and share an announcement link with people outside the system",
    since: "1.0",
    routes: ["/announcements", "/announcements/[id]", "/p/announcements/[id]"],
    keywords: ["announcements", "share announcement", "public link", "pinned", "news", "line"],
    blocks: [
      screenshot("C-17", "The announcements page, with pinned announcements and their cover images at the top"),
      text("Pinned announcements always stay at the top. Click one to read it in full, and click the share button to copy the link or send it via LINE."),
      text("A shared link (`/p/announcements/[id]`) **opens without signing in**, so you can send it to people outside the system to read that announcement."),
    ],
  },

  {
    slug: "notifications",
    audience: "common",
    section: SECTION,
    order: 8,
    title: "Notifications",
    description: "In-app and email notifications, filtering, and the mark all as read button",
    since: "1.1",
    routes: ["/notifications", "/ta/notifications"],
    keywords: ["notifications", "alerts", "bell", "notification", "email notifications", "email", "unread", "mark all as read"],
    blocks: [
      screenshot("C-18", "The notification list, with the All / Unread filter and the mark all as read button"),
      text("The red number on the bell is how many notifications you have not read yet. Click it to see the full list."),
      text("Items with an **Open** button take you straight to the related page, for example the work log page of a course that was returned to you."),
      text(
        "Every notification is also sent **by email**. The email has a **Sign in to view details** button, " +
        "and its footer tells you who to contact if you have questions. This email is sent by the system, so there is no need to reply.",
      ),
      screenshot("C-23", "An example notification email: the header in college colors, the sign-in button and contact details in the footer"),
      callout("tip", "If you cannot find the email in your inbox, check your junk/spam folder, or look at the bell in the system, which always has every notification."),
    ],
  },

  {
    slug: "document-progress",
    audience: "common",
    section: SECTION,
    order: 9,
    title: "Document progress",
    description: "See which stage your exported disbursement documents have reached",
    since: "1.0",
    routes: ["/document-progress", "/p/progress/[linkId]"],
    keywords: ["document progress", "document routing", "signing documents", "stepper", "signatures", "dean", "send to finance", "status"],
    blocks: [
      text(
        "After staff export the disbursement documents, the paper documents still have to move along: the TA signs, the lecturer signs, the certifier signs, " +
        "they are sent to finance, and then the dean signs. This page shows which stage the documents are at. Everyone can view it, but only staff can update it.",
      ),
      screenshot("C-19", "The 5 stages with notes"),
      callout("info", "Lecturers and staff see all 5 stages. **Teaching assistant (TA)** accounts see 4 stages, without the **Dean signs** stage."),
      text("The `/p/progress/[linkId]` link lets people outside the system check the status without signing in."),
    ],
  },

  {
    slug: "session-timeout",
    audience: "common",
    section: SECTION,
    order: 10,
    title: "Session timeout and signing out",
    description: "When the system signs you out by itself, how many devices you can use at once, and how to sign out",
    since: "1.1",
    keywords: ["idle", "session timeout", "sign out", "log out", "logout", "15 minutes", "another device", "other device", "session ended", "signed out automatically"],
    errors: ["ออกจากระบบอัตโนมัติ", "เข้าสู่ระบบจากอุปกรณ์อื่น", "เซสชันสิ้นสุดแล้ว"],
    blocks: [
      statusTable([
        {
          status: "Signed out automatically", tone: "warn",
          meaning: "If you are inactive for more than **15 minutes**, the system signs you out straight away without warning, in every open tab.",
          whoActsNext: "Sign in again and the system takes you back to the page you were on.",
        },
        {
          status: "Signed in from another device", tone: "warn",
          meaning: "Each account can be used on **only 1 device at a time**. If you sign in on a new device, the old one is signed out.",
          whoActsNext: "If you did not sign in from another device, change your password and tell staff.",
        },
        { status: "Session ended", tone: "neutral", meaning: "This session was cancelled, for example after a password change or because staff closed the account." },
      ]),
      text("Reading a PDF or scrolling through the manual in the side panel also counts as activity, so the system will not sign you out while you are reading."),
      text("To sign out yourself, click your name or profile picture at the top right, then choose **Sign out**."),
      callout(
        "warn",
        "This button signs you out of COCO TAS only. **It does not sign you out of your KKU account**. " +
        "If you use a shared computer and signed in with your KKU Account, always sign out of the university system as well.",
      ),
    ],
  },

  {
    slug: "demo-sandbox",
    audience: "common",
    section: SECTION,
    order: 11,
    title: "Sandbox (demo)",
    description: "Try the system in every role without touching real data",
    since: "1.0",
    routes: ["/demo"],
    keywords: ["demo", "sandbox", "try it out", "practice", "training", "test drive", "beta"],
    blocks: [
      screenshot("C-21", "The sandbox page, where you choose a role to try"),
      text(
        "`/demo` is separate from the real system and all of its data is made up, so feel free to click around. Use it to practise before doing real work, " +
        "or for training. Some accounts can try every role; others can try only the lecturer and TA roles.",
      ),
      callout("info", "The sandbox always shows a yellow **BETA** bar at the top so you will not confuse it with the real system, and it expires by itself if left unused for a while."),
    ],
  },
];

