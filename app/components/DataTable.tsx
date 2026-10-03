"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Pagination, Table, type SortDescriptor,
} from "@heroui/react";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { EmptyState, SearchField, SelectField, Spinner, Alert, Button, IconButton, type SelectOption } from "./ui";

// Skeleton placeholders shown while the first page of data is still in
// flight (rows === undefined): a spinner-then-pop-in reads as a flash
// (กระพริบ/วูบวาป — the reported symptom). The table draws its placeholder
// rows in the real columns (see Table.Body below); cards use this.
function CardRowsSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="rounded-lg border border-(--hairline) bg-surface p-3">
          <div className="h-4 w-2/3 skel rounded bg-surface-secondary" />
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="h-3 w-full skel rounded bg-surface-secondary" />
            <div className="h-3 w-1/2 skel rounded bg-surface-secondary" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// React Aria's column width: px, "120" or a share like "1fr".
type ColumnSize = number | `${number}` | `${number}%` | `${number}fr`;

/** The table's scrolling box: HeroUI's resizable container when columns can
 *  be dragged (it scrolls too), the plain scroll container otherwise. */
function TableFrame({ resizable, onResize, onResizeEnd, children }: {
  resizable: boolean;
  onResize: (w: Map<React.Key, number | string>) => void;
  onResizeEnd: (w: Map<React.Key, number | string>) => void;
  children: React.ReactNode;
}) {
  if (!resizable) return <Table.ScrollContainer>{children}</Table.ScrollContainer>;
  return (
    <Table.ResizableContainer onResize={onResize} onResizeEnd={onResizeEnd}>
      {children}
    </Table.ResizableContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* DataTable — reusable HeroUI table with search / filters / sort / pagination */
/* -------------------------------------------------------------------------- */

export interface DataColumn<T> {
  id: string;
  label: React.ReactNode;
  sortable?: boolean;
  isRowHeader?: boolean;
  /** Extra classes for body cells (e.g. "text-right", "whitespace-nowrap"). */
  className?: string;
  /** Extra classes for the header cell. Defaults to className when unset. */
  headerClassName?: string;
  render: (row: T) => React.ReactNode;
  /** Required when sortable — value used for comparison. */
  sortValue?: (row: T) => string | number;
  /**
   * Leave this column out of the phone card. For columns that only make sense
   * beside their neighbours — a raw id, a duplicate of the title — where a
   * card would spend a whole line on something nobody reads on a phone.
   */
  hideOnMobile?: boolean;
  /** Shorter label for the card, when the table heading is a sentence. */
  mobileLabel?: React.ReactNode;
  /** Relative starting width (≈px at a 1,100px table) when `resizable`:
   *  columns share the table's width in these proportions and grow with the
   *  screen. Default 120. */
  width?: number;
  /** Narrowest the column may be dragged, in px (resizable tables). */
  minWidth?: number;
}

export interface DataFilter<T> {
  id: string;
  /** Placeholder shown when nothing selected (acts as the filter name). */
  placeholder: string;
  /** First option should be the "all" choice with id "". */
  options: SelectOption[];
  predicate: (row: T, value: string) => boolean;
  className?: string;
}

/**
 * Hands search / filters / sort / paging to the caller so they can be answered
 * by the API instead of the browser.
 *
 * Once a list is paged, these four cannot stay split across the two sides. A
 * filter applied after slicing returns a short page; a sort applied after
 * slicing orders only the rows that happen to be on screen, so "page 1 of a
 * name sort" is not the first names at all. When `server` is set the table
 * renders `rows` verbatim as the current page and trusts `total` for the
 * summary and the page count.
 */
export interface DataTableServer {
  /** Total matching rows on the server — NOT the length of the current page. */
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filterValues: Record<string, string>;
  onFilterChange: (values: Record<string, string>) => void;
  sort?: SortDescriptor;
  onSortChange: (sort: SortDescriptor) => void;
}

interface DataTableProps<T> {
  ariaLabel: string;
  columns: DataColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  /** Enables the search box; return the haystack text for a row. */
  searchFn?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: DataFilter<T>[];
  /** Preselect specific filter values on first mount (keyed by filter id). */
  initialFilterValues?: Record<string, string>;
  pageSize?: number;
  initialSort?: SortDescriptor;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  /** A fetch error (e.g. SWR `error`). When set and no rows are loaded, an
   *  error state with a retry button replaces the table. */
  error?: unknown;
  /** Called when the user clicks "ลองใหม่" in the error state. */
  onRetry?: () => void;
  /** Extra toolbar content rendered to the right of search/filters. */
  toolbarExtra?: React.ReactNode;
  /**
   * Minimum table width (any CSS length). Below this the ScrollContainer
   * scrolls horizontally instead of squeezing columns until the text wraps to
   * three lines. Set it on wide tables — omit for tables that fit anywhere.
   */
  minWidth?: string;
  /** Set to page/filter/sort on the server instead of in the browser. */
  server?: DataTableServer;
  /**
   * Columns get a drag handle on their right edge (HeroUI column resizing).
   * Widths start from each column's `width` — fixed, so the layout no longer
   * jumps when the rows arrive — and what the user drags is remembered in
   * this browser, per table (keyed by ariaLabel). On by default for every
   * table (03/10/2026); pass false to opt out.
   */
  resizable?: boolean;
}

// React Aria selection keys must be non-empty; callers use "" for the
// "no filter" option and it is swapped for this sentinel internally.
const ALL_KEY = "__all__";

function pageItems(total: number, current: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export function DataTable<T>({
  ariaLabel, columns, rows, rowKey,
  searchFn, searchPlaceholder = "ค้นหา…",
  filters, initialFilterValues, pageSize = 10, initialSort,
  emptyTitle = "ไม่มีข้อมูล", emptyDescription,
  loading, error, onRetry, toolbarExtra, minWidth, server, resizable = true,
}: DataTableProps<T>) {
  // v2: widths became proportional (03/10/2026); v1 saved fixed px for every
  // column, which no longer filled a wide screen.
  const widthsKey = `datatable-widths:v2:${ariaLabel}`;
  const [widths, setWidths] = useState<Record<string, number | string>>({});
  // Saved widths are read after mount: the server render has no localStorage,
  // and reading it during render would make the first client render differ.
  useEffect(() => {
    if (!resizable) return;
    try {
      const saved = JSON.parse(localStorage.getItem(widthsKey) ?? "null");
      if (saved && typeof saved === "object") setWidths(saved);
    } catch { /* private window / blocked storage: defaults it is */ }
  }, [resizable, widthsKey]);
  const toRecord = (m: Map<React.Key, number | string>) =>
    Object.fromEntries([...m].map(([k, v]) => [String(k), v]));
  const [localQuery, setLocalQuery] = useState("");
  const [localFilterValues, setLocalFilterValues] = useState<Record<string, string>>(initialFilterValues ?? {});
  // If the caller resolves initial values asynchronously (e.g. after an SWR
  // fetch), apply them the first time they arrive — but only once, so we don't
  // overwrite user changes on subsequent renders.
  const appliedInitRef = useState({ done: !!initialFilterValues })[0];
  useEffect(() => {
    if (appliedInitRef.done || !initialFilterValues) return;
    appliedInitRef.done = true;
    setLocalFilterValues(initialFilterValues);
  }, [initialFilterValues, appliedInitRef]);
  const [localSort, setLocalSort] = useState<SortDescriptor | undefined>(initialSort);
  const [localPage, setLocalPage] = useState(1);

  // One set of names for the toolbar and footer to read, wired to either the
  // caller (server mode) or this component's own state.
  const query = server ? server.query : localQuery;
  const filterValues = server ? server.filterValues : localFilterValues;
  const sort = server ? server.sort : localSort;
  const page = server ? server.page : localPage;
  const setQuery = server ? server.onQueryChange : setLocalQuery;
  const setSort = server ? server.onSortChange : setLocalSort;

  // `rows` may be undefined while loading or null when the server returns a
  // JSON null for an empty slice — either way, treat both as an empty list.
  const safeRows = rows ?? [];
  const rowsLoaded = rows !== undefined && rows !== null;
  // `undefined` means the first response hasn't landed, whether or not the
  // caller also passed `loading` — so the skeleton shows instead of flashing
  // "ไม่มีข้อมูล" first. `null` is a loaded empty slice and gets the empty state.
  const firstLoad = !rowsLoaded && (!!loading || (rows === undefined && !error));

  const filtered = useMemo(() => {
    // In server mode `rows` IS the page — already filtered, sorted and sliced
    // by the API. Doing any of it again here would filter a page down to fewer
    // rows than the footer promises and sort only within it.
    if (server) return safeRows;
    let out = safeRows;
    const q = localQuery.trim().toLowerCase();
    if (searchFn && q) {
      out = out.filter(r => searchFn(r).toLowerCase().includes(q));
    }
    for (const f of filters ?? []) {
      const v = localFilterValues[f.id] ?? "";
      if (v !== "") out = out.filter(r => f.predicate(r, v));
    }
    if (localSort?.column) {
      const col = columns.find(c => c.id === localSort.column);
      if (col?.sortValue) {
        const dir = localSort.direction === "descending" ? -1 : 1;
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb), "th") * dir;
        });
      }
    }
    return out;
  }, [server, safeRows, localQuery, localFilterValues, localSort, columns, searchFn, filters]);

  const total = server ? server.total : filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  // Reset to page 1 only when the query or filters change — NOT when `total`
  // shifts due to a background revalidation, which would yank the user off
  // their current page. `safePage` already clamps when the list shrinks.
  // Server mode owns its own page state, so the caller does this reset.
  useEffect(() => {
    if (server) return;
    setLocalPage(1);
  }, [localQuery, localFilterValues, server]);

  const setPage = (next: number) => {
    if (server) server.onPageChange(next);
    else setLocalPage(next);
  };

  const start = (safePage - 1) * pageSize;
  // Server mode already sliced; slicing again would blank every page past 1,
  // because `rows` is indexed from 0 no matter which page it holds.
  const pageRows = server ? filtered : filtered.slice(start, start + pageSize);

  // A load error with nothing already on screen: show a clear error + retry
  // instead of a misleading "ไม่มีข้อมูล" empty state.
  const showError = !!error && !rowsLoaded;

  const hasToolbar = !!searchFn || (filters?.length ?? 0) > 0 || !!toolbarExtra;
  const hasQuery = !!query || Object.values(filterValues).some(Boolean);

  // Card layout: the row header is the card's title, everything else is a
  // labelled line under it.
  const cardColumns = columns.filter(c => !c.hideOnMobile);
  const cardTitleColumn = cardColumns.find(c => c.isRowHeader) ?? cardColumns[0] ?? columns[0];
  const mobileSortOptions: SelectOption[] = columns
    .filter(c => c.sortable && c.sortValue)
    .map(c => ({ id: c.id, label: c.mobileLabel ?? c.label, textValue: typeof c.label === "string" ? c.label : c.id }));
  // When we already have rows on screen and a fresh fetch is in flight, we show
  // a translucent overlay instead of wiping the table — keeps context so the
  // user doesn't lose their scroll / selection while data refreshes.
  const showRefetchOverlay = !!loading && rowsLoaded && safeRows.length > 0;

  // Columns fit their content (office, 03/10/2026): nothing wraps and
  // nothing is cut with "…". Each column's natural width — its widest cell
  // or its heading, on one line — is measured before the browser paints, and
  // becomes both the column's minimum and its share of the table. A wide
  // screen spreads the spare room in those proportions; a narrow one scrolls
  // sideways. A dragged column keeps its px but cannot go below its content;
  // the last column (no handle) keeps its share, so the table still fills.
  //
  // React Aria puts the rows into the DOM a commit after this component
  // renders, so measuring in a layout effect saw only the headers. A
  // MutationObserver measures when the rows actually land; its callback runs
  // before the browser paints, and flushSync applies the widths right there
  // (twice: React Aria also takes changed column widths a render late), so
  // the first painted frame already has them — no jump.
  const tableRef = useRef<HTMLDivElement>(null);
  const columnSet = columns.map(c => c.id).join("|");
  const [fit, setFit] = useState<Record<string, number>>({});
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    if (!resizable) return;
    const root = tableRef.current;
    if (!root) return;
    const measure = () => {
      const td = root.querySelector("tbody td");
      const th = root.querySelector("thead th");
      const pad = (el: Element | null) => {
        if (!el) return 24;
        const cs = getComputedStyle(el);
        return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      };
      const cellPad = pad(td), headPad = pad(th) + 28; // + sort arrow and drag handle
      const next: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-dt-col]").forEach(el => {
        const id = el.dataset.dtCol!;
        next[id] = Math.max(next[id] ?? 0, Math.ceil(el.getBoundingClientRect().width + cellPad));
      });
      root.querySelectorAll<HTMLElement>("[data-dt-head]").forEach(el => {
        const id = el.dataset.dtHead!;
        next[id] = Math.max(next[id] ?? 0, Math.ceil(el.getBoundingClientRect().width + headPad));
      });
      return next;
    };
    // Only ever widen: paging to rows with shorter text must not make the
    // columns jump narrower under the reader.
    const grow = (prev: Record<string, number>, next: Record<string, number>) => {
      let grew = false;
      const out = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v > (out[k] ?? 0)) { out[k] = v; grew = true; }
      }
      return grew ? out : prev;
    };
    // A new set of columns (e.g. the users table hiding the TA-only ones
    // under a role filter) starts over: measure afresh instead of widening,
    // and scroll back to the left edge. Inside this layout effect a plain
    // update already lands before paint.
    setFit(measure());
    const scroller = root.querySelector(".table__resizable-container");
    if (scroller) scroller.scrollLeft = 0;
    const mo = new MutationObserver(() => {
      const next = measure();
      flushSync(() => setFit(prev => grow(prev, next)));
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [resizable, columnSet]);
  // React Aria takes changed column widths one render late; one more render
  // whenever the measured widths change applies them before the paint.
  const fitSig = Object.entries(fit).map(([k, v]) => `${k}:${v}`).join(",");
  useLayoutEffect(() => {
    if (resizable) bump(n => n + 1);
  }, [resizable, fitSig]);
  const sizeProps = (c: DataColumn<T>) => {
    if (!resizable) return {};
    const natural = fit[c.id] ?? c.width ?? 120;
    return {
      width: (widths[c.id] ?? `${natural}fr`) as ColumnSize,
      minWidth: Math.max(c.minWidth ?? 0, fit[c.id] ?? 60),
    };
  };
  // Every column but the last: dragging the last edge would only widen the
  // table past its container.
  const resizer = (c: DataColumn<T>) =>
    resizable && c !== columns[columns.length - 1] ? <Table.ColumnResizer /> : null;

  return (
    <div className="flex flex-col gap-4">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchFn && (
            <SearchField
              value={query}
              onChange={setQuery}
              ariaLabel={searchPlaceholder}
              placeholder={searchPlaceholder}
            />
          )}
          {(filters ?? []).map(f => (
            <SelectField
              key={f.id}
              placeholder={f.placeholder}
              value={(filterValues[f.id] ?? "") === "" ? ALL_KEY : filterValues[f.id]}
              onChange={v => {
                const next = { ...filterValues, [f.id]: v === ALL_KEY ? "" : v };
                if (server) server.onFilterChange(next);
                else setLocalFilterValues(next);
              }}
              options={f.options.map(o => (o.id === "" ? { ...o, id: ALL_KEY } : o))}
              className={f.className ?? "min-w-44"}
            />
          ))}
          {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      {showError ? (
        <Alert
          status="danger"
          title="โหลดข้อมูลไม่สำเร็จ"
          description={error instanceof Error ? error.message : "กรุณาลองใหม่อีกครั้ง"}
          action={onRetry && <Button variant="secondary" size="sm" onPress={onRetry}>ลองใหม่</Button>}
        />
      ) : (
      <div className="relative" aria-busy={!!loading}>
        {/* Phones get cards, not a table.
            A table narrower than its columns is not a table any more: names
            wrap to four lines, most columns sit off-screen behind a sideways
            scroll nobody discovers, and the header that says what a value
            means scrolls away from the value. A card per row puts every field
            beside its own label and reads down the page like everything else
            on a phone. Same rows, same page, same order — only the shape
            differs, so nothing here can disagree with the table. */}
        <div className="sm:hidden">
          {mobileSortOptions.length > 1 && total > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <SelectField
                placeholder="เรียงตาม"
                value={String(sort?.column ?? mobileSortOptions[0].id)}
                onChange={v => setSort({ column: v, direction: sort?.direction ?? "ascending" })}
                options={mobileSortOptions}
                className="flex-1 min-w-0"
              />
              <IconButton
                variant="secondary"
                size="sm"
                // The label names what pressing does, not what the list is doing
                // now — it matches the icon, which points at the next state.
                label={sort?.direction === "descending" ? "เรียงจากน้อยไปมาก" : "เรียงจากมากไปน้อย"}
                onPress={() => setSort({
                  column: sort?.column ?? mobileSortOptions[0].id,
                  direction: sort?.direction === "descending" ? "ascending" : "descending",
                })}
              >
                {sort?.direction === "descending" ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
              </IconButton>
            </div>
          )}

          {pageRows.length === 0 ? (
            firstLoad ? (
              <CardRowsSkeleton />
            ) : (
              <EmptyState
                title={hasQuery ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : emptyTitle}
                description={hasQuery ? "ลองปรับคำค้นหาหรือตัวกรอง" : emptyDescription}
              />
            )
          ) : (
            <ul className="flex flex-col gap-2">
              {pageRows.map(row => {
                const rest = cardColumns.filter(c => c !== cardTitleColumn);
                return (
                  <li key={rowKey(row)} className="rounded-lg border border-(--hairline) bg-surface p-3">
                    <div className="text-sm font-semibold text-foreground">
                      {cardTitleColumn.render(row)}
                    </div>
                    <dl className="mt-2 flex flex-col gap-1.5 empty:mt-0">
                      {rest.map(c => {
                        const v = c.render(row);
                        // A blank cell is a blank line on a card; drop it.
                        if (v === null || v === undefined || v === false || v === "") return null;
                        return (
                          <div key={c.id} className="flex items-start justify-between gap-3">
                            <dt className="shrink-0 text-xs text-muted pt-0.5">{c.mobileLabel ?? c.label}</dt>
                            <dd className="min-w-0 text-sm text-foreground text-right">{v}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="hidden sm:block" ref={tableRef}>
      <Table>
        <TableFrame
          resizable={!!resizable}
          onResize={m => setWidths(toRecord(m))}
          onResizeEnd={m => {
            try { localStorage.setItem(widthsKey, JSON.stringify(toRecord(m))); } catch { /* not saved */ }
          }}
        >
          <Table.Content
            aria-label={ariaLabel}
            sortDescriptor={sort}
            onSortChange={setSort}
            style={minWidth ? { minWidth } : undefined}
          >
            <Table.Header>
              {columns.map(c =>
                c.sortable ? (
                  <Table.Column
                    key={c.id} id={c.id} isRowHeader={c.isRowHeader}
                    className={`whitespace-nowrap ${c.headerClassName ?? ""}`} allowsSorting
                    {...sizeProps(c)}
                  >
                    {({ sortDirection }) => (
                      <>
                        <Table.SortableColumnHeader sortDirection={sortDirection}>
                          <span data-dt-head={c.id}>{c.label}</span>
                        </Table.SortableColumnHeader>
                        {resizer(c)}
                      </>
                    )}
                  </Table.Column>
                ) : (
                  <Table.Column
                    key={c.id} id={c.id} isRowHeader={c.isRowHeader}
                    className={`whitespace-nowrap ${c.headerClassName ?? ""}`}
                    {...sizeProps(c)}
                  >
                    <span data-dt-head={c.id}>{c.label}</span>
                    {resizer(c)}
                  </Table.Column>
                ),
              )}
            </Table.Header>
            <Table.Body
              renderEmptyState={() =>
                firstLoad ? null : (
                  <EmptyState
                    title={hasQuery ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : emptyTitle}
                    description={hasQuery ? "ลองปรับคำค้นหาหรือตัวกรอง" : emptyDescription}
                  />
                )
              }
            >
              {firstLoad && pageRows.length === 0 && Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
                // Placeholder rows in the real columns: the table keeps its
                // shape while the first page loads instead of popping from a
                // blank box into rows (กระพริบ).
                <Table.Row key={`skel-${i}`} id={`skel-${i}`} aria-hidden>
                  {columns.map((c, j) => (
                    <Table.Cell key={c.id}>
                      <div className="skel h-3.5 rounded bg-surface-secondary" style={{ width: `${55 + ((i * 7 + j * 13) % 40)}%` }} />
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
              {pageRows.map(row => (
                <Table.Row key={rowKey(row)} id={rowKey(row)}>
                  {columns.map(c => (
                    <Table.Cell key={c.id} className={`whitespace-nowrap ${c.className ?? ""}`}>
                      {/* Measured for the column's natural width (see `fit`). */}
                      <span data-dt-col={c.id} className="inline-block whitespace-nowrap align-middle">{c.render(row)}</span>
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </TableFrame>
      </Table>
        </div>

        {total > 0 && (
          <div className="mt-3 border-t border-(--hairline) pt-3">
            <Pagination size="sm" className="w-full justify-between gap-2">
              <Pagination.Summary className="text-xs sm:text-sm">
                {start + 1}–{Math.min(start + pageSize, total)} จาก {total} รายการ
              </Pagination.Summary>
              {totalPages > 1 && (
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={safePage === 1}
                      onPress={() => setPage(Math.max(1, safePage - 1))}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {pageItems(totalPages, safePage).map((p, i) =>
                    p === "…" ? (
                      <Pagination.Item key={`e${i}`} className="hidden sm:block">
                        <Pagination.Ellipsis />
                      </Pagination.Item>
                    ) : (
                      // Numbered pages need a row of small targets. On a phone
                      // that row is the widest thing in the footer, so only the
                      // current page stays and the arrows do the moving.
                      <Pagination.Item key={p} className={p === safePage ? "" : "hidden sm:block"}>
                        <Pagination.Link isActive={p === safePage} onPress={() => setPage(p)}>
                          {p}
                        </Pagination.Link>
                      </Pagination.Item>
                    ),
                  )}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={safePage === totalPages}
                      onPress={() => setPage(Math.min(totalPages, safePage + 1))}
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              )}
            </Pagination>
          </div>
        )}
      {showRefetchOverlay && (
        <div
          className="pointer-events-none absolute inset-0 flex items-start justify-center pt-6 bg-surface/55 backdrop-blur-[1px] rounded-lg"
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-(--hairline) bg-surface/95 px-3 py-1.5 text-xs text-(--ink-2) shadow-sm">
            <Spinner size="sm" />
            กำลังโหลดข้อมูล…
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
