"use client";
import { useEffect, useRef, useState } from "react";
import {
  Info as InfoIcon, BookOpen, FlaskConical, Users, Coins, Calendar,
  ArrowRight, Sparkles, Sigma, X, ChevronLeft, ChevronRight, Check, LayoutList, Equal,
} from "lucide-react";
import { Modal, Button } from "./ui";

export interface FormulaConstants {
  hrsPerLecCr: number;      // default 3
  hrsPerLabCr: number;      // default 4.5
  baseLec: number;          // default 60
  baseLab: number;          // default 30
  rate: number;             // default 300 (effective rate = 50%×200 + 50%×400)
  termMonths: number;       // default 4
}

export interface FormulaExample {
  lecCr: number;
  labCr: number;
  /** Weekly contact hours from the credit code "3 (2-2-5)" — what the course stores. */
  lecHrs?: number;
  labHrs?: number;
  students: number;
  trackLabel: string;       // "ภาคปกติ" / "ภาคพิเศษ"
  isSpecial?: boolean;
  courseName?: string;
}

const DEFAULT_EXAMPLE: FormulaExample = {
  lecCr: 2, labCr: 1, students: 5,
  trackLabel: "ภาคปกติ",
  lecHrs: 2, labHrs: 2,
  courseName: "ตัวอย่าง SW-TESTING (3 หน่วยกิต)",
};

const fmt = (n: number, d = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const bahtF = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

/* -------------------------------------------------------------------------- */
/* The walkthrough                                                             */
/*                                                                            */
/* One step at a time, each step playing out its own sum: the formula first   */
/* in words, then the course's numbers dropped into it, then the answer      */
/* counting up. The steps already passed collapse into a running equation    */
/* at the top so the reader always sees where the number they are looking   */
/* at came from and where it is going. "ดูทั้งหมด" flattens it into the       */
/* four-box reference view for anyone who just wants to check a figure.      */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { key: "input", label: "ข้อมูลวิชา", icon: Users },
  { key: "workload", label: "ภาระงาน/สัปดาห์", icon: Sigma },
  { key: "monthly", label: "งบต่อเดือน", icon: Coins },
  { key: "term", label: "งบทั้งเทอม", icon: Calendar },
] as const;

