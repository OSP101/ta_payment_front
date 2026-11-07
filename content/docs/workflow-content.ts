import { scenarioBlocks } from "./sequence-scenarios";
import { type SeqItem, type Block, type DocPage, type SequenceSpec, text, steps, sequence, table, callout } from "./types";

type Language = "th" | "en";
type Topic = "request" | "worklog" | "payout" | "paper";

/** Shared by the functional manual and diagram index: one spec per topic/language. */
export function workflowBlocks(topic: Topic, lang: Language): Block[] {
  const t = (th: string, en: string) => lang === "th" ? th : en;
  const system = { id: "system", label: t("ระบบ COCO TAS", "COCO TAS"), kind: "system" as const };
  const actor = (id: string, th: string, en: string) => ({ id, label: t(th, en), kind: "actor" as const });
  let spec: SequenceSpec;
  let explanation: string[][];
  if (topic === "request") {
    spec = {
      title: t("จากส่งคำขอ TA ถึงผลการพิจารณา", "From submitting a TA request to its decision"),
      participants: [actor("lecturer", "อาจารย์", "Lecturer"), system, actor("ta", "ผู้ช่วยสอน", "TA")],
      items: [
        { from: "lecturer", to: "system", text: t("ส่งคำขอพร้อมรายชื่อ TA กลุ่มเรียน และชั่วโมง", "Submit TA names, sections and hours") },
        { from: "system", to: "system", text: t("ตรวจทั้งชุดว่ามี TA ซ้ำกับคำขอในวิชานี้หรือไม่ ก่อนบันทึก", "Check the entire batch for duplicate TAs in this course before saving") },
        { from: "system", to: "system", text: t("ตรวจเกณฑ์และตารางเรียน แล้วตัดสินคำขอรายคน", "Check eligibility and class schedules, then decide each TA request") },
        { from: "system", to: "lecturer", text: t("แสดงผลรายคน หรือรอตัดสินหากยังขาดตารางเรียน", "Show each result, or leave it pending if a class schedule is missing"), kind: "reply" },
        { frag: "opt", branches: [{ guard: t("คำขอถูกตัดสินแล้ว", "Request has been decided"), items: [
          { from: "system", to: "ta", text: t("แจ้งผลคำขอ", "Notify the TA of the decision"), kind: "async" },
        ] }] },
      ],
      caption: t("อ่านจากบนลงล่าง หมายเลขตรงกับคำอธิบายด้านล่าง เส้นประคือคำตอบจากระบบ", "Read top to bottom. Numbers match the explanation below; dashed arrows show replies."),
    };
    explanation = [
      ["1", t("อาจารย์ตรวจรายชื่อ กลุ่มเรียน และชั่วโมงก่อนส่ง", "The lecturer checks names, sections and hours before submitting.")],
      ["2", t("ถ้ามี TA ซ้ำ ระบบปฏิเสธชุดนั้น ไม่บันทึกเพียงบางคน ให้โหลดข้อมูลล่าสุดตรวจคำขอเดิมก่อนส่งใหม่", "A duplicate rejects the whole batch. Reload and inspect existing requests before trying again.")],
      ["3–4", t("ผลแยกเป็นรายคน ผู้ที่ยังขาดตารางเรียนอาจรอตัดสิน ให้ TA จัดตารางเรียนให้ครบ", "Decisions are per TA. A TA with a missing schedule may remain pending until their schedule is completed.")],
      ["5", t("หลังผ่าน ให้ดำเนินการเรื่องคำสั่งแต่งตั้งและเอกสาร TA ต่อ", "After approval, continue with appointment orders and TA documents.")],
    ];
  } else if (topic === "worklog") {
    spec = {
      title: t("จากบันทึกเวลาถึงการอนุมัติ", "From work logs to approval"),
      participants: [actor("ta", "ผู้ช่วยสอน", "TA"), system, actor("lecturer", "อาจารย์", "Lecturer")],
      items: [
        { from: "ta", to: "system", text: t("สร้างรายการจากตารางสอน หรือกรอกเวลาตามงานจริง", "Generate entries from the teaching schedule or enter actual work") },
        { from: "system", to: "ta", text: t("บันทึกร่างและแสดงรายการให้ตรวจ", "Save drafts and show entries for review"), kind: "reply" },
        { from: "ta", to: "system", text: t("ตรวจรายการและส่งอนุมัติภายในกำหนดของเดือน", "Review entries and submit before the monthly deadline") },
        { from: "system", to: "system", text: t("ตรวจเงื่อนไขการส่งและบันทึกรายการที่ส่งอนุมัติ", "Validate submission conditions and record the submitted entries") },
        { from: "system", to: "ta", text: t("ยืนยันการส่งอนุมัติ", "Confirm submission"), kind: "reply" },
        { from: "system", to: "lecturer", text: t("แจ้งว่ามีบันทึกเวลารออนุมัติ", "Notify the lecturer of pending work logs"), kind: "async" },
        { from: "lecturer", to: "system", text: t("ตรวจและยืนยันอนุมัติบันทึกเวลา", "Review and approve the work logs") },
        { from: "system", to: "lecturer", text: t("ยืนยันผลอนุมัติ", "Confirm approval"), kind: "reply" },
        { from: "system", to: "ta", text: t("แจ้งผลอนุมัติ", "Notify the TA of approval"), kind: "async" },
      ],
      caption: t("บันทึกร่างยังไม่เท่ากับส่งอนุมัติ และอาจารย์อนุมัติแล้วยังต้องรอเจ้าหน้าที่ดำเนินการเบิกจ่าย", "Saving a draft does not submit it. Approved hours still require the officer's payout process."),
    };
    explanation = [
      ["1", t("ตรวจวัน เวลา กลุ่มเรียน และรายการที่สร้างอัตโนมัติกับงานที่ทำจริง", "Check dates, times, sections and generated entries against actual work.")],
      ["2–3", t("กดส่งอนุมัติก่อนปิดรับ ตรวจสถานะหลังส่ง อย่าใช้การมีรายการในตารางเป็นหลักฐานว่าส่งแล้ว", "Submit before closing and verify the status. An entry appearing in the table does not mean it has been submitted.")],
      ["4–5", t("หากส่งกลับ ให้อ่านเหตุผลและแก้ภายในกรอบที่เปิดอยู่ ถ้าปิดรับแล้วให้ติดต่อเจ้าหน้าที่", "If returned, read the reason and correct it while submission is open. Contact the officer if the period has closed.")],
    ];
  } else if (topic === "payout") {
    spec = {
      title: t("ออกชุดเบิกรวมของเดือน", "Issue a combined monthly claim package"),
      participants: [actor("staff", "เจ้าหน้าที่", "Officer"), system],
      items: [
        { from: "staff", to: "system", text: t("เลือกเดือน แล้วกด ออกชุดเบิกรวมของเดือน", "Select a month and choose Issue combined monthly package") },
        { from: "system", to: "system", text: t("ตรวจว่าปิดรับเวลาแล้ว และตรวจความพร้อมของวิชาที่มีรายการเข้าเกณฑ์เบิกในเดือนนั้น", "Check that submission has closed and eligible courses for that month are ready") },
        { from: "system", to: "system", text: t("สร้างเอกสารรายวิชาและ ZIP รวม ตรวจยอดกับวงเงินคงเหลือ", "Prepare course documents and the combined ZIP; check amounts against the remaining budget") },
        { from: "system", to: "system", text: t("บันทึกฉบับเอกสาร ล็อกยอด และรายชื่อผู้ลงนามของเดือนร่วมกัน", "Commit the document version, frozen amounts and monthly signer roster together") },
        { from: "system", to: "staff", text: t("ดาวน์โหลด ZIP พร้อมเอกสารรายวิชาและ manifest.json", "Download the ZIP containing course packages and manifest.json"), kind: "reply" },
      ],
      caption: t("ภาพนี้เป็นการออกชุดใหม่สำเร็จ หากตรวจไม่ผ่านให้แก้สาเหตุก่อน ระบบไม่ล็อกเพียงบางวิชาเมื่อการออกชุดล้มเหลว", "This shows a successful new issue. Resolve blockers first; a failed package does not freeze a partial set of courses."),
    };
    explanation = [
      ["1", t("เลือกเดือนเดียวในภาคเรียน หลังปิดกรอบส่งเวลา", "Choose one month in the term, after its submission deadline.")],
      ["2", t("รายชั่วโมงใช้เวลาที่เข้าเกณฑ์และผ่านอนุมัติ ส่วนบัณฑิตศึกษาภาคพิเศษแบบเหมาจ่ายอาจเบิกได้แม้ไม่มีบันทึกเวลา แต่คำสั่งแต่งตั้งและเอกสารรับเงินต้องพร้อม", "Hourly claims use qualifying approved work. Graduate special-track lump sums can be payable without logs, but appointment orders and payee documents must be ready.")],
      ["3–4", t("ยอดเดือนที่ล็อกแล้วและฐานเหมาจ่ายที่ล็อกครั้งแรกไม่เปลี่ยน ระบบจัดสรรเฉพาะส่วนคงเหลือ", "Previously frozen months and the first frozen lump-sum basis stay unchanged; only the remainder is reallocated.")],
      ["5", t("ตรวจไฟล์ แล้วไปเมนูใบปะหน้าจ่ายตรงและอัปเดตความคืบหน้าเอกสารของเดือนนั้น", "Check the files, then continue to the direct-payment cover sheet and that month's document progress.")],
    ];
  } else {
    spec = {
      title: t("ใบปะหน้าจ่ายตรงและการส่งเอกสารลงนาม", "Direct-payment cover sheet and paper signatures"),
      participants: [actor("staff", "เจ้าหน้าที่", "Officer"), system, actor("signer", "ผู้ลงนาม", "Signers")],
      items: [
        { from: "staff", to: "system", text: t("เลือกเดือนที่ออกชุดเบิกแล้วในเมนูใบปะหน้าจ่ายตรง", "Choose an issued claim month in Direct-payment cover sheet") },
        { from: "system", to: "staff", text: t("ตรวจเงื่อนไข แล้วส่งไฟล์ใบปะหน้าหลังยืนยันตัวตน", "Validate readiness and return the cover sheet after identity confirmation"), kind: "reply" },
        { from: "staff", to: "signer", text: t("นำเอกสารจริงไปให้ลงนาม", "Route the physical documents for signature"), kind: "async" },
        { from: "staff", to: "system", text: t("บันทึกผู้ลงนามและขั้นตอนตามเอกสารจริงของเดือนและฉบับนั้น", "Record signatures and progress for that month and version based on the physical documents") },
        { from: "system", to: "staff", text: t("ตรวจขั้นก่อนหน้าและลายเซ็นครบก่อนเลื่อนไปส่งการเงิน", "Require prior stages and signatures before advancing to finance"), kind: "reply" },
      ],
      caption: t("ระบบติดตามเอกสารกระดาษ การอัปเดตสถานะไม่ได้ยืนยันว่าโอนเงินเข้าบัญชีแล้ว", "The system tracks paper documents. Updating progress does not confirm a bank transfer."),
    };
    explanation = [
      ["1–2", t("ใบปะหน้าชุดใหม่เลือกเดือนเดียว ต้องออกชุดเบิกเดือนนั้นก่อน และยืนยันรหัสผ่านก่อนดาวน์โหลด", "A new cover sheet covers one month. Issue its claim package first and confirm your password before downloading.")],
      ["3–4", t("ติ๊กตามการลงนามจริง รายชื่ออ้างอิงฉบับที่ออกแล้ว ไม่ใช้ลายเซ็นข้ามเดือน", "Check off actual signatures against the issued roster. Signatures are not reused across months.")],
      ["5", t("หากออกฉบับแก้ไข ให้ตรวจเช็กลิสต์และความคืบหน้าของฉบับใหม่อีกครั้ง", "After a corrected issue, review the new version's signature checklist and progress again.")],
    ];
  }
  return [
    text(t("**ลำดับการทำงานของฟังก์ชันนี้**\nแผนภาพต่อไปนี้สรุปสิ่งที่คุณทำ สิ่งที่ระบบตรวจ และผู้ที่ทำงานต่อ อ่านรายละเอียดตามหมายเลขใต้แผนภาพ", "**How this function works**\nThe following diagram summarizes your actions, the system's checks and who acts next. Read the numbered explanation below.")),
    sequence({ ...spec, activation: "none" }),
    table([t("ขั้นในแผนภาพ", "Diagram step"), t("สิ่งที่เกิดขึ้น", "What happens")], numberedMessages(spec.items)),
    ...explanation.map(([, body]) => text(body)),
    ...(topic === "worklog" ? scenarioBlocks("return-worklog", lang) : []),
  ];
}

