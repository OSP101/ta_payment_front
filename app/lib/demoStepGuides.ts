/**
 * Field-level "what to click/type" copy for every guided (hands-on)
 * scenario step — see internal/demo's ScenarioEventStatus.SubSteps doc
 * comment for why this split exists: the backend only knows whether a
 * record exists in the DB, this file is the only place that knows which
 * button says what on the real page. Nothing in here is verified — it's a
 * checklist for the trainee to follow, not a form the panel fills in for
 * them. Every one of the 12 events has an entry — the 7 staff-actor ones
 * and the 5 TA/lecturer-actor ones alike. The TA/lecturer-actor ones
 * additionally require SWITCHING which seeded account is logged in first —
 * see DEMO_ACCOUNT_LABELS below and DemoGuidePanel.tsx's SubStepRow, which
 * is what actually performs the switch (this file only supplies copy).
 *
 * Keyed by ScenarioEvent.key, then by:
 *  - a real DemoSubStep.key (course code / TA email / lecturer email) for
 *    every multi-record event — must match the keys internal/demo's
 *    scenario_status.go actually returns.
 *  - "_flat" for every other guided event (creates exactly one record, so
 *    there's no sub_steps array to key off — DemoGuidePanel shows this list
 *    directly under the step's own description).
 *  - "_after" — extra notes shown once every sub-group in the event is
 *    done. Currently only staff_review_export uses this, for the
 *    finance-sent half of that step, which has no staff-facing button
 *    anywhere in the real product (see scenario_status.go's
 *    staffReviewExportSubSteps doc comment) — sandbox does it automatically
 *    via the same "ให้ระบบทำส่วนที่เหลือให้อัตโนมัติ" fallback button.
 */

/** Email → Thai label, mirroring internal/demo/seed.go's demoAccounts —
 *  duplicated here (not fetched) because it's tiny, static, and never
 *  changes without a matching backend change anyway. Used by
 *  DemoGuidePanel's "สลับไปเป็น {label} แล้วไปทำเอง" button and
 *  DemoBanner's "กำลังใช้งานเป็น" identity display. */
