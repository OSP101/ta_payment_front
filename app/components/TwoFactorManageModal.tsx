"use client";
import { useState } from "react";
import { mutate } from "swr";
import { Eye, EyeOff, KeyRound, RefreshCw, ShieldOff } from "lucide-react";
import { InputGroup, Label, TextField } from "@heroui/react";
import { errMessage, mfaDisable, mfaRegenerateRecoveryCodes } from "../lib/api";
import { notify } from "../lib/notify";
import { Alert, Button, IconButton, Modal } from "./ui";

/**
 * The two things a user with 2FA already enabled can do to it — both live in
 * one modal since neither is common enough to earn its own screen. Both
 * require the account password (same re-auth gate every other sensitive
 * account action uses); disabling additionally requires a current code,
 * proving both factors to remove either.
 */
export default function TwoFactorManageModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="จัดการการยืนยันตัวตนสองขั้นตอน" size="md">
      <div className="flex flex-col gap-6">
        <RegenerateSection />
        <div className="border-t border-[var(--hairline)]" />
        <DisableSection onDisabled={onClose} />
      </div>
    </Modal>
  );
}

function RegenerateSection() {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!password) {
      setErr("กรุณากรอกรหัสผ่าน");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await mfaRegenerateRecoveryCodes(password);
      setCodes(res.recovery_codes);
      setPassword("");
      mutate("/me");
      notify.success("สร้างรหัสสำรองชุดใหม่แล้ว รหัสชุดเดิมใช้ไม่ได้อีกต่อไป");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <RefreshCw size={15} /> สร้างรหัสสำรองใหม่
      </div>
      <p className="text-xs text-muted">
        ใช้เมื่อรหัสสำรองเดิมใกล้หมด รหัสชุดเดิมทั้งหมดจะใช้ไม่ได้ทันที
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
        <div className="flex items-end gap-2">
          <TextField name="regen-password" value={password} onChange={v => { setPassword(v); setErr(null); }} className="flex-1">
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
          <Button variant="secondary" onClick={submit} disabled={pending} isPending={pending}>
            สร้างใหม่
          </Button>
        </div>
      )}
      {err && <Alert status="danger" title="สร้างรหัสสำรองไม่สำเร็จ" description={err} />}
    </div>
  );
}

function DisableSection({ onDisabled }: { onDisabled: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!password || !code) {
      setErr("กรอกรหัสผ่านและรหัสยืนยันให้ครบ");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await mfaDisable(password, code);
      mutate("/me");
      notify.success("ปิดใช้งาน 2FA แล้ว");
      onDisabled();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-danger">
        <ShieldOff size={15} /> ปิดใช้งาน 2FA
      </div>
      <p className="text-xs text-muted">
        บัญชีจะเข้าสู่ระบบด้วยรหัสผ่านเพียงอย่างเดียวหลังจากนี้
      </p>
      <TextField name="disable-password" value={password} onChange={v => { setPassword(v); setErr(null); }}>
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
      <TextField name="disable-code" value={code} onChange={v => { setCode(v); setErr(null); }}>
        <Label className="text-xs">รหัสยืนยัน 6 หลัก หรือรหัสสำรอง</Label>
        <InputGroup>
          <InputGroup.Input placeholder="123456" autoComplete="one-time-code" lang="en" />
        </InputGroup>
      </TextField>
      {err && <Alert status="danger" title="ปิดใช้งาน 2FA ไม่สำเร็จ" description={err} />}
      <Button variant="danger" onClick={submit} disabled={pending} isPending={pending}>
        <KeyRound size={14} /> ปิดใช้งาน 2FA
      </Button>
    </div>
  );
}
