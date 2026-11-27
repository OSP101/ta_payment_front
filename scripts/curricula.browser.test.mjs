import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
const expect=baseExpect.configure({timeout:15000});
const port=3345, baseUrl=process.env.CURRICULA_TEST_BASE_URL || `http://localhost:${port}`, route=`curricula-regression-${process.pid}`, dir=path.resolve('app',route);
await mkdir(dir);
await writeFile(path.join(dir,'page.tsx'),`"use client";import {Suspense} from 'react';import Page from '../staff/settings/page';export default function Test(){return <Suspense><main className="p-4"><Page/></main></Suspense>}`);
const isolatedDir = process.env.CURRICULA_TEST_ROOT ? path.join(process.env.CURRICULA_TEST_ROOT,'app',route) : null;
if (isolatedDir) { await mkdir(isolatedDir,{recursive:true});await writeFile(path.join(isolatedDir,'page.tsx'),await (await import('node:fs/promises')).readFile(path.join(dir,'page.tsx'))); }
const server=process.env.CURRICULA_TEST_BASE_URL ? undefined : spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...(process.env.CURRICULA_TEST_ROOT ? [process.env.CURRICULA_TEST_ROOT] : []),'--webpack','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='',browser;
server?.stdout.on('data',d=>log+=d);server?.stderr.on('data',d=>log+=d);
try {
 for(let i=0;;i++) { if((server && server.exitCode!==null)||i>120)throw Error(log);try {if((await fetch(`${baseUrl}/${route}?tab=curricula`,{signal:AbortSignal.timeout(4000)})).ok)break;}catch{}await pause(500); }
 browser=await chromium.launch().catch(()=>chromium.launch({channel:'chrome'}));
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let rows=[{code:'CS',sheet_name:'CS',full_name_th:'สาขาวิชาวิทยาการคอมพิวเตอร์',level:'undergrad',sort_order:1}],blocked=true;
  await page.route('**/api/v1/**',async r=>{
   const u=new URL(r.request().url()),method=r.request().method();
   if(u.pathname.endsWith('/curricula')&&method==='GET')return r.fulfill({json:rows});
   if(u.pathname.endsWith('/curricula')&&method==='POST'){const body=r.request().postDataJSON();rows.push(body);return r.fulfill({status:201,json:body});}
   if(u.pathname.includes('/curricula/')&&method==='PATCH'){rows=rows.map(c=>c.code==='NEW_TEST'?{...c,...r.request().postDataJSON()}:c);return r.fulfill({status:204});}
   if(u.pathname.includes('/curricula/')&&method==='DELETE'){if(blocked)return r.fulfill({status:409,json:{error:'ไม่สามารถลบหลักสูตรที่มีรายวิชาใช้งานอยู่'}});rows=rows.filter(c=>c.code!=='NEW_TEST');return r.fulfill({status:204});}
   return r.fulfill({json:[]});
  });
  await page.goto(`${baseUrl}/${route}?tab=curricula`);
  await page.getByRole('button',{name:'เพิ่มหลักสูตร',exact:true}).click();
  let dialog=page.getByRole('dialog');
  const fields=dialog.getByRole('textbox');
  await fields.nth(0).fill('new_test');await fields.nth(1).fill('Test Sheet');await fields.nth(2).fill('หลักสูตรทดสอบ');
  await dialog.getByRole('button',{name:'บันทึก',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:'NEW_TEST'});
  await expect(row).toContainText('หลักสูตรทดสอบ');
  await row.getByRole('button',{name:'แก้ไข',exact:true}).click();
  dialog=page.getByRole('dialog');await expect(dialog.getByRole('textbox').nth(0)).toBeDisabled();
  await dialog.getByRole('textbox').nth(2).fill('หลักสูตรแก้ไข');
  await pause(350);
  await page.screenshot({path:`/tmp/curricula-form-${viewport.width}.png`,fullPage:true});
  await dialog.getByRole('button',{name:'บันทึก',exact:true}).click();await expect(row).toContainText('หลักสูตรแก้ไข');
  await row.getByRole('button',{name:'ลบหลักสูตร NEW_TEST',exact:true}).click();
  dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();await expect(row).toBeVisible();
  await row.getByRole('button',{name:'ลบหลักสูตร NEW_TEST',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'ลบหลักสูตร',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('ไม่สามารถลบหลักสูตรที่มีรายวิชาใช้งานอยู่');
  blocked=false;await page.getByRole('dialog').getByRole('button',{name:'ลบหลักสูตร',exact:true}).click();await expect(row).toHaveCount(0);
  await page.screenshot({path:`/tmp/curricula-table-${viewport.width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await page.close();
 }
 console.log('Curricula desktop/mobile CRUD, cancel, conflict and retry passed.');
} finally { await browser?.close();server?.kill('SIGTERM');await rm(dir,{recursive:true,force:true});if(isolatedDir)await rm(isolatedDir,{recursive:true,force:true}); }
