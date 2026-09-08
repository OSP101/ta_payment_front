"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Search, X, Link2, KeyRound, Copy, User, ShieldAlert, Eye, AlertTriangle } from "lucide-react";
import { PageHeader, Chip, TipWrap, Panel, Button, Modal } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { actionLabel, severityOf, SUMMARY_GROUPS, type Severity } from "./vocabulary";

/* -------------------------------------------------------------------------- *
 * The audit trail, as something you can actually investigate with.
 *
 * This page used to fetch the newest 200 rows and filter them in the browser.
 * That is a peek at the top of the table, not a search: a question like "what
 * did this account do on 3 September" could not be asked at all once 200 newer
 * rows existed, and no amount of client-side filtering could reach a row the
 * server never sent. Everything below is now answered in SQL.
 *
 * The two controls that make it a trail rather than a list are the per-row
 * "ตาม request" and "ตาม session" jumps: one click re-asks the server for every
 * other action the same HTTP request, or the same login session, performed.
 * -------------------------------------------------------------------------- */

interface Row {
  id: number;
  at: string;
  actor_id?: string | null;
  actor_name?: string;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  method?: string | null;
  path?: string | null;
  request_id?: string | null;
  session_id?: string | null;
  note?: string | null;
  before?: unknown;
  after?: unknown;
  /** Who or what entity_id refers to, resolved by the API. */
  subject_name?: string;
}

interface ActionCount {
  action: string;
  count: number;
  distinct_ips: number;
  distinct_actors: number;
}

interface Actor {
  id: string;
  name: string;
  role?: string;
  count: number;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้บริหาร",
  staff: "เจ้าหน้าที่",
  lecturer: "อาจารย์",
  ta: "ผู้ช่วยสอน",
};

const PAGE_SIZE = 50;

/** Time windows, as an investigation thinks about them. */
const RANGES: { id: string; label: string; hours: number | null }[] = [
  { id: "24h", label: "24 ชั่วโมง", hours: 24 },
  { id: "7d", label: "7 วัน", hours: 24 * 7 },
  { id: "30d", label: "30 วัน", hours: 24 * 30 },
  { id: "90d", label: "90 วัน", hours: 24 * 90 },
  { id: "all", label: "ทั้งหมด", hours: null },
];

/** "ทั้งหมด" is bounded rather than truly unbounded: the page count behind an
 *  unbounded query is a count over a table that only grows. Ten years is past
 *  the life of any record this system keeps. */
const ALL_HOURS = 24 * 365 * 10;

