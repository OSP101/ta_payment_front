import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
const loaded = [];
async function moduleFrom(relative) {
  const src = await readFile(
    new URL(`../app/lib/${relative}.ts`, import.meta.url),
    "utf8",
  );
  const file = new URL(`.schedule-test-${process.pid}-${relative}.mjs`, import.meta.url);
  await writeFile(
    file,
    ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  );
  loaded.push(file);
  return import(file.href);
}
const { pdfToBlocks, regPdfPagesToBlocks } = await moduleFrom("regPdf");
const { scheduleImportErrors, canConfirmScheduleImport } =
  await moduleFrom("scheduleImport");
const { after } = await import("node:test");
after(async () => {
  for (const file of loaded) await unlink(file);
});
const fixtureDir = process.env.REG_PDF_FIXTURES;
// Private original PDFs are never committed. Explicit fixture mode must not silently skip a missing file.
const slot = (b) =>
  `${b.day_of_week}/${b.start_time}-${b.end_time}/${b.course_code}/${b.sec_no}`;
for (let i = 0; i < 5; i++) {
  const fixture = JSON.parse(
    await readFile(
      new URL(`fixtures/reg-pdf/sample-${i}.json`, import.meta.url),
      "utf8",
    ),
  );
  test(`REG layout ${i}: all days, start/end minutes, course codes and sections match reviewed expectations`, () => {
    const r = regPdfPagesToBlocks(fixture.pages, "term");
    assert.deepEqual(r.blocks.map(slot), fixture.expected);
    assert.equal(r.malformedSkipped, 0);
    assert.equal(scheduleImportErrors(r.blocks).size, 0);
    assert.ok(
      r.blocks.every(
        (b) => !b.is_wba && b.kind === "" && r.rawById[b.id] && b.course_name,
      ),
    );
    assert.equal(canConfirmScheduleImport(r, false, false, "term"), false);
  });
  test(
    `REG original PDF ${i}: real PDF.js decoding matches reviewed expectations`,
    { skip: !fixtureDir },
    async () => {
      const r = await pdfToBlocks(
        new Uint8Array(
          await readFile(
            `${fixtureDir}/repstudenttime${i ? ` (${i})` : ""}.pdf`,
          ),
        ),
        "term",
      );
      assert.deepEqual(r.blocks.map(slot), fixture.expected);
    },
  );
}
const block = {
  id: "a",
  term_id: "term",
  course_code: "LI101001",
  course_name: "",
  sec_no: "1",
  kind: "",
  day_of_week: 1,
  start_time: "08:15",
  end_time: "10:15",
  note: "",
  is_wba: false,
};
const result = { blocks: [block], malformedSkipped: 0 };
test("confirmation is mandatory and invalid edits cannot be imported", () => {
  assert.equal(canConfirmScheduleImport(result, false, false, "term"), false);
  assert.equal(canConfirmScheduleImport(result, true, false, "term"), true);
  assert.equal(canConfirmScheduleImport(result, true, true, "term"), false);
  assert.equal(canConfirmScheduleImport(result, true, false, ""), false);
  assert.equal(
    canConfirmScheduleImport(
      { ...result, malformedSkipped: 1 },
      true,
      false,
      "term",
    ),
    false,
  );
  for (const patch of [
    { start_time: "" },
    { start_time: "08:60" },
    { end_time: "08:00" },
    { end_time: "21:00" },
    { day_of_week: 7 },
    { sec_no: "abc" },
    { course_code: "x".repeat(17) },
    { kind: "other" },
  ])
    assert.ok(
      scheduleImportErrors([{ ...block, ...patch }]).size,
      JSON.stringify(patch),
    );
});
test("overlaps and duplicate kinds are blocked; separate untyped slots are retained", () => {
  const b = { ...block, id: "b", course_code: "SC363001" };
  assert.equal(scheduleImportErrors([block, b]).size, 2);
  assert.equal(
    scheduleImportErrors([
      block,
      { ...block, id: "b", start_time: "13:00", end_time: "15:00" },
    ]).size,
    0,
  );
  assert.equal(
    scheduleImportErrors([
      { ...block, kind: "lecture" },
      {
        ...block,
        id: "b",
        kind: "lecture",
        start_time: "13:00",
        end_time: "15:00",
      },
    ]).size,
    2,
  );
});
test("scans and unknown layouts fail closed instead of returning an empty success", () => {
  assert.throws(() => regPdfPagesToBlocks([{ texts: [], rects: [] }], "term"));
});
const sample = JSON.parse(
  await readFile(
    new URL("fixtures/reg-pdf/sample-1.json", import.meta.url),
    "utf8",
  ),
);
test("missing frame blocks partial import; unreadable heading in a class frame fails closed", () => {
  const noFrame = structuredClone(sample.pages);
  const index = noFrame[0].rects.findIndex((r) => r.fill === "#d2dcfa");
  assert.ok(index >= 0);
  noFrame[0].rects.splice(index, 1);
  const partial = regPdfPagesToBlocks(noFrame, "term");
  assert.equal(partial.malformedSkipped, 1);
  assert.equal(canConfirmScheduleImport(partial, true, false, "term"), false);
  const noHeading = structuredClone(sample.pages);
  const heading = noHeading[0].texts.findIndex((t) => /Sec/.test(t.text));
  noHeading[0].texts.splice(heading, 1);
  assert.throws(() => regPdfPagesToBlocks(noHeading, "term"));
});
test("page scaling and translation do not change extracted slots", () => {
  const transformed = structuredClone(sample.pages);
  for (const p of transformed) {
    for (const t of p.texts) {
      t.x = t.x * 1.5 + 20;
      t.y = t.y * 1.5 + 10;
      t.width *= 1.5;
      t.height *= 1.5;
    }
    for (const r of p.rects) {
      r.x = r.x * 1.5 + 20;
      r.y = r.y * 1.5 + 10;
      r.width *= 1.5;
      r.height *= 1.5;
    }
  }
  assert.deepEqual(
    regPdfPagesToBlocks(transformed, "term").blocks.map(slot),
    sample.expected,
  );
});
test("room/WBA text stays attached to its session without enabling no-classes mode", () => {
  const r = regPdfPagesToBlocks(sample.pages, "term");
  assert.equal(r.academicYear, 2563);
  assert.equal(r.semester, 1);
  assert.equal(r.blocks[0].note, "--WBA");
  assert.equal(
    r.blocks.find((b) => b.day_of_week === 3 && b.course_code === "342181")
      .note,
    "SC8-",
  );
  assert.ok(r.blocks.every((b) => b.is_wba === false));
});
test("pages from different semesters are rejected", async () => {
  const other = JSON.parse(
    await readFile(
      new URL("fixtures/reg-pdf/sample-2.json", import.meta.url),
      "utf8",
    ),
  );
  assert.throws(() =>
    regPdfPagesToBlocks([...sample.pages, ...other.pages], "term"),
  );
});
test("invalid PDF content rejects instead of giving an empty success", async () => {
  await assert.rejects(() => pdfToBlocks(new Uint8Array([1, 2, 3, 4]), "term"));
});
