"use client";
import ErrorScreen from "./components/ErrorScreen";
import useDocumentTitle from "./lib/useDocumentTitle";
import { msg } from "./lib/i18n/client";

// Catches a crash in any page below the root layout, so the header, session
// guard and watermark stay up around the message. A crash in the root layout
// itself lands in global-error.tsx instead.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useDocumentTitle(msg("ระบบขัดข้อง"));
  return <ErrorScreen error={error} retry={unstable_retry} />;
}
