"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { Save, Plus, Trash2, Pencil, AlertTriangle, Clock, Calendar, Layers, Cloud, CloudOff, Check, Upload, FileUp, Lock } from "lucide-react";
import { api, type Term, type Me } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import { icsToBlocks, applyClassKinds, type IcsImportResult, type ClassKindRow } from "../../../lib/ics";
import TermSelect from "../../../components/TermSelect";
import ScheduleGrid, {
  type Block, type BlockKind, type DraftRange,
  KIND_LABEL, blockTitle,
} from "../../../components/ScheduleGrid";
import {
  PageHeader, Panel, Select, Modal, Button, IconButton, TextInput, FieldGroup, EmptyState, Alert, ConfirmDialog, TipWrap,
  TimePicker, Chip,
} from "../../../components/ui";
// Schedule editing is intentionally NOT gated behind TA approval — the user
// asked to unblock this page so students can lay out their timetable while
// their documents are still under review. LockedActionButton / useTAApproval
// still apply to worklog + document-submission flows elsewhere.

// Day-of-week labels: Sun=0..Sat=6
const DOW_LABEL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DOW_OPTIONS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun preferred display order

const START_HR = 8;
const END_HR = 20;
// Same bounds as strings, for the time pickers. Outside this range the block
// would be drawn off the grid, so the field refuses it instead of letting the
// user find out at save time.
const GRID_START = `${String(START_HR).padStart(2, "0")}:00`;
const GRID_END = `${String(END_HR).padStart(2, "0")}:00`;

// Field constraints — kept in sync with backend validation in ReplaceClasses.
// Course code at KKU is typically a 6–7 digit number; letters/hyphens are
// allowed so codes like "CS101" or "322-201" also fit. Sections use plain
// alphanumeric ids ("01", "1", "A").
const COURSE_CODE_MAX = 16;
const COURSE_NAME_MAX = 120;
const SEC_NO_MAX = 8;
const NOTE_MAX = 200;
// Per-character filters used while typing. A space fails both, so a stray
// space — typed or pasted — is dropped rather than saved.
const COURSE_CODE_RE = /^[A-Za-z0-9]*$/;
const SEC_NO_RE = /^[0-9]*$/;

// Full-value rule, checked on save. KKU course codes are either six digits
// (old style, e.g. 322201) or a faculty prefix plus six digits (new style,
// e.g. SC363001, CP020002). Verified against all 127 course codes currently
// in teaching_courses — every one matches.
const COURSE_CODE_FORMAT = /^[A-Z]{0,4}[0-9]{6}$/;

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

// SaveStatus is the small pill in the page header that tells the user which
// state auto-save is in. Kept intentionally compact — a single row of icon +
// label — because it sits next to the term picker + action buttons.
function SaveStatus({
  saving, dirty, savedAgo, error,
}: {
  saving: boolean;
  dirty: boolean;
  savedAgo: string;
  error: string | null;
}) {
  if (error) {
    return (
      <TipWrap content={error} className="inline-flex items-center gap-1.5 text-xs text-danger-soft-foreground bg-danger-soft rounded-md px-2 py-1">
        <CloudOff size={13} />
        <span className="truncate max-w-[16rem]">บันทึกไม่สำเร็จ จะลองใหม่อัตโนมัติ</span>
      </TipWrap>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Cloud size={13} className="animate-pulse" />
        <span>กำลังบันทึกอัตโนมัติ…</span>
      </span>
    );
  }
  if (dirty) {
    return (
      <TipWrap content="ระบบจะบันทึกอัตโนมัติภายในไม่กี่วินาที" className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Cloud size={13} />
        <span>กำลังจะบันทึกอัตโนมัติ…</span>
      </TipWrap>
    );
  }
  if (savedAgo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Check size={13} className="text-success" />
        <span>บันทึกล่าสุด {savedAgo}</span>
      </span>
    );
  }
  return null;
}

type EditorMode = { kind: "closed" } | { kind: "create"; draft: Partial<Block> } | { kind: "edit"; id: string };

