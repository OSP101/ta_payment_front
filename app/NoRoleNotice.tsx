"use client";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { api } from "./lib/api";
import { notify } from "./lib/notify";
import { Button } from "./components/ui";
import { useI18n } from "./lib/i18n/client";

// Shown when a user is authenticated but has no recognised role. Better than
// bouncing to /login (which reads as a failed sign-in) — it explains the state
// and lets them sign out or contact staff.
export default function NoRoleNotice({ email }: { email: string }) {
  const router = useRouter();
  const { t } = useI18n();
  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      notify.error(e);
    }
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center bg-warning-soft text-warning-soft-foreground">
          <ShieldAlert />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{t("บัญชียังไม่ได้รับสิทธิ์ใช้งาน")}</h1>
        <p className="text-sm text-muted mt-2">
          {t.rich("บัญชี {email} เข้าสู่ระบบได้ แต่ยังไม่ได้รับสิทธิ์ (TA / อาจารย์ / เจ้าหน้าที่) กรุณาติดต่อเจ้าหน้าที่วิทยาลัยการคอมพิวเตอร์เพื่อกำหนดสิทธิ์การใช้งาน", {
            email: <span className="font-medium text-foreground">{email}</span>,
          })}
        </p>
        <div className="mt-6">
          <Button variant="secondary" onPress={logout}>{t("ออกจากระบบ")}</Button>
        </div>
      </div>
    </div>
  );
}
