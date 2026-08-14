"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  FieldError,
  InputGroup,
  Label,
  Separator,
  Spinner,
  TextField,
} from "@heroui/react";
import { LogIn, Eye, EyeOff, Shield, Clock, MonitorSmartphone, LogOut, CheckCircle2 } from "lucide-react";
import { Alert, IconButton } from "../components/ui";
import { BetaBadge, BetaNoticeModal, hasSeenBetaNotice } from "../components/BetaNotice";
import { api, errMessage, type Me } from "../lib/api";
import { notify } from "../lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THAI_RE = /[฀-๿]/;

/**
 * Why the login page loaded instead of somewhere the user was already on.
 * `session_idle`/`session_superseded`/`session_revoked` are set by api.ts's
 * handleAuthRedirect and by SessionActivityGuard's own client-side idle
 * timer — both funnel through the same ?reason= so this map is the one
 * place that turns a code into what the user actually reads.
 * `password_changed` is login-page-only: set by /change-password after a
 * successful change, which now also ends that session (see
 * AuthHandler.ChangePassword) rather than leaving the user signed in.
 */
const REASON_INFO: Record<
  string,
  { status: "warning" | "accent" | "success"; icon: React.ReactNode; title: string; description: string }
> = {
  session_idle: {
    status: "warning", icon: <Clock size={16} />,
    title: "ออกจากระบบอัตโนมัติ",
    description: "เนื่องจากไม่มีการใช้งานเกิน 15 นาที เพื่อความปลอดภัยของบัญชีคุณ",
  },
  session_superseded: {
    status: "warning", icon: <MonitorSmartphone size={16} />,
    title: "เข้าสู่ระบบจากอุปกรณ์อื่น",
    description: "บัญชีนี้ใช้งานได้ครั้งละ 1 เครื่องเท่านั้น การเข้าสู่ระบบที่นี่จึงสิ้นสุดลง",
  },
  session_revoked: {
    status: "accent", icon: <LogOut size={16} />,
    title: "เซสชันสิ้นสุดแล้ว",
    description: "กรุณาเข้าสู่ระบบอีกครั้ง",
  },
  password_changed: {
    status: "success", icon: <CheckCircle2 size={16} />,
    title: "ตั้งรหัสผ่านใหม่สำเร็จ",
    description: "กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ของคุณ",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [loading, setLoading] = useState(false);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);
  const [betaOpen, setBetaOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ enabled: boolean; url?: string }>("/auth/sso/url")
      .then(r => { if (r.enabled && r.url) setSsoUrl(r.url); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setReason(new URLSearchParams(window.location.search).get("reason"));
  }, []);

  useEffect(() => {
    if (!hasSeenBetaNotice()) setBetaOpen(true);
  }, []);

  const fieldErrors = useMemo(() => {
    const e: { email?: string; password?: string } = {};
    const trimmed = email.trim();
    if (!trimmed) e.email = "กรุณากรอกอีเมล";
    else if (!EMAIL_RE.test(trimmed)) e.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (!password) e.password = "กรุณากรอกรหัสผ่าน";
    return e;
  }, [email, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (fieldErrors.email || fieldErrors.password) {
      setShowErrors(true);
      const missing = [
        fieldErrors.email ? "อีเมล" : null,
        fieldErrors.password ? "รหัสผ่าน" : null,
      ].filter(Boolean).join(" และ ");
      notify.warning(missing ? `กรุณากรอก${missing}ให้ครบก่อนเข้าสู่ระบบ` : "กรุณาตรวจสอบข้อมูลที่กรอก");
      return;
    }

    setShowErrors(false);
    setLoading(true);
    try {
      const res = await api.post<{ user: Me; token?: string }>("/auth/login", { email: email.trim(), password });
      if (res.user?.must_change_password) {
        router.push("/change-password");
      } else {
        // Honour a ?next= redirect target set when the session expired mid-use.
        const next = new URLSearchParams(window.location.search).get("next");
        router.push(next && next.startsWith("/") ? next : "/");
      }
      router.refresh();
    } catch (e) {
      notify.error(errMessage(e));
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
          <BetaBadge onClick={() => setBetaOpen(true)} />
        </div>
        {/* <div className="text-xs text-muted">วิทยาลัยการคอมพิวเตอร์ ม.ขอนแก่น</div> */}
      </header>
      <BetaNoticeModal open={betaOpen} onClose={() => setBetaOpen(false)} />

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

          {reason && REASON_INFO[reason] && (
            <div className="mb-4">
              <Alert
                status={REASON_INFO[reason].status}
                icon={REASON_INFO[reason].icon}
                title={REASON_INFO[reason].title}
                description={REASON_INFO[reason].description}
              />
            </div>
          )}

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
                  onChange={setEmail}
                  onBlur={() => setTouched(t => ({ ...t, email: true }))}
                  isInvalid={(touched.email || showErrors) && !!fieldErrors.email}
                >
                  <Label>อีเมล</Label>
                  <InputGroup>
                    <InputGroup.Input
                      placeholder="you@kkumail.com"
                      autoComplete="email"
                      lang="en"
                    />
                  </InputGroup>
                  {(touched.email || showErrors) && fieldErrors.email && (
                    <FieldError>{fieldErrors.email}</FieldError>
                  )}
                  {THAI_RE.test(email) && (
                    <p className="text-xs text-warning mt-1">
                      ตรวจพบอักษรไทย กด Alt+Shift (หรือ ~) เพื่อสลับคีย์บอร์ดเป็น EN
                    </p>
                  )}
                </TextField>

                <TextField
                  name="password"
                  isRequired
                  value={password}
                  onChange={setPassword}
                  onBlur={() => setTouched(t => ({ ...t, password: true }))}
                  isInvalid={(touched.password || showErrors) && !!fieldErrors.password}
                >
                  <Label>รหัสผ่าน</Label>
                  <InputGroup>
                    <InputGroup.Input
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      lang="en"
                    />
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
                  {(touched.password || showErrors) && fieldErrors.password && (
                    <FieldError>{fieldErrors.password}</FieldError>
                  )}
                  {THAI_RE.test(password) && (
                    <p className="text-xs text-warning mt-1">
                      ตรวจพบอักษรไทยในรหัสผ่าน กด Alt+Shift (หรือ ~) เพื่อสลับคีย์บอร์ดเป็น EN
                    </p>
                  )}
                </TextField>

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
          <p className="text-center text-xs text-muted mt-1">
            Developed by{" "}
            <a
              href="https://osp101.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              ITII Development Team
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
