import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the modal's actual save handler without mounting unrelated settings tabs.
const source = await readFile(new URL('../app/staff/settings/page.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modal = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'SubmissionPeriodModal');
const save = modal.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'save');
const compiled = ts.transpileModule(save.getText(file), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const runSave = new Function('api', 'draft', 'termId', 'setSaving', 'setError', 'onSaved', `${compiled}; return save();`);
const termId = '11111111-1111-4111-8111-111111111111';
const draft = {
  id: '', term_id: termId, year_month: '2569-12',
  starts_on: '2026-12-01', due_date: '2026-12-31', label: 'ธันวาคม 2569',
  remind_days_before: 3, is_closed: false,
};

for (const id of ['', '22222222-2222-4222-8222-222222222222']) {
  test(id ? 'editing preserves the existing period UUID' : 'manual creation omits the empty UUID and preserves entered values', async () => {
    const requests = [], saving = [], errors = [];
    let saved = 0;
    await runSave({ post: async (path, body) => requests.push({ path, body: JSON.parse(JSON.stringify(body)) }) },
      { ...draft, id }, termId, value => saving.push(value), value => errors.push(value), () => saved++);
    const { id: unused, ...fields } = draft;
    assert.deepEqual(requests, [{ path: '/submission-periods', body: { ...fields, ...(id ? { id } : {}) } }]);
    assert.equal(saved, 1);
    assert.deepEqual(saving, [true, false]);
    assert.deepEqual(errors, [null]);
  });
}

test('API failure keeps the modal open with an error and enables retry', async () => {
  const saving = [], errors = [];
  let saved = false;
  await runSave({ post: async () => { throw new Error('บันทึกไม่สำเร็จ'); } }, draft, termId,
    value => saving.push(value), value => errors.push(value), () => { saved = true; });
  assert.equal(saved, false);
  assert.deepEqual(errors, [null, 'บันทึกไม่สำเร็จ']);
  assert.deepEqual(saving, [true, false]);
});
