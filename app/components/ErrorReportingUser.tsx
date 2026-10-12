"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Tags error reports with who hit them: the account id and the acting role,
 * nothing else (no name, no e-mail; see app/lib/errorReporting.ts). The id
 * is what lets GlitchTip say "3 users affected" and lets staff find the
 * account; the role is the first thing a bug report needs.
 *
 * The root layout re-renders on login/logout (both router.refresh()), so this
 * follows the account without listening for anything.
 */
export default function ErrorReportingUser({ id, role }: { id: string | null; role: string | null }) {
  useEffect(() => {
    if (!Sentry.isInitialized()) return;
    Sentry.setUser(id ? { id, segment: role ?? undefined } : null);
    Sentry.setTag("role", role ?? "anonymous");
  }, [id, role]);
  return null;
}
