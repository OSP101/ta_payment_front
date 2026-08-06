"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Calculator, ChevronDown, RotateCcw, CircleCheck, TriangleAlert, Users,
} from "lucide-react";
import { Panel, Select, TextInput, Chip } from "./ui";

/* -------------------------------------------------------------------------- */
/* เครื่องคิดเลขงบ TA — what-if calculator shown before submitting a request.   */
/*                                                                            */
/* ทุกสูตรสะท้อน backend (internal/service/budget.go + ตารางอัตราค่าตอบแทน)     */
/* ต่างกันแค่ "จำนวน นศ." กับ "จำนวน TA" ที่อาจารย์ปรับเล่นได้ในหน้าจอ โดยไม่   */
/* บันทึกอะไรลงฐานข้อมูล — เป็นตัวช่วยตัดสินใจว่าจะรับ TA กี่คนเท่านั้น        */
/* -------------------------------------------------------------------------- */

interface BudgetSnapshot {
  num_students_regular: number;
  num_students_special: number;
  lecture_credits: number;
  lab_credits: number;
  per_course_max: number;
  used_baht: number;
  remaining_baht: number;
  rates: {
    ug_lecture_hours_per_credit: number;
    ug_lab_hours_per_credit: number;
    baseline_students_lecture: number;
    baseline_students_lab: number;
    ug_workload_rate_regular: number;
    term_months: number;
  };
}

interface PayRate {
  undergrad_regular: number;        // ฿/ชม. — ป.ตรี ภาคปกติ
  undergrad_special: number;        // ฿/ชม. — ป.ตรี ภาคพิเศษ
  graduate_regular_hourly: number;  // ฿/ชม. — บัณฑิต ภาคปกติ
  graduate_special_lumpsum: number; // ฿/เดือน เหมาจ่าย — บัณฑิต ภาคพิเศษ
  grad_special_term_cap: number;    // เพดานต่อคน/วิชา/เทอม (บัณฑิต พิเศษ)
  ug_special_monthly_cap: number;   // เพดาน ฿/เดือน — ป.ตรี ภาคพิเศษ (ประกาศ: 2,000)
  ug_regular_daily_hour_cap: number;   // ≤7 ชม./วัน
  ug_special_daily_hour_cap: number;   // ≤6 ชม./วัน
  grad_regular_daily_hour_cap: number; // ≤6 ชม./วัน
}

type Track = "regular" | "special";

/** สัปดาห์ต่อเดือนที่ใช้แปลง ชม./สัปดาห์ → ค่าตอบแทนรายเดือน (ตามที่ระบบใช้อยู่) */
const WEEKS_PER_MONTH = 4;
/** ค่าตั้งต้น ชม./สัปดาห์/คน — บัณฑิตต้อง 10–12 ชม. ตามระเบียบ */
const DEFAULT_UG_HRS = 8;
const DEFAULT_GRAD_HRS = 10;
const GRAD_MAX_HRS = 12;
/** วันทำการ/สัปดาห์ ที่ใช้แปลงเพดาน ชม./วัน → ชม./สัปดาห์ (ตรงกับ backend) */
const WORKING_DAYS = 5;

const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");

interface TrackInput {
  students: number;
  ugCount: number;
  ugHrs: number;
  gradCount: number;
  gradHrs: number;
}

/** จำนวน TA ที่ระบบแนะนำ — สูตรเดียวกับ backend: min(3, ceil(นศ./25)) */
const suggestUg = (students: number) => Math.min(3, Math.ceil(students / 25));

