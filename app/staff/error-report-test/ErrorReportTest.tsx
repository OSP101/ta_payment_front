"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Alert, Button, PageHeader, Panel } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useI18n } from "../../lib/i18n/client";

function Boom(): never {
  throw new Error("error-report test: browser render failed (ignore, sent on purpose)");
}

export default function ErrorReportTest() {
  const router = useRouter();
  const { t } = useI18n();
  const [renderCrash, setRenderCrash] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [...l, line]);

  const callApi = async (kind: "error" | "panic") => {
    try {
      await api.post("/admin/error-report-test", { kind });
      note(t("API {kind}: ตอบกลับสำเร็จ ซึ่งไม่ควรเกิดขึ้น", { kind }));
    } catch (e) {
      note(t("API {kind}: ได้ {status} ตามที่ตั้งใจ ดูใน GlitchTip โปรเจกต์ ta-payment-api", { kind, status: e instanceof ApiError ? e.status : "error" }));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("ทดสอบระบบรายงานข้อผิดพลาด")}
        description={t("ปุ่มแต่ละปุ่มทำให้ระบบผิดพลาดโดยตั้งใจ แล้วตรวจใน GlitchTip ว่ามีรายการใหม่เข้ามาภายในไม่กี่วินาที")}
      />
      {!Sentry.isInitialized() && (
        <Alert
          status="warning"
          title={t("การรายงานฝั่งเบราว์เซอร์ปิดอยู่")}
          description={t("เซิร์ฟเวอร์ยังไม่ได้ตั้ง SENTRY_DSN ให้รัน deploy/scripts/glitchtip-setup.sh ก่อน")}
        />
      )}
      <Panel title={t("ฝั่งเซิร์ฟเวอร์ (API)")} description={t("โปรเจกต์ ta-payment-api")}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={() => callApi("error")}>{t("API ตอบ 500")}</Button>
          <Button variant="secondary" onPress={() => callApi("panic")}>API panic</Button>
        </div>
      </Panel>
      <Panel title={t("หน้าเว็บ")} description={t("โปรเจกต์ ta-payment-web ปุ่มที่ทำให้หน้าพังจะพาไปหน้า “ระบบขัดข้อง” พร้อมรหัสอ้างอิง")}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={() => router.push("/staff/error-report-test?kind=server")}>
            {t("หน้าพังตอนสร้างบนเซิร์ฟเวอร์")}
          </Button>
          <Button variant="secondary" onPress={() => setRenderCrash(true)}>{t("หน้าพังในเบราว์เซอร์")}</Button>
          <Button
            variant="secondary"
            onPress={() => {
              setTimeout(() => {
                throw new Error("error-report test: unhandled browser error (ignore, sent on purpose)");
              }, 0);
              note(t("เบราว์เซอร์: โยน error ที่ไม่มีใครจับแล้ว หน้านี้ยังใช้ต่อได้ตามปกติ"));
            }}
          >
            {t("error ที่ไม่มีใครจับ")}
          </Button>
        </div>
        {renderCrash && <Boom />}
      </Panel>
      {log.length > 0 && (
        <Panel title={t("ผลล่าสุด")}>

          <ul className="text-sm space-y-1">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Panel>
      )}
    </div>
  );
}
