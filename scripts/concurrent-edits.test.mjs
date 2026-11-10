import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/lib/concurrentEdits.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const edits=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
globalThis.window={};
function response(views){return new Response('{}',{headers:{'X-Edit-Views':JSON.stringify(views)}})}
test('focus revalidation advances the version used for approval',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:*':'old'}),false);
 edits.rememberEditViews('/api/v1',response({'course:*':'new'}),false);
 const h=await edits.editRequestHeaders('/api/v1','/teaching-courses/1',{method:'PATCH'});
 assert.equal(JSON.parse(h['X-Edit-Views'])['course:*'],'new');
});
test('own write advances only its exact resource, never the collection',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:*':'old'}),false);
 edits.rememberEditViews('/api/v1',response({'course:*':'unsafe','course:1':'saved'}),true);
 const h=await edits.editRequestHeaders('/api/v1','/teaching-courses/1',{method:'PATCH'});
 assert.deepEqual(JSON.parse(h['X-Edit-Views']),{'course:*':'old','course:1':'saved'});
});
// Tokens have the same snapshot encoding as the backend. Signatures remain
// opaque here: PostgreSQL visibility and signature validation are server tests.
function token(snapshot){return Buffer.from(snapshot).toString('base64url')+'.signature'}
async function views(path='/worklog/approve-batch'){
 return JSON.parse((await edits.editRequestHeaders('/api/v1',path,{method:'POST'}))['X-Edit-Views']);
}
test('opening another page and refreshing an exact resource replaces the first read',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'user:1':token('10:20:')}),false);
 edits.rememberEditViews('/api/v1',response({'user:1':token('20:30:')}),false);
 assert.equal((await views('/users/1'))['user:1'],token('20:30:'));
});
test('a new read replaces a prior own write instead of being masked by it',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:20:')}),true);
 edits.rememberEditViews('/api/v1',response({'course:1':token('20:30:')}),false);
 assert.equal((await views())['course:1'],token('20:30:'));
});
test('a refreshed list retires stale exact views from reads and writes',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:20:')}),false);
 edits.rememberEditViews('/api/v1',response({'course:2':token('20:30:')}),true);
 edits.rememberEditViews('/api/v1',response({'user:1':token('10:20:')}),false);
 edits.rememberEditViews('/api/v1',response({'course:*':token('30:40:')}),false);
 assert.deepEqual(await views(),{'user:1':token('10:20:'),'course:*':token('30:40:')});
});
test('an older list cannot retire a newer exact view',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('20:30:')}),true);
 edits.rememberEditViews('/api/v1',response({'course:*':token('10:20:')}),false);
 assert.equal((await views())['course:1'],token('20:30:'));
});
test('slow reads cannot roll back a newer read or completed write',async()=>{
 for(const write of [false,true]){
  edits.resetEditViews();
  edits.rememberEditViews('/api/v1',response({'course:1':token('20:30:')}),write);
  edits.rememberEditViews('/api/v1',response({'course:1':token('10:20:')}),false);
  assert.equal((await views())['course:1'],token('20:30:'));
 }
});
test('a slow exact response cannot mask a newer collection snapshot',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:*':token('20:30:')}),false);
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:20:')}),false);
 assert.deepEqual(await views(),{'course:*':token('20:30:')});
});
test('committing an in-progress transaction advances visibility without changing xmax',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:30:10,20')}),false);
 edits.rememberEditViews('/api/v1',response({'course:1':token('20:30:20')}),false);
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:30:10,20')}),false);
 assert.equal((await views())['course:1'],token('20:30:20'));
});
test('a read with a larger xmax must not reintroduce a previously committed transaction',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('20:30:20')}),false);
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:40:10,20')}),false);
 assert.equal((await views())['course:1'],token('20:30:20'));
});
test('failed reads and invalid headers cannot replace a successful snapshot',async()=>{
 edits.resetEditViews();
 edits.rememberEditViews('/api/v1',response({'course:1':token('10:20:')}),false);
 for(const header of ['null','[]','bad json',JSON.stringify({'course:1':null})]){
  edits.rememberEditViews('/api/v1',new Response('{}',{headers:{'X-Edit-Views':header}}),false);
 }
 edits.rememberEditViews('/api/v1',new Response('{}',{status:500,headers:{'X-Edit-Views':JSON.stringify({'course:1':token('20:30:')})}}),false);
 assert.equal((await views())['course:1'],token('10:20:'));
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
