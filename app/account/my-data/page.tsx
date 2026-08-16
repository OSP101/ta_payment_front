"use client";
import { useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, Download, IdCard, ShieldCheck, FileText, Trash2 } from "lucide-react";
import { InputGroup, Label, TextField } from "@heroui/react";
import {
  errMessage, type Me,
  dataExport, citizenIdReveal, requestDataDeletion,
  type MyDataExport, type DataDeletionRequest,
} from "../../lib/api";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Button, IconButton, TextArea, Alert, Chip, StatusChip } from "../../components/ui";

/**
 * PDPA self-service data access — "what do you have on me" (export/view) and
 * "please delete what you can" (request). Linked from AccountSettings. Any
 * authenticated role can view/export; the citizen-ID reveal and deletion
 * request are TA-only server-side (RequireRole(rbac.RoleTA)), so those
 * sections only render for a TA — everyone else just sees their export.
 */
export default function MyDataPage() {
  const { data: me } = useSWR<Me>("/me");
  const { data: exp, error, mutate: revalidate } = useSWR<MyDataExport>("/me/data-export");
  const isTA = !!me?.roles?.includes("ta");

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="ข้อมูลของฉัน"
        description="ดูข้อมูลส่วนบุคคลทั้งหมดที่ระบบจัดเก็บไว้ ดาวน์โหลด หรือขอให้ลบข้อมูล ตามสิทธิของเจ้าของข้อมูลภายใต้ PDPA"
      />

      {error && <Alert status="danger" title="โหลดข้อมูลไม่สำเร็จ" description={errMessage(error)} />}

      {exp && (
        <>
          <ProfileSection exp={exp} />
          {isTA && <CitizenIdSection />}
          <DocumentsSection exp={exp} />
          <SecuritySection exp={exp} />
          <ExportSection />
          {isTA && <DeletionRequestSection />}
        </>
      )}

      <div className="mt-2">
        <Button variant="ghost" size="sm" onClick={() => revalidate()}>
          รีเฟรชข้อมูล
        </Button>
      </div>
    </div>
  );
}

