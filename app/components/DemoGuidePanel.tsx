"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Accordion, Button, ProgressBar, Tabs } from "@heroui/react";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  Bookmark,
  History,
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
  Users,
  GraduationCap,
  UserRound,
} from "lucide-react";
import { isDemoMode, type DemoScenarioEvent, type DemoProblemEvent, type DemoActorRole } from "../lib/api";
import { useScenarioEngine, type RunState } from "../lib/useScenarioEngine";
import { ConfirmDialog } from "./ui";

const PANEL_WIDTH_VAR = "--demo-panel-w";
const COLLAPSE_KEY = "ta-payment:demo-panel-collapsed";
const EXPANDED_W = 384; // px — matches Tailwind's w-96, kept numeric for the width var
const COLLAPSED_W = 44;

const ACTOR_LABEL: Record<DemoActorRole, string> = {
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "TA",
};
const ACTOR_ICON: Record<DemoActorRole, typeof Users> = {
  staff: Users,
  lecturer: GraduationCap,
  ta: UserRound,
};

/** One accordion item's body — description, run button, result, and a link
 *  to go see the effect on the real page. Shared by both tabs; only
 *  whether `done` is ever true differs (problem cases never report it — see
 *  DemoProblemEvent's doc comment), which just changes the checkmark.
 *
 *  canAct is whether the CURRENTLY logged-in demo account is this step's own
 *  actor_role (see useScenarioEngine's canActOn) — when it isn't, the "go
 *  see the real page" link never renders (every related_path is a
 *  staff-only screen today, so offering it to a lecturer/TA login would
 *  just send them into a 403), replaced by a badge that says whose step
 *  this actually is. Running the step itself is unaffected either way — the
 *  backend acts as whichever role the step needs regardless of who's
 *  logged in, same as it always has. */