export default function AuditPage() {
  const [range, setRange] = useState("7d");
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  /** Whose history we are reading. The API always supported this; the screen
   *  never sent it, so "show me this person" meant pasting a uuid into search. */
  const [actorId, setActorId] = useState("");
  const [page, setPage] = useState(1);
  /** A pinned trace: every row from one request, or one session. */
  const [trace, setTrace] = useState<{ kind: "request" | "session"; id: string } | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);

  const from = useMemo(() => {
    const hours = RANGES.find(r => r.id === range)?.hours ?? ALL_HOURS;
    return new Date(Date.now() - hours * 3600_000).toISOString();
  }, [range]);

  const listKey = useMemo(() => {
    const p = new URLSearchParams({
      from,
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (query.trim()) p.set("q", query.trim());
    if (filterValues.role) p.set("role", filterValues.role);
    if (filterValues.action) p.set("action", filterValues.action);
    if (actorId) p.set("actor_id", actorId);
    // A trace overrides the filters: it is a different question, and leaving
    // the old ones applied would quietly hide part of the answer.
    if (trace) p.set(trace.kind === "request" ? "request_id" : "session_id", trace.id);
    return `/audit-logs?${p.toString()}`;
  }, [from, page, query, filterValues, trace, actorId]);

  const { data, isLoading, error, mutate: revalidate } =
    useSWR<{ items: Row[]; total: number }>(listKey, {
      // SWR revalidates on window focus by default. Here that is not free: a
      // targeted search WRITES an audit_log.search row, so alt-tabbing away and
      // back would file a fresh "someone looked this person up" entry every
      // time and bury the real searches. The trail is history — it does not
      // change while you are reading it — so refresh is the explicit ลองใหม่.
      revalidateOnFocus: false,
    });
  const { data: actions } = useSWR<{ items: string[] }>("/audit-logs/actions");
  // The overview strip. Same window as the table, so the numbers above and the
  // rows below always describe the same stretch of time.
  const { data: summary } = useSWR<{ actions: ActionCount[]; actors: Actor[] }>(
    `/audit-logs/summary?from=${encodeURIComponent(from)}`,
    { revalidateOnFocus: false },
  );

  const actionOptions = useMemo(() => [
    { id: "", label: "ทุกเหตุการณ์" },
    // The families first — these are what someone reaches for. The names were
    // already grouped by their dots; the server matches by prefix.
    ...[...new Set((actions?.items ?? []).map(a => a.split(".")[0]))]
      .sort()
      .map(f => ({ id: `${f}.`, label: `${actionLabel(`${f}.`)} (ทั้งกลุ่ม)` }))
      // Two prefixes can share a label (ta_doc / ta_docs both read "เอกสาร
      // ผู้ช่วยสอน"), and the dropdown then offers the same words twice with no
      // way to tell which is which. Keep the first.
      .filter((o, i, all) => all.findIndex(x => x.label === o.label) === i),
    ...(actions?.items ?? []).map(a => ({ id: a, label: actionLabel(a) })),
  ], [actions]);

  const columns = useMemo(
    () => buildColumns(setTrace, setDetail, id => { setActorId(id); setTrace(null); setPage(1); }),
    [],
  );

  const actorName = useMemo(
    () => (summary?.actors ?? []).find(a => a.id === actorId)?.name ?? actorId,
    [summary, actorId],
  );

  /** Any change to the question starts at page 1 — otherwise a narrower filter
   *  lands on page 7 of a 2-page result and the screen reads as empty. */
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div>
      <PageHeader
        title="บันทึกการใช้งานระบบ"
        description="ใครทำอะไร เมื่อไหร่ จากเครื่องไหน — ย้อนหลังได้ทั้งหมด เก็บไว้ 5 ปี"
      />

      <SummaryStrip
        summary={summary}
        activeGroup={filterValues.action ?? ""}
        onPick={(actionsOfGroup) => {
          // One click from "something looks wrong" to the rows behind it.
          setFilterValues(v => ({ ...v, action: actionsOfGroup }));
          setActorId("");
          setTrace(null);
          setPage(1);
        }}
      />

      {actorId && (
        <Panel className="mb-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <User size={16} />
            <span className="font-medium">กำลังดูประวัติของ {actorName}</span>
            <Button variant="ghost" size="sm" onPress={() => { setActorId(""); setPage(1); }}>
              <X size={14} /> ดูทุกคน
            </Button>
          </div>
        </Panel>
      )}

      {trace && (
        <Panel className="mb-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {trace.kind === "request" ? <Link2 size={16} /> : <KeyRound size={16} />}
            <span className="font-medium">
              {trace.kind === "request"
                ? "กำลังดูทุกอย่างที่ request นี้ทำ"
                : "กำลังดูทุกอย่างที่ session นี้ทำ"}
            </span>
            <code className="rounded bg-(--surface-2) px-1.5 py-0.5 font-mono text-xs">
              {trace.id}
            </code>
            <span className="text-xs text-(--ink-3)">
              · ตัวกรองอื่นถูกพักไว้ชั่วคราว
            </span>
            <Button variant="ghost" size="sm" onPress={() => { setTrace(null); setPage(1); }}>
              <X size={14} /> เลิกตาม
            </Button>
          </div>
        </Panel>
      )}

      <div data-tour="audit-table">
        <DataTable
          ariaLabel="Audit log"
          rows={data?.items}
          loading={isLoading}
          error={error}
          onRetry={() => revalidate()}
          rowKey={r => r.id}
          minWidth="1100px"
          // In server mode DataTable never calls searchFn — the API answers the
          // search — but its presence is what renders the search box at all.
          searchFn={r => r.action}
          searchPlaceholder="ค้นหาชื่อคน / เลขที่อยู่ IP / ข้อความในบันทึก…"
          filters={[
            {
              id: "range",
              placeholder: "ช่วงเวลา",
              options: RANGES.map(r => ({ id: r.id, label: r.label })),
              // Server-mode filters are answered by the query above; the
              // predicate is never called, but the prop is required.
              predicate: () => true,
            },
            {
              id: "role",
              placeholder: "ทุกบทบาท",
              options: [
                { id: "", label: "ทุกบทบาท" },
                ...Object.entries(ROLE_LABEL).map(([id, label]) => ({ id, label })),
              ],
              predicate: () => true,
            },
            {
              id: "action",
              placeholder: "ทุกเหตุการณ์",
              options: actionOptions,
              predicate: () => true,
            },
            {
              id: "actor",
              placeholder: "ทุกคน",
              // Built from who was ACTIVE in this window, not from the account
              // roster: a shorter list, ordered by who was busiest, and it
              // avoids the audit screen itself filing a "read everyone's
              // details" entry just by opening.
              options: [
                { id: "", label: "ทุกคน" },
                ...(summary?.actors ?? []).map(a => ({
                  id: a.id,
                  label: `${a.name || a.id.slice(0, 8)} (${a.count})`,
                })),
              ],
              predicate: () => true,
            },
          ]}
          pageSize={PAGE_SIZE}
          emptyTitle="ไม่พบรายการ"
          emptyDescription="ลองขยายช่วงเวลา หรือลดตัวกรองลง"
          columns={columns}
          server={{
            total: data?.total ?? 0,
            page,
            onPageChange: setPage,
            query,
            onQueryChange: reset(setQuery),
            // `range` lives alongside role/action in the same filter bar but is
            // read separately above, so it is merged in and out here.
            filterValues: { ...filterValues, range, actor: actorId },
            onFilterChange: reset((v: Record<string, string>) => {
              const { range: r, actor, ...rest } = v;
              setRange(r || "7d");
              setActorId(actor || "");
              setFilterValues(rest);
            }),
            sort: { column: "at", direction: "descending" },
            // The trail is always newest-first. Re-sorting a paged audit log by
            // another column would order only the rows on screen, which reads
            // as an answer and is not one.
            onSortChange: () => {},
          }}
        />
      </div>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} onTrace={setTrace} />}
    </div>
  );
}

