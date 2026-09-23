"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import loginPhoto from "../../public/images/image-cp-login.jpg";
import {
  Button,
  Description,
  Disclosure,
  FieldError,
  InputGroup,
  InputOTP,
  Label,
  Link,
  REGEXP_ONLY_DIGITS,
  Separator,
  Skeleton,
  Spinner,
  TextField,
} from "@heroui/react";
import { LogIn, Eye, EyeOff, Clock, MonitorSmartphone, LogOut, CheckCircle2, ShieldCheck, Mail, ArrowLeft, ArrowRight } from "lucide-react";
import { Alert, IconButton } from "../components/ui";
import { BetaBadge, BetaNoticeModal, hasSeenBetaNotice } from "../components/BetaNotice";
import {
  api, ApiError, errMessage, setDemoApiPrefix, login, loginTwoFactor, ssoExchange, ssoConfirm,
  type Me, type SSOPending,
} from "../lib/api";
import { notify } from "../lib/notify";
import { sameOriginPath } from "../lib/safePath";
import { rememberLoginMethod } from "./loginMethod";
import useDocumentTitle from "../lib/useDocumentTitle";

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
  signed_out: {
    status: "success", icon: <CheckCircle2 size={16} />,
    title: "ออกจากระบบเรียบร้อยแล้ว",
    description: "ข้อมูลการเข้าสู่ระบบในเครื่องนี้ถูกล้างแล้ว หากใช้เครื่องสาธารณะ อย่าลืมออกจากระบบ KKU ด้วย",
  },
  password_changed: {
    status: "success", icon: <CheckCircle2 size={16} />,
    title: "ตั้งรหัสผ่านใหม่สำเร็จ",
    description: "กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ของคุณ",
  },
};

/**
 * KKU SSO entry point, carrying the university seal instead of a generic
 * icon. A plain <a> styled as a button rather than a HeroUI Button wrapped
 * in <a> — that nested a button inside a link, which is invalid HTML and
 * gave two tab stops for one action.
 */
function KkuSsoButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group flex items-center gap-3 w-full h-14 pl-2 pr-4 rounded-xl border border-border bg-surface text-foreground shadow-sm transition hover:border-[#A63A22]/50 hover:bg-[#A63A22]/[0.03] hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="grid place-items-center size-10 shrink-0 rounded-lg bg-white">
        <Image src="/images/kku-logo-mark.png" alt="" width={108} height={192} unoptimized priority className="h-9 w-auto" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block font-medium text-[15px] leading-tight">{children}</span>
        <span className="block text-xs text-muted leading-tight mt-0.5">ใช้บัญชีเดียวกับระบบของมหาวิทยาลัยขอนแก่น</span>
      </span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </a>
  );
}

/**
 * KKU SSO as the server saw it when it rendered /login (see page.tsx):
 * null means SSO is off; undefined means the server could not tell — the
 * backend was slow or down — and this component asks for itself.
 */
export type SSOConfig = { url: string; logoutUrl: string | null };

