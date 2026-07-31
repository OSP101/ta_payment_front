"use client";
import { PageHeader } from "../components/ui";
import AnnouncementFeed from "../components/AnnouncementFeed";

// Rendered inside the reader's own shell (see the layout), which already
// supplies the page padding and the way back.
export default function AnnouncementsPage() {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="ประกาศทั้งหมด"
        description="ข่าวสารและประกาศจากคณะสำหรับบทบาทของคุณ"
      />
      <AnnouncementFeed />
    </div>
  );
}