function ProfileSection({ exp }: { exp: MyDataExport }) {
  const p = exp.profile;
  return (
    <Panel title="ข้อมูลส่วนตัว" className="mb-4">
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <Field label="อีเมล" value={p.email} />
        <Field label="ชื่อ-นามสกุล" value={`${p.title ?? ""} ${p.first_name} ${p.last_name}`.trim()} />
        <Field label="เบอร์โทรศัพท์" value={p.phone ?? "—"} />
        <Field label="รหัสนักศึกษา" value={p.student_id ?? "—"} />
        <Field label="หน่วยงาน" value={p.department ?? "—"} />
        <Field label="บทบาท" value={p.roles.join(", ") || "—"} />
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

/** Password-gated full citizen-ID reveal — mirrors TwoFactorManageModal's
 *  password-field pattern. Only the last 4 digits are ever fetched by
 *  default (MyDataExport); the full number is a deliberately separate,
 *  friction-ful action via POST /me/citizen-id/reveal. */
function CitizenIdSection() {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    if (!password) {
      setErr("กรุณากรอกรหัสผ่าน");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await citizenIdReveal(password);
      setRevealed(res.national_id);
      setPassword("");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      title="เลขบัตรประชาชน"
      description="จัดเก็บแบบเข้ารหัส การเปิดดูเลขเต็มทุกครั้งจะถูกบันทึกเป็นหลักฐาน (audit log)"
      className="mb-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
          <IdCard size={18} />
        </div>
        <div className="flex-1 font-mono text-sm">
          {revealed ?? "•-••••-•••••-••-•"}
        </div>
        {revealed && (
          <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            ซ่อน
          </Button>
        )}
      </div>

      {!revealed && (
        <div className="mt-3 flex items-end gap-2">
          <TextField name="reveal-password" value={password} onChange={v => { setPassword(v); setErr(null); }} className="flex-1">
            <Label className="text-xs">รหัสผ่านปัจจุบัน</Label>
            <InputGroup>
              <InputGroup.Input type={showPw ? "text" : "password"} autoComplete="current-password" lang="en" />
              <InputGroup.Suffix className="pr-0">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  onPress={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </IconButton>
              </InputGroup.Suffix>
            </InputGroup>
          </TextField>
          <Button variant="secondary" onClick={reveal} disabled={pending} isPending={pending}>
            แสดงเลขบัตรเต็ม
          </Button>
        </div>
      )}
      {err && <div className="mt-2"><Alert status="danger" title="เปิดดูไม่สำเร็จ" description={err} /></div>}
    </Panel>
  );
}

function DocumentsSection({ exp }: { exp: MyDataExport }) {
  const DOC_LABEL: Record<string, string> = {
    creditor_form: "แบบแจ้งเจ้าหนี้", national_id: "สำเนาบัตรประชาชน", bank_book: "หน้าสมุดบัญชี",
  };
  return (
    <Panel title="เอกสาร" className="mb-4">
      {exp.documents.length === 0 ? (
        <div className="text-sm text-muted">ยังไม่มีเอกสารที่อัปโหลด</div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--hairline)] -my-1">
          {exp.documents.map((d, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <FileText size={16} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{DOC_LABEL[d.kind] ?? d.kind}</div>
                <div className="text-xs text-muted">{new Date(d.uploaded_at).toLocaleString("th-TH")}</div>
              </div>
              <StatusChip status={d.status} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SecuritySection({ exp }: { exp: MyDataExport }) {
  return (
    <Panel title="ความปลอดภัยและการเข้าสู่ระบบ" className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <ShieldCheck size={16} className={exp.profile.totp_enabled ? "text-success" : "text-muted"} />
        <div className="text-sm text-foreground">
          2FA: {exp.profile.totp_enabled ? "เปิดใช้งานแล้ว" : "ยังไม่เปิดใช้งาน"}
        </div>
      </div>
      {exp.pdpa_consent && (
        <div className="text-xs text-muted mb-3">
          ยอมรับข้อตกลง PDPA เมื่อ {new Date(exp.pdpa_consent.consented_at).toLocaleString("th-TH")}
        </div>
      )}
      <div className="text-xs text-muted mb-2">ประวัติการเข้าสู่ระบบล่าสุด</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted text-left">
            <tr>
              <th className="font-normal pb-1 pr-3">เวลา</th>
              <th className="font-normal pb-1 pr-3">IP</th>
              <th className="font-normal pb-1 pr-3">อุปกรณ์</th>
              <th className="font-normal pb-1">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {exp.sessions.map(s => (
              <tr key={s.id} className="border-t border-[var(--hairline)]">
                <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(s.created_at).toLocaleString("th-TH")}</td>
                <td className="py-1.5 pr-3 font-mono">{s.ip ?? "—"}</td>
                <td className="py-1.5 pr-3 truncate max-w-[240px]" title={s.user_agent}>{s.user_agent ?? "—"}</td>
                <td className="py-1.5">
                  {s.revoked_at ? <Chip tone="neutral">สิ้นสุดแล้ว</Chip> : <Chip tone="success">ใช้งานอยู่</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-muted">
        กิจกรรมล่าสุดของคุณ {exp.recent_activity.length} รายการ (ดูเพิ่มเติมได้จากไฟล์ที่ดาวน์โหลดด้านล่าง)
      </div>
    </Panel>
  );
}

function ExportSection() {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const data = await dataExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      el.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Panel title="ดาวน์โหลดข้อมูลของฉัน" className="mb-4">
      <p className="text-sm text-muted mb-3">
        ดาวน์โหลดสำเนาข้อมูลทั้งหมดที่ระบบมีเกี่ยวกับคุณในรูปแบบไฟล์ JSON
      </p>
      <Button variant="secondary" onClick={download} disabled={downloading} isPending={downloading}>
        <Download size={14} /> ดาวน์โหลดข้อมูลของฉัน (JSON)
      </Button>
    </Panel>
  );
}

function DeletionRequestSection() {
  const { data: req, mutate: revalidate } = useSWR<DataDeletionRequest | null>(
    "/me/data-deletion-request");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await requestDataDeletion(reason);
      notify.success("ส่งคำขอลบข้อมูลเรียบร้อย เจ้าหน้าที่จะตรวจสอบและแจ้งผลกลับ");
      setReason("");
      setConfirming(false);
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel title="ขอให้ลบข้อมูลของฉัน" className="mb-4">
      {req && req.status === "pending" ? (
        <Alert
          status="warning"
          title="คำขออยู่ระหว่างการพิจารณา"
          description={`ส่งคำขอเมื่อ ${new Date(req.requested_at).toLocaleString("th-TH")} รอเจ้าหน้าที่ตรวจสอบและแจ้งผล`}
        />
      ) : req && req.status === "approved" ? (
        <Alert
          status="success"
          title="คำขอได้รับการอนุมัติแล้ว"
          description={req.review_note || "บัญชีถูกปิดใช้งานและข้อมูลที่ไม่จำเป็นถูกลบแล้ว ข้อมูลที่มีผลทางการเงิน (หากมี) ยังคงถูกเก็บไว้ตามข้อบังคับทางบัญชี/ภาษี"}
        />
      ) : (
        <>
          {req && req.status === "rejected" && (
            <div className="mb-3">
              <Alert status="danger" title="คำขอก่อนหน้าถูกปฏิเสธ" description={req.review_note || "-"} />
            </div>
          )}
          <p className="text-sm text-muted mb-3">
            คุณสามารถขอให้ลบข้อมูลส่วนบุคคลของคุณได้ ระบบจะปิดใช้งานบัญชีและลบข้อมูลที่ไม่จำเป็นทันที
            (การยืนยันตัวตนสองขั้นตอน รูปโปรไฟล์ ประวัติการเข้าสู่ระบบ เอกสารที่อัปโหลด) ส่วนข้อมูลที่มีผลทาง
            การเงิน เช่น เลขบัตรประชาชนและประวัติชั่วโมงสอนที่เคยเบิกจ่ายแล้ว จะยังถูกเก็บไว้ตามที่กฎหมาย
            บัญชี/ภาษีกำหนด หากไม่มีประวัติการเบิกจ่าย ระบบจะลบเลขบัตรประชาชนออกด้วย
          </p>
          {!confirming ? (
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 size={14} /> ขอให้ลบข้อมูลของฉัน
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <TextArea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="เหตุผล (ไม่บังคับ)"
                rows={3}
              />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={submit} disabled={submitting} isPending={submitting}>
                  ยืนยันส่งคำขอ
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
