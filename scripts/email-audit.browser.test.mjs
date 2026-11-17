import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
const expect=baseExpect.configure({timeout:15000});
const port=Number(process.env.EMAIL_AUDIT_TEST_PORT || 3324),route=`email-audit-regression-${process.pid}`,dir=path.resolve('app',route);
const job='11111111-1111-4111-8111-111111111111';
const rows=['queued','started','accepted','failed','retry','skipped','exhausted'].map((status,i)=>({
 id:i+1,at:new Date().toISOString(),action:`mail.delivery.${status}`,entity:'mail_delivery',entity_id:`delivery-${i}`,ref:`AL-00000${i+1}`,
 label:status,category:'comms',category_label:'การสื่อสาร',severity:status==='failed'?'danger':'info',outcome:status==='failed'?'failed':'ok',actor_kind:'system',automatic:true,count:1,
 after:{to:'synthetic@example.test',recipient_name:'ผู้รับทดสอบ',subject:'แจ้งผลการตรวจเอกสาร',source:'outbox',job_id:job,attempt:2,from:'sender@example.test',duration_ms:120,
 ...(status==='accepted'?{finished_at:new Date().toISOString()}:{}),...(status==='retry'?{retry_at:new Date(Date.now()+240000).toISOString()}:{}),...(status==='failed'?{error:'เชื่อมต่อ SMTP ไม่สำเร็จ'}:{})}
}));
await mkdir(dir);
await writeFile(path.join(dir,'page.tsx'),`"use client";import Audit from '../staff/audit/page';export default function Test(){return <main className="p-4"><Audit/></main>}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try {
 for(let i=0;;i++) {if(server.exitCode!==null||i>120)throw Error(log);try {if((await fetch(`http://localhost:${port}/${route}`,{signal:AbortSignal.timeout(4000)})).ok)break;}catch{}await pause(500);}
 browser=await chromium.launch(process.env.EMAIL_AUDIT_CHROME_CHANNEL ? {channel:process.env.EMAIL_AUDIT_CHROME_CHANNEL} : {});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const page=await browser.newPage({viewport}),errors=[],requests=[];let fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/auth/heartbeat',r=>r.fulfill({json:{ok:true}}));
  await page.route('**/api/v1/audit-logs**',r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('/summary'))return r.fulfill({json:{events:0,rows:0,actors:[],categories:[],attention:[]}});
   if(u.pathname.endsWith('/sessions'))return r.fulfill({json:{items:[],current:''}});
   if(u.pathname.endsWith('/catalog'))return r.fulfill({json:{actions:[],categories:[]}});
   requests.push(u);if(fail)return r.fulfill({status:500,json:{error:'Test failure'}});
   const filtered=u.searchParams.get('q')==='nobody'?[]:rows.filter(x=>!u.searchParams.get('action')||x.action===u.searchParams.get('action'));
   return r.fulfill({json:{items:filtered,total:filtered.length}});
  });
  await page.goto(`http://localhost:${port}/${route}`);
  await page.getByRole('button',{name:'ติดตามอีเมล',exact:true}).click();
  await expect(page.getByRole('heading',{name:'ติดตามการส่งอีเมล'})).toBeVisible();
  await expect(page.getByText('SMTP รับแล้ว',{exact:true}).filter({visible:true}).first()).toBeVisible();
  await expect(page.getByText('ยังไม่ได้เปิดใช้งาน SMTP จึงไม่ได้ส่งอีเมลออกไป').filter({visible:true}).first()).toBeVisible();
  expect(requests.at(-1).searchParams.get('entity')).toBe('mail_delivery');expect(requests.at(-1).searchParams.has('fold')).toBe(false);
  await page.screenshot({path:`/tmp/email-audit-${viewport.width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'ดูทุกครั้งของคิวนี้',exact:true}).first().click();
  await expect.poll(()=>requests.at(-1).searchParams.get('mail_job_id')).toBe(job);
  const search=page.getByRole('searchbox');await search.fill('nobody');
  await expect(page.getByText('ไม่พบประวัติการส่งอีเมลในช่วงนี้',{exact:true}).filter({visible:true}).first()).toBeVisible();
  expect(requests.at(-1).searchParams.get('mail_job_id')).toBe(job);expect(requests.at(-1).searchParams.get('q')).toBe('nobody');
  await search.fill('');await expect(page.getByRole('button',{name:'ดูทุกครั้งของคิวนี้',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:/ขั้นตอนการส่ง/}).click();await page.getByRole('option',{name:'ส่งไม่สำเร็จ',exact:true}).click();
  await expect.poll(()=>requests.at(-1).searchParams.get('action')).toBe('mail.delivery.failed');
  fail=true;await page.getByRole('button',{name:'รีเฟรช',exact:true}).click();
  await expect(page.getByText('Test failure',{exact:true}).filter({visible:true}).first()).toBeVisible();
  fail=false;await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();
  await expect(page.getByRole('button',{name:'ดูทุกครั้งของคิวนี้',exact:true}).first()).toBeVisible();
  expect(errors).toEqual([]);await page.close();
 }
 console.log('Email audit: desktop/mobile lifecycle, queue/search/status filters, empty/error/retry states passed.');
} finally {await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