export function FormulaHelpModal({
  open, onClose, constants, example,
}: {
  open: boolean;
  onClose: () => void;
  constants: FormulaConstants;
  example?: FormulaExample;
}) {
  const ex = example ?? DEFAULT_EXAMPLE;
  const { hrsPerLecCr, hrsPerLabCr, baseLec, baseLab, rate, termMonths } = constants;
  const { lecCr, labCr, lecHrs, labHrs, students, trackLabel, isSpecial, courseName } = ex;

  const lecWL = students > 0 && baseLec > 0 ? lecCr * hrsPerLecCr * (students / baseLec) : 0;
  const labWL = students > 0 && baseLab > 0 ? labCr * hrsPerLabCr * (students / baseLab) : 0;
  const workload = lecWL + labWL;
  const monthly = workload * rate;
  const term = monthly * termMonths;

  const [step, setStep] = useState(0);
  const [all, setAll] = useState(false);
  useEffect(() => { if (open) { setStep(0); setAll(false); } }, [open]);
  const last = step === STEPS.length - 1;

  const nav = all ? (
    <Button variant="primary" onClick={onClose}><Check size={14} /> เข้าใจแล้ว</Button>
  ) : (
    <div className="flex w-full items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
        <LayoutList size={14} /> ดูทั้งหมดในหน้าเดียว
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft size={14} /> ย้อนกลับ
        </Button>
        {last
          ? <Button variant="primary" onClick={onClose}><Check size={14} /> เข้าใจแล้ว</Button>
          : <Button variant="primary" onClick={() => setStep(s => s + 1)}>ขั้นถัดไป <ChevronRight size={14} /></Button>}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          วิธีคิดงบ TA {trackLabel}
        </span>
      }
      size="xl"
      footer={nav}
    >
      <div className="space-y-4">
        {courseName && (
          <div className="text-sm text-muted">
            {example ? "วิชา" : "ตัวอย่างวิชา"}: <b className="text-foreground">{courseName}</b>
          </div>
        )}

        {/* Step rail */}
        <ol className="grid grid-cols-4 gap-1" aria-label="ขั้นตอน">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state = all || i < step ? "done" : i === step ? "now" : "todo";
            return (
              <li key={s.key}>
                <button type="button" onClick={() => { setAll(false); setStep(i); }}
                  aria-current={state === "now" ? "step" : undefined}
                  className={"w-full rounded-lg border px-2 py-1.5 text-left transition-colors " +
                    (state === "now" ? "border-accent bg-accent-soft" : state === "done" ? "border-success/40 bg-success-soft/40" : "border-border bg-panel opacity-70")}>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className={"flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold " +
                      (state === "done" ? "bg-success text-white" : state === "now" ? "bg-accent text-accent-foreground" : "bg-surface-secondary")}>
                      {state === "done" ? <Check size={10} /> : i + 1}
                    </span>
                    <Icon size={12} />
                  </div>
                  <div className="mt-0.5 truncate text-xs font-medium">{s.label}</div>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Running equation — what has been established so far. */}
        {!all && step > 1 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-hairline bg-surface-secondary px-3 py-2 text-xs tabular animate-in fade-in duration-300">
            <span className="text-muted">ที่ได้แล้ว:</span>
            <Pill>{fmt(workload)} ชม./สัปดาห์</Pill>
            {step >= 3 && <><X size={12} className="text-muted" /><Pill>฿{rate}</Pill><Equal size={12} className="text-muted" /><Pill tone="ok">{bahtF(monthly)}/เดือน</Pill></>}
          </div>
        )}

        {(all || step === 0) && (
          <HelpStep number={1} title="ข้อมูลตั้งต้นของวิชา" icon={<Users size={18} />} delay={0} playKey={`${step}-${all}`}>
            <div className="grid grid-cols-3 gap-3">
              <InputChip icon={<BookOpen size={16} />} label="หน่วยกิตบรรยาย" value={`${lecCr}`} delay={100}
                hint={lecHrs !== undefined ? `จากบรรยาย ${lecHrs} ชั่วโมง/สัปดาห์ (1 ชั่วโมง = 1 หน่วยกิต)` : undefined} />
              <InputChip icon={<FlaskConical size={16} />} label="หน่วยกิตปฏิบัติการ" value={`${labCr}`} delay={250}
                hint={labHrs !== undefined ? `จากปฏิบัติการ ${labHrs} ชั่วโมง/สัปดาห์ (2 ชั่วโมง = 1 หน่วยกิต ปัดลง)` : undefined} />
              <InputChip
                icon={<Users size={16} />}
                label={isSpecial ? "นักศึกษาภาคพิเศษ" : "นักศึกษาภาคปกติ"}
                value={`${students} คน`}
                tone={isSpecial ? "warn" : "brand"}
                delay={400}
              />
            </div>
            {lecHrs !== undefined && labHrs !== undefined && (
              <div className="mt-3 rounded-lg bg-surface-secondary p-3 text-xs text-ink-2 animate-in fade-in duration-500 fill-mode-both" style={{ animationDelay: "600ms" }}>
                <div className="mb-1 font-medium text-ink-1">อ่านรหัสหน่วยกิต <span className="tabular">{lecCr + labCr} ({lecHrs}-{labHrs}-{(lecCr + labCr) * 3 - lecHrs - labHrs})</span></div>
                <div className="grid gap-1 sm:grid-cols-3">
                  <CodePart n={lecHrs} label="บรรยาย ชม./สัปดาห์" note={`= ${lecCr} หน่วยกิต`} />
                  <CodePart n={labHrs} label="ปฏิบัติการ ชม./สัปดาห์" note={`= ${labCr} หน่วยกิต (2 ชม. = 1 นก.)`} />
                  <CodePart n={(lecCr + labCr) * 3 - lecHrs - labHrs} label="ศึกษาเอง ชม./สัปดาห์" note="ไม่ใช้ในสูตร" muted />
                </div>
                <div className="mt-1.5 text-muted">สูตรงบใช้ <b>หน่วยกิต</b> ไม่ใช่ชั่วโมง (ตามสมุดงบของคณะ ชีต 2_59 ปริญญาตรี)</div>
              </div>
            )}
          </HelpStep>
        )}

        {(all || step === 1) && (
          <HelpStep number={2} title="คำนวณภาระงานต่อสัปดาห์" icon={<Sigma size={18} />} delay={all ? 80 : 0} playKey={`${step}-${all}`}>
            <div className="mb-3 text-xs text-muted">
              คณะกำหนดฐานไว้ว่า บรรยาย 1 หน่วยกิต = <b>{hrsPerLecCr}</b> ชม./สัปดาห์ เมื่อมีนักศึกษา {baseLec} คน ·
              ปฏิบัติการ 1 หน่วยกิต = <b>{hrsPerLabCr}</b> ชม./สัปดาห์ เมื่อมีนักศึกษา {baseLab} คน
              — วิชาที่มีนักศึกษามากหรือน้อยกว่าฐาน ภาระงานจะเพิ่ม/ลดตามสัดส่วน
            </div>
            <div className="space-y-2">
              <AnimatedCalc
                icon={<BookOpen size={14} className="text-blue-600" />}
                label="บรรยาย"
                words={["หน่วยกิต", "×", `${hrsPerLecCr} ชม.`, "×", "นศ. ÷ ฐาน"]}
                nums={[`${lecCr}`, "×", `${hrsPerLecCr}`, "×", `(${students} ÷ ${baseLec})`]}
                ratio={{ n: students, base: baseLec }}
                value={lecWL}
                unit="ชม./สัปดาห์"
                delay={0}
              />
              <AnimatedCalc
                icon={<FlaskConical size={14} className="text-purple-600" />}
                label="ปฏิบัติการ"
                words={["หน่วยกิต", "×", `${hrsPerLabCr} ชม.`, "×", "นศ. ÷ ฐาน"]}
                nums={[`${labCr}`, "×", `${hrsPerLabCr}`, "×", `(${students} ÷ ${baseLab})`]}
                ratio={{ n: students, base: baseLab }}
                value={labWL}
                unit="ชม./สัปดาห์"
                delay={900}
              />
              <Total delay={1900} label="ภาระงานรวมต่อสัปดาห์" sub={`${fmt(lecWL)} + ${fmt(labWL)}`}>
                <CountUp to={workload} d={2} delay={1900} /> ชั่วโมง
              </Total>
            </div>
          </HelpStep>
        )}

        {(all || step === 2) && (
          <HelpStep number={3} title="คูณด้วยอัตราเฉลี่ยต่อชั่วโมงภาระงาน → งบต่อเดือน" icon={<Coins size={18} />} delay={all ? 160 : 0} playKey={`${step}-${all}`}>
            <div className="mb-3 text-xs text-muted">
              อัตราเฉลี่ย <b>฿{rate}</b> ต่อชั่วโมงภาระงานต่อเดือน มาจากค่าเฉลี่ยของ TA สองระดับ
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <RateHalf label="ผู้ช่วยสอนปริญญาตรี" baht={200} delay={100} />
              <RateHalf label="ผู้ช่วยสอนบัณฑิตศึกษา" baht={400} delay={300} />
            </div>
            <Equation
              delay={600}
              parts={[
                { v: `${fmt(workload)} ชม.`, note: "จากขั้นที่ 2" },
                { op: "×" },
                { v: `฿${rate}`, note: "อัตราเฉลี่ย" },
              ]}
              result={<><CountUp to={monthly} d={0} delay={1000} prefix="฿" /> <span className="text-sm font-normal">/ เดือน</span></>}
            />
          </HelpStep>
        )}

        {(all || step === 3) && (
          <HelpStep number={4} title="คูณด้วยจำนวนเดือน → งบทั้งภาคเรียน" icon={<Calendar size={18} />} delay={all ? 240 : 0} playKey={`${step}-${all}`}>
            <div className="mb-3 text-xs text-muted">
              ภาคเรียนนี้มี <b>{termMonths}</b> เดือน (เจ้าหน้าที่กำหนดที่หน้าตั้งค่า → ภาคเรียน)
            </div>
            <div className="mb-3 flex gap-1.5">
              {Array.from({ length: termMonths }).map((_, i) => (
                <div key={i} className="flex-1 rounded-md border border-success/40 bg-success-soft/50 px-2 py-1.5 text-center text-xs tabular animate-in fade-in zoom-in-95 duration-300 fill-mode-both"
                  style={{ animationDelay: `${150 + i * 150}ms` }}>
                  <Calendar size={12} className="mx-auto mb-0.5 text-success" />
                  {bahtF(monthly)}
                </div>
              ))}
            </div>
            <Equation
              delay={150 + termMonths * 150}
              parts={[
                { v: bahtF(monthly), note: "ต่อเดือน" },
                { op: "×" },
                { v: `${termMonths} เดือน`, note: "ทั้งเทอม" },
              ]}
              result={<CountUp to={term} d={0} delay={500 + termMonths * 150} prefix="฿" />}
              big
            />

            <div className="mt-4 rounded-lg border border-accent/40 bg-accent-soft p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both" style={{ animationDelay: `${1400 + termMonths * 150}ms` }}>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted">
                สรุปงบวิชานี้ ({isSpecial ? "พิเศษ" : "ปกติ"})
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular">{bahtF(term)}</span>
                <span className="text-sm text-muted tabular">
                  = {fmt(workload)} ชม./สัปดาห์ × ฿{rate} × {termMonths} เดือน
                </span>
              </div>
            </div>
          </HelpStep>
        )}

        {(all || last) && (
          <div className="flex items-start gap-2 border-t border-border pt-2 text-xs text-muted">
            <InfoIcon size={14} className="mt-0.5 shrink-0" />
            <span>
              <b>หมายเหตุ:</b> ตัวเลขนี้เป็น <b>เพดานงบต่อวิชา</b> ค่าตอบแทนจริงของผู้ช่วยสอนแต่ละคนเบิกตามชั่วโมงที่ทำจริง
              (ปริญญาตรี ภาคปกติ 40 บาท/ชั่วโมง · ภาคพิเศษ 50 บาท/ชั่วโมง ไม่เกิน 2,000 บาท/เดือน · บัณฑิตศึกษา ภาคปกติ 50 บาท/ชั่วโมง)
              หรือเหมาจ่ายทั้งภาคเรียน (บัณฑิตศึกษา ภาคพิเศษ 4,000 บาท/คน/วิชา) รวมทุกคนแล้วต้องไม่เกินเพดานงบนี้
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/** Number that counts up from 0 to `to` after `delay` ms, easing out. */
function CountUp({ to, d, delay = 0, prefix = "" }: { to: number; d: number; delay?: number; prefix?: string }) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    setV(0);
    const dur = 900;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(to * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    const id = setTimeout(() => { raf.current = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(id); cancelAnimationFrame(raf.current); };
  }, [to, delay]);
  return <span className="tabular">{prefix}{fmt(v, d)}</span>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "ok" }) {
  return (
    <span className={"rounded-md border px-1.5 py-0.5 font-medium " + (tone === "ok" ? "border-success/40 bg-success-soft text-success-soft-foreground" : "border-border bg-panel")}>
      {children}
    </span>
  );
}

