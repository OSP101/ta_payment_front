"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight, Briefcase, Database, GraduationCap, KeyRound, Mail, Phone, Settings2, ShieldCheck, User,
} from "lucide-react";
import type { Enrollment, Me } from "../lib/api";
import { formatFullName } from "../lib/prefixes";
import { Button, Chip, Panel } from "./ui";
import ProfilePhotoCard from "./ProfilePhotoCard";
import TwoFactorManageModal from "./TwoFactorManageModal";
import { Skel, SkelRegion, SkelValue } from "./Skeletons";

/**
 * The account screen's body: picture, identity, security. One implementation
 * behind one route (/account), which renders inside whichever shell the reader
 * belongs to — so no role ever gets its own copy to drift apart from.
 */
export default function AccountSettings({ me }: { me: Me | undefined }) {
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <>
      {/* The picture is the one thing here the user owns outright, so it leads. */}
      {me ? <ProfilePhotoCard me={me} /> : <ProfilePhotoSkeleton />}
      {manageOpen && <TwoFactorManageModal onClose={() => setManageOpen(false)} />}

      <Panel
        title="ข้อมูลส่วนตัว"
        description="หากต้องการแก้ไข โปรดติดต่อเจ้าหน้าที่"
        className="mb-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          {/* One icon per KIND of fact. อีเมล used to carry the same person
              glyph as the name, and ระดับการศึกษา a shield neither said
              anything about the row it sat on. */}
          {/* Before /me lands the values are placeholders, not "—" — a dash
              reads as "we have no name for you". */}
          <InfoRow icon={<User size={16} />} label="ชื่อ-นามสกุล" value={me ? formatFullName(me) || "—" : undefined} />
          <InfoRow icon={<Mail size={16} />} label="อีเมล" value={me ? me.email ?? "—" : undefined} />
          <InfoRow icon={<Phone size={16} />} label="เบอร์โทรศัพท์" value={me ? me.phone ?? "—" : undefined} />
          {/* Only students have one; a lecturer's account would otherwise show
              a row that reads "—" forever. */}
          {me?.study_level && (
            <InfoRow icon={<GraduationCap size={16} />} label="ระดับการศึกษา" value={studyLabel(me.study_level)} />
          )}
          {/* Only for the people who hold one — e.g. หัวหน้าสาขาวิชา. Display
              only, same as everywhere else this shows: it carries no rights. */}
          {me?.admin_position && (
            <InfoRow icon={<Briefcase size={16} />} label="ตำแหน่งบริหาร" value={me.admin_position} />
          )}
        </div>
      </Panel>

      {/* Only TAs have an education-level history — a lecturer/staff/admin
          account never has a ta_enrollments row (see migration 0094), so the
          panel would only ever render empty for them. */}
      {me?.roles?.includes("ta") && <EducationHistoryPanel userId={me.id} />}

      <Panel title="ความปลอดภัย" description="รหัสผ่านและการยืนยันตัวตน" className="mb-4">
        <div className="divide-y divide-[var(--hairline)] -my-2">
          <SecurityRow
            icon={<KeyRound size={18} />}
            title="รหัสผ่าน"
            description="คุณสามารถเปลี่ยนรหัสผ่านได้ตลอดเวลา"
            action={
              <Link href="/change-password">
                <Button variant="primary" size="sm">
                  เปลี่ยนรหัสผ่าน <ArrowRight size={13} />
                </Button>
              </Link>
            }
          />
          {/* Which button this row carries depends on /me — without the
              placeholder it showed "เปิดใช้งาน" first and then swapped to
              "จัดการ" for everyone who already has 2FA on. */}
          <SecurityRow
            icon={<ShieldCheck size={18} />}
            title="Two-Factor Authentication (2FA)"
            description={
              !me
                ? <SkelValue className="h-3 w-56 max-w-full" />
                : me.totp_enabled
                ? `เปิดใช้งานแล้ว · เหลือรหัสสำรอง ${me.recovery_codes_remaining} ชุด`
                : "เพิ่มความปลอดภัยด้วยการยืนยันตัวตนสองขั้นตอน"
            }
            action={
              !me ? (
                <Skel className="h-8 w-24 rounded-xl" />
              ) : me.totp_enabled ? (
                <Button variant="secondary" size="sm" onClick={() => setManageOpen(true)}>
                  <Settings2 size={13} /> จัดการ
                </Button>
              ) : (
                <Link href="/setup-2fa">
                  <Button variant="primary" size="sm">
                    เปิดใช้งาน <ArrowRight size={13} />
                  </Button>
                </Link>
              )
            }
          />
        </div>
      </Panel>

      <Panel title="ความเป็นส่วนตัว" description="ข้อมูลของคุณภายใต้ PDPA" className="mb-4">
        <SecurityRow
          icon={<Database size={18} />}
          title="ข้อมูลของฉัน"
          description="ดูข้อมูลทั้งหมดที่ระบบจัดเก็บไว้ ดาวน์โหลด หรือขอให้ลบข้อมูล"
          action={
            <Link href="/account/my-data">
              <Button variant="secondary" size="sm">
                เปิดดู <ArrowRight size={13} />
              </Button>
            </Link>
          }
        />
      </Panel>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-secondary text-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-sm text-foreground truncate">
          {value ?? <SkelValue className="h-3.5 w-40 max-w-full" />}
        </div>
      </div>
    </div>
  );
}

