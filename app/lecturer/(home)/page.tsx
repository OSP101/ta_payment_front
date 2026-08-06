"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen, Users, ArrowRight, CalendarClock, CalendarOff, CalendarX2,
  CircleAlert, Wallet, ClipboardCheck, Send, UserPlus, ChevronDown,
} from "lucide-react";
import type { Term } from "../../lib/api";
import AnnouncementFeed from "../../components/AnnouncementFeed";
import {
  PageHeader, Panel, EmptyState, Chip, Button, SelectField, Alert,
  type SelectOption, type ChipTone,
} from "../../components/ui";

interface TC {
  id: string; code: string; name_th: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  // ≥1 section has no timetable (registrar "WBA") — TA requests are blocked
  // until the lecturer/staff fills the schedule in.
  has_missing_schedule?: boolean;
  /** คาบที่ตรงวันหยุดและยังไม่กำหนดวันชดเชย — ต้องทำ ไม่งั้น TA เบิกวันนั้นไม่ได้ */
  unresolved_makeups?: number;
}

interface LecturerCourseStatus {
  teaching_course_id: string;
  ta_count: number;
  ta_pending_count: number;
  hours_pending_approval: number;
  hours_approved: number;
  estimated_baht: number;
  budget_max: number;
  budget_used: number;
}

/**
 * A course with no approved TA is not the same as a course nobody asked for.
 * ta_count only counts assignments on APPROVED requests, so without the request
 * list a course whose request is sitting with staff would read "ยังไม่ได้ส่งคำขอ"
 * and invite the lecturer to send it a second time.
 */
interface TARequestRow {
  id: string;
  teaching_course_id: string;
  status: string;
  ta_count?: number;
  submitted_at?: string;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: "ภาคต้น",
  2: "ภาคปลาย",
  3: "ภาคฤดูร้อน",
};