export default function LoginForm({
  initialSso,
  emailFormOpen = true,
}: {
  initialSso?: SSOConfig | null;
  /** Start with the email form expanded — see page.tsx for when. */
  emailFormOpen?: boolean;
}) {
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
  const [ssoUrl, setSsoUrl] = useState<string | null>(initialSso?.url ?? null);
  // Whether we know if SSO is on. Normally the server already answered and
  // the KKU button renders with the form; only when it could not does a
  // skeleton hold the button's place so the form does not jump when the
  // client's own check lands.
  const [ssoChecked, setSsoChecked] = useState(initialSso !== undefined);
  const [emailOpen, setEmailOpen] = useState(emailFormOpen);
  // KKU's logout — the only real way to "use another KKU account". A plain
  // link back to /login leaves the KKU session alive, and the next KKU click
  // signs the same person straight back in (shared lab machines).
  const [ssoLogoutUrl, setSsoLogoutUrl] = useState<string | null>(initialSso?.logoutUrl ?? null);
  const [betaOpen, setBetaOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  // Step 2 of login (see internal/handler/auth.go's AuthHandler.Login /
  // LoginTwoFactor). Deliberately rendered as a state change WITHIN this
  // same /login page rather than a navigation to a separate route — see
  // handleAuthRedirect/SessionActivityGuard: the user holds no session
  // cookie yet at this point, so navigating anywhere outside /login would
  // either trip the idle guard's heartbeat (401 → hard-redirect, destroying
  // the in-flight challenge) or, on a tab that once visited /demo, resolve
  // the code POST against a stale demo slot instead of production.
  const [challenge, setChallenge] = useState<string | null>(null);
  useDocumentTitle(challenge ? "ยืนยันตัวตนสองขั้นตอน" : "เข้าสู่ระบบ");
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // KKU SSONext callback. KKU registers /login/sso (which renders this same
  // component) as our callback and lands here with ?code=. The code is
  // exchanged at once — that is the only way to learn WHOSE account it is —
  // but no session exists until the person reads the confirm card and
  // clicks; see service.SSOService for why that pause is a security
  // property and not decoration.
  type SSOState =
    | { status: "exchanging" }
    | { status: "confirm"; pending: SSOPending }
    // wrongAccount: KKU signed in someone this system has no account for —
    // retrying with KKU would just return the same person, so the way out
    // is switching KKU account, not "try again".
    | { status: "error"; message: string; wrongAccount?: boolean };
  const [sso, setSso] = useState<SSOState | null>(null);

  // Landing on /login is an unambiguous signal that whatever happens next is
  // REAL production auth — clear any demo apiPrefix left over from an
  // earlier /demo visit in this same tab before this page's own API calls
  // (the SSO check right below, and the login submit further down) fire.
  // Without this, a tab that visited /demo and never clicked "ออกจากโหมด
  // ทดลอง" keeps routing every call here at the stale demo slot's own route
  // tree instead of production's /api/v1 — real credentials silently hit
  // the wrong backend.
  useEffect(() => {
    setDemoApiPrefix(null);
  }, []);

  useEffect(() => {
    if (initialSso !== undefined) return;
    api.get<{ enabled: boolean; url?: string; logout_url?: string }>("/auth/sso/url")
      .then(r => {
        if (r.enabled && r.url) setSsoUrl(r.url);
        if (r.enabled && r.logout_url) setSsoLogoutUrl(r.logout_url);
      })
      .catch(() => {})
      .finally(() => setSsoChecked(true));
  }, [initialSso]);

  useEffect(() => {
    setReason(new URLSearchParams(window.location.search).get("reason"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoCode = params.get("code");
    if (!ssoCode) return;
    // A code is single use at KKU's end. Take it out of the address bar
    // right away so a reload or a bookmark does not re-submit a spent code
    // and show "หมดอายุ" for a login that already went through.
    params.delete("code");
    params.delete("ssoState");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    setSso({ status: "exchanging" });
    ssoExchange(ssoCode)
      .then(pending => setSso({ status: "confirm", pending }))
      .catch(e => setSso({
        status: "error",
        message: errMessage(e),
        // 403 from exchange is only ever "no account for this KKU email".
        wrongAccount: e instanceof ApiError && e.status === 403,
      }));
  }, []);

  async function onConfirmSSO() {
    if (sso?.status !== "confirm") return;
    setLoading(true);
    try {
      const res = await ssoConfirm(sso.pending.ticket);
      rememberLoginMethod("sso");
      if ("mfa_required" in res) {
        // Same second step as a password login — a KKU assertion says who
        // this is, not that they hold the account's second factor.
        setChallenge(res.challenge);
        return;
      }
      finishLogin(res.user);
    } catch (e) {
      // The ticket is consumed either way; the only way forward is to start
      // over from the KKU button.
      setSso({ status: "error", message: errMessage(e) });
    } finally {
      setLoading(false);
    }
  }

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
      const res = await login(email.trim(), password);
      rememberLoginMethod("email");
      if ("mfa_required" in res) {
        // Password verified, second factor still outstanding — no session,
        // no cookie yet. Switch this same page into step 2; nothing to
        // navigate to.
        setChallenge(res.challenge);
        return;
      }
      finishLogin(res.user);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function finishLogin(user: Me) {
    if (user.must_change_password) {
      router.push("/change-password");
    } else {
      // Honour a ?next= redirect target set when the session expired mid-use.
      // It is attacker-controllable via a crafted /login?next=... link, so it is
      // resolved and origin-checked rather than prefix-matched.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(sameOriginPath(next));
    }
    router.refresh();
  }

  async function onSubmit2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    if (!code.trim()) {
      setCodeError(useRecoveryCode ? "กรุณากรอกรหัสสำรอง" : "กรุณากรอกรหัส 6 หลัก");
      return;
    }
    setCodeError(null);
    setLoading(true);
    try {
      const res = await loginTwoFactor(challenge, code.trim());
      finishLogin(res.user);
    } catch (e) {
      // Wrong code, expired challenge, and a consumed challenge all return
      // the same message from the backend by design — see
      // service.ErrMFAChallengeInvalid's doc comment — so there is nothing
      // more specific to show here even on a lockout (429), which arrives
      // with its own distinct message already.
      setCode("");
      notify.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // With SSO on, the email form sits folded inside a card under the KKU
  // button; without it, the form is the page and stands on its own.
  const emailInCard = !!ssoUrl || !ssoChecked;
  const emailForm = (
    <>
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
          <InputGroup variant={emailInCard ? "secondary" : undefined}>
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
          <InputGroup variant={emailInCard ? "secondary" : undefined}>
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

        {/* Outline while the KKU button is there, so it reads as the
          second way in rather than competing with it. */}
      <Button type="submit" size="lg" fullWidth isPending={loading} variant={emailInCard ? "outline" : "primary"}>
          {loading ? <Spinner color="current" size="sm" /> : <LogIn />}
          {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted">
        ลืมรหัสผ่าน? กรุณาติดต่อเจ้าหน้าที่วิทยาลัยการคอมพิวเตอร์เพื่อรีเซ็ตรหัสผ่าน
      </p>
    </>
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-background">
      <BetaNoticeModal open={betaOpen} onClose={() => setBetaOpen(false)} />

      {/* Photo panel — desktop only; phones go straight to the form. The
          photo is portrait (3:4), close to the panel's own shape, so it just
          covers it; the focal point keeps the sign in view when a narrow
          window crops the sides. */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-neutral-900 text-white px-10 py-8">
        {/* Static import, so the build knows the size and inlines a tiny
            blurred copy that paints at once while the real photo loads. */}
        <Image
          src={loginPhoto}
          alt="ป้ายวิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น"
          fill
          sizes="46vw"
          placeholder="blur"
          loading="eager"
          fetchPriority="high"
          className="object-cover object-[47%_60%]"
        />
        {/* Dark bands behind the top brand row and the bottom copyright so
            white text stays readable over sky and pavement. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/75 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/75 to-transparent" />

        <div className="relative flex items-center gap-3">
          <div className="grid place-items-center size-10 rounded-xl bg-white shadow-sm">
            <Image src="/images/logo-cp-1.png" alt="" width={28} height={28} priority className="size-7 object-contain" />
          </div>
          <div className="text-lg font-semibold tracking-wide">COCO TAS</div>
          {/* The badge's amber tint is built for a white header; over the
              photo it washes out without a white backing. */}
          <span className="inline-flex rounded-full bg-white">
            <BetaBadge onClick={() => setBetaOpen(true)} />
          </span>
        </div>

        <p className="relative text-xs text-white/80">
          © {new Date().getFullYear()} College of Computing, Khon Kaen University
        </p>
      </aside>

      <main className="flex flex-col min-h-screen">
        {/* Phone-only brand strip; the side panel carries this on desktop. */}
        <header className="lg:hidden border-b border-border px-4 h-14 flex items-center gap-2 bg-surface">
          <Image src="/images/logo-cp-1.png" alt="" width={28} height={28} priority className="size-7 object-contain" />
          <div className="font-semibold text-[15px] text-foreground">COCO TAS</div>
          <BetaBadge onClick={() => setBetaOpen(true)} />
        </header>

        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-7">
            <h1 className="text-[26px] leading-tight font-semibold text-foreground">
              {challenge
                ? "ยืนยันตัวตนสองขั้นตอน"
                : sso
                  ? "เข้าสู่ระบบด้วย KKU Account"
                  : "เข้าสู่ระบบ COCO TAS"}
            </h1>
            <p className="text-sm text-muted mt-1.5">
              {challenge
                ? (useRecoveryCode
                  ? "กรอกรหัสสำรองหนึ่งชุดที่คุณบันทึกไว้ตอนตั้งค่า 2FA"
                  : "กรอกรหัส 6 หลักจากแอปยืนยันตัวตนของคุณ")
                : sso
                  ? "ตรวจสอบบัญชีที่กำลังจะเข้าสู่ระบบก่อนดำเนินการต่อ"
                  : "ระบบเบิกจ่ายค่าตอบแทนผู้ช่วยสอน วิทยาลัยการคอมพิวเตอร์"}
            </p>
          </div>

          {reason && REASON_INFO[reason] && (
            <div className="mb-5">
              <Alert
                status={REASON_INFO[reason].status}
                icon={REASON_INFO[reason].icon}
                title={REASON_INFO[reason].title}
                description={REASON_INFO[reason].description}
              />
            </div>
          )}

          <div className="flex flex-col gap-5">
              {challenge ? (
              <form onSubmit={onSubmit2FA} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 items-center">
                  <Label>{useRecoveryCode ? "รหัสสำรอง" : "รหัสยืนยันตัวตน"}</Label>
                  {useRecoveryCode ? (
                    <TextField
                      name="recovery-code"
                      isRequired
                      value={code}
                      onChange={v => { setCode(v); setCodeError(null); }}
                      isInvalid={!!codeError}
                      className="w-full"
                    >
                      <InputGroup>
                        <InputGroup.Input placeholder="XXXXX-XXXXX" autoComplete="one-time-code" lang="en" />
                      </InputGroup>
                    </TextField>
                  ) : (
                    <InputOTP
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      value={code}
                      onChange={v => { setCode(v); setCodeError(null); }}
                      isInvalid={!!codeError}
                      autoFocus
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
                  )}
                  {codeError && <FieldError>{codeError}</FieldError>}
                  <Description className="text-center">
                    {useRecoveryCode
                      ? "แต่ละรหัสสำรองใช้ได้เพียงครั้งเดียว"
                      : "เปิดแอปยืนยันตัวตน (เช่น Google Authenticator) เพื่อดูรหัส"}
                  </Description>
                </div>

                <Button type="submit" size="lg" fullWidth isPending={loading}>
                  {loading ? <Spinner color="current" size="sm" /> : <ShieldCheck />}
                  {loading ? "กำลังตรวจสอบ…" : "ยืนยัน"}
                </Button>

                <div className="flex items-center justify-center gap-4">
                  <Link
                    className="text-sm cursor-pointer"
                    onPress={() => { setUseRecoveryCode(u => !u); setCode(""); setCodeError(null); }}
                  >
                    {useRecoveryCode ? "ใช้รหัสจากแอปยืนยันตัวตนแทน" : "ใช้รหัสสำรองแทน"}
                  </Link>
                  <Link
                    className="text-sm cursor-pointer text-muted"
                    onPress={() => { setChallenge(null); setCode(""); setCodeError(null); setPassword(""); setSso(null); }}
                  >
                    ยกเลิก
                  </Link>
                </div>
              </form>
              ) : sso ? (
              <div className="flex flex-col gap-4">
                {sso.status === "exchanging" && (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
                    <Spinner size="sm" /> กำลังตรวจสอบบัญชี KKU ของคุณ…
                  </div>
                )}
                {sso.status === "error" && (
                  <>
                    <Alert status="danger" title="เข้าสู่ระบบด้วย KKU ไม่สำเร็จ" description={sso.message} />
                    {ssoUrl && !sso.wrongAccount && (
                      <KkuSsoButton href={ssoUrl}>ลองเข้าสู่ระบบด้วย KKU อีกครั้ง</KkuSsoButton>
                    )}
                  </>
                )}
                {sso.status === "confirm" && (
                  <>
                    <div className="rounded-lg border border-border bg-surface px-4 py-3">
                      <div className="text-xs text-muted mb-1">แอปพลิเคชันที่ขอเข้าถึง</div>
                      <div className="font-semibold text-foreground">COCO TAS — ระบบเบิกจ่ายค่าตอบแทนผู้ช่วยสอน</div>
                    </div>
                    <div className="flex items-start gap-3 px-1">
                      <Mail className="size-4 mt-0.5 text-muted shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground break-all">{sso.pending.email}</div>
                        <div className="text-sm text-muted">
                          {sso.pending.first_name} {sso.pending.last_name}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      หากนี่ไม่ใช่บัญชีของคุณ อย่ากดดำเนินการต่อ — กด &ldquo;ใช้บัญชี KKU อื่น&rdquo; ระบบจะออกจากบัญชี KKU นี้ให้ก่อน แล้วค่อยเข้าสู่ระบบด้วยบัญชีของคุณเอง
                    </p>
                    <Button size="lg" fullWidth isPending={loading} onPress={onConfirmSSO}>
                      {loading ? <Spinner color="current" size="sm" /> : <ShieldCheck />}
                      {loading ? "กำลังเข้าสู่ระบบ…" : "อนุญาตและเข้าสู่ระบบ"}
                    </Button>
                  </>
                )}
                {sso.status !== "exchanging" && (() => {
                  // Switching person must end the KKU session (it returns to
                  // /login afterwards); only fall back to /login when the
                  // logout URL is unknown.
                  const switching = sso.status === "confirm" || (sso.status === "error" && sso.wrongAccount);
                  const href = switching && ssoLogoutUrl ? ssoLogoutUrl : "/login";
                  return (
                    <div className="flex items-center justify-center">
                      <Link className="text-sm cursor-pointer text-muted" href={href}>
                        <ArrowLeft className="size-3.5 inline mr-1" />
                        {switching ? "ใช้บัญชี KKU อื่น" : "กลับไปหน้าเข้าสู่ระบบ"}
                      </Link>
                    </div>
                  );
                })()}
              </div>
              ) : (
              <>
              {emailInCard ? (
                <>
                  {ssoUrl
                    ? <KkuSsoButton href={ssoUrl}>เข้าสู่ระบบด้วย KKU Account</KkuSsoButton>
                    : <Skeleton className="h-14 w-full rounded-xl" />}
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted">หรือ</span>
                    <Separator className="flex-1" />
                  </div>
                <Disclosure
                  isExpanded={emailOpen}
                  onExpandedChange={setEmailOpen}
                  className="rounded-xl border border-border bg-surface"
                >
                  <Disclosure.Heading>
                    <Disclosure.Trigger className="flex w-full items-center justify-between gap-2 px-4 h-12 text-sm font-medium text-foreground">
                      เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
                      <Disclosure.Indicator />
                    </Disclosure.Trigger>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="flex flex-col gap-4 px-4 pb-4 pt-1">
                      {emailForm}
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
                </>
              ) : emailForm}
              </>
              )}
          </div>
        </div>
        </div>

        <p className="lg:hidden text-center text-xs text-muted pb-6">
          © {new Date().getFullYear()} College of Computing, Khon Kaen University
        </p>
      </main>
    </div>
  );
}
