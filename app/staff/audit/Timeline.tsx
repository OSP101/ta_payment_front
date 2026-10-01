"use client";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import {
  CalendarClock, FileText, GraduationCap, KeyRound, Megaphone, Eye, Settings2, UserCog, Wallet, Clock3,
  type LucideIcon,
} from "lucide-react";
import { Button, EmptyState } from "../../components/ui";
import { SkelList } from "../../components/Skeletons";
import { RowBadges } from "./RowBadges";
import {
  ROLE_LABEL, changePhrase, clock, dayHeading, dayKey, headline, subjectText,
  type Row,
} from "./types";

/* -------------------------------------------------------------------------- *
 * The timeline: what happened, as sentences, a day at a time.
 *
 * A table makes every row look equally important and asks the reader to know
 * what the columns mean. This reads top to bottom like a notebook: a day
 * heading, then "<who> <did what> · <to what>", with whatever makes the row
 * unusual said in a chip and the reason or the change on the line below.
 *
 * A burst — one import writing the same line 336 times — arrives from the
 * server already folded into one row that says how many it stands for.
 * -------------------------------------------------------------------------- */

const CATEGORY_ICON: Record<string, LucideIcon> = {
  access: KeyRound,
  hours: Clock3,
  payment: Wallet,
  docs: FileText,
  account: UserCog,
  course: GraduationCap,
  comms: Megaphone,
  view: Eye,
  system: Settings2,
};

export function categoryIcon(id: string): LucideIcon {
  return CATEGORY_ICON[id] ?? CalendarClock;
}

export function Timeline({
  rows, total, page, pageSize, onPage, loading, error, onRetry, onOpen, onOpenBurst,
}: {
  rows?: Row[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  onOpen: (r: Row) => void;
  onOpenBurst: (r: Row) => void;
}) {
  if (error) {
    return (
      <EmptyState
        title="โหลดบันทึกไม่สำเร็จ"
        description="ตรวจการเชื่อมต่อแล้วลองอีกครั้ง"
        action={<Button variant="secondary" size="sm" onPress={onRetry}>ลองใหม่</Button>}
      />
    );
  }
  if (!rows) return <SkelList items={8} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่พบเหตุการณ์ในช่วงเวลานี้"
        description="ลองขยายช่วงเวลา เปลี่ยนหมวด หรือล้างคำค้น"
      />
    );
  }

  // Rows arrive newest first; a new heading starts wherever the local day changes.
  const groups: { key: string; heading: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const key = dayKey(r.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, heading: dayHeading(r.at), rows: [r] });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;

  return (
    <div aria-busy={loading} className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="space-y-5">
        {groups.map(g => (
          <section key={g.key} aria-label={g.heading}>
            <h3 className="mb-1 border-b border-(--border) pb-1 text-xs font-semibold text-(--ink-3)">
              {g.heading}
            </h3>
            <ul className="divide-y divide-(--border)">
              {g.rows.map(r => (
                <TimelineRow key={r.id} row={r} onOpen={onOpen} onOpenBurst={onOpenBurst} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-(--border) pt-3 text-xs text-(--ink-3) sm:text-sm">
        <span>
          {first.toLocaleString("th-TH")}–{Math.min(first + rows.length - 1, total).toLocaleString("th-TH")} จาก{" "}
          {total.toLocaleString("th-TH")} เหตุการณ์
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" isDisabled={page <= 1} onPress={() => onPage(page - 1)}
              aria-label="หน้าก่อนหน้า">
              <ChevronLeft size={14} /> ใหม่กว่า
            </Button>
            <span className="tabular-nums">หน้า {page} / {pages}</span>
            <Button variant="outline" size="sm" isDisabled={page >= pages} onPress={() => onPage(page + 1)}
              aria-label="หน้าถัดไป">
              เก่ากว่า <ChevronRight size={14} />
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

function TimelineRow({
  row, onOpen, onOpenBurst,
}: {
  row: Row;
  onOpen: (r: Row) => void;
  onOpenBurst: (r: Row) => void;
}) {
  const Icon = categoryIcon(row.category);
  const { who, what } = headline(row);
  const subject = subjectText(row);
  const folded = row.count > 1;

  // The line under the headline: the reason, then what changed. Kept short —
  // the detail view has the whole list.
  const changes = (row.changes ?? []).slice(0, 3).map(changePhrase);
  const more = (row.changes?.length ?? 0) - changes.length;
  const second = [...(folded ? [] : row.details ?? []), ...(folded ? [] : changes)];
  if (!folded && more > 0) second.push(`และอีก ${more} รายการ`);

  const meta = [
    row.actor_role && !row.automatic ? ROLE_LABEL[row.actor_role] ?? row.actor_role : "",
    row.automatic && row.actor_kind === "user" && row.actor_name ? `เริ่มจากการสั่งงานของ ${row.actor_name}` : "",
    // The browser belongs to whoever set the job off, not to the system.
    row.automatic ? "" : row.device ?? "",
  ].filter(Boolean);

  const tone =
    row.outcome !== "ok" || row.severity === "danger" ? "text-danger"
    : row.severity === "warn" ? "text-warning"
    : "text-(--ink-4)";

  return (
    <li>
      <div className="flex items-start gap-3 py-2.5">
        <time dateTime={row.at} className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-(--ink-3)">
          {clock(row.at)}
        </time>
        <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />
        <button
          type="button"
          onClick={() => (folded ? onOpenBurst(row) : onOpen(row))}
          className="min-w-0 flex-1 rounded text-left outline-offset-2 hover:text-(--brand) focus-visible:outline-2 focus-visible:outline-(--brand)"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
            <span className="min-w-0 break-words">
              {who && <span className="font-semibold">{who} </span>}
              <span>{what}</span>
              {subject && !folded && <span className="text-(--ink-2)"> · {subject}</span>}
            </span>
            {folded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-(--surface-2) px-2 py-0.5 text-xs font-medium text-(--ink-2)">
                <Layers size={12} /> {row.count.toLocaleString("th-TH")} รายการ
              </span>
            )}
            <RowBadges row={row} />
          </span>
          {folded && (
            <span className="mt-0.5 block text-xs text-(--ink-3)">
              เกิดขึ้นพร้อมกันในคราวเดียว กดเพื่อดูทีละรายการ
            </span>
          )}
          {second.length > 0 && (
            <span className="mt-0.5 block break-words text-xs text-(--ink-2)">{second.join(" · ")}</span>
          )}
          {meta.length > 0 && (
            <span className="mt-0.5 block text-xs text-(--ink-3)">{meta.join(" · ")}</span>
          )}
        </button>
      </div>
    </li>
  );
}
