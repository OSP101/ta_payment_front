"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, ShieldAlert, PartyPopper } from "lucide-react";
import { Panel, Button, ProgressBar } from "../components/ui";
import { useTAApproval } from "./TAGate";
import { useTAOnboarding } from "./useTAOnboarding";

/* -------------------------------------------------------------------------- */
/* Onboarding checklist — inline, in the content flow                         */
/* -------------------------------------------------------------------------- */
//
// This was a fixed panel in the bottom-right corner. Three things were wrong
// with that:
//
//   * the bottom-right is where chat widgets and promos live, so people have
//     learned to ignore it — a required task is the worst thing to put there;
//   * the hierarchy was inverted: the mandatory work sat in a box that looked
//     dismissible, while the main column showed an empty state the TA could do
//     nothing about;
//   * it covered the announcements card, worst on small screens.
//
// It also contradicted the page's own subtitle ("…และสิ่งที่ต้องดำเนินการใน
// ภาคเรียนนี้") by living outside the content it claimed to be part of.

const SEEN_KEY = "ta-payment:onboarding-done-seen";

interface Step {
  done: boolean;
  title: string;
  description: string;
  href: string;
  /** Imperative label — "ทำต่อ" says nothing about what happens next. */
  action: string;
}

export default function OnboardingChecklistCard() {
  const { approved } = useTAApproval();
  const { loading, docsDone, docLabel, scheduleDone, doneCount, total, allDone } =
    useTAOnboarding();

  // The green "all set" bar is a receipt, not a permanent fixture: show it once
  // per session and never again. sessionStorage rather than a timer — a timer
  // would remove it mid-glance, which reads as a glitch.
  const [showDoneBar, setShowDoneBar] = useState(false);
  useEffect(() => {
    if (!allDone || approved) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY) === "1") return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: show it this render and accept that a reload repeats it.
    }
    setShowDoneBar(true);
  }, [allDone, approved]);

  // An approved TA cleared onboarding for good — nothing to say, ever.
  if (approved) return null;
  // Never claim "incomplete" before the data has landed; a checklist that
  // flashes 0/2 and then vanishes is worse than a beat of nothing.
  if (loading) return null;

  if (allDone) {
    if (!showDoneBar) return null;
    return (
      <div
        className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30"
        role="status"
      >
        <PartyPopper size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="text-sm text-emerald-900 dark:text-emerald-100">
          <b>เตรียมพร้อมเรียบร้อย</b> ทำครบทั้ง 2 ขั้นตอนแล้ว
        </div>
      </div>
    );
  }

  const steps: Step[] = [
    {
      done: docsDone,
      title: "ส่งเอกสารประกอบการเบิกจ่าย",
      description: docLabel ?? "กรอกข้อมูล + อัปโหลด 3 เอกสารให้ครบ",
      href: "/ta/documents",
      action: "ส่งเอกสาร",
    },
    {
      done: scheduleDone,
      title: "สร้างตารางเรียนของฉัน",
      description: "ระบุคาบเรียนบนตาราง หรือทำเครื่องหมาย WBA ถ้าไม่มีคาบประจำ",
      href: "/ta/schedule",
      action: "สร้างตารางเรียน",
    },
  ];

  return (
    <div className="mb-6">
      <Panel className="border-amber-300 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-soft-foreground">
            <ShieldAlert size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                โปรดทำให้ครบก่อนเริ่มใช้งาน
              </h2>
              <span className="text-xs tabular-nums text-muted">{doneCount}/{total}</span>
            </div>
            {/* Says WHY, not how the widget behaves. The old line ("ระบบจะปิด
                กล่องนี้ให้อัตโนมัติ") described the UI to itself noise once
                the card sits in the page like everything else. */}
            <p className="mt-0.5 text-xs text-muted">
              ต้องทำครบทั้ง 2 ขั้นตอน ระบบจึงจะเริ่มบันทึกชั่วโมงและเบิกจ่ายให้ได้
            </p>
          </div>
        </div>

        <div className="mt-3">
          <ProgressBar
            value={(doneCount / total) * 100}
            tone="warn"
            label={`ความคืบหน้าการเริ่มต้นใช้งาน ${doneCount} จาก ${total} ขั้นตอน`}
          />
        </div>

        <ul className="mt-2 divide-y divide-[var(--hairline)]">
          {steps.map(s => (
            <li key={s.href} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              {s.done
                ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                : <Circle size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />}
              {/* basis-56 keeps the text from shrinking to make room for the
                  button: on a phone the two then no longer fit side by side and
                  flex-wrap drops the button to its own line. */}
              <div className="min-w-0 flex-1 basis-56">
                <div className={
                  "text-sm " + (s.done
                    ? "text-muted line-through"
                    : "font-medium text-foreground")
                }>
                  {s.title}
                </div>
                <div className="mt-0.5 text-xs text-muted">{s.description}</div>
              </div>
              {!s.done && (
                <Link href={s.href} className="ms-auto shrink-0">
                  <Button variant="primary" size="sm" aria-label={s.action}>
                    {s.action} <ArrowRight size={13} />
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