export const DEMO_ACCOUNT_LABELS: Record<string, string> = {
  "admin@demo.local": "ผู้ดูแลระบบ (admin)",
  "staff@demo.local": "เจ้าหน้าที่ (staff)",
  "lecturer1@demo.local": "อาจารย์ผู้สอน 1",
  "lecturer2@demo.local": "อาจารย์ผู้สอน 2",
  "lecturer3@demo.local": "อาจารย์ผู้สอน 3",
  "ta1@demo.local": "ผู้ช่วยสอน (TA) 1",
  "ta2@demo.local": "ผู้ช่วยสอน (TA) 2",
  "ta3@demo.local": "ผู้ช่วยสอน (TA) 3",
  "ta4@demo.local": "ผู้ช่วยสอน (TA) 4",
};
export const STEP_GUIDES: Record<string, Record<string, string[]>> = {
  term: {
    _flat: [
      'ไปที่เมนู "ตั้งค่า" → แท็บ "ภาคเรียน"',
      'กดปุ่ม "เพิ่มปีการศึกษา" มุมขวาบนของแผง',
      'กรอกช่อง "ปีการศึกษา (พ.ศ.)" เป็นปีปัจจุบัน แล้วกด "ถัดไป เพิ่มภาคเรียน"',
      'ในฟอร์ม "เพิ่มภาคเรียนใหม่" เลือกช่อง "ภาคเรียน" = "ภาคต้น"',
      'กรอกช่อง "จำนวนเดือนที่เปิด" = 4',
      'เลือก "วันที่เริ่มสอน" และ "วันที่สิ้นสุดสอน" (ระบบไม่ตรวจวันที่เป๊ะ เลือกตามสมเหตุสมผลได้เลย)',
      'เลือกช่วง "เริ่มสอบกลางภาค" / "สิ้นสุดสอบกลางภาค"',
      'เลือกช่วง "เริ่มสอบปลายภาค" / "สิ้นสุดสอบปลายภาค"',
      'ติ๊กช่อง "ตั้งเป็นภาคเรียนปัจจุบัน (active)"',
      'กดปุ่ม "เพิ่มภาคเรียน" แล้วกด "ยืนยัน" ในกล่องยืนยัน',
      'ถ้าระบบถามเรื่องดึงวันหยุดราชการจาก BOT จะกด "ข้าม" ก็ได้ ไม่บังคับ',
    ],
  },

  courses: {
    CP100001: courseChecklist(1),
    CP100002: courseChecklist(2),
    CP100003: courseChecklist(3),
  },

  ta_schedules: {
    "ta1@demo.local": taScheduleChecklist(1),
    "ta2@demo.local": taScheduleChecklist(2),
    "ta3@demo.local": taScheduleChecklist(3),
    "ta4@demo.local": taScheduleChecklist(4),
  },

  ta_requests: {
    CP100001: taRequestChecklist(1),
    CP100002: taRequestChecklist(2),
    CP100003: taRequestChecklist(3),
  },

  submission_periods: {
    _flat: [
      'ไปที่เมนู "ตั้งค่า" → แท็บ "ปฏิทิน"',
      'กดปุ่ม "เพิ่มเดือน" (ปุ่มเดี่ยว — ไม่ใช่ "สร้างอัตโนมัติ 5 เดือน" ครั้งนี้ให้ฝึกกรอกเอง)',
      'กรอก "ป้ายกำกับ (แสดงบน UI)" เช่น "สิงหาคม 2569"',
      'กรอก "รหัสเดือน (year-month)" เป็นปี พ.ศ.-เดือน เช่น "2569-08"',
      'เลือก "วันเปิดรอบ (TA เริ่มเซ็นได้)" = วันที่ 1 ของเดือนนี้',
      'เลือก "กำหนดส่ง (วันสุดท้ายที่เซ็นได้)" = ประมาณ 30 วันถัดจากวันเปิดรอบ',
      'ช่อง "แจ้งเตือนล่วงหน้า (วัน)" ปล่อยค่าเริ่มต้น 3 ไว้ได้',
      'กดปุ่ม "บันทึก"',
    ],
  },

  appointment_order: {
    _flat: [
      'ไปที่เมนู "คำสั่งแต่งตั้ง"',
      'ตรวจสอบตัวเลข TA ที่รอออกคำสั่งด้านบน (ควรมี 3 คน จากขั้นตอนก่อนหน้า)',
      'กรอก "คำสั่งที่ (เลขที่คำสั่ง)" เช่น 6 และปี พ.ศ. เช่น 2569',
      'เลือก "ผู้ลงนาม (คณบดี หรือผู้รักษาการแทน)" จากรายชื่อ',
      'เลือก "วันที่สั่ง"',
      'เลือก "มีผลตั้งแต่วันที่"',
      'กดปุ่ม "สร้างไฟล์คำสั่ง (.docx)"',
    ],
  },

  ta_docs: {
    "ta1@demo.local": taDocsChecklist(1),
    "ta2@demo.local": taDocsChecklist(2),
    "ta3@demo.local": taDocsChecklist(3),
  },

  docs_approve: {
    "ta1@demo.local": docsApproveChecklist(1),
    "ta2@demo.local": docsApproveChecklist(2),
    "ta3@demo.local": docsApproveChecklist(3),
  },

  worklog_submit: {
    "ta1@demo.local": worklogSubmitChecklist(1),
    "ta2@demo.local": worklogSubmitChecklist(2),
    "ta3@demo.local": worklogSubmitChecklist(3),
  },

  worklog_approve: {
    "lecturer1@demo.local": worklogApproveChecklist(1),
    "lecturer2@demo.local": worklogApproveChecklist(2),
    "lecturer3@demo.local": worklogApproveChecklist(3),
  },

  staff_review_export: {
    CP100001: exportChecklist(1),
    CP100002: exportChecklist(2),
    CP100003: exportChecklist(3),
    _after: [
      'หลังทำครบทั้ง 3 วิชาแล้ว กดปุ่ม "ให้ระบบทำส่วนที่เหลือให้อัตโนมัติ" ท้ายขั้นตอนนี้อีกครั้ง เพื่อส่งเรื่องต่อให้การเงิน — ' +
        "ไม่มีปุ่มนี้ในหน้าจริงของเจ้าหน้าที่ (มีแต่ฝั่งอาจารย์) ระบบจะทำส่วนนี้ให้อัตโนมัติเสมอ",
    ],
  },

  transfer_cover: {
    _flat: [
      'ไปที่เมนู "สรุปงบประมาณ"',
      'ตรวจว่าไม่มีรายการ "รหัสคู่" ค้างให้จัดการ (ถ้ามีให้กดปุ่ม "รหัสคู่" จัดการก่อน)',
      'กดปุ่ม "ปะหน้าจ่ายตรง"',
      'ในกล่องเลือกช่วงเดือน กดปุ่ม "ทั้งภาคเรียน"',
      'กดปุ่ม "ตรวจสอบและดาวน์โหลด"',
    ],
  },
};

