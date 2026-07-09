"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Input,
  InputGroup,
  Label,
  Separator,
  Spinner,
  TextField,
} from "@heroui/react";
import { LogIn, Eye, EyeOff, Shield, ShieldAlert } from "lucide-react";
import { api, errMessage, type Me } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ enabled: boolean; url?: string }>("/auth/sso/url")
      .then(r => { if (r.enabled && r.url) setSsoUrl(r.url); })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.post<{ user: Me; token?: string }>("/auth/login", { email, password });
      if (res.user?.must_change_password) {
        router.push("/change-password");
      } else {
        // Honour a ?next= redirect target set when the session expired mid-use.
        const next = new URLSearchParams(window.location.search).get("next");
        router.push(next && next.startsWith("/") ? next : "/");
      }
      router.refresh();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top brand strip */}
      <header className="border-b border-border px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-accent-foreground font-bold text-sm bg-accent">
            T
          </div>
          <div className="font-semibold text-[15px] text-foreground">TA Payment</div>
        </div>
        <div className="text-xs text-muted">วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น</div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 bg-background">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center text-accent-foreground text-xl font-bold shadow-sm bg-accent">
              T
            </div>
            <h1 className="mt-4 text-[22px] font-semibold text-foreground">
              เข้าสู่ระบบ TA Payment
            </h1>
            <p className="text-sm text-muted mt-1">ระบบเบิกจ่ายค่าตอบแทนผู้ช่วยสอน</p>
          </div>

          <Card>
            <Card.Content className="flex flex-col gap-4">
              {ssoUrl && (
                <>
                  <a href={ssoUrl}>
                    <Button variant="secondary" fullWidth>
                      <Shield />
                      เข้าสู่ระบบด้วย KKU Account (SSO)
                    </Button>
                  </a>
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted">หรือ</span>
                    <Separator className="flex-1" />
                  </div>
                </>
              )}

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <TextField
                  name="email"
                  type="email"
                  isRequired
                  value={email}
                  onChange={(v) => { setEmail(v); if (err) setErr(null); }}
                >
                  <Label>อีเมล</Label>
                  <Input placeholder="you@kkumail.com" autoComplete="email" />
                </TextField>

                <TextField
                  name="password"
                  isRequired
                  value={password}
                  onChange={(v) => { setPassword(v); if (err) setErr(null); }}
                >
                  <Label>รหัสผ่าน</Label>
                  <InputGroup>
                    <InputGroup.Input
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                    />
                    <InputGroup.Suffix className="pr-0">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                        onPress={() => setShowPw(!showPw)}
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </InputGroup.Suffix>
                  </InputGroup>
                </TextField>

                {err && (
                  <Alert status="danger">
                    <Alert.Indicator>
                      <ShieldAlert size={16} />
                    </Alert.Indicator>
                    <Alert.Content>
                      <Alert.Title>เข้าสู่ระบบไม่สำเร็จ</Alert.Title>
                      <Alert.Description>{err}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                )}

                <Button type="submit" size="lg" fullWidth isPending={loading}>
                  {loading ? <Spinner color="current" size="sm" /> : <LogIn />}
                  {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted">
                ลืมรหัสผ่าน? กรุณาติดต่อเจ้าหน้าที่วิทยาลัยการคอมพิวเตอร์เพื่อรีเซ็ตรหัสผ่าน
              </p>
            </Card.Content>
          </Card>

          <p className="text-center text-xs text-muted mt-6">
            © {new Date().getFullYear()} College of Computing, Khon Kaen University
          </p>
        </div>
      </main>
    </div>
  );
}
