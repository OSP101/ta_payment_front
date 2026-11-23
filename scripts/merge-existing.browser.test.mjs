import { chromium, webkit, devices, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
const route=`merge-existing-regression-${process.pid}`,dir=`app/${route}`,port=3323;
if(process.env.MERGE_TEST_BROWSER&&!['desktop-chrome','mobile-chrome','iphone-safari'].includes(process.env.MERGE_TEST_BROWSER))throw Error('Unknown MERGE_TEST_BROWSER');
const ids={target:'10000000-0000-4000-8000-000000000001',source:'10000000-0000-4000-8000-000000000002',a:'20000000-0000-4000-8000-000000000001',b:'20000000-0000-4000-8000-000000000002',c:'20000000-0000-4000-8000-000000000003'};
const section=(id,no,track,students)=>({id,sec_no:no,track,students,data:{schedules:[{day_of_week:1,start_time:'09:00',end_time:'12:00',kind:'lecture',room:'ROOM1'}],exams:[]}});
const course=(id,code,sections)=>({id,code,name:'วิชาที่เรียนรวมกันสำหรับทดสอบ',alt_codes:[],credits:3,lecture:3,lab:0,self:6,level:'undergrad',sections,data:{lecturers:[{name:'อาจารย์ทดสอบ',email:'lecturer@example.test',is_primary:true}]}});
const target=course(ids.target,'CP999001',[section(ids.a,'1','regular',40)]),source=course(ids.source,'SC999001',[section(ids.b,'1','regular',5),section(ids.c,'2','special',7)]);
await mkdir(dir);await writeFile(`${dir}/page.tsx`, `"use client";import {useState} from 'react';import Merge from '../staff/teaching/MergeExistingCoursesModal';export default function Page(){const[open,setOpen]=useState(true);return <main>{open?<Merge termId="test" courses={[{id:'${ids.target}',code:'CP999001',name_th:'วิชาหลัก'},{id:'${ids.source}',code:'SC999001',name_th:'วิชาที่รวม'}]} onClose={()=>setOpen(false)} onMerged={()=>setOpen(false)}/>:<p>merge completed</p>}</main>}`);
// HTTPS lets WebKit enforce the real CSP without upgrading fixture assets onto an HTTP server.
const tlsDir=await mkdtemp(join(tmpdir(),'merge-existing-tls-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${tlsDir}/key.pem`,'-out',`${tlsDir}/cert.pem`,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const origin=`https://localhost:${port}`;
const ready=()=>new Promise(resolve=>{const req=get(`${origin}/${route}`,{rejectUnauthorized:false},res=>{res.resume();resolve(res.statusCode===200)});req.setTimeout(3000,()=>req.destroy());req.on('error',()=>resolve(false))});
let log='',browser;const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port),'--experimental-https','--experimental-https-key',`${tlsDir}/key.pem`,'--experimental-https-cert',`${tlsDir}/cert.pem`],{stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try{
 for(let i=0;;i++){if(i>120||server.exitCode!==null)throw Error(log);if(await ready())break;await pause(500)}
 for(const scenario of [
  {name:'desktop-chrome',engine:chromium,launch:{channel:'chrome'},context:{viewport:{width:1440,height:1000}}},
  {name:'mobile-chrome',engine:chromium,launch:{channel:'chrome'},context:{viewport:{width:390,height:640},isMobile:true,hasTouch:true}},
  {name:'iphone-safari',engine:webkit,launch:{},context:{...devices['iPhone 13'],viewport:{width:390,height:640}}},
 ]){
  if(process.env.MERGE_TEST_BROWSER&&process.env.MERGE_TEST_BROWSER!==scenario.name)continue;
  console.log(`Checking ${scenario.name}`);
  browser=await scenario.engine.launch(scenario.launch);
  const page=await browser.newPage({...scenario.context,ignoreHTTPSErrors:true});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(`${scenario.name}: ${e.message}`)});let blocked=false,fail=true,previewFails=false;const commits=[];
  page.on('requestfailed',r=>console.error('Request failed:',r.url(),r.failure()?.errorText));
  page.setDefaultTimeout(60000);
  await page.route('**/api/v1/teaching-courses/*/merge-existing*',async r=>{
   const body=r.request().postDataJSON();if(r.request().url().includes('commit=1')){commits.push(body);if(fail){fail=false;await r.fulfill({status:409,json:{error:'ข้อมูลเปลี่ยน กรุณาตรวจตัวอย่างใหม่'}})}else await r.fulfill({json:{target,source,blockers:[],token:'snapshot'}});return}
   await pause(200);
   if(previewFails){previewFails=false;await r.fulfill({status:500,json:{error:'ตรวจสอบไม่สำเร็จ กรุณาลองอีกครั้ง'}});return}
   await r.fulfill({json:{target,source,token:'snapshot',blockers:blocked?['มีคำขอ TA ผูกอยู่แล้ว']:body.mappings.length===2?[]:['กำหนดวิธีจัดการให้ครบทุก Section']}});
  });
  await page.goto(`${origin}/${route}`,{waitUntil:'domcontentloaded'});
  try{
  await page.getByRole('group',{name:'วิชาหลักที่จะเก็บไว้',exact:true}).click();await page.getByRole('option',{name:/CP999001/}).click();
  await page.getByRole('group',{name:'วิชาที่จะนำมารวม',exact:true}).click();await page.getByRole('option',{name:/SC999001/}).click();
  await page.getByRole('button',{name:'ดูข้อมูลก่อนรวม',exact:true}).click();
  const commit=page.getByRole('button',{name:'ยืนยันรวมวิชา',exact:true});await expect(commit).toBeDisabled();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption(ids.a);
  await expect(page.getByRole('checkbox')).toBeDisabled();blocked=true;
  await page.getByLabel('จัดการ Section 2 special',{exact:true}).selectOption('');
  await expect(page.locator('.modal__footer').getByText('มีคำขอ TA ผูกอยู่แล้ว',{exact:true})).toBeVisible();await expect(commit).toBeDisabled();
  blocked=false;await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();
  const approve=page.getByRole('checkbox');await expect(approve).toBeEnabled();
  // Tapping a visible footer must not rely on Playwright scrolling the checkbox into view.
  await expect(approve).toBeInViewport({ratio:1});
  await page.locator('.modal__body').evaluate(el=>{el.scrollTop=0});
  await expect(approve).toBeInViewport({ratio:1});
  if(scenario.context.hasTouch)await approve.tap();else await approve.click();
  await expect(approve).toBeChecked();await expect(commit).toBeEnabled();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption('?');await expect(approve).toBeDisabled();await expect(commit).toBeDisabled();await expect(approve).not.toBeChecked();
  previewFails=true;await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption(ids.a);await expect(approve).toBeDisabled();
  await expect(page.locator('.modal__footer').getByText('ตรวจสอบไม่สำเร็จ กรุณาลองอีกครั้ง',{exact:true})).toBeVisible();await expect(approve).toBeDisabled();
  await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();await approve.check();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption('');await expect(approve).not.toBeChecked();await expect(approve).toBeEnabled();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption(ids.a);await expect(approve).toBeEnabled();await approve.check();
  await page.screenshot({path:`/tmp/merge-existing-${scenario.name}.png`,fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('horizontal overflow');
  await commit.click();await expect(page.locator('.modal__footer').getByText('ข้อมูลเปลี่ยน กรุณาตรวจตัวอย่างใหม่',{exact:true})).toBeVisible();await expect(commit).toBeDisabled();
  await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();await approve.check();await commit.click();await expect(page.getByText('merge completed')).toBeVisible();
  if(commits.length!==2||commits.some(c=>!c.confirmed||c.token!=='snapshot'||c.source_id!==ids.source||c.mappings.find(m=>m.source===ids.b)?.target!==ids.a||c.mappings.find(m=>m.source===ids.c)?.target!==null))throw Error('incorrect merge payload');
  if(errors.length)throw Error(errors.join('\n'));
  }catch(e){
   console.error('Page errors:',errors,'Page text:',await page.locator('body').innerText());
   await page.screenshot({path:`/tmp/merge-existing-${scenario.name}-failure.png`,timeout:10000}).catch(()=>{});throw e;
  }
  await page.close();await browser.close();browser=undefined;console.log(`PASS ${scenario.name}`);
 }
 console.log(`PASS existing-course merge: automatic validation, visible confirmation, blockers, retries, payload (${process.env.MERGE_TEST_BROWSER||'desktop/mobile Chrome and iPhone Safari'})`);
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));await rm(dir,{recursive:true,force:true});await rm(`.next/dev/types/app/${route}`,{recursive:true,force:true});await rm('.next/dev/types/validator.ts',{force:true});await rm(tlsDir,{recursive:true,force:true});}
