// Run against the isolated request-form playground only.
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { workload } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 15000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
const api = process.env.REQUEST_FORM_TEST_API || 'http://127.0.0.1:3331';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(api).hostname));
assert.equal((await (await fetch(`${api}/api/health`)).json()).playground, true);
const explanation = 'ชั่วโมงรวมสำหรับตรวจเกณฑ์ภาระงานจะบวกทุก Sec ตามที่กรอก ส่วนค่าตอบแทนของคาบที่สอนพร้อมกันนับเพียงครั้งเดียว เพราะเป็นการทำงานในช่วงเวลาเดียวกัน';
const seed = async (hours = 5) => {
 const w = workload({ help_teach_hrs: hours });
 await fetch(`${api}/api/v1/teaching-courses/request-playground/request-draft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, scope: 'both', assignments: [{ ta_id: 'ta-11', level: 'master', section_ids: ['sec-1', 'sec-2'], section_workloads: { 'sec-1': w, 'sec-2': w } }] }) });
};
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
 for (const [name, viewport] of [['desktop', {width:1440,height:1050}], ['mobile', {width:390,height:844}]]) {
  await seed();
  const page = await browser.newPage({ viewport });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
  await page.goto(`${origin}/dev/request-preview`, {waitUntil:"domcontentloaded",timeout:60000});
  const total = page.locator('[data-tour="req-total"]');
  await expect(total).toContainText('10.0');
  await expect(page.getByText(explanation, {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'ส่งคำขอ (1 คน)',exact:true})).toBeEnabled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await total.scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/request-workload-policy-${name}.png`});
  if (name === 'desktop') {
   await page.getByRole('button', {name:'ส่งคำขอ (1 คน)',exact:true}).click();
   const pending = page.waitForRequest(r => new URL(r.url()).pathname === '/api/v1/ta-requests' && r.method()==='POST');
   await page.getByRole('button', {name:'ยืนยันส่งคำขอ',exact:true}).click();
   const body = (await pending).postDataJSON();
   assert.equal(body.assignments[0].section_workloads.length,2);
   for (const row of body.assignments[0].section_workloads) assert.equal(row.workload.help_teach_hrs + row.workload.grade_hrs + row.workload.prep_hrs,5);
  }
  await page.close();
 }
 for (const [hours, allowed] of [[0, true], [0.5, true], [4.5, true], [6, true], [6.5, false]]) {
  await seed(hours);
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
  await page.goto(`${origin}/dev/request-preview`, {waitUntil:"domcontentloaded",timeout:60000});
  await expect(page.locator('[data-tour="req-total"]')).toContainText((hours * 2).toFixed(1));
  const send = page.getByRole('button', {name:'ส่งคำขอ (1 คน)',exact:true});
  if (allowed) await expect(send).toBeEnabled();
  else await expect(send).toBeDisabled();
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: co-taught 5+5=10, below-10 accepted, explanation, raw section payload, desktop and mobile');
} finally { await browser.close(); }
