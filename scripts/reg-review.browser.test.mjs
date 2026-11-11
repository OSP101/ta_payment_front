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
for (const c of sample.review.courses) c.lecturer_ids = [sample.review.lecturers[0].id];
sample.review.courses.push(...Array.from({ length: 40 }, (_, i) => ({ source_cells: [], code: `ZZ${800000 + i}`, name: `รายวิชาตัวอย่างสำหรับทดสอบการเลื่อนแยกส่วน ${i + 1}`, unit: "3 (3-0-6)", level: "undergrad", source_row: 1000+i, officer_raw: "", lecturer_ids: [], unassigned_reason: "", skip: true, skip_reason: "มีในระบบแล้ว", existing_id: `20000000-0000-4000-8000-${String(i).padStart(12,"0")}`, existing_version: "1", merge_into: "", sections: [] })));
const firstSection = sample.review.courses[0].sections[0];
firstSection.students = null;
const errorIssue = { id: "browser-students-required", severity: "error", code: sample.review.courses[0].code, section_id: firstSection.id, message: `แถว ${firstSection.source_row} SEC ${firstSection.sec_no}: จำนวนรับยังว่าง กรุณากรอกจำนวนที่ถูกต้อง` };
const moreWarnings = Array.from({length:6},(_,i)=>({id:`browser-section-warning-${i}`,severity:"warning",code:sample.review.courses[0].code,section_id:firstSection.id,message:`รายการตรวจสอบ ${i+1}: กรุณาตรวจเทียบข้อมูลจำนวนรับและกลุ่มหลักสูตรกับไฟล์ต้นฉบับ REG รวมทั้งตารางเรียนและห้องที่ใช้งาน เพื่อยืนยันว่าข้อมูลพร้อมนำไปใช้ในระบบ หากยังไม่ทราบข้อมูลบางส่วนให้ระบุเหตุผลและติดตามข้อมูลให้ครบก่อนดำเนินการขอ TA และคำนวณงบประมาณต่อไป`}));
const issue = { id: "browser-review-warning", severity: "warning", code: sample.review.courses[0].code, message: "ตรวจรายชื่ออาจารย์ที่จับคู่กับข้อความจาก REG และผู้รับผิดชอบหลัก" };
sample.review.issues = [errorIssue, issue, ...moreWarnings]; sample.review.acknowledged = []; sample.review.ready = false; sample.review.confirmed = false;
const port = Number(process.env.REG_REVIEW_PORT || 3317);
const route = `reg-review-regression-${process.pid}`;
const dir = path.resolve("app", route);
await mkdir(dir);
await writeFile(path.join(dir, "page.tsx"), `"use client";
import {useState} from 'react';import ImportModal from '../staff/teaching/ImportModal';
export default function Test(){const [open,setOpen]=useState(true);return <main><button onClick={()=>setOpen(true)}>Open import</button><ImportModal open={open} onClose={()=>setOpen(false)} termId="test-term" termLabel="ภาคปลาย 2569" /></main>}`);
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
    const page = await browser.newPage({ viewport }); page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/v1/auth/heartbeat", r => r.fulfill({ json: { ok: true } }));
    await page.route("**/api/v1/teaching-courses/import*", async route => {
      const request = route.request();
      const form = await new Request("http://test/import", { method: "POST", headers: { "content-type": request.headers()["content-type"] }, body: request.postDataBuffer() }).formData();
      const review = form.get("review") ? JSON.parse(String(form.get("review"))) : structuredClone(sample.review);
      if (request.url().includes("dry_run=1")) {
        review.validation_hash = "server-validated";
        review.issues = [...(review.courses[0].sections[0].students == null ? [errorIssue] : []), issue, ...moreWarnings];
        review.ready = review.issues.every(i => i.severity === "warning" && review.acknowledged.includes(i.id));
        await route.fulfill({ json: { ...sample, review } });
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
      const checks = page.locator("#reg-pane-issues").getByRole("checkbox");
      for (let n=0;n<await checks.count();n++) if (!await checks.nth(n).isChecked()) await checks.nth(n).check();
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
    await showPane('issues');await scroll('.reg-issue-scroll',0);await page.locator('.reg-issue[data-severity="error"]').getByRole('button',{name:'ไปจุดที่ต้องตรวจ',exact:true}).click();
    await expect(page.locator('[data-reg-target][data-active="true"]')).toHaveAttribute('data-reg-target',firstSection.id);
    const capacity=page.getByRole('spinbutton',{name:'จำนวนรับจาก REG (ยังไม่ใช่ยอดลงทะเบียนจริง)',exact:true}).first();
    await expect(capacity).toHaveAttribute('aria-invalid','true');await expect(capacity).toBeInViewport();
    if(viewport.width>=1024)await scroll('.reg-course-scroll',0);
    await page.screenshot({path:`/tmp/reg-workspace-${viewport.width}.png`,fullPage:true});
    await capacity.fill('5');await page.getByRole('button',{name:'ตรวจสอบอีกครั้ง',exact:true}).click();
    await expect(page.locator('.reg-issue[data-severity="error"]')).toHaveCount(0);
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
    await sidebarSearch.fill("");
    await showPane("details");
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
    await acknowledgeWarnings();
    await page.getByRole("button", { name: "ตรวจสอบอีกครั้ง", exact: true }).click();
    const final = page.getByRole("checkbox", { name: /ฉันตรวจค่าที่แก้ไข/ });
    await expect(final).toBeEnabled(); await final.check(); await expect(commit()).toBeEnabled();
    await showPane("details");
    await lecturerPicker().click(); await lecturerSearch().fill("typed-without-selecting"); await lecturerSearch().press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(commit()).toBeEnabled(); await expect(final).toBeChecked();
    await expect(page.getByRole("heading", { name: "ออกจากการตรวจสอบไฟล์?", exact: true })).toHaveCount(0);
    await page.getByLabel("ชื่อวิชา", { exact: true }).fill("WEB MAPPING APPLICATION corrected");
    await expect(commit()).toBeDisabled(); await expect(final).not.toBeChecked();
    await acknowledgeWarnings();
    await page.getByRole("button", { name: "ตรวจสอบอีกครั้ง", exact: true }).click();
    await final.check(); await commit().click();
    await expect(page.getByText(/นำเข้าเสร็จ|นำเข้าเรียบร้อย|ผลการนำเข้า/).first()).toBeVisible();
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  if (requests.length !== 2 || requests.some(r => !r.confirmed || !r.validation_hash || !r.acknowledged.includes(issue.id) || r.courses[0].sections.length !== 2 || r.courses[0].lecturer_ids[0] !== targetLecturer.id || r.courses[0].merge_into !== "")) throw new Error("incorrect reviewed payload");
  console.log("PASS viewport-bounded workspace, independent scrolling in all three panes, pinned header/footer, mobile tabs, error jump and highlighting, search across 300+ lecturers, acknowledgement and commit payload");
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
