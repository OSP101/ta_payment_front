"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { RefreshCw, Database, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, Chip, Alert, Tip, type ChipTone } from "../../components/ui";
import { DataTable, type DataColumn, type DataFilter } from "../../components/DataTable";
import { useTerm } from "../TermContext";
import { Skel, SkelValue } from "../../components/Skeletons";
import { msg, useI18n, type TFn } from "../../lib/i18n/client";

interface Holiday {
  id: string;
  holiday_date: string;
  name_th: string;
  source: "national" | "university" | "faculty" | "custom" | "tdbm";
  start_time?: string;
  end_time?: string;
}

const HOLIDAY_SOURCE_LABEL: Record<Holiday["source"], string> = {
  national: msg("ราชการ"), university: msg("มหาวิทยาลัย"), faculty: msg("คณะ"), custom: msg("อื่นๆ"), tdbm: "TDBM",
};
const HOLIDAY_SOURCE_TONE: Record<Holiday["source"], ChipTone> = {
  national: "danger", university: "warn", faculty: "brand", custom: "neutral", tdbm: "info",
};

interface TDBMExtraTeaching {
  extra_class_id: number;
  class_date: string;
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  course_code?: string;
  owner_teacher_name?: string;
  section_label?: string;
  semester_type?: string;
  opt_status: string;
  matched_course_code?: string;
  matched_course_name?: string;
  matched_sec_no?: string;
  original_holiday_date?: string;
  original_holiday_name?: string;
  synced_at: string;
}

interface TDBMSyncLogEntry {
  id: string;
  resource: "holidays" | "extra-teachings" | "teachers";
  trigger_kind: "webhook" | "scheduler" | "manual";
  academic_year?: number;
  semester?: number;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  matched?: number;
  error?: string;
  started_at: string;
  finished_at?: string;
}

// "2026-10-24" -> "24 ต.ค. 2569" / "24 Oct 2026" — short form, this table has
// a lot of rows. Dates go through fmtDate() from useI18n().

// "2026-09-18T14:59:56" (already Bangkok local time — the backend formats it
// with TO_CHAR, no timezone suffix) -> "18 ก.ย. 2569 เวลา 14:59 น." — the raw
// ISO-ish string this replaces reads as a technical log line, not something
// non-technical staff can glance at and know "was that just now, or last week".
function formatDateTimeThai(t: TFn, fmtDate: (iso: string) => string, isoLocal: string): string {
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return isoLocal;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return t("{date} เวลา {time} น.", { date: fmtDate(ymd), time: `${hh}:${mm}` });
}

// "09:00–12:00" or "ทั้งวัน" — same rendering as /staff/holidays.
function holidayWindowLabel(t: TFn, h: Holiday): string {
  if (!h.start_time || !h.end_time) return t("ทั้งวัน");
  return `${h.start_time.slice(0, 5)}–${h.end_time.slice(0, 5)}`;
}

// A row counts as "matched" once staff can act on it directly — resolved down
// to one specific section, not just the course (see resolveSectionMatches in
// internal/service/tdbm.go: course-only still needs a human to pick a group).
function isMatched(r: TDBMExtraTeaching) {
  return !!r.matched_sec_no;
}

