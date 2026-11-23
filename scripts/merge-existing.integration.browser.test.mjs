import {chromium,webkit,devices,expect} from '@playwright/test';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {get} from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

// Invoked by TestExistingMergeBrowserIntegration, which owns the isolated DB,
// real API router, test session and disposable course pairs. No API mocks.
const fixture=JSON.parse(await readFile(process.argv[2],'utf8'));
const route=`merge-live-regression-${process.pid}`,dir=`app/${route}`,port=3325;
const tls=await mkdtemp(join(tmpdir(),'merge-integration-tls-'));
await mkdir(dir);
await writeFile(`${dir}/page.tsx`, `"use client";
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {api} from '../lib/api';
import Merge from '../staff/teaching/MergeExistingCoursesModal';
const cases=${JSON.stringify(fixture.cases)};
export default function Page(){
 const index=Number(useSearchParams().get('case')||0),data=cases[index];
 const[courses,setCourses]=useState<any[]|null>(null),[result,setResult]=useState<any[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api.get<any[]>('/teaching-courses?term_id='+data.term).then(setCourses).catch(e=>setError(e.message));},[data.term]);
 return <main>{error?<p role="alert">{error}</p>:result?<output>{JSON.stringify(result)}</output>:courses?<Merge termId={data.term} courses={courses} onClose={()=>{}} onMerged={()=>{api.get<any[]>('/teaching-courses?term_id='+data.term).then(setResult).catch(e=>setError(e.message))}}/>:<p>Loading test courses</p>}</main>;
}`);
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${tls}/key.pem`,'-out',`${tls}/cert.pem`,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const origin=`https://localhost:${port}`;
let log='',browser;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port),'--experimental-https','--experimental-https-key',`${tls}/key.pem`,'--experimental-https-cert',`${tls}/cert.pem`],{
 stdio:['ignore','pipe','pipe'],env:{...process.env,API_URL:fixture.api,NEXT_PUBLIC_API_ORIGIN:'',NEXT_PUBLIC_ERROR_REPORTING_ENABLED:'false'},
});
server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const ready=()=>new Promise(resolve=>{const r=get(`${origin}/${route}`,{rejectUnauthorized:false},s=>{s.resume();resolve(s.statusCode===200)});r.setTimeout(3000,()=>r.destroy());r.on('error',()=>resolve(false))});
try{
 for(let i=0;;i++){if(i>120||server.exitCode!==null)throw Error(log);if(await ready())break;await pause(500)}
 for(const [index,data] of fixture.cases.entries()){
  const safari=data.name==='iphone-safari',mobile=data.name!=='desktop-chrome';
  browser=await(safari?webkit:chromium).launch(safari?{}:{channel:'chrome'});
  const context=await browser.newContext({...safari?devices['iPhone 13']:{},viewport:mobile?{width:390,height:640}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,ignoreHTTPSErrors:true});
  await context.addCookies([{name:'access_token',value:fixture.token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[],responses=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/merge-existing'))responses.push({status:r.status(),commit:r.url().includes('commit=1')})});
  try{
   console.log(`Real API workflow: ${data.name}`);
   await page.goto(`${origin}/${route}?case=${index}`,{waitUntil:'domcontentloaded'});
   await page.getByRole('group',{name:'วิชาหลักที่จะเก็บไว้',exact:true}).click();await page.getByRole('option',{name:/CP321004/}).click();
   await page.getByRole('group',{name:'วิชาที่จะนำมารวม',exact:true}).click();await page.getByRole('option',{name:/SC361004/}).click();
   await page.getByRole('button',{name:'ดูข้อมูลก่อนรวม',exact:true}).click();
   const approve=page.getByRole('checkbox'),commit=page.getByRole('button',{name:'ยืนยันรวมวิชา',exact:true});
   await expect(approve).toBeDisabled();
   // Choose actual destination IDs from the server-rendered option lists.
   for(const [name,section] of [['จัดการ Section 1 regular','1'],['จัดการ Section 2 special','3']]){
    const select=page.getByLabel(name,{exact:true});
    const destination=await select.locator('option').filter({hasText:`CP321004 · Section ${section}`}).getAttribute('value');
    if(!destination)throw Error('Missing same-track destination');await select.selectOption(destination);
   }
   await expect(approve).toBeEnabled();
   for(let n=0;n<3;n++){
    const response=page.waitForResponse(r=>r.url().includes('/merge-existing')&&!r.url().includes('commit=1'));
    await page.getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();
    const r=await response;if(r.status()!==200)throw Error(`Repeated preview failed: ${r.status()} ${await r.text()}`);
    await expect(approve).toBeEnabled();
   }
   await page.locator('.modal__body').evaluate(el=>{el.scrollTop=0});await expect(approve).toBeInViewport({ratio:1});
   if(mobile)await approve.tap();else await approve.click();
   await expect(approve).toBeChecked();await expect(commit).toBeEnabled();
   await page.screenshot({path:`/tmp/merge-integration-${data.name}.png`,fullPage:true});
   const completed=page.waitForResponse(r=>r.url().includes('/merge-existing?commit=1'));
   await commit.click();const response=await completed;
   if(response.status()!==200)throw Error(`Commit failed: ${response.status()} ${await response.text()}`);
   await expect(page.locator('output')).toBeVisible();
   const result=JSON.parse(await page.locator('output').innerText());
   if(result.length!==1||result[0].id!==data.target||!result[0].alt_codes.includes('SC361004'))throw Error('Merged course list incorrect');
   if(errors.length||responses.some(r=>r.status!==200)||responses.filter(r=>r.commit).length!==1)throw Error(JSON.stringify({errors,responses}));
   console.log(`PASS ${data.name}: real list → preview → mappings → three repeated previews → tap → commit → refreshed list`);
  }catch(e){console.error(data.name,'page:',await page.locator('body').innerText(),'responses:',responses,'errors:',errors);await page.screenshot({path:`/tmp/merge-integration-${data.name}-failure.png`}).catch(()=>{});throw e}
  finally{await context.close();await browser.close();browser=undefined}
 }
}finally{
 await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));
 await rm(dir,{recursive:true,force:true});await rm(tls,{recursive:true,force:true});
 await rm(`.next/dev/types/app/${route}`,{recursive:true,force:true});await rm('.next/dev/types/validator.ts',{force:true});
}