export default function TASchedulePage() {
  const { data: me } = useSWR<Me>("/me");
  // WBA (no-regular-schedule) mode is only valid for year-4+ undergraduates.
  // The backend enforces this; we mirror it here so the checkbox is disabled
  // with a reason instead of failing on save.
  const canWba = me?.study_level === "undergrad" && (me?.study_year ?? 0) >= 4;
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => {
    if (!termId && terms && terms.length) {
      setTermId(terms.find(t => t.is_active)?.id ?? terms[0].id);
    }
  }, [terms, termId]);

  interface ScheduleResp { blocks: Block[]; locked: boolean; lock_reason: string }
  const { data: sched } = useSWR<ScheduleResp>(termId ? `/me/schedule?term_id=${termId}` : null);
  const blocks = sched?.blocks;
  // Read-only once staff have exported this term's payout documents. The
  // schedule feeds the clash rules that decided which hours were payable, so
  // changing it after the paperwork left would contradict a document already
  // in the finance office. Past terms stay browsable — just frozen.
  const locked = sched?.locked === true;
  const lockReason = sched?.lock_reason ?? "";
  const [local, setLocal] = useState<Block[]>([]);

  // Track unsaved local edits. While dirty we must NOT let a background SWR
  // revalidation overwrite what the user is editing; the ref mirrors the state
  // so the [blocks] effect reads a fresh value without re-subscribing to it.
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = () => { dirtyRef.current = true; setDirty(true); };
  const clearDirty = () => { dirtyRef.current = false; setDirty(false); };

  useEffect(() => {
    if (dirtyRef.current) return; // keep unsaved edits; don't clobber on revalidate
    setLocal(blocks ?? []);
  }, [blocks]);

  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorMode>({ kind: "closed" });
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Auto-save state. `savedAt` is the wall-clock of the last successful write
  // so the header can render "บันทึกล่าสุด X วินาทีที่แล้ว".
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Debounce window: 1.5s of quiet after the last mutation before we flush.
  // Long enough that a drag-resize sequence doesn't trigger N saves; short
  // enough that closing the tab within it is very unlikely.
  const AUTOSAVE_DELAY_MS = 1500;

  // Term change: if the current term still has unsaved edits, flush the
  // auto-save first so nothing is lost. The user isn't asked — the pending
  // dialog is now only used when the flush itself fails.
  async function requestTermChange(next: string) {
    if (!next || next === termId) return;
    if (dirty) {
      const ok = await save(true);
      if (!ok) { setPendingTerm(next); return; }
    }
    switchTerm(next);
  }
  function switchTerm(next: string) {
    clearDirty();
    setPendingTerm(null);
    setTermId(next);
  }

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

  // Track which blocks share a time slot with another — used only as an
  // informational "ซ้อน" chip on the list. Overlapping schedules are allowed
  // (per lecturer request: two sections of the same course meeting together).
  const overlappingIds = useMemo(() => {
    const stacked = new Set<string>();
    const byDay = new Map<number, Block[]>();
    for (const b of regularBlocks) {
      const arr = byDay.get(b.day_of_week) ?? [];
      arr.push(b); byDay.set(b.day_of_week, arr);
    }
    for (const arr of byDay.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (overlaps(arr[i].start_time, arr[i].end_time, arr[j].start_time, arr[j].end_time)) {
            stacked.add(arr[i].id); stacked.add(arr[j].id);
          }
        }
      }
    }
    return stacked;
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

  function moveBlock(id: string, day: number, start: string, end: string) {
    const existing = local.find(b => b.id === id);
    if (!existing) return;
    upsertBlock({ ...existing, day_of_week: day, start_time: start, end_time: end });
  }

  function resizeBlock(id: string, start: string, end: string) {
    const existing = local.find(b => b.id === id);
    if (!existing) return;
    upsertBlock({ ...existing, start_time: start, end_time: end });
  }
  function openEdit(id: string) {
    if (local.find(b => b.id === id)?.is_wba) return; // WBA block is not directly editable
    setEditor({ kind: "edit", id });
  }
  function closeEditor() { setEditor({ kind: "closed" }); }

  function upsertBlock(b: Block) {
    markDirty();
    setLocal(prev => {
      const idx = prev.findIndex(x => x.id === b.id);
      if (idx < 0) return [...prev, b];
      const next = prev.slice(); next[idx] = b; return next;
    });
  }
  function removeBlock(id: string) {
    markDirty();
    setLocal(prev => prev.filter(b => b.id !== id));
  }

  // Replace all local blocks with the .ics import result. This intentionally
  // drops any is_wba row too — user confirmed "replace all" over "merge", and
  // an .ics with regular classes is inherently incompatible with WBA mode.
  function applyImport(result: IcsImportResult) {
    markDirty();
    setLocal(result.blocks.map(b => ({ ...b, term_id: termId })));
    setImportOpen(false);
    notify.success(`นำเข้าตารางเรียนแล้ว ${result.blocks.length} คาบ`);
  }

  function toggleWba(on: boolean) {
    if (on) {
      const hasRegulars = local.some(b => !b.is_wba);
      if (hasRegulars && !window.confirm("การเปิดโหมด WBA จะลบคาบเรียนทั้งหมดที่กรอกไว้ ยืนยันหรือไม่?")) {
        return;
      }
      markDirty();
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
      markDirty();
      setLocal(prev => prev.filter(b => !b.is_wba));
    }
  }

  // save(silent) — silent=true skips toast, used by the debounced auto-save.
  // Invalid rows are surfaced via the header's saveError instead so the user
  // sees them without an intrusive toast on every keystroke.
  async function save(silent = false): Promise<boolean> {
    if (!termId) return false;
    for (const b of local) {
      if (b.is_wba) continue;
      if (!inRange(b.start_time) || !inRange(b.end_time)) {
        const msg = `คาบ ${b.start_time}–${b.end_time} อยู่นอกช่วง ${String(START_HR).padStart(2,"0")}:00–${String(END_HR).padStart(2,"0")}:00`;
        setSaveError(msg);
        if (!silent) notify.error(msg);
        return false;
      }
      if (parseHM(b.start_time) >= parseHM(b.end_time)) {
        const msg = `คาบ ${blockTitle(b) || "คาบเรียน"} เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม`;
        setSaveError(msg);
        if (!silent) notify.error(msg);
        return false;
      }
    }
    // Overlapping blocks are allowed — two sections of the same course often
    // share a time slot when co-taught. Only invalid time ranges block save.
    setSaving(true);
    setSaveError(null);
    try {
      await api.put(`/me/schedule?term_id=${termId}`, local);
      clearDirty();
      setSavedAt(Date.now());
      if (!silent) notify.success("บันทึกตารางเรียนเรียบร้อย");
      mutate((k) => typeof k === "string" && k.startsWith("/me/schedule"));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setSaveError(msg);
      if (!silent) notify.error(e);
      return false;
    } finally { setSaving(false); }
  }

  // Debounced auto-save. Fires 1.5s after the last edit — a drag-move that
  // emits many intermediate updates coalesces into a single write. The ref
  // holds the latest handler so the timeout always sees fresh `local`.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || !termId) return;
    const t = setTimeout(() => { saveRef.current(true); }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [local, dirty, termId]);

  // Safety net for the debounce window: if the user closes the tab or navigates
  // to another origin while dirty, the browser prompts them to stay. The
  // auto-save timer will normally fire well before they finish reading it.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the returnValue string and show their own copy,
      // but assigning any truthy value is still required to trigger the dialog.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Human-readable "just now / X seconds ago" for the header indicator.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!savedAt) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [savedAt]);
  const savedAgoLabel = useMemo(() => {
    if (!savedAt) return "";
    const s = Math.max(0, Math.floor((now - savedAt) / 1000));
    if (s < 10) return "เมื่อสักครู่";
    if (s < 60) return `${s} วินาทีที่แล้ว`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} นาทีที่แล้ว`;
    const h = Math.floor(m / 60);
    return `${h} ชั่วโมงที่แล้ว`;
  }, [savedAt, now]);

  const editingBlock: Block | null =
    editor.kind === "edit" ? (local.find(b => b.id === editor.id) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="ตารางเรียนของฉัน"
        description="บันทึกตารางเรียนต่อภาคการศึกษา เพื่อใช้ตรวจสอบไม่ให้ทับซ้อนกับตารางสอนที่อาจารย์จะมอบหมาย · ลากบนตารางหรือกดปุ่มเพิ่มคาบเพื่อกรอกข้อมูล"
        actions={
          <>
            {!locked && (
              <SaveStatus
                saving={saving}
                dirty={dirty}
                savedAgo={savedAgoLabel}
                error={saveError}
              />
            )}
            <TermSelect terms={terms} value={termId} onChange={requestTermChange} />
            <span data-tour="sch-ics">
              <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={locked}>
                <FileUp size={14} /> อัปโหลด .ics
              </Button>
            </span>
            <span data-tour="sch-add">
              <Button variant="secondary" onClick={() => openCreate()} disabled={isWba || locked}>
                <Plus size={14} /> เพิ่มคาบเรียน
              </Button>
            </span>
            <Button variant="primary" onClick={() => save(false)} disabled={saving || !dirty || locked}>
              <Save size={14} /> บันทึกทันที
            </Button>
          </>
        }
      />
      {locked && (
        <div className="mb-3">
          <Alert
            status="warning"
            icon={<Lock size={16} />}
            title="ภาคเรียนนี้ปิดการแก้ไขแล้ว"
            description={lockReason}
          />
        </div>
      )}

      {/* No page-level "มีคาบเรียนที่จัดชั้นซ้อนกัน" banner: overlapping is
          allowed and needs no action, so a standing alert about it only pushed
          the grid down and trained people to skip the alert row. The per-block
          "ซ้อน" chip in the list below still marks which ones stack, and the
          editor still says so while you are creating the overlap. */}

      {isWba ? (
        <Panel>
          <EmptyState
            icon={<Calendar size={28} />}
            title="โหมด WBA / นักศึกษาปี 4 ไม่มีตารางเรียนปกติ"
            description="ระบบจะบันทึกว่าคุณไม่มีคาบเรียนประจำในภาคการศึกษานี้ ปิดสวิตช์ด้านล่างเพื่อกลับไปสร้างตารางเรียน"
          />
        </Panel>
      ) : (
        <div data-tour="sch-grid">
        <ScheduleGrid
          blocks={local}
          // Locked: the grid still renders so past terms can be read, but every
          // mutating gesture — drag-to-create, move, resize, click-to-edit — is
          // disconnected rather than merely discouraged.
          onCreateDraft={locked ? () => {} : openCreate}
          onSelectBlock={locked ? () => {} : openEdit}
          onMoveBlock={locked ? undefined : moveBlock}
          onResizeBlock={locked ? undefined : resizeBlock}
        />
        </div>
      )}

      {!isWba && (
        <Panel title="รายการคาบเรียน" className="mt-4" padded={false} data-tour="sch-list">
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
                const stacked = overlappingIds.has(b.id);
                const heading = blockTitle(b);
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
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
                    {stacked && (
                      <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                        <Layers size={12} /> ซ้อน
                      </span>
                    )}
                    {!locked && (
                      <>
                        <IconButton variant="ghost" size="sm" onClick={() => openEdit(b.id)} label="แก้ไข">
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton variant="ghost" size="sm" onClick={() => setConfirmDeleteId(b.id)} label="ลบ">
                          <Trash2 size={14} />
                        </IconButton>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <Panel title="กรณีพิเศษ" className="mt-4" data-tour="sch-wba">
        <label className={"flex items-center gap-2 text-sm " + ((canWba || isWba) && !locked ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
          <input
            type="checkbox"
            checked={isWba}
            disabled={locked || (!canWba && !isWba)}
            onChange={e => toggleWba(e.target.checked)}
          />
          <span>ฉันเป็นนักศึกษาปี 4 / WBA (ไม่มีตารางเรียนปกติ)</span>
        </label>
        <p className="text-xs text-muted mt-1">
          เปิดตัวเลือกนี้เมื่อคุณไม่มีตารางเรียนประจำในภาคเรียนนี้ ระบบจะข้ามการตรวจสอบทับซ้อนตอนอาจารย์ยื่นคำร้อง
        </p>
        {!canWba && !isWba && (
          <p className="text-xs text-warning mt-1">
            โหมด WBA ใช้ได้เฉพาะนักศึกษาปริญญาตรีชั้นปีที่ 4 ขึ้นไป
            {me?.study_level === "undergrad" && (me?.study_year ?? 0) < 1
              ? " ระบบยังไม่มีข้อมูลชั้นปีของคุณ กรุณาติดต่อเจ้าหน้าที่"
              : ""}
          </p>
        )}
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

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) removeBlock(confirmDeleteId); setConfirmDeleteId(null); }}
        danger
        title="ลบคาบเรียน"
        message="ต้องการลบคาบเรียนนี้ออกจากตารางหรือไม่? การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก"
        confirmLabel="ลบ"
      />

      <IcsImportModal
        open={importOpen}
        termId={termId}
        onClose={() => setImportOpen(false)}
        onImport={applyImport}
      />

      <ConfirmDialog
        open={pendingTerm !== null}
        onClose={() => setPendingTerm(null)}
        onConfirm={() => { if (pendingTerm) switchTerm(pendingTerm); }}
        danger
        title="เปลี่ยนภาคการศึกษา"
        message="บันทึกตารางอัตโนมัติล้มเหลว หากเปลี่ยนภาคการศึกษาตอนนี้ การแก้ไขล่าสุดจะหายไป ต้องการดำเนินการต่อหรือไม่?"
        confirmLabel="เปลี่ยนโดยไม่บันทึก"
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      // Informational — overlap is allowed (two sections meeting together).
      setOverlapWarn(`จะซ้อนกับ "${otherTitle}" ${other.start_time}–${other.end_time} ระบบจะจัดชั้นให้ในตาราง`);
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
    if (code && !COURSE_CODE_FORMAT.test(code)) {
      setError("รหัสวิชาต้องเป็นตัวเลข 6 หลัก (เช่น 322201) หรือมีตัวอักษรนำหน้าแล้วตามด้วยตัวเลข 6 หลัก (เช่น SC363001)");
      return;
    }
    // "ตัวเลขตั้งแต่ 1 ขึ้นไป" — "01" is fine (it is 1), "0" and "00" are not.
    if (sec && (!SEC_NO_RE.test(sec) || Number(sec) < 1)) {
      setError("Section ต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป");
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
    <>
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
              <Button variant="danger-soft" onClick={() => setConfirmDelete(true)}>
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
        {/* Three fields side by side leave ~100px each on a phone, which is
            not enough for a course code, let alone its hint. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldGroup label="รหัสวิชา" hint="ตัวเลข 6 หลัก หรือ อักษรนำหน้า + ตัวเลข 6 หลัก">
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
          <FieldGroup label="Section" hint="ตัวเลขตั้งแต่ 1 ขึ้นไป">
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
            <TimePicker value={start} onChange={setStart} label="เริ่ม"
                        minValue={GRID_START} maxValue={GRID_END} />
          </FieldGroup>
          <FieldGroup label="สิ้นสุด">
            <TimePicker value={end} onChange={setEnd} label="สิ้นสุด"
                        minValue={GRID_START} maxValue={GRID_END} />
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
          <Alert status="accent" icon={<Layers size={14} />} title={overlapWarn} />
        )}
        {error && (
          <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />
        )}
      </div>
    </Modal>

    <ConfirmDialog
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      onConfirm={() => { setConfirmDelete(false); if (block) onDelete(block.id); }}
      danger
      title="ลบคาบเรียน"
      message="ต้องการลบคาบเรียนนี้หรือไม่? การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก"
      confirmLabel="ลบ"
    />
    </>
  );
}

// ---------------------------------------------------------------------------
// IcsImportModal — pick a KKU REG .ics file, preview parsed blocks, confirm.
// Confirm replaces all local blocks for the current term (user chose "replace
// all" over "merge" — grid state is fully rewritten from the file).
// ---------------------------------------------------------------------------

interface IcsImportModalProps {
  open: boolean;
  termId: string;
  onClose: () => void;
  onImport: (result: IcsImportResult) => void;
}

function IcsImportModal({ open, termId, onClose, onImport }: IcsImportModalProps) {
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<IcsImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset every time the modal opens so a stale preview from a previous file
  // never bleeds into a new import session.
  useEffect(() => {
    if (!open) return;
    setFileName("");
    setResult(null);
    setError(null);
    setParsing(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      let parsed = icsToBlocks(text, termId);
      // .ics ของ REG ไม่มีข้อมูลว่าคาบไหนบรรยาย/ปฏิบัติการ — เทียบกับตารางสอน
      // ที่นำเข้าจากไฟล์ทะเบียนในระบบ (ซึ่งระบุ Lec/Lab ไว้) เพื่อเติมให้อัตโนมัติ
      try {
        const table = await api.get<ClassKindRow[]>(`/class-kinds?term_id=${termId}`);
        parsed = applyClassKinds(parsed, table ?? []);
      } catch {
        // ดึงตารางไม่ได้ก็ยังนำเข้าได้ตามปกติ แค่ต้องเลือกประเภทเอง
      }
      if (parsed.eventsTotal === 0) {
        setError("ไม่พบเหตุการณ์ในไฟล์ (VEVENT) โปรดตรวจว่าไฟล์เป็น .ics ที่ถูกต้อง");
      } else if (parsed.blocks.length === 0) {
        setError("อ่านไฟล์ได้แต่ไม่พบคาบเรียนที่นำเข้าได้ ทั้งหมดอาจเป็นเหตุการณ์สอบหรืออยู่นอกช่วง 08:00–20:00");
      }
      setResult(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setParsing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const canImport = !!result && result.blocks.length > 0 && !parsing && !!termId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="อัปโหลดตารางเรียนจาก KKU REG (.ics)"
      icon={<FileUp size={18} />}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="text-xs text-muted">
            {result && result.blocks.length > 0
              ? `จะแทนที่คาบเรียนทั้งหมดในภาคการศึกษานี้ด้วย ${result.blocks.length} คาบที่นำเข้า`
              : ""}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button
              variant="primary"
              onClick={() => result && onImport(result)}
              disabled={!canImport}
            >
              <Upload size={14} /> นำเข้า
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          ดาวน์โหลดไฟล์ตารางเรียน (.ics) จากระบบทะเบียน (reg.kku.ac.th) แล้วเลือกไฟล์ที่นี่
          ระบบจะดึงคาบเรียนประจำสัปดาห์ให้อัตโนมัติ
        </p>

        <label className="flex flex-col gap-2 rounded-md border border-dashed border-[var(--hairline)] p-4 hover:bg-slate-50 cursor-pointer">
          <div className="flex items-center gap-2 text-sm">
            <FileUp size={16} className="text-muted" />
            <span className="font-medium">{fileName || "เลือกไฟล์ .ics"}</span>
            {parsing && <span className="text-xs text-muted">— กำลังอ่าน…</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={onPick}
            className="text-xs text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[var(--hairline)] file:bg-white file:text-sm file:font-medium file:cursor-pointer hover:file:bg-slate-50"
          />
        </label>

        {error && (
          <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />
        )}

        {result && (
          <IcsPreview result={result} />
        )}
      </div>
    </Modal>
  );
}

function IcsPreview({ result }: { result: IcsImportResult }) {
  const summaryBits: string[] = [];
  if (result.blocks.length) summaryBits.push(`คาบเรียนรายสัปดาห์ ${result.blocks.length} คาบ`);
  if (result.duplicatesCollapsed) summaryBits.push(`รวมเหตุการณ์ซ้ำ ${result.duplicatesCollapsed} รายการ`);
  if (result.examSkipped) summaryBits.push(`ข้ามการสอบ ${result.examSkipped} รายการ`);
  if (result.outOfRangeSkipped) summaryBits.push(`ข้ามเวลานอกช่วง ${result.outOfRangeSkipped} รายการ`);
  if (result.malformedSkipped) summaryBits.push(`ข้ามข้อมูลไม่สมบูรณ์ ${result.malformedSkipped} รายการ`);
  if (result.kindResolved) summaryBits.push(`ระบุประเภทให้อัตโนมัติ ${result.kindResolved} คาบ`);
  const unresolved = result.blocks.filter(b => !b.kind).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted">{summaryBits.join(" · ")}</div>
      {result.blocks.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-[var(--hairline)]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">วัน</th>
                <th className="text-left px-3 py-2 font-medium">เวลา</th>
                <th className="text-left px-3 py-2 font-medium">รหัสวิชา</th>
                <th className="text-left px-3 py-2 font-medium">Sec</th>
                <th className="text-left px-3 py-2 font-medium">ประเภท</th>
                <th className="text-left px-3 py-2 font-medium">ห้อง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {result.blocks.map(b => (
                <tr key={b.id}>
                  <td className="px-3 py-1.5">{DOW_LABEL[b.day_of_week]}</td>
                  <td className="px-3 py-1.5 tabular-nums">{b.start_time}–{b.end_time}</td>
                  <td className="px-3 py-1.5 font-medium">{b.course_code}</td>
                  <td className="px-3 py-1.5 tabular-nums">{b.sec_no}</td>
                  <td className="px-3 py-1.5">
                    {b.kind
                      ? <Chip tone={b.kind === "lab" ? "warn" : "brand"}>{KIND_LABEL[b.kind]}</Chip>
                      : <span className="text-xs text-muted">— เลือกเอง</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted truncate max-w-[16rem]">{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        {unresolved === 0
          ? "ระบุประเภท (บรรยาย/ปฏิบัติการ) ให้ครบทุกคาบแล้วจากตารางสอนในระบบ แก้ไขภายหลังได้"
          : `ไฟล์ .ics ของระบบทะเบียนไม่ได้ระบุประเภทคาบ ระบบจึงเทียบกับตารางสอนในระบบให้ ยังเหลือ ${unresolved} คาบที่ต้องเลือกประเภทเอง`}
      </p>
    </div>
  );
}
