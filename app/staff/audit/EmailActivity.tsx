"use client";

import { Button, Panel, SelectField } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { msg, useI18n } from "../../lib/i18n/client";
import type { Row } from "./types";

export const EMAIL_STATES = [
  ["", msg("ทุกขั้นตอน")],
  ["queued", msg("เข้าคิวรอส่ง")],
  ["started", msg("เริ่มส่ง")],
  ["accepted", msg("SMTP รับแล้ว")],
  ["skipped", msg("ข้ามการส่ง")],
  ["failed", msg("ส่งไม่สำเร็จ")],
  ["retry", msg("รอลองส่งอีกครั้ง")],
  ["exhausted", msg("หยุดส่งหลังครบ 5 ครั้ง")],
] as const;

interface Delivery {
  to?: string;
  recipient_name?: string;
  recipient_id?: string;
  subject?: string;
  from?: string;
  source?: string;
  job_id?: string;
  attempt?: number;
  started_at?: string;
  finished_at?: string;
  retry_at?: string;
  duration_ms?: number;
  error?: string;
}

export function EmailActivity({ rows, total, page, pageSize, loading, error, onRetry, onPage, onOpen, state, onState, job, onJob }: {
  rows?: Row[]; total: number; page: number; pageSize: number; loading: boolean; error?: unknown;
  onRetry: () => void; onPage: (page: number) => void; onOpen: (row: Row) => void;
  state: string; onState: (state: string) => void; job: string; onJob: (job: string) => void;
}) {
  const { t, intl } = useI18n();
  const date = (iso: string) => new Intl.DateTimeFormat(intl, {
    timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(iso));
  const data = (r: Row) => (r.after ?? {}) as Delivery;
  const columns: DataColumn<Row>[] = [
    { id: "at", label: t("เวลา (ประเทศไทย)"), render: r => <time dateTime={r.at} className="whitespace-nowrap tabular-nums">{date(r.at)}</time> },
    { id: "recipient", label: t("ผู้รับ"), isRowHeader: true, render: r => {
      const d = data(r);
      return <div className="max-w-72 break-words"><div className="font-medium">{d.recipient_name || d.to || t("ดูบัญชีผู้รับในรายละเอียด")}</div>{d.recipient_name && d.to && <div className="text-sm text-(--ink-2)">{d.to}</div>}</div>;
    } },
    { id: "subject", label: t("หัวข้อและวิธีส่ง"), render: r => {
      const d = data(r);
      return <div className="max-w-96 break-words"><button type="button" className="text-left font-medium text-(--tone-brand-ink) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-(--brand)" onClick={() => onOpen(r)}>{d.subject || r.label}</button>
        <div className="mt-1 text-sm text-(--ink-2)">{(d.source === "outbox" ? t("ส่งผ่านคิวอัตโนมัติ") : d.source === "test" ? t("อีเมลทดสอบ") : d.source === "notification" ? t("ส่งแจ้งเตือนทันที") : t("ส่งตรงผ่าน SMTP"))}{d.attempt ? <span> · {t("ครั้งที่ {n}", { n: d.attempt })}</span> : null}</div>
        {d.from && <div className="text-sm text-(--ink-2)">{t("จาก {email}", { email: d.from })}</div>}
      </div>;
    } },
    { id: "status", label: t("ผลการทำงาน"), render: r => {
      const d = data(r);
      const label = EMAIL_STATES.find(([id]) => r.action === `mail.delivery.${id}`)?.[1];
      return <div className="max-w-96 break-words"><span className={r.outcome === "failed" ? "font-medium text-danger-soft-foreground" : "font-medium"}>{label ? t(label) : r.label}</span>
        {d.finished_at && <div className="mt-1 text-sm text-(--ink-2)">{t("ใช้เวลา {n} มิลลิวินาที", { n: d.duration_ms ?? 0 })}</div>}
        {r.action === "mail.delivery.retry" && d.retry_at && <div className="text-sm text-(--ink-2)">{t("ลองอีกครั้ง {date}", { date: date(d.retry_at) })}</div>}
        {d.error && <p className="mt-1 text-sm text-danger-soft-foreground">{t(d.error)}</p>}
        {r.action === "mail.delivery.skipped" && <p className="mt-1 text-sm text-(--ink-2)">{t("ยังไม่ได้เปิดใช้งาน SMTP จึงไม่ได้ส่งอีเมลออกไป")}</p>}
        <div className="mt-2 flex flex-wrap gap-3"><button type="button" className="text-sm text-(--tone-brand-ink) underline underline-offset-4" onClick={() => onOpen(r)}>{t("รายละเอียด")}</button>{d.job_id && <button type="button" className="text-sm text-(--tone-brand-ink) underline underline-offset-4" onClick={() => onJob(d.job_id!)}>{t("ดูทุกครั้งของคิวนี้")}</button>}</div>
      </div>;
    } },
  ];
  return <Panel>
    <h2 className="text-lg font-semibold">{t("ติดตามการส่งอีเมล")}</h2>
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-(--ink-2)">{t("เมื่อมีเหตุการณ์ ระบบเลือกผู้รับตามงานนั้นแล้วส่งทันที หรือเข้าคิวที่ตรวจทุก 1 วินาที หากคิวส่งไม่สำเร็จจะลองใหม่หลัง 1, 4, 9 และ 16 นาที รวมไม่เกิน 5 ครั้ง")}</p>
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-(--ink-2)">{t("SMTP รับแล้ว หมายถึงเซิร์ฟเวอร์รับอีเมลไปส่งต่อ ยังยืนยันไม่ได้ว่าเข้ากล่องจดหมายหรือผู้รับเปิดอ่าน รายการเริ่มบันทึกเมื่ออัปเดตระบบนี้ และหนึ่งอีเมลมีได้หลายขั้นตอน")}</p>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <SelectField label={t("ขั้นตอนการส่ง")} value={state} onChange={onState} options={EMAIL_STATES.map(([id, label]) => ({ id, label: t(label) }))} className="w-56" />
      <Button variant="outline" onPress={onRetry} isPending={loading}>{t("รีเฟรช")}</Button>
      {job && <Button variant="outline" onPress={() => onJob("")}>{t("เลิกดูเฉพาะคิวนี้")}</Button>}
    </div>
    {job && <p className="mb-3 break-all text-sm text-(--ink-2)">{t("คิว {id}", { id: job })}</p>}
    <DataTable<Row> ariaLabel={t("ประวัติการส่งอีเมล")} rows={error ? undefined : rows} rowKey={r => r.id} columns={columns}
      loading={loading} error={error} onRetry={onRetry} pageSize={pageSize}
      emptyTitle={t("ไม่พบประวัติการส่งอีเมลในช่วงนี้")}
      emptyDescription={t("ลองขยายช่วงเวลาหรือล้างตัวกรอง ประวัติก่อนอัปเดตระบบอาจไม่ได้บันทึกไว้")}
      server={{ total, page, onPageChange: onPage, query: "", onQueryChange: () => {}, filterValues: {}, onFilterChange: () => {}, sort: { column: "at", direction: "descending" }, onSortChange: () => {} }} />
  </Panel>;
}
