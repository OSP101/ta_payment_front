"use client";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import {
  Autocomplete, ListBox, SearchField, Label,
  EmptyState as HEmptyState, useFilter, type Key,
} from "@heroui/react";
import { BookOpen, ChevronsUpDown } from "lucide-react";

interface TC { id: string; code: string; name_th: string; term_id?: string; }

/**
 * Global course switcher shown in the top bar of every course sub-page —
 * Vercel-style: a flat trigger (course name + ⇅) that blends into the bar and
 * only shows a border on hover, opening a searchable, left-aligned list.
 * Switching keeps the SAME sub-page and only swaps the course id in the path,
 * so it works for both /lecturer/courses/:id/* and /ta/courses/:id/*.
 *
 * `siblingsPath` decides WHICH courses appear — each role has its own list
 * endpoint (lecturer: every course of the term they teach; TA: only the courses
 * they are assigned to). Passing the wrong one would offer courses the user
 * can't actually open.
 */
export default function CourseSwitcher({
  tcId, siblingsPath = "/teaching-courses",
}: {
  tcId: string;
  /** Path (without query) listing the courses this user may switch to. */
  siblingsPath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { contains } = useFilter({ sensitivity: "base" });
  const { data: course } = useSWR<TC>(tcId ? `/teaching-courses/${tcId}` : null);
  const { data: siblings } = useSWR<TC[]>(
    course?.term_id ? `${siblingsPath}?term_id=${course.term_id}` : null,
  );

  const label = course ? `${course.code} — ${course.name_th}` : "…";

  // Only one course (or list still loading) → show the name as static text.
  if (!siblings || siblings.length <= 1) {
    return (
      <div className="flex items-center gap-2 min-w-0 px-2 text-sm font-medium text-foreground">
        <BookOpen size={15} className="shrink-0 text-muted" />
        {/* min-w-0: without it the flex item keeps its min-content width — and a
            long Thai name has no break opportunities — so truncate never kicks in. */}
        <span className="min-w-0 truncate" title={label}>{label}</span>
      </div>
    );
  }

  function go(newTcId: string) {
    if (!newTcId || newTcId === tcId || !pathname) return;
    // Swap only the course-id segment, preserving the current sub-page.
    router.push(pathname.replace(`/courses/${tcId}`, `/courses/${newTcId}`));
  }

  return (
    <Autocomplete
      aria-label="สลับวิชา"
      variant="secondary"
      selectionMode="single"
      value={tcId || null}
      onChange={(k: Key | null) => { if (k) go(String(k)); }}
      className="min-w-0 max-w-[460px]"
    >
      {/* Flat by default (blends into the bar); border + bg appear on hover. */}
      <Autocomplete.Trigger className="min-w-0 overflow-hidden items-center! gap-1! shadow-none! border! border-transparent! bg-transparent! rounded-md px-2! py-1.5! text-foreground hover:border-border! hover:bg-surface-secondary!">
        <span className="inline-flex items-center gap-2 min-w-0 flex-1" title={label}>
          <BookOpen size={15} className="shrink-0 text-muted" />
          {/* truncate has to sit on the Value itself (a flex item, so it is
              blockified) together with min-w-0 — on the inline span inside it
              overflow is ignored and the long name spills past the trigger. */}
          <Autocomplete.Value className="min-w-0 truncate font-medium">
            {() => label}
          </Autocomplete.Value>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </Autocomplete.Trigger>
      <Autocomplete.Popover placement="bottom start" className="min-w-[340px] max-w-[480px]">
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="course-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="ค้นหาวิชา…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox renderEmptyState={() => <HEmptyState>ไม่พบวิชาที่ตรงกัน</HEmptyState>}>
            {siblings.map(c => (
              <ListBox.Item key={c.id} id={c.id} textValue={`${c.code} ${c.name_th}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen size={15} className="shrink-0 text-muted" />
                  <Label className="truncate">{c.code} — {c.name_th}</Label>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
