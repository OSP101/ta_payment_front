import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const origin = 'http://localhost:3330';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 for (const mobile of [false, true]) {
  const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  let mode='data';
  const zero={help_teach_hrs:0,prep_hrs:0,grade_hrs:0,other_hrs:0,check_work_hrs:0,attendance_hrs:0,ug_other_hrs:0,lab_hrs:0,lab_other_hrs:0};
  await page.route('**/api/v1/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   let body=[];
   if(path==='/me') body={id:'ta-test',roles:['ta'],first_name:'ทดสอบ',last_name:'ผู้ช่วยสอน'};
   if(path==='/teaching-courses/course-playground') body={id:'course-playground',code:'CP123456',name_th:'รายวิชาทดสอบ',sections:[]};
   if(path==='/me/assignments') {
    if(mode==='error') return route.fulfill({status:500,json:{error:'test failure'}});
    body=mode==='empty'?[]:[
     {id:'a1',sec_no:'1',level:'undergrad',track:'regular',workload:{...zero,attendance_hrs:1.5,check_work_hrs:2,lab_other_hrs:1,lab_other_desc:'เตรียมอุปกรณ์\nช่วยอธิบายการทดลองและตอบคำถามของนักศึกษา'}},
     {id:'a2',sec_no:'2',level:'master',track:'special',workload:{...zero,help_teach_hrs:2,help_teach_desc:'ช่วยอธิบายโจทย์',prep_hrs:1,prep_desc:'เตรียมใบงาน',grade_hrs:0.5,grade_desc:'ตรวจแบบฝึกหัด',other_hrs:1,other_desc:'ตอบคำถามเพิ่มเติม'}},
     {id:'a3',sec_no:'3',level:'phd',track:'regular',workload:null},
    ];
   }
   await route.fulfill({json:body});
  });
  const visit=()=>page.goto(`${origin}/dev/ta-course-preview`,{waitUntil:'networkidle',timeout:120000});
  await visit();
  await expect(page.getByText('งานที่ได้รับมอบหมาย',{exact:true})).toBeVisible();
  const ug=page.getByRole('region',{name:'กลุ่มเรียน 1'});
  const grad=page.getByRole('region',{name:'กลุ่มเรียน 2'});
  await expect(ug.getByText('รวม 4.5 ชั่วโมง/สัปดาห์')).toBeVisible();
  await expect(ug.getByText('1.5 ชั่วโมง/สัปดาห์',{exact:true})).toBeVisible();
  await expect(ug.getByText('เช็คชื่อ',{exact:true})).toBeVisible();
  await expect(ug.getByText('เตรียมการสอน',{exact:true})).toHaveCount(0);
  await expect(grad.getByText('รวม 4.5 ชั่วโมง/สัปดาห์')).toBeVisible();
  for(const text of ['ช่วยอธิบายโจทย์','เตรียมใบงาน','ตรวจแบบฝึกหัด','ตอบคำถามเพิ่มเติม']) await expect(grad.getByText(text,{exact:true})).toBeVisible();
  await expect(page.getByText('ยังไม่มีรายละเอียดชั่วโมงงานในฟอร์มคำขอ กรุณาติดต่ออาจารย์ผู้สอน')).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
  await page.screenshot({path:`/tmp/ta-course-workload-${mobile?'mobile':'desktop'}.png`,fullPage:true});
  mode='empty'; await visit();
  await expect(page.getByText('ยังไม่มีงานที่ได้รับมอบหมาย',{exact:true})).toBeVisible();
  mode='error'; await visit();
  await expect(page.getByText('โหลดรายละเอียดงานไม่สำเร็จ',{exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS: desktop/mobile request duties, descriptions, weekly totals, missing forms, empty and error states');
} finally {await browser.close();}
