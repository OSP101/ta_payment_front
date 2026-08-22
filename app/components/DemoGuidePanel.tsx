"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Accordion, Button, ProgressBar, Tabs } from "@heroui/react";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  ArrowRightLeft,
  Bookmark,
  History,
  RotateCcw,
  RotateCw,
  PanelRightClose,
  PanelRightOpen,
  Users,
  GraduationCap,
  UserRound,
  MousePointerClick,
  Wand2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { isDemoMode, type DemoScenarioEvent, type DemoProblemEvent, type DemoActorRole, type DemoSubStep } from "../lib/api";
import { useScenarioEngine, type RunState } from "../lib/useScenarioEngine";
import { STEP_GUIDES, DEMO_ACCOUNT_LABELS } from "../lib/demoStepGuides";
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

/** One sub-group's own field-level checklist — collapsible so a 3-course
 *  step doesn't dump ~30 instruction lines on screen at once. Purely
 *  guide text, not verified line-by-line (see demoStepGuides.ts's doc
 *  comment for why): only `sub.done`, read from the backend's per-record
 *  DB check, decides the checkmark.
 *
 *  sub.actor (only set for the 5 TA/lecturer-actor events' sub-steps — see
 *  api.ts's DemoSubStep doc comment) drives its own little action button:
 *  "ไปทำเอง" if the currently logged-in demo account already IS that
 *  actor, or "สลับไปเป็น {label} แล้วไปทำเอง" (one click: re-login as that
 *  seeded account, then navigate) if it isn't. Sub-steps with no `actor`
 *  (the 3 staff-actor multi-record events) show no button of their own —
 *  those use StepBody's single shared "ไปทำเอง" above the whole list,
 *  since every record there is done from the same staff login. */
