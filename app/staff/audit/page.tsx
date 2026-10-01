"use client";
import useSWR from "swr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, KeyRound, Layers, Link2, ListChecks, Search, User, X } from "lucide-react";
import {
  Alert, Button, DatePicker, PageHeader, Panel, SearchField, SelectField, Tip,
} from "../../components/ui";
import { api } from "../../lib/api";
import { localDateISO } from "../../lib/dates";
import { notify } from "../../lib/notify";
import { DetailModal } from "./DetailModal";
import { InvestigateTable, type ExpertFilters } from "./InvestigateTable";
import { Overview } from "./Overview";
import { Timeline, categoryIcon } from "./Timeline";
import type { Attention, Catalog, Row, Session, Summary, Trace } from "./types";

/* -------------------------------------------------------------------------- *
 * The audit trail, read two ways.
 *
 * "ดูง่าย" is for the person whose job is the money, not the server: is
 * anything wrong, who is in the system, and what happened — as sentences, a day
 * at a time, with bursts folded and the reason on the line below.
 *
 * "สืบสวน" is for the administrator: every stored row, unfolded, with its
 * reference, raw action, address, and the request / session jumps.
 *
 * Both ask the same API the same question; the only difference is `fold` and
 * how the answer is drawn. Every word about an action comes from the server's
 * catalog, so a row reads the same here, in the export, and in a search.
 * -------------------------------------------------------------------------- */

type Mode = "simple" | "expert";

const PAGE_SIZE = 50;
const MODE_KEY = "audit.mode";

/** Time windows, as an investigation thinks about them. */
const RANGES: { id: string; label: string; phrase: string; hours: number | null }[] = [
  { id: "24h", label: "24 ชั่วโมงล่าสุด", phrase: " 24 ชั่วโมงที่ผ่านมา", hours: 24 },
  { id: "7d", label: "7 วันล่าสุด", phrase: " 7 วันที่ผ่านมา", hours: 24 * 7 },
  { id: "30d", label: "30 วันล่าสุด", phrase: " 30 วันที่ผ่านมา", hours: 24 * 30 },
  { id: "90d", label: "90 วันล่าสุด", phrase: " 90 วันที่ผ่านมา", hours: 24 * 90 },
  { id: "all", label: "ทั้งหมดที่เก็บไว้", phrase: "เวลาทั้งหมดที่เก็บไว้", hours: null },
  { id: "custom", label: "กำหนดวันเอง", phrase: "วันที่เลือก", hours: null },
];

/** "ทั้งหมด" is bounded rather than truly unbounded: the page count behind an
 *  unbounded query is a count over a table that only grows. Ten years is past
 *  the life of any record this system keeps (retention is five). */
const ALL_HOURS = 24 * 365 * 10;

/** The quick filters of the simple view. */
const ONLY: { id: string; label: string; tip: string; params: Record<string, string> }[] = [
  { id: "check", label: "ควรตรวจ", tip: "การย้อนหรือแก้สิ่งที่อนุมัติแล้ว การเปลี่ยนสิทธิ์ และความล้มเหลว",
    params: { severity: "warn,danger" } },
  { id: "failed", label: "ไม่สำเร็จ", tip: "เข้าระบบไม่ผ่าน ถูกล็อก หรือถูกปฏิเสธสิทธิ์",
    params: { outcome: "failed,denied" } },
  { id: "sensitive", label: "ข้อมูลอ่อนไหว", tip: "การเปิดดูหรือดาวน์โหลดข้อมูลส่วนบุคคล",
    params: { severity: "notice" } },
];