function SecurityRow({
  icon, title, description, action,
}: { icon: React.ReactNode; title: string; description: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** ProfilePhotoCard's frame (same Panel title, avatar circle, text + button)
 *  while /me loads, so the cards below don't jump down when it arrives. */
function ProfilePhotoSkeleton() {
  return (
    <Panel title="รูปโปรไฟล์" description="รูปโปรไฟล์ของคุณในระบบ" className="mb-4">
      <SkelRegion className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-dashed border-[var(--hairline)] p-4">
        <Skel className="size-32 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 w-full flex flex-col items-center sm:items-start gap-2">
          <Skel className="h-4 w-40" />
          <Skel className="h-3 w-3/4" />
          <Skel className="h-8 w-28 rounded-xl mt-2" />
        </div>
      </SkelRegion>
    </Panel>
  );
}

/**
 * Read-only history of the TA's own (student_id, study_level) periods — see
 * migration 0094 (ta_enrollments) and EnrollmentService. Same endpoint the
 * staff "ประวัติการศึกษา" action reads; GET /users/:id/enrollments allows
 * self-access (authed_forSelfOrStaff), only RECORDING a transition is
 * staff/admin-only, so this panel is view-only by construction — there is no
 * write action here.
 */
function EducationHistoryPanel({ userId }: { userId: string }) {
  const { data, isLoading } = useSWR<{ items: Enrollment[] }>(`/users/${userId}/enrollments`);
  const items = data?.items ?? [];
  // Nothing to show before the TA's first profile submission creates their
  // first enrollment row — omit the panel entirely rather than show an empty
  // shell (see DocsService.UpsertProfile's comment for when that row appears).
  if (!isLoading && items.length === 0) return null;

  return (
    <Panel
      title="ประวัติการศึกษา"
      description="ระดับการศึกษาและรหัสนักศึกษาของคุณในแต่ละช่วง — แก้ไขได้โดยเจ้าหน้าที่เท่านั้น"
      className="mb-4"
    >
      {isLoading ? (
        <SkelRegion className="space-y-2">
          <Skel className="h-[58px] w-full rounded-lg" />
        </SkelRegion>
      ) : (
        <div className="space-y-2">
          {items.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] px-3 py-2">
              <div>
                <div className="text-sm font-medium">{e.student_id} — {studyLabel(e.study_level)}</div>
                <div className="text-xs text-muted">
                  {new Date(e.started_at).toLocaleDateString("th-TH")}
                  {" – "}
                  {e.ended_at ? new Date(e.ended_at).toLocaleDateString("th-TH") : "ปัจจุบัน"}
                </div>
              </div>
              {!e.ended_at && <Chip tone="success">ปัจจุบัน</Chip>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function studyLabel(v: string | undefined): string {
  if (!v) return "—";
  return ({
    undergrad: "ปริญญาตรี",
    master: "ปริญญาโท",
    phd: "ปริญญาเอก",
  } as Record<string, string>)[v] ?? v;
}
