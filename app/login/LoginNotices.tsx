"use client";

import { useEffect, useState } from "react";
import { CalendarClock, FileCheck2 } from "lucide-react";
import { useI18n } from "../lib/i18n/client";

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

/** "2026-11-02T23:59:00+07:00" → "23:59": the backend already speaks Bangkok time. */
function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Remaining time to the closing instant, ticking every second. Before mount it
 * is null so the server HTML and the first client render agree; the segments
 * keep their width (tabular numerals) so nothing shifts when it starts.
 */
function useRemaining(closesAt: string): number | null {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(closesAt).getTime();
    const tick = () => setMs(Math.max(0, end - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [closesAt]);
  return ms;
}

function Countdown({ closesAt, urgentClass, quiet }: {
  closesAt: string;
  urgentClass: string;
  quiet: string;
}) {
  const { t } = useI18n();
  const ms = useRemaining(closesAt);
  if (ms !== null && ms <= 0) {
    return <p className="mt-1 text-lg font-semibold leading-snug">{t("ถึงเวลาปิดรับแล้ว")}</p>;
  }
  const total = ms === null ? null : Math.floor(ms / 1000);
  const days = total === null ? null : Math.floor(total / 86400);
  const parts: [string, string][] = [
    [days === null ? "--" : String(days), t("วัน")],
    [total === null ? "--" : pad(Math.floor((total % 86400) / 3600)), t("ชม.")],
    [total === null ? "--" : pad(Math.floor((total % 3600) / 60)), t("นาที")],
    [total === null ? "--" : pad(total % 60), t("วินาที")],
  ];
  const urgent = ms !== null && ms < URGENT_DAYS * 86400_000;
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={days === null ? undefined : t("เหลือเวลาอีก {days} วัน {hours} ชั่วโมง", { days, hours: parts[1][0] })}
      className={`mt-1.5 flex items-start gap-3 ${urgent ? urgentClass : ""}`}
    >
      {parts.map(([v, unit], i) => (
        <div key={unit} className="flex items-start gap-3">
          <div className="flex flex-col items-start min-w-[2ch]">
            <span className="text-2xl font-semibold leading-none tabular-nums">{v}</span>
            <span className={`mt-1 text-[11px] leading-none ${urgent ? "" : quiet}`}>{unit}</span>
          </div>
          {i < parts.length - 1 && <span aria-hidden className={`text-xl leading-none ${urgent ? "" : quiet}`}>:</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * `dark` sits on the photo panel (desktop); `light` sits under the form on a
 * phone, where the photo panel does not exist.
 */
export default function LoginNoticeCards({ notices, tone }: { notices: LoginNotices; tone: "dark" | "light" }) {
  const { t, fmtDate } = useI18n();
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
    <section aria-label={t("ประกาศจากระบบ")} className="flex flex-col gap-3 w-full">
      {w && (() => {
        const urgent = w.days_left <= URGENT_DAYS;
        return (
          <article className={`${card} px-4 py-3`}>
            <div className={`flex items-center gap-2 text-xs ${quiet}`}>
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <span>{t("เปิดรับคำขอ TA ภาค {term}", { term: w.term_label })}</span>
            </div>
            <Countdown
              closesAt={w.closes_at}
              urgentClass={dark ? "text-amber-300" : "text-warning"}
              quiet={quiet}
            />
            <p className={`mt-2 text-sm tabular-nums ${quiet}`}>
              {t("ปิดรับ {date} เวลา {time} น.", { date: fmtDate(w.closes_at), time: clockTime(w.closes_at) })}
            </p>
            <div
              role="img"
              aria-label={t("ผ่านไป {pct}% ของช่วงรับคำขอ", { pct: w.elapsed_pct })}
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
            <span>{t("ใบเบิกค่าตอบแทน ภาค {term}", { term: docs[0].term_label })}</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {docs.map((d, i) => (
              <li key={i}>
                <p className={`text-xs tabular-nums ${quiet}`}>
                  {d.round_label ? `${d.round_label} · ` : ""}{t("อัปเดต {date}", { date: fmtDate(d.updated_at) })}
                </p>
                <p className="mt-0.5 text-base font-semibold leading-snug">
                  <span className="tabular-nums">{t("ขั้นที่ {stage}/{total}", { stage: d.stage, total: d.stage_total })}</span>
                  <span className="font-medium"> · {d.stage_label}</span>
                </p>
                <div
                  role="img"
                  aria-label={t("ขั้นที่ {stage} จากทั้งหมด {total} ขั้น", { stage: d.stage, total: d.stage_total })}
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