function short(id?: string | null) {
  return id ? id.slice(0, 8) : "";
}

/** Chip tone per severity, so the same colour always means the same thing on
 *  this screen. */
const TONE: Record<Severity, "danger" | "warning" | "neutral"> = {
  danger: "danger",
  warn: "warning",
  normal: "neutral",
  quiet: "neutral",
};

function buildColumns(
  onTrace: (t: { kind: "request" | "session"; id: string }) => void,
  onOpen: (r: Row) => void,
  onActorHistory: (id: string) => void,
): DataColumn<Row>[] {
  return [
    {
      id: "at", label: "เวลา", isRowHeader: true,
      className: "whitespace-nowrap text-xs",
      render: r => {
        const d = new Date(r.at);
        return (
          <div className="leading-tight">
            <div>{d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</div>
            <div className="text-(--ink-3)">{d.toLocaleTimeString("th-TH")}</div>
          </div>
        );
      },
    },
    {
      // The headline of the row, and the thing the eye should land on. It used
      // to print the raw action name in monospace, which is an identifier for
      // the code that raises it and not a sentence anybody can read.
      id: "what", label: "เกิดอะไรขึ้น",
      render: r => {
        const sev = severityOf(r.action);
        const label = actionLabel(r.action);
        return (
          <div className="flex items-center gap-1.5">
            {sev === "danger" && <ShieldAlert size={14} className="shrink-0 text-danger" />}
            {sev === "warn" && <AlertTriangle size={14} className="shrink-0 text-warning" />}
            {sev === "quiet" && <Eye size={14} className="shrink-0 text-(--ink-4)" />}
            <TipWrap content={r.action}>
              <span className={sev === "quiet" ? "text-(--ink-3)" : "font-medium"}>{label}</span>
            </TipWrap>
          </div>
        );
      },
    },
    {
      id: "actor", label: "ใครทำ",
      render: r => (
        <span className="text-xs">
          {r.actor_role ? (
            <Chip tone="neutral">{ROLE_LABEL[r.actor_role] ?? r.actor_role}</Chip>
          ) : r.actor_id ? (
            <TipWrap content="รายการนี้บันทึกก่อนที่ระบบจะเก็บบทบาท">
              <span className="text-(--ink-3)">ไม่ระบุบทบาท</span>
            </TipWrap>
          ) : (
            <Chip tone="neutral">ระบบ</Chip>
          )}
          {r.actor_id && (
            <button
              type="button"
              className="ml-2 text-(--brand) underline decoration-dotted"
              title="ดูทุกอย่างที่คนนี้ทำ"
              onClick={() => onActorHistory(r.actor_id!)}
            >
              {r.actor_name || short(r.actor_id)}
            </button>
          )}
        </span>
      ),
    },
    {
      // Was a uuid fragment while the actor two columns left showed a real
      // name, which made "who looked at whose record" unreadable.
      id: "subject", label: "กับใคร / อะไร",
      className: "text-xs",
      render: r => {
        if (r.subject_name) return <span>{r.subject_name}</span>;
        if (!r.entity_id) return <span className="text-(--ink-4)">—</span>;
        return (
          <TipWrap content={r.entity_id}>
            <span className="text-(--ink-3)">{short(r.entity_id)}</span>
          </TipWrap>
        );
      },
    },
    {
      // Address only. The endpoint URL moved into the detail modal: it was the
      // largest block on every row, wrapped over three lines, and was the least
      // useful thing on the screen to the person reading it.
      id: "where", label: "จากเครื่อง",
      className: "whitespace-nowrap text-xs text-(--ink-3)",
      hideOnMobile: true,
      render: r => (r.ip ? <span>{r.ip}</span> : <span className="text-(--ink-4)">—</span>),
    },
    {
      id: "detail", label: "",
      className: "whitespace-nowrap text-right",
      render: r => (
        <div className="flex items-center justify-end gap-2">
          {r.request_id && (
            <TipWrap content="ดูทุกอย่างที่การกระทำครั้งนี้ทำ">
              <button type="button" className="text-(--ink-3) hover:text-(--brand)"
                onClick={() => onTrace({ kind: "request", id: r.request_id! })}>
                <Link2 size={14} />
              </button>
            </TipWrap>
          )}
          {r.session_id && (
            <TipWrap content="ดูทุกอย่างในการเข้าระบบครั้งนั้น">
              <button type="button" className="text-(--ink-3) hover:text-(--brand)"
                onClick={() => onTrace({ kind: "session", id: r.session_id! })}>
                <KeyRound size={14} />
              </button>
            </TipWrap>
          )}
          <button type="button" className="text-xs text-(--brand) underline decoration-dotted"
            onClick={() => onOpen(r)}>
            <Search size={12} className="inline" /> รายละเอียด
          </button>
        </div>
      ),
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * The overview strip — the answer to "is anything wrong?" before a single row
 * is read. Without it the only way to notice eight failed logins was to
 * recognise them while scrolling past, which nobody does.
 * -------------------------------------------------------------------------- */

function SummaryStrip({
  summary, activeGroup, onPick,
}: {
  summary?: { actions: ActionCount[]; actors: Actor[] };
  activeGroup: string;
  onPick: (actionFilter: string) => void;
}) {
  const byAction = useMemo(() => {
    const m = new Map<string, ActionCount>();
    for (const a of summary?.actions ?? []) m.set(a.action, a);
    return m;
  }, [summary]);

  const groups = SUMMARY_GROUPS.map(g => {
    let count = 0;
    let ips = 0;
    for (const a of g.actions) {
      const hit = byAction.get(a);
      if (hit) {
        count += hit.count;
        ips = Math.max(ips, hit.distinct_ips);
      }
    }
    return { ...g, count, ips };
  });

  const alarming = groups.some(g => g.count > 0 && (g.severity === "danger" || g.severity === "warn"));

  return (
    <Panel className="mb-3">
      {/* The headline verdict, in one sentence, before any number. */}
      <div className="mb-2 flex items-center gap-2 text-sm">
        {alarming ? (
          <>
            <ShieldAlert size={16} className="text-danger" />
            <span className="font-medium">มีเหตุการณ์ที่ควรตรวจสอบในช่วงนี้</span>
          </>
        ) : (
          <>
            <ShieldAlert size={16} className="text-success" />
            <span className="font-medium">ช่วงนี้ไม่พบเหตุการณ์ผิดปกติ</span>
          </>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map(g => {
          const on = g.count > 0;
          const selected = activeGroup === g.actions.join(",");
          return (
            <button
              key={g.id}
              type="button"
              disabled={!on}
              onClick={() => onPick(g.actions.join(","))}
              className={[
                "rounded-lg border p-2.5 text-left transition-colors",
                selected ? "border-(--brand) bg-(--surface-2)" : "border-(--border)",
                on ? "hover:bg-(--surface-2)" : "opacity-70",
              ].join(" ")}
            >
              <div className="text-xs text-(--ink-3)">{g.label}</div>
              <div
                className={[
                  "text-2xl font-semibold tabular-nums",
                  !on ? "text-(--ink-3)"
                    : g.severity === "danger" ? "text-danger"
                    : g.severity === "warn" ? "text-warning"
                    : "text-(--ink-1)",
                ].join(" ")}
              >
                {g.count}
              </div>
              <div className="text-xs text-(--ink-3)">
                {on ? g.detail(g.count, g.ips) : "ไม่มี"}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- *
 * Detail — the whole row, including the before/after that used to be squeezed
 * into a hover tooltip capped at 1,500 characters. A diff you cannot scroll or
 * copy is not evidence.
 * -------------------------------------------------------------------------- */

function DetailModal({
  row, onClose, onTrace,
}: {
  row: Row;
  onClose: () => void;
  onTrace: (t: { kind: "request" | "session"; id: string }) => void;
}) {
  const facts: [string, React.ReactNode][] = [
    ["เวลา", new Date(row.at).toLocaleString("th-TH")],
    // The sentence first, the identifier under it. The table shows only the
    // sentence; this is where someone who needs the raw name comes to find it.
    ["เกิดอะไรขึ้น", <span key="w" className="font-medium">{actionLabel(row.action)}</span>],
    ["ชื่อทางเทคนิค", <code key="a" className="font-mono text-xs">{row.action}</code>],
    ["กับใคร / อะไร", row.subject_name
      ? <span key="s">{row.subject_name} <code className="ml-1 font-mono text-xs text-(--ink-3)">{row.entity}</code></span>
      : <code key="e" className="font-mono text-xs">{row.entity} {row.entity_id ?? ""}</code>],
    ["ผู้กระทำ", row.actor_id
      ? `${row.actor_name || "-"} (${ROLE_LABEL[row.actor_role ?? ""] ?? row.actor_role ?? "ไม่ระบุบทบาท"})`
      : "ไม่มีผู้ใช้ — งานของระบบ"],
    ["Actor ID", <Mono key="ai" value={row.actor_id} />],
    ["IP", <Mono key="ip" value={row.ip} />],
    ["User agent", <span key="ua" className="break-all text-xs">{row.user_agent ?? "-"}</span>],
    ["Request", <Mono key="rq" value={row.request_id} />],
    ["Session", <Mono key="se" value={row.session_id} />],
    ["Endpoint", <Mono key="ep" value={row.method && row.path ? `${row.method} ${row.path}` : null} />],
    ["Note", <span key="n" className="break-all text-xs">{row.note ?? "-"}</span>],
  ];

  return (
    <Modal open onClose={onClose} size="2xl" title="รายละเอียดรายการ">
      <div className="space-y-4">
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-(--ink-3)">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          {row.request_id && (
            <Button variant="secondary" size="sm"
              onPress={() => { onTrace({ kind: "request", id: row.request_id! }); onClose(); }}>
              <Link2 size={14} /> ทุกอย่างที่ request นี้ทำ
            </Button>
          )}
          {row.session_id && (
            <Button variant="secondary" size="sm"
              onPress={() => { onTrace({ kind: "session", id: row.session_id! }); onClose(); }}>
              <KeyRound size={14} /> ทุกอย่างที่ session นี้ทำ
            </Button>
          )}
        </div>

        <DiffPane label="ก่อน" value={row.before} />
        <DiffPane label="หลัง" value={row.after} />
      </div>
    </Modal>
  );
}

function Mono({ value }: { value?: string | null }) {
  if (!value) return <span className="text-(--ink-4)">-</span>;
  return (
    <span className="flex items-center gap-1.5">
      <code className="break-all font-mono text-xs">{value}</code>
      <button
        type="button"
        title="คัดลอก"
        className="shrink-0 text-(--ink-4) hover:text-(--brand)"
        onClick={() => navigator.clipboard?.writeText(value)}
      >
        <Copy size={12} />
      </button>
    </span>
  );
}

/** Shown even when empty, and says WHY it is empty — "before" is null on almost
 *  every row today because most writers never recorded one, and a pane that
 *  simply vanished made that look like "nothing changed". */
function DiffPane({ label, value }: { label: string; value: unknown }) {
  const empty = value == null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-(--ink-3)">{label}</div>
      {empty ? (
        <div className="rounded border border-dashed border-(--border) px-3 py-2 text-xs text-(--ink-3)">
          ไม่มีข้อมูล — รายการประเภทนี้ยังไม่ได้บันทึกค่า{label}
        </div>
      ) : (
        <pre className="max-h-64 overflow-auto rounded bg-(--surface-2) p-3 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
