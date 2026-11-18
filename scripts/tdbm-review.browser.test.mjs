import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';

const expect = baseExpect.configure({ timeout: 15000 });
const port = Number(process.env.TDBM_TEST_PORT || 3327);
const baseUrl = process.env.TDBM_TEST_BASE_URL || `http://localhost:${port}`;
const route = `tdbm-review-regression-${process.pid}`, dir = path.resolve('app', route);
const dates = ['2026-11-10', '2026-11-17', '2026-11-24'];
const options = section => dates.flatMap(date => ['lecture', 'lab'].map(kind => ({
  section_id: section, original_date: date, holiday_name: 'วันหยุดทดสอบ', kind,
  start_time: kind === 'lecture' ? '10:00' : '13:00', end_time: kind === 'lecture' ? '12:00' : '15:00', blocked: false,
})));
function fixtures() {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    extra_class_id: 100 + i, class_date: '2026-11-28', start_time: `${String(8 + i % 6).padStart(2, '0')}:00`, end_time: `${String(10 + i % 6).padStart(2, '0')}:00`,
    duration_minutes: 120, matched_course_code: 'CP413110', matched_course_name: 'SOFTWARE ENGINEERING FOR ARTIFICIAL INTELLIGENCE',
    matched_sec_no: i < 6 ? '1' : '2', matched_section_id: i < 6 ? 'sec-1' : 'sec-2',
    resolution_reason: 'ต้องเลือกคาบวันหยุดเดิม เนื่องจาก TDBM ไม่ระบุว่าชดเชยแทนคาบใด',
    match_options: options(i < 6 ? 'sec-1' : 'sec-2'), opt_status: 'D', synced_at: '2026-11-18T20:42:00',
  }));
  rows.push({ ...rows[0], extra_class_id: 200 }); // alias, same sitting
  rows.push({ ...rows[0], extra_class_id: 201, matched_section_id: undefined, matched_sec_no: undefined, match_options: [], resolution_reason: 'ยังจับคู่วิชาและกลุ่มเรียนไม่ได้ กรุณาตรวจสอบข้อมูลวิชาและกลุ่ม' });
  return rows;
}

await mkdir(dir);
await writeFile(path.join(dir, 'page.tsx'), `"use client";import {Suspense} from 'react';import Page from '../staff/tdbm/page';import {TermProvider} from '../staff/TermContext';export default function Test(){return <Suspense><TermProvider><main className="p-4"><Page/></main></TermProvider></Suspense>}`);
const server = process.env.TDBM_TEST_BASE_URL ? undefined : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', String(port)], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', browser;
server?.stdout.on('data', d => log += d);
server?.stderr.on('data', d => log += d);
try {
  for (let i = 0; ; i++) {
    if ((server && server.exitCode !== null) || i > 120) throw Error(log);
    try { if ((await fetch(`${baseUrl}/${route}`, { signal: AbortSignal.timeout(4000) })).ok) break; } catch {}
    await pause(500);
  }
  browser = await chromium.launch(process.env.TDBM_CHROME_CHANNEL ? { channel: process.env.TDBM_CHROME_CHANNEL } : {}).catch(e => {
    if (!process.env.TDBM_CHROME_CHANNEL && e.message.includes("Executable doesn't exist")) return chromium.launch({ channel: 'chrome' });
    throw e;
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport }), errors = [], requests = [];
    let rows = fixtures(), fail = true;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/v1/terms', r => r.fulfill({ json: [{ id: 'term-1', academic_year: 2569, semester: 2, starts_on: '2026-11-01', ends_on: '2027-03-31', is_active: true }] }));
    await page.route('**/api/v1/holidays', r => r.fulfill({ json: [] }));
    await page.route('**/api/v1/tdbm/sync-log**', r => r.fulfill({ json: [] }));
    await page.route('**/api/v1/tdbm/extra-teachings**', r => r.fulfill({ json: rows }));
    await page.route('**/api/v1/tdbm/match-makeups', r => {
      const body = r.request().postDataJSON(); requests.push(body);
      if (fail) return r.fulfill({ status: 409, json: { error: 'คาบนี้ถูกจับคู่แล้ว กรุณาโหลดข้อมูลใหม่' } });
      rows = rows.map(row => {
        const match = body.items.find(item => item.extra_class_id === row.extra_class_id);
        return match ? { ...row, original_holiday_date: match.original_date, original_kind: match.kind, match_method: 'manual', match_options: [] } : row;
      });
      return r.fulfill({ json: { matched: body.items.length } });
    });
    await page.goto(`${baseUrl}/${route}`);
    const review = page.getByRole('region', { name: /จับคู่คาบวันหยุดที่ยังค้าง/ });
    await expect(review.getByRole('heading')).toContainText('(13 รายการ)');
    const select = id => review.getByRole('combobox', { name: `คาบวันหยุดเดิมของรายการ ${id}`, exact: true }).filter({ visible: true });
    await select(100).selectOption('sec-1/2026-11-24/lecture');
    // A second TDBM entry cannot select a period already selected elsewhere.
    await expect(select(101).locator('option[value="sec-1/2026-11-24/lecture"]')).toBeDisabled();
    await select(101).selectOption('sec-1/2026-11-10/lab');
    await page.screenshot({ path: `/tmp/tdbm-review-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Search retains choices from rows outside the current page/filter.
    await review.getByRole('searchbox').fill('2');
    await select(110).selectOption('sec-2/2026-11-17/lecture');
    const save = review.getByRole('button', { name: 'บันทึกการจับคู่ 3 รายการ', exact: true });
    await save.click();
    await expect(review.getByText('คาบนี้ถูกจับคู่แล้ว กรุณาโหลดข้อมูลใหม่', { exact: true })).toBeVisible();
    expect(requests[0]).toEqual({ academic_year: 2569, semester: 2, items: [
      { extra_class_id: 100, original_date: '2026-11-24', kind: 'lecture' },
      { extra_class_id: 101, original_date: '2026-11-10', kind: 'lab' },
      { extra_class_id: 110, original_date: '2026-11-17', kind: 'lecture' },
    ] });
    // Conflict preserves selections so staff can correct or retry.
    await expect(save).toBeEnabled();
    fail = false; await save.click();
    await expect(review.getByRole('status')).toHaveText('บันทึกการจับคู่แล้ว 3 รายการ');
    await expect(review.getByRole('button', { name: 'บันทึกการจับคู่ 0 รายการ', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log('TDBM review: desktop/mobile, alias grouping, duplicate prevention, filtered bulk selections, conflict/retry and saved state passed.');
} finally {
  await browser?.close(); server?.kill('SIGTERM');
  await Promise.all([dir, path.resolve('.next/dev/types/app', route), path.resolve('.next/types/app', route)]
    .map(target => rm(target, { recursive: true, force: true })));
}
