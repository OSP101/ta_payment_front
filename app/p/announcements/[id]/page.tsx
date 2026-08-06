"use client";
import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  AlertTriangle, CalendarClock, Info, Megaphone,
  Newspaper, PartyPopper, Radio,
} from "lucide-react";
import ShareButtons from "../../../components/ShareButtons";
import AttachmentGallery, { type Attachment } from "../../../components/AttachmentGallery";
import RichText from "../../../components/RichText";

/**
 * The public face of one announcement: no login, no sidebar, no feed.
 *
 * This is where a Facebook or LINE link lands. It deliberately renders nothing
 * from the rest of the app — no shell, no navigation into the system — because
 * the reader may have no account and offering them locked doors is noise.
 *
 * The server decides what is visible (see AnnounceService.PublicGet): only
 * announcements staff opened for sharing, and only while they are live.
 * Everything else answers 404, so this page cannot be used to probe which
 * announcements exist.
 */

type Category = "info" | "news" | "warning" | "urgent" | "event";

interface PublicAnn {
  id: string;
  title: string;
  body: string;
  category: Category;
  cover_image_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  attachments?: Attachment[];
}

const CAT_META: Record<Category, { label: string; icon: React.ReactNode; className: string }> = {
  info:    { label: "ข้อมูลทั่วไป",      icon: <Info size={14} />,          className: "bg-sky-50 text-sky-700 border-sky-200" },
  news:    { label: "ข่าวประชาสัมพันธ์", icon: <Newspaper size={14} />,     className: "bg-blue-50 text-blue-700 border-blue-200" },
  event:   { label: "กิจกรรม",           icon: <PartyPopper size={14} />,   className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warning: { label: "แจ้งเตือน",          icon: <AlertTriangle size={14} />, className: "bg-amber-50 text-amber-800 border-amber-200" },
  urgent:  { label: "ด่วน",               icon: <Radio size={14} />,         className: "bg-red-50 text-red-700 border-red-200" },
};

export default function PublicAnnouncementPage() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<PublicAnn>(
    params?.id ? `/public/announcements/${params.id}` : null,
    // One shot: an anonymous reader has nothing to revalidate against, and a
    // background refetch on focus would just re-run a request that cannot
    // change while they read.
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[760px] items-center gap-2.5 px-5 py-3.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            T
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-1">TA Payment</div>
            <div className="text-[11px] text-ink-3">วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 py-6">
        {isLoading && !data && !error && (
          <div className="h-64 animate-pulse rounded-xl border border-border bg-white" />
        )}

        {error && (
          <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
            <Megaphone size={30} className="mx-auto mb-3 text-ink-4" />
            <div className="text-base font-semibold text-ink-1">ไม่พบประกาศนี้</div>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-3">
              ประกาศอาจถูกถอนออก หมดอายุแล้ว หรือไม่ได้เปิดให้อ่านแบบสาธารณะ
              หากคุณเป็นบุคลากรหรือนักศึกษา ให้เข้าสู่ระบบเพื่ออ่านประกาศทั้งหมด
            </p>
            <a
              href="/login"
              className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
            >
              เข้าสู่ระบบ
            </a>
          </div>
        )}

        {data && <Article a={data} />}
      </main>

      <footer className="mx-auto max-w-[760px] px-5 pb-10 text-center text-xs text-ink-4">
        ประกาศจากระบบ TA Payment วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น
      </footer>
    </div>
  );
}

function Article({ a }: { a: PublicAnn }) {
  const meta = CAT_META[a.category] ?? CAT_META.info;
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-white">
      {a.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.cover_image_url.replace("/api/v1/announcements/images/", "/api/v1/public/announcements/media/")}
          alt=""
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="px-6 py-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
            {meta.icon}{meta.label}
          </span>
          {a.published_at && (
            <span className="text-xs text-ink-3">
              {new Date(a.published_at).toLocaleDateString("th-TH", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </span>
          )}
          {a.expires_at && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-4">
              <CalendarClock size={11} />
              ถึง {new Date(a.expires_at).toLocaleDateString("th-TH", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold leading-snug text-ink-1 md:text-2xl">{a.title}</h1>

        <RichText body={a.body} className="mt-4 text-[15px] text-ink-2" />

        {!!a.attachments?.length && (
          <div className="mt-4">
            {/* publicMode: the authenticated media route refuses anonymous
                callers, so the same key has to be fetched through /public. */}
            <AttachmentGallery items={a.attachments} publicMode />
          </div>
        )}

        <div className="mt-6 border-t border-hairline pt-4">
          <div className="mb-2 text-xs font-medium text-ink-3">แชร์ประกาศนี้</div>
          <ShareButtons id={a.id} title={a.title} isPublic size="sm" />
        </div>
      </div>
    </article>
  );
}
