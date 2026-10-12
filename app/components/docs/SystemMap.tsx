import { Sparkles, CalendarCog, Send, Clock, Banknote, Bell, ChartColumnBig, ScrollText, ShieldCheck } from "lucide-react";
import { getT } from "../../lib/i18n/server";
import { msg, type Vars } from "../../lib/i18n/core";

type T = (key: string, vars?: Vars) => string;

/**
 * "ภาพรวมระบบ" — the whole TA lifecycle COCO TAS runs, in four phases, with
 * who does each piece of work and what the system does on its own. Drawn in
 * the page (like MoneyFlow) so it stays sharp, uses the site font and reflows.
 *
 * Wide: a "COCO TAS" chip at the top fans circuit traces down to the four
 * phase headers; the headers are joined left to right by lines a pulse runs
 * along; each phase lists its tasks, role-coloured, with the automatic ones
 * set apart. A band at the bottom holds what runs through every phase.
 * Narrow (phones, the docs drawer): the phases stack on one timeline.
 *
 * Keep the wording in step with the system: every line here is a feature a
 * reader can find on a screen, named the way that screen names it.
 */

type Who = "staff" | "lecturer" | "ta" | "auto" | "finance";

const WHO: Record<Who, { label: string; dot: string; ink: string }> = {
  staff:    { label: msg("เจ้าหน้าที่"), dot: "bg-[var(--tone-staff-ink)]", ink: "text-[var(--tone-staff-ink)]" },
  lecturer: { label: msg("อาจารย์"),   dot: "bg-[#0776bc]", ink: "text-[var(--tone-brand-ink)]" },
  ta:       { label: msg("ผู้ช่วยสอน"), dot: "bg-[var(--tone-ta-ink)]", ink: "text-[var(--tone-ta-ink)]" },
  auto:     { label: msg("ระบบทำให้"),  dot: "bg-[#0776bc]", ink: "text-[var(--tone-brand-ink)]" },
  finance:  { label: msg("การเงิน"),   dot: "bg-[#64748b]", ink: "text-[var(--tone-muted-ink)]" },
};

interface Task { who: Who; text: string }
interface Phase { n: number; title: string; sub: string; Icon: typeof Clock; tasks: Task[] }

const PHASES: Phase[] = [
  {
    n: 1, title: msg("เตรียมภาคเรียน"), sub: msg("ต้นเทอม"), Icon: CalendarCog,
    tasks: [
      { who: "staff", text: msg("ตั้งอัตราค่าตอบแทน ภาคเรียน ช่วงรับคำขอ และรอบเบิกจ่าย") },
      { who: "staff", text: msg("นำเข้ารายวิชาจากไฟล์ทะเบียน และกรอกจำนวนนักศึกษา") },
      { who: "lecturer", text: msg("กรอกตารางเวลาของแต่ละ section") },
      { who: "auto", text: msg("จับคู่อาจารย์ผู้สอนจากไฟล์ทะเบียน") },
      { who: "auto", text: msg("ดึงวันหยุดและวันสอนชดเชยจากระบบ TDBM") },
      { who: "auto", text: msg("ส่งอีเมลบอกอาจารย์เมื่อเปิดรับคำขอ") },
    ],
  },
  {
    n: 2, title: msg("ขอผู้ช่วยสอน"), sub: msg("ก่อนเริ่มสอน"), Icon: Send,
    tasks: [
      { who: "ta", text: msg("ส่งเอกสาร 4 ขั้น และใส่ตารางเรียนของตัวเอง") },
      { who: "staff", text: msg("ตรวจเอกสาร TA ผ่านหรือตีกลับทีละไฟล์") },
      { who: "auto", text: msg("แนะนำจำนวน TA ตามกลุ่มเรียน") },
      { who: "auto", text: msg("คำนวณงบและค่าใช้จ่ายให้ดูก่อนส่ง") },
      { who: "lecturer", text: msg("ส่งคำขอ TA พร้อมภาระงานรายสัปดาห์") },
      { who: "auto", text: msg("ตัดสินคำขอทันที โดยตรวจเอกสาร เวลาชนกับตารางเรียน และโควตาจำนวนวิชาต่อ TA") },
      { who: "staff", text: msg("ออกคำสั่งแต่งตั้ง TA") },
    ],
  },
  {
    n: 3, title: msg("ปฏิบัติงานรายเดือน"), sub: msg("ตลอดเทอม"), Icon: Clock,
    tasks: [
      { who: "auto", text: msg("สร้างรายการลงเวลาทั้งเทอมจากตารางสอน") },
      { who: "ta", text: msg("ลงเวลาและส่งอนุมัติภายในกำหนดของแต่ละเดือน") },
      { who: "auto", text: msg("บอกค่าตอบแทนโดยประมาณให้ TA เห็นก่อน") },
      { who: "lecturer", text: msg("กำหนดวันชดเชยเมื่อคาบตรงวันหยุด") },
      { who: "lecturer", text: msg("อนุมัติหรือส่งกลับบันทึกเวลา ทีละคน ทีละเดือน") },
      { who: "auto", text: msg("เตือนเมื่อค่าใช้จ่ายของวิชาใกล้เต็มงบ") },
    ],
  },
  {
    n: 4, title: msg("เบิกจ่าย"), sub: msg("ปลายเดือน"), Icon: Banknote,
    tasks: [
      { who: "staff", text: msg("ตรวจทุกเดือน แล้วส่งออกเอกสารเบิกจ่ายเป็นไฟล์ ZIP") },
      { who: "auto", text: msg("เกลี่ยเงินเมื่อเกินงบ และล็อกเดือนที่ส่งออกแล้ว") },
      { who: "auto", text: msg("ออกเอกสารตามแบบของวิทยาลัย เช่น สรุปงบ ปะหน้า และเอกสารบัณฑิตศึกษา") },
      { who: "staff", text: msg("ติดตามการเซ็นเอกสารกระดาษจนถึงการเงิน") },
      { who: "finance", text: msg("ค่าตอบแทนเข้าบัญชีของผู้ช่วยสอน") },
    ],
  },
];

