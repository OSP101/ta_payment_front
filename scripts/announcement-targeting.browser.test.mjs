import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
const expect=baseExpect.configure({timeout:15000});
const port=3336,route=`announcement-regression-${process.pid}`,dir=path.resolve('app',route);
const term='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
await mkdir(dir);
await writeFile(path.join(dir,'page.tsx'),`"use client";
import {useState} from 'react';
import {AudienceSection,useAudiencePreview} from '../staff/announce/AudienceFields';
import {emptyDraft,ruleOf,buildPayload} from '../staff/announce/shared';
export default function Test(){const [draft,setDraft]=useState({...emptyDraft,title:'Test',body:'Content'});const audience=useAudiencePreview(ruleOf(draft));return <main className="max-w-3xl p-4"><AudienceSection draft={draft} setDraft={setDraft} audience={audience}/><pre data-testid="payload">{JSON.stringify(buildPayload(draft,true))}</pre></main>}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try {
 for(let i=0;;i++){if(server.exitCode!==null||i>120)throw Error(log);try{if((await fetch(`http://localhost:${port}/${route}`,{signal:AbortSignal.timeout(4000)})).ok)break;}catch{}await pause(500);}
 browser=await chromium.launch({channel:process.env.ANNOUNCEMENT_CHROME_CHANNEL || "chrome"});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];let lastRule,courseURL;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',r=>{
 const url=new URL(r.request().url());
 if(url.pathname.endsWith('/terms'))return r.fulfill({json:[{id:term,academic_year:2569,semester:1,is_active:true},{id:other,academic_year:2569,semester:2,is_active:false}]});
 if(url.pathname.endsWith('/audience-filters'))return r.fulfill({json:{items:[]}});
 if(url.pathname.endsWith('/preview-audience')){lastRule=r.request().postDataJSON();return r.fulfill({json:{total:1,everyone:false,empty:false,names:[{id:'ta',name:'TA recipient',email:'ta@example.test'}]}});}
 if(url.pathname.endsWith('/teaching-courses')){courseURL=url;return r.fulfill({json:[{id:'course',code:'CP101',name_th:'Test course'}]});}
 return r.fulfill({json:{ok:true}});
 });
 await page.goto(`http://localhost:${port}/${route}`);
 const payload=async()=>JSON.parse(await page.getByTestId('payload').textContent());
 await expect(page.getByLabel('ภาคการศึกษาของกลุ่มเป้าหมาย')).toHaveValue(term);
 expect((await payload()).send_email).toBe(false);
 await page.getByRole('button',{name:'ผู้ช่วยสอน',exact:true}).click();
 await expect.poll(()=>lastRule?.term_id).toBe(term);
 await expect(page.getByTestId('audience-summary')).toContainText('TA recipient');
 await page.getByRole('radio',{name:'ในระบบพร้อมอีเมล',exact:true}).check();expect((await payload()).send_email).toBe(true);
 await page.getByRole('radio',{name:'ในระบบเท่านั้น',exact:true}).check();expect((await payload()).send_email).toBe(false);
 await page.getByLabel('ค้นหาวิชา',{exact:true}).fill('CP');
 await page.getByRole('button',{name:'CP101 Test course'}).click();
 expect(courseURL.searchParams.get('term_id')).toBe(term);expect((await payload()).target_course_ids).toEqual(['course']);
 await page.getByLabel('ภาคการศึกษาของกลุ่มเป้าหมาย').selectOption(other);
 await expect.poll(()=>lastRule?.term_id).toBe(other);expect((await payload()).target_course_ids).toEqual([]);expect((await payload()).target_term_id).toBe(other);
 await page.getByTestId('payload').evaluate(el=>el.style.display='none');
 await page.screenshot({path:`/tmp/announcement-targeting-${viewport.width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await page.close();
 }
 console.log('Announcement targeting: desktop/mobile term scope, course reset, channel choices, preview and payload passed.');
} finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
