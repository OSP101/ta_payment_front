"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Description,
  FieldError,
  InputOTP,
  Label,
  REGEXP_ONLY_DIGITS,
  Spinner,
} from "@heroui/react";
import { Check, Copy, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, errMessage, mfaEnable, mfaSetup, type MFASetupResult } from "../lib/api";
import { notify } from "../lib/notify";

/**
 * Forced 2FA enrolment — landed on via AccountGuard's mfa_setup_required
 * (see internal/handler/middleware.go), the mandatory-tier twin of
 * /change-password. Bare client page: NO shared layout, NO requireRole
 * wrapper — same reasoning as /change-password (app/change-password/page.tsx),
 * since a server-side layout fetch would itself get blocked by the very
 * 403 this page exists to resolve.
 */
export default function Setup2FAPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<MFASetupResult | null>(null);
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [savedAck, setSavedAck] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    mfaSetup()
      .then(setSetup)
      .catch(e => setSetupErr(errMessage(e)));
  }, []);

  const codesText = useMemo(() => (recoveryCodes ?? []).join("\n"), [recoveryCodes]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setCodeErr("กรอกรหัส 6 หลักจากแอปยืนยันตัวตน");
      return;
    }
    setCodeErr(null);
    setVerifying(true);
    try {
      const res = await mfaEnable(code);
      setRecoveryCodes(res.recovery_codes);
    } catch (e) {
      setCode("");
      setCodeErr(errMessage(e));
    } finally {
      setVerifying(false);
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  function finish() {
    router.push("/");
    router.refresh();
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      notify.error(e);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center text-accent-foreground text-xl font-bold shadow-sm bg-accent">
            <ShieldCheck />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground">
            {recoveryCodes ? "บันทึกรหัสสำรองของคุณ" : "ตั้งค่าการยืนยันตัวตนสองขั้นตอน"}
          </h1>
          <p className="text-sm text-muted mt-1">
            {recoveryCodes
              ? "เก็บรหัสเหล่านี้ไว้ในที่ปลอดภัย ใช้แทนแอปยืนยันตัวตนได้เมื่อทำอุปกรณ์หาย"
              : "บัญชีนี้ต้องเปิดใช้งาน 2FA ก่อนใช้งานระบบต่อ"}
          </p>
        </div>

        <Card>
          <Card.Content>
            {recoveryCodes ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map(c => (
                    <code
                      key={c}
                      className="px-3 py-2 rounded-md bg-default text-sm font-mono text-center select-all"
                    >
                      {c}
                    </code>
                  ))}
                </div>
                <Button variant="secondary" onClick={copyCodes}>
                  <Copy size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด"}
                </Button>
                <Checkbox isSelected={savedAck} onChange={setSavedAck}>
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    ฉันได้บันทึกรหัสสำรองไว้ในที่ปลอดภัยแล้ว รหัสนี้จะไม่แสดงอีก
                  </Checkbox.Content>
                </Checkbox>
                <Button size="lg" fullWidth isDisabled={!savedAck} onClick={finish}>
                  <Check size={16} /> เสร็จสิ้น เข้าใช้งานระบบ
                </Button>
              </div>
            ) : setupErr ? (
              <div className="flex flex-col gap-4">
                <Alert status="danger">
                  <Alert.Indicator><ShieldAlert size={16} /></Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>ตั้งค่า 2FA ไม่สำเร็จ</Alert.Title>
                    <Alert.Description>{setupErr}</Alert.Description>
                  </Alert.Content>
                </Alert>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  ลองใหม่
                </Button>
              </div>
            ) : !setup ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : (
              <form onSubmit={onVerify} className="flex flex-col gap-4 items-center">
                <p className="text-sm text-muted text-center">
                  สแกน QR นี้ด้วยแอปยืนยันตัวตน (เช่น Google Authenticator) แล้วกรอกรหัส 6 หลักที่แสดงขึ้น
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qr_png_base64}
                  alt="QR code สำหรับตั้งค่าแอปยืนยันตัวตน"
                  className="size-48 rounded-md border border-[var(--hairline)]"
                />
                <div className="w-full">
                  <div className="text-xs text-muted mb-1 text-center">สแกนไม่ได้? กรอกรหัสนี้ในแอปแทน</div>
                  <code className="block px-3 py-2 rounded-md bg-default text-sm font-mono text-center select-all break-all">
                    {setup.secret}
                  </code>
                </div>

                <div className="flex flex-col gap-2 items-center w-full">
                  <Label>รหัสยืนยัน 6 หลัก</Label>
                  <InputOTP
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={code}
                    onChange={v => { setCode(v); setCodeErr(null); }}
                    isInvalid={!!codeErr}
                  >
                    <InputOTP.Group>
                      <InputOTP.Slot index={0} />
                      <InputOTP.Slot index={1} />
                      <InputOTP.Slot index={2} />
                    </InputOTP.Group>
                    <InputOTP.Separator />
                    <InputOTP.Group>
                      <InputOTP.Slot index={3} />
                      <InputOTP.Slot index={4} />
                      <InputOTP.Slot index={5} />
                    </InputOTP.Group>
                  </InputOTP>
                  {codeErr && <FieldError>{codeErr}</FieldError>}
                  <Description className="text-center">
                    ยังไม่ได้เปิดใช้งาน — กรอกรหัสให้ถูกต้องก่อนจึงจะเปิดใช้งานจริง
                  </Description>
                </div>

                <Button type="submit" size="lg" fullWidth isPending={verifying}>
                  {verifying ? "กำลังตรวจสอบ…" : "ยืนยันและเปิดใช้งาน"}
                </Button>
              </form>
            )}
          </Card.Content>
        </Card>

        {!recoveryCodes && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={logout}
              className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1"
            >
              <LogOut size={13} /> ออกจากระบบ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
