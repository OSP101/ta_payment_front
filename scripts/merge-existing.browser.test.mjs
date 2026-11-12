import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
const route=`merge-existing-regression-${process.pid}`,dir=`app/${route}`,port=3323;
const ids={target:'10000000-0000-4000-8000-000000000001',source:'10000000-0000-4000-8000-000000000002',a:'20000000-0000-4000-8000-000000000001',b:'20000000-0000-4000-8000-000000000002',c:'20000000-0000-4000-8000-000000000003'};
const section=(id,no,track,students)=>({id,sec_no:no,track,students,data:{schedules:[{day_of_week:1,start_time:'09:00',end_time:'12:00',kind:'lecture',room:'ROOM1'}],exams:[]}});
const course=(id,code,sections)=>({id,code,name:'วิชาที่เรียนรวมกันสำหรับทดสอบ',alt_codes:[],credits:3,lecture:3,lab:0,self:6,level:'undergrad',sections,data:{lecturers:[{name:'อาจารย์ทดสอบ',email:'lecturer@example.test',is_primary:true}]}});
const target=course(ids.target,'CP999001',[section(ids.a,'1','regular',40)]),source=course(ids.source,'SC999001',[section(ids.b,'1','regular',5),section(ids.c,'2','special',7)]);
await mkdir(dir);await writeFile(`${dir}/page.tsx`, `"use client";import {useState} from 'react';import Merge from '../staff/teaching/MergeExistingCoursesModal';export default function Page(){const[open,setOpen]=useState(true);return <main>{open?<Merge termId="test" courses={[{id:'${ids.target}',code:'CP999001',name_th:'วิชาหลัก'},{id:'${ids.source}',code:'SC999001',name_th:'วิชาที่รวม'}]} onClose={()=>setOpen(false)} onMerged={()=>setOpen(false)}/>:<p>merge completed</p>}</main>}`);
let log='',browser;const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port)],{stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try{
 for(let i=0;;i++){if(i>120||server.exitCode!==null)throw Error(log);try{if((await fetch(`http://localhost:${port}/${route}`,{signal:AbortSignal.timeout(3000)})).ok)break}catch{}await pause(500)}
 browser=await chromium.launch({channel:'chrome'});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));let blocked=false,fail=true;const commits=[];
  await page.route('**/api/v1/teaching-courses/*/merge-existing*',async r=>{
   const body=r.request().postDataJSON();if(r.request().url().includes('commit=1')){commits.push(body);if(fail){fail=false;await r.fulfill({status:409,json:{error:'ข้อมูลเปลี่ยน กรุณาตรวจตัวอย่างใหม่'}})}else await r.fulfill({json:{target,source,blockers:[],token:'snapshot'}});return}
   await r.fulfill({json:{target,source,token:'snapshot',blockers:blocked?['มีคำขอ TA ผูกอยู่แล้ว']:body.mappings.length===2?[]:['กำหนดวิธีจัดการให้ครบทุก Section']}});
  });
  await page.goto(`http://localhost:${port}/${route}`);
  await page.getByRole('group',{name:'วิชาหลักที่จะเก็บไว้',exact:true}).click();await page.getByRole('option',{name:/CP999001/}).click();
  await page.getByRole('group',{name:'วิชาที่จะนำมารวม',exact:true}).click();await page.getByRole('option',{name:/SC999001/}).click();
  await page.getByRole('button',{name:'ดูข้อมูลก่อนรวม',exact:true}).click();
  const commit=page.getByRole('button',{name:'ยืนยันรวมวิชา',exact:true});await expect(commit).toBeDisabled();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption(ids.a);
  await page.getByLabel('จัดการ Section 2 special',{exact:true}).selectOption('');
  blocked=true;await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();await expect(page.getByText('มีคำขอ TA ผูกอยู่แล้ว',{exact:true})).toBeVisible();await expect(commit).toBeDisabled();
  blocked=false;await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();
  const approve=page.getByRole('checkbox');await expect(approve).toBeEnabled();await approve.check();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption('');await expect(commit).toBeDisabled();await expect(approve).not.toBeChecked();
  await page.getByLabel('จัดการ Section 1 regular',{exact:true}).selectOption(ids.a);await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();await approve.check();
  await page.screenshot({path:`/tmp/merge-existing-${viewport.width}.png`,fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('horizontal overflow');
  await commit.click();await expect(page.getByText('ข้อมูลเปลี่ยน กรุณาตรวจตัวอย่างใหม่',{exact:true})).toBeVisible();await expect(commit).toBeDisabled();
  await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();await approve.check();await commit.click();await expect(page.getByText('merge completed')).toBeVisible();
  if(commits.length!==2||commits.some(c=>!c.confirmed||c.token!=='snapshot'||c.source_id!==ids.source||c.mappings.find(m=>m.source===ids.b)?.target!==ids.a||c.mappings.find(m=>m.source===ids.c)?.target!==null))throw Error('incorrect merge payload');
  if(errors.length)throw Error(errors.join('\n'));await page.close();
 }
 console.log('PASS existing-course merge: explicit mapping, separate sections, usage blockers, invalidation after changes, stale-response retry, payload, desktop/mobile');
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));await rm(dir,{recursive:true,force:true});await rm(`.next/dev/types/app/${route}`,{recursive:true,force:true});await rm('.next/dev/types/validator.ts',{force:true});}
