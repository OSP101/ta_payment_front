import { requireRole } from "../lib/session";

// Everyone with an account has an account screen — the TA reaches the same
// content through their own sidebar at /ta/profile, staff and lecturers come
// here from the user menu.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ta", "lecturer", "staff", "admin");
  return <>{children}</>;
}
