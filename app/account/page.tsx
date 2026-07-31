"use client";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import type { Me } from "../lib/api";
import { PageHeader } from "../components/ui";
import AccountSettings from "../components/AccountSettings";

export default function AccountPage() {
  const { data: me } = useSWR<Me>("/me");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[900px] mx-auto p-4 md:p-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-3">
          <ArrowLeft size={14} /> กลับหน้าแรก
        </Link>
        <PageHeader
          title="ตั้งค่าบัญชี"
          description="จัดการรูปโปรไฟล์ ข้อมูลส่วนตัว การเข้าสู่ระบบ และความปลอดภัย"
        />
        <AccountSettings me={me} />
      </div>
    </div>
  );
}
