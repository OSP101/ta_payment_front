import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { initialDraft } from './fixtures/request-playground.mjs';
const expect = baseExpect.configure({ timeout: 15000 });
const origin = process.env.REQUEST_FORM_TEST_ORIGIN || 'http://localhost:3330';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const pool=Array.from({length:3000},(_,i)=>({id:`ta-${i+1}`,first_name:'ผู้ช่วยสอน',last_name:`ตัวอย่าง ${String(i+1).padStart(4,'0')}`,email:`ta${i+1}@example.test`,student_id:`S${String(i+1).padStart(5,'0')}`,study_level:'undergrad',approved_course_count:i===29?3:0,at_quota:i===29,course_cap:3,already_in_course:false,has_schedule:true}));
const browser=await chromium.launch({channel:'chrome'});
try {
 for (const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1050}});
  const errors=[], queries=[]; let failNext=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('ta-payment:request-guide:v1:lecturer-playground','1'));
  await page.route('**/api/v1/teaching-courses/*/request-draft',route=>{
   if(route.request().method()!=='GET')return route.fulfill({json:{updated_at:new Date().toISOString()}});
   const draft=initialDraft();draft.assignments[0].ta_id='ta-2999';
   return route.fulfill({json:{payload:draft,updated_at:new Date().toISOString()}});
  });
  await page.route('**/api/v1/ta-requests/candidates?*',async route=>{
   const url=new URL(route.request().url()),p=url.searchParams;
   if(p.has('ids'))return route.fulfill({json:{items:pool.filter(ta=>p.get('ids').split(',').includes(ta.id)),has_more:false}});
   const q=(p.get('q')||'').trim().toLowerCase();queries.push(q);
   if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'search unavailable'}})}
   if(q==='slow')await new Promise(r=>setTimeout(r,900));
   const rows=pool.filter(ta=>`${ta.first_name} ${ta.last_name} ${ta.email} ${ta.student_id}`.toLowerCase().includes(q));
   const offset=Number(p.get('offset')||0),limit=Number(p.get('limit')||30);
   return route.fulfill({json:{items:rows.slice(offset,offset+limit),has_more:offset+limit<rows.length}}).catch(()=>{});
  });
  await page.goto(`${origin}/dev/request-preview`, {timeout:90000});
  const person=page.locator('#request-person-0');
  await expect(person).toContainText('ta2999@example.test');
  const picker=person.locator('[data-slot=autocomplete-trigger]');
  let start=Date.now();await picker.click();
  const search=page.locator('input[name=ta-search]');await expect(search).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(30); // A TA selected on another page remains visible
  const openMs=Date.now()-start; console.log({stage:'opened',mobile,openMs});
  await expect(page.getByRole('option').filter({hasText:'ta30@example.test'})).toHaveAttribute('aria-disabled','true');
  // Exact email lookup must show an existing TA even when selected on another page.
  await search.fill('ta2@example.test');
  const alreadySelected=page.getByRole('option').filter({hasText:'ta2@example.test'});
  await expect(alreadySelected).toBeVisible();
  await expect(alreadySelected).toHaveAttribute('aria-disabled','true');
  await expect(alreadySelected).toContainText('เพิ่มแล้วในคนที่ 2');
  await search.fill('');
  await expect(page.getByRole('option')).toHaveCount(30);

  await page.getByRole('button',{name:'โหลดเพิ่ม',exact:true}).click();
  await expect(page.getByRole('option')).toHaveCount(60);
  const before=queries.length;start=Date.now();
  await search.pressSequentially('S03000',{delay:20});
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('ta3000@example.test');
  const searchMs=Date.now()-start; console.log({stage:'searched',mobile,searchMs});
  assert.equal(queries.length-before,1,'typing must be debounced');
  // New query wins even when an earlier response is slow.
  await search.fill('slow');await expect.poll(()=>queries.at(-1)).toBe('slow');
  await search.fill('ta2998@example.test');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('ta2998@example.test');
  await page.waitForTimeout(1000);
  await expect(page.getByRole('option')).toContainText('ta2998@example.test');
  // Exact selection survives a query that does not include it.
  await page.getByRole('option').click();
  await expect(person).toContainText('ta2998@example.test');
  await picker.click();failNext=true;await page.locator('input[name=ta-search]').fill('retry-me');
  await expect(page.getByText('ค้นหา TA ไม่สำเร็จ กรุณาลองใหม่',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();
  await expect(page.getByText('ไม่พบ TA ที่ตรงกัน',{exact:true})).toBeVisible();
  await page.locator('input[name=ta-search]').fill('ta2997@example.test');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('ta2997@example.test');
  await page.locator('input[name=ta-search]').press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(person.locator('[data-slot=autocomplete-value]')).toContainText('ta2997@example.test');
  await expect(page.locator('input[name=ta-search]')).toHaveCount(0);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await picker.click();await page.locator('input[name=ta-search]').fill('ta3000@example.test');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('ta3000@example.test');
  await page.screenshot({path:`/tmp/ta-candidate-search-${mobile?'mobile':'desktop'}.png`,fullPage:true});
  console.log(JSON.stringify({device:mobile?'mobile':'desktop',candidates:pool.length,openMs,searchMs,firstPageOptions:30,checks:'paging, quota, student ID, debounce, stale response, selection, retry, empty, keyboard, draft hydration'}));
  await page.getByRole('option').click();
  await expect(page.locator('input[name=ta-search]')).toHaveCount(0);
  // Creating an account resolves its name immediately, without loading all TAs.
  await page.route('**/api/v1/users', async route => {
   const input=route.request().postDataJSON();
   const user={...input,id:`new-${mobile?'mobile':'desktop'}`,approved_course_count:0,course_cap:3,has_schedule:false};
   pool.push(user);
   return route.fulfill({json:{user,temp_password:'Temporary-For-Test-Only-42!'}});
  });
  await page.getByRole('button',{name:'สร้างบัญชี TA ใหม่',exact:true}).click();
  const create=page.locator('[data-tour=req-create-ta]');
  await create.getByRole('textbox',{name:/^อีเมล/}).fill(`new-${mobile?'mobile':'desktop'}@example.test`);
  await create.getByRole('textbox',{name:/^ชื่อ/}).fill('New');
  await create.getByRole('textbox',{name:/^นามสกุล/}).fill('Candidate');
  await create.getByRole('button',{name:'สร้างบัญชี',exact:true}).click();
  await create.getByRole('button',{name:'เพิ่มเข้ารายวิชานี้',exact:true}).click();
  await expect(page.locator('div[id^="request-person-"]:visible')).toContainText(`new-${mobile?'mobile':'desktop'}@example.test`);
  console.log(`PASS: ${mobile?'mobile':'desktop'} new account selected immediately`);
  await page.close();
 }
}finally{await browser.close()}
