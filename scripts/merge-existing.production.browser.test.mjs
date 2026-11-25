import {chromium,webkit,devices,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,cp,rm,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

// Full staff page, production standalone output, real API/DB and test session.
// No temporary React routes and no intercepted/mocked API responses.
const fixture=JSON.parse(await readFile(process.argv[2],'utf8'));
const runtimePort=3327,origin='https://localhost:3326';
const tls=await mkdtemp(join(tmpdir(),'merge-production-'));
const env={...process.env,API_URL:fixture.api,NEXT_PUBLIC_API_ORIGIN:'',NEXT_OUTPUT_STANDALONE:'1',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_ERROR_REPORTING_ENABLED:'false',SENTRY_DSN:''};
let server,gateway,browser,log='';const results=[];
const done=child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Process exited ${code}`)))});
async function stop(child){if(!child)return;child.kill('SIGTERM');if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve))}
try{
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const diff=createHash('sha256').update(execFileSync('git',['diff','HEAD','--','app','proxy.ts','next.config.ts','package.json','package-lock.json'])).digest('hex');
 if(process.env.MERGE_REUSE_PRODUCTION==='1'){
  const meta=JSON.parse(await readFile('/tmp/merge-production-build-meta.json','utf8'));
  if(meta.api!==fixture.api||meta.revision!==revision||meta.diff!==diff)throw Error('Cached production build does not match the API or frontend source');
  await access('.next/BUILD_ID');await access('.next/standalone/server.js');
  console.log('Reusing the completed production build; frontend revision and source diff verified');
 }else{
  console.log('Building the actual app with npm run build (standalone production output)');
  // The build can outlast the 15-minute idle limit. Keep the disposable
  // session active through the real heartbeat API during test setup only.
  const heartbeat=async()=>{const r=await fetch(`${fixture.api}/api/v1/auth/heartbeat`,{method:'POST',headers:{Authorization:`Bearer ${fixture.token}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`Test setup heartbeat: ${r.status()}`)};
  await heartbeat();let heartbeatError;const timer=setInterval(()=>{heartbeat().catch(e=>{heartbeatError=e})},60000);
  try{const build=spawn('npm',['run','build'],{env,stdio:'inherit'});await done(build);if(heartbeatError)throw heartbeatError}finally{clearInterval(timer)}
  await writeFile('/tmp/merge-production-build-meta.json',JSON.stringify({api:fixture.api,revision,diff}));
 }
 await cp('.next/static','.next/standalone/.next/static',{recursive:true});await cp('public','.next/standalone/public',{recursive:true});
 server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...env,NODE_ENV:'production',PORT:String(runtimePort),HOSTNAME:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
 for(let i=0;;i++){if(i>120||server.exitCode!==null)throw Error(log);try{if((await fetch(`http://127.0.0.1:${runtimePort}/api/health`,{signal:AbortSignal.timeout(2000)})).ok)break}catch{}await pause(500)}
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${tls}/key.pem`,'-out',`${tls}/cert.pem`,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 gateway=createServer({key:await readFile(`${tls}/key.pem`),cert:await readFile(`${tls}/cert.pem`)},(req,res)=>{
  const upstream=httpRequest({host:'127.0.0.1',port:runtimePort,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https','x-forwarded-host':'localhost:3326'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{res.writeHead(502);res.end('Test gateway unavailable')});req.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(3326,'127.0.0.1',resolve)});
 for(const data of fixture.cases){
  const action=data.mode.replace(/^approved-/,'');
  const safari=action==='safari',mobile=action==='mobile'||safari;
  browser=await(safari?webkit:chromium).launch(safari?{}:{channel:'chrome'});
  const context=await browser.newContext({...safari?devices['iPhone 13']:{},viewport:mobile?{width:390,height:640}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,ignoreHTTPSErrors:true});
  await context.addCookies([{name:'access_token',value:fixture.token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),trace=[],pending=[],errors=[];let noticeAcknowledged=false;
  const watch=p=>{p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{
   if(r.url().includes('/api/v1/')&&(r.status()===404||r.status()>=500))errors.push(`Unexpected API response ${r.status()} ${new URL(r.url()).pathname}`);
   if(!r.url().includes('/merge-existing'))return;
   pending.push((async()=>{let body;try{body=await r.json()}catch{}let scopes=[];try{scopes=Object.keys(JSON.parse(r.request().headers()['x-edit-views']||'{}'))}catch{}
    trace.push({commit:r.url().includes('commit=1'),status:r.status(),error:body?.error,blockers:body?.blockers,scopes});})());
  })};watch(page);
  const dialog=p=>p.getByRole('dialog');
  const approve=p=>dialog(p).getByRole('checkbox');
  const commit=p=>dialog(p).getByRole('button',{name:'ยืนยันรวมวิชา',exact:true});
  const response=(p,committing)=>p.waitForResponse(r=>r.url().includes('/merge-existing')&&r.url().includes('commit=1')===committing);
  const inspect=async p=>{const next=response(p,false);await dialog(p).getByRole('button',{name:'ตรวจตัวอย่างอีกครั้ง',exact:true}).click();const r=await next;if(r.status()!==200)throw Error(`Inspect ${r.status()}: ${await r.text()}`);return r.json()};
  const submit=async(p,status)=>{const next=response(p,true);await commit(p).click();const r=await next;if(r.status()!==status)throw Error(`Commit ${r.status()} expected ${status}: ${await r.text()}`);return r.json()};
  const open=async(p,reverse=false)=>{
   await p.goto(`${origin}/staff/teaching?term=${data.term}`,{waitUntil:'domcontentloaded'});
   if(new URL(p.url()).pathname==='/login')throw Error('Test session expired or missing before opening staff page');
   if(!noticeAcknowledged){await p.getByRole('button',{name:'เข้าใจแล้ว',exact:true}).click();noticeAcknowledged=true}
   await p.getByRole('button',{name:'รวมวิชาที่เปิดแล้ว',exact:true}).click();
   await dialog(p).getByRole('group',{name:'วิชาหลักที่จะเก็บไว้',exact:true}).click();await p.getByRole('listbox',{name:/วิชาหลักที่จะเก็บไว้/}).getByRole('option',{name:reverse?/SC361004/:/CP321004/}).click();
   await dialog(p).getByRole('group',{name:'วิชาที่จะนำมารวม',exact:true}).click();
   if(data.mode==='exported'){await expect(p.getByRole('listbox',{name:/วิชาที่จะนำมารวม/}).getByRole('option',{name:/SC361004/})).toHaveCount(0);return}
   await p.getByRole('listbox',{name:/วิชาที่จะนำมารวม/}).getByRole('option',{name:reverse?/CP321004/:/SC361004/}).click();
   const next=response(p,false);await dialog(p).getByRole('button',{name:'ดูข้อมูลก่อนรวม',exact:true}).click();const r=await next;if(r.status()!==200)throw Error(`First preview: ${r.status()} ${await r.text()}`);
   await expect(approve(p)).toBeDisabled();await expect(commit(p)).toBeDisabled();
   if(data.approval?.request_id)await expect(dialog(p).getByText('คงคำขอ TA ที่อนุมัติแล้วของวิชาหลัก',{exact:true})).toBeVisible();
  };
  const map=async p=>{
   const first=dialog(p).getByLabel('จัดการ Section 1 regular',{exact:true});
   await expect(first.locator('option').filter({hasText:'CP321004 · Section 3'})).toHaveCount(0);
   for(const [label,dst] of [['จัดการ Section 1 regular','1'],['จัดการ Section 2 special','3']]){
    const select=dialog(p).getByLabel(label,{exact:true});const id=await select.locator('option').filter({hasText:`CP321004 · Section ${dst}`}).getAttribute('value');
    if(!id)throw Error('Missing destination section');
    if(dst==='3'){const next=response(p,false);await select.selectOption(id);const r=await next;if(r.status()!==200)throw Error(`Mapping preview: ${r.status()} ${await r.text()}`)}else{await select.selectOption(id);await expect(approve(p)).toBeDisabled()}
   }
  };
  const check=async p=>{await expect(approve(p)).toBeEnabled();await expect(approve(p)).toBeInViewport({ratio:1});if(mobile)await approve(p).tap();else await approve(p).click();await expect(commit(p)).toBeEnabled()};
  const verifyMerged=async()=>{
   const r=await context.request.get(`${origin}/api/v1/teaching-courses?term_id=${data.term}`);if(r.status()!==200)throw Error(`Reload list: ${r.status()}`);const list=await r.json();
   if(list.length!==1||list[0].id!==data.target||list[0].num_students_regular!==(data.regular_after||45)||list[0].num_students_special!==35)throw Error('Incorrect merged course data');
  };
  try{
   console.log(`Actual /staff/teaching production scenario: ${data.mode}`);
   await open(page,data.mode==='reverse-main');
   if(data.mode==='exported'){await expect(page.getByRole('button',{name:'ดูข้อมูลก่อนรวม',exact:true,includeHidden:true})).toBeDisabled()}
   else if(data.mode==='reverse-main'){
    await expect(dialog(page).getByText(/เลือกรหัสหลักสูตรใหม่กว่า/)).toBeVisible();await expect(approve(page)).toBeDisabled();
   }else{
    await map(page);
    if(['ta-request','incompatible','draft-time','submitted-time','reviewed-month'].includes(action)){
     await expect(approve(page)).toBeDisabled();await expect(commit(page)).toBeDisabled();
     const expected=action==='ta-request'?/มีข้อมูลการใช้งาน/:action==='incompatible'?/หน่วยกิต ชั่วโมง หรือระดับการศึกษาต่างกัน/:action==='reviewed-month'?/ตรวจหรือส่งเวลาประจำเดือน/:/มีบันทึกเวลาปฏิบัติงานแล้ว/;
     await expect(page.locator('.modal__footer').getByText(expected)).toBeVisible();
    }else if(action==='two-tabs'){
     const other=await context.newPage();watch(other);await open(other);await map(other);await check(other);
     await check(page);await submit(page,200);await expect(dialog(page)).toHaveCount(0);
     await submit(other,409);await expect(commit(other)).toBeDisabled();await verifyMerged();await other.close();
    }else if(['target-changed','source-changed'].includes(action)){
     const id=action==='target-changed'?data.target:data.source;
     const read=await context.request.get(`${origin}/api/v1/teaching-courses/${id}`);
     const patch=await context.request.patch(`${origin}/api/v1/teaching-courses/${id}/info`,{headers:{'X-Edit-Views':read.headers()['x-edit-views'],'Idempotency-Key':crypto.randomUUID()},data:{name_th:'Changed after preview'}});
     if(patch.status()!==200)throw Error(`Concurrent edit: ${patch.status()} ${await patch.text()}`);
     await check(page);await submit(page,409);await expect(commit(page)).toBeDisabled();
     // A new successful inspection should let the user review and retry.
     await inspect(page);await check(page);await submit(page,200);await expect(dialog(page)).toHaveCount(0);await verifyMerged();
    }else{
     for(let i=0;i<3;i++){await inspect(page);await expect(approve(page)).toBeEnabled()}
     await page.locator('.modal__body').evaluate(el=>{el.scrollTop=0});await check(page);
     await submit(page,200);await expect(dialog(page)).toHaveCount(0);await verifyMerged();
    }
   }
   await Promise.all(pending);if(errors.length)throw Error(errors.join('\n'));
   await page.screenshot({path:`/tmp/merge-production-${data.mode}.png`,fullPage:true});
   results.push({mode:data.mode,passed:true,trace});console.log(`PASS production ${data.mode}`);
  }catch(e){
   await Promise.all(pending);await page.screenshot({path:`/tmp/merge-production-${data.mode}-failure.png`,fullPage:true}).catch(()=>{});
   results.push({mode:data.mode,passed:false,error:String(e),trace,errors});console.error(`FAIL production ${data.mode}:`,String(e),JSON.stringify(trace));
  }finally{await writeFile('/tmp/merge-production-results.json',JSON.stringify(results,null,2));await context.close();await browser.close();browser=undefined}
 }
 await writeFile('/tmp/merge-production-results.json',JSON.stringify(results,null,2));
 if(results.some(r=>!r.passed))throw Error(`${results.filter(r=>!r.passed).length} production-page scenarios failed; /tmp/merge-production-results.json`);
}finally{
 await browser?.close();if(gateway)await new Promise(resolve=>gateway.close(resolve));await stop(server);await rm(tls,{recursive:true,force:true});
}
