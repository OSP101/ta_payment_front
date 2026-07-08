"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, FieldError, Input, Label, TextField } from "@heroui/react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errors = useMemo(() => {
    const e: { pw: string | null; pw2: string | null } = { pw: null, pw2: null };
    if (pw.length === 0) e.pw = "กรุณากรอกรหัสผ่านใหม่";
    else if (pw.length < 8) e.pw = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    else if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))
      e.pw = "รหัสผ่านควรมีทั้งตัวอักษรและตัวเลข";
    if (pw2.length === 0) e.pw2 = "กรุณายืนยันรหัสผ่านใหม่";
    else if (pw !== pw2) e.pw2 = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    return e;
  }, [pw, pw2]);
  const hasErrors = !!(errors.pw || errors.pw2);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (hasErrors) return;
    setErr(null);
    setLoading(true);
    try {
      await api.post("/me/password", { new_password: pw });
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
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
          <h1 className="mt-4 text-[22px] font-semibold text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-sm text-muted mt-1">
            เพื่อความปลอดภัย โปรดตั้งรหัสผ่านใหม่ก่อนใช้งานครั้งแรก
          </p>
        </div>

        <Card>
          <Card.Content>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <TextField
                name="pw"
                isRequired
                value={pw}
                onChange={setPw}
                isInvalid={showErrors && !!errors.pw}
              >
                <Label>รหัสผ่านใหม่</Label>
                <Input type="password" autoComplete="new-password" />
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
                <Input type="password" autoComplete="new-password" />
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
              <Button
                type="submit"
                size="lg"
                fullWidth
                isPending={loading}
                isDisabled={showErrors && hasErrors}
              >
                {loading ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
              </Button>
            </form>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
