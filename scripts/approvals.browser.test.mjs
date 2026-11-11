import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
const port=Number(process.env.APPROVALS_TEST_PORT || 3321), route=`approvals-regression-${process.pid}`, dir=path.resolve('app',route);
const term={id:'current',academic_year:2569,semester:1,is_active:true}, oldTerm={id:'old',academic_year:2568,semester:2};
const row=(id,status,extra={})=>({id,status,course_code:`CP${id}`,course_name:`Course ${id}`,lecturer_name:'Lecturer',ta_names:`TA ${id}`,ta_count:1,term_id:term.id,academic_year:term.academic_year,semester:1,decision_checks:[],...extra});
const rows=['approved','submitted','rejected','cancelled','draft'].map(s=>row(s,s));
rows.push(row('waiting-other','submitted',{ta_names:'Other person'}),row('waiting-old','submitted',{term_id:oldTerm.id,academic_year:2568,semester:2}));
await mkdir(dir);
await writeFile(path.join(dir,'page.tsx'),`"use client";import {Suspense} from 'react';import Approvals from '../staff/approvals/page';import {TermProvider} from '../staff/TermContext';export default function Test(){return <Suspense><TermProvider><main className="p-4"><Approvals/></main></TermProvider></Suspense>}`);
let log='',browser;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try{
 for(let i=0;;i++){
  if(server.exitCode!==null || i>120)throw Error(log);
  try{if((await fetch(`http://localhost:${port}/${route}`,{signal:AbortSignal.timeout(4000)})).ok)break;}catch{}
  await pause(500);
 }
 browser=await chromium.launch(process.env.APPROVALS_CHROME_CHANNEL ? { channel: process.env.APPROVALS_CHROME_CHANNEL } : {});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[],sent=[];let failure=false,delayed;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/auth/heartbeat',r=>r.fulfill({json:{ok:true}}));
  await page.route('**/api/v1/ta-requests/*',r=>{const id=r.request().url().split('/').pop();return r.fulfill({json:{...rows.find(x=>x.id===id),assignments:[],counts:[],reimburse_scope:'both'}})});
  await page.route('**/api/v1/terms',r=>r.fulfill({json:[term,oldTerm]}));
  await page.route('**/api/v1/ta-requests',r=>r.fulfill({json:rows}));
  await page.route('**/api/v1/exports/appointment-order/remind-timetable',async r=>{
   sent.push(r.request().postDataJSON());if(delayed)await delayed;
   await r.fulfill(failure?{status:500,json:{error:'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่'}}:{json:{sent:['TA submitted'],skipped:[{name:'Other person',reason:'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่'}]}});
  });
  await page.goto(`http://localhost:${port}/${route}`);
  const list=page.locator('[data-tour="approvals-list"]');await expect(list).toBeVisible();
  const select=async(label,option)=>{await page.getByRole('button',{name:new RegExp(label)}).click();await page.getByRole('option',{name:option,exact:true}).click();};
  const remind=page.getByRole('button',{name:/ส่งอีเมลเตือนคำขอรอผล/});
  for(const [label,value]of [['สำเร็จ (อนุมัติ)','approved'],['ปฏิเสธ','rejected'],['ยกเลิก','cancelled'],['ฉบับร่าง','draft']]){
   await select('สถานะคำขอ',label);await expect(list).toContainText(`CP${value}`);await expect(list).not.toContainText('CPsubmitted');await expect(remind).toBeDisabled();
  }
  await select('สถานะคำขอ','รอผล (รอตารางเรียน)');await expect(list).toContainText('CPsubmitted');await expect(list).toContainText('CPwaiting-other');await expect(list).not.toContainText('CPapproved');
  const search=page.getByRole('searchbox');await search.fill('TA submitted');await expect(list).not.toContainText('CPwaiting-other');
  let release;delayed=new Promise(r=>release=r);await remind.click();await expect(remind).toBeDisabled();release();delayed=null;
  await expect(page.getByText('ส่งอีเมลเตือนแล้ว 1 รายการ',{exact:true})).toBeVisible();expect(sent).toEqual([{term_id:term.id,request_ids:['submitted']}]);
  await page.getByText('ข้าม 1 รายการ (ดูเหตุผล)',{exact:true}).click();await expect(page.getByText('Other person: ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่',{exact:true})).toBeVisible();
  failure=true;await remind.click();await expect(page.locator('p[role="alert"]')).toContainText('ส่งอีเมลเตือนบางรายการไม่สำเร็จ');
  await search.fill('no-match');await expect(page.getByText('ไม่พบคำขอตามเงื่อนไขที่เลือก')).toBeVisible();await expect(remind).toBeDisabled();
  await search.fill('');await select('ปีการศึกษา','ทุกปี');await select('ภาคเรียน','ทุกภาค');await expect(list).toContainText('CPwaiting-old');
  failure=false;sent.length=0;await remind.click();await expect(remind).toBeEnabled();expect(sent).toEqual([{term_id:term.id,request_ids:['submitted','waiting-other']},{term_id:oldTerm.id,request_ids:['waiting-old']}]);
  const frame=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));expect(frame.width).toBeLessThanOrEqual(frame.viewport);expect(errors).toEqual([]);
  await mkdir('/tmp/approvals-qa',{recursive:true});await page.screenshot({path:`/tmp/approvals-qa/${viewport.width}.png`,fullPage:true});await page.close();
 }
 console.log('Approvals: filters, exact reminder scope, loading/error/results and desktop/mobile passed.');
}catch(e){console.error(log.slice(-4000));throw e;}finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
