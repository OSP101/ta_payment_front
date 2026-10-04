"use client";
import useSWR, { mutate } from "swr";
import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, FileText, Flag, GripVertical, Plus } from "lucide-react";
import { toast } from "@/app/lib/toast";
import { api, errMessage } from "../../lib/api";
import { Button, ConfirmDialog, FieldGroup, TimePicker, Tip } from "../../components/ui";
import {
  CAT_META, LIST_KEY, STATUS_LABEL, fmtDateTime, fromLocalParts, toLocalParts, toPinPayload, todayLocal,
  type Ann,
} from "./shared";

/**
 * Month view of the announcements.
 *
 * Each published notice is a bar from the day it went out to the day it
 * expires, so overlapping notices and quiet stretches show at a glance. The
 * dates the office works to sit underneath as reference marks: the day each
 * month's work-log window closes (a reminder belongs a few days before it) and
 * public holidays (nobody reads a notice sent on one).
 *
 * Drafts wait in the strip above the grid. Dragging one onto a day opens it in
 * the composer with that day filled in — scheduling still goes through the
 * pre-publish check, because a scheduled notice mails people on its own.
 * Dragging a scheduled notice to another day moves it, after asking the time.
 */

interface Holiday { id: string; holiday_date: string; name_th: string }
interface Period { id: string; due_date: string; label: string }

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MAX_LANES = 3;
const DRAG_TYPE = "application/x-announcement";

// ---- dates as local "YYYY-MM-DD" keys --------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

interface Span {
  a: Ann;
  start: string;
  end: string;
  /** Live with no expiry: it carries on past its last drawn day. */
  open: boolean;
}

function spanOf(a: Ann): Span | null {
  if (!a.published_at) return null;
  const start = toLocalParts(a.published_at).date;
  let end = start;
  if (a.expires_at) {
    const exp = new Date(a.expires_at);
    // Expiring at midnight means the last visible day is the one before.
    const last = exp.getHours() === 0 && exp.getMinutes() === 0 ? addDays(exp, -1) : exp;
    end = keyOf(last) < start ? start : keyOf(last);
  }
  return { a, start, end, open: !a.expires_at && a.status === "live" };
}

const BAR: Record<Ann["status"], string> = {
  live: "bg-[var(--brand-soft)] text-[var(--brand)]",
  scheduled: "border border-dashed border-sky-400 bg-sky-50 text-sky-800",
  expired: "bg-surface-secondary text-muted line-through decoration-1",
  draft: "bg-surface-secondary text-ink-2",
};

