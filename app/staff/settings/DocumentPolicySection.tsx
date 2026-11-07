"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, errMessage } from "@/app/lib/api";
import { useI18n } from "@/app/lib/i18n/client";
import { toast } from "@/app/lib/toast";
import { Alert, Button, FieldGroup, Panel, TextInput } from "@/app/components/ui";

type Policy = { retention_days: number; download_limit: number };

export default function DocumentPolicySection() {
  const { t } = useI18n();
  const { data, error, mutate } = useSWR<Policy>("/settings/documents");
  const [draft, setDraft] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const value = draft ?? data;
  const valid = !!value && Number.isInteger(value.retention_days) && value.retention_days >= 1 && value.retention_days <= 3650
    && Number.isInteger(value.download_limit) && value.download_limit >= 1 && value.download_limit <= 1000;
  async function save() {
    if (!value || !valid || saving) return;
    setSaving(true); setSaveError("");
    try {
      const saved = await api.put<Policy>("/settings/documents", value);
      await mutate(saved, { revalidate: false });
      setDraft(null);
      toast.success(t("บันทึกการตั้งค่าเอกสารแล้ว"));
    } catch (e) { setSaveError(errMessage(e)); }
    finally { setSaving(false); }
  }
  return (
    <Panel title={t("การเก็บรักษาและดาวน์โหลดเอกสาร TA")} description={t("เริ่มนับอายุไฟล์พร้อมกันเมื่อเจ้าหน้าที่อนุมัติเอกสารบังคับครบทุกไฟล์แล้ว") }>
      {error ? <Alert status="danger" title={t("โหลดการตั้งค่าไม่สำเร็จ")} description={errMessage(error)} /> : !value ? <p>{t("กำลังโหลด...")}</p> : (
        <div className="space-y-5 max-w-xl">
          <FieldGroup label={t("อายุการเก็บไฟล์ (วัน)")} hint={t("กำหนดได้ 1–3650 วัน มีผลกับชุดเอกสารที่อนุมัติครบหลังบันทึก ไฟล์ที่เริ่มนับแล้วใช้กำหนดเดิม")}>
            <TextInput aria-label={t("อายุการเก็บไฟล์ (วัน)")} type="number" min={1} max={3650} step={1} disabled={saving} value={value.retention_days || ""}
              onChange={e => setDraft({ ...value, retention_days: Number(e.target.value) })} />
          </FieldGroup>
          <FieldGroup label={t("จำนวนดาวน์โหลดสูงสุดต่อ TA (ครั้ง)")} hint={t("กำหนดได้ 1–1000 ครั้ง รวมทุกเจ้าหน้าที่และทุกรอบ ใช้กับการดาวน์โหลดราย TA หลังอนุมัติ ไม่รวมการดาวน์โหลดรวมหลายคน")}>
            <TextInput aria-label={t("จำนวนดาวน์โหลดสูงสุดต่อ TA (ครั้ง)")} type="number" min={1} max={1000} step={1} disabled={saving} value={value.download_limit || ""}
              onChange={e => setDraft({ ...value, download_limit: Number(e.target.value) })} />
          </FieldGroup>
          <p className="text-sm text-muted">{t("จำนวนดาวน์โหลดใหม่มีผลทันที โดยยังนับประวัติการดาวน์โหลดเดิม")}</p>
          {!valid && <Alert status="danger" title={t("กรุณาระบุจำนวนเต็มในช่วงที่กำหนด")} />}
          {saveError && <Alert status="danger" title={t("บันทึกไม่สำเร็จ")} description={saveError} />}
          <Button onClick={save} isPending={saving} disabled={!draft || !valid || saving}>{t("บันทึกการตั้งค่า")}</Button>
        </div>
      )}
    </Panel>
  );
}
