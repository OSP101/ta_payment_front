import { chromium, expect as baseExpect } from '@playwright/test';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import path from 'node:path';
const expect=baseExpect.configure({timeout:15000});
const port=3341,origin=`http://localhost:${port}`,route=`manual-makeup-regression-${process.pid}`,dir=path.resolve('app',route);
await mkdir(dir);
await writeFile(path.join(dir,'page.tsx'),`"use client";import {Suspense} from 'react';import Page from '../ta/courses/[tcId]/worklog/page';const params=Promise.resolve({tcId:'manual-test'});export default function Test(){return <Suspense><main className="p-4"><Page params={params}/></main></Suspense>}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
async function setDate(dialog,iso){
 const [year,month,day]=iso.split('-');
 for(const [part,value] of [['day',day],['month',month],['year',year]]){
  const segment=dialog.locator(`[data-type="${part}"]`);
  await segment.click();await segment.press('ControlOrMeta+A');await segment.pressSequentially(value);
 }
 await dialog.locator('[data-type="year"]').press('Tab');
}
try{
 for(let i=0;;i++){if(server.exitCode!==null||i>120)throw Error(log);try{if((await fetch(`${origin}/${route}`,{signal:AbortSignal.timeout(4000)})).ok)break}catch{}await pause(500)}
 browser=await chromium.launch({channel:'chrome'});
 for(const mobile of [false,true])for(const scenario of ['moved','same_day','missing']){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  const target=scenario==='same_day'?'2026-12-16':'2026-12-19';
  await page.route('**/api/v1/**',async r=>{
   const url=new URL(r.request().url()),p=url.pathname.replace('/api/v1','');let body=[];
   if(p==='/me')body={id:'manual-ta',roles:['ta'],first_name:'TA',last_name:'Test'};
   if(p==='/teaching-courses/manual-test')body={id:'manual-test',code:'CP412702',name_th:'SEMINAR',num_students:30,starts_on:'2026-11-16',ends_on:'2027-03-14',sections:[{id:'sec-1',sec_no:'1',track:'regular',schedules:[{id:'schedule-1',kind:'lecture',day_of_week:3,start_time:'09:00:00',end_time:'12:00:00'}]}]};
   if(p==='/me/assignments')body=[{id:'asg-1',teaching_course_id:'manual-test',section_id:'sec-1',sec_no:'1',track:'regular',level:'master',reimburse_scope:'lecture',has_schedule:true,weekly_cap_lecture:3,weekly_cap_lab:0,weekly_cap_review:0,weekly_cap_other:0,weekly_cap_prep:0,weekly_lecture_lab_shared:true,weekly_caps_set:true,term_hour_ceiling:90,hours_logged:0,hours_by_activity:{},unsent_count:0,submittable_count:0,months_in_review:[],makeup_dates:scenario==='missing'?[]:[target]}];
   if(p.endsWith('/holiday-impacts'))body={impacts:[{original_date:'2026-12-16',holiday_name_th:'วันหยุดทดสอบ',affected_sections:[{section_id:'sec-1',sec_no:'1',kind:'lecture',start_time:'09:00',end_time:'12:00',makeup:scenario==='missing'?null:{id:'mk-1',makeup_date:target,start_time:'13:00',end_time:'16:00'}}]}],unresolved_count:scenario==='missing'?1:0};
   if(p.endsWith('/review-schedules'))body={items:[],declared_hours_per_week:{review:0,prep:0,grad_other:0},used_hours_per_week:{}};
   if(p.endsWith('/budget-settlement'))body={};
   if(p.endsWith('/pay-rate'))body={rate_per_hour:50};
   if(p==='/assignments/asg-1/worklog'&&r.request().method()==='PUT'){writes.push(r.request().postDataJSON());body={id:'saved-row'}}
   await r.fulfill({json:body});
  });
  await page.goto(`${origin}/${route}`);
  await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'เพิ่มรายการบันทึกเวลา'});
  await setDate(dialog,'2026-12-16');
  if(scenario==='missing'){
   await expect(dialog.getByText('วันหยุดนี้ยังไม่มีข้อมูลชดเชย จึงลงเวลาเบิกคาบนี้ไม่ได้',{exact:true})).toBeVisible();
   await expect(dialog.getByRole('button',{name:'บันทึกรายการ',exact:true})).toBeDisabled();
   expect(writes).toHaveLength(0);
  }else{
   const mapping=dialog.getByRole('group',{name:'วันเรียนเดิมและวันชดเชยจาก TDBM'});
   await expect(mapping).toBeVisible();
   await expect(mapping.getByText('13:00–16:00',{exact:true})).toBeVisible();
   await expect(mapping.locator('svg.lucide-arrow-down')).toBeVisible();
   if(scenario==='same_day')await expect(mapping.getByText('อาจารย์กำหนดชดเชยในวันหยุดนี้ ระบบอนุญาตให้ลงเวลาตามช่วงชดเชยได้')).toBeVisible();
   await expect(dialog.getByText(/คาบนี้ถูกย้ายไปวันชดเชย/)).toHaveCount(0);
   await page.screenshot({path:`/tmp/manual-makeup-${scenario}-${mobile?'mobile':'desktop'}.png`,fullPage:true});
   await dialog.getByRole('button',{name:/บันทึกเป็นวันที่/}).click();
   await expect.poll(()=>writes.length).toBe(1);
   expect(writes[0]).toMatchObject({work_date:target,original_work_date:'2026-12-16',makeup_id:'mk-1',start_time:'13:00',end_time:'16:00',activity:'lecture',hours:3});
  }
  expect(errors).toEqual([]);await page.close();
 }
 console.log('PASS: manual holiday redirect, same-day replacement, correct submitted payload, missing-makeup block; desktop/mobile');
}finally{await browser?.close();server.kill('SIGTERM');await Promise.all([dir,path.resolve('.next/dev/types/app',route),path.resolve('.next/types/app',route)].map(p=>rm(p,{recursive:true,force:true})))}
