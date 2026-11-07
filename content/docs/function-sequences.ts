import { type DocPage, type Block, sequence, table, text } from "./types";
type Language = "th" | "en";
const scenarios: Record<string, {action: string[]; result: string[]}> = {
  "common:two-factor": {
    "action": [
      "สแกน QR แล้วส่งรหัส 6 หลักเพื่อยืนยัน",
      "Scan the QR code and submit a six-digit verification code"
    ],
    "result": [
      "ยืนยันการเปิด 2FA และแสดงรหัสสำรองให้เก็บ",
      "Confirm 2FA setup and show backup codes to save"
    ]
  },
  "common:pdpa-consent": {
    "action": [
      "อ่านรายละเอียดแล้วบันทึกตัวเลือกความยินยอม",
      "Read the notice and save the consent choice"
    ],
    "result": [
      "บันทึกตัวเลือกและแสดงผลการให้ความยินยอม",
      "Record the choice and show the consent result"
    ]
  },
  "common:account-settings": {
    "action": [
      "เลือกส่วนที่แก้ได้ เช่น รูปโปรไฟล์ แล้วบันทึก",
      "Choose an editable field such as the profile photo and save"
    ],
    "result": [
      "แสดงข้อมูลที่บันทึกแล้ว ส่วนรหัสผ่านและ 2FA มีขั้นตอนยืนยันแยก",
      "Show saved data; password and 2FA changes have separate verification steps"
    ]
  },
  "common:my-data": {
    "action": [
      "เลือกดาวน์โหลดข้อมูล หรือส่งคำขอลบข้อมูล",
      "Choose a data download or submit a deletion request"
    ],
    "result": [
      "คืนข้อมูลตามสิทธิ์ หรือบันทึกคำขอรอเจ้าหน้าที่พิจารณา ไม่ลบทันที",
      "Return the permitted data or record a request awaiting review, without immediate deletion"
    ]
  },
  "common:announcements": {
    "action": [
      "เลือกประกาศเพื่ออ่านฉบับเต็ม หรือคัดลอกลิงก์แชร์",
      "Open an announcement or copy its sharing link"
    ],
    "result": [
      "แสดงประกาศหรือลิงก์สาธารณะของฉบับที่เลือก",
      "Show the selected announcement or its public link"
    ]
  },
  "common:notifications": {
    "action": [
      "เลือกรายการแจ้งเตือนแล้วเปิดงานที่เกี่ยวข้อง",
      "Select a notification and open the related task"
    ],
    "result": [
      "เปิดหน้าที่เกี่ยวข้องตามสิทธิ์ของบัญชี",
      "Open the related page subject to account permissions"
    ]
  },
  "common:document-progress": {
    "action": [
      "เลือกภาคเรียนและชุดเอกสารที่ต้องการติดตาม",
      "Select the term and document scope to track"
    ],
    "result": [
      "แสดงขั้นตอนตามที่เจ้าหน้าที่บันทึก ไม่ยืนยันการโอนเงิน",
      "Show progress recorded by officers, without confirming a bank transfer"
    ]
  },
  "common:session-timeout": {
    "action": [
      "เปิดหน้าที่ต้องใช้เซสชัน หรือเลือกออกจากระบบ",
      "Open a protected page or choose Sign out"
    ],
    "result": [
      "หากเซสชันใช้ไม่ได้ให้เข้าสู่ระบบใหม่ การออกจาก COCO TAS ไม่ออกจาก KKU",
      "Request sign-in if the session is invalid; signing out of COCO TAS does not sign out of KKU"
    ]
  },
  "common:demo-sandbox": {
    "action": [
      "ระบุอีเมลที่มีสิทธิ์ แล้วเลือกบัญชีทดลอง",
      "Enter an eligible email and choose a demo account"
    ],
    "result": [
      "เปิดพื้นที่ทดลองของบัญชีนั้นและแสดงสถานะ BETA",
      "Open that account’s demo workspace and show the BETA indicator"
    ]
  },
  "ta:home": {
    "action": [
      "เลือกงานที่ยังไม่ครบหรือเลือกวิชาที่ต้องทำงาน",
      "Select an incomplete task or a course to work on"
    ],
    "result": [
      "เปิดหน้าส่งเอกสาร ตารางเรียน หรือหน้าวิชาที่เลือก",
      "Open the chosen document, schedule or course page"
    ]
  },
  "ta:documents/step1-profile": {
    "action": [
      "กรอกข้อมูลส่วนตัว บัญชีรับเงินและลายเซ็น แล้วบันทึก",
      "Complete personal details, payment account and signature, then save"
    ],
    "result": [
      "ตรวจข้อมูลที่จำเป็นและบันทึกเพื่อใช้ในเอกสารรับเงิน",
      "Validate required fields and save them for payment documents"
    ]
  },
  "ta:documents/step2-creditor-form": {
    "action": [
      "ตรวจแบบแจ้งเจ้าหนี้ที่ระบบสร้าง แล้วกดยืนยันและบันทึก",
      "Review the generated creditor form, then confirm and save"
    ],
    "result": [
      "บันทึกเอกสารสำหรับให้เจ้าหน้าที่ตรวจ",
      "Save the document for officer review"
    ]
  },
  "ta:documents/step3-4-uploads": {
    "action": [
      "เลือกไฟล์ที่หน้าจอร้องขอแล้วอัปโหลด",
      "Select and upload the documents required on screen"
    ],
    "result": [
      "ตรวจไฟล์และแสดงเอกสารพร้อมสถานะล่าสุด",
      "Validate files and show documents with their latest status"
    ]
  },
  "ta:documents/rejected": {
    "action": [
      "อ่านเหตุผล แก้เอกสารที่ถูกส่งกลับแล้วส่งใหม่",
      "Read the reason, correct the returned document and resubmit"
    ],
    "result": [
      "แสดงเอกสารฉบับใหม่เพื่อรอการตรวจอีกครั้ง",
      "Show the replacement document awaiting another review"
    ]
  },
  "ta:schedule/overview": {
    "action": [
      "อัปโหลดตารางเรียน .ics แล้วตรวจตัวอย่างก่อนยืนยัน",
      "Upload an .ics class schedule and review the preview before confirming"
    ],
    "result": [
      "บันทึกคาบเรียนเพื่อใช้ตรวจเวลาชนกับงาน TA",
      "Save class sessions for TA work conflict checks"
    ]
  },
  "ta:schedule/manual-draw": {
    "action": [
      "เพิ่ม ลาก ย้าย หรือแก้คาบเรียนตามข้อมูลจริง",
      "Add, drag, move or edit class sessions to match actual classes"
    ],
    "result": [
      "ตรวจเงื่อนไขแล้วบันทึกตารางและแสดงผลล่าสุด",
      "Check conditions, save the schedule and show the result"
    ]
  },
  "ta:schedule/wba": {
    "action": [
      "เลือกกรณีไม่มีตารางเรียนแล้วอ่านและยืนยันคำเตือน",
      "Select the no-class-schedule option and confirm its warning"
    ],
    "result": [
      "ตรวจสิทธิ์และบันทึก WBA โดยลบคาบที่กรอกไว้ตามคำเตือน",
      "Check eligibility and save WBA, removing existing sessions as warned"
    ]
  },
  "ta:schedule/locked": {
    "action": [
      "ตรวจข้อความล็อกและตารางเรียนของเทอมที่เลือก",
      "Inspect the lock notice and the selected term’s schedule"
    ],
    "result": [
      "แสดงข้อมูลอ่านอย่างเดียวเมื่อเข้าเงื่อนไขล็อก ให้ติดต่อเจ้าหน้าที่เมื่อต้องแก้",
      "Show read-only data when locked; contact the officer for corrections"
    ]
  },
  "ta:course-overview": {
    "action": [
      "เลือกวิชาและภาคเรียนที่ต้องการดู",
      "Choose a course and term"
    ],
    "result": [
      "แสดงข้อมูลและทางไปหน้าลงเวลาของวิชาที่เลือก",
      "Show course details and a link to that course’s work logs"
    ]
  },
  "ta:worklog/rules": {
    "action": [
      "ตรวจสิทธิ์ เอกสารและช่วงเวลาของเดือนก่อนลงเวลา",
      "Check eligibility, documents and the monthly period before logging work"
    ],
    "result": [
      "แสดงรายการที่ทำได้หรือสาเหตุที่ยังลงเวลาไม่ได้",
      "Show available entries or the reason logging is blocked"
    ]
  },
  "ta:worklog/generate": {
    "action": [
      "เลือกกลุ่มเรียนแล้วกดสร้างรายการอัตโนมัติ",
      "Choose a section and generate work-log entries"
    ],
    "result": [
      "สร้างร่างจากตารางตามเงื่อนไข ให้ตรวจและแก้ก่อนส่งอนุมัติ",
      "Generate drafts from eligible sessions for review before submission"
    ]
  },
  "ta:worklog/manual-entry": {
    "action": [
      "เพิ่ม แก้ หรือลบรายการร่าง แล้วบันทึก",
      "Add, edit or delete a draft entry and save"
    ],
    "result": [
      "ตรวจวัน เวลาและเงื่อนไขก่อนบันทึก ไม่ถือว่าส่งอนุมัติแล้ว",
      "Validate dates, times and conditions before saving; saving is not submission"
    ]
  },
  "ta:worklog/multi-section": {
    "action": [
      "สลับ section และตรวจรายการของแต่ละกลุ่ม",
      "Switch sections and inspect each group’s entries"
    ],
    "result": [
      "แสดงเวลาของกลุ่มที่เลือก ให้ตรวจรายการครบก่อนส่ง",
      "Show the selected section’s logs for review before submission"
    ]
  },
  "ta:worklog/duty-schedule": {
    "action": [
      "กำหนดตารางงานประจำและตรวจวันเวลาที่เลือก",
      "Configure recurring duties and check the selected days and times"
    ],
    "result": [
      "บันทึกตารางงานตามเงื่อนไขเพื่อใช้กับรายการลงเวลา",
      "Save eligible duty schedules for use with work-log entries"
    ]
  },
  "ta:worklog/troubleshoot": {
    "action": [
      "อ่านสาเหตุที่ปุ่มใช้ไม่ได้ แล้วแก้ข้อมูลต้นเหตุ",
      "Read why an action is disabled and resolve its prerequisite"
    ],
    "result": [
      "เมื่อข้อมูลพร้อมและยังอยู่ในกรอบที่อนุญาต จึงทำรายการได้",
      "Enable the action when prerequisites and period conditions are met"
    ]
  },
  "ta:holidays": {
    "action": [
      "ตรวจคาบที่ตรงวันหยุด และแจ้งอาจารย์หากยังไม่มีวันชดเชย",
      "Check holiday clashes and notify the lecturer if a make-up is missing"
    ],
    "result": [
      "แสดงวันชดเชยที่ผู้มีสิทธิ์กำหนด TA ตั้งวันชดเชยเองไม่ได้",
      "Show make-ups set by authorized staff; TAs cannot set their own make-ups"
    ]
  },
  "ta:reminders": {
    "action": [
      "เลือกวิชาและเดือนเพื่อตรวจสถานะการเบิกจ่าย",
      "Choose a course and month to inspect claim status"
    ],
    "result": [
      "แสดงขั้นตอนอนุมัติ ตรวจส่งออก และส่งการเงินตามข้อมูลล่าสุด",
      "Show current approval, export-review and finance-routing status"
    ]
  },
  "ta:timetable-form": {
    "action": [
      "เลือกภาคเรียนแล้วกดพิมพ์ตาราง",
      "Choose a term and print the timetable"
    ],
    "result": [
      "เปิดแบบฟอร์มให้ตรวจ แล้วพิมพ์หรือบันทึก PDF จากเบราว์เซอร์",
      "Open the form for review and browser printing or PDF saving"
    ]
  },
  "lecturer:home": {
    "action": [
      "เลือกวิชาหรืองานค้างที่ต้องดำเนินการ",
      "Choose a course or pending task"
    ],
    "result": [
      "เปิดหน้าทำงานตามวิชาและสิทธิ์ของอาจารย์",
      "Open the appropriate course task for the lecturer"
    ]
  },
  "lecturer:course-overview": {
    "action": [
      "เลือกวิชาและเมนูงานที่ต้องการ",
      "Choose a course and task menu"
    ],
    "result": [
      "แสดงข้อมูลวิชาและทางไปคำขอ รายงาน หรืองบของวิชานั้น",
      "Show the course and links to its requests, reports or budget"
    ]
  },
  "lecturer:settings-schedule": {
    "action": [
      "กำหนดตารางเวลา section ที่ยังไม่ระบุเวลา แล้วบันทึก",
      "Set times for an unscheduled section and save"
    ],
    "result": [
      "ตรวจสิทธิ์และเงื่อนไขก่อนบันทึก หากต้องแก้ภายหลังให้ติดต่อเจ้าหน้าที่",
      "Check permissions and conditions before saving; contact staff for later corrections"
    ]
  },
  "lecturer:request/overview": {
    "action": [
      "ตรวจช่วงรับคำขอ แล้วเปิดแบบฟอร์มของวิชา",
      "Check the request window and open the course request form"
    ],
    "result": [
      "แสดงประเภทการเบิก รายชื่อ TA และข้อมูลที่ต้องกรอก",
      "Show payment types, TA selections and required fields"
    ]
  },
  "lecturer:request/step1-type": {
    "action": [
      "เลือกประเภทการเบิกให้ตรงกับลักษณะวิชา",
      "Choose a payment type appropriate to the course"
    ],
    "result": [
      "แสดงข้อมูลภาระงานที่ต้องกรอกตามประเภทที่เลือก",
      "Show workload fields appropriate to the chosen type"
    ]
  },
  "lecturer:request/step2-add-ta": {
    "action": [
      "ค้นหาชื่อหรืออีเมล แล้วเลือก TA ที่มีบัญชี",
      "Search by name or email and select an existing TA"
    ],
    "result": [
      "เพิ่มรายชื่อในแบบฟอร์มให้กำหนด section และชั่วโมงก่อนส่ง",
      "Add the TA to the draft for section and hours entry before submission"
    ]
  },
  "lecturer:request/step2-sections-hours": {
    "action": [
      "เลือก section และกรอกภาระงานของ TA แต่ละคน",
      "Select sections and enter each TA’s workload"
    ],
    "result": [
      "แสดงผลตรวจและสรุปชั่วโมงให้ทบทวนก่อนส่งคำขอ",
      "Show validation and workload totals for review before submission"
    ]
  },
  "lecturer:request/create-ta-account": {
    "action": [
      "กรอกข้อมูล TA ใหม่แล้วกดสร้างบัญชี",
      "Enter the new TA’s details and create the account"
    ],
    "result": [
      "แสดงข้อมูลเข้าใช้ให้ส่งเจ้าของบัญชี แล้วเพิ่ม TA ลงแบบฟอร์ม",
      "Show sign-in details to deliver to the TA, then add the TA to the draft"
    ]
  },
  "lecturer:request/rejected-troubleshoot": {
    "action": [
      "อ่านเหตุผลของ TA แต่ละคน แล้วแก้ข้อมูลที่เกี่ยวข้อง",
      "Read each TA’s rejection reason and correct the relevant data"
    ],
    "result": [
      "ตรวจเงื่อนไขอีกครั้งเมื่อส่งใหม่ ผลไม่รับประกันว่าจะผ่าน",
      "Recheck the rules on resubmission; approval is not guaranteed"
    ]
  },
  "lecturer:holidays": {
    "action": [
      "เลือกคาบวันหยุด กำหนดวันชดเชย แล้วบันทึก",
      "Choose a holiday session, set its make-up and save"
    ],
    "result": [
      "ตรวจวันเวลาแล้วแสดงวันชดเชยสำหรับการลงเวลาของ TA",
      "Validate and show the make-up session for TA work logs"
    ]
  },
  "lecturer:budget": {
    "action": [
      "เลือกวิชาและตรวจยอดงบ ชั่วโมงและยอดคำนวณ",
      "Select a course and inspect its budget, hours and calculated costs"
    ],
    "result": [
      "แสดงยอดคำนวณเพื่อวางแผน การดูหน้านี้ไม่ออกเอกสารเบิก",
      "Show planning figures; viewing this page does not issue claim documents"
    ]
  },
  "lecturer:executive": {
    "action": [
      "เลือกภาคเรียนและตัวกรองในมุมผู้บริหาร",
      "Choose a term and filters in the executive dashboard"
    ],
    "result": [
      "แสดงภาพรวมตามสิทธิ์ผู้บริหารและข้อมูลที่เลือก",
      "Show authorized executive summaries for the selected scope"
    ]
  },
  "staff:home": {
    "action": [
      "เลือกภาคเรียนและรายการงานค้าง",
      "Choose a term and pending task"
    ],
    "result": [
      "แสดงยอดสรุปและเปิดหน้าทำงานที่เกี่ยวข้อง",
      "Show summary counts and open the related task"
    ]
  },
  "staff:settings/rates": {
    "action": [
      "ตรวจและบันทึกอัตราค่าตอบแทน",
      "Review and save payment rates"
    ],
    "result": [
      "บันทึกอัตราตามเงื่อนไข ยอดที่ล็อกแล้วไม่ถูกแก้ย้อนหลังจากหน้านี้",
      "Save eligible rates without rewriting amounts already frozen"
    ]
  },
  "staff:settings/calendar": {
    "action": [
      "ตั้งช่วงรับคำขอและรอบส่งเวลารายเดือน",
      "Configure request windows and monthly submission periods"
    ],
    "result": [
      "บันทึกช่วงเวลาและแสดงวันครบกำหนดให้ตรวจ",
      "Save periods and show deadlines for review"
    ]
  },
  "staff:settings/admins": {
    "action": [
      "เพิ่มหรือแก้ผู้ดำรงตำแหน่งและสถานะใช้งาน",
      "Add or edit office holders and active status"
    ],
    "result": [
      "บันทึกข้อมูลที่ใช้กับผู้รับผิดชอบและเอกสารใหม่",
      "Save office-holder details used for responsibility and new documents"
    ]
  },
  "staff:settings/curricula": {
    "action": [
      "แก้ชื่อหลักสูตรและชื่อที่ใช้ในเอกสาร",
      "Edit curriculum names and document labels"
    ],
    "result": [
      "บันทึกข้อมูลหลักสูตรสำหรับรายงานที่เกี่ยวข้อง",
      "Save curriculum details for related reports"
    ]
  },
  "staff:settings/email": {
    "action": [
      "ปรับข้อมูลติดต่อ ตรวจตัวอย่าง แล้วบันทึก",
      "Edit contact details, review the preview and save"
    ],
    "result": [
      "แสดงข้อมูลที่ใช้ในอีเมล สามารถตรวจการเชื่อมต่อหรือทดสอบส่งตามสิทธิ์",
      "Show saved mail details; permitted checks and test sends are separate actions"
    ]
  },
  "staff:settings/demo-access": {
    "action": [
      "กำหนดสิทธิ์เข้าใช้ห้องทดลองตามบัญชี",
      "Configure demo access for accounts"
    ],
    "result": [
      "บันทึกสิทธิ์ห้องทดลองตามที่เลือก แยกจากข้อมูลใช้งานจริง",
      "Save demo permissions separately from production workspace data"
    ]
  },
  "staff:teaching/import": {
    "action": [
      "เลือกไฟล์ Excel ตรวจตัวอย่างและข้อผิดพลาด แล้วยืนยันนำเข้า",
      "Select an Excel file, review its preview and errors, then import"
    ],
    "result": [
      "แสดงผลวิชาที่นำเข้าและรายการที่ต้องแก้",
      "Show imported courses and items requiring correction"
    ]
  },
  "staff:teaching/manual-open": {
    "action": [
      "กรอกวิชา section อาจารย์และข้อมูลที่ร้องขอ แล้วยืนยัน",
      "Enter the course, sections, lecturers and required data, then confirm"
    ],
    "result": [
      "ตรวจข้อมูลและแสดงรายวิชาที่เปิดหรือรวมรหัสตามตัวเลือก",
      "Validate and show the opened course or merged codes as selected"
    ]
  },
  "staff:teaching/students": {
    "action": [
      "วางข้อมูลจำนวนจาก Excel หรือแก้จำนวนรายวิชา แล้วตรวจและบันทึก",
      "Paste Excel enrolment counts or edit a course count, review and save"
    ],
    "result": [
      "แสดงจำนวนและผลคำนวณที่อัปเดต ไม่ใช้การดึง REG ที่พักไว้",
      "Show updated counts and calculations; suspended REG fetching is not used"
    ]
  },
  "staff:teaching/sections": {
    "action": [
      "แก้ section ตารางสอน หรืออาจารย์ตามสิทธิ์แล้วบันทึก",
      "Edit sections, teaching times or lecturers as permitted, then save"
    ],
    "result": [
      "ตรวจเงื่อนไขและแสดงข้อมูลรายวิชาที่บันทึกแล้ว",
      "Validate and show saved course details"
    ]
  },
  "staff:announce": {
    "action": [
      "สร้างหรือแก้ประกาศ ตรวจกลุ่มเป้าหมาย แล้วเลือกเผยแพร่",
      "Create or edit an announcement, check its audience and publish"
    ],
    "result": [
      "เผยแพร่และแจ้งผู้รับตามเงื่อนไข การส่งซ้ำและเตือนเป็นคำสั่งแยก",
      "Publish and notify eligible recipients; retries and reminders are separate actions"
    ]
  },
  "staff:approvals": {
    "action": [
      "เลือกคำขอแล้วตรวจสถานะ เหตุผล และรายการที่ต้องทำต่อ",
      "Select a request and inspect its status, reasons and next actions"
    ],
    "result": [
      "แสดงผลตัดสินตามเกณฑ์ ไม่ใช่คิวให้เจ้าหน้าที่อนุมัติทุกคำขอเอง",
      "Show rule-based decisions, not a queue requiring staff to approve every request"
    ]
  },
  "staff:review": {
    "action": [
      "ตรวจไฟล์ TA แล้วบันทึกผ่านหรือส่งกลับพร้อมเหตุผล",
      "Review TA files and approve or return them with reasons"
    ],
    "result": [
      "บันทึกผลตรวจเอกสาร ให้ผู้เกี่ยวข้องดูสถานะล่าสุด",
      "Record document-review results for the relevant users to inspect"
    ]
  },
  "staff:payouts/detail": {
    "action": [
      "เปิดเดือน ตรวจรายการรายวัน แล้วผ่านเดือนหรือส่งกลับตามเงื่อนไข",
      "Open a month, inspect daily entries and pass the review or return as permitted"
    ],
    "result": [
      "บันทึกผลตรวจรายวิชา ยังไม่ออกชุดเบิกรวมของเดือน",
      "Record the course review without issuing the combined monthly package"
    ]
  },
  "staff:payouts/raw-worklog": {
    "action": [
      "เลือกข้อมูลเดิมที่ต้องแก้ และยืนยันเหตุผล/รหัสผ่านเมื่อร้องขอ",
      "Select existing entries to correct and provide the requested reason or password"
    ],
    "result": [
      "ตรวจสิทธิ์ กรอบเวลาและการล็อกก่อนบันทึกการแก้ไข",
      "Check permissions, period rules and frozen status before saving corrections"
    ]
  },
  "staff:budget-summary": {
    "action": [
      "เลือกภาคเรียนและเดือนที่เปรียบเทียบ แล้วตรวจและดาวน์โหลดรายงาน",
      "Choose a term and comparison months, then inspect and download the report"
    ],
    "result": [
      "แสดงรายงานตามเดือน ยอดเอกสารที่ล็อกแล้วคงเดิม",
      "Show the selected report with frozen document amounts preserved"
    ]
  },
  "staff:holidays": {
    "action": [
      "เพิ่ม แก้ หรือนำเข้ารายการวันหยุด แล้วบันทึก",
      "Add, edit or import holiday records and save"
    ],
    "result": [
      "ตรวจข้อมูลและแสดงปฏิทินวันหยุดที่บันทึกแล้ว",
      "Validate and show the saved holiday calendar"
    ]
  },
  "staff:tdbm": {
    "action": [
      "ตรวจข้อมูลและสถานะซิงก์ หรือสั่งซิงก์เมื่อมีสิทธิ์",
      "Inspect data and sync status, or request a permitted sync"
    ],
    "result": [
      "แสดงผลหรือข้อผิดพลาดจากการซิงก์ข้อมูล TDBM",
      "Show TDBM synchronization results or errors"
    ]
  },
  "staff:audit": {
    "action": [
      "กำหนดตัวกรอง ตรวจรายละเอียด หรือส่งออกรายการ",
      "Set filters, inspect details or export records"
    ],
    "result": [
      "แสดงประวัติที่ตรงตัวกรองและไฟล์ส่งออกตามสิทธิ์",
      "Show matching history and permitted export files"
    ]
  },
  "staff:pdpa-requests": {
    "action": [
      "อ่านคำขอลบข้อมูล ตรวจเหตุผล แล้วพิจารณาตามสิทธิ์",
      "Read deletion requests, review reasons and decide as permitted"
    ],
    "result": [
      "บันทึกผลพิจารณา เก็บข้อมูลที่ยังต้องรักษาตามข้อกำหนด",
      "Record the decision while retaining records required by retention rules"
    ]
  },
  "staff:admin-tools": {
    "action": [
      "เลือกเครื่องมือย้อนขั้น ตรวจผลกระทบและยืนยันตามสิทธิ์",
      "Choose a rollback tool, inspect its effects and confirm as permitted"
    ],
    "result": [
      "ตรวจสิทธิ์และเงื่อนไขก่อนย้อนสถานะ พร้อมบันทึก audit",
      "Validate permissions and conditions before rollback and record an audit entry"
    ]
  }
};
export const REFERENCE_PAGES = new Set(["common:intro", "common:interface", "ta:start", "lecturer:start", "staff:share-manual", "ta:reference/status", "ta:reference/rules", "ta:faq", "lecturer:reference/status", "lecturer:faq", "staff:reference/status", "staff:faq", "staff:admin-manual", "staff:flows/index"]);
/** Explicitly authored function scenarios; no inferred diagrams from arbitrary page prose. */
export function completeFunctionDiagrams(pages: DocPage[], lang: Language): DocPage[] {
  const l = lang === "th" ? 0 : 1;
  return pages.map(page => {
    const key = `${page.audience}:${page.slug}`;
    if (page.blocks.some(b => b.type === "sequence")) return page;
    if (REFERENCE_PAGES.has(key)) {
      const targets = page.audience === "staff" ? ["staff:flows/index", "common:flows/overview"] : page.audience === "lecturer" ? ["lecturer:flows/ta-request", "lecturer:flows/approve-worklog"] : page.audience === "ta" ? ["ta:flows/documents", "ta:flows/worklog"] : ["common:flows/overview", "common:flows/login"];
      const names: Record<string, string[]> = {
        "staff:flows/index": ["รวมแผนภาพ", "All diagrams"],
        "common:flows/overview": ["ภาพรวมตลอดภาคเรียน", "Semester overview"],
        "common:flows/login": ["การเข้าสู่ระบบ", "Signing in"],
        "lecturer:flows/ta-request": ["การขอ TA", "TA requests"],
        "lecturer:flows/approve-worklog": ["อนุมัติเวลา", "Work-log approval"],
        "ta:flows/documents": ["ส่งและตรวจเอกสาร", "Document review"],
        "ta:flows/worklog": ["ลงเวลาและส่งอนุมัติ", "Work-log submission"],
      };
      const links = targets.map(ref => {
        const [role, ...slug] = ref.split(":");
        const audience = role === "common" ? (page.audience === "common" ? "ta" : page.audience) : role;
        return `[${names[ref][l]}](/docs/${audience}/${slug.join(":")})`;
      }).join(" · ");
      return {...page, related:[...new Set([...(page.related ?? []),...targets])], blocks:[...page.blocks, text((lang === "th" ? "**แผนภาพที่เกี่ยวข้อง** " : "**Related sequence diagrams** ") + links)]};
    }
    const scenario = scenarios[key];
    if (!scenario) throw new Error(`Manual function lacks a diagram: ${key}`);
    const actor = lang === "th" ? ({staff:"เจ้าหน้าที่",lecturer:"อาจารย์",ta:"ผู้ช่วยสอน",common:"ผู้ใช้"}[page.audience]) : ({staff:"Officer",lecturer:"Lecturer",ta:"TA",common:"User"}[page.audience]);
    const items = [
      { from:"user", to:"system", text: (lang === "th" ? "เปิดหน้า " : "Open ") + page.title },
      { from:"system", to:"user", text:lang === "th" ? "แสดงข้อมูลและตัวเลือกตามสิทธิ์" : "Show permitted data and available actions", kind:"reply" as const },
      { from:"user", to:"system", text:scenario.action[l] },
      { from:"system", to:"user", text:scenario.result[l], kind:"reply" as const },
    ];
    const additions: Block[] = [
      text(lang === "th" ? "**ลำดับการทำงานของหน้านี้** ภาพสรุปเส้นทางหลัก อ่านเงื่อนไขและวิธีแก้ปัญหาในขั้นตอนด้านบน หากระบบปฏิเสธ ให้แก้ตามข้อความที่แจ้งก่อนทำต่อ" : "**How this page works** This diagram summarizes the main path. See the instructions above for conditions and troubleshooting. Resolve any reported rejection before proceeding."),
      sequence({title:page.title, activation:"none", participants:[{id:"user",label:actor,kind:"actor"},{id:"system",label:"COCO TAS",kind:"system"}],items}),
      table(lang === "th" ? ["ขั้น", "สิ่งที่เกิดขึ้น"] : ["Step", "What happens"],items.map((m,i)=>[String(i+1),m.text])),
    ];
    return {...page, blocks:[...page.blocks,...additions]};
  });
}
