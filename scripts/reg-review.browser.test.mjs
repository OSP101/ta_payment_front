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
for (const c of sample.review.courses) c.lecturer_ids = [sample.review.lecturers[0].id];
const issue = { id: "browser-review-warning", severity: "warning", code: sample.review.courses[0].code, message: "ตรวจรายชื่ออาจารย์ที่จับคู่กับข้อความจาก REG และผู้รับผิดชอบหลัก" };
sample.review.issues = [issue]; sample.review.acknowledged = []; sample.review.ready = false; sample.review.confirmed = false;
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
        review.validation_hash = "server-validated"; review.issues = [issue];
        review.ready = review.acknowledged.includes(issue.id);
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
    await expect(page.getByRole("heading", { name: /Section 1 · ภาคปกติ/ })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /Section 1 · ภาคพิเศษ/ })).toHaveCount(1);
    await page.getByText("ดูข้อความต้นฉบับ REG ทั้งหมดของ Section", { exact: true }).first().click();
    await expect(page.getByText("ตรี : ETC.", { exact: true }).first()).toBeVisible();
    // One screenshot pass, both device classes. No source fixture is exported.
    await page.screenshot({ path: `/tmp/reg-review-${viewport.width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) throw new Error(`horizontal overflow at ${viewport.width}`);
    await page.getByRole("checkbox", { name: issue.message, exact: true }).check();
    await page.getByRole("button", { name: "ตรวจสอบอีกครั้ง", exact: true }).click();
    const final = page.getByRole("checkbox", { name: /ฉันตรวจค่าที่แก้ไข/ });
    await expect(final).toBeEnabled(); await final.check(); await expect(commit()).toBeEnabled();
    await page.getByLabel("ชื่อวิชา", { exact: true }).fill("WEB MAPPING APPLICATION corrected");
    await expect(commit()).toBeDisabled(); await expect(final).not.toBeChecked();
    await page.getByRole("checkbox", { name: issue.message, exact: true }).check();
    await page.getByRole("button", { name: "ตรวจสอบอีกครั้ง", exact: true }).click();
    await final.check(); await commit().click();
    await expect(page.getByText(/นำเข้าเสร็จ|นำเข้าเรียบร้อย|ผลการนำเข้า/).first()).toBeVisible();
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  if (requests.length !== 2 || requests.some(r => !r.confirmed || !r.validation_hash || !r.acknowledged.includes(issue.id) || r.courses[0].sections.length !== 2)) throw new Error("incorrect reviewed payload");
  console.log("PASS desktop/mobile full-screen review, multiline source, separate tracks, acknowledgement, stale edit protection, commit payload");
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