const ALWAYS = [
  { Icon: Bell, text: msg("แจ้งเตือนในระบบและทางอีเมลทุกขั้นตอน") },
  { Icon: ChartColumnBig, text: msg("หน้าสรุป ดูว่างบพอไหม ขอ TA เกินไหม งานค้างตรงไหน") },
  { Icon: ScrollText, text: msg("เก็บประวัติการใช้งานย้อนหลัง (Audit Log)") },
  { Icon: ShieldCheck, text: msg("เข้าสู่ระบบด้วย KKU Account รองรับ 2FA และ PDPA") },
];

function TaskRow({ task, t }: { task: Task; t: T }) {
  const w = WHO[task.who];
  if (task.who === "auto") {
    return (
      <li className="rounded-lg border border-dashed border-[var(--tone-brand-dash)] bg-[var(--tone-brand-soft)] px-2.5 py-1.5">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--tone-brand-ink)]">
          <Sparkles size={12} aria-hidden="true" /> {t(w.label)}
        </div>
        <div className="text-[13px] leading-snug text-foreground/85">{t(task.text)}</div>
      </li>
    );
  }
  return (
    <li className="rounded-lg border border-border bg-white px-2.5 py-1.5">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${w.ink}`}>
        <span className={`h-2 w-2 rounded-full ${w.dot}`} aria-hidden="true" /> {t(w.label)}
      </div>
      <div className="text-[13px] leading-snug text-foreground/85">{t(task.text)}</div>
    </li>
  );
}

function PhaseHead({ p, t }: { p: Phase; t: T }) {
  return (
    <div className="relative z-[1] flex items-center gap-2.5 rounded-xl border border-[var(--tone-brand-line)] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0776bc] text-white">
        <p.Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-slate-500">{t("ขั้นที่ {n} {when}", { n: p.n, when: t(p.sub) })}</div>
        <div className="text-[15px] font-semibold leading-tight text-foreground">{t(p.title)}</div>
      </div>
    </div>
  );
}

function Legend({ t }: { t: T }) {
  const items: Who[] = ["staff", "lecturer", "ta"];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${WHO[k].dot}`} aria-hidden="true" /> {t(WHO[k].label)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-4 rounded border border-dashed border-[var(--tone-brand-dash)] bg-[var(--tone-brand-soft)]" aria-hidden="true" /> {t("ระบบทำให้เอง")}
      </span>
    </div>
  );
}

