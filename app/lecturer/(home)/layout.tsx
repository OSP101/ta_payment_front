import { getMe } from "../../lib/session";
import { redirect } from "next/navigation";
import LecturerHomeShell from "../LecturerHomeShell";

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  return <LecturerHomeShell me={me}>{children}</LecturerHomeShell>;
}