function CodePart({ n, label, note, muted }: { n: number; label: string; note: string; muted?: boolean }) {
  return (
    <div className={"rounded-md border border-hairline bg-panel px-2 py-1.5 " + (muted ? "opacity-60" : "")}>
      <span className="text-base font-semibold tabular">{n}</span> <span className="text-muted">{label}</span>
      <div className="text-[11px] text-ink-2">{note}</div>
    </div>
  );
}

function RateHalf({ label, baht, delay }: { label: string; baht: number; delay: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-2 animate-in fade-in slide-in-from-left-2 duration-400 fill-mode-both" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-muted">{label}</div>
      <div className="tabular"><b>฿{baht}</b>/ชม.ภาระงาน/เดือน <span className="text-muted">× 50%</span> = <b>฿{baht / 2}</b></div>
    </div>
  );
}

/**
 * One line of the workload sum, played in three beats: the formula in words,
 * the words replaced by the course's numbers, then the answer counting up.
 * A bar under it shows the นศ. ÷ ฐาน proportion, which is the part people
 * most often ask about.
 */
function AnimatedCalc({ icon, label, words, nums, ratio, value, unit, delay }: {
  icon: React.ReactNode; label: string; words: string[]; nums: string[];
  ratio: { n: number; base: number }; value: number; unit: string; delay: number;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    setBeat(0);
    const a = setTimeout(() => setBeat(1), delay + 700);
    const b = setTimeout(() => setBeat(2), delay + 1300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [delay]);
  const pct = ratio.base > 0 ? Math.min(100, (ratio.n / ratio.base) * 100) : 0;
  const shown = beat === 0 ? words : nums;
  return (
    <div className="rounded-lg border border-hairline p-3 animate-in fade-in slide-in-from-bottom-1 duration-400 fill-mode-both" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex w-20 shrink-0 items-center gap-1.5">{icon}<span className="text-muted">{label}</span></div>
        <div className="flex flex-1 flex-wrap items-center gap-1.5 tabular">
          {shown.map((tok, i) => (
            <span key={`${beat === 0 ? "w" : "n"}-${i}`}
              className={(tok === "×" ? "text-muted" : "rounded-md border px-1.5 py-0.5 text-xs " + (beat === 0 ? "border-dashed border-border text-muted" : "border-accent/40 bg-accent-soft font-medium")) + " animate-in fade-in zoom-in-95 duration-300"}>
              {tok}
            </span>
          ))}
          <ArrowRight size={12} className="text-muted" />
        </div>
        <div className={"min-w-24 text-right font-semibold tabular transition-opacity duration-300 " + (beat === 2 ? "opacity-100" : "opacity-0")}>
          {beat === 2 && <CountUp to={value} d={2} />} <span className="text-xs font-normal text-muted">{unit}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span className="w-20 shrink-0">นศ. ÷ ฐาน</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: beat >= 1 ? `${pct}%` : "0%" }} />
        </div>
        <span className="w-24 text-right tabular">{ratio.n} ÷ {ratio.base} = {fmt(ratio.n / Math.max(1, ratio.base))}</span>
      </div>
    </div>
  );
}

