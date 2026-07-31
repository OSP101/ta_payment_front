"use client";
import useSWR from "swr";
import type { Me } from "../lib/api";
import { PageHeader } from "../components/ui";
import AccountSettings from "../components/AccountSettings";

// The layout wraps this in the reader's own shell, which already supplies the
// page padding and the way back — hence no "กลับหน้าแรก" link and no
// min-h-screen wrapper of its own. The width cap stays: a settings form
// stretched across a 1400px shell is unreadable.
export default function AccountPage() {
  const { data: me } = useSWR<Me>("/me");

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="ตั้งค่าบัญชี"
        description="จัดการรูปโปรไฟล์ ข้อมูลส่วนตัว การเข้าสู่ระบบ และความปลอดภัย"
      />
      <AccountSettings me={me} />
    </div>
  );
}
