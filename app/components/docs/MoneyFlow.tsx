import { Banknote, CircleCheck, Clock, FileSignature, PackageCheck, Undo2 } from "lucide-react";

/**
 * "เส้นทางเงิน" — the five steps a month of TA work goes through, drawn in the
 * page rather than shipped as an image: it stays sharp at any width, uses the
 * site's Thai font, and reflows to a vertical list on a phone (and inside the
 * docs drawer, whose iframe is phone-width).
 *
 * Wide layout, top to bottom:
 *   hubs   — "ในระบบ COCO TAS" over steps 1-3, "เอกสารกระดาษ" over 4-5
 *   traces — circuit-style lines from each hub down to its steps
 *   cards  — the five steps, joined left to right by lines a pulse runs along
 *   return — the send-back path from steps 2 and 3 back to step 1
 *
 * Every line is a straight horizontal or vertical run inside an SVG with
 * preserveAspectRatio="none" + non-scaling strokes, so the grid can stretch
 * to any width without bending the lines. Motion is CSS only (keyframes in
 * globals.css under "docs-flow") and stops under prefers-reduced-motion.
 */

type Tone = "ta" | "lecturer" | "staff" | "paper";

const TONE: Record<Tone, { bar: string; ink: string; soft: string; ring: string; label: string }> = {
  ta:       { bar: "bg-[#1d7a4a]", ink: "text-[#1d7a4a]", soft: "bg-[#f3faf6]", ring: "border-[#bfe3cd]", label: "ผู้ช่วยสอน" },
  lecturer: { bar: "bg-[#0776bc]", ink: "text-[#0776bc]", soft: "bg-[#f1f7fc]", ring: "border-[#bcd9ee]", label: "อาจารย์" },
  staff:    { bar: "bg-[#9a5b00]", ink: "text-[#9a5b00]", soft: "bg-[#fbf6ee]", ring: "border-[#ecd4ad]", label: "เจ้าหน้าที่" },
  paper:    { bar: "bg-[#64748b]", ink: "text-[#475569]", soft: "bg-[#f6f7f9]", ring: "border-[#d5dbe3]", label: "เอกสารกระดาษ" },
};

interface Step {
  n: number;
  tone: Tone;
  who?: string;
  title: string;
  body: string;
  status?: string;
  Icon: typeof Clock;
}

const STEPS: Step[] = [
  { n: 1, tone: "ta", title: "ลงเวลาและส่งอนุมัติ", body: "ทุกเดือน ก่อนวันครบกำหนดของเดือนนั้น", status: "pending", Icon: Clock },
  { n: 2, tone: "lecturer", title: "อนุมัติบันทึกเวลา", body: "ทีละคน ทีละเดือน หรือส่งกลับให้แก้", status: "lecturer_approved", Icon: CircleCheck },
  { n: 3, tone: "staff", title: "ตรวจและส่งออกเอกสาร", body: "ดาวน์โหลดไฟล์ ZIP แล้วเดือนนั้นจะถูกล็อก", status: "exported", Icon: PackageCheck },
  { n: 4, tone: "paper", who: "ผู้ลงนาม", title: "ลงนามเอกสาร", body: "TA อาจารย์ และผู้รับรองเซ็นตามลำดับ", Icon: FileSignature },
  { n: 5, tone: "paper", who: "การเงิน", title: "ส่งการเงิน คณบดีลงนาม", body: "ค่าตอบแทนเข้าบัญชีของผู้ช่วยสอน", status: "finance_sent", Icon: Banknote },
];

function Card({ s }: { s: Step }) {
  const t = TONE[s.tone];
  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-xl border ${t.ring} ${t.soft} shadow-[0_1px_2px_rgba(15,23,42,0.05)]`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${t.bar}`}>{s.n}</span>
          <span className={`text-xs font-semibold ${t.ink}`}>{s.who ?? t.label}</span>
          <s.Icon size={16} className={`ms-auto shrink-0 ${t.ink} opacity-70`} aria-hidden="true" />
        </div>
        <div className="mt-1 text-[15px] font-semibold leading-snug text-foreground">{s.title}</div>
        <p className="text-[13px] leading-relaxed text-foreground/75">{s.body}</p>
        <div className="mt-auto pt-1 font-mono text-[11px] text-slate-500">
          {s.status ?? <span className="font-sans">ติดตามที่หน้าความคืบหน้าเอกสาร</span>}
        </div>
      </div>
    </div>
  );
}

/** A horizontal run between two cards, with a light pulse travelling along it. */
function FlowLink({ delay }: { delay: number }) {
  return (
    <span className="docs-flow-link" style={{ ["--d" as string]: `${delay}s` }} aria-hidden="true">
      <span />
    </span>
  );
}

