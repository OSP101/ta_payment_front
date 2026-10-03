"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { ClipboardPaste, CloudDownload, FileSpreadsheet, Save, SearchCheck, Square } from "lucide-react";
import { Tabs } from "@heroui/react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { Alert, Button, Chip, Modal, TextArea, type ChipTone } from "../../components/ui";

/**
 * อัปเดตจำนวนนักศึกษาจริงหลายวิชาพร้อมกัน — staff copy the registrar's real
 * enrolment out of Excel and paste it here. The first import only carried
 * preliminary seat counts; this replaces the one-dialog-per-course routine.
 *
 * Paste → ตรวจสอบ (dry run: same gates as the real save) → บันทึก. Lines whose
 * codes belong to one merged course are summed by the server, and every course
 * reports its own outcome, so one locked course never blocks the rest.
 */

interface Row { code: string; regular: number | null; special: number | null }
interface Result {
  course_id?: string;
  codes: string[];
  name_th?: string;
  old_regular: number | null;
  old_special: number | null;
  new_regular: number | null;
  new_special: number | null;
  status: "update" | "unchanged" | "not_found" | "locked" | "confirm" | "zero" | "error";
  message?: string;
  warn?: string;
}

// A registrar code: optional letters (CP, SC) then six digits, spaces allowed.
const CODE_RE = /^[A-Za-z]{0,4}\s*\d{6}$/;

/** Tab (Excel copy), comma (CSV) or 2+ spaces separate cells. A line with no
 *  code — a header, a blank line, a total row — is skipped and counted.
 *  The two counts are read BY POSITION right after the code: dropping a cell
 *  that is not a plain number would slide the special count into the regular
 *  column, so such a line is rejected and listed instead. */
export function parsePasted(text: string): { rows: Row[]; skipped: number; bad: string[] } {
  const rows: Row[] = [];
  const bad: string[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|,(?!\d{3}\b)| {2,}/).map(c => c.trim());
    const ci = cells.findIndex(c => CODE_RE.test(c));
    if (ci < 0) { skipped++; continue; }
    const toNum = (c: string | undefined): number | null | undefined => {
      const v = (c ?? "").replace(/,/g, "").trim();
      if (v === "" || v === "-") return null;
      return /^\d+(\.0+)?$/.test(v) ? Math.round(Number(v)) : undefined;
    };
    const reg = toNum(cells[ci + 1]);
    const spc = toNum(cells[ci + 2]);
    const code = cells[ci].replace(/\s+/g, "").toUpperCase();
    if (reg === undefined || spc === undefined) { bad.push(code); continue; }
    rows.push({ code, regular: reg, special: spc });
  }
  return { rows, skipped, bad };
}

const STATUS: Record<Result["status"], { label: string; tone: ChipTone }> = {
  update: { label: "จะอัปเดต", tone: "info" },
  unchanged: { label: "ไม่เปลี่ยน", tone: "neutral" },
  not_found: { label: "ไม่พบรหัสวิชา", tone: "warn" },
  locked: { label: "แก้ไม่ได้", tone: "danger" },
  confirm: { label: "ต้องยืนยันงบ", tone: "warn" },
  zero: { label: "จะเหลือ 0 คน", tone: "danger" },
  error: { label: "ข้อมูลผิด", tone: "danger" },
};

function Change({ from, to }: { from: number | null; to: number | null }) {
  if (to === null) return <span className="text-muted">{from ?? "-"}</span>;
  if (from === to) return <span>{to}</span>;
  return <span><span className="text-muted">{from ?? "-"}</span> → <b>{to}</b></span>;
}

type Tab = "reg" | "excel";
export interface ScopeCounts { requested: number; all: number }

