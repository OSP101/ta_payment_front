"use client";
import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, ShieldAlert } from "lucide-react";
import type { Term } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui";
import { useTAApproval } from "./TAGate";

interface Profile {
  student_id: string;
  national_id: string;
  bank_name: string;
  account_no: string;
  signature_svg: string;
  status: string;
}
interface Doc { kind: string; }
interface Block { id: string; term_id: string; is_wba?: boolean }

const REQUIRED_DOC_KINDS = ["creditor_form", "national_id", "bank_book"] as const;

function isProfileComplete(p: Profile | undefined, docs: Doc[] | undefined): boolean {
  if (!p) return false;
  const infoOK =
    !!p.student_id &&
    p.national_id.replace(/-/g, "").length === 13 &&
    !!p.bank_name &&
    !!p.account_no &&
    !!p.signature_svg;
  const uploadedKinds = new Set((docs ?? []).map(d => d.kind));
  const docsOK = REQUIRED_DOC_KINDS.every(k => uploadedKinds.has(k));
  return infoOK && docsOK;
}

function hasScheduleForTerm(blocks: Block[] | undefined): boolean {
  return (blocks ?? []).length > 0;
}

// A fixed bottom-right, non-dismissible reminder shown to a TA who has not
// yet finished onboarding. Two required actions (self-service, not staff
// review): submit profile+docs, and set up the personal class schedule.
// Disappears automatically once both are done — there is intentionally no
// close button.
export default function OnboardingBlocker() {
  const pathname = usePathname();
  const { approved } = useTAApproval();

  const { data: profile } = useSWR<Profile | undefined>(
    "/me/profile",
    (p: string) => api.get<Profile>(p).catch(() => undefined),
  );
  const { data: docs } = useSWR<Doc[]>("/me/documents");
  const { data: terms } = useSWR<Term[]>("/terms");
  const activeTerm = useMemo(
    () => (terms ?? []).find(t => t.is_active) ?? (terms ?? [])[0],
    [terms],
  );
  const { data: blocks } = useSWR<Block[]>(
    activeTerm ? `/me/schedule?term_id=${activeTerm.id}` : null,
  );

  // Approved TAs have cleared onboarding permanently — hide.
  if (approved) return null;

  const profileDone = isProfileComplete(profile, docs);
  const scheduleDone = hasScheduleForTerm(blocks);
  if (profileDone && scheduleDone) return null;

  const stepCount = (profileDone ? 1 : 0) + (scheduleDone ? 1 : 0);

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="ต้องทำเอกสารและตารางเรียนให้เสร็จ"
      className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)]
                 rounded-2xl border-2 border-amber-400 bg-white shadow-2xl"
    >
      <div className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldAlert size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              โปรดทำให้ครบก่อนเริ่มใช้งาน
            </div>
            <div className="text-xs text-muted mt-0.5">
              ทำทั้ง 2 ขั้นตอนนี้ให้เสร็จ ระบบจะปิดกล่องนี้ให้อัตโนมัติ
            </div>
          </div>
          <div className="text-xs tabular text-muted shrink-0">{stepCount}/2</div>
        </div>

        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
          <div
            className="h-full bg-amber-500 transition-[width]"
            style={{ width: `${(stepCount / 2) * 100}%` }}
          />
        </div>

        <ChecklistItem
          done={profileDone}
          title="ส่งเอกสารประกอบการเบิกจ่าย"
          subtitle="กรอกข้อมูล + อัปโหลด 3 เอกสารให้ครบ"
          href="/ta/documents"
          current={pathname === "/ta/documents"}
        />
        <ChecklistItem
          done={scheduleDone}
          title="สร้างตารางเรียนของฉัน"
          subtitle="ระบุคาบเรียนบนตาราง หรือทำเครื่องหมาย WBA"
          href="/ta/schedule"
          current={pathname === "/ta/schedule"}
        />
      </div>
    </div>
  );
}

function ChecklistItem({
  done, title, subtitle, href, current,
}: {
  done: boolean; title: string; subtitle: string; href: string; current: boolean;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div
      className={
        "flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg " +
        (done ? "opacity-70" : "")
      }
    >
      <Icon
        size={18}
        className={"mt-0.5 shrink-0 " + (done ? "text-emerald-600" : "text-muted")}
      />
      <div className="min-w-0 flex-1">
        <div
          className={
            "text-sm " +
            (done ? "text-muted line-through" : "font-medium text-foreground")
          }
        >
          {title}
        </div>
        <div className="text-xs text-muted mt-0.5">{subtitle}</div>
      </div>
      {!done && !current && (
        <Link href={href} className="shrink-0">
          <Button variant="primary" size="sm">
            ทำต่อ <ArrowRight size={13} />
          </Button>
        </Link>
      )}
      {!done && current && (
        <span className="text-[11px] text-muted shrink-0 mt-1.5">
          อยู่หน้านี้
        </span>
      )}
    </div>
  );
}
