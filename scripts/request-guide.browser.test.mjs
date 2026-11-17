// Read-only, browser-local draft fixture: does not change the playground user's draft.
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 15000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
 for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport }); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
  let writes = 0;
  await page.route('**/api/v1/teaching-courses/request-playground/request-draft', async route => {
    if (route.request().method() !== 'GET') writes++;
    await route.fulfill({ json: { payload: initialDraft(), updated_at: new Date().toISOString() } });
  });
  await page.goto(`${origin}/dev/request-preview`);
  const guideButton = page.getByRole('button', { name: 'วิธีกรอกคำขอและชั่วโมง TA', exact: true });
  await expect(page.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button')).toHaveCount(2, { timeout: 60000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await guideButton.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'คู่มือกรอกคำขอและชั่วโมง TA' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'ชั่วโมงแต่ละงาน', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tabpanel', { name: 'ชั่วโมงแต่ละงาน', exact: true })).toContainText('ช่วยตรวจงาน');
  await expect(dialog.getByRole('tabpanel', { name: 'ชั่วโมงแต่ละงาน', exact: true })).toContainText('อื่น ๆ (ปฏิบัติการ)');
  const sections = dialog.getByRole('tab', { name: 'ทำไมแยก Section', exact: true });
  await sections.click();
  await expect(dialog.getByRole('tabpanel', { name: 'ทำไมแยก Section', exact: true })).toContainText('ถ้าบรรยายเรียนรวม แต่แล็บแยกกลุ่มล่ะ?');
  await sections.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'TA ใช้ข้อมูลอย่างไร', exact: true })).toBeFocused();
  await expect(dialog.getByRole('tabpanel', { name: 'TA ใช้ข้อมูลอย่างไร', exact: true })).toContainText('ไม่สามารถเพิ่มชั่วโมงเกินที่กำหนดเองได้');
  await dialog.getByRole('tab', { name: 'แผนแนะนำ', exact: true }).click();
  await expect(dialog.getByRole('tabpanel', { name: 'แผนแนะนำ', exact: true })).toContainText('ขอ TA น้อยกว่าหรือมากกว่าจำนวนที่ระบบแนะนำได้');
  const bounds = await dialog.boundingBox(); assert.ok(bounds.width <= viewport.width && bounds.x >= 0);
  await dialog.getByRole('button', { name: 'เข้าใจแล้ว', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(guideButton).toBeFocused();
  await expect(page.locator('#request-person-0').getByRole('textbox', { name: 'ช่วยตรวจงาน (ชม./สัปดาห์)', exact: true })).toHaveValue('1');
  await page.locator('#request-person-0').getByRole('button', { name: 'ทำไมต้องกรอกแยก Section?', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'ทำไมแยก Section', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'แผนแนะนำปรับอะไรได้บ้าง?', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'แผนแนะนำ', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: `/tmp/request-guide-${viewport.width}.png`, fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.locator('#request-person-0').getByRole('button', { name: 'ชั่วโมงแต่ละงานคืออะไร?', exact: true }).click();
  await page.screenshot({ path: `/tmp/request-guide-hours-${viewport.width}.png`, fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert.equal(writes, 0, 'Opening and closing help must not rewrite the request draft');
  console.log('guide viewport passed:', viewport.width);
  await page.close();
 }
 const graduate = await browser.newPage();
 await graduate.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
 await graduate.route('**/api/v1/teaching-courses/request-playground/request-draft', async route => {
   const draft = initialDraft(); draft.assignments[0].level = 'master';
   await route.fulfill({ json: { payload: draft, updated_at: new Date().toISOString() } });
 });
 await graduate.goto(`${origin}/dev/request-preview`);
 await expect(graduate.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button')).toHaveCount(2, { timeout: 60000 });
 await graduate.getByRole('button', { name: 'วิธีกรอกคำขอและชั่วโมง TA', exact: true }).click();
 const graduatePanel = graduate.getByRole('tabpanel', { name: 'ชั่วโมงแต่ละงาน', exact: true });
 await expect(graduatePanel).toContainText('TA ปริญญาโท / ปริญญาเอก');
 await expect(graduatePanel).toContainText('เตรียมการสอน');
 await graduate.close();
 assert.deepEqual(errors, []);
 console.log('PASS: four guide topics, contextual entry points, keyboard tabs, Escape/focus restoration, unchanged drafts, desktop and mobile');
} finally { await browser.close(); }