export default async function SystemMap() {
  const { t } = await getT();
  return (
    <figure className="my-4" aria-label={t("ภาพรวมการทำงานของ COCO TAS 4 ขั้น")}>
      {/* ---------------- wide ---------------- */}
      <div className="hidden md:block rounded-2xl border border-border bg-white bg-[radial-gradient(circle_at_50%_0%,var(--tone-glow),transparent_55%)] px-4 pb-4 pt-5">
        {/* chip */}
        <div className="flex justify-center">
          <div className="relative rounded-lg border border-[var(--tone-brand-line)] bg-white px-5 py-2.5 text-center shadow-[0_2px_8px_rgba(7,118,188,0.12)]">
            <span className="docs-flow-pins" aria-hidden="true" />
            <div className="text-base font-bold tracking-wide text-[var(--tone-brand-ink)]">COCO TAS</div>
            <div className="text-[11px] text-slate-500">{t("ระบบจัดการผู้ช่วยสอน")}</div>
          </div>
        </div>

        {/* traces from the chip down to each phase */}
        <svg className="block h-10 w-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="0" x2="50" y2="14" stroke="var(--border-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <line x1="12.5" y1="14" x2="87.5" y2="14" stroke="var(--border-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {[12.5, 37.5, 62.5, 87.5].map((x, i) => (
            <g key={x}>
              <line x1={x} y1="14" x2={x} y2="40" stroke="var(--border-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <line className="docs-flow-drop" style={{ animationDelay: `${i * 0.3}s` }} x1={x} y1="14" x2={x} y2="40"
                stroke="#0776bc" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>

        <ol className="grid grid-cols-4">
          {PHASES.map((p, i) => (
            <li key={p.n} className="relative flex flex-col gap-2 px-2">
              <div className="relative">
                <PhaseHead p={p} t={t} />
                {i < PHASES.length - 1 && (
                  <span className="docs-flow-link" style={{ left: "calc(100% - 0px)", width: "16px", ["--d" as string]: `${i * 0.5}s` }} aria-hidden="true"><span /></span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {p.tasks.map((task, k) => <TaskRow key={k} task={task} t={t} />)}
              </ul>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl border border-border bg-slate-50 px-3 py-2.5">
          <div className="mb-1.5 text-center text-[11px] font-semibold text-slate-500">{t("มีให้ในทุกขั้น")}</div>
          <ul className="grid grid-cols-4 gap-2">
            {ALWAYS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-foreground/80">
                <Icon size={14} className="mt-0.5 shrink-0 text-[var(--tone-brand-ink)]" aria-hidden="true" /> {t(text)}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3"><Legend t={t} /></div>
      </div>

      {/* ---------------- narrow ---------------- */}
      <div className="md:hidden rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 text-center">
          <div className="text-base font-bold text-[var(--tone-brand-ink)]">COCO TAS</div>
          <div className="text-[11px] text-slate-500">{t("ระบบจัดการผู้ช่วยสอน")}</div>
        </div>
        <ol className="relative space-y-4 ps-6">
          <span className="docs-flow-spine" aria-hidden="true"><span /></span>
          {PHASES.map((p) => (
            <li key={p.n} className="relative">
              <div className="relative">
                <span className="absolute -start-[1.3rem] top-4 h-2.5 w-2.5 rounded-full bg-[#0776bc] ring-4 ring-[var(--panel-bg)]" aria-hidden="true" />
                <PhaseHead p={p} t={t} />
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {p.tasks.map((task, k) => <TaskRow key={k} task={task} t={t} />)}
              </ul>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl border border-border bg-slate-50 p-3">
          <div className="mb-1.5 text-[11px] font-semibold text-slate-500">{t("มีให้ในทุกขั้น")}</div>
          <ul className="space-y-1.5">
            {ALWAYS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-foreground/80">
                <Icon size={14} className="mt-0.5 shrink-0 text-[var(--tone-brand-ink)]" aria-hidden="true" /> {t(text)}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3"><Legend t={t} /></div>
      </div>
    </figure>
  );
}