function Total({ label, sub, delay, children }: { label: string; sub: string; delay: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent-soft p-3 animate-in fade-in slide-in-from-bottom-1 duration-400 fill-mode-both" style={{ animationDelay: `${delay}ms` }}>
      <span className="flex items-center gap-2 text-sm font-medium"><Sigma size={14} /> {label} <span className="text-xs font-normal text-muted tabular">({sub})</span></span>
      <span className="text-lg font-bold tabular">{children}</span>
    </div>
  );
}

function Equation({ parts, result, delay, big }: {
  parts: ({ v: string; note: string } | { op: string })[];
  result: React.ReactNode; delay: number; big?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-linear-to-r from-emerald-50 to-emerald-100 p-3 animate-in fade-in slide-in-from-bottom-1 duration-400 fill-mode-both" style={{ animationDelay: `${delay}ms` }}>
      {parts.map((p, i) => "op" in p
        ? <X key={i} size={14} className="text-muted" />
        : (
          <div key={i} className="text-center">
            <div className="rounded-md border border-border bg-panel px-2 py-1 text-sm font-medium tabular">{p.v}</div>
            <div className="mt-0.5 text-[10px] text-muted">{p.note}</div>
          </div>
        ))}
      <ArrowRight size={16} className="text-muted" />
      <span className={"ml-auto font-bold text-emerald-700 tabular " + (big ? "text-2xl" : "text-lg")}>{result}</span>
    </div>
  );
}

