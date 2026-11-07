/** Reproducible structural audit; this deliberately does not infer semantic coverage. */
require('./docs-sequences.test.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { allPages } = require('../content/docs/registry.ts');
const root = path.resolve(__dirname, '..');
const references = new Set([
 'common:intro','common:interface','ta:start','lecturer:start','staff:share-manual',
 'ta:reference/status','ta:reference/rules','ta:faq','lecturer:reference/status','lecturer:faq',
 'staff:reference/status','staff:faq','staff:admin-manual','staff:flows/index',
]);
const utility = {
 '/': 'หน้ากระจายตามบทบาท / ไม่ใช่ฟังก์ชันธุรกิจแยก',
 '/403': 'หน้าแจ้งไม่มีสิทธิ์ / ไม่ใช่ฟังก์ชันธุรกิจแยก',
 '/staff/error-report-test': 'เครื่องมือทดสอบ error reporting เฉพาะ admin; ไม่อยู่ในเมนู',
 '/docs': 'ทางเข้าคู่มือ', '/docs/[audience]': 'สารบัญคู่มือ',
 '/docs/[audience]/[...slug]': 'ตัวแสดงหน้าคู่มือ',
 '/docs-embed/[audience]': 'สารบัญคู่มือแบบฝัง',
 '/docs-embed/[audience]/[...slug]': 'ตัวแสดงคู่มือแบบฝัง',
};
const redirects = {'/ta/profile':'/account','/staff/exports':'/staff/payouts','/staff/exports/[tcId]':'/staff/payouts/[tcId]'};
function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
const pages = allPages('th');
const key = p => `${p.audience}:${p.slug}`;
const byKey = new Map(pages.map(p=>[key(p),p]));
const direct = p => p.blocks.some(b=>b.type==='sequence');
// Only actual, already-authored related links qualify; suggested links do not count.
function linked(p) {
 return (p.related??[]).map(ref=>ref.includes(':')?ref:`${p.audience}:${ref}`)
  .filter(k=>byKey.has(k)&&direct(byKey.get(k)));
}
function classification(p) {
 if(direct(p))return 'มีภาพในหน้า';
 if(references.has(key(p)))return 'หน้าอ้างอิง/สารบัญ: ไม่บังคับภาพแยก';
 if(linked(p).length)return 'มีลิงก์ไปภาพ: ต้องตรวจว่าครอบคลุมฟังก์ชันย่อยหรือไม่';
 return 'ขาดภาพและลิงก์ภาพ';
}
const routes = files(path.join(root,'app')).filter(f=>f.endsWith('/page.tsx')).map(file=>({file:path.relative(root,file),route:'/'+path.relative(path.join(root,'app'),path.dirname(file)).split('/').filter(s=>!/^\(.*\)$/.test(s)).join('/')}));
const owners = route => pages.filter(p=>(p.routes??[]).includes(route));
const counts = {};
for(const p of pages){const c=classification(p);counts[c]=(counts[c]??0)+1;}
const missingRoutes=routes.filter(r=>!utility[r.route]&&!redirects[r.route]&&!owners(r.route).length);
const rows = pages.map(p=>`| ${key(p)} | ${p.title} | ${classification(p)} | ${linked(p).join(', ')||'—'} |`).join('\n');
const routeRows = routes.sort((a,b)=>a.route.localeCompare(b.route)).map(r=>{
 const owner=owners(redirects[r.route]??r.route);
 const status=utility[r.route]??(redirects[r.route]?`เปลี่ยนทางไป ${redirects[r.route]}; `:'')+(owner.length?owner.map(p=>`${key(p)} (${classification(p)})`).join(', '):'ไม่มีหน้าคู่มือที่ประกาศ route');
 return `| ${r.route} | ${r.file} | ${status} |`;
}).join('\n');
const report=`# ผลตรวจความครอบคลุมคู่มือและ Sequence Diagram\n\nวันที่ 7 พฤศจิกายน 2569\n\n## ขอบเขตและวิธีนับ\n\nตรวจโครงสร้างคู่มือครบ ${pages.length} หน้าต่อภาษา และไฟล์เส้นทางหน้าเว็บ ${routes.length} ไฟล์ใน app ทั้งหมด รวมหน้าหลัก หน้าย่อย เส้นทางเก่า หน้าสาธารณะ และเครื่องมือภายใน ตารางนี้นับหน้าจริง ไม่ใช่จำนวนภาพที่นำไปใช้ซ้ำ\n\n**ทุกหน้าฟังก์ชันมีแผนภาพสรุปแล้ว** การมีภาพหรือมีลิงก์ไม่ได้รับประกันว่าทุกปุ่ม แท็บ และกรณีผิดพลาดถูกอธิบายแล้ว รายงานอัตโนมัตินี้ตรวจ route metadata, sequence blocks และ related links ส่วนผลตรวจเบราว์เซอร์บันทึกแยกไว้ใน TEST-manual-sequences-2026-11-07.md ไม่ใช่การทดสอบทำธุรกรรมจริงทุกปุ่ม\n\n${Object.entries(counts).map(([k,v])=>`- ${k}: ${v} หน้า`).join('\n')}\n- เส้นทางธุรกิจที่ไม่มีคู่มือประกาศ route: ${missingRoutes.length}\n\n## ขอบเขตภาพที่เติม\n\nทุกหน้าฟังก์ชันมีภาพสรุปเส้นทางหลักของหน้านั้นในไทยและอังกฤษ หน้าอ้างอิง 14 หน้ามีลิงก์ไปภาพที่เกี่ยวข้อง ไม่เพิ่มภาพซ้ำใน FAQ หรือตารางกติกา เงื่อนไขและกรณีผิดพลาดยังอ่านร่วมกับคำอธิบายเดิม ภาพสรุปไม่ใช่ข้ออ้างว่าทุกปุ่มผ่านการทดสอบจริงแล้ว\n\n## ตารางครบทุกหน้าคู่มือ\n\nชื่อภาษาไทยใช้เป็นชื่ออ้างอิงของทั้งสองภาษา การตรวจโครงสร้างภาษาไทย/อังกฤษและ routes ใช้ docs-sequences.test.cjs\n\n| หน้า | หัวข้อ | สถานะที่ตรวจได้ | ภาพผ่าน related ที่มีอยู่จริง |\n|---|---|---|---|\n${rows}\n\n## ตารางครบทุกเส้นทางหน้าเว็บ\n\nลบ route groups เช่น (home) ก่อนจับคู่ ไม่นับ redirect เป็นฟังก์ชันใหม่ และระบุเครื่องมือภายในแยกจากเมนูผู้ใช้\n\n| เส้นทาง | ซอร์สไฟล์ | คู่มือ/เหตุผล |\n|---|---|---|\n${routeRows}\n\n## การตรวจซ้ำ\n\nรันจาก ta_payment_front: node scripts/docs-coverage.cjs\n\nรายงานนี้สร้างจาก working tree ปัจจุบัน จึงรวมงานที่ยังไม่ commit ไม่ยืนยันสถานะ deploy และไม่รวม PDF เดิม การรับงานขั้นสุดท้ายควรทำรายการ action/แท็บของแต่ละหน้าที่มีการแก้ข้อมูล เทียบกับโค้ดและตรวจ UI จริงก่อนเปลี่ยนสถานะเป็นครอบคลุมครบ\n`;
const target=path.join(root,'../docs/AUDIT-manual-sequence-coverage-2026-11-07.md');
fs.writeFileSync(target,report);
console.log(JSON.stringify({pages:pages.length,routeFiles:routes.length,counts,missingRoutes:missingRoutes.map(r=>r.route),report:target},null,2));
