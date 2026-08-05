"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Plus, Trash2, Pencil, Upload, AlertTriangle, CalendarOff, RefreshCw, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, TextInput, Select, Modal, FieldGroup, EmptyState,
  Chip, ConfirmDialog, Alert, type ChipTone,
  DatePicker, TimePicker,
} from "../../components/ui";

interface Holiday {
  id: string;
  holiday_date: string;
  name_th: string;
  name_en?: string;
  source: "national" | "university" | "faculty" | "custom";
  note?: string;
  /** "HH:MM" window. Both absent = closed all day (every national/university
   *  holiday, and the only shape that existed before migration 0058). When set,
   *  only class periods overlapping the window are blocked. */
  start_time?: string;
  end_time?: string;
  created_at: string;
}

// Which holiday types may be entered as a partial day. A national or university
// holiday closes the whole institution; a คณะ closure is the one that routinely
// occupies only part of the day (a morning ceremony, an afternoon sports event),
// which is exactly the case this form exists to capture. The API accepts a
// window on any source — this is a data-entry guardrail, not a rule.
const PARTIAL_DAY_SOURCES: Holiday["source"][] = ["faculty"];

// "09:00–12:00" or "ทั้งวัน" — one renderer so the table, the form preview and
// the confirm dialog cannot disagree.
function windowLabel(h: { start_time?: string; end_time?: string }): string {
  if (!h.start_time || !h.end_time) return "ทั้งวัน";
  return `${h.start_time.slice(0, 5)}–${h.end_time.slice(0, 5)}`;
}

const SOURCE_LABEL: Record<Holiday["source"], string> = {
  national: "ราชการ",
  university: "มหาวิทยาลัย",
  faculty: "คณะ",
  custom: "อื่นๆ",
};
const SOURCE_TONE: Record<Holiday["source"], ChipTone> = {
  national: "danger",
  university: "warn",
  faculty: "brand",
  custom: "neutral",
};
// ตัวเลือกประเภทวันหยุด — ใช้ร่วมกันทั้งฟอร์มเพิ่มและนำเข้าหลายรายการ
const SOURCE_OPTIONS: { value: Holiday["source"]; label: string }[] = [
  { value: "national", label: "ราชการ" },
  { value: "university", label: "มหาวิทยาลัย" },
  { value: "faculty", label: "คณะ" },
  { value: "custom", label: "อื่นๆ" },
];
// เครื่องหมายบอกช่องที่จำเป็นต้องกรอก
const RequiredMark = () => <span className="text-danger"> *</span>;

const MONTH_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Convert "YYYY-MM-DD" → "15 กรกฎาคม 2569 (พุธ)" for the table display.
function formatThaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = MONTH_TH[d.getMonth()];
  const year = d.getFullYear() + 543;
  const dow = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][d.getDay()];
  return `${day} ${month} ${year} (${dow})`;
}

