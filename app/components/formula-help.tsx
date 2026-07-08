"use client";
import {
  Info as InfoIcon, BookOpen, FlaskConical, Users, Coins, Calendar,
  ArrowRight, Sparkles, Sigma, X,
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
  students: number;
  trackLabel: string;       // "ภาคปกติ" / "ภาคพิเศษ"
  isSpecial?: boolean;
  courseName?: string;
}

const DEFAULT_EXAMPLE: FormulaExample = {
  lecCr: 2, labCr: 1, students: 5,
  trackLabel: "ภาคปกติ",
  courseName: "ตัวอย่าง — SW-TESTING (3 นก.)",
};

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
  const { lecCr, labCr, students, trackLabel, isSpecial, courseName } = ex;

  const lecWL = students > 0 && baseLec > 0 ? lecCr * hrsPerLecCr * (students / baseLec) : 0;
  const labWL = students > 0 && baseLab > 0 ? labCr * hrsPerLabCr * (students / baseLab) : 0;
  const workload = lecWL + labWL;
  const monthly = workload * rate;
  const term = monthly * termMonths;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          วิธีคิดงบ TA — {trackLabel}
        </span>
      }
      size="xl"
      footer={<Button variant="primary" onClick={onClose}>เข้าใจแล้ว</Button>}
    >
      <div className="space-y-4">
        {courseName && (
          <div className="text-sm text-muted animate-in fade-in duration-300">
            {example ? "วิชา" : "ตัวอย่างวิชา"}: <b className="text-foreground">{courseName}</b>
          </div>
        )}

        <HelpStep number={1} title="ข้อมูลตั้งต้นของวิชา" icon={<Users size={18} />} delay={0}>
          <div className="grid grid-cols-3 gap-3">
            <InputChip icon={<BookOpen size={16} />} label="นก. บรรยาย" value={`${lecCr}`} />
            <InputChip icon={<FlaskConical size={16} />} label="นก. ปฏิบัติ" value={`${labCr}`} />
            <InputChip
              icon={<Users size={16} />}
              label={isSpecial ? "นศ. พิเศษ" : "นศ. ปกติ"}
              value={`${students} คน`}
              tone={isSpecial ? "warn" : "brand"}
            />
          </div>
        </HelpStep>

        <HelpStep number={2} title="คำนวณภาระงาน / สัปดาห์" icon={<Sigma size={18} />} delay={80}>
          <div className="text-xs text-muted mb-2">
            บรรยาย 1 นก. = <b>{hrsPerLecCr}</b> ชม./สัปดาห์ (baseline {baseLec} นศ./sec) ·
            ปฏิบัติ 1 นก. = <b>{hrsPerLabCr}</b> ชม./สัปดาห์ (baseline {baseLab} นศ./sec)
          </div>
          <div className="space-y-2">
            <CalcRow
              icon={<BookOpen size={14} className="text-blue-600" />}
              label="บรรยาย"
              formula={`${lecCr} × ${hrsPerLecCr} × (${students} / ${baseLec})`}
              value={lecWL.toFixed(2)}
              unit="ชม."
            />
            <CalcRow
              icon={<FlaskConical size={14} className="text-purple-600" />}
              label="ปฏิบัติ"
              formula={`${labCr} × ${hrsPerLabCr} × (${students} / ${baseLab})`}
              value={labWL.toFixed(2)}
              unit="ชม."
            />
            <div className="flex items-center justify-between p-3 rounded-lg bg-accent-soft border border-accent/30">
              <span className="text-sm font-medium flex items-center gap-2">
                <Sigma size={14} /> ภาระงานรวม / สัปดาห์
              </span>
              <span className="tabular font-bold text-lg">{workload.toFixed(2)} ชม.</span>
            </div>
          </div>
        </HelpStep>

        <HelpStep number={3} title="คูณด้วย effective rate → งบ/เดือน" icon={<Coins size={18} />} delay={160}>
          <div className="text-xs text-muted mb-2">
            effective rate <b>฿{rate}</b> = (50% × ฿200 ตรี TA) + (50% × ฿400 บัณฑิต TA)
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-border">
            <span className="tabular font-medium">{workload.toFixed(2)}</span>
            <X size={14} className="text-muted" />
            <span className="tabular font-medium">฿{rate}</span>
            <ArrowRight size={16} className="text-muted mx-1" />
            <span className="tabular font-bold text-lg text-emerald-700 ml-auto">
              ฿{monthly.toFixed(0)} / เดือน
            </span>
          </div>
        </HelpStep>

        <HelpStep number={4} title="คูณด้วยจำนวนเดือน → งบทั้งเทอม" icon={<Calendar size={18} />} delay={240}>
          <div className="text-xs text-muted mb-2">
            เทอมนี้มี <b>{termMonths}</b> เดือน (กำหนดที่ Settings → ภาคเรียน)
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-linear-to-r from-emerald-50 to-emerald-100 border border-emerald-200">
            <span className="tabular font-medium">฿{monthly.toFixed(0)}</span>
            <X size={14} className="text-muted" />
            <span className="tabular font-medium">{termMonths} เดือน</span>
            <ArrowRight size={16} className="text-muted mx-1" />
            <span className="tabular font-bold text-xl text-emerald-700 ml-auto">
              ฿{term.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </HelpStep>

        <div className="mt-4 p-4 rounded-lg bg-accent-soft border border-accent/40 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">
            สรุปงบวิชานี้ ({isSpecial ? "พิเศษ" : "ปกติ"})
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-bold tabular">
              ฿{term.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-sm text-muted">
              = {workload.toFixed(2)} ชม./สัปดาห์ × ฿{rate} × {termMonths} เดือน
            </span>
          </div>
        </div>

        <div className="text-xs text-muted pt-2 border-t border-border flex items-start gap-2">
          <InfoIcon size={14} className="shrink-0 mt-0.5" />
          <span>
            <b>หมายเหตุ:</b> ตัวเลขนี้เป็น <b>เพดานงบต่อวิชา</b> — ค่าจ้างจริงต่อ TA เบิกตามชั่วโมงจริง
            (ตรี ปกติ 40 บ./ชม., พิเศษ 50 บ./ชม.) หรือเหมาจ่ายเดือน (โท ปกติ 3,000, พิเศษ 4,000) —
            รวมทุก TA ต้องไม่เกินเพดานงบนี้
          </span>
        </div>
      </div>
    </Modal>
  );
}

function HelpStep({
  number, title, icon, delay, children,
}: {
  number: number;
  title: string;
  icon: React.ReactNode;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-border p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold tabular">
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
  icon, label, value, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "brand" | "warn";
}) {
  const bg = tone === "brand" ? "bg-accent-soft" : tone === "warn" ? "bg-warning-soft" : "bg-slate-50";
  const iconColor = tone === "brand" ? "text-accent" : tone === "warn" ? "text-warning-soft-foreground" : "text-muted";
  return (
    <div className={`rounded-lg border border-border p-3 ${bg}`}>
      <div className={`flex items-center gap-1.5 text-xs ${iconColor} mb-1`}>
        {icon}<span>{label}</span>
      </div>
      <div className="text-lg font-semibold tabular">{value}</div>
    </div>
  );
}

function CalcRow({
  icon, label, formula, value, unit,
}: {
  icon: React.ReactNode;
  label: string;
  formula: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-1.5 w-16 shrink-0">
        {icon}<span className="text-muted">{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-2 text-xs text-muted tabular">
        <span>{formula}</span>
        <ArrowRight size={12} />
      </div>
      <div className="tabular font-medium">
        {value} <span className="text-xs text-muted">{unit}</span>
      </div>
    </div>
  );
}
