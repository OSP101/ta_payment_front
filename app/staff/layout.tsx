import { requireRole } from "../lib/session";
import StaffShell from "./StaffShell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("admin", "staff");
  return <StaffShell me={me}>{children}</StaffShell>;
}