function numberedMessages(items: SeqItem[]): string[][] {
  const rows: string[][] = [];
  const visit = (items: SeqItem[]) => items.forEach(item => {
    if ("from" in item) rows.push([String(rows.length + 1), item.text]);
    else if ("frag" in item) item.branches.forEach(branch => visit(branch.items));
  });
  visit(items);
  return rows;
}

export function concurrentEditHelp(lang: Language): Block[] {
  const t = (th: string, en: string) => lang === "th" ? th : en;
  return [callout("warn", t("ถ้าระบบแจ้งว่ารายการถูกส่งไปแล้ว มีผู้อื่นกำลังทำ หรือข้อมูลเปลี่ยน ให้โหลดข้อมูลล่าสุดและตรวจผลก่อนบันทึกใหม่ หากคำสั่งเดิมสำเร็จแล้วไม่ต้องส่งซ้ำ เก็บข้อความที่ยังไม่ได้บันทึกไว้ก่อนรีเฟรช", "If the system says a request was already sent, another person is working, or data has changed, reload and check the result before saving again. Do not resubmit a completed action. Keep a copy of unsaved text before refreshing."))];
}

export function monthlyPayoutBlocks(lang: Language): Block[] {
  const t = (th: string, en: string) => lang === "th" ? th : en;
  return [
    text(t("ออกเอกสารใหม่จากกล่อง **ชุดเบิกประจำเดือน** ที่หน้า **ตรวจและส่งออกเอกสาร** หลังตรวจรายวิชาเรียบร้อยแล้ว เลือกได้ครั้งละหนึ่งเดือน", "Issue new documents from **Monthly claim package** on **Review and export documents** after reviewing the courses. Select one month at a time.")),
    steps([
      { title: t("ตรวจความพร้อมก่อนออกชุด", "Check readiness"), body: t("ตรวจคำสั่งแต่งตั้ง เอกสาร TA ผู้รับรอง และบันทึกเวลาที่ต้องอนุมัติให้ครบก่อน", "Check appointment orders, TA documents, certifiers and all work logs requiring approval.") },
      { title: t("เลือกเดือนที่ปิดรับเวลาแล้ว", "Select a closed month"), body: t("ดูสถานะและรายวิชาที่ยังไม่ส่งออกในกล่องชุดเบิกประจำเดือน", "Check the status and unexported courses in the monthly package panel.") },
      { title: t("กด ออกชุดเบิกรวมของเดือน", "Issue the combined monthly package"), body: t("ระบบตรวจทุกวิชาอีกครั้ง หากมีสาเหตุขัดข้องให้กลับไปแก้ตามรายการที่แจ้ง", "The system checks every course again. Resolve any reported blockers before trying again.") },
      { title: t("ตรวจไฟล์และดำเนินการลงนาม", "Check files and arrange signatures"), body: t("ZIP มีชุดเอกสารรายวิชาและ manifest.json จากนั้นเปิดเมนูใบปะหน้าจ่ายตรงและความคืบหน้าเอกสาร", "The ZIP contains course document packages and manifest.json. Continue to the cover sheet and document progress menus.") },
    ]),
    ...workflowBlocks("payout", lang),
    ...scenarioBlocks("reprint", lang),
    table([t("กรณี", "Case"), t("วิธีทำต่อ", "Next action")], [
      [t("ยังไม่ปิดรับเวลา", "Submission is still open"), t("รอวันปิดรับของเดือน ไม่ออกชุดใหม่ก่อนกำหนด", "Wait until the month's submission deadline has passed.")],
      [t("ออกชุดเบิกแล้ว", "Package already issued"), t("กด ดาวน์โหลดชุดเดิม ได้ไฟล์เดิม ไม่สร้างฉบับใหม่หรือเปลี่ยนยอดที่ล็อก", "Choose Download existing package. This returns the original files without creating a new version or changing frozen amounts.")],
      [t("ต้องแก้เอกสารที่ออกแล้ว", "Issued documents need correction"), t("ดำเนินการส่งกลับตามสิทธิ์ก่อนแก้ แล้วออกฉบับแก้ไข ตรวจลายเซ็นและความคืบหน้าใหม่", "Use the permitted return workflow before editing, then issue a corrected version and review signatures and progress again.")],
      [t("เอกสารก่อนเปลี่ยนระบบรายเดือน", "Documents predating monthly packages"), t("ใช้ประวัติและขั้นตอนเดิมของเดือนนั้น ลายเซ็นเดิมไม่ถูกนำมาใส่ชุดใหม่", "Use that month's original history and workflow. Old signatures are not copied into new packages.")],
    ]),
    ...concurrentEditHelp(lang),
  ];
}

