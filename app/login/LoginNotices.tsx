import { CalendarClock, FileCheck2 } from "lucide-react";
import { thaiDate } from "../lib/dates";

/**
 * What the login page may say before anyone signs in: the live TA-request
 * deadline, and how far the term's claim-document bundle has travelled. The
 * backend sends college-wide facts only (no names, no document numbers); the
 * per-document view stays behind the login. Either part is simply absent when
 * there is nothing to say, and the whole component then renders nothing.
 */
export type LoginNotices = {
  request_window?: {
    term_label: string;
    opens_at: string;
    closes_at: string;
    days_left: number;
    elapsed_pct: number;
  };
  documents?: {
    term_label: string;
    round_label?: string;
    stage: number;
    stage_total: number;
    stage_label: string;
    updated_at: string;
  }[];
};

/** At or under this many days the deadline card switches to the warning hue. */
const URGENT_DAYS = 3;

export function hasLoginNotices(n?: LoginNotices | null): n is LoginNotices {
  return !!n && (!!n.request_window || !!n.documents?.length);
}

function daysText(d: number): string {
  if (d <= 0) return "วันนี้เป็นวันสุดท้าย";
  return `เหลือ ${d} วัน`;
}

/**
 * `dark` sits on the photo panel (desktop); `light` sits under the form on a
 * phone, where the photo panel does not exist.
 */
export default function LoginNoticeCards({ notices, tone }: { notices: LoginNotices; tone: "dark" | "light" }) {
  const dark = tone === "dark";
  const w = notices.request_window;
  const docs = notices.documents ?? [];

  const card = dark
    ? "rounded-2xl border border-white/20 bg-black/55 text-white backdrop-blur-md shadow-lg shadow-black/30"
    : "rounded-2xl border border-border bg-surface text-foreground shadow-sm";
  const quiet = dark ? "text-white/75" : "text-muted";
  const track = dark ? "bg-white/25" : "bg-default";
  const fill = dark ? "bg-white" : "bg-accent";

  return (
    <section aria-label="ประกาศจากระบบ" className="flex flex-col gap-3 w-full">
      {w && (() => {
        const urgent = w.days_left <= URGENT_DAYS;
        return (
          <article className={`${card} px-4 py-3`}>
            <div className={`flex items-center gap-2 text-xs ${quiet}`}>
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <span>เปิดรับคำขอ TA ภาค {w.term_label}</span>
            </div>
            <p className={`mt-1 text-lg font-semibold leading-snug tabular-nums ${urgent ? (dark ? "text-amber-300" : "text-warning") : ""}`}>
              {daysText(w.days_left)}
            </p>
            <p className={`text-sm tabular-nums ${quiet}`}>ปิดรับ {thaiDate(w.closes_at)}</p>
            <div
              role="img"
              aria-label={`ผ่านไป ${w.elapsed_pct}% ของช่วงรับคำขอ`}
              className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${track}`}
            >
              <div
                className={`h-full rounded-full ${urgent ? "bg-warning" : fill}`}
                style={{ width: `${Math.max(w.elapsed_pct, 3)}%` }}
              />
            </div>
          </article>
        );
      })()}

      {docs.length > 0 && (
        <article className={`${card} px-4 py-3`}>
          <div className={`flex items-center gap-2 text-xs ${quiet}`}>
            <FileCheck2 className="size-3.5 shrink-0" aria-hidden />
            <span>ใบเบิกค่าตอบแทน ภาค {docs[0].term_label}</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {docs.map((d, i) => (
              <li key={i}>
                <p className={`text-xs tabular-nums ${quiet}`}>
                  {d.round_label ? `${d.round_label} · ` : ""}อัปเดต {thaiDate(d.updated_at)}
                </p>
                <p className="mt-0.5 text-base font-semibold leading-snug">
                  <span className="tabular-nums">ขั้นที่ {d.stage}/{d.stage_total}</span>
                  <span className="font-medium"> · {d.stage_label}</span>
                </p>
                <div
                  role="img"
                  aria-label={`ขั้นที่ ${d.stage} จากทั้งหมด ${d.stage_total} ขั้น`}
                  className="mt-1.5 grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${d.stage_total}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: d.stage_total }, (_, k) => (
                    <div key={k} className={`h-1.5 rounded-full ${k < d.stage ? fill : track}`} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
