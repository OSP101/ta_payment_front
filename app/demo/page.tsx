"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldError, InputGroup, Label, TextField } from "@heroui/react";
import {
  FlaskConical, LogIn, Clock, MonitorSmartphone, LogOut,
  Shield, Users, GraduationCap, UserRound, Mail, ArrowRight,
} from "lucide-react";
import { Alert } from "../components/ui";
import {
  api,
  demoEnter,
  demoLogin,
  errMessage,
  setDemoApiPrefix,
  type DemoAccount,
  type DemoEnterResult,
} from "../lib/api";
import { notify } from "../lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where each seeded role lands after login — mirrors app/page.tsx's own
// role -> home-page dispatch, kept separate rather than reused because that
// one is a server component (reads getMe() via next/headers) and this page
// already knows the role from which account card was picked, with no round
// trip needed to work it out again.
function homeFor(roles: string[]): string {
  if (roles.includes("admin") || roles.includes("staff")) return "/staff";
  if (roles.includes("lecturer")) return "/lecturer";
  if (roles.includes("ta")) return "/ta";
  return "/";
}

// Groups the role cards and picks an icon per group — purely a display
// concern (which of an account's roles "wins" for icon/grouping purposes),
// unrelated to AccountsForTier's actual access-control filtering on the
// backend, which already decided which accounts even appear here.
const ROLE_GROUPS: { key: string; title: string; icon: typeof Shield }[] = [
  { key: "admin", title: "ผู้ดูแลระบบ", icon: Shield },
  { key: "staff", title: "เจ้าหน้าที่", icon: Users },
  { key: "lecturer", title: "อาจารย์ผู้สอน", icon: GraduationCap },
  { key: "ta", title: "ผู้ช่วยสอน (TA)", icon: UserRound },
];
function primaryRoleKey(roles: string[]): string {
  return ROLE_GROUPS.find(g => roles.includes(g.key))?.key ?? "ta";
}

// Matches internal/demo/tiers.go's own three tiers — what /api/demo/enter's
// `tier` field names, shown so a tester can see WHY they're offered the
// accounts they're offered, not just the account list itself.
const TIER_INFO: Record<DemoEnterResult["tier"], { label: string; detail: string }> = {
  staff: { label: "เจ้าหน้าที่", detail: "ทดลองได้ทุกบทบาท (ผู้ดูแลระบบ / เจ้าหน้าที่ / อาจารย์ / TA)" },
  lecturer: { label: "อาจารย์", detail: "ทดลองได้เฉพาะบทบาทอาจารย์และ TA" },
  ta: { label: "TA", detail: "ทดลองได้เฉพาะบทบาท TA" },
};

const REASON_INFO: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  session_idle: {
    icon: <Clock size={16} />,
    title: "ออกจากระบบอัตโนมัติ",
    description: "ไม่มีการใช้งานเกิน 15 นาที กรุณาเลือกบทบาทเพื่อเข้าใช้งานห้องทดลองของคุณอีกครั้ง",
  },
  session_superseded: {
    icon: <MonitorSmartphone size={16} />,
    title: "เข้าสู่ระบบจากอุปกรณ์อื่น",
    description: "บทบาทนี้ถูกใช้งานจากที่อื่นพร้อมกัน กรุณาเลือกบทบาทอีกครั้ง",
  },
  session_revoked: {
    icon: <LogOut size={16} />,
    title: "เซสชันทดลองสิ้นสุดแล้ว",
    description: "กรุณาเลือกบทบาทเพื่อเข้าใช้งานอีกครั้ง",
  },
};

