"use client";
import Link from "next/link";
import {
  ArrowRight, Briefcase, Clock, GraduationCap, KeyRound, Mail, Phone, ShieldCheck, User,
} from "lucide-react";
import type { Me } from "../lib/api";
import { formatFullName } from "../lib/prefixes";
import { Button, Chip, Panel } from "./ui";
import ProfilePhotoCard from "./ProfilePhotoCard";

/**
 * The account screen's body: picture, identity, security. One implementation
 * behind one route (/account), which renders inside whichever shell the reader
 * belongs to — so no role ever gets its own copy to drift apart from.
 */
export default function AccountSettings({ me }: { me: Me | undefined }) {
  return (
    <>
      {/* The picture is the one thing here the user owns outright, so it leads. */}
      {me && <ProfilePhotoCard me={me} />}

      <Panel
        title="ข้อมูลส่วนตัว"
        description="ข้อมูลนี้จัดการโดยเจ้าหน้าที่ หากต้องการแก้ไข โปรดติดต่อเจ้าหน้าที่"
        className="mb-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          {/* One icon per KIND of fact. อีเมล used to carry the same person
              glyph as the name, and ระดับการศึกษา a shield neither said
              anything about the row it sat on. */}
          <InfoRow icon={<User size={16} />} label="ชื่อ-นามสกุล" value={formatFullName(me) || "—"} />
          <InfoRow icon={<Mail size={16} />} label="อีเมล" value={me?.email ?? "—"} />
          <InfoRow icon={<Phone size={16} />} label="เบอร์โทรศัพท์" value={me?.phone ?? "—"} />
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