function StepBody({
  description,
  relatedPath,
  actorRole,
  canAct,
  state,
  onRun,
}: {
  description: string;
  relatedPath?: string;
  actorRole: DemoActorRole;
  canAct: boolean;
  state: RunState;
  onRun: () => void;
}) {
  const effectivelyDone = state.status === "done";
  const ActorIcon = ACTOR_ICON[actorRole];
  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-muted">{description}</p>
      {!canAct && (
        <div className="flex items-start gap-1.5 text-xs text-muted bg-surface-secondary/60 border border-border rounded-md px-2.5 py-1.5">
          <ActorIcon size={13} className="shrink-0 mt-0.5" />
          <span>
            ขั้นตอนของ<span className="font-medium text-foreground">{ACTOR_LABEL[actorRole]}</span> —
            ทำงานได้ตามปกติ แต่บัญชีนี้เข้าหน้าจริงของขั้นตอนนี้ไม่ได้ จึงไม่พาไปหน้า
          </span>
        </div>
      )}
      <div>
        <Button
          size="sm"
          variant={state.status === "done" ? "secondary" : "primary"}
          isPending={state.status === "running"}
          onPress={onRun}
        >
          {state.status === "running" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {state.status === "done" ? "ทำอีกครั้ง" : "ทำขั้นตอนนี้"}
        </Button>
      </div>
      {state.status === "done" && state.message && (
        <div className="flex items-start gap-1.5 text-sm text-success">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}
      {state.status === "error" && state.message && (
        <div className="flex items-start gap-1.5 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}
      {effectivelyDone && relatedPath && canAct && (
        <Link
          href={relatedPath}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          ดูผลจริงที่หน้านี้
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

/**
 * BETA-only: "เครื่องจำลองเหตุการณ์" — a persistent panel DOCKED to the right
 * edge of the viewport for the whole demo session, not a page staff have to
 * navigate to and away from. See docs/PLAN-demo-sandbox.md §5-6. This
 * replaced two earlier shapes of the same idea, in order: a slide-over
 * drawer (SimulatorPanel.tsx), then a full-page walkthrough
 * (app/demo/guide) — this is the third: staff asked for the checklist to
 * stay ON SCREEN while the real app (Shell, dashboard, whatever page) keeps
 * rendering normally on the left, VS Code's "Get Started" tab reimagined as
 * a docked sidebar instead of an editor tab.
 *
 * Sets PANEL_WIDTH_VAR to its OWN rendered width (0 when collapsed, ~384px
 * expanded) — app/layout.tsx's <body> reads it as `padding-right`, which is
 * what keeps every other page's content (including Shell.tsx's own `fixed`
 * left sidebar + flex main column, entirely unmodified) from ever sitting
 * underneath this panel. Same technique as DemoBanner's height var, applied
 * to width instead of height, and to `padding-right` instead of `top`.
 *
 * Mounted once in app/layout.tsx. Same isDemoMode()-on-pathname-change
 * pattern as DemoBanner — see that file's doc comment for why.
 */
export default function DemoGuidePanel() {
  const [active, setActive] = useState(false);
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(isDemoMode());
  }, [pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage blocked — start expanded, the safe default for "ตลอดการสอน".
    }
  }, []);
  function setCollapsedPersistent(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      // Not fatal; the choice just won't survive a reload.
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
      return;
    }
    const sync = () => document.documentElement.style.setProperty(PANEL_WIDTH_VAR, `${el.offsetWidth}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
    };
  }, [active, collapsed]);

  // The engine still fetches/holds state while collapsed (cheap, and keeps
  // the progress badge on the collapsed strip accurate) — only the heavy
  // list rendering is skipped below.
  const engine = useScenarioEngine();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    if (!engine.events || expandedKey) return;
    const current = engine.events.find(e => !e.done);
    setExpandedKey(current?.key ?? engine.events[0]?.key ?? null);
  }, [engine.events, expandedKey]);

  if (!active) return null;

  const doneCount = engine.events?.filter(e => e.done).length ?? 0;
  const total = engine.events?.length ?? 0;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  function renderList<T extends DemoScenarioEvent | DemoProblemEvent>(
    items: T[] | null,
    runFn: (item: T) => void,
  ) {
    if (!items) return <p className="text-sm text-muted px-1">กำลังโหลดรายการ…</p>;
    return (
      <Accordion
        expandedKeys={expandedKey ? new Set([expandedKey]) : new Set()}
        onExpandedChange={keys => setExpandedKey([...keys][0] as string | undefined ?? null)}
      >
        {items.map(item => {
          const done = "done" in item && item.done;
          return (
            <Accordion.Item key={item.key} id={item.key}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {done ? (
                    <CheckCircle2 size={16} className="mr-2.5 shrink-0 text-success" />
                  ) : (
                    <span className="mr-2.5 size-4 shrink-0" />
                  )}
                  <span className="text-sm">{item.label}</span>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <StepBody
                    description={item.description}
                    relatedPath={item.related_path}
                    actorRole={item.actor_role}
                    canAct={engine.canActOn(item)}
                    state={engine.runs[item.key] ?? { status: "idle" }}
                    onRun={() => runFn(item)}
                  />
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );
  }

  return (
    <>
      <div
        ref={ref}
        className="fixed right-0 z-30 flex flex-col border-l border-border bg-surface"
        style={{ top: "var(--demo-banner-h,0px)", bottom: 0, width: collapsed ? COLLAPSED_W : EXPANDED_W }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsedPersistent(false)}
            className="flex flex-1 flex-col items-center gap-3 py-4 text-muted hover:text-foreground"
            aria-label="เปิดแผงเครื่องจำลองเหตุการณ์"
          >
            <PanelRightOpen size={18} />
            <span className="text-[11px] font-medium tabular-nums">
              {doneCount}/{total}
            </span>
            <span className="[writing-mode:vertical-rl] text-xs font-medium">เครื่องจำลองเหตุการณ์</span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 h-14 shrink-0">
              <FlaskConical size={17} className="text-accent shrink-0" />
              <div className="font-semibold text-sm text-foreground truncate">เครื่องจำลองเหตุการณ์</div>
              <button
                type="button"
                onClick={() => setCollapsedPersistent(true)}
                className="ml-auto shrink-0 text-muted hover:text-foreground"
                aria-label="ย่อแผงเครื่องจำลองเหตุการณ์"
              >
                <PanelRightClose size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>ความคืบหน้าเส้นทางหลัก</span>
                  <span className="tabular-nums">{doneCount}/{total}</span>
                </div>
                <ProgressBar aria-label="ความคืบหน้า" value={progressPct} className="w-full">
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </div>

              <Tabs>
                <Tabs.ListContainer>
                  <Tabs.List aria-label="ประเภทเหตุการณ์จำลอง">
                    <Tabs.Tab id="path">
                      เส้นทางหลัก
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="problems">
                      เคสที่ต้องรับมือ
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="path" className="pt-3">
                  {renderList(engine.events, engine.runStep)}
                </Tabs.Panel>
                <Tabs.Panel id="problems" className="pt-3">
                  <p className="text-xs text-muted mb-3">
                    เคสเหล่านี้จำลองสิ่งที่ผิดพลาดจริง เพื่อดูว่าระบบปฏิเสธถูกต้องหรือไม่ — กดซ้ำได้เสมอ ไม่ต้องเรียงลำดับ
                  </p>
                  {renderList(engine.problems, engine.runProblem)}
                </Tabs.Panel>
              </Tabs>

              <div className="border-t border-border pt-4 flex flex-col gap-2">
                <Button size="sm" variant="tertiary" fullWidth isPending={engine.savingCheckpoint} onPress={engine.saveCheckpoint}>
                  <Bookmark size={14} />
                  บันทึกจุดตรวจสอบ
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  fullWidth
                  isDisabled={!engine.checkpointSavedAt}
                  onPress={() => setConfirmRestore(true)}
                >
                  <History size={14} />
                  ย้อนกลับไปจุดตรวจสอบ
                </Button>
                {engine.checkpointSavedAt && (
                  <p className="text-[11px] text-muted">
                    บันทึกล่าสุด:{" "}
                    {new Date(engine.checkpointSavedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <Button size="sm" variant="tertiary" fullWidth onPress={() => setConfirmReset(true)}>
                  <RotateCcw size={14} />
                  เริ่มห้องทดลองใหม่
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={engine.resetWorkspace}
        title="เริ่มห้องทดลองใหม่ทั้งหมด?"
        message="ข้อมูลทั้งหมดที่จำลองไว้ในห้องนี้ (ปีการศึกษา รายวิชา คำขอ TA เอกสาร บันทึกเวลา ฯลฯ) จะถูกลบและสร้างใหม่ตั้งแต่ต้น การกระทำนี้ย้อนกลับไม่ได้"
        confirmLabel="เริ่มใหม่"
        danger
        isPending={engine.resetting}
        icon={<RotateCcw size={18} />}
      />

      <ConfirmDialog
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={() => { engine.restoreCheckpoint(); setConfirmRestore(false); }}
        title="ย้อนกลับไปจุดตรวจสอบ?"
        message="ข้อมูลทั้งหมดในห้องนี้จะกลับไปเป็นแบบตอนที่บันทึกจุดตรวจสอบไว้ล่าสุด สิ่งที่ทำเพิ่มหลังจากนั้นจะหายไป"
        confirmLabel="ย้อนกลับ"
        danger
        isPending={engine.restoringCheckpoint}
        icon={<History size={18} />}
      />
    </>
  );
}