export default function StaffTDBMPage() {
  const { term, loaded } = useTerm();
  const { t, fmtDate } = useI18n();
  const formatDateShort = (iso: string) => fmtDate(iso);
  const [syncing, setSyncing] = useState(false);

  const listKey = term ? `/tdbm/extra-teachings?academic_year=${term.academic_year}&semester=${term.semester}` : null;
  // keepPreviousData: a term switch keeps the old rows (under DataTable's
  // refetch overlay) until the new term's land, instead of blanking the table.
  const { data: rows, isLoading, error } = useSWR<TDBMExtraTeaching[]>(listKey, { keepPreviousData: true });
  const { data: syncLog } = useSWR<TDBMSyncLogEntry[]>("/tdbm/sync-log?limit=10");
  // No year filter — /staff/holidays' own year picker aside, a term can span
  // two calendar years (e.g. Aug–Jan), so filtering by the TERM's date range
  // below is the only scoping that can't miss a holiday at either end.
  const { data: allHolidays, error: holidaysError } = useSWR<Holiday[]>("/holidays");
  const holidays = useMemo(() => {
    if (!term || !allHolidays) return undefined;
    // A term without dates can't scope anything — an empty list, not a
    // DataTable that stays on its loading skeleton forever.
    if (!term.starts_on || !term.ends_on) return [];
    return allHolidays
      .filter(h => h.holiday_date >= term.starts_on! && h.holiday_date <= term.ends_on!)
      .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  }, [allHolidays, term]);

  // Most recent completed run per resource, for the "last synced" banner —
  // what actually answers "did this really go fetch anything just now".
  const lastByResource = useMemo(() => {
    const out: Record<string, TDBMSyncLogEntry> = {};
    for (const e of syncLog ?? []) {
      if (!out[e.resource]) out[e.resource] = e;
    }
    return out;
  }, [syncLog]);
  const lastExtra = lastByResource["extra-teachings"];
  const lastHolidays = lastByResource["holidays"];

  const matchedCount = useMemo(() => (rows ?? []).filter(isMatched).length, [rows]);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await api.post("/tdbm/sync-now");
      notify.success(t("ซิงก์จาก TDBM เรียบร้อยแล้ว"));
      await Promise.all([mutate(listKey), mutate("/tdbm/sync-log?limit=10")]);
    } catch (e) {
      notify.error(e);
    } finally {
      setSyncing(false);
    }
  }

  const columns: DataColumn<TDBMExtraTeaching>[] = [
    {
      id: "class_date", width: 150, label: t("วันที่สอนชดเชย"), sortable: true, isRowHeader: true,
      sortValue: r => r.class_date,
      render: r => (
        <span className="whitespace-nowrap">
          {formatDateShort(r.class_date)}
          {r.start_time && r.end_time && (
            <span className="ml-1.5 text-muted tabular-nums">{r.start_time}–{r.end_time}</span>
          )}
        </span>
      ),
    },
    {
      id: "original_holiday", width: 160, label: t("ตรงกับวันหยุด"), sortable: true,
      sortValue: r => r.original_holiday_date ?? "",
      render: r =>
        r.original_holiday_date ? (
          <span className="whitespace-nowrap">
            {formatDateShort(r.original_holiday_date)}
            {r.original_holiday_name && <span className="ml-1.5 text-muted">({r.original_holiday_name})</span>}
          </span>
        ) : (
          <span className="text-muted">{t("ยังไม่ทราบ")}</span>
        ),
    },
    {
      id: "course", width: 260, label: t("วิชา / กลุ่ม"), sortable: true,
      sortValue: r => r.course_code ?? "",
      // One line: our match, then its name. TDBM's own raw text — the proof
      // the sync fetched real data, whether or not we could match it — is in
      // the tooltip.
      render: r => (
        <Tip content={`TDBM: ${r.course_code ?? "—"}${r.section_label ? ` ${r.section_label}` : ""}${r.semester_type ? ` (${r.semester_type})` : ""}`}>
          <span>
            <span className="font-medium">
              {r.matched_course_code ?? r.course_code ?? <span className="text-muted">—</span>}
            </span>
            {r.matched_sec_no && <span className="text-muted"> {t("กลุ่ม {n}", { n: r.matched_sec_no })}</span>}
            {r.matched_course_name && <span className="ms-2 text-xs text-muted">{r.matched_course_name}</span>}
          </span>
        </Tip>
      ),
    },
    {
      id: "teacher", width: 200, label: t("อาจารย์ (เจ้าของวิชา)"),
      render: r => r.owner_teacher_name ?? <span className="text-muted">—</span>,
    },
    {
      id: "duration", width: 100, label: t("ชั่วโมง"), sortable: true, className: "text-right", hideOnMobile: true,
      sortValue: r => r.duration_minutes,
      render: r => <span className="tabular-nums">{(r.duration_minutes / 60).toFixed(1)}</span>,
    },
    {
      id: "match", width: 150, label: t("สถานะจับคู่"), sortable: true,
      sortValue: r => (isMatched(r) ? 1 : 0),
      render: r =>
        isMatched(r) ? (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircle2 size={16} /> {t("จับคู่กับระบบ TA PAY แล้ว")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-danger">
            <XCircle size={16} /> {t("ยังไม่จับคู่")}
          </span>
        ),
    },
  ];

  const filters: DataFilter<TDBMExtraTeaching>[] = [
    {
      id: "match", placeholder: t("สถานะจับคู่"),
      options: [
        { id: "", label: t("ทุกรายการ") },
        { id: "matched", label: t("จับคู่กับระบบ TA PAY แล้ว") },
        { id: "unmatched", label: t("ยังไม่จับคู่") },
      ],
      predicate: (r, v) => (v === "matched" ? isMatched(r) : !isMatched(r)),
    },
  ];

  const holidayColumns: DataColumn<Holiday>[] = [
    {
      id: "date", width: 150, label: t("วันที่"), sortable: true, isRowHeader: true,
      sortValue: h => h.holiday_date,
      render: h => <span className="whitespace-nowrap">{formatDateShort(h.holiday_date)}</span>,
    },
    { id: "name", width: 260, label: t("ชื่อวันหยุด"), sortable: true, sortValue: h => h.name_th, render: h => h.name_th },
    {
      id: "source", width: 140, label: t("ประเภท"), hideOnMobile: true,
      render: h => <Chip tone={HOLIDAY_SOURCE_TONE[h.source]}>{t(HOLIDAY_SOURCE_LABEL[h.source])}</Chip>,
    },
    { id: "window", width: 180, label: t("ช่วงเวลา"), hideOnMobile: true, render: h => holidayWindowLabel(t, h) },
  ];

  return (
    <div>
      <PageHeader
        title={t("ข้อมูลจาก TDBM")}
        description={t("รายการวันสอนชดเชยที่ระบบดึงมาจาก TDBM (ระบบลงเวลาชดเชยของอาจารย์) จริง — หน้านี้ไว้ตรวจสอบว่าซิงก์สำเร็จ ไม่ใช่หน้าจัดการ การแก้ไข/อนุมัติยังทำในระบบ TDBM เอง")}
        actions={
          <Button variant="secondary" onClick={handleSyncNow} isPending={syncing} disabled={syncing}>
            <RefreshCw size={14} /> {t("ซิงก์ตอนนี้")}
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <div className="text-xs text-muted">{t("ภาคเรียนที่ดู")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {!loaded ? <SkelValue className="h-6 w-16" /> : term ? `${term.academic_year}/${term.semester}` : "—"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="text-xs text-muted">{t("รายการวันสอนชดเชยที่ดึงมาได้")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {rows ? t("{n} รายการ", { n: rows.length }) : (listKey || !loaded) && !error ? <SkelValue className="h-6 w-24" /> : "—"}
            {rows && rows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted">{t("จับคู่กลุ่มเรียนได้ {n} รายการ", { n: matchedCount })}</span>
            )}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="text-xs text-muted">{t("ซิงก์ล่าสุด (วันสอนชดเชย)")}</div>
          <div className="mt-1 text-sm">
            {!syncLog ? (
              <Skel className="h-5 w-3/4" />
            ) : lastExtra ? (
              <>
                <span>{formatDateTimeThai(t, formatDateShort, lastExtra.finished_at ?? lastExtra.started_at)}</span>{" "}
                <span className="text-muted">
                  {t("({how}, ดึงมา {n} รายการ)", {
                    how: lastExtra.trigger_kind === "webhook" ? t("TDBM แจ้งมา") : lastExtra.trigger_kind === "scheduler" ? t("อัตโนมัติ") : t("กดเอง"),
                    n: lastExtra.fetched,
                  })}
                </span>
              </>
            ) : (
              <span className="text-muted">{t("ยังไม่เคยซิงก์")}</span>
            )}
          </div>
        </Panel>
      </div>

      {rows && rows.length === 0 && !isLoading && (
        <div className="mt-4">
          <Alert
            status="warning"
            title={t("ยังไม่มีข้อมูลวันสอนชดเชยสำหรับภาคเรียนนี้")}
            description={t("อาจเป็นเพราะยังไม่มีอาจารย์ยื่นคำขอในภาคเรียนนี้ใน TDBM หรือยังไม่เคยซิงก์สำเร็จ — ลองกด “ซิงก์ตอนนี้” ด้านบน")}
          />
        </div>
      )}

      {lastHolidays?.error && (
        <div className="mt-4">
          <Alert status="danger" title={t("ซิงก์วันหยุดล่าสุดล้มเหลว")} description={lastHolidays.error} />
        </div>
      )}
      {lastExtra?.error && (
        <div className="mt-4">
          <Alert status="danger" title={t("ซิงก์วันสอนชดเชยล่าสุดล้มเหลว")} description={lastExtra.error} />
        </div>
      )}

      {/* Holidays first, compensation days after — so a reader scans "what
         needed covering" before "what got filed", the actual comparison. */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold">
          {t("วันหยุดในภาคเรียนนี้")} {holidays && <span className="font-normal text-muted">{t("({n} วัน)", { n: holidays.length })}</span>}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {t("วันหยุดทั้งหมดในช่วงวันที่ของภาคเรียนนี้ (ไม่ใช่แค่ที่มาจาก TDBM) — ไว้เทียบกับรายการวันสอนชดเชยด้านล่างว่าวันไหนยังไม่มีใครยื่นชดเชย")}
        </p>
        <div className="mt-2">
          <DataTable
            ariaLabel={t("วันหยุดในภาคเรียนนี้")}
            columns={holidayColumns}
            rows={holidays}
            rowKey={h => h.id}
            // DataTable only draws its skeleton while `loading` is set; without
            // it the "ไม่มีวันหยุด" empty state flashed before /holidays landed.
            loading={(!loaded || !allHolidays) && !holidaysError}
            pageSize={50}
            initialSort={{ column: "date", direction: "ascending" }}
            emptyTitle={t("ไม่มีวันหยุดในภาคเรียนนี้")}
            emptyDescription={t("ยังไม่มีวันหยุดถูกบันทึกในช่วงวันที่ของภาคเรียนที่เลือก")}
          />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">{t("วันสอนชดเชยที่ TDBM ส่งมา")}</h2>
        <div className="mt-2">
          <DataTable
            ariaLabel={t("รายการวันสอนชดเชยจาก TDBM")}
            columns={columns}
            rows={rows}
            rowKey={r => r.extra_class_id}
            searchFn={r => `${r.course_code ?? ""} ${r.matched_course_code ?? ""} ${r.matched_course_name ?? ""} ${r.owner_teacher_name ?? ""}`}
            searchPlaceholder={t("ค้นหารหัสวิชา หรือชื่ออาจารย์…")}
            filters={filters}
            pageSize={20}
            initialSort={{ column: "class_date", direction: "descending" }}
            loading={isLoading || !loaded}
            error={error}
            emptyTitle={t("ไม่มีข้อมูล")}
            emptyDescription={t("ยังไม่มีรายการวันสอนชดเชยสำหรับภาคเรียนที่เลือก")}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Database size={13} /> {t("ซิงก์อัตโนมัติทุกชั่วโมง และทันทีเมื่อ TDBM แจ้งมา (webhook) — ไม่ต้องกด “ซิงก์ตอนนี้” เอง เว้นแต่ต้องการเช็คทันที")}
      </div>
    </div>
  );
}
