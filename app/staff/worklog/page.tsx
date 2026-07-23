"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "../../components/ui";

// The standalone worklog editor was folded into the per-course workspace
// (/staff/exports/[tcId], tab "บันทึกเวลา"). This route is kept only so old
// bookmarks land on the exports list where staff pick a course to edit.
export default function StaffWorklogRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/staff/exports"); }, [router]);
  return (
    <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted">
      <Spinner size="sm" /> กำลังพาไปหน้าส่งออกเอกสาร…
    </div>
  );
}
