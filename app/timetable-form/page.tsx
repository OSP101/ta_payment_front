"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";
import { Printer, FileDown } from "lucide-react";
import { Button, Alert } from "../components/ui";
import { Skel, SkelValue } from "../components/Skeletons";
import useDocumentTitle from "../lib/useDocumentTitle";
import { thaiDate } from "../lib/dates";

/**
 * The faculty's signed form — "ตารางเรียนและตารางปฏิบัติงาน (TA)".
 *
 * Rebuilt from the college's own spreadsheet rather than invented: hourly columns
 * 08.00–21.00, one row per day split into the student's OWN classes on top and
 * their TA duties underneath, labels carrying course + section + (ปกติ/พิเศษ), and
 * signature blocks at the foot. Staff already read this layout, and it is the only
 * view where a duty scheduled on top of a class the TA has to attend is visible —
 * you look down the column.
 *
 * Covers every course the TA assists, in one page, because a clash between two
 * different courses is exactly the thing a per-course view cannot show.
 *
 * Printing is the point of the document, so the layout is built for paper first:
 * see the @media print rules at the bottom.
 */

interface Block {
  kind: "own_class" | "lecture" | "lab" | "review";
  course_code: string;
  course_name?: string;
  sec_no?: string;
  track?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  expected?: number;
  logged?: number;
}
interface Signer {
  lecturer_id: string;
  lecturer_name: string;
  courses: string[];
  course_names: string[];
}
interface OutOfGrid {
  work_date: string; start_time: string; end_time: string; hours: number;
  activity: string; course_code: string; sec_no: string; note?: string;
  source: "auto" | "manual";
}
interface FormData {
  ta_name: string; student_id?: string; term_label: string; year_month?: string;
  blocks: Block[]; signers: Signer[]; out_of_grid: OutOfGrid[];
  has_own_classes: boolean;
}

// Columns are whole hours 08:00–21:00 — thirteen of them, exactly as the paper
// form. It ran to 20:00 until 31/07/2026, one column short, and the missing
// column was not a cosmetic difference: `span()` clamps to LAST_HOUR, so a duty
// sitting entirely in 20:00–21:00 collapsed to zero width and VANISHED from the
// grid without appearing anywhere else. Evening grading slots are ordinary here
// (one real TA has two of them), so the form was silently under-reporting the
// work it exists to certify.
const FIRST_HOUR = 8;
const LAST_HOUR = 21;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

const DAYS = [
  { dow: 1, label: "จันทร์" }, { dow: 2, label: "อังคาร" }, { dow: 3, label: "พุธ" },
  { dow: 4, label: "พฤหัส" }, { dow: 5, label: "ศุกร์" },
  { dow: 6, label: "เสาร์" }, { dow: 0, label: "อาทิตย์" },
];

/**
 * Colours.
 *
 * The two from the college's file are kept exactly: peach for the student's own
 * classes, and the green it used for TA work. The green is now only the LECTURE
 * duty, because the request was for บรรยาย / ปฏิบัติการ / ตรวจงาน to be separable
 * at a glance — the original sheet coloured all three the same.
 *
 * Every block also carries a text tag. The form is photocopied and signed, and on
 * a black-and-white copy colour alone says nothing.
 */
const STYLE: Record<Block["kind"], { bg: string; fg: string; tag: string }> = {
  own_class: { bg: "#FEE9D9", fg: "#7A3A16", tag: "เรียน" },
  lecture:   { bg: "#D8E4BD", fg: "#3B5323", tag: "บรรยาย" },
  lab:       { bg: "#CFE2F3", fg: "#12456E", tag: "ปฏิบัติการ" },
  review:    { bg: "#E4D9F3", fg: "#442A70", tag: "ตรวจงาน" },
};

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย", lab: "ปฏิบัติการ", review: "ตรวจงาน", makeup: "ชดเชย", other: "อื่นๆ",
};

