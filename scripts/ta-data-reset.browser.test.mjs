import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const port = Number(process.env.RESET_TEST_PORT || 3327);
const route = `ta-reset-regression-${process.pid}`;
const dir = path.resolve('app', route);
const user = { id: '7a71ae1b-e38a-44ba-bb87-41acd4ca0001', first_name: 'TA', last_name: 'Reset', nationality: 'thai' };
const term = { id: '7a71ae1b-e38a-44ba-bb87-41acd4ca0002', academic_year: 2569, semester: 1, is_active: true };
let browser, server, log = '';
try {
  await mkdir(dir);
  await writeFile(path.join(dir, 'page.tsx'), `"use client";
import {useState} from 'react';
import TADataResetModal from '../staff/users/TADataResetModal';
export default function Test(){const [open,setOpen]=useState(true);return <main>{open?<TADataResetModal user={${JSON.stringify(user)}} onClose={()=>setOpen(false)}/>:<p>closed</p>}</main>}`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', String(port)], {env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>log+=d); server.stderr.on('data',d=>log+=d);
  for(let i=0;;i++){
    if(server.exitCode!==null||i>120)throw Error(log);
    try{if((await fetch(`http://localhost:${port}/${route}`,{signal:AbortSignal.timeout(4000)})).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  browser = await chromium.launch({channel:'chrome'});
  for (const scenario of ['desktop', 'mobile', 'locked', 'foreign', 'success']) {
    const page = await browser.newPage({viewport:scenario==='mobile'?{width:390,height:844}:{width:1280,height:900}});
    let submitted;
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/api/v1/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname.endsWith('/ta-data/reset')){
        submitted=req.postDataJSON();
        return route.fulfill(scenario==='success'?{json:{ok:true}}:{status:409,json:{error:'reset test failure'}});
      }
      if(url.pathname.endsWith('/schedule'))return route.fulfill({json:{blocks:[],locked:scenario==='locked',lock_reason:'Exported term'}});
      if(url.pathname==='/api/v1/terms')return route.fulfill({json:[term]});
      if(url.pathname===`/api/v1/users/${user.id}`)return route.fulfill({json:{...user,nationality:scenario==='foreign'?'foreign':'thai'}});
      return route.fulfill({json:{ok:true}});
    });
    await page.goto(`http://localhost:${port}/${route}`);
    const submit=page.getByRole('button',{name:'ยืนยันรีเซ็ตข้อมูลที่เลือก',exact:true});
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('checkbox',{name:'ข้อมูลแบบฟอร์มเจ้าหนี้',exact:true})).toBeEnabled();
    await page.getByText(scenario==='foreign'?'สำเนา Passport':'สำเนาบัตรประชาชน',{exact:true}).click();
    await page.getByRole('textbox').fill('แก้ไขเอกสารผิดพลาด');
    await page.getByText('ตรวจสอบรายการแล้ว และยืนยันให้ TA ส่งข้อมูลที่เลือกใหม่',{exact:true}).click();
    await expect(submit).toBeEnabled();
    if(scenario==='success') {
      await submit.click();
      await expect(page.getByText('closed',{exact:true})).toBeVisible();
      expect(submitted).toEqual({documents:['national_id'],schedule:false,reason:'แก้ไขเอกสารผิดพลาด'});
      await page.close();
      continue;
    }
    await page.getByText('ตารางเรียน',{exact:true}).click();
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('checkbox',{name:'ตรวจสอบรายการแล้ว และยืนยันให้ TA ส่งข้อมูลที่เลือกใหม่',exact:true})).not.toBeChecked();
    // No implicit active-term choice: the officer must select year + semester.
    await page.getByRole('button',{name:/ภาคเรียน \/ ปีการศึกษา/}).click();
    await page.getByRole('option',{name:/2569\/1/}).click();
    await page.getByText('ตรวจสอบรายการแล้ว และยืนยันให้ TA ส่งข้อมูลที่เลือกใหม่',{exact:true}).click();
    if(scenario==='locked'){
      await expect(page.getByText('รีเซ็ตตารางเรียนไม่ได้',{exact:true})).toBeVisible();
      await expect(submit).toBeDisabled();
    } else {
      await expect(submit).toBeEnabled();
      if(scenario==='desktop'||scenario==='mobile')await page.screenshot({path:`/tmp/ta-reset-${scenario}.png`,fullPage:true});
      await submit.click();
      await expect(page.getByText('รีเซ็ตข้อมูลไม่สำเร็จ',{exact:true})).toBeVisible();
      expect(submitted).toEqual({documents:[scenario==='foreign'?'passport':'national_id'],schedule:true,term_id:term.id,reason:'แก้ไขเอกสารผิดพลาด'});
      await expect(page.getByRole('textbox')).toHaveValue('แก้ไขเอกสารผิดพลาด');
    }
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log('PASS: TA reset selection, explicit term, lock, failure, foreign TA, desktop/mobile');
} finally {
  await browser?.close(); server?.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
}
