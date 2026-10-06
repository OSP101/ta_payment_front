"use client";
import { useState } from "react";
import useSWR from "swr";
import { InputGroup, Label, TextField, FieldError } from "@heroui/react";
import { FileSpreadsheet, Download, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { Button, Modal, Chip, TipWrap } from "../../components/ui";
import { useTerm } from "../TermContext";

/** GET /ta-review/suppliers — one new TA of the term. No PII: only whether
 *  each piece is on file, and why the TA is left out when they are. */
interface SupplierCandidate {
  user_id: string;
  name: string;
  student_id: string;
  profile_status: string;
  approved_at?: string;
  has_citizen_id: boolean;
  has_payee: boolean;
  missing?: string;
  /** In the file, but these cells are blank (highlighted yellow) — approved
   *  before the system kept them; staff copy them from the creditor form. */
  incomplete?: string;
}

/**
 * The finance office's Template-Suppliers file: every TA who is new in the
 * selected term (approved in this term, never in an earlier one), with the
 * citizen ID, bank account and address finance needs to open them as a
 * supplier in the ERP. Uses the top-bar term, like every other staff page.
 */
export function SuppliersButton() {
  const { termId, termLabel } = useTerm();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetched only while the dialog is open: the list is a join over the whole
  // term's requests, not something every visit to the review page needs.
  const { data, isLoading } = useSWR<SupplierCandidate[]>(
    open && termId ? `/ta-review/suppliers?term=${termId}` : null,
  );
  const ready = (data ?? []).filter(c => !c.missing);
  const left = (data ?? []).filter(c => c.missing);
  const gaps = ready.filter(c => c.incomplete).length;

  async function submit() {
    if (busy || !password || ready.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await api.post<Blob>(`/ta-review/suppliers.xlsx?term=${termId}`, { password });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Suppliers-ทีเอใหม่-${termLabel.split("/").reverse().join("-") || "term"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success(`ดาวน์โหลดไฟล์ Suppliers ของทีเอใหม่ ${ready.length} คนแล้ว`);
      setOpen(false);
    } catch (e) {
      // Inline, not a toast: focus is in the password field.
      setErr(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TipWrap content={termId ? `รายชื่อทีเอใหม่ของภาคการศึกษา ${termLabel} สำหรับส่งฝ่ายการเงิน` : "ยังไม่ได้เลือกภาคการศึกษา"} className="inline-flex">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!termId}
          onPress={() => { setPassword(""); setErr(null); setOpen(true); }}
        >
          <FileSpreadsheet size={14} /> ไฟล์ Suppliers ทีเอใหม่
        </Button>
      </TipWrap>

      <Modal
        open={open}
        onClose={() => { if (!busy) setOpen(false); }}
        title={`ไฟล์ Suppliers ทีเอใหม่ ภาคการศึกษา ${termLabel}`}
        icon={<FileSpreadsheet size={18} />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onPress={() => setOpen(false)} isDisabled={busy}>
              ยกเลิก
            </Button>
            <Button onPress={submit} isDisabled={busy || !password || ready.length === 0} isPending={busy}>
              <Download size={14} /> ยืนยันและดาวน์โหลด
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            ทีเอที่ได้รับอนุมัติเป็นครั้งแรกในภาคการศึกษานี้ ฝ่ายการเงินใช้ไฟล์นี้ลงทะเบียนผู้รับเงินในระบบ ERP
          </p>

          {isLoading ? (
            <p className="text-sm text-muted">กำลังโหลดรายชื่อ…</p>
          ) : (data ?? []).length === 0 ? (
            <p className="rounded-lg border border-[var(--hairline)] p-3 text-sm text-muted">
              ภาคการศึกษานี้ยังไม่มีทีเอใหม่ที่ได้รับอนุมัติคำขอ
            </p>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">อยู่ในไฟล์ {ready.length} คน</p>
                {gaps > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {gaps} คนได้รับอนุมัติก่อนระบบเริ่มเก็บข้อมูลนี้ ช่องที่ขาดในไฟล์จะว่างและระบายสีเหลือง
                    ให้กรอกจากแบบแจ้งข้อมูลเจ้าหนี้ของทีเอคนนั้น
                  </p>
                )}
                {ready.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--hairline)] divide-y divide-[var(--hairline)]">
                    {ready.map(c => (
                      <li key={c.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-sm">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted">{c.student_id}</span>
                        {c.incomplete && <span className="ml-auto"><Chip tone="warn">{c.incomplete}</Chip></span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {left.length > 0 && (
                <div>
                  <p className="text-sm font-medium">ยังไม่อยู่ในไฟล์ {left.length} คน</p>
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--hairline)] divide-y divide-[var(--hairline)]">
                    {left.map(c => (
                      <li key={c.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-sm">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted">{c.student_id}</span>
                        <span className="ml-auto"><Chip tone="warn">{c.missing}</Chip></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs text-muted">
                ไฟล์นี้มีเลขบัตรประชาชน เลขที่บัญชีธนาคาร และที่อยู่ของทีเอ จึงต้องยืนยันรหัสผ่านทุกครั้ง
                ระบบบันทึกว่าใครดาวน์โหลดและมีใครอยู่ในไฟล์ กรุณาส่งให้ฝ่ายการเงินผ่านช่องทางของหน่วยงานเท่านั้น
              </p>
            </div>
          </div>

          <TextField
            name="officer-password-suppliers"
            isRequired
            value={password}
            onChange={v => { setPassword(v); if (err) setErr(null); }}
            isInvalid={!!err}
          >
            <Label>รหัสผ่านของคุณ</Label>
            <InputGroup>
              <InputGroup.Input type="password" autoComplete="current-password" />
            </InputGroup>
            {err && <FieldError>{err}</FieldError>}
          </TextField>
        </div>
      </Modal>
    </>
  );
}
