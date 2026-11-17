import { notFound } from "next/navigation";
import RequestPage from "../../lecturer/courses/[tcId]/request/page";
import { getT } from "../../lib/i18n/server";

/** Development only: the real request page, served against the isolated playground API. */
export default async function RequestPreview() {
  if (process.env.NODE_ENV !== "development" || process.env.REQUEST_PLAYGROUND !== "1") notFound();
  const { t } = await getT();
  return <main className="max-w-7xl mx-auto w-full p-4 sm:p-8">
    <div className="mb-6 rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm text-ink-1">
      <strong>{t("ทดลองฟอร์มคำขอ TA ใหม่")}</strong>
      <p>{t("ใช้ฟอร์มจริงกับข้อมูลทดสอบแยก บันทึกร่างและทดลองส่งได้โดยไม่กระทบข้อมูลจริง ข้อมูลจะเริ่มใหม่เมื่อปิดเซิร์ฟเวอร์ทดลอง")}</p>
    </div>
    <RequestPage params={Promise.resolve({ tcId: "request-playground" })} />
  </main>;
}
