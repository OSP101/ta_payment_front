"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Pagination, SearchField, Table, type SortDescriptor,
} from "@heroui/react";
import { EmptyState, SelectField, Spinner, type SelectOption } from "./ui";

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

interface DataTableProps<T> {
  ariaLabel: string;
  columns: DataColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  /** Enables the search box; return the haystack text for a row. */
  searchFn?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: DataFilter<T>[];
  pageSize?: number;
  initialSort?: SortDescriptor;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  /** Extra toolbar content rendered to the right of search/filters. */
  toolbarExtra?: React.ReactNode;
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
  filters, pageSize = 10, initialSort,
  emptyTitle = "ไม่มีข้อมูล", emptyDescription,
  loading, toolbarExtra,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortDescriptor | undefined>(initialSort);
  const [page, setPage] = useState(1);

  // `rows` may be undefined while loading or null when the server returns a
  // JSON null for an empty slice — either way, treat both as an empty list.
  const safeRows = rows ?? [];
  const rowsLoaded = rows !== undefined && rows !== null;

  const filtered = useMemo(() => {
    let out = safeRows;
    const q = query.trim().toLowerCase();
    if (searchFn && q) {
      out = out.filter(r => searchFn(r).toLowerCase().includes(q));
    }
    for (const f of filters ?? []) {
      const v = filterValues[f.id] ?? "";
      if (v !== "") out = out.filter(r => f.predicate(r, v));
    }
    if (sort?.column) {
      const col = columns.find(c => c.id === sort.column);
      if (col?.sortValue) {
        const dir = sort.direction === "descending" ? -1 : 1;
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb), "th") * dir;
        });
      }
    }
    return out;
  }, [safeRows, query, filterValues, sort, columns, searchFn, filters]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => { setPage(1); }, [query, filterValues, total]);

  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const hasToolbar = !!searchFn || (filters?.length ?? 0) > 0 || !!toolbarExtra;

  return (
    <div className="space-y-3">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchFn && (
            <SearchField
              value={query}
              onChange={setQuery}
              aria-label={searchPlaceholder}
              className="w-full sm:w-72"
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={searchPlaceholder} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          )}
          {(filters ?? []).map(f => (
            <SelectField
              key={f.id}
              placeholder={f.placeholder}
              value={(filterValues[f.id] ?? "") === "" ? ALL_KEY : filterValues[f.id]}
              onChange={v => setFilterValues(prev => ({ ...prev, [f.id]: v === ALL_KEY ? "" : v }))}
              options={f.options.map(o => (o.id === "" ? { ...o, id: ALL_KEY } : o))}
              className={f.className ?? "min-w-40"}
            />
          ))}
          {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={ariaLabel}
            sortDescriptor={sort}
            onSortChange={setSort}
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
                  <div className="py-10 flex justify-center"><Spinner /></div>
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
                      onPress={() => setPage(p => Math.max(1, p - 1))}
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
                      onPress={() => setPage(p => Math.min(totalPages, p + 1))}
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
    </div>
  );
}