/** Minutes since midnight, for placing a block on the hour grid. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
/** Grid column span, clamped to the printed window. */
function span(b: Block): { start: number; end: number } | null {
  const s = Math.max(toMin(b.start_time), FIRST_HOUR * 60);
  const e = Math.min(toMin(b.end_time), LAST_HOUR * 60);
  if (e <= s) return null;
  // +2 because column 1 is the day label.
  return { start: Math.floor((s - FIRST_HOUR * 60) / 60) + 2, end: Math.ceil((e - FIRST_HOUR * 60) / 60) + 2 };
}

export default function TimetableFormPage() {
  return (
    <Suspense fallback={<FormView data={undefined} formKey={null} yearMonth={null} />}>
      <TimetableFormInner />
    </Suspense>
  );
}

function TimetableFormInner() {
  useDocumentTitle("ตารางเรียนและตารางปฏิบัติงาน");
  const q = useSearchParams();
  const termId = q.get("term_id");
  const userId = q.get("user_id");
  const yearMonth = q.get("year_month");

  const key = termId
    ? `/timetable-form?term_id=${termId}` +
      (userId ? `&user_id=${userId}` : "") +
      (yearMonth ? `&year_month=${yearMonth}` : "")
    : null;
  const { data, error } = useSWR<FormData>(key);

  if (!termId) return <div className="p-6"><Alert status="danger" title="ต้องระบุภาคการศึกษา (term_id)" /></div>;
  // Checked before the loading state: it used to come after `!data`, so a
  // failed load kept the spinner up forever and this alert never showed.
  if (error && !data) return <div className="p-6"><Alert status="danger" title="โหลดฟอร์มไม่สำเร็จ" /></div>;

  return <FormView data={data} formKey={key} yearMonth={yearMonth} />;
}

/**
 * The form itself. `data` undefined = still loading: the paper layout (toolbar,
 * heading, legend, the hour grid, the signature line) is all fixed, so it is
 * drawn straight away and only the parts that come from the TA's data hold a
 * placeholder — the blocks land in the grid rather than the whole sheet
 * replacing a spinner.
 */
