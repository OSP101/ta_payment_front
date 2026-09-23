#!/usr/bin/env node
/**
 * Prints (or exports) the capture checklist for the manual's screenshots and
 * GIFs, straight from `content/docs/media.json` — the SAME file the
 * `Screenshot`/`Gif` components in `app/components/docs/` check against at
 * render time (via `fs.existsSync`). There is no separate "coverage" build
 * step to keep in sync: this script and the live pages read one file.
 *
 * Usage:
 *   node scripts/docs-media-checklist.mjs                 # missing items, grouped, to stdout
 *   node scripts/docs-media-checklist.mjs --all            # every item, not just missing
 *   node scripts/docs-media-checklist.mjs --csv > out.csv  # machine-readable export
 *   node scripts/docs-media-checklist.mjs --priority P1    # only P1 (must-have for v1.0)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const media = JSON.parse(readFileSync(path.join(root, "content/docs/media.json"), "utf-8"));

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const asCsv = args.includes("--csv");
const priorityFilter = (() => {
  const i = args.indexOf("--priority");
  return i >= 0 ? args[i + 1] : null;
})();

function isCaptured(entry) {
  return existsSync(path.join(root, "public/docs/v1", entry.file));
}

let items = media.map((m) => ({ ...m, captured: isCaptured(m) }));
if (priorityFilter) items = items.filter((m) => m.priority === priorityFilter);
if (!showAll) items = items.filter((m) => !m.captured);

if (asCsv) {
  const cols = ["id", "kind", "audience", "priority", "captured", "route", "account", "desc", "file"];
  console.log(cols.join(","));
  for (const m of items) {
    const row = cols.map((c) => {
      const v = String(m[c] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    });
    console.log(row.join(","));
  }
  process.exit(0);
}

const byAudience = new Map();
for (const m of items) {
  if (!byAudience.has(m.audience)) byAudience.set(m.audience, []);
  byAudience.get(m.audience).push(m);
}

const AUD_LABEL = { common: "ทั่วไป (common)", ta: "ผู้ช่วยสอน (ta)", lecturer: "อาจารย์ (lecturer)", staff: "เจ้าหน้าที่ (staff)" };
const total = media.length;
const capturedCount = media.filter((m) => isCaptured(m)).length;

console.log(`\nสถานะการแคปภาพคู่มือ: ${capturedCount}/${total} (${Math.round((capturedCount / total) * 100)}%)\n`);

for (const [audience, list] of byAudience) {
  console.log(`\n=== ${AUD_LABEL[audience] ?? audience} — ${list.length} รายการ ===`);
  for (const m of list.sort((a, b) => (a.priority < b.priority ? -1 : 1))) {
    console.log(`  [${m.priority}] ${m.id.padEnd(10)} (${m.kind})  ${m.desc}`);
    console.log(`         route: ${m.route}   account: ${m.account}`);
    console.log(`         save as: public/docs/v1/${m.file}`);
  }
}

console.log(`\nรวม ${items.length} รายการที่ยังไม่มีไฟล์ (จากทั้งหมด ${total})\n`);