export default function StaffHolidaysPage() {
  // Default to the current CE year — Buddhist-era offset applied at display.
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { data: holidays, isLoading } = useSWR<Holiday[]>(
    `/holidays?year=${year}`,
  );
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Year picker options — show current ±3 years so staff can jump between the
  // active term and next-year planning without typing.
  const yearOpts = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now - 2; y <= now + 3; y++) out.push(y);
    return out;
  }, []);

  async function refresh() {
    await mutate(`/holidays?year=${year}`);
  }

  async function handleSyncFromBOT() {
    setSyncing(true);
    try {
      const res = await api.post<{
        fetched: number; inserted: number; updated: number; skipped: number;
      }>(`/holidays/sync-from-bot?year=${year}`);
      notify.success(
        `ซิงก์จาก BOT สำเร็จ — เพิ่มใหม่ ${res.inserted}, อัปเดต ${res.updated}, ข้าม ${res.skipped} จากทั้งหมด ${res.fetched}`,
      );
      await refresh();
    } catch (e) {
      notify.error(e);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/holidays/${confirmDelete.id}`);
      notify.success("ลบวันหยุดแล้ว");
      await refresh();
    } catch (e) {
      notify.error(e);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<number, Holiday[]>();
    for (const h of holidays ?? []) {
      const mo = Number(h.holiday_date.slice(5, 7));
      if (!m.has(mo)) m.set(mo, []);
      m.get(mo)!.push(h);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [holidays]);

  return (
    <div>
      <PageHeader
        title="วันหยุดราชการ"
        description="รายการวันหยุดที่ระบบใช้ตรวจสอบการลงเวลาปฏิบัติงานของ TA — ถ้าคาบเรียนตรงกับวันหยุด TA จะลงชั่วโมงไม่ได้จนกว่าอาจารย์จะระบุวันชดเชย"
        actions={
          <>
            <span data-tour="holidays-sync" className="flex gap-2">
              <Select value={String(year)} onChange={e => setYear(Number(e.target.value))} className="max-w-40">
                {yearOpts.map(y => (
                  <option key={y} value={y}>ปี พ.ศ. {y + 543}</option>
                ))}
              </Select>
              <Button variant="secondary" onClick={handleSyncFromBOT} isPending={syncing} disabled={syncing}>
                <RefreshCw size={14} /> ซิงก์จาก BOT (ปี พ.ศ. {year + 543})
              </Button>
            </span>
            <span data-tour="holidays-add" className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowBulk(true)}>
                <Upload size={14} /> นำเข้าหลายรายการ
              </Button>
              <Button variant="primary" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> เพิ่มวันหยุด
              </Button>
            </span>
          </>
        }
      />

      <Alert
        status="warning"
        icon={<AlertTriangle size={14} />}
        title="กด “ซิงก์จาก BOT” เพื่อดึงวันหยุดจันทรคติ/วันชดเชยของปีนี้"
        description="ระบบใช้ข้อมูลจากธนาคารแห่งประเทศไทย (BOT) ครอบคลุมวันหยุดพุทธศาสนา (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) และวันชดเชย — การซิงก์ซ้ำจะไม่ทับชื่อที่ staff แก้ไว้ ส่วนวันหยุดพิเศษที่ ครม. ประกาศเพิ่มภายหลัง อาจต้องเพิ่มด้วยตนเอง"
      />

      <div className="mt-4">
        {isLoading && !holidays ? (
          <Panel>
            <div className="flex justify-center py-10 text-sm text-muted">กำลังโหลด…</div>
          </Panel>
        ) : !holidays || holidays.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<CalendarOff size={28} />}
              title="ยังไม่มีวันหยุดในปีนี้"
              description={`กด "เพิ่มวันหยุด" หรือ "นำเข้าหลายรายการ" เพื่อเริ่มต้น`}
            />
          </Panel>
        ) : (
          <div data-tour="holidays-list" className="flex flex-col gap-3">
            {grouped.map(([monthNo, rows], idx) => (
              <MonthSection
                key={monthNo}
                monthNo={monthNo}
                year={year}
                rows={rows}
                defaultOpen={
                  year === new Date().getFullYear()
                    ? monthNo === new Date().getMonth() + 1
                    : idx === 0
                }
                onEdit={setEditing}
                onDelete={setConfirmDelete}
              />
            ))}
          </div>
        )}
      </div>

      <HolidayFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={async () => { setShowAdd(false); await refresh(); }}
        initial={null}
      />
      <HolidayFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await refresh(); }}
        initial={editing}
      />
      <BulkImportModal
        open={showBulk}
        onClose={() => setShowBulk(false)}
        onSaved={async n => { setShowBulk(false); notify.success(`เพิ่ม ${n} วันหยุด`); await refresh(); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        isPending={deleting}
        danger
        title="ลบวันหยุด"
        confirmLabel="ลบ"
        message={confirmDelete
          ? `ต้องการลบ "${confirmDelete.name_th}" (${formatThaiDate(confirmDelete.holiday_date)}) หรือไม่? การลบจะมีผลทันที และการลงเวลาของ TA ในวันนี้จะไม่ถูกบล็อกอีกต่อไป`
          : ""}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthSection — one collapsible month panel. Collapsed by default (only the
// current month opens) so the list stays short instead of showing every month.
// ---------------------------------------------------------------------------

function MonthSection({
  monthNo, year, rows, defaultOpen, onEdit, onDelete,
}: {
  monthNo: number;
  year: number;
  rows: Holiday[];
  defaultOpen: boolean;
  onEdit: (h: Holiday) => void;
  onDelete: (h: Holiday) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Panel padded={false}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-(--surface-2) transition rounded-lg"
      >
        <ChevronDown size={18} className={`shrink-0 text-muted transition ${open ? "" : "-rotate-90"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{MONTH_TH[monthNo - 1]} {year + 543}</div>
          <div className="text-xs text-muted mt-0.5">{rows.length} วันหยุด</div>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-(--hairline) border-t border-(--hairline)">
          {rows.map(h => (
            <div key={h.id} className="flex items-center gap-3 p-4">
              <div className="w-64 shrink-0">
                <div className="text-sm font-medium">{formatThaiDate(h.holiday_date)}</div>
                <div className="text-xs text-muted mt-0.5 flex items-center gap-1 flex-wrap">
                  <Chip tone={SOURCE_TONE[h.source]}>{SOURCE_LABEL[h.source]}</Chip>
                  {/* Only labelled when partial: tagging every national holiday
                      "ทั้งวัน" would bury the handful of rows that aren't. */}
                  {h.start_time && h.end_time && (
                    <Chip tone="info">🕒 {windowLabel(h)}</Chip>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{h.name_th}</div>
                {h.name_en && <div className="text-xs text-muted">{h.name_en}</div>}
                {h.note && <div className="text-xs text-muted mt-1">{h.note}</div>}
              </div>
              <IconButton label="แก้ไข" variant="ghost" size="sm" onClick={() => onEdit(h)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton label="ลบ" variant="ghost" size="sm" onClick={() => onDelete(h)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// HolidayFormModal — add or edit a single holiday.
// ---------------------------------------------------------------------------

function HolidayFormModal({
  open, onClose, onSaved, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  initial: Holiday | null;
}) {
  const isEdit = !!initial;
  const [date, setDate] = useState(initial?.holiday_date ?? "");
  const [nameTH, setNameTH] = useState(initial?.name_th ?? "");
  const [nameEN, setNameEN] = useState(initial?.name_en ?? "");
  const [source, setSource] = useState<Holiday["source"]>(initial?.source ?? "custom");
  const [note, setNote] = useState(initial?.note ?? "");
  // Whole-day vs partial. Derived from the row on open rather than kept on the
  // server as a third state: "has a window" is the same fact, and two ways to
  // say it drift apart.
  const [partial, setPartial] = useState(!!initial?.start_time);
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? "12:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on (re)open so a fresh add doesn't inherit a stale edit target.
  useMemo(() => {
    if (!open) return;
    setDate(initial?.holiday_date ?? "");
    setNameTH(initial?.name_th ?? "");
    setNameEN(initial?.name_en ?? "");
    setSource(initial?.source ?? "custom");
    setNote(initial?.note ?? "");
    setPartial(!!initial?.start_time);
    setStartTime(initial?.start_time?.slice(0, 5) ?? "08:00");
    setEndTime(initial?.end_time?.slice(0, 5) ?? "12:00");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  // The window is offered for คณะ closures (see PARTIAL_DAY_SOURCES) and kept
  // visible for any existing row that already carries one, so an edit can never
  // silently erase a window the UI decided not to render.
  const canBePartial = PARTIAL_DAY_SOURCES.includes(source) || !!initial?.start_time;
  const usePartial = partial && canBePartial;

  async function handleSave() {
    setError(null);
    if (!date) { setError("กรุณาระบุวันที่"); return; }
    if (!nameTH.trim()) { setError("กรุณาระบุชื่อวันหยุด"); return; }
    if (usePartial) {
      if (!startTime || !endTime) { setError("กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดของช่วงวันหยุด"); return; }
      if (startTime >= endTime) { setError("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม"); return; }
    }
    // null (not omitted) so switching a partial holiday back to ทั้งวัน clears
    // the stored window instead of leaving the old one in place.
    const window = usePartial
      ? { start_time: startTime, end_time: endTime }
      : { start_time: null, end_time: null };
    setSaving(true);
    try {
      if (isEdit && initial) {
        await api.patch(`/holidays/${initial.id}`, {
          name_th: nameTH.trim(),
          name_en: nameEN.trim() || null,
          note: note.trim() || null,
          ...window,
        });
      } else {
        await api.post("/holidays", {
          holiday_date: date,
          name_th: nameTH.trim(),
          name_en: nameEN.trim() || null,
          source,
          note: note.trim() || null,
          ...window,
        });
      }
      await onSaved();
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "แก้ไขวันหยุด" : "เพิ่มวันหยุด"}
      icon={<CalendarOff size={18} />}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSave} isPending={saving} disabled={saving}>บันทึก</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldGroup
          label={<>วันที่<RequiredMark /></>}
          hint={isEdit ? "แก้วันที่ไม่ได้ — ต้องลบแล้วเพิ่มใหม่ (เพื่อรักษา audit)" : undefined}
        >
          <DatePicker value={date} onChange={setDate} label="วันที่" isDisabled={isEdit} />
        </FieldGroup>
        <FieldGroup label={<>ชื่อวันหยุด (ไทย)<RequiredMark /></>}>
          <TextInput value={nameTH} onChange={e => setNameTH(e.target.value)} placeholder="เช่น วันแม่แห่งชาติ" autoFocus />
        </FieldGroup>
        <FieldGroup label="ชื่อวันหยุด (อังกฤษ, ระบุก็ได้)">
          <TextInput value={nameEN} onChange={e => setNameEN(e.target.value)} placeholder="e.g. Mother's Day" />
        </FieldGroup>
        <FieldGroup
          label={<>ประเภท<RequiredMark /></>}
          hint={PARTIAL_DAY_SOURCES.includes(source)
            ? "วันหยุดของคณะมักไม่ได้หยุดทั้งวัน — ระบุช่วงเวลาได้ด้านล่าง"
            : undefined}
        >
          <Select value={source} onChange={e => setSource(e.target.value as Holiday["source"])} disabled={isEdit}>
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FieldGroup>

        {/* Partial-day window. Offered for คณะ closures, where a whole-day row is
            usually wrong: an activity runs in the morning and the afternoon still
            teaches. Recorded as all-day, the system cancels both periods and then
            refuses the obvious makeup slot — the free half of the same day. */}
        {canBePartial && (
          <FieldGroup
            label="ช่วงเวลาที่หยุด"
            hint={usePartial
              ? "คาบเรียนที่คาบเกี่ยวกับช่วงนี้เท่านั้นที่จะถูกงด — คาบนอกช่วงยังเรียนและลงเวลาได้ตามปกติ และใช้เป็นเวลาชดเชยในวันเดียวกันได้"
              : "หยุดทั้งวัน — ทุกคาบของวันนี้จะถูกงด"}
          >
            <div className="flex flex-col gap-2">
              <Select
                value={usePartial ? "partial" : "all"}
                onChange={e => setPartial(e.target.value === "partial")}
              >
                <option value="all">หยุดทั้งวัน</option>
                <option value="partial">ระบุช่วงเวลา (หยุดบางช่วง)</option>
              </Select>
              {usePartial && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="เวลาเริ่ม">
                    <TimePicker value={startTime} onChange={setStartTime} label="เวลาเริ่มของช่วงวันหยุด" />
                  </FieldGroup>
                  <FieldGroup label="เวลาสิ้นสุด">
                    <TimePicker value={endTime} onChange={setEndTime} label="เวลาสิ้นสุดของช่วงวันหยุด" />
                  </FieldGroup>
                </div>
              )}
            </div>
          </FieldGroup>
        )}

        <FieldGroup label="หมายเหตุ (ระบุก็ได้)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ประกาศเพิ่มจาก ครม. เมื่อ ..." />
        </FieldGroup>
        {error && <Alert status="danger" title={error} icon={<AlertTriangle size={14} />} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// BulkImportModal — paste multi-line text (YYYY-MM-DD | ชื่อวันหยุด) for
// quick end-of-year seeding.
// ---------------------------------------------------------------------------

function BulkImportModal({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (inserted: number) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<Holiday["source"]>("national");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError("กรุณาระบุอย่างน้อย 1 บรรทัด"); return; }
    // Parse each line as "YYYY-MM-DD | ชื่อวันหยุด", optionally followed by a
    // "| HH:MM-HH:MM" window for a partial-day closure. Without the optional
    // third field, pasting a คณะ calendar would flatten every half-day activity
    // into a full-day closure — the exact mistake the single-entry form now
    // avoids.
    const rows: {
      holiday_date: string; name_th: string; source: string;
      start_time?: string; end_time?: string;
    }[] = [];
    const pad = (t: string) => (t.length === 4 ? "0" + t : t);
    for (const line of lines) {
      const m = /^(\d{4}-\d{2}-\d{2})\s*[|\t\s]\s*(.+)$/.exec(line);
      if (!m) {
        setError(`บรรทัดไม่ถูกต้อง: "${line}" — รูปแบบต้องเป็น "YYYY-MM-DD | ชื่อวันหยุด"`);
        return;
      }
      let nameTH = m[2].trim();
      const win = /^(.*?)\s*\|\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(nameTH);
      if (!win) {
        rows.push({ holiday_date: m[1], name_th: nameTH, source });
        continue;
      }
      nameTH = win[1].trim();
      const start = pad(win[2]);
      const end = pad(win[3]);
      if (!nameTH) {
        setError(`บรรทัดไม่ถูกต้อง: "${line}" — ขาดชื่อวันหยุด`);
        return;
      }
      if (start >= end) {
        setError(`บรรทัดไม่ถูกต้อง: "${line}" — เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม`);
        return;
      }
      rows.push({ holiday_date: m[1], name_th: nameTH, source, start_time: start, end_time: end });
    }
    setBusy(true);
    try {
      const res = await api.post<{ inserted: number; total: number }>("/holidays/bulk", rows);
      await onSaved(res.inserted);
      setText("");
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="นำเข้าหลายรายการ"
      icon={<Upload size={18} />}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleImport} isPending={busy} disabled={busy}>นำเข้า</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldGroup
          label="รายการ (บรรทัดละ 1 วันหยุด)"
          hint="รูปแบบ: YYYY-MM-DD | ชื่อวันหยุด — เติม | HH:MM-HH:MM ต่อท้ายถ้าหยุดแค่บางช่วง (เว้นไว้ = หยุดทั้งวัน)"
        >
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-(--hairline) px-3 py-2 font-mono text-sm bg-surface"
            placeholder="2027-01-01 | วันขึ้นปีใหม่&#10;2027-04-13 | วันสงกรานต์&#10;2027-08-12 | กีฬาสีคณะ | 08:00-12:00"
          />
        </FieldGroup>
        <FieldGroup label="ประเภทของรายการทั้งหมด">
          <Select value={source} onChange={e => setSource(e.target.value as Holiday["source"])}>
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FieldGroup>
        {error && <Alert status="danger" title={error} icon={<AlertTriangle size={14} />} />}
        <Alert
          status="default"
          title="รายการที่ซ้ำกับที่มีอยู่จะถูกข้าม (ON CONFLICT DO NOTHING)"
          description="ระบบจะรายงานจำนวนที่เพิ่มจริงหลังนำเข้าเสร็จ"
        />
      </div>
    </Modal>
  );
}