export function TaBudgetCalculator({
  tcId, hasSpecialSection,
}: {
  tcId: string;
  /** วิชามี section ภาคพิเศษไหม — แสดงการ์ดภาคพิเศษแม้ยังไม่มีจำนวน นศ. */
  hasSpecialSection?: boolean;
}) {
  const { data: b } = useSWR<BudgetSnapshot>(tcId ? `/teaching-courses/${tcId}/budget` : null);
  const { data: rate } = useSWR<PayRate>("/settings/pay-rate");
  const [open, setOpen] = useState(true);

  const [inputs, setInputs] = useState<Record<Track, TrackInput> | null>(null);

  // ตั้งค่าเริ่มต้นจากข้อมูลจริงครั้งเดียวเมื่อโหลดเสร็จ (แล้วปล่อยให้อาจารย์ปรับเอง)
  useEffect(() => {
    if (!b || inputs) return;
    setInputs(defaultsFrom(b));
  }, [b, inputs]);

  if (!b || !rate || !inputs) {
    return <div className="mb-4 h-28 rounded-xl bg-surface-secondary animate-pulse" />;
  }

  const hasSpecial =
    !!hasSpecialSection || b.num_students_special > 0 || inputs.special.students > 0;
  const tracks: Track[] = hasSpecial ? ["regular", "special"] : ["regular"];

  const results = tracks.map(t => computeTrack(t, inputs[t], b, rate));
  const totalCostMonth = results.reduce((s, r) => s + r.costMonthly, 0);
  const totalBudgetMonth = results.reduce((s, r) => s + r.budgetMonthly, 0);
  const months = b.rates.term_months || 1;
  const diffMonth = totalBudgetMonth - totalCostMonth;
  const overall = totalCostMonth === 0 ? "empty" : diffMonth >= 0 ? "ok" : "over";

  const setTrack = (t: Track, patch: Partial<TrackInput>) =>
    setInputs(prev => (prev ? { ...prev, [t]: { ...prev[t], ...patch } } : prev));

  return (
    <Panel className="mb-4" padded={false}>
      {/* หัวข้อ — กดพับได้ แต่เปิดไว้เป็นค่าเริ่มต้นเพื่อให้เห็นเลยว่ามีเครื่องคิดเลข */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronDown
          size={16}
          className={"text-muted transition-transform " + (open ? "" : "-rotate-90")}
        />
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <Calculator size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            เครื่องคิดเลขงบ TA <span className="font-normal text-muted">(โดยประมาณ)</span>
          </div>
          <div className="text-xs text-muted">
            ลองปรับจำนวน นศ. และจำนวน TA เพื่อดูว่างบพอไหม ก่อนส่งคำขอ ไม่บันทึกลงระบบ
          </div>
        </div>
        {!open && (
          <span className="shrink-0">
            {overall === "over"
              ? <Chip tone="danger"><TriangleAlert size={12} /> เกินงบ</Chip>
              : overall === "ok"
              ? <Chip tone="success"><CircleCheck size={12} /> ใช้งบได้</Chip>
              : <Chip tone="neutral">ยังไม่ได้เลือก TA</Chip>}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-hairline px-4 py-4">
          <div className={"grid gap-3 " + (tracks.length > 1 ? "lg:grid-cols-2" : "")}>
            {tracks.map((t, i) => (
              <TrackCard
                key={t}
                track={t}
                input={inputs[t]}
                result={results[i]}
                rate={rate}
                months={months}
                onChange={patch => setTrack(t, patch)}
              />
            ))}
          </div>

          {/* สรุปรวมทั้งวิชา — แสดงเมื่อมีสองภาค ไม่งั้นซ้ำกับการ์ดเดียว */}
          {tracks.length > 1 && (
            <div className="mt-3 rounded-xl border border-border bg-panel p-3">
              <div className="text-xs font-semibold mb-2">รวมทั้งวิชา</div>
              <SumRow label="รวมต้องจ่าย/เดือน" value={baht(totalCostMonth)} strong />
              <SumRow label={`× ${months} เดือน`} value={baht(totalCostMonth * months)} muted />
              <SumRow label="งบที่ได้รับ/เดือน" value={baht(totalBudgetMonth)} />
              <VerdictBanner diffMonth={diffMonth} months={months} empty={overall === "empty"} />
            </div>
          )}

          {/* ที่มาของตัวเลข + ปุ่มรีเซ็ต */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
            <div className="text-[11px] text-muted">
              งบที่ใช้ไปแล้วในวิชานี้ ~{baht(b.used_baht)} · คงเหลือ ~{baht(b.remaining_baht)} ·
              {" "}เพดานทั้งเทอม ~{baht(b.per_course_max)}
            </div>
            <button
              type="button"
              onClick={() => setInputs(defaultsFrom(b))}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <RotateCcw size={12} /> คืนค่าตามข้อมูลจริง
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function defaultsFrom(b: BudgetSnapshot): Record<Track, TrackInput> {
  const mk = (students: number): TrackInput => ({
    students,
    ugCount: students > 0 ? suggestUg(students) : 0,
    ugHrs: DEFAULT_UG_HRS,
    gradCount: 0,
    gradHrs: DEFAULT_GRAD_HRS,
  });
  return { regular: mk(b.num_students_regular), special: mk(b.num_students_special) };
}

interface TrackResult {
  weekly: number;
  budgetMonthly: number;
  ugPerPerson: number;
  gradPerPerson: number;
  costMonthly: number;
  /** true = ค่าตอบแทน ป.ตรี ถูกตัดลงตามเพดาน 2,000 ฿/เดือน (ภาคพิเศษ) */
  ugCapped: boolean;
}

/** สูตรเดียวกับ backend — เปลี่ยนแค่จำนวน นศ. ที่อาจารย์กรอกในหน้าจอ */
function computeTrack(
  track: Track, inp: TrackInput, b: BudgetSnapshot, rate: PayRate,
): TrackResult {
  const r = b.rates;
  const lec = b.lecture_credits > 0 && r.baseline_students_lecture > 0
    ? b.lecture_credits * r.ug_lecture_hours_per_credit * (inp.students / r.baseline_students_lecture)
    : 0;
  const lab = b.lab_credits > 0 && r.baseline_students_lab > 0
    ? b.lab_credits * r.ug_lab_hours_per_credit * (inp.students / r.baseline_students_lab)
    : 0;
  const weekly = lec + lab;
  const budgetMonthly = weekly * r.ug_workload_rate_regular;

  const ugHourly = track === "regular" ? rate.undergrad_regular : rate.undergrad_special;
  const ugRaw = inp.ugHrs * WEEKS_PER_MONTH * ugHourly;
  // ประกาศ: ป.ตรี ภาคพิเศษ "50 ฿/ชม. หรือ 2,000 ฿/เดือน" → จ่ายตามจริงแต่ไม่เกินเพดาน
  const ugCap = track === "special" ? rate.ug_special_monthly_cap : 0;
  const ugPerPerson = ugCap > 0 ? Math.min(ugRaw, ugCap) : ugRaw;
  // บัณฑิต ภาคพิเศษ = เหมาจ่ายรายเดือน (คงที่ ไม่ขึ้นกับชั่วโมง); ภาคปกติ = รายชั่วโมง
  const gradPerPerson = track === "special"
    ? rate.graduate_special_lumpsum
    : inp.gradHrs * WEEKS_PER_MONTH * rate.graduate_regular_hourly;

  return {
    weekly,
    budgetMonthly,
    ugPerPerson,
    gradPerPerson,
    costMonthly: inp.ugCount * ugPerPerson + inp.gradCount * gradPerPerson,
    ugCapped: ugCap > 0 && ugRaw > ugCap,
  };
}

function TrackCard({
  track, input, result, rate, months, onChange,
}: {
  track: Track;
  input: TrackInput;
  result: TrackResult;
  rate: PayRate;
  months: number;
  onChange: (patch: Partial<TrackInput>) => void;
}) {
  const isSpecial = track === "special";
  const diffMonth = result.budgetMonthly - result.costMonthly;
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <div className="mb-3">
        <Chip tone={isSpecial ? "warn" : "brand"}>{isSpecial ? "ภาคพิเศษ" : "ภาคปกติ"}</Chip>
      </div>

      {/* แถวบน: นศ. (แก้ได้) → ภาระงาน → งบที่ได้รับ */}
      <div className="grid grid-cols-3 items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">
            นศ. ({isSpecial ? "ภาคพิเศษ" : "ภาคปกติ"})
          </span>
          <TextInput
            type="number"
            min={0}
            value={String(input.students)}
            onChange={e => onChange({ students: clampInt(e.target.value, 0, 2000) })}
            aria-label={`จำนวนนักศึกษา ${isSpecial ? "ภาคพิเศษ" : "ภาคปกติ"}`}
          />
        </label>
        <Stat label="ภาระงาน (ชม./สัปดาห์)" value={hrs(result.weekly)} />
        <Stat label="งบ/เดือน" value={baht(result.budgetMonthly)} />
      </div>

      <div className="mt-4 text-xs font-semibold">เลือกจำนวน TA ในภาคนี้</div>

      <TaRow
        label="ป.โท / ป.เอก"
        count={input.gradCount}
        hrsValue={input.gradHrs}
        hrsMax={GRAD_MAX_HRS}
        hrsDisabled={isSpecial}
        onCount={n => onChange({ gradCount: n })}
        onHrs={h => onChange({ gradHrs: h })}
        note={isSpecial
          ? `เหมาจ่าย ${baht(rate.graduate_special_lumpsum)}/เดือน/คน (คงที่ ไม่ขึ้นกับชั่วโมง · เพดาน ${baht(rate.grad_special_term_cap)}/เทอม)`
          : `${baht(rate.graduate_regular_hourly)}/ชม. · ${baht(result.gradPerPerson)}/เดือน/คน`}
      />
      <TaRow
        label="ป.ตรี"
        count={input.ugCount}
        hrsValue={input.ugHrs}
        hrsMax={(isSpecial ? rate.ug_special_daily_hour_cap : rate.ug_regular_daily_hour_cap) * WORKING_DAYS}
        onCount={n => onChange({ ugCount: n })}
        onHrs={h => onChange({ ugHrs: h })}
        note={`${baht(isSpecial ? rate.undergrad_special : rate.undergrad_regular)}/ชม. · ${baht(result.ugPerPerson)}/เดือน/คน` +
          (result.ugCapped ? ` (ตันเพดาน ${baht(rate.ug_special_monthly_cap)}/เดือน ตามประกาศ)` : "") +
          ` · ไม่เกิน ${isSpecial ? rate.ug_special_daily_hour_cap : rate.ug_regular_daily_hour_cap} ชม./วัน`}
      />

      <div className="mt-3 border-t border-hairline pt-3">
        <div className="mb-1 text-xs font-semibold">สรุปค่าใช้จ่ายและงบประมาณ</div>
        {input.gradCount > 0 && (
          <SumRow
            label={`ป.โท/เอก × ${input.gradCount} × ${baht(result.gradPerPerson)}`}
            value={`${baht(input.gradCount * result.gradPerPerson)}/เดือน`}
            muted
          />
        )}
        {input.ugCount > 0 && (
          <SumRow
            label={`ป.ตรี × ${input.ugCount} × ${baht(result.ugPerPerson)}`}
            value={`${baht(input.ugCount * result.ugPerPerson)}/เดือน`}
            muted
          />
        )}
        <SumRow label="รวมต้องจ่าย/เดือน" value={baht(result.costMonthly)} strong />
        <SumRow label={`× ${months} เดือน`} value={baht(result.costMonthly * months)} muted />
        <SumRow label="งบที่ได้รับ/เดือน" value={baht(result.budgetMonthly)} />
        <VerdictBanner diffMonth={diffMonth} months={months} empty={result.costMonthly === 0} />
      </div>
    </div>
  );
}

function TaRow({
  label, count, hrsValue, hrsMax = 40, hrsDisabled, note, onCount, onHrs,
}: {
  label: string;
  count: number;
  hrsValue: number;
  /** เพดาน ชม./สัปดาห์/คน ที่กรอกได้ — มาจากเพดาน ชม./วัน ตามประกาศ */
  hrsMax?: number;
  hrsDisabled?: boolean;
  note: string;
  onCount: (n: number) => void;
  onHrs: (h: number) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-[5.5rem_1fr] items-center gap-x-2 gap-y-1">
      <span className="text-xs">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <Select
          value={String(count)}
          onChange={e => onCount(Number(e.target.value))}
          aria-label={`จำนวน TA ${label}`}
          className="w-20 shrink-0"
        >
          {[0, 1, 2, 3, 4, 5, 6].map(n => (
            <option key={n} value={n}>{n} คน</option>
          ))}
        </Select>
        <span className="text-xs text-muted">×</span>
        <div className="w-16 shrink-0">
          <TextInput
            type="number"
            min={0}
            max={hrsMax}
            value={String(hrsValue)}
            disabled={hrsDisabled}
            onChange={e => onHrs(clampInt(e.target.value, 0, hrsMax))}
            aria-label={`ชั่วโมงต่อสัปดาห์ต่อคน ${label}`}
          />
        </div>
        <span className="text-[11px] leading-tight text-muted">ชม./สัปดาห์<br />/คน</span>
      </div>
      <span />
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SumRow({
  label, value, strong, muted,
}: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={
      "flex items-baseline justify-between gap-3 py-0.5 text-xs " +
      (muted ? "text-muted " : "") + (strong ? "font-semibold " : "")
    }>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function VerdictBanner({
  diffMonth, months, empty,
}: { diffMonth: number; months: number; empty?: boolean }) {
  if (empty) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-muted">
        <Users size={14} /> เลือกจำนวน TA เพื่อดูว่างบพอหรือไม่
      </div>
    );
  }
  const over = diffMonth < 0;
  const amt = Math.abs(diffMonth);
  return (
    <div className={
      "mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " +
      (over
        ? "border-danger/30 bg-danger-soft text-danger-soft-foreground"
        : "border-success/30 bg-success-soft text-success-soft-foreground")
    }>
      {over ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
      <span>
        <b>{over ? "เกินงบ" : "ใช้งบได้"}</b>
        {" — "}
        {over ? "ขาดอีก " : "เหลือ "}
        {baht(amt)}/เดือน ({baht(amt * months)} ตลอดเทอม)
      </span>
    </div>
  );
}

function clampInt(v: string, min: number, max: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
