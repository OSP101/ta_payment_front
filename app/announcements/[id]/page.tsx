"use client";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CalendarClock, Pin,
  Info, Newspaper, PartyPopper, AlertTriangle, Radio, Megaphone,
} from "lucide-react";
import { PageHeader, Panel, EmptyState, Chip, type ChipTone } from "../../components/ui";

type Category = "info" | "news" | "warning" | "urgent" | "event";

interface Ann {
  id: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  status: "draft" | "scheduled" | "live" | "expired";
}

const CAT_META: Record<Category, { label: string; icon: React.ReactNode; tone: ChipTone }> = {
  info:    { label: "ข้อมูลทั่วไป",     icon: <Info size={14} />,          tone: "info" },
  news:    { label: "ข่าวประชาสัมพันธ์", icon: <Newspaper size={14} />,     tone: "brand" },
  event:   { label: "กิจกรรม",          icon: <PartyPopper size={14} />,   tone: "success" },
  warning: { label: "แจ้งเตือน",         icon: <AlertTriangle size={14} />, tone: "warn" },
  urgent:  { label: "ด่วน",              icon: <Radio size={14} />,         tone: "danger" },
};

export default function AnnouncementDetail() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<Ann>(params?.id ? `/announcements/${params.id}` : null);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[820px] mx-auto p-4 md:p-8">
        <Link href="/announcements" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-3">
          <ArrowLeft size={14} /> ประกาศทั้งหมด
        </Link>

        {isLoading && !data && (
          <Panel><div className="text-sm text-muted">กำลังโหลด…</div></Panel>
        )}
        {error && !data && (
          <Panel>
            <EmptyState
              icon={<Megaphone size={26} />}
              title="ไม่พบประกาศนี้"
              description="ประกาศอาจถูกถอนออก หรือคุณไม่มีสิทธิ์เข้าถึง"
            />
          </Panel>
        )}
        {data && <Body a={data} />}
      </div>
    </div>
  );
}

function Body({ a }: { a: Ann }) {
  const meta = CAT_META[a.category] ?? CAT_META.info;
  return (
    <article>
      <PageHeader
        title={a.title}
        description={
          a.published_at
            ? new Date(a.published_at).toLocaleString("th-TH", {
                dateStyle: "full", timeStyle: "short",
              })
            : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Chip tone={meta.tone}>
          <span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span>
        </Chip>
        {a.pinned && (
          <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11} />ปักหมุด</span></Chip>
        )}
        {a.expires_at && (
          <Chip tone="neutral">
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} />
              หมดอายุ {new Date(a.expires_at).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </Chip>
        )}
      </div>

      {a.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.cover_image_url}
          alt=""
          className="w-full aspect-video object-cover rounded-xl border border-border bg-surface-secondary mb-4"
        />
      )}

      <Panel>
        <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
          {a.body}
        </div>
      </Panel>
    </article>
  );
}
