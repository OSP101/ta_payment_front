import { requireRole } from "../lib/session";

export default async function LecturerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("lecturer", "admin", "staff");
  return <>{children}</>;
}
