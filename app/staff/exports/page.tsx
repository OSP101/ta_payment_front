import { redirect } from "next/navigation";

// Merged into /staff/payouts (31/07/2026). The appointment-order tab that used
// to live here is now its own menu at /staff/appointments.
export default function LegacyExports() {
  redirect("/staff/payouts");
}
