"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Save, CheckCircle2, Plus, Trash2, Pencil, AlertTriangle, Clock, Calendar } from "lucide-react";
import { api, type Term } from "../../lib/api";
import ScheduleGrid, {
  type Block, type BlockKind, type DraftRange,
  KIND_LABEL, blockTitle,
} from "../../components/ScheduleGrid";
import {
  PageHeader, Panel, Select, Modal, Button, TextInput, FieldGroup, EmptyState, Alert,
} from "../../components/ui";
import { LockedActionButton, useTAApproval } from "../TAGate";

// Day-of-week labels: Sun=0..Sat=6
const DOW_LABEL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DOW_OPTIONS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun preferred display order

const START_HR = 8;
const END_HR = 20;

// Field constraints — kept in sync with backend validation in ReplaceClasses.
// Course code at KKU is typically a 6–7 digit number; letters/hyphens are
// allowed so codes like "CS101" or "322-201" also fit. Sections use plain
// alphanumeric ids ("01", "1", "A").
const COURSE_CODE_MAX = 16;
const COURSE_NAME_MAX = 120;
const SEC_NO_MAX = 8;
const NOTE_MAX = 200;
const COURSE_CODE_RE = /^[A-Za-z0-9-]*$/;
const SEC_NO_RE = /^[0-9]*$/;

function parseHM(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function inRange(t: string): boolean {
  const m = parseHM(t); return m >= START_HR * 60 && m <= END_HR * 60;
}

// Strip characters not allowed by `re` while typing so the user gets
// immediate feedback instead of a validation error at save time.
function sanitize(v: string, re: RegExp, max: number): string {
  const kept = Array.from(v).filter(ch => re.test(ch)).join("");
  return kept.slice(0, max);
}

// Overlap between two [a,b) intervals
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return parseHM(aStart) < parseHM(bEnd) && parseHM(bStart) < parseHM(aEnd);
}

function emptyBlockFields(): Pick<Block, "course_code" | "course_name" | "kind" | "sec_no" | "note"> {
  return { course_code: "", course_name: "", kind: "", sec_no: "", note: "" };
}

type EditorMode = { kind: "closed" } | { kind: "create"; draft: Partial<Block> } | { kind: "edit"; id: string };

