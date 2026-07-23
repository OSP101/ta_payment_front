import { requireRole } from "../lib/session";

// The document-progress board is readable by every authenticated role — the
// whole point is that TA, lecturer, and staff can all see where the paperwork
// is without asking. Staff edit it from /staff/progress; here it is read-only.
export default async function DocumentProgressLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ta", "lecturer", "staff", "admin");
  return <>{children}</>;
}
