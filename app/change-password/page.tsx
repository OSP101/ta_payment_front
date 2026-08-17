"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import zxcvbn from "zxcvbn";
import { Alert, Button, Card, FieldError, InputGroup, Label, Meter, TextField } from "@heroui/react";
import { IconButton } from "../components/ui";
import { Check, Eye, EyeOff, KeyRound, ShieldAlert, X } from "lucide-react";
import { api, errMessage, type Me } from "../lib/api";

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_=+[\]{};:,.<>/?]/;

// score 0-4 from zxcvbn -> Thai label + HeroUI Meter color. Kept in one place
// so the bar and the text under it can never drift out of sync.
const STRENGTH_LEVELS: { label: string; color: "danger" | "warning" | "accent" | "success" }[] = [
  { label: "อ่อนมาก", color: "danger" },
  { label: "อ่อน", color: "danger" },
  { label: "ปานกลาง", color: "warning" },
  { label: "ดี", color: "accent" },
  { label: "แข็งแรงมาก", color: "success" },
];

export default function ChangePasswordPage() {
  // Same SWR key every other page already fetches "/me" under — decides
  // whether this is the forced first-login change (no current password to
  // confirm) or a voluntary change from Account Settings (backend requires
  // current_password for that one — see AuthHandler.ChangePassword).
  const { data: me } = useSWR<Me>("/me");
  const voluntary = !!me && !me.must_change_password;

  const [currentPw, setCurrentPw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  // Each field toggles its own visibility independently — revealing the new
  // password shouldn't also reveal the current/confirm fields.
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rules = [
    { ok: pw.length >= 8, label: "อย่างน้อย 8 ตัวอักษร" },
    { ok: /[A-Z]/.test(pw), label: "มีตัวพิมพ์ใหญ่ (A–Z)" },
    { ok: /[a-z]/.test(pw), label: "มีตัวพิมพ์เล็ก (a–z)" },
    { ok: /[0-9]/.test(pw), label: "มีตัวเลข (0–9)" },
    { ok: SPECIAL_CHAR_RE.test(pw), label: "มีอักขระพิเศษ (!@#$%...)" },
  ];
  const rulesPass = rules.every(r => r.ok);

  // zxcvbn is CPU-bound (pattern matching over dictionaries) but fast enough
  // for interactive typing at this length; still no need to redo it when
  // nothing else changed.
  const strength = useMemo(() => (pw ? zxcvbn(pw).score : null), [pw]);

  const errors = useMemo(() => {
    const e: { currentPw: string | null; pw: string | null; pw2: string | null } = {
      currentPw: null, pw: null, pw2: null,
    };
    if (voluntary && currentPw.length === 0) e.currentPw = "กรุณากรอกรหัสผ่านปัจจุบัน";
    if (pw.length === 0) e.pw = "กรุณากรอกรหัสผ่านใหม่";
    else if (!rulesPass) e.pw = "รหัสผ่านยังไม่ตรงตามเงื่อนไขทั้งหมด";
    else if (voluntary && currentPw.length > 0 && pw === currentPw)
      e.pw = "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
    if (pw2.length === 0) e.pw2 = "กรุณายืนยันรหัสผ่านใหม่";
    else if (pw !== pw2) e.pw2 = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    return e;
  }, [voluntary, currentPw, pw, pw2, rulesPass]);
  const hasErrors = !!(errors.currentPw || errors.pw || errors.pw2);

  // Same show/hide toggle markup for all three password fields, parameterized
  // by each field's own state so they stay visually consistent without being
  // tied together.
  function toggleSuffix(show: boolean, setShow: (v: boolean) => void) {
    return (
      <InputGroup.Suffix className="pr-0">
        <IconButton
          size="sm"
          variant="ghost"
          label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          onPress={() => setShow(!show)}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
      </InputGroup.Suffix>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (hasErrors) return;
    setErr(null);
    setLoading(true);
    try {
      await api.post("/me/password", {
        ...(voluntary ? { current_password: currentPw } : {}),
        new_password: pw,
      });
      // A changed password now ends the session it was changed from too (see
      // AuthHandler.ChangePassword / SessionService.RevokeAllForUser) — the
      // next request under the old cookie would 401 anyway, so go straight to
      // login instead of bouncing through "/" and landing there via a
      // generic session-expired redirect with no explanation.
      window.location.assign("/login?reason=password_changed");
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center text-accent-foreground text-xl font-bold shadow-sm bg-accent">
            <KeyRound />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground">
            {voluntary ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่านใหม่"}
          </h1>
          <p className="text-sm text-muted mt-1">
            {voluntary
              ? "เปลี่ยนรหัสผ่านสำหรับบัญชีของคุณ"
              : "เพื่อความปลอดภัย โปรดตั้งรหัสผ่านใหม่ก่อนใช้งานครั้งแรก"}
          </p>
        </div>

        <Card>
          <Card.Content>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {voluntary && (
                <TextField
                  name="currentPw"
                  isRequired
                  value={currentPw}
                  onChange={setCurrentPw}
                  isInvalid={showErrors && !!errors.currentPw}
                >
                  <Label>รหัสผ่านปัจจุบัน</Label>
                  <InputGroup>
                    <InputGroup.Input type={showCurrentPw ? "text" : "password"} autoComplete="current-password" />
                    {toggleSuffix(showCurrentPw, setShowCurrentPw)}
                  </InputGroup>
                  {showErrors && errors.currentPw && <FieldError>{errors.currentPw}</FieldError>}
                </TextField>
              )}
              <TextField
                name="pw"
                isRequired
                value={pw}
                onChange={setPw}
                isInvalid={showErrors && !!errors.pw}
              >
                <Label>รหัสผ่านใหม่</Label>
                <InputGroup>
                  <InputGroup.Input type={showPw ? "text" : "password"} autoComplete="new-password" />
                  {toggleSuffix(showPw, setShowPw)}
                </InputGroup>
                {strength !== null && (
                  <Meter
                    aria-label="ความแข็งแรงของรหัสผ่าน"
                    className="mt-2"
                    size="sm"
                    color={STRENGTH_LEVELS[strength].color}
                    value={(strength + 1) * 20}
                    valueLabel={STRENGTH_LEVELS[strength].label}
                  >
                    <Label className="text-xs text-muted">ความแข็งแรงของรหัสผ่าน</Label>
                    <Meter.Output />
                    <Meter.Track>
                      <Meter.Fill />
                    </Meter.Track>
                  </Meter>
                )}
                <div className="mt-1.5 flex flex-col gap-1">
                  {rules.map((r, i) => (
                    <div
                      key={i}
                      className={"flex items-center gap-1.5 text-xs " + (r.ok ? "text-success" : "text-muted")}
                    >
                      {r.ok ? <Check size={13} /> : <X size={13} />}
                      {r.label}
                    </div>
                  ))}
                </div>
                {showErrors && errors.pw && <FieldError>{errors.pw}</FieldError>}
              </TextField>
              <TextField
                name="pw2"
                isRequired
                value={pw2}
                onChange={setPw2}
                isInvalid={showErrors && !!errors.pw2}
              >
                <Label>ยืนยันรหัสผ่านใหม่</Label>
                <InputGroup>
                  <InputGroup.Input type={showPw2 ? "text" : "password"} autoComplete="new-password" />
                  {toggleSuffix(showPw2, setShowPw2)}
                </InputGroup>
                {showErrors && errors.pw2 && <FieldError>{errors.pw2}</FieldError>}
              </TextField>
              {err && (
                <Alert status="danger">
                  <Alert.Indicator><ShieldAlert size={16} /></Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>ตั้งรหัสผ่านไม่สำเร็จ</Alert.Title>
                    <Alert.Description>{err}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {/* Only the voluntary flow gets a way out — a forced first-login
                  change has no account to "go back" to using yet, the temp
                  password can't be kept (see the reuse check), so there is
                  nothing a cancel button could sensibly do there. */}
              {voluntary ? (
                <div className="flex gap-2">
                  <Link href="/account" className="flex-1">
                    <Button type="button" variant="ghost" size="lg" fullWidth isDisabled={loading}>
                      ยกเลิก
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1"
                    isPending={loading}
                    isDisabled={showErrors && hasErrors}
                  >
                    {loading ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  isPending={loading}
                  isDisabled={showErrors && hasErrors}
                >
                  {loading ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
                </Button>
              )}
            </form>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