export default function DemoEntryPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<DemoEnterResult | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    setReason(new URLSearchParams(window.location.search).get("reason"));
  }, []);

  const emailError = !EMAIL_RE.test(email.trim()) ? "กรุณากรอกอีเมลที่ใช้งานจริงของคุณ" : undefined;

  // Grouped by role for display — see ROLE_GROUPS' own doc comment. Only
  // groups that actually have a card in them show up (a lecturer-tier
  // workspace never has an "ผู้ดูแลระบบ"/"เจ้าหน้าที่" group at all, since
  // AccountsForTier on the backend already left those out of
  // workspace.accounts).
  const groupedAccounts = useMemo(() => {
    if (!workspace) return [];
    return ROLE_GROUPS.map(g => ({
      ...g,
      accounts: workspace.accounts.filter(a => primaryRoleKey(a.roles) === g.key),
    })).filter(g => g.accounts.length > 0);
  }, [workspace]);

  async function onEnter(e: React.FormEvent) {
    e.preventDefault();
    if (emailError) {
      setTouched(true);
      return;
    }
    setLoading(true);
    try {
      const result = await demoEnter(email.trim());
      setWorkspace(result);
    } catch (err) {
      notify.error(errMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onPick(account: DemoAccount) {
    if (!workspace) return;
    setEntering(account.email);
    try {
      await demoLogin(workspace.base_path, account.email, workspace.demo_password);
      setDemoApiPrefix(workspace.base_path);
      // Straight to the role's own real page — DemoGuidePanel.tsx (docked to
      // the right edge, mounted globally) shows the walkthrough on top of
      // it, so there is no separate destination to route through first.
      router.push(homeFor(account.roles));
      router.refresh();
    } catch (err) {
      notify.error(errMessage(err));
      setEntering(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-warning-soft-border bg-warning-soft px-6 h-14 flex items-center gap-2">
        <FlaskConical size={18} className="text-warning-soft-foreground" />
        <div className="font-semibold text-[15px] text-warning-soft-foreground">
          ห้องทดลองใช้งาน TA Payment (BETA)
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 bg-background">
        <div className={`w-full ${workspace ? "max-w-lg" : "max-w-md"}`}>
          <div className="text-center mb-6">
            <h1 className="text-[22px] font-semibold text-foreground">
              {workspace ? "เลือกบทบาทที่ต้องการทดลอง" : "เริ่มทดลองใช้งาน"}
            </h1>
            <p className="text-sm text-muted mt-1">
              {workspace
                ? "ข้อมูลในห้องนี้เป็นของคุณคนเดียว แยกจากคนอื่นและจากระบบจริงทั้งหมด"
                : "จำลองการทำงานทุกขั้นตอนโดยไม่ต้องรอข้อมูลจากอาจารย์หรือ TA จริง"}
            </p>
          </div>

          {reason && REASON_INFO[reason] && (
            <div className="mb-4">
              <Alert status="warning" icon={REASON_INFO[reason].icon}
                title={REASON_INFO[reason].title} description={REASON_INFO[reason].description} />
            </div>
          )}

          {workspace && (
            <div className="mb-5 rounded-lg border border-warning-soft-border bg-warning-soft/60 px-4 py-3 flex items-start gap-3">
              <FlaskConical size={18} className="text-warning-soft-foreground shrink-0 mt-0.5" />
              <div className="text-sm min-w-0">
                <div className="font-medium text-warning-soft-foreground">
                  ห้องทดลองของ {email.trim()}
                </div>
                <div className="text-warning-soft-foreground/80 text-xs mt-0.5">
                  ระดับสิทธิ์: <span className="font-medium">{TIER_INFO[workspace.tier].label}</span>
                  {" — "}{TIER_INFO[workspace.tier].detail}
                </div>
                <div className="text-warning-soft-foreground/70 text-xs mt-1">
                  ข้อมูลทั้งหมดที่นี่เป็นข้อมูลจำลอง ไม่ใช่ข้อมูลจริง และแยกขาดจากระบบจริงทั้งหมด
                </div>
              </div>
            </div>
          )}

          {!workspace ? (
            <Card>
              <Card.Content>
                <form onSubmit={onEnter} className="flex flex-col gap-4">
                  <TextField
                    name="email" type="email" isRequired
                    value={email} onChange={setEmail}
                    onBlur={() => setTouched(true)}
                    isInvalid={touched && !!emailError}
                  >
                    <Label>อีเมลของคุณ</Label>
                    <InputGroup>
                      <InputGroup.Input placeholder="you@kkumail.com" autoComplete="email" lang="en" />
                    </InputGroup>
                    {touched && emailError && <FieldError>{emailError}</FieldError>}
                  </TextField>
                  <p className="text-xs text-muted -mt-2">
                    ใช้แค่แยกห้องทดลองของคุณจากคนอื่น — ไม่ต้องยืนยันอีเมล และไม่ผูกกับบัญชีจริงของคุณ
                  </p>
                  <Button type="submit" size="lg" fullWidth isPending={loading}>
                    <LogIn />
                    เข้าห้องทดลอง
                  </Button>
                </form>
              </Card.Content>
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              {groupedAccounts.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide mb-2 px-0.5">
                    <group.icon size={13} />
                    {group.title}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.accounts.map(acc => (
                      <Card key={acc.email} className="transition-colors hover:border-accent/50">
                        <button
                          type="button"
                          disabled={entering !== null}
                          onClick={() => onPick(acc)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 disabled:opacity-60"
                        >
                          <span className="shrink-0 size-9 rounded-full bg-accent-soft flex items-center justify-center">
                            <group.icon size={16} className="text-accent" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-foreground text-sm truncate">{acc.label}</span>
                            <span className="flex items-center gap-1 text-xs text-muted truncate">
                              <Mail size={11} className="shrink-0" />
                              {acc.email}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted flex items-center gap-1">
                            {entering === acc.email ? "กำลังเข้าสู่ระบบ…" : (
                              <>เข้าใช้งาน <ArrowRight size={13} /></>
                            )}
                          </span>
                        </button>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onPress={() => setWorkspace(null)} className="self-center mt-1">
                กลับไปกรอกอีเมลใหม่
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
