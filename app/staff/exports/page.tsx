"use client";
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { Download, Package, Lock, CheckCircle2, AlertTriangle, History, FileSignature } from "lucide-react";
import { api, errMessage, type Term } from "../../lib/api";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, Select, EmptyState, Chip, ConfirmDialog, TextInput } from "../../components/ui";

interface TC { id: string; code: string; name_th: string; num_students: number; exported_at?: string | null; }

// Phase 4 dashboard row aggregating budget + submission status per course.
interface CourseSummary {
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  term_label: string;
  per_course_max_baht: number;
  used_baht: number;
  remaining_baht: number;
  over_budget: boolean;
  ta_count: number;
  pending_months?: string[];
  last_export_at?: string | null;
}

interface ExportBatch {
  id: string;
  file_name: string;
  ta_count: number;
  total_baht: number;
  generated_at: string;
  generated_by_name?: string;
}

type Tab = "package" | "appointment";

export default function ExportsPage() {
  const [tab, setTab] = useState<Tab>("package");
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => { if (!termId && terms && terms.length) setTermId(terms[0].id); }, [terms, termId]);

  const coursesKey = termId ? `/teaching-courses?term_id=${termId}` : null;
  const { data: courses } = useSWR<TC[]>(coursesKey);

  const summaryKey = termId ? `/exports/summary?term_id=${termId}` : null;
  const { data: summary } = useSWR<CourseSummary[]>(summaryKey);

  // Course pending export confirmation. The ZIP export permanently locks the
  // course from further edits, so we gate the download behind a warning.
  const [confirmTarget, setConfirmTarget] = useState<TC | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  function startExport() {
    if (!confirmTarget) return;
    setDownloading(true);
    window.location.href = `/api/v1/exports/course/${confirmTarget.id}.zip`;
    setTimeout(() => {
      if (coursesKey) mutate(coursesKey);
      if (summaryKey) mutate(summaryKey);
      setDownloading(false);
      setConfirmTarget(null);
    }, 1200);
  }

  // Merge summary onto courses so a single row shows exportable status +
  // budget snapshot. courses is the source of truth; summary is enrichment.
  const summaryById = new Map((summary ?? []).map(s => [s.teaching_course_id, s]));

  return (
    <div>
      <PageHeader
        title="ส่งออกเอกสาร"
        description="สร้าง ZIP รวมเอกสารเบิกจ่ายทั้งวิชา + ใบแต่งตั้งทีเอ (คำสั่ง) — แต่ละ tab สร้างไฟล์คนละแบบ"
        actions={
          <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
            {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
          </Select>
        }
      />

      <div className="flex gap-2 mb-3 border-b border-hairline">
        <TabButton active={tab === "package"} onClick={() => setTab("package")}>
          <Package size={14} /> แพ็คเกจรายวิชา
        </TabButton>
        <TabButton active={tab === "appointment"} onClick={() => setTab("appointment")}>
          <FileSignature size={14} /> ใบแต่งตั้งทีเอ (คำสั่ง)
        </TabButton>
      </div>

      {tab === "appointment" && termId && (
        <AppointmentSection termId={termId} />
      )}

      {tab === "package" && (<>
      <Panel padded={false} className="mb-3">
        {(!courses || courses.length === 0) ? (
          <EmptyState title="ไม่มีวิชาในภาคเรียนนี้" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-ink-2">
                <tr>
                  <th className="text-left px-3 py-2">วิชา</th>
                  <th className="text-right px-3 py-2">งบ / ใช้ไปแล้ว</th>
                  <th className="text-right px-3 py-2">คงเหลือ</th>
                  <th className="text-left px-3 py-2">TA</th>
                  <th className="text-left px-3 py-2">เดือนที่ยัง pending</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map(c => {
                  const s = summaryById.get(c.id);
                  const exported = !!c.exported_at;
                  return (
                    <tr key={c.id} className="border-t border-hairline">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center shrink-0">
                            <Package size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.code}</div>
                            <div className="text-xs text-ink-3 truncate">{c.name_th}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {s ? (
                          <>
                            {s.per_course_max_baht.toLocaleString()} / <b>{s.used_baht.toLocaleString()}</b>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {s ? (
                          s.over_budget ? (
                            <Chip tone="warn"><AlertTriangle size={11} /> เกิน</Chip>
                          ) : (
                            <span>{s.remaining_baht.toLocaleString()}</span>
                          )
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">{s?.ta_count ?? 0}</td>
                      <td className="px-3 py-2">
                        {s?.pending_months && s.pending_months.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {s.pending_months.map(m => (
                              <Chip key={m} tone="warn">{m}</Chip>
                            ))}
                          </div>
                        ) : (
                          <Chip tone="success"><CheckCircle2 size={11} /> ครบ</Chip>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setHistoryFor(c.id)}>
                          <History size={12} />ประวัติ
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmTarget(c)}>
                          {exported ? <Download size={12} /> : <Lock size={12} />} ZIP
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-[var(--ink-3)]">
        แต่ละไฟล์ .xlsx ในซิปมี 3 sheet (หน้าปะ / บันทึกเวลา / ตารางสอน+งาน) พร้อม .pdf ตามประกาศ — folder ตั้งชื่อตาม convention รหัสวิชา/ชื่อ TA
      </p>
      </>)}

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={startExport}
        isPending={downloading}
        danger={!confirmTarget?.exported_at}
        icon={<Lock size={20} />}
        title="ยืนยันการส่งออก ZIP"
        confirmLabel="ส่งออกและดาวน์โหลด"
        message={
          confirmTarget?.exported_at ? (
            <p className="text-sm text-muted">
              รายวิชานี้ถูกส่งออก (ล็อก) ไปแล้ว — ดาวน์โหลดซ้ำได้โดยไม่มีผลกระทบเพิ่มเติม
            </p>
          ) : (
            <p className="text-sm text-muted">
              การส่งออกจะล็อกรายวิชานี้ ไม่สามารถแก้ไข section/ตารางได้อีก การกระทำนี้ย้อนกลับไม่ได้
            </p>
          )
        }
      />

      {historyFor && (
        <HistoryDialog tcId={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-[var(--brand)] text-[var(--brand)]"
          : "border-transparent text-ink-3 hover:text-ink-1 hover:border-hairline"
      }`}
    >
      {children}
    </button>
  );
}

interface AdminOfficer {
  id: string;
  academic_prefix?: string;
  full_name: string;
  title: string;
  is_active: boolean;
}

function AppointmentSection({ termId }: { termId: string }) {
  const { data: officers } = useSWR<AdminOfficer[]>("/settings/admin-officers");
  const [orderNo, setOrderNo] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signerId, setSignerId] = useState("");
  const [busy, setBusy] = useState(false);

  const deans = (officers ?? []).filter(o => o.is_active);

  async function generate() {
    if (!orderNo || !orderDate || !effectiveDate || !signerId) {
      notify.error("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    setBusy(true);
    try {
      const blob: Blob = await api.post("/exports/appointment-order", {
        term_id: termId,
        order_no: orderNo,
        order_date: orderDate,
        effective_date: effectiveDate,
        signer_officer_id: signerId,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appointment-order-${orderNo}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("สร้างเอกสารสำเร็จ");
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mb-3">
      <div className="max-w-2xl space-y-3">
        <p className="text-sm text-ink-3">
          กรอกข้อมูลของคำสั่งแต่งตั้งทีเอ ระบบจะดึงรายชื่อทีเอทั้งหมดที่ได้รับอนุมัติในภาคเรียนนี้ พร้อมสถานะ &quot;เก่า/ใหม่&quot; อัตโนมัติ และสร้าง PDF + DOCX ให้
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-2 mb-1">คำสั่งที่ (เลขที่คำสั่ง)</label>
            <TextInput value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="เช่น 6/2569" />
          </div>
          <div>
            <label className="block text-xs text-ink-2 mb-1">ผู้ลงนาม (คณบดี)</label>
            <Select value={signerId} onChange={e => setSignerId(e.target.value)}>
              <option value="">— เลือกผู้ลงนาม —</option>
              {deans.map(o => (
                <option key={o.id} value={o.id}>
                  {(o.academic_prefix ?? "")}{o.full_name} · {o.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-ink-2 mb-1">วันที่สั่ง (พ.ศ.)</label>
            <TextInput value={orderDate} onChange={e => setOrderDate(e.target.value)} placeholder="เช่น 24 มกราคม 2569" />
          </div>
          <div>
            <label className="block text-xs text-ink-2 mb-1">วันที่ทำการ (พ.ศ.)</label>
            <TextInput value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} placeholder="เช่น 24 มกราคม 2569" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={generate} disabled={busy}>
            <FileSignature size={14} /> {busy ? "กำลังสร้าง…" : "สร้าง PDF + DOCX"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function HistoryDialog({ tcId, onClose }: { tcId: string; onClose: () => void }) {
  const { data } = useSWR<ExportBatch[]>(`/exports/course/${tcId}/history`);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={onClose}
      confirmLabel="ปิด"
      title="ประวัติการส่งออก"
      icon={<History size={20} />}
      message={
        !data ? (
          <p className="text-sm text-muted">กำลังโหลด…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่เคยส่งออกวิชานี้</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-ink-2 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">เวลา</th>
                  <th className="text-left px-2 py-1">ผู้ส่งออก</th>
                  <th className="text-right px-2 py-1">จำนวน TA</th>
                  <th className="text-right px-2 py-1">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {data.map(b => (
                  <tr key={b.id} className="border-t border-hairline">
                    <td className="px-2 py-1 tabular">{b.generated_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-2 py-1">{b.generated_by_name}</td>
                    <td className="px-2 py-1 text-right tabular">{b.ta_count}</td>
                    <td className="px-2 py-1 text-right tabular">{b.total_baht.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    />
  );
}