export default function Calendar({
  items, selectedId, onSelect, onScheduleDraft, onNewOnDay,
}: {
  /** Already filtered by the page's search and status chips. */
  items: Ann[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A draft dropped on a day: open it in the composer with that day set. */
  onScheduleDraft: (id: string, day: string) => void;
  onNewOnDay: (day: string) => void;
}) {
  const today = todayLocal();
  const [month, setMonth] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [move, setMove] = useState<{ a: Ann; day: string; time: string } | null>(null);
  const [moving, setMoving] = useState(false);

  const { data: holidays } = useSWR<Holiday[]>("/holidays");
  const { data: periods } = useSWR<Period[]>("/submission-periods");

  // The six (or five, or four) weeks the month touches, Sunday first.
  const weeks = useMemo(() => {
    const first = addDays(month, -month.getDay());
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const count = Math.ceil((month.getDay() + days) / 7);
    return Array.from({ length: count }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => keyOf(addDays(first, w * 7 + d))));
  }, [month]);
  const monthKey = keyOf(month).slice(0, 7);

  const spans = useMemo(() => items.map(spanOf).filter((s): s is Span => !!s)
    .sort((x, y) => x.start.localeCompare(y.start) || y.end.localeCompare(x.end)), [items]);
  const drafts = useMemo(() => items.filter(a => a.status === "draft"), [items]);

  const marks = useMemo(() => {
    const m = new Map<string, { holiday?: string; due?: string }>();
    (holidays ?? []).forEach(h => m.set(h.holiday_date, { ...m.get(h.holiday_date), holiday: h.name_th }));
    (periods ?? []).forEach(p => m.set(p.due_date, { ...m.get(p.due_date), due: `ปิดรับบันทึกเวลา ${p.label}` }));
    return m;
  }, [holidays, periods]);

  /** Lay one week's bars out in lanes, so overlapping notices stack. */
  function layoutWeek(days: string[]) {
    const from = days[0], to = days[6];
    const lanes: string[] = []; // last day used per lane
    const placed: { s: Span; col: number; len: number; lane: number; cutL: boolean; cutR: boolean }[] = [];
    const hidden = new Map<string, number>();
    for (const s of spans) {
      if (s.end < from || s.start > to) continue;
      const a = s.start < from ? from : s.start;
      const b = s.end > to ? to : s.end;
      let lane = lanes.findIndex(last => last < a);
      if (lane === -1) { lane = lanes.length; lanes.push(b); } else lanes[lane] = b;
      const col = days.indexOf(a);
      const len = days.indexOf(b) - col + 1;
      if (lane >= MAX_LANES) {
        for (let i = col; i < col + len; i++) hidden.set(days[i], (hidden.get(days[i]) ?? 0) + 1);
        continue;
      }
      placed.push({ s, col, len, lane, cutL: s.start < from, cutR: s.end > to || (s.open && b === to) });
    }
    return { placed, hidden };
  }

  const onDay = (day: string) => spans.filter(s => s.start <= day && s.end >= day);

  function onDrop(day: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const a = items.find(x => x.id === id);
    if (!a || day < today) return;
    if (a.status === "draft") { onScheduleDraft(a.id, day); return; }
    if (a.status === "scheduled") {
      setMove({ a, day, time: toLocalParts(a.published_at).time || "09:00" });
    }
  }

  async function confirmMove() {
    if (!move) return;
    const at = fromLocalParts(move.day, move.time);
    if (!at || at.getTime() <= Date.now()) { toast.danger("เวลาที่ตั้งเผยแพร่ต้องอยู่ในอนาคต"); return; }
    if (move.a.expires_at && new Date(move.a.expires_at).getTime() <= at.getTime()) {
      toast.danger(`วันเผยแพร่ใหม่ต้องอยู่ก่อนวันหมดอายุ (${fmtDateTime(move.a.expires_at)}) แก้ไขวันหมดอายุในหน้าแก้ไขก่อน`);
      return;
    }
    setMoving(true);
    try {
      await api.post("/announcements", { ...toPinPayload(move.a, move.a.pinned), published_at: at.toISOString() });
      toast.success(`เลื่อนเวลาเผยแพร่เป็น ${fmtDateTime(at.toISOString())} แล้ว`);
      await Promise.all([mutate(LIST_KEY), mutate(`/announcements/${move.a.id}`)]);
      setMove(null);
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setMoving(false);
    }
  }

  const dragProps = (a: Ann) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, a.id);
      e.dataTransfer.effectAllowed = "move";
    },
  });

  const monthLabel = month.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const focusSpans = focusDay ? onDay(focusDay) : [];
  const agenda = useMemo(() => spans.filter(s => s.start.slice(0, 7) === monthKey ||
    (s.start < `${monthKey}-01` && s.end >= `${monthKey}-01`)), [spans, monthKey]);

  return (
    <div className="space-y-3" data-testid="announce-calendar">
      {/* Drafts waiting for a date */}
      {drafts.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface px-3 py-2.5">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-medium text-foreground">ฉบับร่าง ยังไม่กำหนดวัน</span>
            <span className="hidden text-muted sm:inline">ลากไปวางบนวันที่เพื่อตั้งเวลาเผยแพร่</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {drafts.map(a => (
              <button
                key={a.id}
                type="button"
                {...dragProps(a)}
                onClick={() => onSelect(a.id)}
                className={
                  "inline-flex max-w-full cursor-grab items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand active:cursor-grabbing " +
                  (a.id === selectedId ? "ring-2 ring-[var(--brand)]" : "")
                }
              >
                <GripVertical size={12} className="hidden shrink-0 text-muted sm:block" />
                <FileText size={12} className="shrink-0 text-muted" />
                <span className="truncate">{a.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
          <Tip content="เดือนก่อน">
            <Button variant="ghost" size="sm" isIconOnly aria-label="เดือนก่อน"
              onPress={() => { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setFocusDay(null); }}>
              <ChevronLeft size={16} />
            </Button>
          </Tip>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-foreground" aria-live="polite">{monthLabel}</span>
          <Tip content="เดือนถัดไป">
            <Button variant="ghost" size="sm" isIconOnly aria-label="เดือนถัดไป"
              onPress={() => { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setFocusDay(null); }}>
              <ChevronRight size={16} />
            </Button>
          </Tip>
          <Button variant="tertiary" size="sm"
            onPress={() => { const t = new Date(); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setFocusDay(today); }}>
            วันนี้
          </Button>
          <span className="flex-1" />
          <Legend />
        </div>

        {/* Month grid — tablets and up */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-7 border-b border-hairline text-center text-[11px] text-muted">
            {WEEKDAYS.map(d => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          {weeks.map(days => {
            const { placed, hidden } = layoutWeek(days);
            return (
              <div key={days[0]} className="relative grid grid-cols-7 border-b border-hairline last:border-b-0">
                {/* Day cells: the drop targets and the background. */}
                {days.map(day => {
                  const inMonth = day.slice(0, 7) === monthKey;
                  const past = day < today;
                  const mark = marks.get(day);
                  return (
                    <div
                      key={day}
                      onDragOver={e => { if (!past && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDragOver(day); } }}
                      onDragLeave={() => setDragOver(d => (d === day ? null : d))}
                      onDrop={e => onDrop(day, e)}
                      className={
                        "group relative min-h-[8.5rem] border-e border-hairline px-1.5 pb-1 pt-1 last:border-e-0 " +
                        (inMonth ? "" : "bg-surface-secondary/60 ") +
                        (mark?.holiday ? "bg-rose-50/60 " : "") +
                        (dragOver === day ? "outline outline-2 -outline-offset-2 outline-[var(--brand)] " : "") +
                        (focusDay === day ? "bg-[var(--brand-soft)]/40 " : "")
                      }
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setFocusDay(f => (f === day ? null : day))}
                          aria-label={`ประกาศวันที่ ${parseKey(day).toLocaleDateString("th-TH", { day: "numeric", month: "long" })}`}
                          className={
                            "flex size-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors hover:bg-surface-secondary " +
                            (day === today ? "bg-[var(--brand)] font-semibold text-white hover:bg-[var(--brand)] " : inMonth ? "text-foreground " : "text-muted ")
                          }
                        >
                          {parseKey(day).getDate()}
                        </button>
                        {!past && (
                          <Tip content="เขียนประกาศสำหรับวันนี้">
                            <button
                              type="button"
                              aria-label="เขียนประกาศสำหรับวันนี้"
                              onClick={() => onNewOnDay(day)}
                              className="ms-auto flex size-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-surface-secondary hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Plus size={13} />
                            </button>
                          </Tip>
                        )}
                      </div>
                      {/* Reference marks sit at the bottom, under the bars. */}
                      <div className="absolute inset-x-1.5 bottom-1 space-y-0.5">
                        {(hidden.get(day) ?? 0) > 0 && (
                          <button type="button" onClick={() => setFocusDay(day)} className="block text-[10px] font-medium text-accent hover:underline">
                            +{hidden.get(day)} รายการ
                          </button>
                        )}
                        {mark?.due && (
                          <Tip content={mark.due}>
                            <div className="flex items-center gap-0.5 truncate text-[10px] text-amber-700">
                              <Flag size={10} className="shrink-0" />{mark.due.replace("ปิดรับบันทึกเวลา ", "ปิดรับ ")}
                            </div>
                          </Tip>
                        )}
                        {mark?.holiday && (
                          <Tip content={mark.holiday}>
                            <div className="truncate text-[10px] text-rose-700">{mark.holiday}</div>
                          </Tip>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Bars, laid over the cells in their own grid. */}
                <div className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 gap-y-1">
                  {placed.map(({ s, col, len, lane, cutL, cutR }) => {
                    const meta = CAT_META[s.a.category] ?? CAT_META.info;
                    return (
                      <Tip key={s.a.id + col} content={`${s.a.title}\n${STATUS_LABEL[s.a.status]} · ${fmtDateTime(s.a.published_at)}${s.a.expires_at ? ` ถึง ${fmtDateTime(s.a.expires_at)}` : ""}`}>
                        <button
                          type="button"
                          {...(s.a.status === "scheduled" ? dragProps(s.a) : {})}
                          onClick={() => onSelect(s.a.id)}
                          style={{ gridColumn: `${col + 1} / span ${len}`, gridRow: lane + 1 }}
                          className={
                            "pointer-events-auto flex h-5 min-w-0 items-center gap-1 px-1.5 text-start text-[11px] leading-none " +
                            BAR[s.a.status] + " " +
                            (cutL ? "rounded-s-none " : "ms-1 rounded-s-md ") +
                            (cutR ? "rounded-e-none " : "me-1 rounded-e-md ") +
                            (s.a.status === "scheduled" ? "cursor-grab " : "") +
                            (s.a.id === selectedId ? "ring-2 ring-inset ring-[var(--brand)] " : "")
                          }
                        >
                          <span className="shrink-0 [&>svg]:size-3">{s.a.status === "scheduled" ? <CalendarClock /> : meta.icon}</span>
                          <span className="truncate">{s.a.title}</span>
                        </button>
                      </Tip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agenda — phones, where seven columns are too narrow to read */}
        <ul className="divide-y divide-[var(--hairline)] sm:hidden">
          {agenda.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">ไม่มีประกาศในเดือนนี้</li>}
          {agenda.map(s => <AgendaRow key={s.a.id} s={s} selected={s.a.id === selectedId} onSelect={onSelect} />)}
        </ul>
      </div>

      {/* The one day the officer clicked: every notice on it, nothing hidden */}
      {focusDay && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">
              {parseKey(focusDay).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
            {marks.get(focusDay)?.due && <span className="text-xs text-amber-700">{marks.get(focusDay)?.due}</span>}
            {marks.get(focusDay)?.holiday && <span className="text-xs text-rose-700">{marks.get(focusDay)?.holiday}</span>}
            <span className="flex-1" />
            {focusDay >= today && (
              <Button variant="secondary" size="sm" onPress={() => onNewOnDay(focusDay)}>
                <Plus size={13} /> เขียนประกาศสำหรับวันนี้
              </Button>
            )}
          </div>
          <ul className="divide-y divide-[var(--hairline)]">
            {focusSpans.length === 0 && <li className="px-4 py-4 text-sm text-muted">ไม่มีประกาศที่แสดงในวันนี้</li>}
            {focusSpans.map(s => <AgendaRow key={s.a.id} s={s} selected={s.a.id === selectedId} onSelect={onSelect} />)}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!move}
        onClose={() => { if (!moving) setMove(null); }}
        onConfirm={confirmMove}
        isPending={moving}
        icon={<CalendarClock size={18} />}
        title="เลื่อนเวลาเผยแพร่?"
        confirmLabel="เลื่อนเวลา"
        message={move && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              <span className="font-medium text-foreground">“{move.a.title}”</span> ตั้งเวลาไว้ {fmtDateTime(move.a.published_at)}
              {" "}จะเลื่อนเป็นวันที่ {parseKey(move.day).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
              {" "}ผู้รับจะได้รับแจ้งเตือนและอีเมลตามเวลาใหม่
            </p>
            <FieldGroup label="เวลา">
              <TimePicker label="เวลาเผยแพร่" value={move.time} onChange={v => setMove(m => (m ? { ...m, time: v } : m))} />
            </FieldGroup>
          </div>
        )}
      />
    </div>
  );
}

function AgendaRow({ s, selected, onSelect }: { s: Span; selected: boolean; onSelect: (id: string) => void }) {
  const meta = CAT_META[s.a.category] ?? CAT_META.info;
  const range = s.start === s.end
    ? parseKey(s.start).toLocaleDateString("th-TH", { day: "numeric", month: "short" })
    : `${parseKey(s.start).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ถึง ${parseKey(s.end).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(s.a.id)}
        className={"flex w-full items-start gap-2.5 px-4 py-2.5 text-start transition-colors " + (selected ? "bg-accent-soft" : "hover:bg-surface-secondary")}
      >
        <span className={"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&>svg]:size-3.5 " + BAR[s.a.status]}>
          {s.a.status === "scheduled" ? <CalendarClock /> : meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{s.a.title}</span>
          <span className="block text-xs text-muted">
            {STATUS_LABEL[s.a.status]} · {range}{s.open ? " เป็นต้นไป" : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1"><span className={"inline-block h-2.5 w-4 rounded-sm " + cls} />{label}</span>
  );
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted md:flex">
      {item(BAR.live, "เผยแพร่อยู่")}
      {item(BAR.scheduled, "ตั้งเวลาไว้")}
      {item("bg-surface-secondary", "หมดอายุ")}
      <span className="inline-flex items-center gap-1 text-amber-700"><Flag size={10} />ปิดรับบันทึกเวลา</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-rose-50 ring-1 ring-rose-200" />วันหยุด</span>
    </div>
  );
}
