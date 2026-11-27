import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
const apiOrigin = process.env.REQUEST_FORM_TEST_API || 'http://127.0.0.1:3331';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.equal((await (await fetch(`${apiOrigin}/api/health`)).json()).playground, true);
await fetch(`${apiOrigin}/api/v1/teaching-courses/request-playground/request-draft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initialDraft()) });
const requested = { source: 'requested', course_id: 'request-playground', course_code: 'CP-DEMO', course_name: 'รายวิชาสำหรับทดลองคำขอ TA', section_id: 'sec-3', section_no: '3', kind: 'lab', day_of_week: 1, start_time: '09:00', end_time: '12:00', state: '' };
const teaching = { ...requested, source: 'teaching', course_id: 'other', course_code: 'CP372002', course_name: 'ระบบสารสนเทศภูมิศาสตร์', section_id: 'other-sec', section_no: '2', start_time: '10:00', end_time: '13:00', state: 'active' };
const own = { ...requested, source: 'own_class', course_id: '', course_code: 'CP371031 เรียนวิชาอื่น', course_name: '', section_id: '', section_no: '', kind: 'own_class', start_time: '11:00', end_time: '12:00' };
const preview = { conflicts: [{ section_id: 'sec-3', messages: ['เวลาสอนทับซ้อนกับวิชาอื่นที่เป็นผู้ช่วยสอนอยู่'], cross_conflict: true, blocked_kinds: [] }] };
const schedule = { ta_name: 'ผู้ช่วยสอน ตัวอย่าง 1', has_schedule: true, slots: [requested, { ...requested, section_id: 'sec-1', section_no: '1', day_of_week: 2 }, teaching, own], conflicts: [{ requested, existing: teaching, blocking: true, overlap_start: '10:00', overlap_end: '12:00' }, { requested, existing: own, blocking: false, overlap_start: '11:00', overlap_end: '12:00' }] };
const out = '/tmp/ta-conflict-schedule'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
 for (const mobile of [false, true]) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 } });
  page.setDefaultTimeout(60000);
  await page.route('**/teaching-courses/request-playground/request-draft', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: route.request().method() === 'GET' ? initialDraft() : JSON.parse(route.request().postData() || '{}'), updated_at: new Date().toISOString() }) }));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let fail = false;
  await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
  await page.route('**/ta-requests/preview-conflicts?*', async route => {
    const detail = new URL(route.request().url()).searchParams.get('include_schedule') === '1';
    await route.fulfill({ status: detail && fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(detail ? { ...preview, schedule } : preview) });
  });
  await page.goto(`${origin}/dev/request-preview`, { timeout: 120000 });
  const button = page.getByRole('button', { name: 'ดูรายละเอียดเวลาชนและตาราง TA', exact: true });
  await button.click().catch(async error => { await page.screenshot({ path: `${out}/failure.png` }); console.log((await page.locator('body').innerText()).slice(-3500)); throw error; });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('CP372002 · ระบบสารสนเทศภูมิศาสตร์', { exact: true })).toBeVisible();
  await expect(dialog.getByText('ช่วงที่ทับซ้อน: จันทร์ 10:00–12:00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('ช่วงที่ทับซ้อน: จันทร์ 11:00–12:00', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('table')).toHaveCount(2);
  await expect(dialog.getByRole('table').last()).toBeVisible();
  await expect(dialog.getByRole('table').last().getByRole('row')).toHaveCount(5);
  await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}.png`, fullPage: false });
  assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false, 'dialog overflow');
  await dialog.getByRole('table').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-week.png` });
  await dialog.getByLabel('Section ที่ต้องการตรวจ').selectOption('sec-1');
  await expect(dialog.getByText('ไม่พบเวลาทับซ้อนสำหรับ Section ที่แสดง')).toBeVisible();
  await dialog.getByLabel('Section ที่ต้องการตรวจ').selectOption('sec-3');
  await expect(dialog.getByText('ช่วงที่ทับซ้อน: จันทร์ 10:00–12:00')).toBeVisible();
  await dialog.getByRole('button', { name: 'ปิด', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  if (!mobile) {
    // Fresh TA key bypasses SWR cache and verifies a failed request can recover.
    await page.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button').nth(1).click();
    fail = true;
    await page.getByRole('button', { name: 'ดูรายละเอียดเวลาชนและตาราง TA', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('โหลดรายละเอียดตารางไม่สำเร็จ')).toBeVisible();
    fail = false;
    await page.getByRole('dialog').getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    await expect(page.getByRole('dialog').getByRole('table').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  assert.deepEqual(errors, []);
  await page.close();
 }
 console.log(`PASS: desktop/mobile conflicts, unavailable section, full week, section filter, retry, close. Screenshots: ${out}`);
} finally { await browser.close(); }
