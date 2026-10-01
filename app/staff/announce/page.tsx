"use client";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Eye, List as ListIcon, Megaphone, Pin, Plus, Users } from "lucide-react";
import { toast } from "@heroui/react";
import { api, errMessage } from "../../lib/api";
import { Skel } from "../../components/Skeletons";
import { Button, EmptyState, PageHeader, SearchField } from "../../components/ui";
import Calendar from "./Calendar";
import Composer from "./Composer";
import Detail, { DetailEmpty } from "./Detail";
import {
  CategoryChip, LIST_KEY, STATUS_LABEL, StatusChip, draftFromAnn, emptyDraft, fmtDateTime, plainText, todayLocal,
  type Ann, type Draft, type Status,
} from "./shared";

/**
 * ประชาสัมพันธ์ — one screen, laid out like a mailbox.
 *
 * The list is on the left and the selected announcement on the right, with its
 * recipients and what happened to each delivery. Writing takes over the page
 * and returns to the announcement just saved, so "did it go out, and to whom"
 * is answered where the officer already is. The older page kept writing and
 * managing in two tabs: publishing cleared the form and showed nothing.
 */

type View =
  | { mode: "browse" }
  | { mode: "compose"; initial: Draft; existing: Ann | null; check: boolean; key: number };

const FILTERS: ("all" | Status)[] = ["all", "live", "scheduled", "draft", "expired"];

type Layout = "list" | "calendar";
const LAYOUT_KEY = "ta-announce-layout";

function readLayout(): Layout {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}

