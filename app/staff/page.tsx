"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Users,
  ClipboardCheck,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader, Panel, StatCard, ProgressBar, Chip } from "../components/ui";

interface Executive {
  total_courses: number;
  courses_with_ta: number;
  total_tas: number;
  pending_reviews: number;
  budget_allocated: number;
  budget_used: number;
}

export default function StaffDashboard() {
  const { data } = useSWR<Executive>("/dashboard/executive");
  const s = data ?? {
    total_courses: 0, courses_with_ta: 0, total_tas: 0,
    pending_reviews: 0, budget_allocated: 0, budget_used: 0,
  };
  const usePct = s.budget_allocated > 0 ? (s.budget_used / s.budget_allocated) * 100 : 0;
  const budgetTone = usePct >= 90 ? "danger" : usePct >= 70 ? "warn" : "brand";

  return (
    <div>
      <PageHeader
        title="แดชบอร์ดผู้ดูแลระบบ"
        description="ภาพรวมการดำเนินงานของระบบ TA Payment"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <StatCard label="วิชาที่เปิดสอน" value={s.total_courses} icon={<BookOpen size={18} />} tone="brand" />
        <StatCard label="วิชาที่มี TA" value={s.courses_with_ta} icon={<GraduationCap size={18} />} tone="success"
                  hint={s.total_courses > 0 ? `${((s.courses_with_ta / s.total_courses) * 100).toFixed(0)}% ของทั้งหมด` : undefined} />
        <StatCard label="TA ทั้งหมด" value={s.total_tas} icon={<Users size={18} />} />
        <StatCard label="รอตรวจเอกสาร" value={s.pending_reviews} icon={<ClipboardCheck size={18} />}
                  tone={s.pending_reviews > 0 ? "warn" : "default"} />
        <StatCard label="งบใช้ / ทั้งหมด" value={`${formatBaht(s.budget_used)} / ${formatBaht(s.budget_allocated)}`}
                  icon={<Wallet size={18} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="งบประมาณคงเหลือ"
          description="สัดส่วนการใช้งบตั้งแต่ต้นเทอม"
          className="lg:col-span-2"
        >
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[var(--ink-3)]">ใช้ไปแล้ว</span>
            <span className="font-medium tabular">{usePct.toFixed(1)}%</span>
          </div>
          <ProgressBar value={usePct} tone={budgetTone} />
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-[var(--hairline)]">
            <Metric label="งบทั้งหมด" value={`${formatBaht(s.budget_allocated)} บ.`} />
            <Metric label="ใช้ไปแล้ว" value={`${formatBaht(s.budget_used)} บ.`} />
            <Metric label="คงเหลือ" value={`${formatBaht(Math.max(0, s.budget_allocated - s.budget_used))} บ.`} />
          </div>
        </Panel>

        <Panel title="ทางลัด" description="เมนูใช้บ่อย">
          <ul className="divide-y divide-[var(--hairline)]">
            <ShortcutRow href="/staff/review" title="ตรวจสอบเอกสาร" hint={`${s.pending_reviews} รอตรวจ`} />
            <ShortcutRow href="/staff/approvals" title="อนุมัติคำขอ TA" />
            <ShortcutRow href="/staff/teaching" title="วิชาที่เปิดสอน" />
            <ShortcutRow href="/staff/exports" title="ส่งออกเอกสาร" />
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        <Panel title="สถานะโดยรวม">
          <div className="space-y-3">
            <SummaryLine
              label="วิชาที่ยังไม่มี TA"
              chip={<Chip tone={s.total_courses - s.courses_with_ta > 0 ? "warn" : "success"}>
                {s.total_courses - s.courses_with_ta} วิชา
              </Chip>}
            />
            <SummaryLine
              label="เอกสารรอตรวจ"
              chip={<Chip tone={s.pending_reviews > 0 ? "warn" : "success"}>{s.pending_reviews} รายการ</Chip>}
            />
            <SummaryLine
              label="การใช้งบ"
              chip={<Chip tone={budgetTone}>{usePct.toFixed(0)}%</Chip>}
            />
          </div>
        </Panel>
        <Panel title="คู่มือระบบ" description="ลิงก์เอกสารและเวิร์กโฟลว์">
          <ul className="space-y-2 text-sm">
            <li className="text-[var(--ink-2)]">• เจ้าหน้าที่นำเข้าตารางสอนจาก Excel → อาจารย์ขอ TA → เจ้าหน้าที่อนุมัติ</li>
            <li className="text-[var(--ink-2)]">• TA กรอกข้อมูล/เอกสาร → เจ้าหน้าที่ตรวจ → บันทึกเวลา → อาจารย์อนุมัติ</li>
            <li className="text-[var(--ink-2)]">• สิ้นเทอมส่งออก ZIP แบ่งตามรายวิชาเพื่อเบิกจ่าย</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function formatBaht(v: number) {
  return v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--ink-3)]">{label}</div>
      <div className="text-lg font-semibold tabular mt-0.5">{value}</div>
    </div>
  );
}

function ShortcutRow({ href, title, hint }: { href: string; title: string; hint?: string }) {
  return (
    <li>
      <Link href={href}
            className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-4 px-4 rounded-md group">
        <div>
          <div className="text-sm font-medium text-[var(--ink-1)]">{title}</div>
          {hint && <div className="text-xs text-[var(--ink-3)] mt-0.5">{hint}</div>}
        </div>
        <ArrowUpRight size={16} className="text-[var(--ink-4)] group-hover:text-[var(--brand)]" />
      </Link>
    </li>
  );
}

function SummaryLine({ label, chip }: { label: string; chip: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--hairline)] last:border-0">
      <div className="text-sm text-[var(--ink-2)]">{label}</div>
      {chip}
    </div>
  );
}