function SubStepRow({ sub, lines, expanded, onToggle, currentEmail, onGoTo, onSwitchAndGo }: {
  sub: DemoSubStep;
  lines: string[];
  expanded: boolean;
  onToggle: () => void;
  currentEmail?: string;
  onGoTo: (path: string) => void;
  onSwitchAndGo: (email: string, path: string) => void;
}) {
  const path = sub.actor_path;
  const isCurrentActor = !!sub.actor && sub.actor === currentEmail;
  return (
    <div className="border border-border rounded-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-sm"
      >
        {sub.done ? (
          <CheckCircle2 size={14} className="shrink-0 text-success" />
        ) : (
          <span className="shrink-0 size-3.5 rounded-full border border-border" />
        )}
        <span className="flex-1">{sub.label}</span>
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted" />
        )}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 px-2.5 pb-2.5">
          <ol className="flex flex-col gap-1 pl-5 text-xs text-muted list-decimal">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {sub.actor && path && (
            <div>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => (isCurrentActor ? onGoTo(path) : onSwitchAndGo(sub.actor!, path))}
              >
                {isCurrentActor ? <MousePointerClick size={13} /> : <ArrowRightLeft size={13} />}
                {isCurrentActor ? "ไปทำเอง" : `สลับไปเป็น ${DEMO_ACCOUNT_LABELS[sub.actor] ?? sub.actor} แล้วไปทำเอง`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One accordion item's body — description, action buttons, result, and a
 *  link to go see the effect on the real page. Shared by both tabs; only
 *  whether `done` is ever true differs (problem cases never report it — see
 *  DemoProblemEvent's doc comment), which just changes the checkmark.
 *
 *  canAct is whether the CURRENTLY logged-in demo account is this step's own
 *  actor_role (see useScenarioEngine's canActOn) — when it isn't, the "go
 *  see the real page" link and the guided "ไปทำเอง" button never render
 *  (every related_path is a staff-only screen today, so offering either to
 *  a lecturer/TA login would just send them into a 403), replaced by a
 *  badge that says whose step this actually is. The fallback "ให้ระบบทำ..."
 *  button is unaffected either way — the backend acts as whichever role the
 *  step needs regardless of who's logged in, same as it always has.
 *
 *  Guided mode (STEP_GUIDES has an entry for this key) shows a field-level
 *  checklist plus "ไปทำเอง" (navigate only, no API call — the trainee does
 *  the real clicking/typing themselves) alongside the old one-click
 *  fallback, now relabeled to make clear it finishes whatever's left rather
 *  than being the only way through. Every event now has a guide entry (see
 *  demoStepGuides.ts), but the 5 TA/lecturer-actor events don't gate on
 *  `canAct` the way the 7 staff-actor ones do — their sub-steps carry their
 *  OWN required account (SubStep.actor) and switch to it directly (see
 *  SubStepRow above), since different records genuinely need different
 *  logins. Only problem-case events (no STEP_GUIDES entry at all) fall
 *  through to the single-button, no-checklist rendering below.
 *
 *  isStaffViewer (from the logged-in account's OWN roles, not this event's)
 *  decides how a role MISMATCH renders: a staff viewer is presumed to be
 *  running the full end-to-end walkthrough, so every event still shows in
 *  full (staff needs the per-sub-step "สลับไปเป็น..." buttons to actually
 *  perform the TA/lecturer-actor events by hand). A lecturer/TA viewer,
 *  though, is presumed to be exploring from inside THEIR OWN role's pages —
 *  stepping through every OTHER role's field-level instructions is noise
 *  they didn't ask for, so those events collapse to a one-line "not your
 *  step" note plus a large, hard-to-miss auto-fill button, so a lecturer
 *  browsing /lecturer can skip straight past staff's own steps to reach
 *  whichever one is actually theirs. */
function StepBody({
  item,
  description,
  relatedPath,
  actorRole,
  canAct,
  isStaffViewer,
  currentEmail,
  state,
  onRun,
  onGoToStep,
  onGoToPath,
  onSwitchAndGo,
  onRecheck,
}: {
  item: DemoScenarioEvent | DemoProblemEvent;
  description: string;
  relatedPath?: string;
  actorRole: DemoActorRole;
  canAct: boolean;
  isStaffViewer: boolean;
  currentEmail?: string;
  state: RunState;
  onRun: () => void;
  onGoToStep: () => void;
  onGoToPath: (path: string) => void;
  onSwitchAndGo: (email: string, path: string) => void;
  onRecheck: () => void;
}) {
  const done = "done" in item && item.done;
  const subSteps = "sub_steps" in item ? item.sub_steps : undefined;
  const eventActorPath = "actor_path" in item ? item.actor_path : undefined;
  const guide = STEP_GUIDES[item.key];
  const isGuided = !!guide;
  // Sub-groups that each need their OWN account (the 5 TA/lecturer-actor
  // events) handle "go do this" entirely per-row via SubStepRow — the
  // shared top-level button/badge below only applies when every record in
  // this event shares one actor (the 3 staff-actor multi-record events, and
  // every single-record event).
  const hasPerSubActor = !!subSteps?.some(s => s.actor);
  // A non-staff viewer looking at an event outside their own role: collapse
  // the detail, push the auto-fill shortcut front and center. Staff never
  // collapses — see this function's own doc comment.
  const collapsedForOtherRole = !isStaffViewer && !canAct;
  const ActorIcon = ACTOR_ICON[actorRole];
  const [expandedSub, setExpandedSub] = useState<string | null>(
    () => subSteps?.find(s => !s.done)?.key ?? subSteps?.[0]?.key ?? null,
  );

  if (collapsedForOtherRole) {
    return (
      <div className="flex flex-col gap-3 pb-1">
        <div className="flex items-start gap-1.5 text-xs text-muted bg-surface-secondary/60 border border-border rounded-md px-2.5 py-1.5">
          <ActorIcon size={13} className="shrink-0 mt-0.5" />
          <span>
            ขั้นตอนของ<span className="font-medium text-foreground">{ACTOR_LABEL[actorRole]}</span> — ไม่ใช่ขั้นตอนของ
            บัญชีนี้ <span className="font-medium text-foreground">ไม่ต้องทำเอง</span> กดปุ่มด้านล่างให้ระบบทำแทน
            แล้วจะไปขั้นตอนถัดไปให้อัตโนมัติ
          </span>
        </div>
        <Button size="md" fullWidth variant="primary" isPending={state.status === "running"} onPress={onRun}>
          {state.status === "running" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          กดให้ระบบทำขั้นตอนนี้แทน
        </Button>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-muted">{description}</p>
      {!canAct && !hasPerSubActor && (
        <div className="flex items-start gap-1.5 text-xs text-muted bg-surface-secondary/60 border border-border rounded-md px-2.5 py-1.5">
          <ActorIcon size={13} className="shrink-0 mt-0.5" />
          <span>
            ขั้นตอนของ<span className="font-medium text-foreground">{ACTOR_LABEL[actorRole]}</span> —
            ทำงานได้ตามปกติ แต่บัญชีนี้เข้าหน้าจริงของขั้นตอนนี้ไม่ได้ จึงไม่พาไปหน้า
          </span>
        </div>
      )}

      {isGuided ? (
        <>
          <div className="flex flex-wrap gap-2">
            {!hasPerSubActor && canAct && (
              <Button size="sm" variant="primary" onPress={onGoToStep}>
                <MousePointerClick size={14} />
                ไปทำเอง
              </Button>
            )}
            <Button size="sm" variant="tertiary" isPending={state.status === "running"} onPress={onRun}>
              {state.status === "running" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              ให้ระบบทำส่วนที่เหลือให้อัตโนมัติ
            </Button>
          </div>

          {subSteps && subSteps.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {subSteps.map(sub => (
                <SubStepRow
                  key={sub.key}
                  sub={{ ...sub, actor_path: sub.actor_path ?? eventActorPath }}
                  lines={guide[sub.key] ?? []}
                  expanded={expandedSub === sub.key}
                  onToggle={() => setExpandedSub(expandedSub === sub.key ? null : sub.key)}
                  currentEmail={currentEmail}
                  onGoTo={onGoToPath}
                  onSwitchAndGo={onSwitchAndGo}
                />
              ))}
              {done && guide._after && (
                <div className="flex flex-col gap-1 text-xs text-warning bg-surface-secondary/60 border border-border rounded-md px-2.5 py-1.5">
                  {guide._after.map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ol className="flex flex-col gap-1 pl-4 text-xs text-muted list-decimal">
              {(guide._flat ?? []).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}

          <button
            type="button"
            onClick={onRecheck}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            <RotateCw size={12} />
            ตรวจสอบอีกครั้ง
          </button>
        </>
      ) : (
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
      )}

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
      {done && relatedPath && canAct && (
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
  const router = useRouter();
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

  // Auto-advance the wizard: once whichever "เส้นทางหลัก" step is currently
  // expanded finishes running (own account or "ให้ระบบทำ...ให้อัตโนมัติ" —
  // either way runs land here), jump the accordion to the next not-yet-done
  // step instead of leaving the trainee staring at a finished item and
  // having to hunt for what's next themselves. A short delay so the success
  // message is actually readable before the panel moves on. Deliberately
  // scoped to `engine.events` (the ordered path) — "เคสที่ต้องรับมือ" problem
  // cases are explicitly unordered (see their own tab copy), so a finished
  // problem case never triggers this.
  //
  // The pending advance is tracked on a plain ref, NOT scheduled via a
  // useEffect cleanup timeout — run()'s own refetchEvents() resolves shortly
  // after the done transition and changes `engine.events`'s identity, which
  // re-fires this effect; a cleanup-owned timer would be cancelled by that
  // unrelated re-run before its 900ms was up, silently killing every
  // auto-advance. A ref-owned timer survives re-renders; expandedKeyRef lets
  // the timeout callback notice if the trainee already clicked elsewhere in
  // the meantime and skip stepping on their manual choice.
  const prevRunStatusRef = useRef<Record<string, RunState["status"]>>({});
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedKeyRef = useRef(expandedKey);
  expandedKeyRef.current = expandedKey;
  useEffect(() => {
    const prev = prevRunStatusRef.current;
    const curr = Object.fromEntries(Object.entries(engine.runs).map(([k, v]) => [k, v.status]));
    const justFinished = !!expandedKey && prev[expandedKey] !== "done" && curr[expandedKey] === "done";
    prevRunStatusRef.current = curr;
    if (!justFinished || !engine.events) return;
    const idx = engine.events.findIndex(e => e.key === expandedKey);
    if (idx === -1) return;
    const next = engine.events.slice(idx + 1).find(e => !e.done);
    if (!next) return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    const sourceKey = expandedKey;
    advanceTimerRef.current = setTimeout(() => {
      if (expandedKeyRef.current === sourceKey) setExpandedKey(next.key);
    }, 900);
  }, [engine.runs, engine.events, expandedKey]);
  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  if (!active) return null;

  // Staff (and admin, who carries the "staff" role too — see seed.go's
  // demoAccounts) is presumed to be running the full walkthrough; a
  // lecturer/TA login is presumed to be exploring their own role's pages
  // only — see StepBody's own doc comment for what this changes.
  const isStaffViewer = !!engine.me?.roles.includes("staff");

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
                    item={item}
                    description={item.description}
                    relatedPath={item.related_path}
                    actorRole={item.actor_role}
                    canAct={engine.canActOn(item)}
                    isStaffViewer={isStaffViewer}
                    currentEmail={engine.me?.email}
                    state={engine.runs[item.key] ?? { status: "idle" }}
                    onRun={() => runFn(item)}
                    onGoToStep={() => engine.goToStep(item as DemoScenarioEvent)}
                    onGoToPath={path => router.push(path)}
                    onSwitchAndGo={(email, path) => engine.switchAndGo(email, path)}
                    onRecheck={engine.refetchEvents}
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
