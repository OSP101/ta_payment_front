// Private fixture JSON is emitted by TestREGRealWorkbookReviewedCommit when
// REG_PREVIEW_OUTPUT is set. It is never committed to the repository.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import path from "node:path";
const fixture = process.env.REG_REVIEW_PREVIEW;
if (!fixture) throw new Error("Set REG_REVIEW_PREVIEW to the private preview JSON produced by the backend fixture test");
const sample = JSON.parse(await readFile(fixture, "utf8"));
sample.review.courses = sample.review.courses.filter(c => ["SC333302", "CP352003"].includes(c.code)).reverse();
sample.review.lecturers[0].email = "initial@kku.ac.th";
const targetLecturer = { id: "10000000-0000-4000-8000-000000000999", name: "อาจารย์ ชื่อสำหรับทดสอบค้นหา", email: "target-search@kku.ac.th" };
sample.review.lecturers.push(...Array.from({ length: 300 }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, name: `อาจารย์ตัวอย่าง ${i}`, email: `lecturer-${i}@example.test` })), targetLecturer);
sample.review.lecturers.push(...[1,2].map(i=>({ id:`30000000-0000-4000-8000-${String(i).padStart(12,"0")}`,name:"อาจารย์ชื่อซ้ำทดสอบ",email:`same-name-${i}@example.test` })));
sample.review.courses[1].lecturer_match_verified = true;
sample.review.courses[0].unmatched_officer_names = ["ชื่อที่สะกดต่างจากบัญชี"];
for (const c of sample.review.courses) c.lecturer_ids = [sample.review.lecturers[0].id];
sample.review.courses.push(...Array.from({ length: 40 }, (_, i) => ({ source_cells: [], code: `ZZ${800000 + i}`, name: `รายวิชาตัวอย่างสำหรับทดสอบการเลื่อนแยกส่วน ${i + 1}`, unit: "3 (3-0-6)", level: "undergrad", source_row: 1000+i, officer_raw: "", lecturer_ids: [], unassigned_reason: "", skip: true, skip_reason: "มีในระบบแล้ว", existing_id: `20000000-0000-4000-8000-${String(i).padStart(12,"0")}`, existing_version: "1", merge_into: "", sections: [] })));
const firstSection = sample.review.courses[0].sections[0];
firstSection.students = null;
firstSection.curriculum = "";
const errorIssue = { id: "browser-students-required", severity: "error", code: sample.review.courses[0].code, section_id: firstSection.id, message: `แถว ${firstSection.source_row} SEC ${firstSection.sec_no}: จำนวนรับยังว่าง กรุณากรอกจำนวนที่ถูกต้อง` };
const curriculumIssue = { id: "browser-curriculum-required", severity: "error", code: sample.review.courses[0].code, section_id: firstSection.id, message: `แถว ${firstSection.source_row} SEC ${firstSection.sec_no}: ระบุกลุ่มหลักสูตรก่อนนำเข้า (OTHER สำหรับคณะอื่นหรือกลุ่มทั่วไป)` };
const zeroIssue = { id: "browser-zero-students", severity: "warning", code: sample.review.courses[0].code, section_id: firstSection.id, message: "จำนวนรับเป็น 0 คน กรุณายืนยัน" };
const moreWarnings = Array.from({length:6},(_,i)=>({id:`browser-section-warning-${i}`,kind:"multi_programme",severity:"warning",code:sample.review.courses[0].code,section_id:firstSection.id,message:`รายการตรวจสอบ ${i+1}: กรุณาตรวจเทียบข้อมูลจำนวนรับและกลุ่มหลักสูตรกับไฟล์ต้นฉบับ REG รวมทั้งตารางเรียนและห้องที่ใช้งาน เพื่อยืนยันว่าข้อมูลพร้อมนำไปใช้ในระบบ หากยังไม่ทราบข้อมูลบางส่วนให้ระบุเหตุผลและติดตามข้อมูลให้ครบก่อนดำเนินการขอ TA และคำนวณงบประมาณต่อไป`}));
const issue = { id: "browser-review-warning", kind: "lecturer_match", severity: "warning", code: sample.review.courses[0].code, message: "ตรวจรายชื่ออาจารย์ที่จับคู่กับข้อความจาก REG และผู้รับผิดชอบหลัก" };
sample.review.issues = [errorIssue, curriculumIssue, issue, ...moreWarnings]; sample.review.acknowledged = []; sample.review.ready = false; sample.review.confirmed = false;
const port = Number(process.env.REG_REVIEW_PORT || 3317);
const route = `reg-review-regression-${process.pid}`;
const dir = path.resolve("app", route);
await mkdir(dir);
await writeFile(path.join(dir, "page.tsx"), `"use client";
import {useState} from 'react';import ImportModal from '../staff/teaching/ImportModal';
export default function Test(){const [open,setOpen]=useState(true);return <main><button onClick={()=>setOpen(true)}>Open import</button><ImportModal draftOwner="browser-test-owner" onResume={()=>setOpen(true)} open={open} onClose={()=>setOpen(false)} termId="test-term" termLabel="ภาคปลาย 2569" /></main>}`);
let log = "", browser;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", String(port)], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", d => log += d); server.stderr.on("data", d => log += d);
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 120) throw new Error(log);
    try { if ((await fetch(`http://localhost:${port}/${route}`, { signal: AbortSignal.timeout(4000) })).ok) break; } catch {}
    await pause(500);
  }
  browser = await chromium.launch(process.env.REG_CHROME_CHANNEL ? { channel: process.env.REG_CHROME_CHANNEL } : {});
  const errors = [], requests = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    let delayNext = 0, failNext = false, dryRuns = 0, delayedFinished = false;
    const page = await browser.newPage({ viewport }); page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/v1/auth/heartbeat", r => r.fulfill({ json: { ok: true } }));
    await page.route("**/api/v1/teaching-courses/import*", async route => {
      const request = route.request();
      const form = await new Request("http://test/import", { method: "POST", headers: { "content-type": request.headers()["content-type"] }, body: request.postDataBuffer() }).formData();
      const review = form.get("review") ? JSON.parse(String(form.get("review"))) : structuredClone(sample.review);
      if (request.url().includes("dry_run=1")) {
        dryRuns++;
        const delay = delayNext; delayNext = 0;
        if (delay) await pause(delay);
        if (failNext) { failNext = false; await route.fulfill({ status: 503, json: { error: "validation temporarily unavailable" } }); return; }
        review.validation_hash = "server-validated";
        const section = review.courses[0].sections[0];
        review.issues = [...(section.students == null ? [errorIssue] : []), ...(section.curriculum ? [] : [curriculumIssue]), ...(section.students === 0 ? [zeroIssue] : []), issue, ...moreWarnings];
        review.ready = review.issues.every(i => i.severity === "warning" && review.acknowledged.includes(i.id));
        await route.fulfill({ json: { ...sample, review } });
        if (delay) delayedFinished = true;
      } else {
        requests.push(review);
        await route.fulfill({ json: { row_count: 2, created_ids: ["created"], created_codes: ["SC333302"], warning_count: 0, error_count: 0, errors: [] } });
      }
    });
    await page.goto(`http://localhost:${port}/${route}`);
    await page.getByRole("button", { name: "Open import", exact: true }).waitFor();
    try { await page.getByLabel("ไฟล์รายวิชาจาก REG (.xls หรือ .xlsx)").waitFor({ timeout: 10000 }); }
    catch (error) { console.log("UI_ERRORS", errors, "BODY", await page.locator("body").innerText(), "SERVER", log.slice(-4000)); throw error; }
    await page.getByLabel("ไฟล์รายวิชาจาก REG (.xls หรือ .xlsx)").setInputFiles({ name: "reg.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("test file") });
    await page.getByRole("button", { name: "อ่านไฟล์", exact: true }).click();
    const commit = () => page.getByRole("button", { name: "ยืนยันนำเข้า", exact: true });
    await expect(page.getByRole("heading", { name: /SC333302/ })).toBeVisible();
    await expect(commit()).toBeDisabled();
    const showPane = async id => { const tab = page.locator(`#reg-tab-${id}`); if (await tab.isVisible()) await tab.click(); };
    const acknowledgeWarnings = async () => {
      await showPane("issues");
      const checks = page.locator('#reg-pane-issues .reg-issue[data-acknowledged="false"]').getByRole("checkbox");
      while (await checks.count()) {
        const remaining = await checks.count();
        await checks.first().click();
        await expect(checks).toHaveCount(remaining - 1);
      }
    };
    const frame = async () => page.evaluate(() => {
      const dialog=document.querySelector('.reg-review-workspace'),footer=dialog?.querySelector('.modal__footer'),header=dialog?.querySelector('.modal__header'),body=dialog?.querySelector('.modal__body');
      return {top:dialog?.getBoundingClientRect().top,bottom:dialog?.getBoundingClientRect().bottom,footer:footer?.getBoundingClientRect().bottom,header:header?.getBoundingClientRect().top,bodyScroll:body?.scrollTop,pageScroll:document.documentElement.scrollTop,width:document.documentElement.scrollWidth,viewport:innerWidth,height:innerHeight};
    });
    const before=await frame();
    if (before.top < -1 || before.bottom > viewport.height+1 || before.footer > viewport.height+1 || before.width > viewport.width+1) throw new Error(`workspace exceeds viewport: ${JSON.stringify(before)}`);
    const scroll = async (selector,top) => page.locator(selector).evaluate((el,value)=>{el.scrollTop=value;return el.scrollTop},top);
    if (viewport.width>=1024) {
      if (await scroll('.reg-detail-scroll',180)<=0) throw new Error('details do not scroll');
      if (await scroll('.reg-course-scroll',0)!==0 || await scroll('.reg-issue-scroll',0)!==0) throw new Error('panes moved together');
      if (await scroll('.reg-course-scroll',180)<=0) throw new Error('course list does not scroll');
      if (await scroll('.reg-issue-scroll',180)<=0) throw new Error('issues do not scroll');
      if (await page.locator('.reg-detail-scroll').evaluate(el=>el.scrollTop)!==180) throw new Error('details scrolled with another pane');
    } else {
      await showPane('courses'); if(await scroll('.reg-course-scroll',180)<=0) throw new Error('mobile course list does not scroll');
      await showPane('details'); if(await scroll('.reg-detail-scroll',180)<=0) throw new Error('mobile details do not scroll');
      await showPane('issues'); if(await scroll('.reg-issue-scroll',180)<=0) throw new Error('mobile issues do not scroll');
      await showPane('details'); if(await page.locator('.reg-detail-scroll').evaluate(el=>el.scrollTop)!==180) throw new Error('mobile detail position was lost');
      const detailTab=page.locator('#reg-tab-details');await detailTab.focus();await detailTab.press('ArrowRight');await expect(page.locator('#reg-tab-issues')).toHaveAttribute('aria-selected','true');
    }
    const after=await frame();if(after.header!==before.header||after.footer!==before.footer||after.bodyScroll!==0||after.pageScroll!==0)throw new Error('header/footer or outer body scrolled');
    await showPane('issues');await scroll('.reg-issue-scroll',0);await page.locator('.reg-issue[data-severity="error"]').first().getByRole('button',{name:'ไปจุดที่ต้องตรวจ',exact:true}).click();
    await expect(page.locator('[data-reg-target][data-active="true"]')).toHaveAttribute('data-reg-target',firstSection.id);
    const capacity=page.getByRole('spinbutton',{name:'จำนวนรับจาก REG (ยังไม่ใช่ยอดลงทะเบียนจริง)',exact:true}).first();
    await expect(capacity).toHaveAttribute('aria-invalid','true');await expect(capacity).toBeInViewport();
    if(viewport.width>=1024)await scroll('.reg-course-scroll',0);
    await page.screenshot({path:`/tmp/reg-workspace-${viewport.width}.png`,fullPage:true});
    // Correct the actual curriculum case: only that error disappears after
    // automatic server validation; the still-empty capacity remains blocked.
    await page.getByRole('combobox',{name:'กลุ่มหลักสูตรหลัก',exact:true}).first().selectOption('CS');
    await expect(page.locator('.reg-issue[data-severity="error"]')).toHaveCount(1);
    await expect(capacity).toHaveAttribute('aria-invalid','true');
    await expect(commit()).toBeDisabled();
    await capacity.fill('5');
    await expect(page.locator('.reg-issue[data-severity="error"]')).toHaveCount(0);
    await expect(capacity).not.toHaveAttribute('aria-invalid','true');
    // Edits remain available during validation. A slower obsolete response
    // cannot reintroduce old warnings or overwrite a more recent correction.
    const beforeRace = dryRuns; delayNext = 1800;
    await capacity.fill('0');
    await expect.poll(()=>dryRuns).toBeGreaterThan(beforeRace);
    await expect(capacity).toBeEnabled(); await capacity.fill('6');
    await expect.poll(()=>dryRuns).toBeGreaterThan(beforeRace+1);
    await expect.poll(()=>delayedFinished).toBe(true);
    await expect(capacity).toHaveValue('6');
    await expect(page.getByText(zeroIssue.message,{exact:true})).toHaveCount(0);
    // A failed background validation keeps saving blocked and supports retry.
    failNext = true; await capacity.fill('7');
    await expect(page.getByText('ตรวจสอบไม่สำเร็จ กดตรวจสอบอีกครั้ง',{exact:true}).first()).toBeVisible();
    await expect(commit()).toBeDisabled();
    await page.getByRole('button',{name:'ตรวจสอบอีกครั้ง',exact:true}).click();
    await expect(page.getByText('ตรวจสอบไม่สำเร็จ กดตรวจสอบอีกครั้ง',{exact:true})).toHaveCount(0);
    await expect(capacity).toHaveValue('7');
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await expect(capacity).toHaveValue('7');
    // Wait for the durable write, then simulate browser tab discard/reload.
    await expect.poll(()=>page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ta-reg-import-drafts-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      const all=await new Promise(resolve=>{const r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result)});db.close();
      return all.some(d=>d.preview.review.courses[0].sections[0].students===7);
    })).toBe(true);
    await page.reload();
    await expect(capacity).toHaveValue('7');
    await expect(commit()).toBeDisabled();

    await showPane('details');
    await expect(page.getByRole("heading", { name: /Section 1 · ภาคปกติ/ })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /Section 1 · ภาคพิเศษ/ })).toHaveCount(1);
    await page.getByText("ดูข้อความต้นฉบับ REG ทั้งหมดของ Section", { exact: true }).first().click();
    await expect(page.getByText("ตรี : ETC.", { exact: true }).first()).toBeVisible();
    await showPane("courses");
    const sidebarSearch = page.getByRole("searchbox", { name: "ค้นหารหัสวิชา ชื่อวิชา หรืออาจารย์", exact: true });
    await sidebarSearch.fill("initial@kku.ac.th");
    await expect(page.getByRole("navigation", { name: "รายวิชาจาก REG" }).getByRole("button")).toHaveCount(2);
    await sidebarSearch.fill("CP352003");
    await expect(page.getByRole("navigation", { name: "รายวิชาจาก REG" }).getByRole("button")).toHaveCount(1);
    // A source-verified lecturer assignment has no acknowledgement task.
    await page.getByRole("navigation", { name: "รายวิชาจาก REG" }).getByRole("button").click();
    await expect(page.getByText('จับคู่ชื่อกับบัญชีที่เปิดใช้งานได้ครบและไม่กำกวมแล้ว ผู้รับผิดชอบหลักคือคนแรก',{exact:true})).toBeVisible();
    await showPane('issues');
    await expect(page.locator('#reg-pane-issues .reg-issue')).toHaveCount(0);
    await expect(page.locator('#reg-pane-issues')).toContainText('ไม่มีรายการค้างตรวจของวิชานี้');
    await showPane('courses');
    await sidebarSearch.fill("");
    await page.getByRole("navigation", { name: "รายวิชาจาก REG" }).getByRole("button").filter({hasText:'SC333302'}).click();
    await showPane("details");
    const help=page.getByRole('note');
    await expect(help).toContainText('สาเหตุที่เป็นไปได้');
    await expect(help).toContainText('ชื่อสะกดต่างกัน');
    await expect(help).toContainText('ยังไม่มีบัญชีอาจารย์');
    await expect(help).toContainText('มีอาจารย์ชื่อเหมือนกัน');
    await expect(help.getByRole('link')).toHaveAttribute('href','/staff/users');
    await expect(help.getByRole('link')).toHaveAttribute('target','_blank');
    await help.scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/reg-lecturer-help-${viewport.width}.png`,fullPage:true});
    await help.getByRole('button',{name:'ค้นหาและเลือกบัญชีอาจารย์',exact:true}).click();
    const assistedSearch=page.getByRole('searchbox',{name:'ค้นหาชื่อ นามสกุล หรืออีเมลอาจารย์',exact:true});
    await assistedSearch.fill('อาจารย์ชื่อซ้ำทดสอบ');
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
    await page.getByRole('option',{name:/same-name-2@example.test/}).click();
    await expect(page.getByRole('group',{name:'อาจารย์ลำดับ 2',exact:true})).toContainText('same-name-2@example.test');
    await page.getByRole('button',{name:'นำออก',exact:true}).nth(1).click();
    await help.getByRole('button',{name:'รีเฟรชรายชื่ออาจารย์',exact:true}).click();
    await expect(capacity).toHaveValue('7');
    const lecturerPicker = () => page.getByRole("group", { name: "อาจารย์ลำดับ 1", exact: true });
    await lecturerPicker().click();
    const lecturerSearch = () => page.getByRole("searchbox", { name: "ค้นหาชื่อ นามสกุล หรืออีเมลอาจารย์", exact: true });
    await lecturerSearch().fill("ไม่มีชื่อที่ค้นหา-xyz");
    await expect(page.getByText("ไม่พบอาจารย์ที่ตรงกับคำค้นหา ลองชื่อหรืออีเมลอื่น", { exact: true })).toBeVisible();
    await lecturerSearch().fill("ทดสอบค้นหา");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    await lecturerSearch().fill("TARGET-SEARCH@KKU.AC.TH");
    await expect(page.getByRole("listbox").getByRole("option", { name: /ชื่อสำหรับทดสอบค้นหา/ })).toBeVisible();
    // One screenshot pass, both device classes, with the searchable popover.
    await page.screenshot({ path: `/tmp/reg-search-select-${viewport.width}.png`, fullPage: true });
    await page.getByRole("listbox").getByRole("option", { name: /ชื่อสำหรับทดสอบค้นหา/ }).click();
    await expect(lecturerPicker()).toContainText("target-search@kku.ac.th");
    await page.getByRole("button", { name: "เพิ่มอาจารย์", exact: true }).click();
    await page.getByRole("group", { name: "อาจารย์ลำดับ 2", exact: true }).click();
    await lecturerSearch().fill("target-search@kku.ac.th");
    await expect(page.getByText("ไม่พบอาจารย์ที่ตรงกับคำค้นหา ลองชื่อหรืออีเมลอื่น", { exact: true })).toBeVisible();
    await lecturerSearch().fill("initial@kku.ac.th");
    await page.getByRole("listbox").getByRole("option").click();
    await page.getByRole("button", { name: "นำออก", exact: true }).nth(1).click();
    const coursePicker = () => page.getByRole("group", { name: "รหัสวิชาหลัก หากยืนยันว่าเรียนรวมกัน (ว่าง = เปิดแยก)", exact: true });
    await coursePicker().click();
    const courseSearch = page.getByRole("searchbox", { name: "ค้นหารหัสหรือชื่อวิชาที่เรียนรวม", exact: true });
    await courseSearch.fill("ไม่มีวิชาที่ค้นหา-xyz");
    await expect(page.getByText("ไม่พบวิชาที่ตรงกับคำค้นหา ลองรหัสหรือชื่อวิชาอื่น", { exact: true })).toBeVisible();
    await courseSearch.fill("database design");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    await courseSearch.fill("cp352003");
    await courseSearch.press("ArrowDown"); await courseSearch.press("Enter");
    await expect(coursePicker()).toContainText("CP352003");
    await page.getByRole("button", { name: "ล้างค่าที่เลือก: รหัสวิชาหลัก หากยืนยันว่าเรียนรวมกัน (ว่าง = เปิดแยก)", exact: true }).click();
    await expect(coursePicker()).toContainText("เปิดแยกเป็นรายวิชา");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) throw new Error(`horizontal overflow at ${viewport.width}`);
    await page.getByRole('button',{name:'จัดการหลายรายการ',exact:true}).click();
    const tools=page.getByRole('region',{name:'จัดการหลายรายการ',exact:true});
    await tools.getByRole('button',{name:'เลือกทุกวิชาที่แสดง',exact:true}).click();
    await expect(tools).toContainText('วิชาที่เลือก 2 จาก 2 วิชา');
    await tools.getByLabel('กลุ่มหลักสูตรที่จะใช้',{exact:true}).selectOption('OTHER');
    // Existing classifications are protected until staff explicitly opts out.
    await expect(tools).toContainText('รายการที่จะเปลี่ยน 1 รายการ');
    await tools.getByRole('checkbox',{name:'เติมเฉพาะ Section ที่ยังไม่มีกลุ่มหลักสูตรที่ถูกต้อง',exact:true}).uncheck();
    const bulkApply=tools.getByRole('button',{name:/^ใช้ค่ากับ/});
    await expect(bulkApply).toBeDisabled();
    const approval=tools.getByRole('checkbox',{name:'ฉันตรวจรายละเอียดและขอบเขตรายการข้างต้นแล้ว',exact:true});
    await approval.check();
    await page.screenshot({path:`/tmp/reg-bulk-tools-${viewport.width}.png`,fullPage:true});
    await bulkApply.click();
    await expect(tools.getByRole('status')).toContainText('ใช้ค่ากับ');
    await tools.getByLabel('สิ่งที่ต้องการทำพร้อมกัน',{exact:true}).selectOption('acknowledge');
    await expect(tools.getByRole('checkbox',{name:/รายชื่ออาจารย์ที่จับคู่แล้ว/})).toBeVisible();
    // Wait for the latest server validation before confirming warning groups.
    await expect(tools.getByText('รอผลตรวจล่าสุดก่อนยืนยันหลายรายการ',{exact:true})).toHaveCount(0);
    await tools.getByRole('checkbox',{name:/รายชื่ออาจารย์ที่จับคู่แล้ว/}).check();
    await tools.getByRole('checkbox',{name:/รับหลายหลักสูตร/}).check();
    await expect(tools).toContainText('รายการที่จะเปลี่ยน 7 รายการ');
    await approval.check(); await tools.getByRole('button',{name:'ยืนยัน 7 รายการ',exact:true}).click();
    await tools.getByRole('button',{name:'ปิดเครื่องมือ',exact:true}).click();
    await showPane('issues');
    await expect(page.locator('#reg-pane-issues > .reg-issue-scroll > .reg-issue')).toHaveCount(0);
    await expect(page.locator('.reg-completed-issues')).toContainText('ยืนยันแล้ว 7 รายการ');
    // All acknowledgements trigger validation too; no manual refresh needed.
    const final = page.getByRole("checkbox", { name: /ฉันตรวจค่าที่แก้ไข/ });
    await expect(final).toBeEnabled(); await final.check(); await expect(commit()).toBeEnabled();
    await showPane("details");
    await lecturerPicker().click(); await lecturerSearch().fill("typed-without-selecting"); await lecturerSearch().press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(commit()).toBeEnabled(); await expect(final).toBeChecked();
    await expect(page.getByRole("heading", { name: "ออกจากการตรวจสอบไฟล์?", exact: true })).toHaveCount(0);
    await page.getByLabel("ชื่อวิชา", { exact: true }).fill("WEB MAPPING APPLICATION corrected");
    await expect(commit()).toBeDisabled(); await expect(final).not.toBeChecked();
    await expect(page.locator('.reg-completed-issues')).toContainText('ยืนยันแล้ว 7 รายการ');
    await acknowledgeWarnings();
    await page.getByRole("button", { name: "ตรวจสอบอีกครั้ง", exact: true }).click();
    await final.check(); await commit().click();
    await expect(page.getByText(/นำเข้าเสร็จ|นำเข้าเรียบร้อย|ผลการนำเข้า/).first()).toBeVisible();
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  if (requests.length !== 2 || requests.some(r => !r.confirmed || !r.validation_hash || !r.acknowledged.includes(issue.id) || r.courses[0].sections.length !== 2 || r.courses[0].lecturer_ids[0] !== targetLecturer.id || r.courses[0].merge_into !== "" || r.courses.filter(c=>!c.skip).some(c=>c.sections.some(s=>s.curriculum!=="OTHER")))) throw new Error("incorrect reviewed payload");
  console.log("PASS exact lecturer matches without acknowledgement, unmatched-lecturer guidance, explicit duplicate-name selection, candidate refresh, scoped bulk curriculum and acknowledgement, automatic error removal, unrelated acknowledgement preservation, collapsed completed issues, stale-response rejection, failure/retry, viewport-bounded workspace, independent scrolling in all three panes, pinned header/footer, mobile tabs, error jump and highlighting, search across 300+ lecturers, acknowledgement and commit payload");
} finally {
  await browser?.close(); server.kill("SIGTERM");
  if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
  await rm(dir, { recursive: true, force: true });
  // Remove only generated checks for the ephemeral route, keeping routes.d.ts
  // (referenced by next-env.d.ts) and every source file intact.
  const generated = path.resolve(".next/dev/types/app");
  for (const name of await readdir(generated).catch(() => [])) if (name.startsWith("reg-review-regression-")) await rm(path.join(generated, name), { recursive: true, force: true });
  await rm(path.resolve(".next/dev/types/validator.ts"), { force: true });
}