function FormView({ data, formKey: key, yearMonth }: {
  data: FormData | undefined; formKey: string | null; yearMonth: string | null;
}) {
  // Weekend rows only when something actually falls there — otherwise two of the
  // seven rows are permanently blank and the grid loses a fifth of its width to
  // nothing. Makeups and grading slots legitimately land on Saturday.
  const usedDays = new Set((data?.blocks ?? []).map(b => b.day_of_week));
  const days = DAYS.filter(d => d.dow >= 1 && d.dow <= 5 ? true : usedDays.has(d.dow));

  const duties = (data?.blocks ?? []).filter(b => b.kind !== "own_class");
  // A block outside 08:00–21:00 cannot be drawn. Say so out loud: the 20:00
  // column bug was invisible for exactly as long as `span()` returned null and
  // the caller quietly rendered nothing, and a form that drops a duty without
  // saying anything is worse than one with an odd-looking column.
  const unplaceable = (data?.blocks ?? []).filter(b => span(b) === null);
  const manualOut = data?.out_of_grid.filter(o => o.source === "manual");
  const autoOut = data?.out_of_grid.filter(o => o.source === "auto");
  // The out-of-grid tables exist only for a month view; the URL already says
  // whether this is one, so their space is held before the data arrives.
  const monthView = data ? !!data.year_month : !!yearMonth;

  return (
    <div className="mx-auto max-w-[1200px] p-4 print:p-0">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .tt-grid { font-size: 8pt; }
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          พิมพ์แนวนอน A4 ช่องลายเซ็นอยู่ท้ายฟอร์ม
        </div>
        <div className="flex gap-2">
          {/* Two ways out on purpose. Browser print is instant and lays the grid
              out exactly as seen; the server PDF is the one that can be filed,
              emailed, or pulled from the payout zip without a browser. */}
          <Button variant="outline" disabled={!key} onClick={() => window.open(`/api/v1${key}`.replace("/timetable-form?", "/timetable-form.pdf?"), "_blank", "noopener")}>
            <FileDown size={14} /> ดาวน์โหลด PDF
          </Button>
          <Button disabled={!data} onClick={() => window.print()}>
            <Printer size={14} /> พิมพ์ฟอร์ม
          </Button>
        </div>
      </div>

      {data && !data.has_own_classes && (
        <div className="no-print mb-3">
          <Alert
            status="warning"
            title="ยังไม่มีตารางเรียนของนักศึกษา"
            description="ครึ่งบนของแต่ละวันจะว่าง ฟอร์มนี้ต้องมีตารางเรียนจึงจะตรวจการทับซ้อนได้ตามแบบของคณะ"
          />
        </div>
      )}

      {unplaceable.length > 0 && (
        <div className="mb-3">
          <Alert
            status="warning"
            title={`มี ${unplaceable.length} คาบที่อยู่นอกช่วง 08.00–21.00 น. จึงวาดในตารางไม่ได้`}
            description={unplaceable
              .map(b => `${b.course_code}${b.sec_no ? ` Sec.${b.sec_no}` : ""} ${DAYS.find(d => d.dow === b.day_of_week)?.label ?? ""} ${b.start_time}–${b.end_time}`)
              .join(" · ")}
          />
        </div>
      )}

      <div className="text-center">
        <div className="text-base font-semibold">ตารางเรียนและตารางปฏิบัติงาน (TA)</div>
        <div className="text-sm">
          {data
            ? <>ภาคการศึกษา {data.term_label}{data.year_month ? ` · เดือน ${data.year_month}` : ""}</>
            : <SkelValue className="h-3.5 w-48" />}
        </div>
      </div>
      <div className="mt-2 text-sm">
        {data ? (
          <>
            ชื่อ <b>{data.ta_name}</b>
            {data.student_id ? <>　รหัสนักศึกษา <b>{data.student_id}</b></> : null}
          </>
        ) : (
          <>ชื่อ <SkelValue className="h-3.5 w-64" /></>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {(["own_class", "lecture", "lab", "review"] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: STYLE[k].bg }} />
            {k === "own_class" ? "คาบเรียนของนักศึกษา" : `งาน TA ${STYLE[k].tag}`}
          </span>
        ))}
      </div>

      <div className="tt-grid mt-2 overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row of hour columns */}
          <div
            className="grid gap-px border border-black/30 bg-black/20 text-center text-[10px]"
            style={{ gridTemplateColumns: `64px repeat(${HOURS.length}, minmax(0,1fr))` }}
          >
            <div className="bg-white px-1 py-1 font-medium">วัน / เวลา</div>
            {HOURS.map(h => (
              <div key={h} className="bg-white px-0.5 py-1">
                {String(h).padStart(2, "0")}.00–{String(h + 1).padStart(2, "0")}.00
              </div>
            ))}
          </div>

          {days.map(d => (
            <DayRow key={d.dow} label={d.label} dow={d.dow} blocks={data?.blocks} />
          ))}
        </div>
      </div>

      {/* Out-of-grid entries. Split by origin, because "off the timetable" and
          "typed by a human" are different claims: a makeup is generated and lands
          off-grid by design, while a hand-typed row is the one to read. */}
      {monthView && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <OutTable
            title={manualOut ? `TA เพิ่มเอง (${manualOut.length})` : "TA เพิ่มเอง"}
            hint="ไม่ตรงช่องใดในตาราง และเป็นรายการที่พิมพ์เอง"
            rows={manualOut}
            highlight
          />
          <OutTable
            title={autoOut ? `นอกตาราง แต่ระบบสร้าง (${autoOut.length})` : "นอกตาราง แต่ระบบสร้าง"}
            hint="ส่วนใหญ่คือคาบชดเชยที่ย้ายวัน"
            rows={autoOut}
          />
        </div>
      )}

      {/* Signature blocks, grouped by lecturer exactly as the paper form does —
          one lecturer covering two of the TA's courses signs once. */}
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <SignBlock name={data?.ta_name} role="นักศึกษา" />
        {data?.signers.map(s => (
          <SignBlock
            key={s.lecturer_id}
            name={s.lecturer_name}
            role={`อาจารย์ประจำวิชา ${s.courses.join(" และ ")}`}
            detail={s.course_names}
          />
        ))}
      </div>
    </div>
  );
}

