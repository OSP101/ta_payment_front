"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Pagination, Table, type SortDescriptor,
} from "@heroui/react";
import { EmptyState, SearchField, SelectField, Spinner, Alert, Button, type SelectOption } from "./ui";

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
  render: (row: T) => React.ReactNode;
  /** Required when sortable — value used for comparison. */
  sortValue?: (row: T) => string | number;
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
  loading, error, onRetry, toolbarExtra, minWidth, server,
}: DataTableProps<T>) {
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
  // When we already have rows on screen and a fresh fetch is in flight, we show
  // a translucent overlay instead of wiping the table — keeps context so the
  // user doesn't lose their scroll / selection while data refreshes.
  const showRefetchOverlay = !!loading && rowsLoaded && safeRows.length > 0;

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
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={ariaLabel}
            sortDescriptor={sort}
            onSortChange={setSort}
            style={minWidth ? { minWidth } : undefined}
          >
            <Table.Header>
              {columns.map(c =>
                c.sortable ? (
                  <Table.Column key={c.id} id={c.id} isRowHeader={c.isRowHeader} allowsSorting>
                    {({ sortDirection }) => (
                      <Table.SortableColumnHeader sortDirection={sortDirection}>
                        {c.label}
                      </Table.SortableColumnHeader>
                    )}
                  </Table.Column>
                ) : (
                  <Table.Column key={c.id} id={c.id} isRowHeader={c.isRowHeader}>
                    {c.label}
                  </Table.Column>
                ),
              )}
            </Table.Header>
            <Table.Body
              renderEmptyState={() =>
                loading && !rowsLoaded ? (
                  <div className="py-14 flex flex-col items-center justify-center gap-2 text-(--ink-3)">
                    <Spinner />
                    <div className="text-xs">กำลังโหลดข้อมูล…</div>
                  </div>
                ) : (
                  <EmptyState
                    title={query || Object.values(filterValues).some(Boolean) ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : emptyTitle}
                    description={query || Object.values(filterValues).some(Boolean) ? "ลองปรับคำค้นหาหรือตัวกรอง" : emptyDescription}
                  />
                )
              }
            >
              {pageRows.map(row => (
                <Table.Row key={rowKey(row)} id={rowKey(row)}>
                  {columns.map(c => (
                    <Table.Cell key={c.id} className={c.className}>
                      {c.render(row)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {total > 0 && (
          <Table.Footer>
            <Pagination size="sm" className="w-full justify-between">
              <Pagination.Summary>
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
                      <Pagination.Item key={`e${i}`}>
                        <Pagination.Ellipsis />
                      </Pagination.Item>
                    ) : (
                      <Pagination.Item key={p}>
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
          </Table.Footer>
        )}
      </Table>
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
