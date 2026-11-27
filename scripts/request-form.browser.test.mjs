// Start `node scripts/request-form-playground.mjs` first. This suite only writes to its isolated API.
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 15000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
const apiOrigin = process.env.REQUEST_FORM_TEST_API || 'http://127.0.0.1:3331';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(apiOrigin).hostname));
assert.equal((await (await fetch(`${apiOrigin}/api/health`)).json()).playground, true);
const seed = async () => fetch(`${apiOrigin}/api/v1/teaching-courses/request-playground/request-draft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initialDraft()) });
await seed();
const browser = await chromium.launch({ channel: 'chrome' });
async function newPage(options) {
 const page = await browser.newPage(options);
 page.setDefaultNavigationTimeout(120000);
 await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
 return page;
}
try {
 const page = await newPage({ viewport: { width: 1440, height: 1050 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(`${origin}/dev/request-preview`);
 const nav = page.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' });
 await expect(nav.getByRole('button')).toHaveCount(2);
 await expect(page.locator('div[id^="request-person-"]:visible')).toHaveCount(1);
 await nav.getByRole('button').nth(1).click();
 await expect(page.locator('#request-person-1')).toBeVisible();
 await nav.getByRole('button').first().click();
 const grading = page.locator('#request-person-0').getByRole('textbox', { name: 'ช่วยตรวจงาน (ชม./สัปดาห์)', exact: true });
 await grading.fill('1.5'); await grading.press('Tab');
 await page.getByRole('button', { name: 'เพิ่มคนใหม่ด้วยงานแบบเดียวกัน', exact: true }).click();
 await page.getByRole('button', { name: 'สร้างและเปิดหน้าคนใหม่', exact: true }).click();
 await expect(nav.getByRole('button')).toHaveCount(3);
 await expect(page.locator('#request-person-2')).toBeVisible();
 await expect(page.locator('#request-person-2').getByRole('textbox', { name: 'ช่วยตรวจงาน (ชม./สัปดาห์)', exact: true })).toHaveValue('1.5');
 await expect(page.locator('#request-person-2')).toContainText('ยังไม่ได้เลือก TA');
 // Counts are editable above and below the recommendation, without silently removing entries.
 await page.locator('#request-person-count').fill('6'); await page.locator('#request-person-count').press('Tab');
 await expect(nav.getByRole('button')).toHaveCount(6);
 await page.locator('#request-person-count').fill('3'); await page.locator('#request-person-count').press('Tab');
 await expect(page.getByRole('button', { name: 'ยืนยันนำออก', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
 await expect(nav.getByRole('button')).toHaveCount(6);
 await page.locator('#request-person-count').fill('3'); await page.locator('#request-person-count').press('Tab');
 await page.getByRole('button', { name: 'ยืนยันนำออก', exact: true }).click();
 await expect(nav.getByRole('button')).toHaveCount(3);
 const saved = page.waitForResponse(r => r.url().endsWith('/request-draft') && r.request().method() === 'PUT');
 await saved;
 await page.reload();
 await expect(nav.getByRole('button')).toHaveCount(3);
 await nav.getByRole('button').first().click();
 await expect(grading).toHaveValue('1.5');
 // Using a plan previews replacement; undo restores the lecturer's previous draft.
 await page.getByRole('button', { name: 'นำแผนนี้ไปปรับใช้', exact: true }).first().click();
 await expect(nav.getByRole('button')).toHaveCount(3);
 await page.getByRole('button', { name: 'ใช้แผนและเปิดหน้าคนแรก', exact: true }).click();
 await expect(nav.getByRole('button')).toHaveCount(4);
 await expect(page.locator('#request-person-0')).toContainText('ยังไม่ได้เลือก TA');
 await page.getByRole('button', { name: 'คืนรายการก่อนใช้แผน', exact: true }).click();
 await expect(nav.getByRole('button')).toHaveCount(3);
 await expect(grading).toHaveValue('1.5');
 // A partial clash on an inactive page keeps its free lab requestable.
 await page.close();
 await seed();
 const conflict = await newPage();
 await conflict.route('**/api/v1/ta-requests/preview-conflicts?*', async route => {
  if (new URL(route.request().url()).searchParams.get('ta_id') !== 'ta-2') return route.continue();
  await route.fulfill({ json: { conflicts: [{ section_id: 'sec-2', messages: ['Lecture overlaps an approved course'], blocked_kinds: ['lecture'], cross_conflict: true, available_hours: {lecture: 0, lab: 2} }] } });
 });
 await conflict.goto(`${origin}/dev/request-preview`);
 await expect(conflict.locator('button').filter({ hasText: /^ส่งคำขอ \(/ })).toBeEnabled();
 await conflict.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button').nth(1).click();
 await expect(conflict.getByText('ส่งคำขอได้เฉพาะคาบที่ไม่ชน และงานตรวจ/งานอื่นนอกคาบ', {exact: true})).toBeVisible();
 await conflict.close();
 // Exercise the real submit payload against the playground, not a real request.
 await seed();
 const submitPage = await newPage(); submitPage.on('pageerror', e => errors.push(e.message));
 await submitPage.goto(`${origin}/dev/request-preview`);
 await expect(submitPage.locator('button').filter({ hasText: /^ส่งคำขอ \(2 คน\)$/ })).toBeEnabled();
 await submitPage.locator('button').filter({ hasText: /^ส่งคำขอ \(2 คน\)$/ }).click();
 const request = submitPage.waitForRequest(r => new URL(r.url()).pathname === '/api/v1/ta-requests' && r.method() === 'POST');
 await submitPage.getByRole('button', { name: 'ยืนยันส่งคำขอ', exact: true }).click();
 const body = (await request).postDataJSON();
 assert.equal(body.assignments.length, 2); assert.equal(body.assignments[0].section_workloads[0].workload.check_work_hrs, 1);
 await expect(submitPage.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' })).toHaveCount(0);
 await submitPage.close(); await seed();
 const mobile = await newPage({ viewport: { width: 390, height: 844 } }); mobile.on('pageerror', e => errors.push(e.message));
 await mobile.goto(`${origin}/dev/request-preview`);
 await expect(mobile.getByRole('navigation', { name: 'เลือกหน้าภาระงาน TA' }).getByRole('button')).toHaveCount(2);
 assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
 await mobile.screenshot({ path: '/tmp/request-notebook-mobile.png', fullPage: true });
 assert.deepEqual(errors, []);
 console.log('PASS: individual pages, copy, editable counts, removal confirmation, draft reload, plan apply/undo, inactive conflicts, submission payload, mobile layout');
 await mobile.close();
} finally { await browser.close(); }
