"use client";
import "./globals.css";
import ErrorScreen from "./components/ErrorScreen";
import { clientLocale, tc } from "./lib/i18n/client";

// Replaces the root layout when the layout itself crashes, so it must bring
// its own <html>/<body> and stylesheet (see Next's error.md, "global-error").
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    // The root layout (and its I18nProvider) is gone here, so read the
    // language the provider last left behind instead of a context.
    <html lang={clientLocale()}>
      <body className="min-h-full flex flex-col bg-background">
        <title>{tc("ระบบขัดข้อง | COCO TAS")}</title>
        <ErrorScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
