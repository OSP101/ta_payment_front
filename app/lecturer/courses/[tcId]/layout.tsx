import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "../../../lib/session";
import LecturerCourseShell from "../../LecturerCourseShell";

const backend = process.env.API_URL ?? "http://localhost:8080";

async function fetchCourseMeta(tcId: string): Promise<{ code: string; name_th: string } | null> {
  const c = await cookies();
  const token = c.get("access_token")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${backend}/api/v1/teaching-courses/${tcId}`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { code: string; name_th: string };
    return { code: j.code, name_th: j.name_th };
  } catch { return null; }
}

export default async function CourseLayout({
  params, children,
}: {
  params: Promise<{ tcId: string }>;
  children: React.ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { tcId } = await params;
  const meta = await fetchCourseMeta(tcId);
  return (
    <LecturerCourseShell
      me={me}
      tcId={tcId}
      courseCode={meta?.code}
    >
      {children}
    </LecturerCourseShell>
  );
}
