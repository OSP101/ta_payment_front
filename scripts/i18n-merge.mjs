// Merges messages/parts/*.json (written by parallel translation batches) into
// messages/en.json. A part wins over an older entry; two parts that disagree
// on the same key are reported, first one alphabetically kept.
//   node scripts/i18n-merge.mjs [--clean]   (--clean deletes the parts after)
import fs from "node:fs";
const dir = "messages/parts";
const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const from = {};
let added = 0, changed = 0;
const parts = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort() : [];
for (const f of parts) {
  const part = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  for (const [k, v] of Object.entries(part)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (from[k] && en[k] !== v) { console.log(`conflict "${k}": ${from[k]}="${en[k]}" vs ${f}="${v}" (kept first)`); continue; }
    if (!(k in en)) added++; else if (en[k] !== v) changed++;
    en[k] = v; from[k] = from[k] ?? f;
  }
}
const sorted = Object.fromEntries(Object.entries(en).sort(([a], [b]) => a.localeCompare(b, "th")));
fs.writeFileSync("messages/en.json", JSON.stringify(sorted, null, 1) + "\n");
if (process.argv.includes("--clean")) parts.forEach(f => fs.unlinkSync(`${dir}/${f}`));
console.log(`merged ${parts.length} parts: +${added} new, ${changed} changed, ${Object.keys(sorted).length} total`);
