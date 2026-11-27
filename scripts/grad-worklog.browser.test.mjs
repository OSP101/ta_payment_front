import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({timeout: 20000});
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({channel:'chrome'});
try {
 for (const level of ['master','phd','undergrad']) {
  for (const mobile of [false,true]) {
   const grad = level !== 'undergrad';
   const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}});
   const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/v1/**',async route=>{
    const path = new URL(route.request().url()).pathname.replace('/api/v1','');
    let body=[];
    if(path==='/me') body={id:'ta-test',roles:['ta'],first_name:'ทดสอบ',last_name:'บัณฑิตศึกษา'};
    if(path==='/teaching-courses/worklog-playground') body={id:'worklog-playground',code:'CP363761',name_th:'SEMINAR',num_students:30,starts_on:'2026-11-01',ends_on:'2027-03-14',sections:[{id:'sec-1',sec_no:'1',track:'regular',schedules:[]}]};
    if(path==='/me/assignments') body=[{id:'asg-1',teaching_course_id:'worklog-playground',section_id:'sec-1',sec_no:'1',track:'regular',level,reimburse_scope:'lecture',has_schedule:false,weekly_cap_lecture:2,weekly_cap_lab:0,weekly_cap_review:0,weekly_cap_other:8,weekly_cap_prep:grad?2:0,weekly_lecture_lab_shared:grad,weekly_caps_set:true,term_hour_ceiling:204,hours_logged:0,hours_by_activity:{},unsent_count:0,submittable_count:0,months_in_review:[]}];
    if(path.endsWith('/review-schedules')) body={items:[],declared_hours_per_week:grad?{review:0,prep:2,grad_other:8}:{review:0,other_lecture:8,other_lab:0},used_hours_per_week:{}};
    if(path.endsWith('/holiday-impacts')) body={impacts:[]};
    if(path.endsWith('/budget-settlement')) body={};
    if(path.endsWith('/pay-rate')) body={rate_per_hour:50};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(`${origin}/dev/worklog-preview`,{timeout:120000});
   if(grad) {
    await expect(page.getByText('ตารางเตรียมการสอนของคุณ',{exact:true})).toBeVisible();
    await expect(page.getByText('ตารางงานอื่น ๆ ของคุณ',{exact:true})).toBeVisible();
    await expect(page.getByText('ตารางงานอื่น ๆ (บรรยาย) ของคุณ',{exact:true})).toHaveCount(0);
    // Duties can generate without a section class timetable.
    await expect(page.getByRole('button',{name:'สร้างอัตโนมัติ',exact:true})).toBeEnabled();
   } else {
    await expect(page.getByText('ตารางงานอื่น ๆ (บรรยาย) ของคุณ',{exact:true})).toBeVisible();
    await expect(page.getByText('ตารางเตรียมการสอนของคุณ',{exact:true})).toHaveCount(0);
   }
   await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();
   const dialog=page.getByRole('dialog');
   const activity=dialog.locator('select').first();
   assert.deepEqual(await activity.locator('option').evaluateAll(es=>es.map(e=>e.textContent)),grad?['ช่วยสอน (บรรยาย)','เตรียมการสอน','อื่น ๆ']:['บรรยาย','ตรวจงาน','ชดเชย','อื่น ๆ']);
   if(grad) {
    await activity.selectOption('prep');
    await expect(dialog).toContainText('2.0');
    await activity.selectOption('other');
    await expect(dialog.getByText('ประเภทกิจกรรมหลัก',{exact:true})).toHaveCount(0);
    await expect(dialog).toContainText('8.0');
   } else {
    await activity.selectOption('other');
    await expect(dialog.getByText('ประเภทกิจกรรมหลัก',{exact:true})).toBeVisible();
   }
   await page.screenshot({animations:'disabled',path:`/tmp/grad-worklog-${level}-${mobile?'mobile':'desktop'}.png`});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }
 console.log('PASS: master/phd/undergrad desktop and mobile; distinct budgets, activity options and duty cards');
} finally {await browser.close();}
