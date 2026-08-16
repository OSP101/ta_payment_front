"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  api,
  demoScenarioEvents,
  demoRunScenarioEvent,
  demoProblemEvents,
  demoRunProblemEvent,
  demoCheckpointStatus,
  demoSaveCheckpoint,
  demoRestoreCheckpoint,
  errMessage,
  isDemoMode,
  setDemoApiPrefix,
  type DemoScenarioEvent,
  type DemoProblemEvent,
  type DemoActorRole,
  type Me,
} from "./api";
import { notify } from "./notify";

export type RunState = { status: "idle" | "running" | "done" | "error"; message?: string };

/**
 * All state/actions the demo sandbox's scenario engine needs — used by
 * DemoGuidePanel.tsx, the one place it's rendered (see that component's own
 * doc comment for why it's a hook rather than logic baked straight into
 * that component: an earlier full-page version of the same panel needed to
 * share it too, and keeping the split means a future second consumer costs
 * nothing new).
 *
 * Fetches events/problems/checkpoint status once on mount, and again after
 * every run()/restoreCheckpoint() — see run()'s own comment for why even a
 * single step's run re-reads ALL of `events`, not just that one key.
 */
export function useScenarioEngine() {
  const router = useRouter();
  const [events, setEvents] = useState<DemoScenarioEvent[] | null>(null);
  const [problems, setProblems] = useState<DemoProblemEvent[] | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [checkpointSavedAt, setCheckpointSavedAt] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const [restoringCheckpoint, setRestoringCheckpoint] = useState(false);

  // Silent catches, deliberately: these run in the background on every
  // navigation (see the effect below), including moments where a session
  // has expired but the tab hasn't been sent back through login yet — that
  // 401 is expected and transient, not something worth a toast every time
  // staff clicks a nav link. The panel just keeps showing its last good
  // read until a fetch succeeds again.
  const refetchEvents = useCallback(() => {
    demoScenarioEvents().then(r => setEvents(r.items)).catch(() => {});
  }, []);
  const refetchProblems = useCallback(() => {
    demoProblemEvents().then(r => setProblems(r.items)).catch(() => {});
  }, []);
  const refetchCheckpoint = useCallback(() => {
    demoCheckpointStatus().then(r => setCheckpointSavedAt(r.saved_at)).catch(() => {});
  }, []);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  // Whoever is CURRENTLY logged into this demo slot — used to decide which
  // steps' related_path we're even allowed to navigate to (see run()
  // below). Gated on isDemoMode() the same way the effect below is: "/me"
  // is a real production endpoint too, so this would otherwise "work" on
  // every non-demo page as well, just uselessly (and SWR already dedupes
  // it against any other component's own useSWR("/me") on the same page,
  // so this costs nothing extra there) — the actual reason to gate it is
  // consistency with the rest of this hook, not a correctness requirement
  // like the POST effect below has.
  const { data: me } = useSWR<Me>(isDemoMode() ? "/me" : null);

  // Re-run on every navigation, not just once at mount: this hook's owner
  // (DemoGuidePanel) is mounted once for the entire tab session — client
  // -side route changes never remount it — so a fetch that failed because
  // the session was mid-expiry/mid-login at the time would otherwise never
  // get a second chance, leaving the panel stuck on "กำลังโหลดรายการ…" for
  // the rest of the session. Cheap GETs; matches the same
  // re-check-on-pathname-change convention DemoBanner/DemoGuidePanel
  // already use for isDemoMode() itself.
  //
  // Gated on isDemoMode(): DemoGuidePanel calls this hook unconditionally
  // (Rules of Hooks — its own `if (!active) return null` comes after), so
  // without this guard these three GETs fire on EVERY page load site-wide,
  // demo mode or not. Outside demo mode apiPrefix falls back to production's
  // /api/v1, where /scenario/* doesn't exist and 401s — and api.ts's
  // toApiError() unconditionally redirects the whole page to /login on any
  // 401, even from a background call whose own .catch() is silent. That
  // self-inflicted redirect was firing on /demo itself for anyone arriving
  // with no session yet, bouncing the one entry point this whole sandbox
  // exists for straight to a login page it has no account for.
  useEffect(() => {
    if (!isDemoMode()) return;
    refetchEvents();
    refetchProblems();
    refetchCheckpoint();
  }, [pathname, refetchEvents, refetchProblems, refetchCheckpoint]);

  // Whether `me` (the CURRENTLY logged-in demo account) is the role this
  // step is written from the POV of — the actual access check, since
  // AccountsForTier already means someone's OWN account list can only ever
  // contain roles at or below their tier, but the SCENARIO PANEL shows
  // every step regardless of who's logged in (a TA tester still sees "1.
  // สร้างปีการศึกษา", a staff-only step). Exported so DemoGuidePanel can
  // render the same "ขั้นตอนของ X" badge this hook uses to decide whether
  // to navigate at all.
  const canActOn = useCallback(
    (item: { actor_role: DemoActorRole }) => !!me?.roles.includes(item.actor_role),
    [me],
  );

  async function run(item: DemoScenarioEvent | DemoProblemEvent, caller: (key: string) => Promise<{ message: string }>) {
    const key = item.key;
    setRuns(r => ({ ...r, [key]: { status: "running" } }));
    // Navigate to the step's own real page first — but only if it HAS one,
    // the CURRENT login can actually reach it (canActOn — every
    // related_path is staff-only today, so a lecturer/TA tester offered
    // one would just hit a 403), and we're not sitting on it already. This
    // is the whole point of the panel being docked rather than a modal:
    // the real screen is right there on the left the instant this fires.
    const shouldNavigate = !!item.related_path && canActOn(item) && item.related_path !== currentUrl;
    if (shouldNavigate) router.push(item.related_path!);
    try {
      if (shouldNavigate) {
        // Let the page settle into its BEFORE state for a beat before the
        // result pops in — instant would just look like a glitch, and the
        // whole reason to navigate first is so there's a visible before/
        // after instead of a black-box checkmark.
        await new Promise(resolve => setTimeout(resolve, 450));
      }
      const res = await caller(key);
      setRuns(r => ({ ...r, [key]: { status: "done", message: res.message } }));
      // Re-read `done` status for every step, not just this one: a problem
      // case can flip an EARLIER happy-path step back to not-done (e.g.
      // staff_cannot_unlock re-opens an exported course — see
      // internal/demo/scenario_problems.go), so a targeted single-item
      // update would miss that.
      refetchEvents();
      // Realtime: whatever page we just navigated to (or were already on)
      // reads its own data via its own useSWR calls, which have no idea
      // this POST changed anything server-side — revalidate every cached
      // key so it updates live instead of needing a manual reload. Cheap:
      // this only touches keys something on the CURRENT page actually
      // subscribes to, since SWR only refetches keys with an active
      // subscriber.
      globalMutate(() => true);
    } catch (e) {
      setRuns(r => ({ ...r, [key]: { status: "error", message: errMessage(e) } }));
    }
  }
  const runStep = (item: DemoScenarioEvent) => run(item, demoRunScenarioEvent);
  const runProblem = (item: DemoProblemEvent) => run(item, demoRunProblemEvent);

  async function resetWorkspace() {
    setResetting(true);
    try {
      await api.post("/scenario/reset");
      notify.success("เริ่มห้องทดลองใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
    } catch (e) {
      // The reset itself may have succeeded even if THIS response looks like
      // an error — see ResetSlot's doc comment: wiping/reseeding the users
      // table invalidates the very session making this request, so a 401
      // here is the expected shape of success, not a failure to report.
      notify.info(errMessage(e));
    } finally {
      setDemoApiPrefix(null);
      setResetting(false);
      router.push("/demo");
      router.refresh();
    }
  }

  async function saveCheckpoint() {
    setSavingCheckpoint(true);
    try {
      await demoSaveCheckpoint();
      refetchCheckpoint();
      notify.success("บันทึกจุดตรวจสอบแล้ว");
    } catch (e) {
      notify.error(e);
    } finally {
      setSavingCheckpoint(false);
    }
  }

  async function restoreCheckpoint() {
    setRestoringCheckpoint(true);
    try {
      await demoRestoreCheckpoint();
      notify.success("ย้อนกลับไปจุดตรวจสอบแล้ว");
      // Unlike reset, restore keeps the session valid — see the route's own
      // doc comment — so no redirect to /demo, just refresh what's stale:
      // this hook's own step status, and the current page's server data.
      setRuns({});
      refetchEvents();
      refetchProblems();
      router.refresh();
    } catch (e) {
      notify.error(e);
    } finally {
      setRestoringCheckpoint(false);
    }
  }

  return {
    events,
    problems,
    runs,
    runStep,
    runProblem,
    canActOn,
    checkpointSavedAt,
    resetting,
    resetWorkspace,
    savingCheckpoint,
    saveCheckpoint,
    restoringCheckpoint,
    restoreCheckpoint,
  };
}