const NO_EXPERT_FILTERS: ExpertFilters = { role: "", category: "", outcome: "", action: "", actor: "" };

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function AuditPage() {
  const [mode, setModeState] = useState<Mode>("simple");
  const [range, setRange] = useState("7d");
  const [fromDate, setFromDate] = useState(() => localDateISO(new Date(Date.now() - 6 * 86400_000)));
  const [toDate, setToDate] = useState(() => localDateISO());
  const [typed, setTyped] = useState("");
  // Simple view filters.
  const [category, setCategory] = useState("");
  const [only, setOnly] = useState("");
  // Shared: one action (set by opening an overview item) and one person.
  const [expert, setExpert] = useState<ExpertFilters>(NO_EXPERT_FILTERS);
  const [page, setPage] = useState(1);
  /** A pinned trace: every row from one request, one session, or one burst. */
  const [trace, setTrace] = useState<Trace | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);

  // The choice of view is the reader's own and should survive a reload. Read
  // after mount, so the first paint matches what the server rendered.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODE_KEY) === "expert") setModeState("expert");
    } catch { /* storage unavailable: stay on the default view */ }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    setPage(1);
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* not remembered, still works */ }
  };

  // A search is an audited act (audit_log.search). Sent per keystroke it filed
  // one entry per letter typed; wait for the typing to stop.
  const query = useDebounced(typed.trim(), 450);

  /** Any change to the question starts at page 1 — otherwise a narrower filter
   *  lands on page 7 of a 2-page result and the screen reads as empty. */
  const ask = useCallback(<T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); }, []);

  const window_ = useMemo(() => {
    if (range === "custom") {
      // Whole local days, inclusive at both ends.
      const from = new Date(`${fromDate}T00:00:00`);
      const to = new Date(`${toDate}T23:59:59.999`);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return null;
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const hours = RANGES.find(r => r.id === range)?.hours ?? ALL_HOURS;
    return { from: new Date(Date.now() - hours * 3600_000).toISOString(), to: "" };
  }, [range, fromDate, toDate]);

  /** The question, as query parameters — shared by the list and the export so
   *  "export what I am looking at" exports exactly that. */
  const questionParams = useMemo(() => {
    if (!window_) return null;
    const p = new URLSearchParams();
    if (trace) {
      // A trace is a different question: it replaces the filters (leaving them
      // applied would quietly hide part of the answer) and it is not bounded
      // by the window, because a login session can start before it.
      p.set("from", new Date(Date.now() - ALL_HOURS * 3600_000).toISOString());
      p.set(trace.kind === "request" ? "request_id" : "session_id", trace.id);
      if (trace.kind === "request" && trace.action) p.set("action", trace.action);
      return p;
    }
    p.set("from", window_.from);
    if (window_.to) p.set("to", window_.to);
    if (query) p.set("q", query);
    if (expert.action) p.set("action", expert.action);
    if (expert.actor) p.set("actor_id", expert.actor);
    if (mode === "simple") {
      if (category) p.set("category", category);
      for (const [k, v] of Object.entries(ONLY.find(o => o.id === only)?.params ?? {})) p.set(k, v);
    } else {
      if (expert.category) p.set("category", expert.category);
      if (expert.outcome) p.set("outcome", expert.outcome);
      if (expert.role) p.set("role", expert.role);
    }
    return p;
  }, [window_, trace, query, expert, mode, category, only]);

  const listKey = useMemo(() => {
    if (!questionParams) return null;
    const p = new URLSearchParams(questionParams);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String((page - 1) * PAGE_SIZE));
    // Folding belongs to the simple view; a trace always shows every row.
    if (mode === "simple" && !trace) p.set("fold", "1");
    return `/audit-logs?${p.toString()}`;
  }, [questionParams, page, mode, trace]);

  const { data, isLoading, isValidating, error, mutate: revalidate } =
    useSWR<{ items: Row[]; total: number }>(listKey, {
      // SWR revalidates on window focus by default. Here that is not free: a
      // targeted search WRITES an audit_log.search row, so alt-tabbing away and
      // back would file a fresh "someone looked this person up" entry every
      // time and bury the real searches. The trail is history — it does not
      // change while you are reading it — so refresh is the explicit ลองใหม่.
      revalidateOnFocus: false,
      // Every filter / page step is a new key; hold the old rows on screen
      // instead of blanking back to a skeleton.
      keepPreviousData: true,
    });

  const summaryKey = window_
    ? `/audit-logs/summary?from=${encodeURIComponent(window_.from)}${window_.to ? `&to=${encodeURIComponent(window_.to)}` : ""}`
    : null;
  const { data: summary } = useSWR<Summary>(summaryKey, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: catalog } = useSWR<Catalog>("/audit-logs/catalog", { revalidateOnFocus: false });
  // Who is signed in changes by the minute, and reading it writes nothing.
  const { data: sessions } = useSWR<{ items: Session[]; current: string }>(
    mode === "simple" ? "/audit-logs/sessions" : null,
    { refreshInterval: 60_000 },
  );

  const actionLabel = useMemo(() => {
    const m = new Map((catalog?.actions ?? []).map(a => [a.action, a.label]));
    return (a: string) => m.get(a) ?? a;
  }, [catalog]);
  const actorName = useMemo(() => {
    const hit = (summary?.actors ?? []).find(a => a.id === expert.actor);
    return hit?.name || data?.items.find(r => r.actor_id === expert.actor)?.actor_name || "ผู้ใช้ที่เลือก";
  }, [summary, data, expert.actor]);

  const rangeDef = RANGES.find(r => r.id === range)!;

  // A new question, or a new page of the same one, is read from its top. Left
  // where it was, the view sat halfway down a list that had just been replaced.
  const listTop = useRef<HTMLDivElement>(null);
  const toListTop = useCallback(() => {
    window.requestAnimationFrame(() => listTop.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, []);
  const goToPage = useCallback((p: number) => { setPage(p); toListTop(); }, [toListTop]);

  const pickActor = useCallback((id: string) => {
    setTrace(null);
    setExpert(f => ({ ...f, actor: id }));
    setPage(1);
    toListTop();
  }, [toListTop]);
  const pickTrace = useCallback((t: Trace) => { setTrace(t); setPage(1); toListTop(); }, [toListTop]);
  const openRow = useCallback((r: Row) => setDetail(r), []);

  const pickAttention = (a: Attention) => {
    // One click from "something looks wrong" to the rows behind it. The other
    // filters are cleared: the item was counted over the whole window, and a
    // leftover category or search would show fewer rows than it promised.
    setTrace(null);
    setCategory("");
    setOnly("");
    setTyped("");
    setExpert({ ...NO_EXPERT_FILTERS, action: a.action, actor: a.actor_id ?? "" });
    setPage(1);
    toListTop();
  };

  const exportCsv = async () => {
    if (!questionParams) return;
    setExporting(true);
    try {
      const blob = await api.get<Blob>(`/audit-logs/export?${questionParams.toString()}`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `audit-log-${localDateISO()}.csv`;
      el.click();
      URL.revokeObjectURL(url);
      notify.success("ส่งออกไฟล์แล้ว การส่งออกครั้งนี้ถูกบันทึกไว้ในบันทึกการใช้งานด้วย");
    } catch (e) {
      notify.error(e);
    } finally {
      setExporting(false);
    }
  };

  // This screen needs the API that ships with it (migration 0130). Against a
  // backend still running the previous build, the summary has no event counts
  // and the rows have no wording — say so, rather than crash on the first
  // missing field.
  const staleApi =
    (summary !== undefined && (summary as Partial<Summary>).events === undefined) ||
    (data?.items?.[0] !== undefined && (data.items[0] as Partial<Row>).ref === undefined);

  const hasPinned = !!trace || !!expert.actor || !!expert.action;
  // The numbers on the chips count the whole window. Beside a search or a
  // pinned person they would promise more rows than the list below can show.
  const showCounts = !query && !only && !expert.actor && !expert.action;
  const loading = isLoading || (isValidating && !!data);

  if (staleApi) {
    return (
      <div>
        <PageHeader title="บันทึกการใช้งานระบบ" />
        <Alert
          status="warning"
          title="เซิร์ฟเวอร์หลังบ้านยังเป็นรุ่นเก่า"
          description="หน้านี้ต้องใช้ backend รุ่นใหม่ กรุณา restart backend (ระบบจะรัน migration 0130 ให้เอง) แล้วโหลดหน้านี้อีกครั้ง"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="บันทึกการใช้งานระบบ"
        description="ใครทำอะไร กับอะไร เมื่อไร จากเครื่องไหน ย้อนดูได้ทั้งหมด เก็บไว้ 5 ปี และแก้ไขย้อนหลังไม่ได้"
        actions={
          <div role="group" aria-label="รูปแบบการแสดงผล" className="flex gap-1 rounded-full border border-(--border) p-1">
            <Tip content="อ่านเป็นประโยค เรียงตามวัน เหมาะกับการดูภาพรวม">
              <button type="button" aria-pressed={mode === "simple"} onClick={() => setMode("simple")}
                className={modeClass(mode === "simple")}>
                <ListChecks size={14} /> ดูง่าย
              </button>
            </Tip>
            <Tip content="ทุกแถวที่เก็บไว้ พร้อมข้อมูลทางเทคนิค สำหรับผู้ดูแลระบบ">
              <button type="button" aria-pressed={mode === "expert"} onClick={() => setMode("expert")}
                className={modeClass(mode === "expert")}>
                <Search size={14} /> สืบสวน
              </button>
            </Tip>
          </div>
        }
      />

      {/* One bar for both views: when, and what to look for. */}
      <Panel className="mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="ช่วงเวลา"
            className="w-44"
            value={range}
            onChange={ask(setRange)}
            options={RANGES.map(r => ({ id: r.id, label: r.label }))}
          />
          {range === "custom" && (
            <>
              {/* The shared DatePicker's label is for screen readers only; two
                  unlabelled date boxes side by side do not say which is which. */}
              <div>
                <div className="mb-1 text-sm font-medium" aria-hidden>ตั้งแต่วันที่</div>
                <DatePicker label="ตั้งแต่วันที่" value={fromDate} onChange={ask(setFromDate)} maxValue={toDate} />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium" aria-hidden>ถึงวันที่</div>
                <DatePicker label="ถึงวันที่" value={toDate} onChange={ask(setToDate)}
                  minValue={fromDate} maxValue={localDateISO()} />
              </div>
            </>
          )}
          <SearchField
            value={typed}
            onChange={v => { setTyped(v); setPage(1); }}
            ariaLabel="ค้นหาในบันทึกการใช้งาน"
            placeholder="ชื่อคน รหัสวิชา คำที่เห็นในรายการ IP หรือเลขอ้างอิง AL-…"
            className="min-w-56 flex-1"
          />
          <Tip content="ดาวน์โหลดรายการตามตัวกรองนี้เป็นไฟล์ CSV เปิดด้วย Excel ได้ (สูงสุด 10,000 แถวต่อไฟล์)">
            <Button variant="outline" size="md" isPending={exporting} isDisabled={!questionParams}
              onPress={exportCsv}>
              <Download size={14} /> ส่งออก
            </Button>
          </Tip>
        </div>
        {!window_ && (
          <p className="mt-2 text-xs text-danger">วันสิ้นสุดอยู่ก่อนวันเริ่ม กรุณาเลือกช่วงวันใหม่</p>
        )}

        {hasPinned && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--border) pt-3 text-sm">
            <span className="text-xs text-(--ink-3)">กำลังดูเฉพาะ</span>
            {trace && (
              <Pinned onClear={() => { setTrace(null); setPage(1); }}>
                {trace.kind === "session" ? <KeyRound size={14} /> : trace.action ? <Layers size={14} /> : <Link2 size={14} />}
                {trace.kind === "session"
                  ? "ทุกอย่างในการเข้าระบบครั้งเดียวกัน"
                  : trace.action
                    ? `ทุกรายการของ “${actionLabel(trace.action)}” ที่เกิดในคราวเดียว`
                    : "ทุกอย่างที่เกิดพร้อมกันในครั้งเดียว"}
                {mode === "expert" && <code className="font-mono text-xs text-(--ink-3)">{trace.id.slice(0, 8)}</code>}
              </Pinned>
            )}
            {!trace && expert.actor && (
              <Pinned onClear={() => { setExpert(f => ({ ...f, actor: "" })); setPage(1); }}>
                <User size={14} /> ทุกอย่างที่ {actorName} ทำ
              </Pinned>
            )}
            {!trace && expert.action && (
              <Pinned onClear={() => { setExpert(f => ({ ...f, action: "" })); setPage(1); }}>
                {actionLabel(expert.action)}
              </Pinned>
            )}
            {trace && (
              <span className="text-xs text-(--ink-3)">ตัวกรองและช่วงเวลาถูกพักไว้ชั่วคราว</span>
            )}
          </div>
        )}
      </Panel>

      {mode === "simple" ? (
        <>
          <Overview
            summary={summary}
            sessions={sessions?.items}
            currentSession={sessions?.current}
            rangeLabel={rangeDef.phrase}
            onPick={pickAttention}
          />

          <div ref={listTop} className="scroll-mt-20" />
          <Panel data-tour="audit-table">
            {!trace && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <CategoryChip active={category === ""} onPress={() => ask(setCategory)("")}
                  label="ทุกหมวด" count={showCounts ? summary?.events : undefined} />
                {(summary?.categories ?? [])
                  .filter(c => c.events > 0 || c.id === category)
                  .map(c => {
                    const Icon = categoryIcon(c.id);
                    return (
                      <CategoryChip key={c.id} active={category === c.id}
                        onPress={() => ask(setCategory)(category === c.id ? "" : c.id)}
                        label={c.label} count={showCounts ? c.events : undefined} icon={<Icon size={13} />} />
                    );
                  })}
                <span className="mx-1 hidden h-5 w-px bg-(--border) sm:block" aria-hidden />
                {ONLY.map(o => (
                  <Tip key={o.id} content={o.tip}>
                    <button
                      type="button"
                      aria-pressed={only === o.id}
                      onClick={() => ask(setOnly)(only === o.id ? "" : o.id)}
                      className={chipClass(only === o.id)}
                    >
                      เฉพาะ{o.label}
                    </button>
                  </Tip>
                ))}
              </div>
            )}
            <Timeline
              rows={data?.items}
              total={data?.total ?? 0}
              page={page}
              pageSize={PAGE_SIZE}
              onPage={goToPage}
              loading={loading}
              error={error}
              onRetry={() => revalidate()}
              onOpen={openRow}
              onOpenBurst={r => (r.request_id
                ? pickTrace({ kind: "request", id: r.request_id, action: r.action })
                : openRow(r))}
            />
          </Panel>
        </>
      ) : (
        <div data-tour="audit-table" ref={listTop} className="scroll-mt-20">
          <InvestigateTable
            rows={data?.items}
            total={data?.total ?? 0}
            page={page}
            pageSize={PAGE_SIZE}
            loading={isLoading}
            error={error}
            onRetry={() => revalidate()}
            filters={expert}
            onFilters={f => { setTrace(null); setExpert(f); setPage(1); }}
            onPage={goToPage}
            catalog={catalog}
            actors={summary?.actors ?? []}
            onOpen={openRow}
            onTrace={pickTrace}
            onActor={pickActor}
          />
        </div>
      )}

      {detail && (
        <DetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onTrace={pickTrace}
          onActor={pickActor}
          technicalOpen={mode === "expert"}
        />
      )}
    </div>
  );
}

function modeClass(active: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--brand)",
    active ? "bg-(--brand) text-(--brand-fg)" : "text-(--ink-2) hover:bg-(--surface-2)",
  ].join(" ");
}

function chipClass(active: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--brand)",
    active
      ? "border-(--brand) bg-(--brand) text-(--brand-fg)"
      : "border-(--border) text-(--ink-2) hover:border-(--brand) hover:text-(--brand)",
  ].join(" ");
}

function CategoryChip({
  active, onPress, label, count, icon,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onPress} className={chipClass(active)}>
      {icon}
      {label}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "opacity-90" : "text-(--ink-3)"}`}>
          {count.toLocaleString("th-TH")}
        </span>
      )}
    </button>
  );
}

/** A question pinned over the filters, with the way back out next to it. */
function Pinned({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-(--brand-soft) py-1 pl-3 pr-1 text-xs font-medium text-(--brand)">
      {children}
      <button type="button" aria-label="เลิกดูเฉพาะรายการนี้" onClick={onClear}
        className="rounded-full p-0.5 hover:bg-(--brand) hover:text-(--brand-fg)">
        <X size={12} />
      </button>
    </span>
  );
}