function courseChecklist(i: 1 | 2 | 3): string[] {
  return [
    'ไปที่เมนู "รายวิชา" — ตรวจว่าเลือกภาคเรียนที่เพิ่งสร้างไว้อยู่',
    'กดปุ่ม "เปิดรายวิชา"',
    `ขั้น "ข้อมูลวิชา": กรอก "รหัสวิชา" = CP10000${i} (ต้องตรงตัวเป๊ะ ขั้นตอนถัดไปอ้างอิงรหัสนี้)`,
    'เลือก "ระดับ" = "ปริญญาตรี"',
    'กรอก "ชื่อวิชา (อังกฤษ)" ตามใจ เช่น "INTRO TO PROGRAMMING"',
    'กรอกหน่วยกิต/ชม.บรรยาย/ชม.ปฏิบัติ/ชม.ศึกษาเอง ตามที่เห็นสมควร เช่น 3/3/0/6',
    `ขั้น "อาจารย์ผู้สอน": พิมพ์ค้นหาแล้วเลือก "อาจารย์ผู้สอน ${i}" — ต้องเลือกให้ตรงคน`,
    'ขั้น "กลุ่มเรียน (section)": กรอกช่อง "ภาคปกติ" = 1',
    'ขั้น "จำนวนนักศึกษา + ตารางเรียน": กรอก "นศ." ของ section 1 = 30',
    'กดขยายแถว section 1 → กด "เพิ่มคาบ" → เลือก "บรรยาย" / วัน "จันทร์" / เวลาเริ่ม 09:00 / เวลาสิ้นสุด 12:00',
    'กดปุ่ม "เปิดรายวิชา" ท้ายฟอร์ม',
  ];
}

function taScheduleChecklist(i: 1 | 2 | 3 | 4): string[] {
  return [
    `สลับไปเป็นบัญชี "ผู้ช่วยสอน (TA) ${i}" (ปุ่มด้านล่างทำให้อัตโนมัติ)`,
    'ไปที่เมนู "ตารางเรียนของฉัน" แล้วเลือกภาคเรียนที่เพิ่งสร้างไว้ (ถ้ายังไม่ได้เลือก)',
    'กดปุ่ม "เพิ่มคาบเรียน"',
    'กรอก "รหัสวิชา" = GE100001, "ชื่อวิชา" ตามใจ เช่น "กิจกรรมเสริมหลักสูตร"',
    'เลือก "ประเภท" = "บรรยาย", กรอก "Section" = 01',
    'เลือก "วัน" = "ศุกร์", "เริ่ม" = 15:00, "สิ้นสุด" = 16:00',
    'กดปุ่ม "บันทึก" (ระบบมี autosave อยู่แล้ว แต่กด "บันทึกทันที" เพื่อความชัวร์ก็ได้)',
  ];
}

function taRequestChecklist(i: 1 | 2 | 3): string[] {
  return [
    `สลับไปเป็นบัญชี "อาจารย์ผู้สอน ${i}" (ปุ่มด้านล่างทำให้อัตโนมัติ)`,
    `ไปที่วิชา CP10000${i} → เมนู "คำขอผู้ช่วยสอน"`,
    'เลือก "ประเภทการเบิกค่าตอบแทน" = "เฉพาะบรรยาย"',
    'กดปุ่ม "เพิ่ม TA"',
    `ในช่อง "เลือก TA" ค้นหาแล้วเลือก "ผู้ช่วยสอน (TA) ${i}" — ต้องตรงคนตามวิชา`,
    'เลือก Section ของวิชานี้ (section 01)',
    'ในกลุ่ม "ชั่วโมงบรรยาย (ปริญญาตรี)" ติ๊ก "ช่วยตรวจงาน" แล้วตั้งชั่วโมง = 2',
    'ติ๊ก "เช็คชื่อ / เก็บใบงาน" แล้วตั้งชั่วโมง = 3',
    'กดปุ่ม "ส่งคำขอ (1 คน)" แล้วกด "ยืนยันส่งคำขอ" ในกล่องยืนยัน',
    'ระบบจะตัดสินอนุมัติ/ปฏิเสธให้อัตโนมัติทันที ดูข้อความแจ้งเตือนที่ขึ้นมา',
  ];
}

