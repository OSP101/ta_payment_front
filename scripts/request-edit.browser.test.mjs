// Run only against the isolated request-form playground.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft, workload, candidates } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
const api = process.env.REQUEST_FORM_TEST_API || 'http://127.0.0.1:3331';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));
assert.equal((await (await fetch(`${api}/api/health`)).json()).playground,true);
const draftURL = `${api}/api/v1/teaching-courses/request-playground/request-draft`;
await mkdir('/tmp/ta-staff-fixes',{recursive:true});
const browser = await chromium.launch({channel:'chrome'});
try {
 for (const [name,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]) {
  const draft=initialDraft();
  await fetch(draftURL,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground','1'));
  let saved=false;let fail=true;let payload;
  const row={id:'request-edit',status:'approved',ta_names:'ผู้ช่วยสอน ตัวอย่าง 1',ta_count:1,teaching_course_id:'request-playground',submitted_at:new Date().toISOString(),can_cancel:true};
  await page.route('**/api/v1/ta-requests',route=>route.fulfill({json:[row,{...row,id:'request-issued',ta_names:'ออกใบแต่งตั้งแล้ว',can_cancel:false}]}));
  await page.route('**/api/v1/ta-requests/request-edit/edit',route=>route.fulfill({json:{teaching_course_id:'request-playground',reimburse_scope:'both',assignments:[{ta_id:'ta-1',level:'undergrad',section_ids:['sec-1'],section_workloads:[{section_id:'sec-1',workload:workload({check_work_hrs:1,attendance_hrs:1,lab_hrs:2})}]}]}}));
  await page.route('**/api/v1/ta-requests/request-edit',async route=>{
   assert.equal(route.request().method(),'PUT');payload=route.request().postDataJSON();
   if(fail) return route.fulfill({status:409,json:{error:'ออกใบแต่งตั้งให้ TA คนนี้แล้ว'}});
   saved=true;return route.fulfill({json:{id:'replacement-request',status:'approved'}});
  });
  await page.route('**/api/v1/ta-requests/candidates?*',async route=>{
   const url=new URL(route.request().url());const ids=url.searchParams.get("ids")?.split(",");const data={items:candidates.filter(ta=>!ids || ids.includes(ta.id)),has_more:false};
   data.items=data.items.map(ta=>ta.id==='ta-1'?{...ta,existing_request_id:'request-edit',held_section_ids:['sec-1'],already_in_course:true,at_quota:true}:ta);
   await route.fulfill({json:data});
  });
  await page.goto(`${origin}/dev/request-preview`,{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.getByRole('button',{name:'แก้ไขคำขอ',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'แก้ไขคำขอ',exact:true}).click();
  const grading=page.locator('#request-person-0').getByRole('textbox',{name:'ช่วยตรวจงาน (ชม./สัปดาห์)',exact:true});
  await expect(grading).toHaveValue('1');await grading.fill('1.5');await grading.press('Tab');
  await expect(page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true})).toBeEnabled();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'horizontal overflow');
  await page.screenshot({path:`/tmp/ta-staff-fixes/request-edit-${name}.png`,fullPage:true});
  await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
  await page.getByRole('button',{name:'ยืนยันบันทึกการแก้ไข',exact:true}).click();
  await expect(page.getByText('ออกใบแต่งตั้งให้ TA คนนี้แล้ว',{exact:true}).first()).toBeVisible();
  await expect(grading).toHaveValue('1.5');assert.equal(saved,false);
  fail=false;
  await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
  await page.getByRole('button',{name:'ยืนยันบันทึกการแก้ไข',exact:true}).click();
  await expect(page.getByRole('button',{name:'ออกจากการแก้ไข',exact:true})).toHaveCount(0);
  assert.equal(saved,true);assert.equal(payload.assignments.length,1);
  assert.equal(payload.assignments[0].section_workloads[0].workload.check_work_hrs,1.5);
  assert.deepEqual((await (await fetch(draftURL)).json()).payload,draft,'editing must preserve the separate saved draft');
  assert.deepEqual(errors,[]);await page.close();
  console.log(`${name}: edit prefill, issued lock, error recovery, save payload and draft preservation passed`);
 }
} finally {await browser.close();}
