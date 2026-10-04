/**
 * A course can be open under more than one registrar code (staff merged them
 * at import — the budget is one, the codes are many). Wherever the course is
 * named, every code is shown, primary first: "CP353301 / SC313302".
 */
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Tip } from "../components/ui";
import { notify } from "./notify";

export interface HasCodes { code: string; alt_codes?: string[] | null }

export function courseCodes(c: HasCodes): string[] {
  return [c.code, ...(c.alt_codes ?? [])];
}

export function courseCodeLabel(c: HasCodes): string {
  return courseCodes(c).join(" / ");
}

/**
 * The registrar's class search (reg.kku.ac.th → ตารางสอน/ข้อมูลรายวิชา) for one
 * code and term. Its form POSTs to class_info_1.asp, but the classic-ASP page
 * reads the same fields from the query string, so a plain link opens the
 * result list directly: every section with รับ / ลง / เหลือ — the real
 * enrolment staff need when they correct student counts.
 */
export function regClassInfoUrl(code: string, year: number, semester: number): string {
  const q = new URLSearchParams({
    avs5931099: "2", backto: "home",
    coursestatus: "O00", facultyid: "all", maxrow: "50",
    Acadyear: String(year), Semester: String(semester),
    coursecode: code, coursename: "", cmd: "2",
  });
  return `https://reg.kku.ac.th/registrar/class_info_1.asp?${q}`;
}

/** A small "copy this code" button: the icon turns into a tick for a moment
 *  so the click is visibly confirmed without a toast per copy. */
export function CopyCodeButton({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <Tip content={done ? "คัดลอกแล้ว" : `คัดลอก ${code}`}>
      <button
        type="button"
        aria-label={`คัดลอกรหัสวิชา ${code}`}
        onClick={async e => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(code);
            setDone(true);
          } catch {
            notify.error("คัดลอกไม่สำเร็จ เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด");
          }
        }}
        className={
          "tap-target ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md align-middle transition " +
          (done ? "text-success" : "text-muted hover:bg-surface-secondary hover:text-foreground")
        }
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </Tip>
  );
}

/** Primary code in full weight, the merged codes after it in a quieter tone.
 *  With `reg` (the term), each code links to its page in the registrar's
 *  system, in a new tab; with `copyable`, each code has a copy button. */
export function CourseCode({ c, className = "", reg, copyable }: {
  c: HasCodes; className?: string; reg?: { year: number; semester: number }; copyable?: boolean;
}) {
  const alt = c.alt_codes ?? [];
  const show = (code: string) => <>{link(code)}{copyable && <CopyCodeButton code={code} />}</>;
  const link = (code: string) => !reg ? code : (
    <Tip content={`เปิด ${code} ในระบบทะเบียน (reg.kku.ac.th) ภาค ${reg.year}/${reg.semester}`}>
      <a
        href={regClassInfoUrl(code, reg.year, reg.semester)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="underline decoration-dotted underline-offset-4 hover:text-[var(--brand)] hover:decoration-solid"
      >
        {code}
      </a>
    </Tip>
  );
  return (
    <span className={`tabular ${className}`}>
      {show(c.code)}
      {alt.map(a => (
        <span key={a} className="text-muted font-normal"> / {show(a)}</span>
      ))}
    </span>
  );
}

/**
 * Which of a course's codes prints on the documents. The college is mid-way
 * through renumbering: CP is the new curriculum, SC the previous one, bare six
 * digits the oldest (kept open for students retaking). Newest wins — same
 * rule as the backend's codeRank.
 */
export function codeRank(code: string): number {
  if (code.startsWith("CP")) return 0;
  if (code.startsWith("SC")) return 1;
  if (/^\d{6}$/.test(code)) return 2;
  return 3;
}

export function pickPrimaryCode(codes: string[]): string {
  return [...codes].sort((a, b) => codeRank(a) - codeRank(b))[0] ?? "";
}