export function transferCoverPage(lang: Language): DocPage {
  const t = (th: string, en: string) => lang === "th" ? th : en;
  return {
    slug: "transfer-cover", audience: "staff", section: t("ขั้นที่ 4: ใบปะหน้าจ่ายตรง", "Step 4: Direct-payment cover sheet"), order: 81,
    title: t("ใบปะหน้าจ่ายตรง", "Direct-payment cover sheet"), description: t("ออกใบปะหน้าสำหรับเดือนที่ออกชุดเบิกแล้ว และส่งเอกสารลงนาม", "Create a cover sheet for an issued monthly claim and route the documents for signature"), since: "1.2",
    routes: ["/staff/transfer-cover"], keywords: ["ใบปะหน้าจ่ายตรง", "transfer cover", "monthly", "ลงนาม"],
    blocks: [text(t("เปิดเมนู **ใบปะหน้าจ่ายตรง** เลือกภาคเรียนและเดือน ตรวจยอดในตัวอย่าง แล้วกรอกรหัสผ่านเพื่อยืนยันก่อนดาวน์โหลด ชุดใหม่ออกได้ครั้งละเดือนหลังออกชุดเบิกเดือนนั้นแล้ว", "Open **Direct-payment cover sheet**, choose the term and month, review the preview, and confirm your password before downloading. A new cover sheet covers one month after its claim package has been issued.")), ...workflowBlocks("paper", lang), ...concurrentEditHelp(lang)],
    related: ["staff:payouts/list", "staff:progress", "staff:budget-summary"],
  };
}
