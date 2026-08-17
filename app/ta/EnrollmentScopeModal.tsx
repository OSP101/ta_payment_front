"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Modal as HModal, Button as HButton } from "@heroui/react";
import { GraduationCap } from "lucide-react";
import { errMessage, setEnrollmentScope, type Enrollment, type Me } from "../lib/api";
import { notify } from "../lib/notify";

/**
 * Self-contained gate: fetches its own `/me` (same SWR cache key every other
 * page already uses, so no extra request beyond what the shell fetches
 * anyway) and decides whether there's anything to ask. Kept as a plain
 * function component mounted unconditionally from app/ta/layout.tsx (a
 * server component, which can't itself hold this state) rather than a
 * wrapper + inner component pair — one file, one job.
 */
export default function EnrollmentScopeGate() {
  const { data: me } = useSWR<Me>("/me");
  // No data yet, not a TA, or already chosen for this session/never needed
  // (0-1 period) — EnrollmentScopeModal itself also short-circuits on
  // items.length < 2, this just avoids firing the enrollments fetch at all
  // for the common case (non-TA, or a TA who already picked).
  if (!me || !me.roles.includes("ta") || me.selected_enrollment_id) return null;
  return <EnrollmentScopeModal me={me} />;
}

const STUDY_LEVEL_TH: Record<string, string> = {
  undergrad: "ปริญญาตรี",
  master: "ปริญญาโท",
  phd: "ปริญญาเอก",
};

function periodLabel(e: Enrollment): string {
  const start = new Date(e.started_at).toLocaleDateString("th-TH");
  const end = e.ended_at ? new Date(e.ended_at).toLocaleDateString("th-TH") : "ปัจจุบัน";
  return `${start} – ${end}`;
}

/**
 * Shown once per login (not once ever) to a TA with more than one
 * ta_enrollments period — e.g. someone who advanced ป.ตรี -> โท and now has
 * two education-level periods on file (see migration 0094/0096). Picking a
 * period filters the TA's own dashboard/reminders for the rest of THIS
 * session (sessions.selected_enrollment_id) — never affects what a NEW
 * worklog/assignment attaches to, that always uses the truly active
 * enrollment regardless of what's being "viewed" here.
 *
 * Not built on the shared `Modal` in ../components/ui, same reasoning as
 * PdpaConsentModal: the login-time (forced) use of this must not be
 * dismissible without picking, or a TA could end up silently browsing
 * unfiltered (mixed-period) data for the whole session with no indication
 * anything needs choosing. TAShell's "สลับช่วง" button reuses this same
 * component with `onClose` set, which turns on the close button/backdrop
 * dismissal — switching mid-session is a convenience, not something that
 * needs to be forced the way the first choice does.
 */
export function EnrollmentScopeModal({ me, onClose }: { me: Me; onClose?: () => void }) {
  const { data } = useSWR<{ items: Enrollment[] }>(`/users/${me.id}/enrollments`);
  const items = data?.items ?? [];
  const activeID = items.find(e => !e.ended_at)?.id ?? items[0]?.id ?? "";
  const [selected, setSelected] = useState(me.selected_enrollment_id ?? activeID);
  const [submitting, setSubmitting] = useState(false);
  const dismissable = !!onClose;

  // Nothing to ask about yet (still loading) or nothing to choose between
  // (0-1 period) — render nothing rather than an empty/single-option modal.
  if (items.length < 2) return null;

  async function confirm() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await setEnrollmentScope(selected);
      // /me carries the new selected_enrollment_id itself; the two endpoints
      // that actually READ it server-side (TaOverview, PendingByTA — see
      // migration 0096's comment) are cached under their own SWR keys and
      // won't otherwise refetch just because /me changed, so they'd keep
      // showing whatever was cached from the PREVIOUS period until some
      // unrelated revalidation happened to fire.
      await Promise.all([
        mutate("/me"),
        mutate("/dashboard/ta/me"),
        mutate("/me/submission-periods"),
      ]);
      onClose?.();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HModal>
      <HModal.Backdrop
        isOpen
        isDismissable={dismissable}
        isKeyboardDismissDisabled={!dismissable}
        onOpenChange={o => { if (!o) onClose?.(); }}
      >
        <HModal.Container>
          <HModal.Dialog className="sm:max-w-xl">
            {dismissable && <HModal.CloseTrigger />}
            <HModal.Header>
              <HModal.Icon className="bg-accent-soft text-accent-soft-foreground">
                <GraduationCap className="size-5" />
              </HModal.Icon>
              <HModal.Heading>เลือกช่วงการศึกษาที่จะดูข้อมูล</HModal.Heading>
              <p className="text-sm leading-5 text-muted">
                บัญชีนี้มีข้อมูลมากกว่า 1 ช่วงการศึกษา (รหัสนักศึกษาเปลี่ยนตอนเปลี่ยนระดับ) —
                เลือกช่วงที่ต้องการดูสำหรับการเข้าใช้งานครั้งนี้
              </p>
            </HModal.Header>
            <HModal.Body>
              <div className="space-y-2">
                {items.map(e => {
                  const isActive = !e.ended_at;
                  const on = selected === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${
                        on ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {e.student_id} — {STUDY_LEVEL_TH[e.study_level] ?? e.study_level}
                        </span>
                        {isActive && (
                          <span className="text-xs font-medium text-[var(--success,#16a34a)]">ปัจจุบัน</span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{periodLabel(e)}</div>
                    </button>
                  );
                })}
              </div>
            </HModal.Body>
            <HModal.Footer>
              <HButton
                className="w-full"
                variant="primary"
                isDisabled={!selected || submitting}
                isPending={submitting}
                onPress={confirm}
              >
                {submitting ? "กำลังบันทึก…" : "ยืนยันและดำเนินการต่อ"}
              </HButton>
            </HModal.Footer>
          </HModal.Dialog>
        </HModal.Container>
      </HModal.Backdrop>
    </HModal>
  );
}

/**
 * Top-bar indicator + "สลับช่วง" button for a TA with more than one
 * education-level period — lets them reopen the picker mid-session instead
 * of having to log out and back in. Renders nothing for the common case
 * (0-1 period), same threshold EnrollmentScopeModal itself uses. Mounted
 * from TAShell's topBarAccessory.
 */
export function EnrollmentScopeSwitcher() {
  const { data: me } = useSWR<Me>("/me");
  const { data } = useSWR<{ items: Enrollment[] }>(me ? `/users/${me.id}/enrollments` : null);
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [];
  if (!me || items.length < 2) return null;

  const current = items.find(e => e.id === me.selected_enrollment_id);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 shrink-0"
      >
        <GraduationCap size={13} />
        {current ? `${STUDY_LEVEL_TH[current.study_level] ?? current.study_level} · ${current.student_id}` : "เลือกช่วงการศึกษา"}
        <span className="text-accent font-medium">เปลี่ยน</span>
      </button>
      {open && <EnrollmentScopeModal me={me} onClose={() => setOpen(false)} />}
    </>
  );
}
