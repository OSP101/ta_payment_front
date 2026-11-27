// Read-only UI checks against the isolated request playground.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
await mkdir('/tmp/ta-request-detail', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
    const row = { id: 'request-detail', teaching_course_id: 'request-playground', status: 'approved', ta_names: 'ผู้ช่วยสอน ตัวอย่าง', ta_count: 1, submitted_at: '2026-11-19T08:00:00Z', is_late: true };
    await page.route('**/api/v1/ta-requests', route => route.fulfill({ json: [row] }));
    let fail = false;
    const detail = { ...row, course_code: 'CP321004', course_name: 'รายวิชาตัวอย่าง', lecturer_name: 'อาจารย์ ตัวอย่าง', submitted_by_name: 'เจ้าหน้าที่ ตัวอย่าง', academic_year: 2569, semester: 2, reimburse_scope: 'both', assignments: [
      { ta_id: 'ta-1', section_no: '1', ta_name: row.ta_names, email: 'long-student-email-for-mobile@kkumail.com', student_id: '653020001-1', level: 'undergrad', total_hrs: 4.5, state: 'trimmed', state_reason: 'ตัดบางคาบที่ตรงกับตารางเรียน', workload: { check_work_hrs: 1.5, attendance_hrs: 1, lab_other_hrs: 2, lab_other_desc: 'เตรียมอุปกรณ์\nช่วยอธิบายการทดลองและตอบคำถามของนักศึกษา' } },
      { ta_id: 'ta-1', section_no: '2', ta_name: row.ta_names, email: 'long-student-email-for-mobile@kkumail.com', level: 'undergrad', total_hrs: 0, state: 'dropped', workload: null },
      { ta_id: 'ta-2', section_no: '3', ta_name: 'ผู้ช่วยสอน บัณฑิตศึกษา', email: 'graduate@kkumail.com', level: 'master', total_hrs: 4, state: 'active', workload: { help_teach_hrs: 1, help_teach_desc: 'ช่วยอธิบายโจทย์', grade_hrs: 1, grade_desc: 'ตรวจแบบฝึกหัด', prep_hrs: 1, prep_desc: 'เตรียมใบงาน', other_hrs: 1, other_desc: 'ตอบคำถามเพิ่มเติม' } },
    ] };
    await page.route('**/api/v1/ta-requests/request-detail', route => route.fulfill(fail ? { status: 500, json: { error: 'test failure' } } : { json: detail }));
    await page.goto(`${origin}/dev/request-preview`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log(`${name}: loaded request playground`);
    await page.getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('อาจารย์ ตัวอย่าง', { exact: true })).toBeVisible();
    for (const text of ['CP321004 รายวิชาตัวอย่าง', 'ภาระงานที่ระบุในคำขอ', 'ประเภทที่ขอเบิก', 'บรรยายและปฏิบัติการ', 'ส่งช้า', '653020001-1', 'ช่วยตรวจงาน', '1.5 ชม./สัปดาห์', 'เตรียมอุปกรณ์', 'ไม่มีข้อมูลภาระงานที่บันทึกไว้', 'ช่วยอธิบายโจทย์', 'ตรวจแบบฝึกหัด', 'เตรียมใบงาน', 'ตอบคำถามเพิ่มเติม']) {
      await expect(dialog.getByText(text, { exact: text !== 'เตรียมอุปกรณ์' }).first()).toHaveCount(1);
    }
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'dialog horizontal overflow');
    await page.screenshot({ path: `/tmp/ta-request-detail/${name}.png`, fullPage: true });
    await dialog.getByText('ตอบคำถามเพิ่มเติม', { exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByText('ตอบคำถามเพิ่มเติม', { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/ta-request-detail/${name}-scrolled.png`, fullPage: true });
    await page.getByRole('button', { name: 'ปิด', exact: true }).click();
    fail = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click();
    await expect(dialog.getByText('โหลดรายละเอียดคำขอไม่สำเร็จ')).toBeVisible();
    fail = false;
    await dialog.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click();
    await expect(dialog.getByText('อาจารย์ ตัวอย่าง', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${name}: request metadata, per-section duties and descriptions, missing forms, scrolling and error recovery passed`);
  }
} finally { await browser.close(); }
