"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import {
  Megaphone, Pin, CalendarClock, ChevronDown, ChevronUp,
  Info, Newspaper, PartyPopper, AlertTriangle, Radio,
} from "lucide-react";
import { Panel, EmptyState, Chip, type ChipTone } from "./ui";

// Feed of published announcements as seen by the audience. The staff
// composer at /staff/announce owns the create/edit flow; this file is
// read-only and used by TA/lecturer landing pages.

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
  info:    { label: "ข้อมูลทั่วไป",     icon: <Info size={12} />,          tone: "info" },
  news:    { label: "ข่าวประชาสัมพันธ์", icon: <Newspaper size={12} />,     tone: "brand" },
  event:   { label: "กิจกรรม",          icon: <PartyPopper size={12} />,   tone: "success" },
  warning: { label: "แจ้งเตือน",         icon: <AlertTriangle size={12} />, tone: "warn" },
  urgent:  { label: "ด่วน",              icon: <Radio size={12} />,         tone: "danger" },
};

export default function AnnouncementFeed({
  title = "ประชาสัมพันธ์",
  description,
  compact = false,
  limit,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
  limit?: number;
}) {
  const { data, isLoading } = useSWR<Ann[]>("/announcements");
  const items = (data ?? []).slice(0, limit);

  return (
    <Panel title={title} description={description} padded={false}>
      {isLoading && !data ? (
        <div className="p-4 text-sm text-muted">กำลังโหลด…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={26} />}
          title="ยังไม่มีประกาศสำหรับคุณ"
          description="เมื่อมีข่าวสารใหม่ ระบบจะแสดงที่นี่และแจ้งเตือน"
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {items.map(a => (
            <AnnouncementItem key={a.id} a={a} compact={compact} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AnnouncementItem({ a, compact }: { a: Ann; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = CAT_META[a.category] ?? CAT_META.info;
  const bodyLong = a.body.length > 280;
  const preview = open || !bodyLong ? a.body : a.body.slice(0, 280) + "…";

  return (
    <li className="p-4">
      <article className="flex flex-col gap-3">
        {a.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.cover_image_url}
            alt=""
            className="w-full aspect-video object-cover rounded-lg border border-border bg-surface-secondary"
            loading="lazy"
          />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={meta.tone}>
            <span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span>
          </Chip>
          {a.pinned && (
            <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11} />ปักหมุด</span></Chip>
          )}
          <span className="text-[11px] text-muted inline-flex items-center gap-1 ms-auto">
            <CalendarClock size={11} />
            {a.published_at ? new Date(a.published_at).toLocaleString("th-TH", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            }) : "-"}
          </span>
        </div>

        <h3 className="text-base font-semibold text-foreground leading-snug">
          <Link href={`/announcements/${a.id}`} className="hover:underline">
            {a.title}
          </Link>
        </h3>

        {!compact && (
          <div className="text-sm text-foreground/85 whitespace-pre-wrap">
            {preview}
            {bodyLong && (
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="ms-1 inline-flex items-center gap-0.5 text-accent hover:underline text-xs align-middle"
              >
                {open ? <>ย่อ <ChevronUp size={12} /></> : <>อ่านต่อ <ChevronDown size={12} /></>}
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