export default function LecturerHome() {
  const router = useRouter();
  const params = useSearchParams();
  const yearParam = params.get("year");
  const termParam = params.get("term");

  const { data: terms, error: termsError } = useSWR<Term[]>("/terms");

  // Group terms by academic year (desc).
  const byYear = useMemo(() => {
    const map = new Map<number, Term[]>();
    (terms ?? []).forEach(t => {
      if (!map.has(t.academic_year)) map.set(t.academic_year, []);
      map.get(t.academic_year)!.push(t);
    });
    for (const [, list] of map) list.sort((a, b) => a.semester - b.semester);
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [terms]);

  const yearOptions: SelectOption[] = byYear.map(([y, list]) => ({
    id: String(y),
    label: (
      <span className="inline-flex items-center gap-2">
        <span className="tabular">ปีการศึกษา {y}</span>
        {list.some(t => t.is_active) && <Chip tone="success">active</Chip>}
      </span>
    ),
    textValue: `${y}`,
  }));

  // Default year: URL → active year → newest year.
  const defaultYear = useMemo(() => {
    if (yearParam && byYear.some(([y]) => String(y) === yearParam)) return yearParam;
    const active = (terms ?? []).find(t => t.is_active);
    if (active) return String(active.academic_year);
    return byYear[0] ? String(byYear[0][0]) : "";
  }, [yearParam, byYear, terms]);

  const yearTerms = useMemo(() => {
    const y = Number(defaultYear);
    return byYear.find(([yr]) => yr === y)?.[1] ?? [];
  }, [byYear, defaultYear]);

  const termOptions: SelectOption[] = yearTerms.map(t => ({
    id: t.id,
    label: (
      <span className="inline-flex items-center gap-2">
        <span>{SEMESTER_LABELS[t.semester] ?? `ภาค ${t.semester}`}</span>
        {t.is_active && <Chip tone="success">active</Chip>}
      </span>
    ),
    textValue: SEMESTER_LABELS[t.semester] ?? `ภาค ${t.semester}`,
  }));

  const defaultTerm = useMemo(() => {
    if (termParam && yearTerms.some(t => t.id === termParam)) return termParam;
    const active = yearTerms.find(t => t.is_active);
    return active?.id ?? yearTerms[0]?.id ?? "";
  }, [termParam, yearTerms]);

  // Reflect resolved defaults back into the URL so refresh/bookmark works.
  useEffect(() => {
    if (!terms || byYear.length === 0) return;
    if (yearParam !== defaultYear || termParam !== defaultTerm) {
      const sp = new URLSearchParams();
      if (defaultYear) sp.set("year", defaultYear);
      if (defaultTerm) sp.set("term", defaultTerm);
      router.replace(`/lecturer?${sp.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultYear, defaultTerm, terms]);

  const coursesKey = defaultTerm ? `/teaching-courses?term_id=${defaultTerm}` : null;
  const { data: courses, error: coursesError } = useSWR<TC[]>(coursesKey);

  const overviewKey = defaultTerm ? `/dashboard/lecturer/me?term_id=${defaultTerm}` : null;
  const { data: overview } = useSWR<LecturerCourseStatus[]>(overviewKey);
  const overviewById = useMemo(() => {
    const m = new Map<string, LecturerCourseStatus>();
    (overview ?? []).forEach(o => m.set(o.teaching_course_id, o));
    return m;
  }, [overview]);

  // The lecturer's own requests — used only to tell "ยังไม่ได้ส่ง" apart from
  // "ส่งแล้ว รอเจ้าหน้าที่". Courses are already filtered by term, so matching
  // on teaching_course_id is enough.
  // Deduplicated with AnnouncementFeed's own fetch of the same key. Read here
  // only to size and, when empty, pre-collapse the section around it.
  const { data: announcements } = useSWR<unknown[]>("/announcements");

  const { data: requests } = useSWR<TARequestRow[]>("/ta-requests");
  const requestByCourse = useMemo(() => {
    const m = new Map<string, TARequestRow>();
    // A course can carry several requests over a term. What the card must not
    // hide is one still waiting on staff, so a submitted row always wins;
    // otherwise the newest decision stands (the list arrives newest-first).
    for (const r of requests ?? []) {
      const prev = m.get(r.teaching_course_id);
      if (!prev || (r.status === "submitted" && prev.status !== "submitted")) {
        m.set(r.teaching_course_id, r);
      }
    }
    return m;
  }, [requests]);

  function setYear(y: string) {
    const list = byYear.find(([yr]) => String(yr) === y)?.[1] ?? [];
    const nextTerm = list.find(t => t.is_active)?.id ?? list[0]?.id ?? "";
    const sp = new URLSearchParams();
    if (y) sp.set("year", y);
    if (nextTerm) sp.set("term", nextTerm);
    router.replace(`/lecturer?${sp.toString()}`);
  }
  function setTerm(t: string) {
    const sp = new URLSearchParams();
    if (defaultYear) sp.set("year", defaultYear);
    if (t) sp.set("term", t);
    router.replace(`/lecturer?${sp.toString()}`);
  }

  const termsLoaded = terms !== undefined;
  const noTerms = termsLoaded && terms!.length === 0;

  // Splitting by TA needs the overview. Until it lands every course would look
  // like "ยังไม่มี TA" — a wrong claim that then rearranges itself under the
  // reader. One undivided list is the honest intermediate state.
  const canSplit = overview !== undefined;
  const withTA = (courses ?? []).filter(c => (overviewById.get(c.id)?.ta_count ?? 0) > 0);
  const withoutTA = (courses ?? []).filter(c => (overviewById.get(c.id)?.ta_count ?? 0) === 0);

  const pageDesc = "รายวิชาที่คุณรับผิดชอบ และสิ่งที่ต้องดำเนินการในภาคเรียนนี้";

  // Terms failed to load — show a real error (with retry) instead of the
  // misleading "ยังไม่มีภาคเรียน" empty state.
  if (termsError && terms === undefined) {
    return (
      <div>
        <PageHeader title="หน้าหลักของฉัน" description={pageDesc} />
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดข้อมูลภาคเรียนไม่สำเร็จ"
            description={(termsError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
            action={
              <Button variant="secondary" size="sm" onPress={() => mutate("/terms")}>
                ลองใหม่
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  // Terms still loading — skeleton, not an empty state.
  if (!termsLoaded) {
    return (
      <div>
        <PageHeader title="หน้าหลักของฉัน" description={pageDesc} />
        <Panel padded={false}>
          <CardGridSkeleton />
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="หน้าหลักของฉัน"
        description={pageDesc}
        actions={
          noTerms ? null : (
            <div className="flex gap-2 items-end flex-wrap">
              <SelectField
                label="ปีการศึกษา"
                value={defaultYear}
                onChange={setYear}
                options={yearOptions}
                className="min-w-[180px]"
              />
              <SelectField
                label="ภาคเรียน"
                value={defaultTerm}
                onChange={setTerm}
                options={termOptions}
                isDisabled={yearTerms.length === 0}
                className="min-w-[180px]"
              />
            </div>
          )
        }
      />

      {noTerms ? (
        <Panel>
          <EmptyState
            icon={<CalendarX2 size={28} />}
            title="ยังไม่มีปีการศึกษา / ภาคเรียนในระบบ"
            description="กรุณาแจ้งเจ้าหน้าที่เพื่อสร้างปีการศึกษาและภาคเรียนก่อน จึงจะแสดงรายวิชาที่คุณรับผิดชอบได้"
          />
        </Panel>
      ) : yearTerms.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="ไม่มีภาคเรียนในปีการศึกษานี้"
            description="ลองเลือกปีการศึกษาอื่น หรือติดต่อเจ้าหน้าที่เพื่อเพิ่มภาคเรียน"
          />
        </Panel>
      ) : (
        <>
          <AlertsSection courses={courses} overviewById={overviewById} />

          {coursesError && courses === undefined ? (
            <Panel>
              <Alert
                status="danger"
                icon={<CircleAlert size={16} />}
                title="โหลดรายวิชาไม่สำเร็จ"
                description={(coursesError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
                action={
                  coursesKey && (
                    <Button variant="secondary" size="sm" onPress={() => mutate(coursesKey)}>
                      ลองใหม่
                    </Button>
                  )
                }
              />
            </Panel>
          ) : (
            <>
              <CollapsibleSection
                id="announcements"
                title="ประชาสัมพันธ์"
                // Same SWR key AnnouncementFeed uses, so this costs no extra
                // request — it just lets the heading say how many there are and
                // fold itself away while there are none.
                count={announcements?.length}
                defaultOpen={(announcements?.length ?? 0) > 0}
                action={
                  <Link
                    href="/announcements"
                    className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
                  >
                    ดูทั้งหมด
                  </Link>
                }
              >
                {/* title={null} — the prop defaults to "ประชาสัมพันธ์" when
                    undefined, which would print the heading twice. */}
                <AnnouncementFeed title={null} compact limit={5} />
              </CollapsibleSection>

              {courses === undefined ? (
                <CollapsibleSection id="all" title="รายวิชาในภาคเรียนนี้">
                  <Panel padded={false}>
                    <CardGridSkeleton />
                  </Panel>
                </CollapsibleSection>
              ) : courses.length === 0 ? (
                <CollapsibleSection id="all" title="รายวิชาในภาคเรียนนี้">
                  <Panel padded={false}>
                    <EmptyState
                      icon={<BookOpen size={28} />}
                      title="ยังไม่มีวิชาในภาคเรียนนี้"
                      description="ติดต่อเจ้าหน้าที่เพื่อเพิ่มวิชาที่คุณรับผิดชอบในภาคเรียนนี้"
                    />
                  </Panel>
                </CollapsibleSection>
              ) : !canSplit ? (
                // Overview still in flight — same cards, just not yet grouped.
                <CollapsibleSection id="all" title="รายวิชาในภาคเรียนนี้">
                  <CourseGrid
                    courses={courses}
                    overviewById={overviewById}
                    requestByCourse={requestByCourse}
                  />
                </CollapsibleSection>
              ) : (
                <>
                  {withTA.length > 0 && (
                    <CollapsibleSection
                      id="with-ta"
                      title="มี TA แล้ว"
                      count={withTA.length}
                      hint="คำขอผ่านแล้วและ TA เริ่มลงเวลาได้ งานหลักคืออนุมัติบันทึกเวลาให้ทัน"
                    >
                      <CourseGrid
                        courses={withTA}
                        overviewById={overviewById}
                        requestByCourse={requestByCourse}
                      />
                    </CollapsibleSection>
                  )}

                  {withoutTA.length > 0 && (
                    <CollapsibleSection
                      id="without-ta"
                      title="ยังไม่มี TA"
                      count={withoutTA.length}
                      hint="วิชาที่ยังไม่มี TA ที่อนุมัติแล้ว ป้ายบนการ์ดบอกว่าส่งคำขอไปหรือยัง"
                    >
                      <CourseGrid
                        courses={withoutTA}
                        overviewById={overviewById}
                        requestByCourse={requestByCourse}
                      />
                    </CollapsibleSection>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section pieces                                                             */
/* -------------------------------------------------------------------------- */

/** Small heading that separates the page into scannable bands. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground first:mt-0">
      {children}
    </h2>
  );
}

const COLLAPSE_KEY = "ta-payment:lecturer-home-collapsed";

/**
 * Which sections the lecturer has opened or closed BY HAND, id → open?
 *
 * Presence is the point: a section the reader has never touched is absent, and
 * follows whatever `defaultOpen` says today. Storing only the closed ones (as
 * this did at first) cannot express "I opened this one" — so a band that
 * auto-collapses while empty would slam shut again on every visit, no matter
 * how many times its owner opened it.
 *
 * One key for the whole page rather than one per section: they are read
 * together on every render, and a single parse keeps them consistent.
 */
type SectionPrefs = Record<string, boolean>;

function readPrefs(): SectionPrefs {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Earlier builds wrote a bare array of collapsed ids. Read it rather than
    // discarding it, so nobody's folded sections spring open on deploy.
    if (Array.isArray(parsed)) return Object.fromEntries(parsed.map((id: string) => [id, false]));
    return parsed && typeof parsed === "object" ? (parsed as SectionPrefs) : {};
  } catch {
    // Storage blocked or corrupt — fall back to the defaults.
    return {};
  }
}

/**
 * A band of the page that can be folded away, with the choice remembered.
 *
 * Persisted because it is a working preference, not a per-visit one: a lecturer
 * who has no course left without a TA collapses that group and means it for
 * every visit, not just this render.
 *
 * `defaultOpen` is what happens BEFORE anyone expresses a preference — callers
 * pass false for a band with nothing in it, so an empty section costs a line
 * instead of a screenful. A hand-made choice always outranks it.
 *
 * `action` sits OUTSIDE the toggle button rather than inside it — a link nested
 * in a button is invalid HTML and, in practice, clicking "ดูทั้งหมด" would also
 * fold the section shut on the way out.
 */
function CollapsibleSection({
  id, title, count, hint, action, defaultOpen = true, children,
}: {
  id: string;
  title: string;
  count?: number;
  hint?: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // Starts from the default on the server and on first paint, then reconciles —
  // reading localStorage during render would make the markup disagree with the
  // server's and React would discard the whole tree at hydration.
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(readPrefs()[id] ?? defaultOpen); }, [id, defaultOpen]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ ...readPrefs(), [id]: next }));
    } catch {
      // Not fatal; the choice just won't survive a reload.
    }
  }

  const bodyId = `section-${id}`;
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group -mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-secondary"
        >
          <ChevronDown
            size={15}
            className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          {count !== undefined && (
            <span className="tabular shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-muted">
              {count}
            </span>
          )}
        </button>
        {action}
      </div>
      {/* Folded away means gone, not hidden: an empty band still costs a scroll,
          and that is the whole reason someone collapsed it. */}
      {open && (
        <div id={bodyId}>
          {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-xl border border-[var(--hairline)] p-4">
          <div className="flex items-start gap-3">
            <div className="size-9 shrink-0 animate-pulse rounded-lg bg-surface-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-secondary" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-secondary" />
            </div>
          </div>
          <div className="mt-4 h-3 w-2/3 animate-pulse rounded bg-surface-secondary" />
        </div>
      ))}
    </div>
  );
}

/**
 * Things that need the lecturer to act, gathered above the course list.
 * Rendered only when there is something — a permanent "all clear" panel trains
 * people to skip the region entirely.
 *
 * The two schedule problems are blockers: a WBA section cannot receive a TA
 * request at all, and an unresolved make-up day is silently dropped, so the TA
 * cannot log — or be paid for — that day.
 */
function AlertsSection({
  courses, overviewById,
}: {
  courses?: TC[];
  overviewById: Map<string, LecturerCourseStatus>;
}) {
  const list = courses ?? [];
  const wba = list.filter(c => c.has_missing_schedule);
  const makeups = list.filter(c => (c.unresolved_makeups ?? 0) > 0);
  const toApprove = list.filter(c => (overviewById.get(c.id)?.ta_pending_count ?? 0) > 0);

  if (wba.length === 0 && makeups.length === 0 && toApprove.length === 0) return null;

  return (
    <>
      <SectionHeading>ต้องดำเนินการ</SectionHeading>
      <div className="space-y-2">
        {wba.length > 0 && (
          <Alert
            status="danger"
            icon={<CalendarOff size={16} />}
            title={`ยังไม่ระบุเวลาเรียน (WBA) ${wba.length} วิชา`}
            description={
              <>
                ต้องกรอกตารางเรียนในหน้า “ตั้งค่ารายวิชา” ก่อน จึงจะส่งคำขอ TA ได้
                <CourseLinks
                  items={wba.map(c => ({
                    id: c.id,
                    href: `/lecturer/courses/${c.id}/settings`,
                    label: c.code,
                  }))}
                />
              </>
            }
          />
        )}
        {makeups.length > 0 && (
          <Alert
            status="danger"
            icon={<CalendarOff size={16} />}
            title="ต้องกำหนดวันชดเชย"
            description={
              <>
                มีคาบที่ตรงกับวันหยุดและยังไม่ได้กำหนดวันชดเชย ถ้าไม่ทำ ระบบจะข้ามวันนั้น
                และ TA จะลงเวลาและเบิกค่าตอบแทนของวันนั้นไม่ได้
                <CourseLinks
                  items={makeups.map(c => ({
                    id: c.id,
                    href: `/lecturer/courses/${c.id}/holidays`,
                    label: `${c.code} ค้าง ${c.unresolved_makeups} คาบ`,
                  }))}
                />
              </>
            }
          />
        )}
        {toApprove.length > 0 && (
          <Alert
            status="warning"
            icon={<ClipboardCheck size={16} />}
            title={`มีบันทึกเวลาของ TA รออนุมัติ ${toApprove.length} วิชา`}
            description={
              <>
                เจ้าหน้าที่ตรวจและส่งเบิกต่อไม่ได้จนกว่าคุณจะอนุมัติ
                <CourseLinks
                  items={toApprove.map(c => {
                    const ov = overviewById.get(c.id)!;
                    return {
                      id: c.id,
                      href: `/lecturer/courses/${c.id}/reports`,
                      label: `${c.code} ${ov.ta_pending_count} คน (${ov.hours_pending_approval.toFixed(1)} ชม.)`,
                    };
                  })}
                />
              </>
            }
          />
        )}
      </div>
    </>
  );
}

/** The per-course links an alert carries, so the fix is one click from here. */
function CourseLinks({ items }: { items: { id: string; href: string; label: string }[] }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
      {items.map(i => (
        <li key={i.id}>
          <Link href={i.href} className="underline underline-offset-2 hover:no-underline">
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Course cards                                                               */
/* -------------------------------------------------------------------------- */

function CourseGrid({
  courses, overviewById, requestByCourse,
}: {
  courses: TC[];
  overviewById: Map<string, LecturerCourseStatus>;
  requestByCourse: Map<string, TARequestRow>;
}) {
  return (
    <Panel padded={false}>
      {/* Card grid rather than table rows: each course carries several
          independent facts (students, TA, hours, budget, blockers) that a row
          squeezes onto one line and truncates first on narrow screens. */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map(c => (
          <CourseCard
            key={c.id}
            course={c}
            ov={overviewById.get(c.id)}
            request={requestByCourse.get(c.id)}
          />
        ))}
      </div>
    </Panel>
  );
}

/** What a course with no approved TA is actually waiting on. */
function requestBadge(r?: TARequestRow): { label: string; tone: ChipTone } {
  switch (r?.status) {
    case "submitted": return { label: "ส่งคำขอแล้ว · รอเจ้าหน้าที่", tone: "info" };
    case "rejected":  return { label: "คำขอถูกปฏิเสธ", tone: "danger" };
    case "cancelled": return { label: "คำขอถูกยกเลิก", tone: "neutral" };
    case "draft":     return { label: "ฉบับร่าง ยังไม่ได้ส่ง", tone: "warn" };
    // 'approved' with no assignment left, and no request at all, land here: in
    // both cases what the lecturer has to do next is send one.
    default:          return { label: "ยังไม่ได้ส่งคำขอ TA", tone: "warn" };
  }
}

/** One course, with its independent facts given room to breathe. */
function CourseCard({
  course: c, ov, request,
}: {
  course: TC;
  ov?: LecturerCourseStatus;
  request?: TARequestRow;
}) {
  const hasTA = (ov?.ta_count ?? 0) > 0;
  const hasBudget = !!ov && ov.budget_max > 0;
  const pctRaw = hasBudget ? (ov!.budget_used / ov!.budget_max) * 100 : 0;
  const pct = Math.round(pctRaw);
  const over = pctRaw > 100;
  const budgetTone: "success" | "warn" | "danger" =
    over || pctRaw >= 90 ? "danger" : pctRaw >= 70 ? "warn" : "success";
  const barFill = { success: "bg-success", warn: "bg-warning", danger: "bg-danger" }[budgetTone];
  const barText = { success: "text-success", warn: "text-warning", danger: "text-danger" }[budgetTone];
  const pendingPeople = ov?.ta_pending_count ?? 0;

  // min-w-0 on the card: a grid item defaults to min-width:auto and refuses to
  // shrink below its content, so on one-column phones the card grew past its
  // grid track and pushed the whole page into a horizontal scroll.
  return (
    <Link
      href={`/lecturer/courses/${c.id}`}
      className="group flex min-w-0 flex-col rounded-xl border border-[var(--hairline)] bg-surface p-4 transition-colors hover:bg-surface-secondary"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <BookOpen size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold tabular group-hover:underline group-hover:underline-offset-2">
            {c.code}
          </div>
          <div className="truncate text-xs text-muted">{c.name_th}</div>
        </div>
        <ArrowRight
          size={15}
          className="mt-1 shrink-0 text-muted transition-colors group-hover:text-accent"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>นักศึกษา {c.num_students} คน</span>
        {c.num_students_regular > 0 && <span>· ปกติ {c.num_students_regular}</span>}
        {c.num_students_special > 0 && <span>· พิเศษ {c.num_students_special}</span>}
      </div>

      {/* The TA line is the one this page is grouped by, so it gets its own row
          rather than being appended to the student counts. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {hasTA ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Users size={12} /> TA {ov!.ta_count} คน
            </span>
            <span className="text-muted">· อนุมัติแล้ว {ov!.hours_approved.toFixed(1)} ชม.</span>
            {ov!.hours_pending_approval > 0 && (
              <span className="text-muted">· รอตรวจ {ov!.hours_pending_approval.toFixed(1)} ชม.</span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted">
            <UserPlus size={12} /> ยังไม่มี TA ในวิชานี้
          </span>
        )}
      </div>

      {/* Budget as a share, not a figure — the exact baht live on the course's
          own budget page, and a percentage is what tells the lecturer whether
          there is room left for more hours. */}
      <div className="mt-3">
        {hasBudget ? (
          <>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1 text-muted">
                <Wallet size={11} /> ใช้งบโดยประมาณ
              </span>
              <span className={`tabular font-medium ${barText}`}>
                {over ? `เกิน ${pct - 100}%` : `${pct}%`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div
                className={`h-full rounded-full transition-[width] ${barFill}`}
                style={{ width: `${Math.min(100, pctRaw)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Wallet size={11} /> รอเจ้าหน้าที่กรอกจำนวนนักศึกษา จึงจะคำนวณงบได้
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--hairline)] pt-3">
        {c.has_missing_schedule && (
          <Chip tone="danger">
            <span className="inline-flex items-center gap-1">
              <CalendarOff size={12} /> ยังไม่ระบุเวลาเรียน
            </span>
          </Chip>
        )}
        {!!c.unresolved_makeups && c.unresolved_makeups > 0 && (
          <Chip tone="danger">
            <span className="inline-flex items-center gap-1">
              <CalendarOff size={12} /> ต้องกำหนดวันชดเชย {c.unresolved_makeups} คาบ
            </span>
          </Chip>
        )}
        {hasTA ? (
          pendingPeople > 0 ? (
            <Chip tone="warn">
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck size={12} /> รออนุมัติ {pendingPeople} คน
              </span>
            </Chip>
          ) : (
            <Chip tone="success">
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck size={12} /> อนุมัติครบแล้ว
              </span>
            </Chip>
          )
        ) : (
          <Chip tone={requestBadge(request).tone}>
            <span className="inline-flex items-center gap-1">
              <Send size={12} /> {requestBadge(request).label}
            </span>
          </Chip>
        )}
      </div>
    </Link>
  );
}