export default function AnnouncePage() {
  const { data: list } = useSWR<Ann[]>(LIST_KEY);
  const [view, setView] = useState<View>({ mode: "browse" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Phones show one column at a time; this says which.
  const [showDetail, setShowDetail] = useState(false);
  const [status, setStatus] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const [layout, setLayoutState] = useState<Layout>("list");
  const detailRef = useRef<HTMLDivElement | null>(null);

  // Remembered per browser; read after mount so the server render matches.
  useEffect(() => { setLayoutState(readLayout()); }, []);
  function setLayout(l: Layout) {
    setLayoutState(l);
    try { window.localStorage.setItem(LAYOUT_KEY, l); } catch { /* private mode */ }
  }

  const counts = useMemo(() => {
    const c: Record<"all" | Status, number> = { all: 0, live: 0, scheduled: 0, draft: 0, expired: 0 };
    (list ?? []).forEach(a => { c.all++; c[a.status]++; });
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list ?? []).filter(a =>
      (status === "all" || a.status === status) &&
      (!needle || a.title.toLowerCase().includes(needle) || plainText(a.body).toLowerCase().includes(needle)),
    );
  }, [list, status, q]);

  // Keep something selected on wide screens, where the detail column is always
  // on show; never steal the selection the officer made.
  // The calendar starts with nothing selected: its detail column is a hint
  // until a bar is clicked.
  useEffect(() => {
    if (!list || layout !== "list") return;
    if (selectedId && list.some(a => a.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [list, filtered, selectedId, layout]);

  const selected = (list ?? []).find(a => a.id === selectedId) ?? null;

  function compose(initial: Draft, existing: Ann | null = null, check = false) {
    setView({ mode: "compose", initial, existing, check, key: Date.now() });
    window.scrollTo({ top: 0 });
  }

  /** A calendar pick on a narrow screen: the detail sits under the calendar. */
  function selectFromCalendar(id: string) {
    setSelectedId(id);
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  /** A draft dropped on a day: open it with that day filled in. Publishing it
   *  still goes through the pre-publish check. */
  async function scheduleDraft(id: string, day: string) {
    try {
      const full = await api.get<Ann>(`/announcements/${id}`);
      compose({ ...draftFromAnn(full), ...whenFor(day) }, full);
      toast.info("ตั้งวันเผยแพร่ให้แล้ว ตรวจเวลาแล้วกด “ตรวจและตั้งเวลา”");
    } catch (e) {
      toast.danger(errMessage(e));
    }
  }

  if (view.mode === "compose") {
    return (
      <div>
        <PageHeader title="ประชาสัมพันธ์" description="เขียน ตรวจ และเผยแพร่ประกาศถึงผู้ใช้ตามกลุ่ม" />
        <Composer
          key={view.key}
          initial={view.initial}
          existing={view.existing}
          autoCheck={view.check}
          onClose={() => { setView({ mode: "browse" }); window.scrollTo({ top: 0 }); }}
          onSaved={(id) => {
            window.scrollTo({ top: 0 });
            setStatus("all");
            setQ("");
            setSelectedId(id);
            setShowDetail(true);
            setView({ mode: "browse" });
          }}
        />
      </div>
    );
  }

  const filterBar = (
    <div className="mb-3 space-y-2">
      <SearchField value={q} onChange={setQ} placeholder="ค้นหาหัวข้อหรือเนื้อหา" ariaLabel="ค้นหาประกาศ" className={layout === "list" ? "w-full" : undefined} />
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            aria-pressed={status === f}
            onClick={() => setStatus(f)}
            className={`chip cursor-pointer transition ${status === f ? "chip-brand" : "chip-neutral"}`}
          >
            {f === "all" ? "ทั้งหมด" : STATUS_LABEL[f]}{list ? ` ${counts[f]}` : ""}
          </button>
        ))}
      </div>
    </div>
  );

  const detail = selected ? (
    <Detail
      key={selected.id}
      row={selected}
      onBack={() => { setShowDetail(false); if (layout === "calendar") setSelectedId(null); }}
      onEdit={(full, opts) => compose(draftFromAnn(full), full, !!opts?.check)}
      onDeleted={() => { setSelectedId(null); setShowDetail(false); }}
    />
  ) : null;

  return (
    <div>
      <PageHeader
        title="ประชาสัมพันธ์"
        description="เขียน ตรวจ และเผยแพร่ประกาศถึงผู้ใช้ตามกลุ่ม พร้อมดูผลการส่งรายคน"
        actions={
          <>
            <div role="group" aria-label="มุมมอง" className="inline-flex rounded-lg border border-border bg-surface p-0.5" data-tour="announce-layout">
              {([["list", "รายการ", <ListIcon key="l" size={14} />], ["calendar", "ปฏิทิน", <CalendarDays key="c" size={14} />]] as const).map(([v, label, icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={layout === v}
                  onClick={() => setLayout(v)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
                    (layout === v ? "bg-accent-soft font-medium text-accent-soft-foreground" : "text-ink-2 hover:text-foreground")
                  }
                >
                  {icon}{label}
                </button>
              ))}
            </div>
            <Button variant="primary" onPress={() => compose(emptyDraft)} data-tour="announce-new">
              <Plus size={14} /> เขียนประกาศ
            </Button>
          </>
        }
      />

      {layout === "calendar" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0">
            {filterBar}
            {!list ? <Skel className="h-[36rem] w-full rounded-xl" /> : (
              <Calendar
                items={filtered}
                selectedId={selectedId}
                onSelect={selectFromCalendar}
                onScheduleDraft={(id, day) => void scheduleDraft(id, day)}
                onNewOnDay={day => compose({ ...emptyDraft, ...whenFor(day) })}
              />
            )}
          </div>
          <div ref={detailRef} className="min-w-0 scroll-mt-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            {detail ?? (
              <div className="hidden rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted xl:block">
                คลิกประกาศบนปฏิทินเพื่อดูเนื้อหา ผู้รับ และผลการส่ง
              </div>
            )}
          </div>
        </div>
      ) : (
      // minmax(0,…) on phones too: an implicit auto column grows to its widest
      // child (the recipient table), and the whole page then scrolls sideways.
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* ---- list ---- */}
        <div className={showDetail && selected ? "hidden lg:block" : ""} data-tour="announce-list" data-testid="announce-list">
          {filterBar}

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {!list ? (
              <div role="status" aria-busy="true" className="divide-y divide-[var(--hairline)]">
                <span className="sr-only">กำลังโหลด</span>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex flex-col gap-2 px-4 py-3">
                    <Skel className="h-5 w-32 rounded-full" />
                    <Skel className="h-4 w-3/4" />
                    <Skel className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Megaphone size={28} />}
                title={list.length === 0 ? "ยังไม่มีประกาศ" : "ไม่พบประกาศที่ตรงกับตัวกรอง"}
                description={list.length === 0 ? "กด “เขียนประกาศ” เพื่อเริ่มฉบับแรก" : "ลองเปลี่ยนคำค้นหรือสถานะ"}
                action={list.length === 0
                  ? <Button variant="primary" size="sm" onPress={() => compose(emptyDraft)}><Plus size={13} /> เขียนประกาศ</Button>
                  : <Button variant="secondary" size="sm" onPress={() => { setQ(""); setStatus("all"); }}>ล้างตัวกรอง</Button>}
              />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {filtered.map(a => (
                  <ListRow
                    key={a.id}
                    a={a}
                    active={a.id === selectedId}
                    onSelect={() => { setSelectedId(a.id); setShowDetail(true); }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ---- detail ---- */}
        {/* Sticky with its own scroll on wide screens, so the selected
            announcement stays beside the list however far the list is scrolled. */}
        <div className={(showDetail && selected ? "" : "hidden lg:block") + " lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"}>
          {detail ?? (list && list.length > 0 ? <DetailEmpty /> : null)}
        </div>
      </div>
      )}
    </div>
  );
}

function ListRow({ a, active, onSelect }: { a: Ann; active: boolean; onSelect: () => void }) {
  const total = a.audience_count ?? 0;
  const failed = a.failed_count ?? 0;
  const read = a.read_count ?? 0;
  const out = a.status === "live" || a.status === "expired";
  const excerpt = plainText(a.body);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={
          "block w-full px-4 py-3 text-start transition-colors " +
          (active ? "bg-accent-soft" : "hover:bg-surface-secondary")
        }
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <CategoryChip category={a.category} />
          <StatusChip status={a.status} publishedAt={a.published_at} />
          {a.pinned && a.status === "live" && <Pin size={12} className="text-brand" aria-label="ปักหมุด" />}
        </span>
        <span className="mt-1.5 block truncate text-sm font-medium text-foreground">{a.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{excerpt}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {out ? (
            <>
              <span>{fmtDateTime(a.published_at)}</span>
              <span className="inline-flex items-center gap-1"><Users size={11} />ถึง {total} คน</span>
              {total > 0 && <span className="inline-flex items-center gap-1"><Eye size={11} />อ่าน {read}</span>}
              {failed > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-danger">
                  <AlertTriangle size={11} />ไม่สำเร็จ {failed}
                </span>
              )}
            </>
          ) : (
            <span>
              {a.status === "scheduled" ? "ยังไม่มีใครเห็น จนถึงเวลาที่ตั้งไว้" : `แก้ไขล่าสุด ${fmtDateTime(a.updated_at)}`}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** The composer's "when" fields for a day picked on the calendar: today goes
 *  out now, a later day is scheduled for nine in the morning. */
function whenFor(day: string): Partial<Draft> {
  return day <= todayLocal()
    ? { when: "now", publishDate: "", publishTime: "" }
    : { when: "scheduled", publishDate: day, publishTime: "09:00" };
}
