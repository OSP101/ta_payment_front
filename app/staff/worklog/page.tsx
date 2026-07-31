import { redirect } from "next/navigation";

// Steps 3 and 4 merged into one screen on 31/07/2026 — see /staff/payouts for
// why. The old paths stay as redirects: they are in bookmarks, in notification
// links, and in the muscle memory of everyone who used the split version.
export default function LegacyWorklogReview() {
  redirect("/staff/payouts");
}
