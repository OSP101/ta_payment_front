"use client";
import { useMemo } from "react";
import { KeyRound, Link2, Search } from "lucide-react";
import { Chip, Tip, TipWrap } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { RowBadges } from "./RowBadges";
import { useI18n, type TFn } from "../../lib/i18n/client";
import {
  NETWORK_LABEL, OUTCOME_LABEL, ROLE_LABEL, actorText, clockSeconds, dateStamp, subjectText,
  type Actor, type Catalog, type Row, type Trace,
} from "./types";

/* -------------------------------------------------------------------------- *
 * The investigation view: the same rows, unfolded and unsoftened.
 *
 * Every stored row is its own line here — a burst is 336 lines, in order, with
 * seconds — and each carries its reference, its raw action name, its address,
 * and the two jumps that make this a trail rather than a list: everything the
 * same HTTP request did, and everything the same login session did.
 * -------------------------------------------------------------------------- */

export interface ExpertFilters {
  role: string;
  category: string;
  outcome: string;
  action: string;
  actor: string;
}

export function InvestigateTable({
  rows, total, page, pageSize, loading, error, onRetry,
  filters, onFilters, onPage, catalog, actors,
  onOpen, onTrace, onActor, toolbarExtra,
}: {
  rows?: Row[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  filters: ExpertFilters;
  onFilters: (f: ExpertFilters) => void;
  onPage: (p: number) => void;
  catalog?: Catalog;
  actors: Actor[];
  onOpen: (r: Row) => void;
  onTrace: (t: Trace) => void;
  onActor: (id: string) => void;
  toolbarExtra?: React.ReactNode;
}) {
  const { t, intl } = useI18n();
  const columns = useMemo(() => buildColumns(onOpen, onTrace, onActor, t, intl), [onOpen, onTrace, onActor, t, intl]);

  const actionOptions = useMemo(() => {
    const cats = catalog?.categories ?? [];
    const order = new Map(cats.map((c, i) => [c.id, i]));
    const label = new Map(cats.map(c => [c.id, c.label]));
    const sorted = [...(catalog?.actions ?? [])].sort(
      (a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.label.localeCompare(b.label, "th"),
    );
    return [
      { id: "", label: t("ทุกเหตุการณ์") },
      ...sorted.map(a => ({
        id: a.action,
        // Two actions can share words; the category in front tells them apart.
        label: `${label.get(a.category) ?? a.category}: ${a.label}`,
      })),
    ];
  }, [catalog, t]);

  // An actor picked from a row may not be among the busiest in the window;
  // without an option for them the select would show as empty.
  const actorOptions = useMemo(() => {
    const opts = actors.map(a => ({
      id: a.id,
      label: `${a.name || a.id.slice(0, 8)} (${a.count.toLocaleString(intl)})`,
    }));
    if (filters.actor && !actors.some(a => a.id === filters.actor)) {
      opts.unshift({ id: filters.actor, label: t("ผู้ใช้ {id}", { id: filters.actor.slice(0, 8) }) });
    }
    return [{ id: "", label: t("ทุกคน") }, ...opts];
  }, [actors, filters.actor, t, intl]);

  return (
    <DataTable
      ariaLabel={t("บันทึกการใช้งาน แบบสืบสวน")}
      rows={rows}
      loading={loading}
      error={error}
      onRetry={onRetry}
      rowKey={r => r.id}
      minWidth="1120px"
      toolbarExtra={toolbarExtra}
      filters={[
        {
          id: "category",
          placeholder: t("ทุกหมวด"),
          options: [
            { id: "", label: t("ทุกหมวด") },
            ...(catalog?.categories ?? []).map(c => ({ id: c.id, label: c.label })),
          ],
          // Server mode: the API answers every filter. The predicate is never
          // called, but the prop is required.
          predicate: () => true,
        },
        {
          id: "outcome",
          placeholder: t("ทุกผลลัพธ์"),
          options: [
            { id: "", label: t("ทุกผลลัพธ์") },
            { id: "ok", label: t(OUTCOME_LABEL.ok) },
            { id: "failed", label: t(OUTCOME_LABEL.failed) },
            { id: "denied", label: t(OUTCOME_LABEL.denied) },
          ],
          predicate: () => true,
        },
        {
          id: "role",
          placeholder: t("ทุกบทบาท"),
          options: [
            { id: "", label: t("ทุกบทบาท") },
            ...["admin", "staff", "lecturer", "ta"].map(id => ({ id, label: t(ROLE_LABEL[id]) })),
          ],
          predicate: () => true,
        },
        { id: "action", placeholder: t("ทุกเหตุการณ์"), options: actionOptions, predicate: () => true },
        { id: "actor", placeholder: t("ทุกคน"), options: actorOptions, predicate: () => true },
      ]}
      pageSize={pageSize}
      emptyTitle={t("ไม่พบรายการ")}
      emptyDescription={t("ลองขยายช่วงเวลา หรือลดตัวกรองลง")}
      columns={columns}
      server={{
        total,
        page,
        onPageChange: onPage,
        // The search box lives in the bar above both views, so this table has
        // none of its own.
        query: "",
        onQueryChange: () => {},
        filterValues: { ...filters },
        onFilterChange: v => onFilters({
          role: v.role ?? "", category: v.category ?? "", outcome: v.outcome ?? "",
          action: v.action ?? "", actor: v.actor ?? "",
        }),
        sort: { column: "at", direction: "descending" },
        // The trail is always newest-first. Re-sorting a paged audit log by
        // another column would order only the rows on screen, which reads as
        // an answer and is not one.
        onSortChange: () => {},
      }}
    />
  );
}

function buildColumns(
  onOpen: (r: Row) => void,
  onTrace: (t: Trace) => void,
  onActor: (id: string) => void,
  t: TFn,
  intl: string,
): DataColumn<Row>[] {
  return [
    {
      id: "ref", width: 110, label: t("อ้างอิง"), isRowHeader: true,
      className: "whitespace-nowrap font-mono text-xs",
      render: r => (
        <button type="button" className="text-(--brand) underline decoration-dotted" onClick={() => onOpen(r)}>
          {r.ref}
        </button>
      ),
    },
    {
      id: "at", width: 150, label: t("เวลา"),
      className: "whitespace-nowrap text-xs",
      render: r => (
        <div className="leading-tight tabular-nums">
          <div>{dateStamp(r.at, intl)}</div>
          <div className="text-(--ink-3)">{clockSeconds(r.at, intl)}</div>
        </div>
      ),
    },
    {
      id: "what", width: 260, label: t("เหตุการณ์"),
      className: "min-w-64",
      render: r => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-medium">{r.label}</span>
            <RowBadges row={r} />
          </div>
          <div className="font-mono text-[11px] text-(--ink-3)">{r.action}</div>
        </div>
      ),
    },
    {
      id: "actor", width: 180, label: t("ผู้กระทำ"),
      className: "whitespace-nowrap",
      render: r => (
        <span className="text-xs">
          {r.actor_id ? (
            <>
              <Tip content={t("ดูทุกอย่างที่คนนี้ทำ")}>
                <button type="button" className="text-(--brand) underline decoration-dotted"
                  onClick={() => onActor(r.actor_id!)}>
                  {r.actor_name || r.actor_id.slice(0, 8)}
                </button>
              </Tip>
              <span className="ml-1.5">
                {r.actor_role
                  ? <Chip tone="neutral">{ROLE_LABEL[r.actor_role] ? t(ROLE_LABEL[r.actor_role]) : r.actor_role}</Chip>
                  : <TipWrap content={t("รายการนี้บันทึกก่อนที่ระบบจะเก็บบทบาท")} inline>
                      <span className="text-(--ink-3)">{t("ไม่ระบุบทบาท")}</span>
                    </TipWrap>}
              </span>
            </>
          ) : (
            <span className="text-(--ink-3)">{actorText(r, t)}</span>
          )}
        </span>
      ),
    },
    {
      id: "subject", width: 200, label: t("เกี่ยวกับ"),
      className: "min-w-52 text-xs",
      render: r => {
        const s = subjectText(r);
        return (
          <div className="min-w-0">
            {s ? <div>{s}</div> : !r.entity_id && <span className="text-(--ink-4)">{t("ไม่มี")}</span>}
            {r.entity_id && (
              <TipWrap content={`${r.entity} ${r.entity_id}`} inline>
                <span className="font-mono text-[11px] text-(--ink-3)">
                  {r.entity} {r.entity_id.slice(0, 8)}
                </span>
              </TipWrap>
            )}
          </div>
        );
      },
    },
    {
      id: "where", width: 140, label: t("จากที่ไหน"),
      className: "whitespace-nowrap text-xs",
      hideOnMobile: true,
      render: r => (
        r.ip ? (
          <TipWrap content={[r.device, r.network && NETWORK_LABEL[r.network] ? t(NETWORK_LABEL[r.network]) : ""].filter(Boolean).join(" · ")} inline>
            <span className="leading-tight">
              <span className="block font-mono">{r.ip}</span>
              <span className="block text-(--ink-3)">{r.device || t("ไม่ทราบอุปกรณ์")}</span>
            </span>
          </TipWrap>
        ) : <span className="text-(--ink-4)">{t("ไม่ได้บันทึก")}</span>
      ),
    },
    {
      id: "detail", width: 80, label: "",
      className: "whitespace-nowrap text-right",
      render: r => (
        <div className="flex items-center justify-end gap-2.5">
          {r.request_id && (
            <Tip content={t("ทุกอย่างที่ request เดียวกันนี้ทำ")}>
              <button type="button" aria-label={t("ตาม request")} className="text-(--ink-3) hover:text-(--brand)"
                onClick={() => onTrace({ kind: "request", id: r.request_id! })}>
                <Link2 size={14} />
              </button>
            </Tip>
          )}
          {r.session_id && (
            <Tip content={t("ทุกอย่างใน session (การเข้าระบบ) เดียวกัน")}>
              <button type="button" aria-label={t("ตาม session")} className="text-(--ink-3) hover:text-(--brand)"
                onClick={() => onTrace({ kind: "session", id: r.session_id! })}>
                <KeyRound size={14} />
              </button>
            </Tip>
          )}
          <Tip content={t("รายละเอียดและข้อมูลดิบ")}>
            <button type="button" aria-label={t("รายละเอียด")} className="text-(--ink-3) hover:text-(--brand)"
              onClick={() => onOpen(r)}>
              <Search size={14} />
            </button>
          </Tip>
        </div>
      ),
    },
  ];
}
