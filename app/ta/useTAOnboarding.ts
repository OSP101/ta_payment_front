"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { api, type Term } from "../lib/api";

/* -------------------------------------------------------------------------- */
/* One source of truth for "has this TA finished setting up?"                 */
/* -------------------------------------------------------------------------- */
//
// The checklist card and the sidebar status icons used to answer this
// separately, and they disagreed: the checklist only asked "is a document of
// each kind present?", so a file staff had SENT BACK still counted as done —
// it kept its kind. The sidebar, written later, looked at status and correctly
// showed a warning. A TA with a rejected bank book therefore saw a green tick
// and a red warning at the same time.
//
// Both now read this hook. It is presentation only: the same four endpoints
// the pages already fetch, deduped by SWR into one request each.

/** national_id + bank_book + creditor_form — see service.DocKinds. */
export const REQUIRED_DOC_KINDS = ["creditor_form", "national_id", "bank_book"] as const;
const REQUIRED_DOC_COUNT = REQUIRED_DOC_KINDS.length;

/**
 * Where the document set stands, from the TA's point of view.
 *  - `not_sent`       — files still missing; their move
 *  - `rejected`       — staff sent something back; their move
 *  - `pending_review` — all in, staff have not finished; nobody's move but staff's
 *  - `approved`       — done
 */
export type DocState = "not_sent" | "rejected" | "pending_review" | "approved";

interface Profile { student_id: string; status: string }
interface Doc { kind: string; status: string }
interface Block { id: string }

export interface TAOnboarding {
  /** True until every source has answered — render nothing decisive before it. */
  loading: boolean;
  docState: DocState | undefined;
  /** Thai reason for the doc state, or undefined when there is nothing to say. */
  docLabel: string | undefined;
  /** The TA has done their part on documents (review pending still counts). */
  docsDone: boolean;
  scheduleDone: boolean;
  scheduleLabel: string | undefined;
  /** 0–2. */
  doneCount: number;
  total: number;
  allDone: boolean;
}

export function useTAOnboarding(): TAOnboarding {
  // `.catch` on the profile: a TA who has never opened the form has no row and
  // the endpoint 404s. That is "not started", not a failure.
  const { data: profile, isLoading: pLoading } = useSWR<Profile | undefined>(
    "/me/profile", (u: string) => api.get<Profile>(u).catch(() => undefined));
  const { data: docs, isLoading: dLoading } = useSWR<Doc[]>("/me/documents");
  const { data: terms } = useSWR<Term[]>("/terms");
  const activeTerm = useMemo(
    () => (terms ?? []).find(t => t.is_active) ?? (terms ?? [])[0],
    [terms],
  );
  const { data: sched } = useSWR<{ blocks: Block[] }>(
    activeTerm ? `/me/schedule?term_id=${activeTerm.id}` : null);

  return useMemo<TAOnboarding>(() => {
    const loading = pLoading || dLoading || terms === undefined
      || (activeTerm !== undefined && sched === undefined);

    let docState: DocState | undefined;
    let docLabel: string | undefined;
    if (docs) {
      const rejected = docs.filter(d => d.status === "rejected" || d.status === "needs_fix").length;
      const sent = docs.filter(d => d.status !== "rejected" && d.status !== "needs_fix").length;
      const approved = docs.filter(d => d.status === "approved").length;
      const profileSubmitted = !!profile?.student_id
        && profile.status !== "pending" && profile.status !== "";
      if (rejected > 0) {
        docState = "rejected";
        docLabel = `มีเอกสารถูกตีกลับ ${rejected} รายการ`;
      } else if (sent < REQUIRED_DOC_COUNT || !profileSubmitted) {
        docState = "not_sent";
        docLabel = `ยังไม่ได้ส่ง ${Math.max(1, REQUIRED_DOC_COUNT - sent)} รายการ`;
      } else if (approved < REQUIRED_DOC_COUNT || profile?.status !== "approved") {
        docState = "pending_review";
        docLabel = "ส่งครบแล้ว รอเจ้าหน้าที่ตรวจ";
      } else {
        docState = "approved";
      }
    }
    // "Sent, waiting on staff" is finished as far as the TA is concerned —
    // the checklist tracks their work, not the office's.
    const docsDone = docState === "pending_review" || docState === "approved";

    const scheduleDone = (sched?.blocks.length ?? 0) > 0;
    const scheduleLabel = sched && !scheduleDone
      ? "ยังไม่ได้สร้างตารางเรียนของภาคเรียนนี้"
      : undefined;

    const doneCount = (docsDone ? 1 : 0) + (scheduleDone ? 1 : 0);
    return {
      loading,
      docState, docLabel, docsDone,
      scheduleDone, scheduleLabel,
      doneCount, total: 2, allDone: doneCount === 2,
    };
  }, [profile, docs, terms, activeTerm, sched, pLoading, dLoading]);
}
