import type { Metadata } from "next";
import {
  AlertTriangle, CalendarClock, Info, Megaphone,
  Newspaper, PartyPopper, Radio,
} from "lucide-react";
import ShareButtons from "../../../components/ShareButtons";
import AttachmentGallery, { type Attachment } from "../../../components/AttachmentGallery";
import RichText from "../../../components/RichText";
import { backendURL, siteURL } from "../../../lib/site";

/**
 * The public face of one announcement: no login, no sidebar, no feed.
 *
 * This is where a Facebook or LINE link lands, and it is a SERVER component for
 * exactly that reason. It used to fetch the announcement in the browser with
 * SWR, which reads fine for a person but not for the crawler that builds the
 * link-preview card: that crawler does not run JavaScript, so every shared link
 * arrived as a bare card carrying nothing but the domain. Rendering on the
 * server puts the title, the text and the picture in the HTML itself, which is
 * what `generateMetadata` below then declares to the platforms.
 *
 * It deliberately renders nothing from the rest of the app — no shell, no
 * navigation into the system — because the reader may have no account and
 * offering them locked doors is noise.
 *
 * The API decides what is visible (see AnnounceService.PublicGet): only
 * announcements staff opened for sharing, and only while they are live.
 * Everything else answers 404, so this page cannot be used to probe which
 * announcements exist.
 */

type Category = "info" | "news" | "warning" | "urgent" | "event";

interface PublicAnn {
  id: string;
  title: string;
  body: string;
  /** Body with the markup stripped, cut for a preview card. From the API, so
   *  it can never describe the announcement differently from the email. */
  excerpt?: string;
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

const SITE_NAME = "TA Payment · วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น";

async function getAnnouncement(id: string): Promise<PublicAnn | null> {
  try {
    const r = await fetch(
      `${backendURL()}/api/v1/public/announcements/${encodeURIComponent(id)}`,
      // Never cached: an announcement can be withdrawn or expire at any moment,
      // and a cached copy would keep serving a notice the office has retracted.
      { cache: "no-store" },
    );
    if (!r.ok) return null;
    return (await r.json()) as PublicAnn;
  } catch {
    // The API being down must not crash the page — the reader gets the same
    // "not found" panel they would get for a withdrawn announcement.
    return null;
  }
}

/**
 * The picture a crawler will fetch.
 *
 * Cover images come back pointed at the authenticated media route, which
 * refuses anonymous callers — Facebook among them. Swapping in the public route
 * is what makes the image actually load in the preview card. Falls back to the
 * first attached photo, so an announcement that carries pictures but no cover
 * still shares as a picture card rather than a line of text.
 */
function previewImage(a: PublicAnn): string | null {
  const key = a.cover_image_url?.replace("/api/v1/announcements/images/", "/api/v1/public/announcements/media/");
  if (key) return `${siteURL()}${key}`;
  const firstPhoto = a.attachments?.find(x => x.kind === "image");
  if (firstPhoto) return `${siteURL()}/api/v1/public/announcements/media/${firstPhoto.storage_key}`;
  return null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const a = await getAnnouncement(id);
  if (!a) {
    // Nothing to describe, and nothing that should end up in a search index.
    return { title: "ไม่พบประกาศ", robots: { index: false, follow: false } };
  }

  const url = `${siteURL()}/p/announcements/${a.id}`;
  const description = a.excerpt || SITE_NAME;
  const image = previewImage(a);

  return {
    title: a.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: a.title,
      description,
      url,
      locale: "th_TH",
      publishedTime: a.published_at ?? undefined,
      expirationTime: a.expires_at ?? undefined,
      // Dimensions are deliberately not declared: the cover is resized to fit
      // 1600x900 but the stored file can be anything under that, and a wrong
      // width tells the platform to lay out a box the picture does not fill.
      images: image ? [{ url: image, alt: a.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: a.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicAnnouncementPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await getAnnouncement(id);

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
        {a ? <Article a={a} /> : (
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
