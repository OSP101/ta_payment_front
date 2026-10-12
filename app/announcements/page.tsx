"use client";
import { PageHeader } from "../components/ui";
import AnnouncementFeed from "../components/AnnouncementFeed";
import { useI18n } from "../lib/i18n/client";

// Rendered inside the reader's own shell (see the layout), which already
// supplies the page padding and the way back.
export default function AnnouncementsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title={t("ประกาศทั้งหมด")}
        description={t("ข่าวสารและประกาศจากคณะสำหรับบทบาทของคุณ")}
      />
      <AnnouncementFeed />
    </div>
  );
}
