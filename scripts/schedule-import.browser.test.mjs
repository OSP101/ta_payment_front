// Temporary route exercises the real component, PDF worker, and browser controls.
// It is removed in finally and is never part of a production build.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import path from "node:path";
const port = Number(process.env.REG_TEST_PORT || 3311);
const route = `schedule-import-regression-${process.pid}`;
const dir = path.resolve("app", route);
const fixtureDir = process.env.REG_PDF_FIXTURES;
if (!fixtureDir)
  throw new Error(
    "Set REG_PDF_FIXTURES to the folder containing the five original PDFs.",
  );
await mkdir(dir);
await writeFile(
  path.join(dir, "page.tsx"),
  `"use client";
import {useState} from 'react';
import ScheduleImportModal from '../components/ScheduleImportModal';
import ScheduleGrid from '../components/ScheduleGrid';
import type {Block} from '../components/ScheduleGrid';
export default function Test(){const [open,setOpen]=useState(true);const [result,setResult]=useState<unknown>(null);const [grid,setGrid]=useState<Block>({id:"grid",term_id:"term",course_code:"342181",course_name:"",sec_no:"1",kind:"",day_of_week:1,start_time:"08:15",end_time:"10:15",note:"",is_wba:false});return <main><button onClick={()=>setOpen(true)}>Open import</button><pre data-testid="import-result">{result?JSON.stringify(result):''}</pre><div data-testid="grid"><ScheduleGrid blocks={[grid]} onCreateDraft={()=>{}} onSelectBlock={()=>{}} onMoveBlock={(_,day,start,end)=>setGrid({...grid,day_of_week:day,start_time:start,end_time:end})} onResizeBlock={(_,start,end)=>setGrid({...grid,start_time:start,end_time:end})} /></div><pre data-testid="grid-result">{JSON.stringify(grid)}</pre><ScheduleImportModal open={open} termId="term" term={{id:'term',academic_year:2565,semester:2,is_active:true}} onClose={()=>setOpen(false)} onImport={r=>{setResult(r);setOpen(false)}} /></main>}
`,
);
let log = "";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", String(port)],
  {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (d) => {
  log += d;
});
server.stderr.on("data", (d) => {
  log += d;
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${log}`);
    try {
      const r = await fetch(`http://localhost:${port}/${route}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(500);
  }
  if (!ready) throw new Error(`Next did not start: ${log}`);
  browser = await chromium.launch(
    process.env.REG_CHROME_CHANNEL
      ? { channel: process.env.REG_CHROME_CHANNEL }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("**/api/v1/auth/heartbeat", (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  const runtimeErrors = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await page.route("**/api/v1/class-kinds?*", (r) => r.fulfill({ json: [] }));
  await page.goto(`http://localhost:${port}/${route}`);
  const upload = () =>
    page.getByLabel("ไฟล์ตารางเรียน (.pdf หรือ .ics)", { exact: true });
  const submit = () =>
    page.getByRole("button", { name: "ยืนยันและนำเข้า", exact: true });
  const ack = () =>
    page.getByRole("checkbox", {
      name: "ฉันตรวจเทียบกับไฟล์ต้นฉบับและแก้ไขครบแล้ว ข้อมูลทุกคาบถูกต้อง และยืนยันให้แทนที่ตารางเดิมของภาคเรียนที่เลือก",
      exact: true,
    });
  const sections = () => page.locator('section[aria-label^="คาบที่"]');
  const timetable = () => page.getByRole("dialog").locator("[data-block]");
  const gridView = () =>
    page.getByRole("button", { name: "ตารางเรียน", exact: true });
  const detailView = () =>
    page.getByRole("button", { name: "รายละเอียดแต่ละคาบ", exact: true });
  await expect(submit()).toBeDisabled();
  for (let i = 0; i < 5; i++) {
    if (i)
      await page
        .getByRole("button", { name: "Open import", exact: true })
        .click();
    await upload().setInputFiles(
      path.join(fixtureDir, `repstudenttime${i ? ` (${i})` : ""}.pdf`),
    );
    await expect(timetable()).toHaveCount(i < 2 ? 10 : 12, { timeout: 60000 });
    await expect(gridView()).toHaveAttribute("aria-pressed", "true");
    await expect(sections()).toHaveCount(0);
    await expect(page.getByRole("dialog").locator("[data-handle]")).toHaveCount(
      0,
    );
    if (i === 0) {
      await timetable().first().click();
      await expect(sections()).toHaveCount(1);
      await page
        .getByLabel("ชื่อวิชา คาบที่ 1", { exact: true })
        .fill("แก้จากมุมมองตาราง");
      await expect(timetable().first()).toContainText("แก้จากมุมมองตาราง");
      if (process.env.REG_CAPTURE) {
        await mkdir("/tmp/reg-pdf-study", { recursive: true });
        await gridView().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: "/tmp/reg-pdf-study/import-grid-desktop.png",
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await gridView().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: "/tmp/reg-pdf-study/import-grid-mobile.png",
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    }
    await detailView().click();
    await expect(sections()).toHaveCount(i < 2 ? 10 : 12);
    await expect(submit()).toBeDisabled();
    const fixture = JSON.parse(
      await readFile(`scripts/fixtures/reg-pdf/sample-${i}.json`, "utf8"),
    );
    const first = fixture.expected[0].split("/");
    await expect(
      page.getByLabel("รหัสวิชา คาบที่ 1", { exact: true }),
    ).toHaveValue(first[2]);
    if (i === 0) {
      await mkdir("/tmp/reg-pdf-study", { recursive: true });
      if (process.env.REG_CAPTURE)
        await page.screenshot({
          path: "/tmp/reg-pdf-study/import-desktop.png",
        });
      await ack().check();
      await gridView().click();
      await expect(ack()).toBeChecked();
      await expect(timetable().first()).toContainText("แก้จากมุมมองตาราง");
      await detailView().click();
      await expect(
        page.getByLabel("ชื่อวิชา คาบที่ 1", { exact: true }),
      ).toHaveValue("แก้จากมุมมองตาราง");
      await expect(submit()).toBeEnabled();
      await page.getByLabel("ห้อง คาบที่ 1", { exact: true }).fill("CP-test");
      await expect(ack()).not.toBeChecked();
      await expect(submit()).toBeDisabled();
      await page
        .getByLabel("ชื่อวิชา คาบที่ 1", { exact: true })
        .fill("ชื่อวิชาที่แก้ไข");
      await page.getByLabel("กลุ่ม คาบที่ 1", { exact: true }).fill("invalid");
      await expect(ack()).toBeDisabled();
      await expect(submit()).toBeDisabled();
      await page.getByLabel("กลุ่ม คาบที่ 1", { exact: true }).fill("99");
      await page
        .getByRole("button", { name: "เพิ่มคาบที่ขาด", exact: true })
        .click();
      await expect(sections()).toHaveCount(11);
      await expect(submit()).toBeDisabled();
      await page
        .getByRole("button", { name: "ลบคาบที่ 11", exact: true })
        .click();
      await expect(sections()).toHaveCount(10);
      await page.getByLabel("วัน คาบที่ 1", { exact: true }).selectOption("0");
      // A minute-level correction must not be rounded back to :00 or :30.
      const minute = page
        .getByLabel("เวลาเริ่ม คาบที่ 1", { exact: true })
        .getByRole("spinbutton")
        .nth(1);
      await minute.focus();
      await minute.press("ArrowUp");
      await minute.press("Tab");
    }
    if (i) {
      await expect(ack()).toBeDisabled();
      await page
        .getByRole("checkbox", {
          name: "ยืนยันใช้ข้อมูลจากไฟล์นี้กับภาคเรียนที่เลือก แม้ภาคเรียนต่างกัน",
          exact: true,
        })
        .check();
    }
    if (i === 1) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("dialog").evaluate((el) => (el.scrollTop = 0));
      if (process.env.REG_CAPTURE)
        await page.screenshot({ path: "/tmp/reg-pdf-study/import-mobile.png" });
      const overflow = await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 2);
      expect(overflow).toBe(false);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await ack().check();
    await expect(submit()).toBeEnabled();
    await submit().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = JSON.parse(
      await page.getByTestId("import-result").textContent(),
    );
    if (i === 0) {
      expect(saved.blocks[0]).toMatchObject({
        day_of_week: 0,
        note: "CP-test",
        sec_no: "99",
        course_name: "ชื่อวิชาที่แก้ไข",
        start_time: "10:01",
      });
    } else
      expect(
        saved.blocks.map(
          (b) =>
            `${b.day_of_week}/${b.start_time}-${b.end_time}/${b.course_code}/${b.sec_no}`,
        ),
      ).toEqual(fixture.expected);
  }
  // Existing ICS path remains editable and requires exactly the same confirmation.
  await page.getByRole("button", { name: "Open import", exact: true }).click();
  await upload().setInputFiles({
    name: "schedule.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(
      "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261109T010000Z\nDTEND:20261109T030000Z\nSUMMARY:LI101001 (3) 1.\nEND:VEVENT\nEND:VCALENDAR",
    ),
  });
  await expect(timetable()).toHaveCount(1);
  await detailView().click();
  await expect(sections()).toHaveCount(1);
  await expect(submit()).toBeDisabled();
  await ack().check();
  await submit().click();
  // Malformed files never leave a successful stale preview available.
  await page.getByRole("button", { name: "Open import", exact: true }).click();
  await upload().setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(
    page.getByText("ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง กรุณาส่งออกจาก REG อีกครั้ง", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(sections()).toHaveCount(0);
  await expect(submit()).toBeDisabled();
  // Moving a quarter-hour session preserves its exact minutes and duration.
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const grid = page.getByTestId("grid");
  await grid.scrollIntoViewIfNeeded();
  const timeline = await grid.locator(".select-none").boundingBox();
  const box = await grid.locator("[data-block]").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + timeline.width / 24,
    box.y + box.height / 2,
    { steps: 3 },
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        JSON.parse(await page.getByTestId("grid-result").textContent())
          .start_time,
    )
    .toBe("08:45");
  expect(
    JSON.parse(await page.getByTestId("grid-result").textContent()).end_time,
  ).toBe("10:45");
  const handle = await grid.locator("[data-handle]").first().boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    timeline.x + timeline.width / 12,
    handle.y + handle.height / 2,
    { steps: 3 },
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        JSON.parse(await page.getByTestId("grid-result").textContent())
          .start_time,
    )
    .toBe("09:00");
  expect(
    JSON.parse(await page.getByTestId("grid-result").textContent()).end_time,
  ).toBe("10:45");
  // A late result from an earlier file must never replace the latest selected file.
  let deferred;
  let release;
  const waiting = new Promise((r) => (release = r));
  await page.unroute("**/api/v1/class-kinds?*");
  await page.route("**/api/v1/class-kinds?*", async (r) => {
    if (!deferred) {
      deferred = r;
      await waiting;
    }
    await r.fulfill({ json: [] });
  });
  await page.getByRole("button", { name: "Open import", exact: true }).click();
  await upload().setInputFiles(path.join(fixtureDir, "repstudenttime.pdf"));
  await expect.poll(() => !!deferred).toBe(true);
  await upload().setInputFiles(path.join(fixtureDir, "repstudenttime (2).pdf"));
  await expect(timetable()).toHaveCount(12);
  await detailView().click();
  await expect(sections()).toHaveCount(12);
  const oldResponse = page.waitForResponse(
    (r) => r.request() === deferred.request(),
  );
  release();
  await (await oldResponse).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(
    page.getByLabel("รหัสวิชา คาบที่ 1", { exact: true }),
  ).toHaveValue("342118");
  await expect(sections()).toHaveCount(12);
  await expect(submit()).toBeDisabled();
  expect(runtimeErrors).toEqual([]);
  console.log(
    "PASS: five real PDFs, browser worker, editable fields/minutes, mandatory/revoked confirmation, term mismatch, desktop/mobile, timetable/detail switching, click-to-edit, shared changes, ICS, malformed file, drag/resize and stale-result protection.",
  );
} catch (e) {
  console.error(log.slice(-14000));
  throw e;
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
  // Let Next's file watcher regenerate dev route types before stopping it.
  // Otherwise tsc would retain a reference to this now-removed temporary route.
  for (let i = 0; i < 100; i++) {
    const validator = await readFile(
      ".next/dev/types/validator.ts",
      "utf8",
    ).catch(() => "");
    if (!validator.includes(route)) break;
    await pause(100);
  }
  server.kill("SIGTERM");
}
