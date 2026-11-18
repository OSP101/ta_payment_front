import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft, lecturer } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const key = 'ta-payment:request-guide:v1:lecturer-playground';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let writes = 0;
  await page.route('**/api/v1/teaching-courses/request-playground/request-draft', async route => {
   if (route.request().method() !== 'GET') writes++;
   await route.fulfill({ json: { payload: initialDraft(), updated_at: new Date().toISOString() } });
  });
  await page.goto(`${origin}/dev/request-preview`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const dialog = page.getByRole('dialog').filter({ hasText: 'คู่มือกรอกคำขอและชั่วโมง TA' });
  const done = dialog.getByRole('button', { name: 'เข้าใจแล้ว', exact: true });
  const optOut = dialog.getByRole('checkbox', { name: 'เข้าใจแล้ว ไม่แสดงอัตโนมัติอีกบนเบราว์เซอร์นี้', exact: true });
  const next = dialog.getByRole('button', { name: 'ถัดไป', exact: true });
  let capturedCancellation = false;
  const completeTopics = async () => {
   for (let i = 0; i < 4; i++) {
    await next.click();
    if (i === 2) {
     const cancellation = dialog.getByRole('tabpanel', { name: 'แก้ไข / ยกเลิก', exact: true });
     await expect(cancellation).toBeVisible();
     for (const text of ['ออกหนังสือแต่งตั้งแล้ว ยกเลิกคำขอไม่ได้', 'เลื่อนลงไปที่ประวัติคำขอ TA ใต้ฟอร์ม', 'ยืนยันยกเลิก', 'ไม่ต้องยกเลิก TA คนอื่น', 'ใช้บัญชี TA เดิมได้ ไม่ต้องสร้างบัญชีใหม่']) await expect(cancellation).toContainText(text);
     await expect(optOut).toHaveCount(0);
     if (!capturedCancellation) {
      await page.screenshot({ path: `/tmp/request-cancellation-guide-${viewport.width}.png`, animations: 'disabled' });
      capturedCancellation = true;
     }
    }
   }
   await expect(done).toBeEnabled();
  };
  await expect(dialog).toBeVisible({ timeout: 60000 });
  await expect(done).toHaveCount(0); await expect(optOut).toHaveCount(0);
  await expect(dialog.getByRole('group', { name: 'การนำทางคู่มือ' }).getByRole('button')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'ปิด', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await page.mouse.click(1, 1); await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'ทำไมแยก Section', exact: true }).click();
  await dialog.getByRole('tab', { name: 'ชั่วโมงแต่ละงาน', exact: true }).click();
  await expect(dialog.locator('[role="tab"][data-visited="true"]')).toHaveCount(2);
  await expect(optOut).toHaveCount(0);
  // Jumping to the final tab exposes the checkbox, but cannot bypass the unread topics.
  await dialog.getByRole('tab', { name: 'แผนแนะนำ', exact: true }).click();
  await expect(done).toBeDisabled(); await expect(optOut).toBeDisabled();
  await expect(dialog.getByRole('group', { name: 'การนำทางคู่มือ' }).getByRole('button')).toHaveCount(1);
  await dialog.getByRole('tab', { name: 'ชั่วโมงแต่ละงาน', exact: true }).click();
  await expect(optOut).toHaveCount(0);
  await completeTopics();
  await expect(done).toBeEnabled(); await expect(optOut).toBeEnabled();
  // Without opting out, completing the tutorial only unlocks this visit.
  await done.click(); await expect(dialog).not.toBeVisible();
  assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await expect(dialog).toBeVisible(); await expect(done).toHaveCount(0); await expect(optOut).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('1 จาก 5');
  await completeTopics(); await optOut.check();
  await page.screenshot({ path: `/tmp/request-guide-gate-${viewport.width}.png`, animations: 'disabled' });
  await done.click();
  assert.equal(await page.evaluate(k => localStorage.getItem(k), key), '1');
  const meLoaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/me', { timeout: 90000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await meLoaded;
  await expect(page.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button')).toHaveCount(2);
  await expect(dialog).not.toBeVisible();
  // Manual help remains available after opting out, and can still be dismissed normally.
  await page.getByRole('button', { name: 'วิธีกรอกคำขอและชั่วโมง TA', exact: true }).click();
  await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  // Another account on the same browser must see its own mandatory tutorial.
  await page.route('**/api/v1/me', route => route.fulfill({ json: { ...lecturer, id: 'another-lecturer' } }));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await expect(dialog).toBeVisible(); await expect(done).toHaveCount(0); await expect(optOut).toHaveCount(0);
  assert.equal(writes, 0); assert.deepEqual(errors, []);
  console.log('PASS mandatory guide:', viewport.width, 'px — repeat visits, all tabs, Escape/backdrop lock, opt-out, manual help, account isolation');
  await page.close();
 }
} finally { await browser.close(); }