function taDocsChecklist(i: 1 | 2 | 3): string[] {
  return [
    `สลับไปเป็นบัญชี "ผู้ช่วยสอน (TA) ${i}" (ปุ่มด้านล่างทำให้อัตโนมัติ)`,
    'ไปที่เมนู "เอกสารของฉัน" — ถ้ามีกล่องยินยอมให้เก็บข้อมูล (PDPA) ให้กดยอมรับก่อน',
    'ขั้น "ข้อมูลส่วนตัว + บัญชี + ลายเซ็น": เลือก "คำนำหน้าชื่อ", กรอก "รหัสนักศึกษา" เช่น 653020123-4',
    'กรอก "เบอร์โทรศัพท์" (9-10 หลัก), กรอก "เลขบัตรประชาชน (13 หลัก)" ตัวเลขอะไรก็ได้ 13 หลัก (ระบบเตือนเฉย ๆ ไม่บังคับผ่าน checksum)',
    'กรอก "ชื่อบัญชี", เลือก "ธนาคาร", กรอก "สาขา"/"รหัสสาขา"/"เลขที่บัญชี" ตามจำนวนหลักที่ระบบกำหนดของธนาคารนั้น',
    'วาด "ลายเซ็น" อะไรก็ได้ในช่องลายเซ็น แล้วกดปุ่ม "บันทึกและทำขั้นตอนถัดไป"',
    'ขั้น "แบบแจ้งเจ้าหนี้ (PDF)": ตรวจดูตัวอย่าง PDF แล้วกด "ยืนยันและบันทึกเอกสารนี้"',
    'ขั้น "สำเนาบัตรประชาชน": อัปโหลดไฟล์ PDF อะไรก็ได้ (ไม่เกิน 10 MB) แล้วกด "อัปโหลด"',
    'ขั้น "หน้าสมุดบัญชี": อัปโหลดไฟล์ PDF อะไรก็ได้ แล้วกด "อัปโหลด"',
  ];
}

function worklogSubmitChecklist(i: 1 | 2 | 3): string[] {
  return [
    `สลับไปเป็นบัญชี "ผู้ช่วยสอน (TA) ${i}" (ปุ่มด้านล่างทำให้อัตโนมัติ)`,
    `ไปที่วิชา CP10000${i} → เมนู "บันทึกเวลาปฏิบัติงาน"`,
    'กดปุ่ม "สร้างอัตโนมัติ" แล้วกดยืนยันในกล่อง "สร้างตารางบันทึกเวลาอัตโนมัติ" (ระบบสร้างรายการจากตารางสอนของวิชาให้)',
    'ตรวจดูรายการที่สร้างขึ้น (แก้ไขเพิ่มเติมได้ถ้าต้องการ)',
    'กดปุ่ม "ส่งอนุมัติ" แล้วกดยืนยันในกล่อง "ส่งบันทึกเวลาให้อาจารย์อนุมัติ"',
  ];
}

function worklogApproveChecklist(i: 1 | 2 | 3): string[] {
  return [
    `สลับไปเป็นบัญชี "อาจารย์ผู้สอน ${i}" (ปุ่มด้านล่างทำให้อัตโนมัติ)`,
    `ไปที่วิชา CP10000${i} → เมนู "อนุมัติรายงานบันทึกเวลา TA"`,
    `หาการ์ดของ "ผู้ช่วยสอน (TA) ${i}"`,
    'กดปุ่ม "อนุมัติทุกเดือน" แล้วกด "อนุมัติทั้งหมด" ในกล่องยืนยัน (หรือกด "อนุมัติ" ทีละเดือนก็ได้)',
  ];
}

function docsApproveChecklist(i: 1 | 2 | 3): string[] {
  return [
    'ไปที่เมนู "ตรวจเอกสาร" แท็บ "รอตรวจ"',
    `คลิกชื่อ "ผู้ช่วยสอน (TA) ${i}" ในรายการเพื่อเปิดหน้าตรวจสอบ`,
    'เอกสาร "สำเนาบัตรประชาชน" → กด "อนุมัติ"',
    'เอกสาร "สำเนาสมุดบัญชีธนาคาร" → กด "อนุมัติ"',
    'เอกสาร "แบบฟอร์มเจ้าหนี้" → กด "อนุมัติ" (การอนุมัติเอกสารสุดท้ายจะปิดสถานะ TA คนนี้ให้อัตโนมัติ)',
  ];
}

function exportChecklist(i: 1 | 2 | 3): string[] {
  return [
    `ไปที่เมนู "จ่ายค่าตอบแทน" แล้วเปิดวิชา CP10000${i}`,
    'ในตาราง "ตรวจรายเดือน" กดปุ่ม "ผ่านทั้งวิชา" ท้ายตาราง (หรือกด "ผ่าน" ทีละแถวก็ได้)',
    'เลื่อนลงมาที่แผงส่งออก ติ๊กช่อง "ตรวจสอบข้อมูลข้างต้นถูกต้องแล้ว..."',
    'กดปุ่ม "ดาวน์โหลด ZIP (ล็อก)" — การดาวน์โหลดจะล็อกเดือนที่อนุมัติแล้วให้อัตโนมัติ',
  ];
}
