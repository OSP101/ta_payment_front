"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { Term } from "../lib/api";

/* -------------------------------------------------------------------------- */
/* One selected term for the whole staff area                                 */
/* -------------------------------------------------------------------------- */
//
// Before this, every staff page kept its own `useState` for the term and its
// own <Select> in a different corner of the page. Two problems came out of it:
//
//  1. The default disagreed. /terms is ordered academic_year DESC, semester
//     DESC, so `terms[0]` means "the newest term that exists" — NOT the active
//     one. Half the pages used terms[0] (teaching, exports, worklog, progress)
//     and half used is_active (dashboard, approvals, TA schedule). With one
//     term in the database they coincide. The day staff create next semester
//     ahead of time, half the app jumps to an empty future term and half stays
//     put, with nothing on screen saying the two disagree.
//
//  2. The choice did not survive navigation. Staff chasing a past term had to
//     re-pick it on every page, and forgetting meant working in the wrong term
//     without noticing.
//
// Resolution order for the selected term:
//   ?term= in the URL  →  localStorage  →  is_active  →  newest
//
// The URL wins so a link can carry the term to a colleague; localStorage keeps
// the choice across navigation within a session; is_active is the honest
// default when neither says otherwise.

const STORAGE_KEY = "ta-payment:staff-term";

interface TermCtx {
  /** All terms, newest first. undefined while loading. */
  terms: Term[] | undefined;
  /** The selected term, or undefined while loading / when none exist. */
  term: Term | undefined;
  termId: string;
  /** "2569/1", or "" while loading. */
  termLabel: string;
  setTermId: (id: string) => void;
  /** True once /terms has answered — lets a page tell "loading" from "none created yet". */
  loaded: boolean;
  /**
   * Registers a veto for term switching — used by pages holding unsaved edits
   * (the TA schedule pattern). Return false to cancel the switch. Returns an
   * unsubscribe function.
   */
  onBeforeSwitch: (guard: () => boolean | Promise<boolean>) => () => void;
}

const Ctx = createContext<TermCtx>({
  terms: undefined,
  term: undefined,
  termId: "",
  termLabel: "",
  setTermId: () => {},
  loaded: false,
  onBeforeSwitch: () => () => {},
});

export const useTerm = () => useContext(Ctx);

export function TermProvider({ children }: { children: React.ReactNode }) {
  const { data: terms } = useSWR<Term[]>("/terms");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTerm = searchParams.get("term") ?? "";

  const [stored, setStored] = useState<string>("");
  const guards = useRef(new Set<() => boolean | Promise<boolean>>());

  // Read localStorage after mount only — reading during render would produce
  // different HTML on server and client and trip hydration.
  useEffect(() => {
    try {
      setStored(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      // Private mode / storage disabled: fall through to is_active.
    }
  }, []);

  const termId = useMemo(() => {
    const list = terms ?? [];
    if (list.length === 0) return "";
    const exists = (id: string) => list.some(t => t.id === id);
    // A stale id (term deleted, or a link from another database) must not
    // strand the UI on an empty selection — fall through to the default.
    if (urlTerm && exists(urlTerm)) return urlTerm;
    if (stored && exists(stored)) return stored;
    return (list.find(t => t.is_active) ?? list[0]).id;
  }, [terms, urlTerm, stored]);

  const term = useMemo(() => (terms ?? []).find(t => t.id === termId), [terms, termId]);

  const setTermId = useCallback(
    async (id: string) => {
      if (id === termId) return;
      for (const guard of guards.current) {
        if (!(await guard())) return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Not fatal — the URL below still carries the choice for this session.
      }
      setStored(id);
      // Mirror into the URL so the current view is linkable and the back button
      // walks through term changes. replace, not push: a term switch is a change
      // of scope, not a new destination.
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("term", id);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [termId, pathname, router, searchParams],
  );

  const onBeforeSwitch = useCallback((guard: () => boolean | Promise<boolean>) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);

  const value = useMemo<TermCtx>(
    () => ({
      terms,
      term,
      termId,
      termLabel: term ? `${term.academic_year}/${term.semester}` : "",
      setTermId,
      loaded: terms !== undefined,
      onBeforeSwitch,
    }),
    [terms, term, termId, setTermId, onBeforeSwitch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Builds an SWR key that is null until a term is known, so a page never fires
 * a request for `term_id=` (which the API would answer for the wrong scope or
 * reject). Every staff page that scopes by term should build its keys here.
 */
export function useTermKey(path: string, param = "term_id"): string | null {
  const { termId } = useTerm();
  if (!termId) return null;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${param}=${termId}`;
}
