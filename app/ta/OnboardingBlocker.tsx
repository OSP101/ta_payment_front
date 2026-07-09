"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, ShieldAlert, Minus } from "lucide-react";
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
    (p.national_id ?? "").replace(/-/g, "").length === 13 &&
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
  //
  // Hooks below must run even when we early-return above; keep the two return
  // paths above (approved / all-done) but move the collapse state before the
  // second early return so React sees a stable hook order.
  const profileDone = isProfileComplete(profile, docs);
  const scheduleDone = hasScheduleForTerm(blocks);
  const stepCount = (profileDone ? 1 : 0) + (scheduleDone ? 1 : 0);
  const onCurrentTaskPage =
    (!profileDone && pathname === "/ta/documents") ||
    (!scheduleDone && pathname === "/ta/schedule");

  // Collapse to a small pill when the user is already on the page for the
  // incomplete task — otherwise the panel covers upload controls / schedule
  // cells. The user can still expand manually. Persist the choice so it
  // survives navigation within the same tab.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("onboardingBlockerCollapsed");
    if (stored === "1") setCollapsed(true);
    else if (stored === "0") setCollapsed(false);
    else setCollapsed(onCurrentTaskPage);
    // Only re-run when the task-page relevance changes, not on every render.
  }, [onCurrentTaskPage]);
  function setCollapsedPersistent(v: boolean) {
    setCollapsed(v);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("onboardingBlockerCollapsed", v ? "1" : "0");
    }
  }

  if (approved) return null;
  if (profileDone && scheduleDone) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPersistent(false)}
        aria-label="ขยายกล่องแจ้งเตือนการเริ่มต้น"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2
                   rounded-full border-2 border-warning bg-surface shadow-lg
                   pl-3 pr-4 py-2 text-sm font-medium text-warning-soft-foreground
                   hover:bg-surface-secondary"
      >
        <ShieldAlert size={16} />
        <span>เริ่มต้นใช้งาน</span>
        <span className="text-xs tabular text-muted">{stepCount}/2</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="ต้องทำเอกสารและตารางเรียนให้เสร็จ"
      className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)]
                 rounded-2xl border-2 border-warning bg-surface shadow-2xl"
    >
      <div className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-warning-soft text-warning-soft-foreground flex items-center justify-center shrink-0">
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
          <div className="flex items-center gap-1 shrink-0">
            <div className="text-xs tabular text-muted">{stepCount}/2</div>
            <button
              type="button"
              onClick={() => setCollapsedPersistent(true)}
              aria-label="ย่อกล่องแจ้งเตือน"
              className="p-1 rounded-md text-muted hover:bg-surface-secondary"
            >
              <Minus size={14} />
            </button>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden mb-2">
          <div
            className="h-full bg-warning transition-[width]"
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
