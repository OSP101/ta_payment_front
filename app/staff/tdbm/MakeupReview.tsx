"use client";

import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n/client";
import { Alert, Button, Select } from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

export interface MatchOption {
  section_id: string;
  original_date: string;
  holiday_name: string;
  kind: string;
  start_time: string;
  end_time: string;
  blocked: boolean;
}

export interface ReviewTeaching {
  extra_class_id: number;
  class_date: string;
  start_time?: string;
  end_time?: string;
  course_code?: string;
  section_label?: string;
  matched_course_code?: string;
  matched_course_name?: string;
  matched_sec_no?: string;
  matched_section_id?: string;
  original_holiday_date?: string;
  resolution_reason?: string;
  opt_status: string;
  match_options?: MatchOption[];
}

const optionKey = (o: MatchOption) => `${o.section_id}/${o.original_date}/${o.kind}`;

export default function MakeupReview({ rows, academicYear, semester, onSaved }: {
  rows: ReviewTeaching[];
  academicYear: number;
  semester: number;
  onSaved: () => Promise<unknown>;
}) {
  const { t, fmtDate } = useI18n();
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
  const pending = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (r.original_holiday_date || r.opt_status === "C") return false;
      // Merged course aliases describe the same sitting. Review it once;
      // the server links every alias in the same transaction.
      if (!r.matched_section_id) return true;
      const key = `${r.matched_section_id}/${r.class_date}/${r.start_time}/${r.end_time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows]);
  const selected = pending.flatMap(r => {
    const o = r.match_options?.find(o => !o.blocked && optionKey(o) === choices[r.extra_class_id]);
    return o ? [{ extra_class_id: r.extra_class_id, original_date: o.original_date, kind: o.kind }] : [];
  });
  const selectedKeys = pending.flatMap(r => selected.some(s => s.extra_class_id === r.extra_class_id) ? [choices[r.extra_class_id]] : []);
  const duplicate = new Set(selectedKeys).size !== selectedKeys.length;
  const stale = Object.values(choices).filter(Boolean).length !== selected.length;

  async function save() {
    if (!selected.length || saving || stale || duplicate) return;
    setSaving(true);
    setError("");
    setSaved(0);
    try {
      const result = await api.post<{ matched: number }>("/tdbm/match-makeups", {
        academic_year: academicYear, semester, items: selected,
      });
      setChoices({});
      setSaved(result.matched);
      try { await onSaved(); } catch {
        setError(t("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      setSaving(false);
    }
  }

  const columns: DataColumn<ReviewTeaching>[] = [
    {
      id: "course", label: t("วิชา / กลุ่ม"), width: 210, isRowHeader: true,
      render: r => <div>
        <span className="font-medium">{r.matched_course_code ?? r.course_code ?? "—"}</span>{" "}
        {r.matched_sec_no ? t("กลุ่ม {n}", { n: r.matched_sec_no }) : r.section_label}
        <div className="mt-1 text-xs text-muted">{r.matched_course_name}</div>
      </div>,
    },
    {
      id: "makeup", label: t("วันที่สอนชดเชย"), width: 170,
      render: r => <div>{fmtDate(r.class_date)}<div className="mt-1 text-muted tabular-nums">{r.start_time ?? "—"}–{r.end_time ?? "—"}</div></div>,
    },
    {
      id: "original", label: t("เลือกคาบวันหยุดเดิม"), width: 350,
      render: r => <div className="min-w-0">
        <Select
          aria-label={t("คาบวันหยุดเดิมของรายการ {id}", { id: r.extra_class_id })}
          className="w-full max-w-full"
          value={choices[r.extra_class_id] ?? ""}
          disabled={saving || !r.match_options?.some(o => !o.blocked)}
          onChange={e => { setChoices(prev => ({ ...prev, [r.extra_class_id]: e.target.value })); setSaved(0); }}
        >
          <option value="">{t("เลือกคาบที่รายการนี้ชดเชยแทน…")}</option>
          {r.match_options?.map(o => <option key={optionKey(o)} value={optionKey(o)}
            disabled={o.blocked || (selectedKeys.includes(optionKey(o)) && choices[r.extra_class_id] !== optionKey(o))}>
            {fmtDate(o.original_date)} · {o.kind === "lecture" ? t("บรรยาย") : t("ปฏิบัติการ")} {o.start_time}–{o.end_time} · {o.holiday_name}{o.blocked ? ` (${t("มีชั่วโมงที่ส่งแล้ว")})` : ""}
          </option>)}
        </Select>
        <p className="mt-1 text-xs text-muted break-words">{r.resolution_reason ? t(r.resolution_reason) : t("กรุณาโหลดข้อมูลใหม่เพื่อดูคาบที่จับคู่ได้")}</p>
      </div>,
    },
  ];

  return <section className="mt-6" aria-labelledby="makeup-review-heading">
    <h2 id="makeup-review-heading" className="text-sm font-semibold">{t("จับคู่คาบวันหยุดที่ยังค้าง")} <span className="font-normal text-muted">{t("({n} รายการ)", { n: pending.length })}</span></h2>
    <p className="mt-1 max-w-prose text-sm text-muted">{t("เลือกคาบวันหยุดเดิมให้แต่ละรายการ แล้วบันทึกพร้อมกันได้สูงสุด 100 รายการ คาบบรรยายและปฏิบัติการเลือกวันชดเชยแยกกันได้")}</p>
    <div className="mt-3">
      <DataTable ariaLabel={t("รายการรอจับคู่คาบวันหยุด")} rows={pending} columns={columns}
        rowKey={r => r.extra_class_id} pageSize={10}
        searchFn={r => `${r.matched_course_code ?? r.course_code ?? ""} ${r.matched_course_name ?? ""} ${r.matched_sec_no ?? ""}`}
        searchPlaceholder={t("ค้นหาวิชาหรือกลุ่มเรียน…")}
        emptyTitle={t("ไม่มีรายการรอจับคู่")}
        emptyDescription={t("รายการสอนชดเชยทั้งหมดจับคู่แล้ว หรือถูกยกเลิกใน TDBM")} />
    </div>
    {selected.length > 100 && <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">{t("เลือกได้ครั้งละไม่เกิน 100 รายการ กรุณาลดจำนวนที่เลือก")}</p>}
    {(stale || duplicate) && <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">{t("คาบที่เลือกซ้ำหรือข้อมูลเปลี่ยนแล้ว กรุณาเลือกคาบใหม่ก่อนบันทึก")}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button onClick={save} isPending={saving} disabled={!selected.length || selected.length > 100 || stale || duplicate}>
        {t("บันทึกการจับคู่ {n} รายการ", { n: selected.length })}
      </Button>
      <Button variant="secondary" disabled={saving || !Object.values(choices).some(Boolean)} onClick={() => setChoices({})}>{t("ล้างที่เลือก")}</Button>
      <span className="text-xs text-muted">{t("รวมรายการที่เลือกจากทุกหน้าของตาราง")}</span>
    </div>
    {error && <div className="mt-3"><Alert status="danger" title={saved > 0 ? t("โหลดข้อมูลล่าสุดไม่สำเร็จ") : t("ยังไม่ได้บันทึกการจับคู่")} description={error} /></div>}
    {saved > 0 && <p role="status" className="mt-3 text-sm text-success-soft-foreground">{t("บันทึกการจับคู่แล้ว {n} รายการ", { n: saved })}</p>}
  </section>;
}