function HelpStep({
  number, title, icon, delay, playKey, children,
}: {
  number: number;
  title: string;
  icon: React.ReactNode;
  delay: number;
  /** Changes whenever the step is (re)shown so its entrance replays. */
  playKey: string;
  children: React.ReactNode;
}) {
  return (
    <div
      key={playKey}
      className="rounded-xl border border-border p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground tabular">
          {number}
        </span>
        <span className="text-accent-soft-foreground">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

function InputChip({
  icon, label, value, tone = "default", hint, delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "brand" | "warn";
  /** Where the figure came from, when it is derived rather than typed in. */
  hint?: string;
  delay?: number;
}) {
  const bg = tone === "brand" ? "bg-accent-soft" : tone === "warn" ? "bg-warning-soft" : "bg-slate-50";
  const iconColor = tone === "brand" ? "text-accent" : tone === "warn" ? "text-warning-soft-foreground" : "text-muted";
  return (
    <div className={`rounded-lg border border-border p-3 ${bg} animate-in fade-in zoom-in-95 duration-400 fill-mode-both`} style={{ animationDelay: `${delay}ms` }}>
      <div className={`mb-1 flex items-center gap-1.5 text-xs ${iconColor}`}>
        {icon}<span>{label}</span>
      </div>
      <div className="text-lg font-semibold tabular">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
    </div>
  );
}