function Hub({ title, sub, tone }: { title: string; sub: string; tone: "system" | "paper" }) {
  return (
    <div className="flex justify-center">
      <div
        className={
          "relative rounded-lg border px-4 py-2 text-center shadow-[0_1px_2px_rgba(15,23,42,0.06)] " +
          (tone === "system" ? "border-[#bcd9ee] bg-white" : "border-dashed border-[#c5ced9] bg-white")
        }
      >
        {/* chip pins, as on the reference's "Powered By" block */}
        <span className="docs-flow-pins" aria-hidden="true" />
        <div className={`text-sm font-semibold ${tone === "system" ? "text-[#0776bc]" : "text-slate-600"}`}>{title}</div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

/** Vertical traces from a hub down to the centre of each card column below it. */
function Drops({ columns, accent }: { columns: number; accent: string }) {
  const xs = Array.from({ length: columns }, (_, i) => ((i + 0.5) / columns) * 100);
  return (
    <svg className="block h-9 w-full overflow-visible" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <line x1={0 + (0.5 / columns) * 100} y1="10" x2={100 - (0.5 / columns) * 100} y2="10" stroke="#cbd5e1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1="50" y1="0" x2="50" y2="10" stroke="#cbd5e1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {xs.map((x, i) => (
        <g key={x}>
          <line x1={x} y1="10" x2={x} y2="36" stroke="#cbd5e1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <line
            className="docs-flow-drop"
            style={{ animationDelay: `${i * 0.35}s` }}
            x1={x} y1="10" x2={x} y2="36"
            stroke={accent} strokeWidth="2" vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}

export default function MoneyFlow() {
  return (
    <figure className="my-4" aria-label="เส้นทางเงินของ COCO TAS 5 ขั้น">
      {/* ---------------- wide layout ---------------- */}
      <div className="hidden md:block rounded-2xl border border-border bg-[radial-gradient(circle_at_30%_0%,#eef6fc,transparent_60%)] bg-white px-4 pb-4 pt-5">
        <div className="grid grid-cols-5">
          <div className="col-span-3"><Hub tone="system" title="ในระบบ COCO TAS" sub="ทำและติดตามได้ในเว็บ" /></div>
          <div className="col-span-2"><Hub tone="paper" title="เอกสารกระดาษ" sub="ติดตามที่หน้าความคืบหน้าเอกสาร" /></div>
          <div className="col-span-3"><Drops columns={3} accent="#0776bc" /></div>
          <div className="col-span-2"><Drops columns={2} accent="#64748b" /></div>
        </div>

        <ol className="grid grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative px-3">
              <Card s={s} />
              {i < STEPS.length - 1 && <FlowLink delay={i * 0.45} />}
            </li>
          ))}
        </ol>

        {/* send-back path: from under steps 2 and 3 back to step 1 */}
        <div className="grid grid-cols-5">
          <div className="relative col-span-3">
            <svg className="block h-10 w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M83.33 0 V26 H16.67 V4 M50 0 V26"
                fill="none" stroke="#e5484d" strokeWidth="1.5" strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke" className="docs-flow-back"
              />
            </svg>
            {/* arrow head at step 1 — a DOM triangle, since an SVG marker would stretch with the viewBox */}
            <span className="absolute top-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-[#e5484d]" style={{ left: "calc(100% / 6)" }} aria-hidden="true" />
          </div>
          <div className="col-span-2" />
        </div>
        <div className="grid grid-cols-5">
          <p className="col-span-3 -mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-[#c2323a]">
            <Undo2 size={13} /> ถ้าอาจารย์หรือเจ้าหน้าที่ส่งกลับพร้อมเหตุผล ผู้ช่วยสอนแก้แล้วส่งใหม่
          </p>
        </div>
      </div>

      {/* ---------------- narrow layout (phones, docs drawer) ---------------- */}
      <div className="md:hidden rounded-2xl border border-border bg-white p-4">
        <ol className="relative space-y-3 ps-6">
          <span className="docs-flow-spine" aria-hidden="true"><span /></span>
          {STEPS.map((s) => (
            <li key={s.n} className="relative">
              {s.n === 1 && <div className="mb-2 text-xs font-semibold text-[#0776bc]">ในระบบ COCO TAS</div>}
              {s.n === 4 && <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">เอกสารกระดาษ</div>}
              {/* dot sits on the card, not the li, so a group heading above
                  step 1 or 4 doesn't push it off its card */}
              <div className="relative">
                <span className={`absolute -start-[1.3rem] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${TONE[s.tone].bar}`} aria-hidden="true" />
                <Card s={s} />
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-[#c2323a]">
          <Undo2 size={13} className="mt-0.5 shrink-0" /> ถ้าอาจารย์หรือเจ้าหน้าที่ส่งกลับพร้อมเหตุผล ผู้ช่วยสอนแก้แล้วส่งใหม่
        </p>
      </div>

      <figcaption className="mt-2 text-center text-xs text-muted">
        ตัวหนังสือเล็กใต้แต่ละขั้นคือชื่อสถานะในระบบ ดูความหมายได้ที่หน้าตารางสถานะ
      </figcaption>
    </figure>
  );
}
