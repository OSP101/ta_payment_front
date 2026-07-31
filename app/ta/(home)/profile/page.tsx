"use client";
import useSWR from "swr";
import type { Me } from "../../../lib/api";
import { PageHeader } from "../../../components/ui";
import AccountSettings from "../../../components/AccountSettings";

// Account settings: picture, identity, sign-in, and security. Documents (bank
// info, signature, ID copies, etc.) live on the separate /ta/documents page —
// those are workflow artifacts, not the account itself.
export default function TAProfilePage() {
  const { data: me } = useSWR<Me>("/me");

  return (
    <div>
      <PageHeader
        title="ตั้งค่าบัญชี"
        description="จัดการรูปโปรไฟล์ ข้อมูลส่วนตัว การเข้าสู่ระบบ และความปลอดภัย"
      />
      <AccountSettings me={me} />
    </div>
  );
}
