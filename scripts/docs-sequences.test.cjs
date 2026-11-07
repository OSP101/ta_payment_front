const fs=require('fs'),path=require('path'),Module=require('module');
const root=path.resolve(__dirname, '..');
const ts=require(root+'/node_modules/typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,f);
const load=Module._load;Module._load=function(id,...args){if(id==='server-only')return {};return load.call(this,id,...args)};
const {allPages}=require(root+'/content/docs/registry.ts');
const assert=require('node:assert/strict');
for(const lang of ['th','en']) {
 const pages=allPages(lang), keys=new Set(pages.map(p=>p.audience+':'+p.slug));
 assert.equal(keys.size,pages.length,'duplicate slug');
 for(const p of pages){
  for(const ref of p.related??[]){const key=ref.includes(':')?ref:p.audience+':'+ref;assert(keys.has(key),lang+' missing related '+key);}
  for(const b of p.blocks)if(b.type==='sequence'){
   const ids=new Set(b.spec.participants.map(p=>p.id));
   const check=items=>items.forEach(i=>{if('from'in i){assert(ids.has(i.from),i.from);assert(ids.has(i.to),i.to);}else if('frag'in i)i.branches.forEach(b=>check(b.items));else if('note'in i)i.over.forEach(id=>assert(ids.has(id),id));});check(b.spec.items);
  }
 }
 for(const key of ['lecturer:request/submit','ta:worklog/submit','staff:payouts/list'])assert(pages.find(p=>p.audience+':'+p.slug===key).blocks.some(b=>b.type==='sequence'),key+' missing diagram');
 assert(pages.find(p=>p.audience==='staff'&&p.slug==='transfer-cover').routes.includes('/staff/transfer-cover'));
 console.log(lang+': '+pages.length+' pages, related links, sequence participants, prototypes and cover route passed');
}
const th=allPages('th'),en=allPages('en');
assert.deepEqual(th.map(p=>[p.audience,p.slug,p.routes??[]]).sort(),en.map(p=>[p.audience,p.slug,p.routes??[]]).sort());
console.log('Thai/English slug and route parity passed');
function structure(items) {return items.map(i => 'from' in i ? [i.from,i.to,i.kind??'sync'] : 'frag' in i ? [i.frag,i.branches.map(b=>structure(b.items))] : 'note' in i ? ['note',i.over] : ['phase']);}
function validate(items, calls=[]) {
 for(const i of items) {
  if('frag' in i) {for(const b of i.branches)validate(b.items,[...calls]);continue;}
  if(!('from' in i))continue;
  if(i.kind==='reply')assert(calls.some(c=>c.from===i.to&&c.to===i.from),`Unmatched reply: ${i.from} → ${i.to}`);
  else if((i.kind??'sync')==='sync'&&i.from!==i.to)calls.push(i);
 }
}
let checked=0;
for(const p of th){
 const other=en.find(q=>q.audience===p.audience&&q.slug===p.slug);
 const diagrams=p.blocks.filter(b=>b.type==='sequence');
 const english=other.blocks.filter(b=>b.type==='sequence');
 assert.equal(diagrams.length,english.length,p.slug);
 diagrams.forEach((b,i)=>{
  assert.deepEqual(structure(b.spec.items),structure(english[i].spec.items),p.slug+' bilingual structure');
  assert.equal(b.spec.activation,'none',p.slug+' inferred activation');
  assert(b.spec.participants.length<=4,p.slug+' too many participants');
  assert(!b.spec.participants.some(p=>p.kind==='db'),p.slug+' user-facing database');
  validate(b.spec.items); checked++;
 });
}
console.log(checked+' embedded diagrams: bilingual structure, reply recipients and simplified presentation passed');

const {REFERENCE_PAGES} = require(root+'/content/docs/function-sequences.ts');
for(const lang of ['th','en']) {
 const pages=allPages(lang);
 const functions=pages.filter(p=>!REFERENCE_PAGES.has(p.audience+':'+p.slug));
 for(const p of functions) assert(p.blocks.some(b=>b.type==='sequence'), `${lang} function without sequence: ${p.audience}:${p.slug}`);
 for(const p of pages.filter(p=>REFERENCE_PAGES.has(p.audience+':'+p.slug))) assert(p.related?.some(ref=>pages.find(q=>q.audience+':'+q.slug===ref)?.blocks.some(b=>b.type==='sequence')),p.slug+' reference without a sequence link');
 console.log(`${lang}: all ${functions.length} functional pages have diagrams; ${REFERENCE_PAGES.size} reference pages have diagram links`);
}