export default function TASchedulePage() {
  const { approved } = useTAApproval();
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => {
    if (!termId && terms && terms.length) {
      setTermId(terms.find(t => t.is_active)?.id ?? terms[0].id);
    }
  }, [terms, termId]);

  const { data: blocks } = useSWR<Block[]>(termId ? `/me/schedule?term_id=${termId}` : null);
  const [local, setLocal] = useState<Block[]>([]);
  useEffect(() => { setLocal(blocks ?? []); }, [blocks]);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorMode>({ kind: "closed" });

  const isWba = local.some(b => b.is_wba);
  const regularBlocks = useMemo(
    () => local.filter(b => !b.is_wba)
      .slice()
      .sort((a, b) => {
        const orderA = DOW_OPTIONS.indexOf(a.day_of_week);
        const orderB = DOW_OPTIONS.indexOf(b.day_of_week);
        return (orderA - orderB) || parseHM(a.start_time) - parseHM(b.start_time);
      }),
    [local],
  );

  // Highlight blocks that overlap another block on same day
  const overlappingIds = useMemo(() => {
    const bad = new Set<string>();
    const byDay = new Map<number, Block[]>();
    for (const b of regularBlocks) {
      const arr = byDay.get(b.day_of_week) ?? [];
      arr.push(b); byDay.set(b.day_of_week, arr);
    }
    for (const arr of byDay.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (overlaps(arr[i].start_time, arr[i].end_time, arr[j].start_time, arr[j].end_time)) {
            bad.add(arr[i].id); bad.add(arr[j].id);
          }
        }
      }
    }
    return bad;
  }, [regularBlocks]);

  function openCreate(draft?: DraftRange) {
    setEditor({
      kind: "create",
      draft: {
        day_of_week: draft?.day_of_week ?? 1,
        start_time: draft?.start_time ?? "09:00",
        end_time: draft?.end_time ?? "10:00",
        ...emptyBlockFields(),
      },
    });
  }
  function openEdit(id: string) {
    if (local.find(b => b.id === id)?.is_wba) return; // WBA block is not directly editable
    setEditor({ kind: "edit", id });
  }
  function closeEditor() { setEditor({ kind: "closed" }); }

  function upsertBlock(b: Block) {
    setLocal(prev => {
      const idx = prev.findIndex(x => x.id === b.id);
      if (idx < 0) return [...prev, b];
      const next = prev.slice(); next[idx] = b; return next;
    });
  }
  function removeBlock(id: string) {
    setLocal(prev => prev.filter(b => b.id !== id));
  }

  function toggleWba(on: boolean) {
    if (on) {
      const hasRegulars = local.some(b => !b.is_wba);
      if (hasRegulars && !window.confirm("การเปิดโหมด WBA จะลบคาบเรียนทั้งหมดที่กรอกไว้ ยืนยันหรือไม่?")) {
        return;
      }
      setLocal([{
        id: "wba-" + Date.now(),
        term_id: termId,
        course_code: "",
        course_name: "WBA / ปี 4",
        kind: "",
        sec_no: "",
        day_of_week: 0,
        start_time: "00:00", end_time: "00:00",
        note: "ไม่มีตารางเรียนปกติ",
        is_wba: true,
      }]);
    } else {
      setLocal(prev => prev.filter(b => !b.is_wba));
    }
  }

  async function save() {
    if (!termId) return;
    for (const b of local) {
      if (b.is_wba) continue;
      if (!inRange(b.start_time) || !inRange(b.end_time)) {
        setErr(`คาบ ${b.start_time}–${b.end_time} อยู่นอกช่วง ${String(START_HR).padStart(2,"0")}:00–${String(END_HR).padStart(2,"0")}:00`);
        return;
      }
      if (parseHM(b.start_time) >= parseHM(b.end_time)) {
        setErr(`คาบ ${blockTitle(b) || "คาบเรียน"} เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม`);
        return;
      }
    }
    if (overlappingIds.size > 0) {
      setErr("มีคาบเรียนทับซ้อนกัน โปรดแก้ไขก่อนบันทึก");
      return;
    }
    setSaving(true); setErr(null);
    try {
      await api.put(`/me/schedule?term_id=${termId}`, local);
      setMsg("บันทึกตารางเรียนเรียบร้อย");
      mutate((k: string) => typeof k === "string" && k.startsWith("/me/schedule"));
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  const editingBlock: Block | null =
    editor.kind === "edit" ? (local.find(b => b.id === editor.id) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="ตารางเรียนของฉัน"
        description="บันทึกตารางเรียนต่อภาคการศึกษา เพื่อใช้ตรวจสอบไม่ให้ทับซ้อนกับตารางสอนที่อาจารย์จะมอบหมาย · ลากบนตารางหรือกดปุ่มเพิ่มคาบเพื่อกรอกข้อมูล"
        actions={
          <>
            <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
              {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
            </Select>
            <Button variant="secondary" onClick={() => openCreate()} disabled={isWba}>
              <Plus size={14} /> เพิ่มคาบเรียน
            </Button>
            <LockedActionButton variant="primary" onClick={save} disabled={saving || overlappingIds.size > 0}>
              <Save size={14} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
            </LockedActionButton>
          </>
        }
      />

      {msg && (
        <div className="mb-3 inline-flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCircle2 size={14} /> {msg}
        </div>
      )}
      {err && (
        <div className="mb-3">
          <Alert status="danger" icon={<AlertTriangle size={16} />} title="บันทึกไม่สำเร็จ" description={err} />
        </div>
      )}
      {!approved && (
        <div className="mb-3 text-xs text-muted">
          * ปุ่มบันทึกจะปลดล็อกหลังเจ้าหน้าที่อนุมัติเอกสารในโปรไฟล์
        </div>
      )}
      {overlappingIds.size > 0 && (
        <div className="mb-3">
          <Alert
            status="warning"
            icon={<AlertTriangle size={16} />}
            title="พบคาบเรียนทับซ้อน"
            description="โปรดแก้ไขคาบที่ไฮไลต์ให้ไม่ทับซ้อนก่อนบันทึก"
          />
        </div>
      )}

      {isWba ? (
        <Panel>
          <EmptyState
            icon={<Calendar size={28} />}
            title="โหมด WBA / นักศึกษาปี 4 — ไม่มีตารางเรียนปกติ"
            description="ระบบจะบันทึกว่าคุณไม่มีคาบเรียนประจำในภาคการศึกษานี้ ปิดสวิตช์ด้านล่างเพื่อกลับไปสร้างตารางเรียน"
          />
        </Panel>
      ) : (
        <ScheduleGrid
          blocks={local}
          onCreateDraft={openCreate}
          onSelectBlock={openEdit}
          disabled={!approved}
        />
      )}

      {!isWba && (
        <Panel title="รายการคาบเรียน" className="mt-4" padded={false}>
          {regularBlocks.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Clock size={24} />}
                title="ยังไม่มีคาบเรียน"
                description="ลากบนตารางเพื่อสร้างคาบ หรือกดปุ่ม “เพิ่มคาบเรียน” เพื่อกรอกข้อมูล"
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--hairline)]">
              {regularBlocks.map(b => {
                const bad = overlappingIds.has(b.id);
                const heading = blockTitle(b);
                return (
                  <div key={b.id} className={"flex items-center gap-3 px-4 py-2.5 " + (bad ? "bg-amber-50" : "")}>
                    <div className="w-20 shrink-0 text-sm text-slate-700">{DOW_LABEL[b.day_of_week]}</div>
                    <div className="w-28 shrink-0 text-sm tabular-nums text-slate-700">
                      {b.start_time}–{b.end_time}
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="font-medium truncate">
                        {heading || <span className="text-muted">(ยังไม่ระบุชื่อวิชา)</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted">
                        {b.sec_no && <span>sec {b.sec_no}</span>}
                        {b.kind && <span>{KIND_LABEL[b.kind]}</span>}
                        {b.note && <span className="truncate">{b.note}</span>}
                      </div>
                    </div>
                    {bad && (
                      <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                        <AlertTriangle size={12} /> ทับซ้อน
                      </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b.id)} aria-label="แก้ไข">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeBlock(b.id)} aria-label="ลบ">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <Panel title="กรณีพิเศษ" className="mt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isWba}
            onChange={e => toggleWba(e.target.checked)}
          />
          <span>ฉันเป็นนักศึกษาปี 4 / WBA (ไม่มีตารางเรียนปกติ)</span>
        </label>
        <p className="text-xs text-muted mt-1">
          เปิดตัวเลือกนี้เมื่อคุณไม่มีตารางเรียนประจำในภาคเรียนนี้ — ระบบจะข้ามการตรวจสอบทับซ้อนตอนอาจารย์ยื่นคำร้อง
        </p>
      </Panel>

      <BlockEditor
        mode={editor}
        block={editingBlock}
        termId={termId}
        onClose={closeEditor}
        onSave={b => { upsertBlock(b); closeEditor(); }}
        onDelete={id => { removeBlock(id); closeEditor(); }}
        checkOverlap={(candidate) => {
          const day = local.filter(x =>
            !x.is_wba && x.day_of_week === candidate.day_of_week && x.id !== candidate.id);
          return day.find(x =>
            overlaps(x.start_time, x.end_time, candidate.start_time, candidate.end_time)) ?? null;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockEditor modal — form input for creating / editing a class block.
// ---------------------------------------------------------------------------

interface EditorProps {
  mode: EditorMode;
  block: Block | null;
  termId: string;
  onClose: () => void;
  onSave: (b: Block) => void;
  onDelete: (id: string) => void;
  checkOverlap: (candidate: Block) => Block | null;
}

function BlockEditor({ mode, block, termId, onClose, onSave, onDelete, checkOverlap }: EditorProps) {
  const isEdit = mode.kind === "edit";
  const isOpen = mode.kind !== "closed";

  const initial: Partial<Block> = mode.kind === "edit"
    ? (block ?? { day_of_week: 1, start_time: "09:00", end_time: "10:00", ...emptyBlockFields() })
    : mode.kind === "create" ? (mode.draft) : {};

  const [courseCode, setCourseCode] = useState(initial.course_code ?? "");
  const [courseName, setCourseName] = useState(initial.course_name ?? "");
  const [kind, setKind] = useState<BlockKind>(initial.kind ?? "");
  const [secNo, setSecNo] = useState(initial.sec_no ?? "");
  const [dow, setDow] = useState<number>(initial.day_of_week ?? 1);
  const [start, setStart] = useState(initial.start_time ?? "09:00");
  const [end, setEnd] = useState(initial.end_time ?? "10:00");
  const [note, setNote] = useState(initial.note ?? "");

  // Reset when opening / switching modes
  useEffect(() => {
    if (!isOpen) return;
    setCourseCode(initial.course_code ?? "");
    setCourseName(initial.course_name ?? "");
    setKind(initial.kind ?? "");
    setSecNo(initial.sec_no ?? "");
    setDow(initial.day_of_week ?? 1);
    setStart(initial.start_time ?? "09:00");
    setEnd(initial.end_time ?? "10:00");
    setNote(initial.note ?? "");
    // Only re-init on mode transition — initial is derived from mode/block
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, isEdit ? block?.id : (mode.kind === "create" ? JSON.stringify(mode.draft) : "")]);

  const [error, setError] = useState<string | null>(null);
  const [overlapWarn, setOverlapWarn] = useState<string | null>(null);

  // Live overlap warning
  useEffect(() => {
    if (!isOpen) return;
    setOverlapWarn(null);
    if (!start || !end) return;
    if (parseHM(start) >= parseHM(end)) return;
    const candidate: Block = {
      id: isEdit ? (block?.id ?? "") : "__new__",
      term_id: termId,
      course_code: courseCode,
      course_name: courseName,
      kind, sec_no: secNo,
      day_of_week: dow,
      start_time: start,
      end_time: end,
      note,
      is_wba: false,
    };
    const other = checkOverlap(candidate);
    if (other) {
      const otherTitle = blockTitle(other) || "คาบเรียน";
      setOverlapWarn(`ทับซ้อนกับ "${otherTitle}" ${other.start_time}–${other.end_time}`);
    }
  }, [isOpen, isEdit, block?.id, termId, courseCode, courseName, kind, secNo, dow, start, end, note, checkOverlap]);

  function handleSave() {
    setError(null);
    const code = courseCode.trim();
    const name = courseName.trim();
    const sec = secNo.trim();
    const noteTrim = note.trim();
    if (!code && !name) {
      setError("โปรดระบุรหัสวิชาหรือชื่อวิชาอย่างน้อยหนึ่งอย่าง");
      return;
    }
    if (code && !COURSE_CODE_RE.test(code)) {
      setError("รหัสวิชาใช้ได้เฉพาะตัวอักษร A–Z, ตัวเลข และเครื่องหมาย -");
      return;
    }
    if (sec && !SEC_NO_RE.test(sec)) {
      setError("Section ใช้ได้เฉพาะตัวเลข 0–9");
      return;
    }
    if (code.length > COURSE_CODE_MAX) { setError(`รหัสวิชายาวได้ไม่เกิน ${COURSE_CODE_MAX} ตัวอักษร`); return; }
    if (name.length > COURSE_NAME_MAX) { setError(`ชื่อวิชายาวได้ไม่เกิน ${COURSE_NAME_MAX} ตัวอักษร`); return; }
    if (sec.length > SEC_NO_MAX) { setError(`Section ยาวได้ไม่เกิน ${SEC_NO_MAX} ตัวอักษร`); return; }
    if (noteTrim.length > NOTE_MAX) { setError(`หมายเหตุยาวได้ไม่เกิน ${NOTE_MAX} ตัวอักษร`); return; }
    if (!start || !end) { setError("โปรดระบุเวลาเริ่มและสิ้นสุด"); return; }
    if (!inRange(start) || !inRange(end)) {
      setError(`เวลาต้องอยู่ในช่วง ${String(START_HR).padStart(2,"0")}:00–${String(END_HR).padStart(2,"0")}:00`);
      return;
    }
    if (parseHM(start) >= parseHM(end)) {
      setError("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
      return;
    }
    const saved: Block = {
      id: isEdit ? (block?.id ?? "") : "b-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      term_id: termId,
      course_code: code,
      course_name: name,
      kind,
      sec_no: sec,
      day_of_week: dow,
      start_time: start,
      end_time: end,
      note: noteTrim,
      is_wba: false,
    };
    onSave(saved);
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? "แก้ไขคาบเรียน" : "เพิ่มคาบเรียน"}
      icon={<Clock size={18} />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div>
            {isEdit && block && (
              <Button variant="danger-soft" onClick={() => onDelete(block.id)}>
                <Trash2 size={14} /> ลบคาบนี้
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button variant="primary" onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <FieldGroup label="รหัสวิชา" hint="ตัวเลข/ตัวอักษร A–Z">
            <TextInput
              value={courseCode}
              onChange={e => setCourseCode(sanitize(e.target.value.toUpperCase(), COURSE_CODE_RE, COURSE_CODE_MAX))}
              placeholder="322201"
              inputMode="numeric"
              autoComplete="off"
              maxLength={COURSE_CODE_MAX}
              autoFocus
            />
          </FieldGroup>
          <div className="col-span-2">
            <FieldGroup label="ชื่อวิชา">
              <TextInput
                value={courseName}
                onChange={e => setCourseName(e.target.value.slice(0, COURSE_NAME_MAX))}
                placeholder="Data Structures"
                maxLength={COURSE_NAME_MAX}
                autoComplete="off"
              />
            </FieldGroup>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="ประเภท">
            <Select value={kind} onChange={e => setKind(e.target.value as BlockKind)}>
              <option value="">— ไม่ระบุ —</option>
              <option value="lecture">บรรยาย</option>
              <option value="lab">ปฏิบัติการ</option>
            </Select>
          </FieldGroup>
          <FieldGroup label="Section" hint="ตัวเลข 0–9 เท่านั้น">
            <TextInput
              value={secNo}
              onChange={e => setSecNo(sanitize(e.target.value, SEC_NO_RE, SEC_NO_MAX))}
              placeholder="เช่น 01"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={SEC_NO_MAX}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="วัน">
          <Select value={String(dow)} onChange={e => setDow(Number(e.target.value))}>
            {DOW_OPTIONS.map(d => (
              <option key={d} value={d}>{DOW_LABEL[d]}</option>
            ))}
          </Select>
        </FieldGroup>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="เริ่ม">
            <TextInput
              type="time" value={start} onChange={e => setStart(e.target.value)}
              step={60 * 30}
              min={`${String(START_HR).padStart(2, "0")}:00`}
              max={`${String(END_HR).padStart(2, "0")}:00`}
            />
          </FieldGroup>
          <FieldGroup label="สิ้นสุด">
            <TextInput
              type="time" value={end} onChange={e => setEnd(e.target.value)}
              step={60 * 30}
              min={`${String(START_HR).padStart(2, "0")}:00`}
              max={`${String(END_HR).padStart(2, "0")}:00`}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="หมายเหตุ (ระบุก็ได้)" hint={`ยาวได้ไม่เกิน ${NOTE_MAX} ตัวอักษร`}>
          <TextInput
            value={note}
            onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
            placeholder="เช่น ห้อง SC-1234"
            maxLength={NOTE_MAX}
            autoComplete="off"
          />
        </FieldGroup>

        {overlapWarn && !error && (
          <Alert status="warning" icon={<AlertTriangle size={14} />} title={overlapWarn} />
        )}
        {error && (
          <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />
        )}
      </div>
    </Modal>
  );
}