/** One day = two stacked rows: the student's classes, then their TA duties. */
function DayRow({ label, dow, blocks }: { label: string; dow: number; blocks: Block[] | undefined }) {
  const own = blocks?.filter(b => b.day_of_week === dow && b.kind === "own_class");
  const duty = blocks?.filter(b => b.day_of_week === dow && b.kind !== "own_class");
  const cols = `64px repeat(${HOURS.length}, minmax(0,1fr))`;

  return (
    <div className="grid gap-px border-x border-b border-black/30 bg-black/20" style={{ gridTemplateColumns: cols }}>
      <div className="row-span-2 flex items-center justify-center bg-white px-1 text-[11px] font-medium">
        {label}
      </div>
      <BlockLane blocks={own} seed={dow} />
      <BlockLane blocks={duty} seed={dow + 2} />
    </div>
  );
}

/** One lane of the day — blocks placed on the hour columns, gaps filled white. */
/** Where a loading lane draws its one placeholder bar — varied per row so the
 *  sheet reads as "blocks coming", not as a striped pattern. [startCol, span] */
const PLACEHOLDER_AT: [number, number][] = [[3, 3], [6, 2], [2, 4], [8, 3], [4, 2]];

function BlockLane({ blocks, seed = 0 }: { blocks: Block[] | undefined; seed?: number }) {
  const [phStart, phSpan] = PLACEHOLDER_AT[seed % PLACEHOLDER_AT.length];
  return (
    <>
      {/* Background cells so the lane keeps its height and gridlines when empty. */}
      {HOURS.map((_, i) => (
        <div key={`bg${i}`} className="min-h-[26px] bg-white" style={{ gridColumn: i + 2 }} />
      ))}
      {!blocks && (
        <div className="z-10 self-center px-1" style={{ gridColumn: `${phStart} / span ${phSpan}` }}>
          <Skel className="h-4 w-full rounded-sm" />
        </div>
      )}
      {blocks?.map((b, i) => {
        const sp = span(b);
        if (!sp) return null;
        const st = STYLE[b.kind];
        return (
          <div
            key={i}
            className="z-10 self-center overflow-hidden px-1 py-0.5 text-[9px] leading-tight"
            style={{ gridColumn: `${sp.start} / ${sp.end}`, background: st.bg, color: st.fg }}
            title={`${b.course_code} ${b.course_name ?? ""}`}
          >
            <span className="font-medium">{b.course_code}</span>
            {b.sec_no ? ` Sec.${b.sec_no}` : ""} {st.tag}
            {b.track ? ` (${b.track === "special" ? "พิเศษ" : "ปกติ"})` : ""}
            {b.expected ? <span className="ml-1 font-medium">· {b.logged ?? 0}/{b.expected}</span> : null}
          </div>
        );
      })}
    </>
  );
}

function OutTable({
  title, hint, rows, highlight,
}: { title: string; hint: string; rows: OutOfGrid[] | undefined; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] overflow-hidden">
      <div className={"px-3 py-1.5 " + (highlight && rows && rows.length > 0 ? "bg-amber-50" : "bg-surface-secondary")}>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      {!rows ? (
        <div className="px-3 py-2"><Skel className="h-3 w-2/3" /></div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted">ไม่มี</div>
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map((o, i) => (
              <tr key={i} className="border-t border-[var(--hairline)]">
                <td className="px-2 py-1 whitespace-nowrap text-muted">{thaiDate(o.work_date)}</td>
                <td className="px-1 py-1 whitespace-nowrap tabular">
                  {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)}
                </td>
                <td className="px-1 py-1 whitespace-nowrap">{ACTIVITY_LABEL[o.activity] ?? o.activity}</td>
                <td className="px-1 py-1 whitespace-nowrap text-muted">{o.course_code} sec {o.sec_no}</td>
                <td className="px-2 py-1 text-muted">{o.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SignBlock({ name, role, detail }: { name: string | undefined; role: string; detail?: string[] }) {
  return (
    <div className="text-center text-sm">
      <div className="mb-6">ลงชื่อ .................................................</div>
      <div>( {name ?? <SkelValue className="h-3.5 w-40" />} )</div>
      <div className="text-xs text-muted">{role}</div>
      {detail?.map((d, i) => (
        <div key={i} className="text-[11px] text-muted">{d}</div>
      ))}
    </div>
  );
}
