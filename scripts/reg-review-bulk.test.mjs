import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../app/staff/teaching/regReviewBulk.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { planREGBulk, canBulkAcknowledge } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture() {
  const section = (id, curriculum) => ({ id, sec_no: '1', curriculum, track: 'regular', schedules: [{day: 1, start: '09:00', end: '12:00', kind: 'lecture', room: 'A'}] });
  const course = (code, extra = {}) => ({ code, name: code, level: 'undergrad', lecturer_ids: ['a'], unassigned_reason: '', sections: [section('same-source-id', ''), section('second', 'CS')], ...extra });
  return { validation_hash: 'validated', confirmed: true, ready: true, acknowledged: ['done'], lecturers: [{id:'a',name:'Same Name',email:'a@example.test'},{id:'b',name:'Same Name',email:'b@example.test'}],
    courses: [course('A'),course('B'),course('SKIP',{skip:true}),course('EXISTS',{existing_id:'id'})], issues: [
      {id:'warning',code:'A',kind:'hours',severity:'warning',message:'Review hours'},
      {id:'error',code:'A',kind:'curriculum',severity:'error',message:'Missing'},
      {id:'ambiguous',code:'A',kind:'unmatched_names',severity:'warning',message:'Ambiguous name'},
      {id:'unassigned',code:'A',kind:'lecturer',severity:'warning',message:'No assigned lecturer'},
      {id:'done',code:'A',kind:'room',severity:'warning',message:'Done'},
      {id:'other-course',code:'B',kind:'hours',severity:'warning',message:'Other course'},
    ] };
}
test('fill missing curricula only within selected included courses, preserving valid values and original data', () => {
  const r=fixture(), before=structuredClone(r);
  const p=planREGBulk(r,['A','SKIP','EXISTS'],{type:'curriculum',value:'OTHER',onlyMissing:true});
  assert.equal(p.changes.length,1); assert.equal(p.review.courses[0].sections[0].curriculum,'OTHER');
  assert.equal(p.review.courses[0].sections[1].curriculum,'CS'); assert.equal(p.review.courses[1].sections[0].curriculum,'');
  assert.deepEqual(r,before); assert.equal(p.review.courses[0].sections[0].schedules,r.courses[0].sections[0].schedules);
  assert.equal(p.review.confirmed,false); assert.equal(p.review.validation_hash,''); assert.deepEqual(p.review.acknowledged,['done']);
});
test('explicit overwrites cover each course even with repeated Section IDs, while unsupported values and no-ops leave state intact', () => {
  const r=fixture();const p=planREGBulk(r,['A','B'],{type:'curriculum',value:'OTHER',onlyMissing:false});
  assert.equal(p.changes.length,4); assert.equal(new Set(p.changes.map(c=>c.id)).size,4);
  assert.equal(planREGBulk(r,['A'],{type:'curriculum',value:'BAD',onlyMissing:false}).review,r);
  assert.equal(planREGBulk(r,['MISSING'],{type:'track',value:'special'}).review,r);
  assert.equal(planREGBulk(r,['A'],{type:'level',value:'undergrad'}).review,r);
  assert.equal(planREGBulk(r,['B'],{type:'track',value:'special'}).review.courses[0],r.courses[0]);
});
test('same-name lecturers are selected by UUID, appended without duplicates and promoted only explicitly', () => {
  const r=fixture(); const p=planREGBulk(r,['A'],{type:'lecturer',value:'b',primary:false});
  assert.deepEqual(p.review.courses[0].lecturer_ids,['a','b']); assert.match(p.changes[0].after,/b@example.test/);
  assert.equal(planREGBulk(p.review,['A'],{type:'lecturer',value:'b',primary:false}).review,p.review);
  assert.deepEqual(planREGBulk(p.review,['A'],{type:'lecturer',value:'b',primary:true}).review.courses[0].lecturer_ids,['b','a']);
  assert.equal(planREGBulk(r,['A'],{type:'lecturer',value:'unknown',primary:true}).review,r);
});
test('bulk acknowledgement requires fresh validation, excludes errors and unresolved identities, and respects course/type scope', () => {
  const r=fixture(); const p=planREGBulk(r,['A'],{type:'acknowledge',kinds:['hours','curriculum','unmatched_names','lecturer','room']});
  assert.deepEqual(p.review.acknowledged,['done','warning']); assert.equal(p.changes.length,1);
  assert.equal(p.review.ready,false); assert.equal(p.review.confirmed,false);
  assert.equal(canBulkAcknowledge({severity:'warning',message:'ชื่อจาก REG ที่ไม่พบหรือกำกวม: test'}),false);
  const dirty={...r,validation_hash:''}; assert.equal(planREGBulk(dirty,['A'],{type:'acknowledge',kinds:['hours']}).review,dirty);
});
