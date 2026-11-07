import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/lib/concurrentEdits.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const edits=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
globalThis.window={};
function response(views){return new Response('{}',{headers:{'X-Edit-Views':JSON.stringify(views)}})}
test('background refresh cannot authorize an old open form',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:*':'old'}),false);
 edits.rememberEditViews('/api/v1',response({'course:*':'new'}),false);
 const h=await edits.editRequestHeaders('/api/v1','/teaching-courses/1',{method:'PATCH'});
 assert.equal(JSON.parse(h['X-Edit-Views'])['course:*'],'old');
});
test('own write advances only its exact resource, never the collection',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:*':'old'}),false);
 edits.rememberEditViews('/api/v1',response({'course:*':'unsafe','course:1':'saved'}),true);
 const h=await edits.editRequestHeaders('/api/v1','/teaching-courses/1',{method:'PATCH'});
 assert.deepEqual(JSON.parse(h['X-Edit-Views']),{'course:*':'old','course:1':'saved'});
});
test('double click and retry reuse intent; changed payload gets another key',async()=>{
 edits.resetEditViews();
 const init={method:'POST',body:'{"id":1}'};
 const [a,b]=await Promise.all([edits.editRequestHeaders('/api/v1','/ta-requests',init),edits.editRequestHeaders('/api/v1','/ta-requests',init)]);
 assert.equal(a['Idempotency-Key'],b['Idempotency-Key']);
 const c=await edits.editRequestHeaders('/api/v1','/ta-requests',{...init,body:'{"id":2}'});
 assert.notEqual(a['Idempotency-Key'],c['Idempotency-Key']);
});
test('demo isolation, logout reset and server rendering do not leak tokens',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'user:1':'secret'}),false);
 const demo=await edits.editRequestHeaders('/api/demo/w/1','/users/1',{method:'PATCH'});
 assert.deepEqual(JSON.parse(demo['X-Edit-Views']),{});
 edits.resetEditViews();
 const clean=await edits.editRequestHeaders('/api/v1','/users/1',{method:'PATCH'});
 assert.deepEqual(JSON.parse(clean['X-Edit-Views']),{});
 delete globalThis.window;
 assert.deepEqual(await edits.editRequestHeaders('/api/v1','/users/1',{method:'POST'}),{});
 globalThis.window={};
});
test('visiting many resources keeps request headers within the transport limit',async()=>{
 edits.resetEditViews();
 for(let i=0;i<200;i++)edits.rememberEditViews('/api/v1',response({[`course:${i}`]:'x'.repeat(200)}),false);
 const h=await edits.editRequestHeaders('/api/v1','/teaching-courses/1',{method:'PATCH'});
 assert.ok(h['X-Edit-Views'].length<=6000);
});
