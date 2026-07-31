"use client";
import Link from "next/link";
import { ArrowRight, Clock, KeyRound, ShieldCheck, Smartphone, User } from "lucide-react";
import type { Me } from "../lib/api";
import { Button, Chip, Panel } from "./ui";
import ProfilePhotoCard from "./ProfilePhotoCard";

/**
 * The account screen's body: picture, identity, security. Shared by the TA's
 * /ta/profile and the /account route every other role reaches from the user
 * menu — one implementation so the three roles never drift apart.
 */
export default function AccountSettings({ me }: { me: Me | undefined }) {
  return (
    <>
      {/* The picture is the one thing here the user owns outright, so it leads. */}
      {me && <ProfilePhotoCard me={me} />}

      <Panel
        title="ข้อมูลส่วนตัว"
        description="ข้อมูลนี้จัดการโดยเจ้าหน้าที่ — หากต้องการแก้ไข โปรดติดต่อเจ้าหน้าที่"
        className="mb-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <InfoRow icon={<User size={16} />} label="ชื่อ-นามสกุล"
                   value={me ? `${me.title ?? ""} ${me.first_name} ${me.last_name}`.trim() : "—"} />
          <InfoRow icon={<User size={16} />} label="อีเมล" value={me?.email ?? "—"} />
          <InfoRow icon={<Smartphone size={16} />} label="เบอร์โทรศัพท์" value={me?.phone ?? "—"} />
          {/* Only students have one; a lecturer's account would otherwise show
              a row that reads "—" forever. */}
          {me?.study_level && (
            <InfoRow icon={<ShieldCheck size={16} />} label="ระดับการศึกษา" value={studyLabel(me.study_level)} />
          )}
        </div>
      </Panel>

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
          <SecurityRow
            icon={<ShieldCheck size={18} />}
            title="Two-Factor Authentication"
            description="เพิ่มความปลอดภัยด้วยการยืนยันตัวตนสองขั้นตอน"
            action={<Chip tone="neutral"><Clock size={12} className="me-1" /> กำลังพัฒนา</Chip>}
          />
        </div>
      </Panel>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-secondary text-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-sm text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function SecurityRow({
  icon, title, description, action,
}: { icon: React.ReactNode; title: string; description: string; action: React.ReactNode }) {
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

function studyLabel(v: string | undefined): string {
  if (!v) return "—";
  return ({
    undergrad: "ปริญญาตรี",
    master: "ปริญญาโท",
    phd: "ปริญญาเอก",
  } as Record<string, string>)[v] ?? v;
}
