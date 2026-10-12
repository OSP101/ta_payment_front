"use client";

import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import { Button } from "./ui";
import { useI18n } from "../lib/i18n/client";

// Mails the new account its sign-in details (email + the temporary password
// in the one-time panel), so the officer or lecturer does not have to paste
// it into a chat. The server only accepts the account's own, still-unused
// temporary password, and sends it to the account's own address.
export default function SendCredentialsButton({ userId, email, password }: { userId: string; email: string; password: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  async function send() {
    setPending(true);
    try {
      await api.post(`/users/${userId}/send-credentials`, { password });
      setSent(true);
      notify.success(t("ส่งข้อมูลเข้าสู่ระบบไปที่ {email} แล้ว", { email }));
    } catch (e) {
      notify.error(e, t("ส่งอีเมลไม่สำเร็จ"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="secondary" size="sm" className="w-full" onClick={send} isPending={pending}>
      {sent ? <MailCheck size={14} /> : <Mail size={14} />}
      {sent ? t("ส่งแล้ว (ส่งซ้ำไปที่ {email})", { email }) : t("ส่งข้อมูลเข้าสู่ระบบทางอีเมล ({email})", { email })}
    </Button>
  );
}
