import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft, workload, lecturer, candidates } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const out = process.env.TA_CONFLICT_TEST_OUTPUT || '/tmp/ta-conflict-fix-20261127';
await mkdir(out, { recursive: true });
const sections = [1, 2, 3].map(n => ({ id: `sec-${n}`, sec_no: String(n), track: n === 3 ? 'special' : 'regular', schedules: [
  { kind: 'lab', day_of_week: 2, start_time: n === 1 ? '09:00' : '13:00', end_time: n === 1 ? '12:00' : '16:00' },
  { kind: 'lecture', day_of_week: 2, start_time: '16:00', end_time: '18:00' },
] }));
const slots = sections.flatMap(sec => sec.schedules.map(s => ({ ...s, source: 'requested', course_id: 'request-playground', course_code: 'CP372012', course_name: 'DIGITAL PROCESSING OF SATELLITE DATA', section_id: sec.id, section_no: sec.sec_no, state: '' })));
const existing = { source: 'teaching', course_id: 'approved-course', course_code: 'CP373003', course_name: 'PRINCIPLES OF CARTOGRAPHY', section_id: 'approved-sec', section_no: '1', kind: 'lab', day_of_week: 2, start_time: '17:00', end_time: '20:00', state: 'active' };
const conflicts = sections.map(sec => ({ section_id: sec.id, messages: ['บรรยาย อังคาร 16:00–18:00 ชนกับ CP373003 ปฏิบัติการ 17:00–20:00 ช่วง 17:00–18:00'], cross_conflict: true, blocked_kinds: ['lecture'], available_hours: { lecture: 0, lab: 3 } }));
const schedule = { ta_name: 'นภาดา พรมนิล', has_schedule: true, slots: [...slots, existing, { ...existing, kind: 'lecture', day_of_week: 3, start_time: '17:00', end_time: '19:00' }], conflicts: slots.filter(s => s.kind === 'lecture').map(requested => ({ requested, existing, blocking: true, overlap_start: '17:00', overlap_end: '18:00' })) };
const browser = await chromium.launch({ channel: 'chrome' });
try {
 for (const mobile of [false, true]) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground', '1'));
  const draft = initialDraft(); draft.assignments = [{ ...draft.assignments[0], section_workloads: { 'sec-1': workload({ check_work_hrs: 2, attendance_hrs: 1, ug_other_hrs: 2, ug_other_desc: 'เตรียมแลบ', lab_hrs: 3 }) } }];
  await page.route('**/teaching-courses/request-playground/request-draft', route => route.fulfill({ json: { payload: draft, updated_at: new Date().toISOString() } }));
  await page.route('**/teaching-courses/request-playground', route => route.fulfill({ json: { id: 'request-playground', code: 'CP372012', name_th: 'DIGITAL PROCESSING OF SATELLITE DATA', term_id: 'term-playground', lecture_hrs: 2, lab_hrs: 3, has_missing_schedule: false, sections, lecturers: [{ ...lecturer, is_primary: true }] } }));
  await page.route('**/ta-requests/candidates?*', route => route.fulfill({ json: { items: candidates.map(x => x.id === 'ta-1' ? { ...x, first_name: 'นภาดา', last_name: 'พรมนิล', approved_course_count: 1 } : x), has_more: false } }));
  await page.route('**/ta-requests/preview-conflicts?*', route => route.fulfill({ json: { conflicts, ...(new URL(route.request().url()).searchParams.has('include_schedule') ? { schedule } : {}) } }));
  await page.goto(`${origin}/dev/request-preview`, { timeout: 120000 });
  await expect(page.getByText('ส่งคำขอได้เฉพาะคาบที่ไม่ชน และงานตรวจ/งานอื่นนอกคาบ', { exact: true })).toBeVisible();
  const send = page.getByRole('button', { name: 'ส่งคำขอ (1 คน)', exact: true });
  await expect(send).toBeEnabled();
  for (const n of [1, 2, 3]) await expect(page.getByRole('checkbox', { name: new RegExp(`^Sec ${n} -`) })).toBeEnabled();
  await page.getByRole('button', { name: 'ดูรายละเอียดเวลาชนและตาราง TA', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('ไม่ชน 3 คาบ · ชน 3 คาบ', { exact: true })).toBeVisible();
  const availability = dialog.getByRole('table').first();
  await expect(availability.getByRole('row')).toHaveCount(7);
  await expect(availability.getByText('ไม่ชน · ส่งคำขอได้', { exact: true })).toHaveCount(3);
  await expect(availability.getByText('ชน · ตัดคาบนี้ทั้งคาบ', { exact: true })).toHaveCount(3);
  await expect(availability.getByText('ทับเฉพาะ 17:00–18:00', { exact: true })).toHaveCount(3);
  await expect(availability.getByText('ตัดคาบ 16:00–18:00', { exact: true })).toHaveCount(3);
  const timetable = dialog.getByRole('region', { name: 'ตารางเรียนรายสัปดาห์ เลื่อนแนวนอนเพื่อดูทุกช่วงเวลา', exact: true });
  await expect(timetable).toBeVisible();
  await expect(timetable.getByRole('article')).toHaveCount(8);
  const lecture = timetable.getByRole('article', {name: /วิชาที่กำลังขอ · CP372012 .*Sec 1 · บรรยาย/});
  const lab = timetable.getByRole('article', {name: /ช่วยสอน · อนุมัติแล้ว · CP373003 .*ปฏิบัติการ/});
  const overlap = lecture.getByLabel('ทับเฉพาะ 17:00–18:00');
  const geometry = await lecture.evaluate((el) => ({left:parseFloat(el.style.left),width:parseFloat(el.style.width),top:parseFloat(el.style.top)}));
  const otherGeometry = await lab.evaluate((el) => ({left:parseFloat(el.style.left),top:parseFloat(el.style.top)}));
  assert.ok(otherGeometry.left > geometry.left && otherGeometry.left < geometry.left + geometry.width);
  assert.notEqual(otherGeometry.top, geometry.top, 'simultaneous courses need separate lanes');
  assert.equal(await overlap.evaluate(el => parseFloat(el.style.left)), 50, 'only 17:00–18:00 should be red inside 16:00–18:00');
  await dialog.getByLabel('Section ที่ต้องการตรวจ').selectOption('sec-1');
  await expect(timetable.getByRole('article')).toHaveCount(4);
  await timetable.scrollIntoViewIfNeeded();
  if (mobile) await timetable.evaluate(el => { el.scrollLeft = 610; });
  await page.screenshot({ path: `${out}/napada-timetable-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' });
  assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false, 'dialog overflows viewport');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'page overflows viewport');
  await dialog.getByRole('button', { name: 'ปิด', exact: true }).last().click();
  await send.click();
  const request = page.waitForRequest(r => new URL(r.url()).pathname === '/api/v1/ta-requests' && r.method() === 'POST');
  await page.getByRole('button', { name: 'ยืนยันส่งคำขอ', exact: true }).click();
  const body = (await request).postDataJSON();
  const w = body.assignments[0].section_workloads[0].workload;
  assert.equal(w.attendance_hrs, 0, 'excluded lecture remains in payload');
  assert.equal(w.lab_hrs, 3); assert.equal(w.check_work_hrs, 2); assert.equal(w.ug_other_hrs, 2);
  assert.deepEqual(errors, []);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
 }
 console.log(`PASS: CP373003 approved / CP372012 partial overlap, free sections selectable, in-class hours trimmed, off-slot hours preserved, submit payload, desktop and mobile tables. Screenshots: ${out}`);
} finally { await browser.close(); }
