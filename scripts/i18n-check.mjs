// i18n check. Usage:
//   node scripts/i18n-check.mjs [paths...]         unwrapped Thai + missing keys (default: app/)
//   node scripts/i18n-check.mjs --keys [paths...]  print every translatable key found (JSON)
//   node scripts/i18n-check.mjs --summary          per-file count of unwrapped Thai
//
// "Wrapped" means the Thai literal is the first argument of t(), tc(), t.rich()
// or msg() — msg() marks a key that is translated later, where it is shown
// (status maps, constants). A line ending in `// i18n-ignore` is skipped: use
// it for Thai that is DATA (values sent to the API, matched against backend
// text, print-only forms), never for something a reader sees.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
const mode = args.includes("--keys") ? "keys" : args.includes("--summary") ? "summary" : "check";
const roots = args.filter(a => !a.startsWith("--"));
if (!roots.length) roots.push("app");
const THAI = /[฀-๿]/;
const FNS = new Set(["t", "tc", "msg"]);

function files(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.(tsx?|mjs)$/.test(p) ? [p] : [];
  return fs.readdirSync(p).flatMap(n => (n === "node_modules" || n.startsWith(".")) ? [] : files(path.join(p, n)));
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  // t.rich(...)
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "t" && e.name.text === "rich") return "t";
  return null;
}

function isKeyArg(node) {
  const p = node.parent;
  return p && ts.isCallExpression(p) && p.arguments[0] === node && FNS.has(calleeName(p) ?? "");
}

const keys = new Set();
const problems = [];
const perFile = {};
for (const f of roots.flatMap(files)) {
  if (f.includes("/lib/i18n/")) continue;
  const src = fs.readFileSync(f, "utf8");
  if (!THAI.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = src.split("\n");
  const report = (node, text, why) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    if (/i18n-ignore/.test(lines[line]) || (line > 0 && /i18n-ignore-next-line/.test(lines[line - 1]))) return;
    perFile[f] = (perFile[f] ?? 0) + 1;
    problems.push(`${f}:${line + 1}: ${why}: ${text.trim().slice(0, 70)}`);
  };
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (THAI.test(node.text)) {
        if (isKeyArg(node)) keys.add(node.text);
        else if (!(ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent))) report(node, node.text, "unwrapped string");
      }
    } else if (ts.isTemplateExpression(node)) {
      const raw = node.getText();
      if (THAI.test(raw)) report(node, raw, isKeyArg(node) ? "template literal as key (use {vars})" : "unwrapped template");
      // still visit the embedded expressions
      node.templateSpans.forEach(s => visit(s.expression));
      return;
    } else if (ts.isJsxText(node)) {
      if (THAI.test(node.text)) report(node, node.text, "JSX text");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (mode === "keys") {
  console.log(JSON.stringify([...keys].sort(), null, 1));
} else if (mode === "summary") {
  const rows = Object.entries(perFile).sort((a, b) => b[1] - a[1]);
  rows.forEach(([f, n]) => console.log(String(n).padStart(5), f));
  console.log(String(rows.reduce((s, r) => s + r[1], 0)).padStart(5), "TOTAL unwrapped in", rows.length, "files");
} else {
  const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
  const missing = [...keys].filter(k => !en[k]);
  problems.forEach(p => console.log(p));
  missing.forEach(k => console.log(`missing translation: ${k}`));
  console.log(`\n${problems.length} unwrapped, ${missing.length} keys without English, ${keys.size} keys used`);
  process.exitCode = problems.length || missing.length ? 1 : 0;
}
