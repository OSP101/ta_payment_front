import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const output=ts.transpileModule(fs.readFileSync('app/ta/courses/[tcId]/worklog/manualMakeup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports',output)(exports);
const {resolveManualClassDate:resolve}=exports;
const row=(date='2026-12-19',kind='lecture',section='sec-1')=>({original_date:'2026-12-16',affected_sections:[{section_id:section,kind,start_time:'09:00',end_time:'12:00',makeup:{id:'makeup-1',makeup_date:date,start_time:'13:00:00',end_time:'16:00:00'}}]});

test('holiday resolves actual date, time and stable sitting ID',()=>{
 assert.deepEqual(resolve('2026-12-16','lecture','sec-1',[row()]),{state:'makeup',workDate:'2026-12-19',originalDate:'2026-12-16',makeupID:'makeup-1',start:'13:00',end:'16:00'});
});
test('same-day replacement is a valid makeup, not a loop back to the original warning',()=>{
 assert.equal(resolve('2026-12-16','lecture','sec-1',[row('2026-12-16')]).state,'makeup');
});
test('unrelated section or period cannot supply a makeup',()=>{
 for(const r of [row('2026-12-19','lab'),row('2026-12-19','lecture','sec-2')])assert.equal(resolve('2026-12-16','lecture','sec-1',[r]).state,'blocked');
});
test('holiday without makeup and an explicit waiver cannot be billed',()=>{
 const missing=row();missing.affected_sections[0].makeup=null;
 assert.equal(resolve('2026-12-16','lecture','sec-1',[missing]).reason,'missing');
 const waived=row();waived.affected_sections[0].makeup.waived=true;
 assert.equal(resolve('2026-12-16','lecture','sec-1',[waived]).reason,'waived');
});
test('partial-day closure preserves the unaffected class and non-class duties',()=>{
 const half={original_date:'2026-12-16',holiday_start:'08:00',holiday_end:'12:00',affected_sections:[]};
 assert.equal(resolve('2026-12-16','lab','sec-1',[half],{start:'13:00',end:'16:00'}).state,'normal');
 for(const activity of ['review','prep','other'])assert.equal(resolve('2026-12-16',activity,'sec-1',[row()]).state,'normal');
});
test('duplicate holiday descriptions resolve once, ambiguous targets are blocked',()=>{
 assert.equal(resolve('2026-12-16','lecture','sec-1',[row(),row()]).state,'makeup');
 const other=row('2026-12-20');other.affected_sections[0].makeup.id='makeup-2';
 assert.equal(resolve('2026-12-16','lecture','sec-1',[row(),other]).reason,'invalid');
});
test('date-only legacy makeups use the original period window',()=>{
 const r=row();delete r.affected_sections[0].makeup.start_time;delete r.affected_sections[0].makeup.end_time;
 assert.equal(resolve('2026-12-16','lecture','sec-1',[r]).start,'09:00');
});
