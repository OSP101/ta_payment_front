"use client";
import TotpField from "./TotpField";
import { useState } from "react";
import { mutate } from "swr";
import { KeyRound, RefreshCw, ShieldOff } from "lucide-react";
import { errMessage, mfaDisable, mfaRegenerateRecoveryCodes } from "../lib/api";
import { notify } from "../lib/notify";
import { Alert, Button, Modal } from "./ui";
import { useI18n } from "../lib/i18n/client";

/** Both account-security actions require a fresh TOTP from the authenticator. */
export default function TwoFactorManageModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open onClose={onClose} title={t("จัดการการยืนยันตัวตนสองขั้นตอน")} size="md">
      <div className="flex flex-col gap-6">
        <RegenerateSection />
        <div className="border-t border-[var(--hairline)]" />
        <DisableSection onDisabled={onClose} />
      </div>
    </Modal>
  );
}

function RegenerateSection() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (code.length !== 6) {
      setErr(t("กรุณากรอกรหัส TOTP 6 หลัก"));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await mfaRegenerateRecoveryCodes(code);
      setCodes(res.recovery_codes);
      setCode("");
      mutate("/me");
      notify.success(t("สร้างรหัสสำรองชุดใหม่แล้ว รหัสชุดเดิมใช้ไม่ได้อีกต่อไป"));
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <RefreshCw size={15} /> {t("สร้างรหัสสำรองใหม่")}
      </div>
      <p className="text-xs text-muted">
        {t("ใช้เมื่อรหัสสำรองเดิมใกล้หมด รหัสชุดเดิมทั้งหมดจะใช้ไม่ได้ทันที")}
      </p>

      {codes ? (
        <div className="grid grid-cols-2 gap-2">
          {codes.map(c => (
            <code key={c} className="px-2 py-1.5 rounded-md bg-default text-xs font-mono text-center select-all">
              {c}
            </code>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <TotpField label={t("รหัส TOTP 6 หลักจากแอป Authenticator")} value={code} onChange={v => { setCode(v); setErr(null); }} className="flex-1" />
          <Button variant="secondary" onClick={submit} disabled={pending} isPending={pending}>
            {t("สร้างใหม่")}
          </Button>
        </div>
      )}
      {err && <Alert status="danger" title={t("สร้างรหัสสำรองไม่สำเร็จ")} description={err} />}
    </div>
  );
}

function DisableSection({ onDisabled }: { onDisabled: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (code.length !== 6) {
      setErr(t("กรุณากรอกรหัส TOTP 6 หลัก"));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await mfaDisable(code);
      mutate("/me");
      notify.success(t("ปิดใช้งาน 2FA แล้ว"));
      onDisabled();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-danger-soft-foreground">
        <ShieldOff size={15} /> {t("ปิดใช้งาน 2FA")}
      </div>
      <p className="text-xs text-muted">
        {t("บัญชีจะเข้าสู่ระบบด้วยรหัสผ่านเพียงอย่างเดียวหลังจากนี้")}
      </p>
      <TotpField label={t("รหัส TOTP 6 หลักจากแอป Authenticator")} value={code} onChange={v => { setCode(v); setErr(null); }} />
      {err && <Alert status="danger" title={t("ปิดใช้งาน 2FA ไม่สำเร็จ")} description={err} />}
      <Button variant="danger" onClick={submit} disabled={pending} isPending={pending}>
        <KeyRound size={14} /> {t("ปิดใช้งาน 2FA")}
      </Button>
    </div>
  );
}