export default function BulkCountsModal({ open, onClose, termId, termLabel, scopeCounts }: {
  open: boolean; onClose: () => void; termId: string | null; termLabel: string;
  /** Courses that can still change, for the REG tab's scope choice. */
  scopeCounts?: ScopeCounts;
}) {
  const [tab, setTab] = useState<Tab>("reg");
  // Each tab keeps its own data: switching to Excel never shows (or sends)
  // what REG returned, and the other way round.
  const [regText, setRegText] = useState("");
  // Per-section enrolment from REG, keyed by code — sent with the save so each
  // section takes its real number, not just the course total.
  const [regSections, setRegSections] = useState<Record<string, SectionCount[]>>({});
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Result[] | null>(null);
  const [applied, setApplied] = useState<Result[] | null>(null);
  const [confirmBudget, setConfirmBudget] = useState(false);
  const [allowZero, setAllowZero] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) { setText(""); setRegText(""); setRegSections({}); setPreview(null); setApplied(null); setConfirmBudget(false); setAllowZero(false); }
  }, [open]);

  const parsed = useMemo(() => parsePasted(tab === "reg" ? regText : text), [tab, regText, text]);
  const shown = applied ?? preview;
  const toUpdate = (preview ?? []).filter(r => r.status === "update").length;
  const needConfirm = (preview ?? []).filter(r => r.status === "confirm").length;
  const zeroing = (preview ?? []).filter(r => r.status === "zero").length;

  async function run(dryRun: boolean) {
    if (!termId || parsed.rows.length === 0) return;
    setPending(true);
    try {
      const rows = tab === "reg"
        ? parsed.rows.map(row => ({ ...row, sections: regSections[row.code.toUpperCase()] }))
        : parsed.rows;
      const res = await api.post<{ items: Result[] }>(`/terms/${termId}/num-students/bulk`, {
        rows, dry_run: dryRun, confirm: !dryRun && confirmBudget, allow_zero: !dryRun && allowZero,
      });
      if (dryRun) {
        setPreview(res.items);
        setApplied(null);
      } else {
        setApplied(res.items);
        const done = res.items.filter(r => r.status === "update").length;
        await mutate((k: unknown) => typeof k === "string" && k.startsWith("/teaching-courses"));
        notify.success(`อัปเดตจำนวนนักศึกษาแล้ว ${done} วิชา`);
      }
    } catch (e) {
      notify.error(e);
    } finally {
      setPending(false);
    }
  }

  const footer = applied ? (
    <Button variant="primary" onClick={onClose}>ปิด</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={pending}>ยกเลิก</Button>
      {!preview ? (
        <Button variant="primary" onClick={() => run(true)} disabled={pending || parsed.rows.length === 0} isPending={pending}>
          <SearchCheck size={14} /> ตรวจสอบ ({parsed.rows.length} แถว)
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => run(false)}
          disabled={pending || (toUpdate === 0 && !(confirmBudget && needConfirm > 0) && !(allowZero && zeroing > 0))}
          isPending={pending}
        >
          <Save size={14} /> บันทึก {toUpdate + (confirmBudget ? needConfirm : 0) + (allowZero ? zeroing : 0)} วิชา
        </Button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose(); }}
      size="2xl"
      icon={<ClipboardPaste size={18} />}
      title={`อัปเดตจำนวนนักศึกษาจริง${termLabel ? ` · ภาค ${termLabel}` : ""}`}
      footer={footer}
    >
      <div className="space-y-3">
        {!preview && (
          <Tabs variant="secondary" selectedKey={tab} onSelectionChange={k => setTab(String(k) as Tab)}>
            <Tabs.ListContainer>
              <Tabs.List aria-label="ที่มาของจำนวนนักศึกษา">
                <Tabs.Tab id="reg">
                  <span className="inline-flex items-center gap-1.5"><CloudDownload size={14} /> ดึงจากระบบทะเบียน (REG)</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="excel">
                  <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> วางจาก Excel</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>

            <Tabs.Panel id="reg">
              <div className="space-y-3 pt-4">
                {termId && <RegFetch termId={termId} open={open} counts={scopeCounts} onRows={setRegText} onSections={setRegSections} />}
                {regText && <ParsedRows parsed={parsed} source="reg" />}
              </div>
            </Tabs.Panel>

            <Tabs.Panel id="excel">
              <div className="space-y-3 pt-4">
                <ol className="space-y-1 text-sm">
                  <li><b>1.</b> ใน Excel จัดคอลัมน์ให้เรียงเป็น <b>รหัสวิชา</b> | <b>จำนวนภาคปกติ</b> | <b>จำนวนภาคพิเศษ</b> ตามตัวอย่าง</li>
                  <li><b>2.</b> ลากเลือกตารางทั้งหมด แล้วกด <kbd className="rounded border border-border px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border border-border px-1 text-xs">C</kbd> (Mac: ⌘+C)</li>
                  <li><b>3.</b> คลิกในช่องด้านล่าง แล้วกด <kbd className="rounded border border-border px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border border-border px-1 text-xs">V</kbd> (Mac: ⌘+V) จากนั้นกด <b>ตรวจสอบ</b></li>
                </ol>

                <ExampleSheet />

                <TextArea
                  rows={6}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="วางข้อมูลที่คัดลอกจาก Excel ที่นี่"
                  className="w-full font-mono text-xs"
                  aria-label="ข้อมูลจำนวนนักศึกษาที่วางจาก Excel"
                />

                {parsed.rows.length > 0 ? (
                  <ParsedRows parsed={parsed} source="excel" />
                ) : text.trim() ? (
                  <Alert
                    status="warning"
                    title="ยังไม่พบรหัสวิชาในข้อมูลที่วาง"
                    description="รหัสวิชาต้องเป็นตัวเลข 6 หลัก มีตัวอักษรนำหน้าได้ เช่น CP245201 หรือ 342372 ตรวจว่าคัดลอกคอลัมน์รหัสวิชามาด้วย"
                  />
                ) : null}
                {parsed.bad.length > 0 && (
                  <Alert
                    status="warning"
                    title={`${parsed.bad.length} แถวมีจำนวนที่ไม่ใช่ตัวเลข`}
                    description={`${parsed.bad.join(", ")} ช่องจำนวนต้องเป็นตัวเลขจำนวนเต็ม หรือเว้นว่าง/ใส่ "-" ถ้าไม่แก้ แถวเหล่านี้จะไม่ถูกนำเข้า`}
                  />
                )}
              </div>
            </Tabs.Panel>
          </Tabs>
        )}

        {shown && (
          <>
            {!applied && needConfirm > 0 && (
              <Alert
                status="warning"
                title={`${needConfirm} วิชามี TA หรือชั่วโมงที่อนุมัติแล้ว`}
                description={
                  <label className="flex items-start gap-2 mt-1 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={confirmBudget} onChange={e => setConfirmBudget(e.target.checked)} />
                    <span>การเปลี่ยนจำนวนนักศึกษาจะเปลี่ยนงบของวิชาเหล่านี้ ติ๊กเพื่อยืนยันให้บันทึกด้วย (ไม่ติ๊ก = ข้ามวิชาเหล่านี้)</span>
                  </label>
                }
              />
            )}
            {!applied && zeroing > 0 && (
              <Alert
                status="danger"
                title={`${zeroing} วิชาจะเหลือนักศึกษา 0 คน และงบจะเป็น 0`}
                description={
                  <div className="space-y-1">
                    <div>
                      ระบบทะเบียนอาจยังไม่เปิดลงทะเบียน หรือตัวเลขในแถวผิด วิชาเหล่านี้มีจำนวนเดิมอยู่ จึงข้ามไว้ก่อน
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" className="mt-1" checked={allowZero} onChange={e => setAllowZero(e.target.checked)} />
                      <span>ยืนยันว่าวิชาเหล่านี้ไม่มีนักศึกษาจริง ให้บันทึกเป็น 0 ด้วย (ไม่ติ๊ก = ข้ามวิชาเหล่านี้)</span>
                    </label>
                  </div>
                }
              />
            )}
            {applied && (
              <Alert status="success" title="บันทึกเสร็จแล้ว" description="ผลของแต่ละวิชาอยู่ในตารางด้านล่าง วิชาที่แก้ไม่ได้ยังคงจำนวนเดิม" />
            )}
            <div className="overflow-auto max-h-[50vh] rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary text-xs text-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">รหัสวิชา</th>
                    <th className="text-left px-3 py-2">ชื่อวิชา</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">ภาคปกติ</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">ภาคพิเศษ</th>
                    <th className="text-left px-3 py-2">ผล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline)]">
                  {shown.map((r, i) => {
                    const st = applied && r.status === "update"
                      ? { label: "อัปเดตแล้ว", tone: "success" as ChipTone }
                      : applied && r.status === "confirm"
                        ? { label: "ข้าม (ไม่ได้ยืนยันงบ)", tone: "warn" as ChipTone }
                        : applied && r.status === "zero"
                          ? { label: "ข้าม (ไม่บันทึก 0)", tone: "warn" as ChipTone }
                        : STATUS[r.status];
                    return (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2 font-medium tabular-nums whitespace-nowrap">{r.codes.join("/")}</td>
                        <td className="px-3 py-2">{r.name_th ?? "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"><Change from={r.old_regular} to={r.new_regular} /></td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"><Change from={r.old_special} to={r.new_special} /></td>
                        <td className="px-3 py-2">
                          <Chip tone={st.tone}>{st.label}</Chip>
                          {r.message && <div className="text-xs text-muted mt-1 whitespace-pre-line">{r.message}</div>}
                          {r.warn && <div className="text-xs text-warning mt-1">{r.warn}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!applied && (
              <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setConfirmBudget(false); setAllowZero(false); }}>
                {tab === "reg" ? "กลับไปหน้าดึงข้อมูล" : "แก้ข้อมูลที่วาง"}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** The rows about to be checked, read back so a column slip shows before ตรวจสอบ. */
function ParsedRows({ parsed, source }: { parsed: ReturnType<typeof parsePasted>; source: "reg" | "excel" }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        {source === "reg" ? "จำนวนที่ได้จากระบบทะเบียน" : "ระบบอ่านได้"} {parsed.rows.length} รหัสวิชา
        {parsed.skipped > 0 ? ` (ข้าม ${parsed.skipped} แถวที่ไม่มีรหัสวิชา เช่น หัวตาราง)` : ""}
        {" "}กด <b>ตรวจสอบ</b> เพื่อเทียบกับจำนวนเดิมก่อนบันทึก
      </div>
      <div className="max-h-48 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-secondary text-xs text-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">รหัสวิชา</th>
              <th className="px-3 py-1.5 text-right">ภาคปกติ</th>
              <th className="px-3 py-1.5 text-right">ภาคพิเศษ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {parsed.rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1 font-medium tabular-nums">{r.code}</td>
                <td className="px-3 py-1 text-right tabular-nums">{r.regular ?? <span className="text-muted">ไม่แก้</span>}</td>
                <td className="px-3 py-1 text-right tabular-nums">{r.special ?? <span className="text-muted">ไม่แก้</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What the pasted sheet should look like, drawn like Excel (column letters,
 *  row numbers) with a note beside each row saying how it is read. */
function ExampleSheet() {
  const rows: Array<[string, string, string, string]> = [
    ["รหัสวิชา", "ภาคปกติ", "ภาคพิเศษ", "หัวตาราง ระบบข้ามให้เอง ไม่ต้องลบ"],
    ["CP245201", "45", "30", "ภาคปกติ 45 คน ภาคพิเศษ 30 คน"],
    ["CP363205", "12", "", "ช่องว่าง = ไม่แก้ภาคพิเศษ ใช้ค่าเดิม"],
    ["CP353301", "60", "0", "ใส่ 0 = ไม่มีนักศึกษาภาคพิเศษ"],
  ];
  const cell = "border border-border px-2 py-1";
  return (
    <div className="rounded-lg border border-border bg-surface-secondary/50 p-3">
      <div className="mb-2 text-xs font-medium text-muted">ตัวอย่างใน Excel</div>
      <div className="overflow-x-auto">
        <table className="text-xs tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="w-6" />
              <th className={`${cell} w-24 bg-surface-secondary font-normal`}>A</th>
              <th className={`${cell} w-20 bg-surface-secondary font-normal`}>B</th>
              <th className={`${cell} w-20 bg-surface-secondary font-normal`}>C</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b, c, note], i) => (
              <tr key={i}>
                <td className="pr-1 text-right text-muted">{i + 1}</td>
                <td className={`${cell} bg-surface ${i === 0 ? "font-semibold" : "font-mono"}`}>{a}</td>
                <td className={`${cell} bg-surface text-right ${i === 0 ? "font-semibold" : ""}`}>{b}</td>
                <td className={`${cell} bg-surface text-right ${i === 0 ? "font-semibold" : ""}`}>{c}</td>
                <td className="whitespace-nowrap pl-3 text-muted">← {note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-muted">
        วิชาที่รวมรหัสกัน (เช่น CP245201 กับ SC363001) ใส่แยกแถวได้ ระบบจะรวมจำนวนเข้าวิชาเดียวกันให้
      </div>
    </div>
  );
}

interface SectionCount { sec_no: string; special: boolean; count: number }
interface RegRow {
  code: string; regular: number; special: number; sections?: string;
  section_counts?: SectionCount[]; error?: string;
}
interface RegJob {
  scope: RegScope;
  status: "running" | "done" | "stopped" | "failed";
  done: number; total: number; rows: RegRow[];
  skipped_exported: number; reused: number; error?: string;
  started_at: string; finished_at?: string;
}
type RegScope = "requested" | "all";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });


/**
 * ดึงจำนวนนักศึกษาที่ลงทะเบียนจริงจาก reg.kku.ac.th (backend RegEnrolmentService).
 * The server reads the registrar one request at a time, ~1–1.5 s apart, and
 * reads big groups of codes with one wildcard search ("CP*") limited to the
 * college — a whole term is about a minute; this polls its progress.
 * Staff pick the scope — usually only the courses that asked for a TA, which
 * is a fraction of the term. The result fills the REG tab's rows and goes
 * through the same ตรวจสอบ → บันทึก steps as a paste; nothing is saved until
 * staff confirm.
 */
function RegFetch({ termId, open, counts, onRows, onSections }: {
  termId: string; open: boolean; counts?: ScopeCounts; onRows: (text: string) => void;
  onSections: (m: Record<string, SectionCount[]>) => void;
}) {
  const [scope, setScope] = useState<RegScope>("requested");
  const [job, setJob] = useState<RegJob | null>(null);
  const [starting, setStarting] = useState(false);
  const applied = useRef<string | null>(null);

  // On open, pick up a fetch that is still running (the dialog was closed
  // mid-way) so its progress shows instead of a second start.
  useEffect(() => {
    if (!open) return;
    applied.current = null;
    api.get<{ job: RegJob | null }>(`/terms/${termId}/reg-enrolment`)
      .then(r => {
        if (r.job?.status === "running") { setJob(r.job); setScope(r.job.scope); }
        else setJob(null);
      })
      .catch(() => {});
  }, [open, termId]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ job: RegJob | null }>(`/terms/${termId}/reg-enrolment`);
        setJob(r.job);
      } catch { /* next tick retries */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [job, termId]);

  // Fill the rows once per finished fetch — a stopped one too: what it got
  // before the stop is real and usable.
  useEffect(() => {
    if ((job?.status !== "done" && job?.status !== "stopped") || applied.current === job.finished_at) return;
    applied.current = job.finished_at ?? "";
    const ok = job.rows.filter(r => !r.error);
    onRows(ok.map(r => `${r.code}\t${r.regular}\t${r.special}`).join("\n"));
    onSections(Object.fromEntries(ok.map(r => [r.code.toUpperCase(), r.section_counts ?? []])));
  }, [job, onRows, onSections]);

  async function start() {
    setStarting(true);
    try {
      const r = await api.post<{ job: RegJob }>(`/terms/${termId}/reg-enrolment`, { scope });
      applied.current = null;
      setJob(r.job);
    } catch (e) {
      notify.error(e);
    } finally {
      setStarting(false);
    }
  }

  const [stopping, setStopping] = useState(false);
  async function stop() {
    setStopping(true);
    try {
      const r = await api.del<{ job: RegJob }>(`/terms/${termId}/reg-enrolment`);
      setJob(r.job);
    } catch (e) {
      notify.error(e);
    } finally {
      setStopping(false);
    }
  }

  const running = job?.status === "running";
  const finished = job?.status === "done" || job?.status === "stopped";
  const failed = (job?.rows ?? []).filter(r => r.error);
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;
  const options: Array<{ id: RegScope; title: string; note: string; n?: number }> = [
    { id: "requested", title: "เฉพาะวิชาที่ขอ TA แล้ว", note: "แนะนำ เฉพาะวิชาที่ใช้คำนวณงบ TA ใช้เวลาไม่กี่วินาที", n: counts?.requested },
    { id: "all", title: "ทุกวิชาในภาค", note: "ค้นแบบกลุ่ม (CP* SC* และรหัสเก่า) ทั้งภาคประมาณ 1 นาที", n: counts?.all },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        ระบบอ่านจำนวนที่ <b>ลงทะเบียนจริง</b> (คอลัมน์ &quot;ลง&quot;) ของทุกกลุ่มเรียนจาก reg.kku.ac.th
        แยกภาคปกติกับโครงการพิเศษ วิชาที่ส่งออกแล้วจะไม่ถูกดึง
      </p>

      <div role="radiogroup" aria-label="วิชาที่จะดึง" className="grid gap-2 sm:grid-cols-2">
        {options.map(o => {
          const on = scope === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={running}
              onClick={() => setScope(o.id)}
              className={
                "rounded-lg border p-3 text-left transition disabled:opacity-60 " +
                (on ? "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]" : "border-border hover:bg-surface-secondary")
              }
            >
              <div className="flex items-center gap-2">
                <span className={"h-3.5 w-3.5 rounded-full border-2 " + (on ? "border-[var(--brand)] bg-[var(--brand)]" : "border-slate-400")} />
                <span className="text-sm font-medium">{o.title}</span>
                {o.n !== undefined && <span className="ml-auto text-xs text-muted tabular-nums">{o.n} วิชา</span>}
              </div>
              <div className="mt-1 pl-5.5 text-xs text-muted">
                {o.note}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={start} disabled={running || starting} isPending={starting}>
          <CloudDownload size={14} /> {job?.status === "stopped" ? "ดึงต่อ" : job?.status === "done" ? "ดึงใหม่" : "เริ่มดึงข้อมูล"}
        </Button>
        {running && (
          <Button variant="danger-soft" onClick={stop} disabled={stopping} isPending={stopping}>
            <Square size={13} /> หยุดดึงข้อมูล
          </Button>
        )}
      </div>

      {running && job && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
            <div className="h-full bg-[var(--brand)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted">
            {job.done === 0
              ? "กำลังค้นหารายวิชาจากระบบทะเบียน"
              : `กำลังดึง ${job.done}/${job.total} รหัสวิชา`}{" "}
            ({job.scope === "all" ? "ทุกวิชา" : "เฉพาะวิชาที่ขอ TA"})
            ปิดหน้าต่างนี้ได้ ระบบยังดึงต่อ เปิดกลับมาจะเห็นความคืบหน้า
          </div>
        </div>
      )}

      {job?.status === "failed" && (
        <Alert status="danger" title="ดึงข้อมูลไม่สำเร็จ" description={job.error ?? "-"} />
      )}

      {job?.status === "stopped" && (
        <Alert
          status="warning"
          title={`หยุดดึงแล้ว ได้ ${job.rows.length - failed.length} จาก ${job.total} รหัสวิชา`}
          description="ใช้ตัวเลขที่ได้ตรวจสอบและบันทึกได้เลย หรือกด ดึงต่อ ระบบจะดึงเฉพาะรหัสที่ยังไม่ได้ (รหัสที่ดึงแล้วใช้ผลเดิมได้ 10 นาที)"
        />
      )}
      {finished && (
        <div className="text-xs text-muted">
          ดึงเมื่อ {hhmm(job.finished_at ?? job.started_at)} ได้ {job.rows.length - failed.length} รหัสวิชา
          {job.reused > 0 ? ` (ใช้ผลที่ดึงไว้ไม่เกิน 10 นาที ${job.reused} รหัส)` : ""}
          {job.skipped_exported > 0 ? ` ข้ามวิชาที่ส่งออกแล้ว ${job.skipped_exported} วิชา` : ""}
        </div>
      )}
      {finished && (() => {
        const ok = job!.rows.filter(r => !r.error);
        return ok.length > 0 && ok.every(r => r.regular + r.special === 0);
      })() && (
        <Alert
          status="danger"
          title="ทุกวิชาที่ดึงได้มีผู้ลงทะเบียน 0 คน"
          description="ระบบทะเบียนอาจยังไม่เปิดให้ลงทะเบียนภาคนี้ ถ้าบันทึกตอนนี้ จำนวนนักศึกษาและงบของวิชาจะเป็น 0 ควรรอดึงใหม่หลังนักศึกษาลงทะเบียนแล้ว"
        />
      )}
      {finished && failed.length > 0 && (
        <Alert
          status="warning"
          title={`${failed.length} รหัสวิชาดึงไม่ได้ ต้องกรอกเองในแท็บวางจาก Excel`}
          description={failed.map(r => `${r.code}: ${r.error}`).join("\n")}
        />
      )}
    </div>
  );
}
