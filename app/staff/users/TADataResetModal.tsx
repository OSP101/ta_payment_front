"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Checkbox } from "@heroui/react";
import { RotateCcw } from "lucide-react";
import { api, errMessage, type Term } from "../../lib/api";
import { msg, useI18n } from "../../lib/i18n/client";
import { formatFullName } from "../../lib/prefixes";
import { isForeign } from "../../lib/nationality";
import { notify } from "../../lib/notify";
import { Alert, Button, FieldGroup, Modal, SelectField, TextArea } from "../../components/ui";

type Target = { id: string; first_name: string; last_name: string; title?: string | null; nationality?: string };

export default function TADataResetModal({ user, onClose }: { user: Target; onClose: () => void }) {
  const { t } = useI18n();
  // Read a fresh per-user version before a destructive command; the users list
  // may have been open before another officer reviewed the TA's documents.
  const { data: latest, error: userError } = useSWR<Target>(`/users/${user.id}`);
  const { data: terms, error: termsError } = useSWR<Term[]>("/terms");
  const [documents, setDocuments] = useState<string[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [termId, setTermId] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scheduleKey = schedule && termId ? `/users/${user.id}/schedule?term_id=${termId}` : null;
  const { data: timetable, error: scheduleError, isLoading: scheduleLoading } = useSWR<{ locked: boolean; lock_reason: string }>(scheduleKey);
  const foreign = isForeign((latest ?? user).nationality);
  const options = [
    { id: "creditor_form", label: msg("ข้อมูลแบบฟอร์มเจ้าหนี้"), hint: msg("เปิดให้กรอกข้อมูลและส่งแบบฟอร์มเจ้าหนี้ใหม่") },
    { id: foreign ? "passport" : "national_id", label: foreign ? msg("สำเนา Passport") : msg("สำเนาบัตรประชาชน"), hint: msg("เปิดให้อัปโหลดเอกสารใหม่") },
    { id: "bank_book", label: msg("สำเนาสมุดบัญชีธนาคาร"), hint: msg("เปิดให้อัปโหลดเอกสารใหม่") },
  ];
  const canSubmit = !!latest && !userError && (documents.length > 0 || schedule) && !!reason.trim() && ack
    && (!schedule || (!!termId && !!timetable && !scheduleLoading && !scheduleError && !timetable.locked));
  const changeSelection = () => { setAck(false); setError(""); };

  async function submit() {
    if (!canSubmit || pending) return;
    setPending(true);
    setError("");
    try {
      await api.post(`/users/${user.id}/ta-data/reset`, {
        documents, schedule, ...(schedule ? { term_id: termId } : {}), reason: reason.trim(),
      });
      notify.success(t("รีเซ็ตข้อมูล TA แล้ว สามารถส่งข้อมูลใหม่ได้"));
      // Revalidate every cached user/review/schedule view affected by the reset.
      void mutate(key => typeof key === "string" && (key.startsWith("/users") || key.startsWith("/ta-review") || key.startsWith("/me/")));
      onClose();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setPending(false);
    }
  }

  return <Modal open title={t("รีเซ็ตข้อมูล TA")} onClose={() => { if (!pending) onClose(); }} dismissible={!pending}
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={pending}>{t("ยกเลิก")}</Button>
      <Button variant="danger" onClick={submit} disabled={!canSubmit || pending}>
        <RotateCcw size={14} /> {pending ? t("กำลังรีเซ็ต…") : t("ยืนยันรีเซ็ตข้อมูลที่เลือก")}
      </Button>
    </>}>
    <div className="space-y-5">
      <p className="font-semibold">{formatFullName(user)}</p>
      <p className="text-sm text-muted">{t("เลือกเฉพาะข้อมูลที่ต้องการให้ TA ส่งใหม่ เอกสารเดิมจะเก็บในประวัติ และเอกสารที่ส่งใหม่ต้องได้รับการตรวจอีกครั้ง")}</p>
      {userError && <Alert status="danger" title={t("โหลดข้อมูล TA ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่")} />}
      <fieldset disabled={pending} className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">{t("ข้อมูลที่ต้องการรีเซ็ต")}</legend>
        {options.map(option => <div key={option.id}>
          <Checkbox isSelected={documents.includes(option.id)} isDisabled={pending || !latest} onChange={selected => {
            setDocuments(prev => selected ? [...prev, option.id] : prev.filter(id => id !== option.id)); changeSelection();
          }}>
            <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>{t(option.label)}</Checkbox.Content>
          </Checkbox>
          <p className="ms-7 text-sm text-muted">{t(option.hint)}</p>
        </div>)}
        <Checkbox isSelected={schedule} isDisabled={pending} onChange={selected => { setSchedule(selected); setTermId(""); changeSelection(); }}>
          <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>{t("ตารางเรียน")}</Checkbox.Content>
        </Checkbox>
      </fieldset>
      {schedule && <div className="space-y-3">
        <SelectField label={<>{t("ภาคเรียน / ปีการศึกษา")}<span aria-hidden className="text-danger-soft-foreground"> *</span></>}
          hint={t("ลบตารางเรียนทั้งหมดเฉพาะภาคเรียนและปีการศึกษาที่เลือก เพื่อให้ TA กรอกใหม่")}
          options={(terms ?? []).map(term => ({ id: term.id, label: `${term.academic_year}/${term.semester}` }))}
          value={termId} onChange={id => { setTermId(id); changeSelection(); }} isDisabled={pending} className="w-full" />
        {(termsError || scheduleError) && <Alert status="danger" title={t("โหลดข้อมูลภาคเรียนหรือตารางเรียนไม่สำเร็จ กรุณาลองใหม่")} />}
        {timetable?.locked && <Alert status="warning" title={t("รีเซ็ตตารางเรียนไม่ได้")} description={timetable.lock_reason} />}
      </div>}
      <FieldGroup required label={t("เหตุผลที่รีเซ็ต")} hint={t("บันทึกไว้ในประวัติการใช้งานเพื่อใช้อ้างอิง")}>
        <TextArea aria-label={t("เหตุผลที่รีเซ็ต")} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} disabled={pending} rows={3} />
      </FieldGroup>
      <Checkbox isSelected={ack} onChange={setAck} isDisabled={pending}>
        <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>{t("ตรวจสอบรายการแล้ว และยืนยันให้ TA ส่งข้อมูลที่เลือกใหม่")}</Checkbox.Content>
      </Checkbox>
      {error && <Alert status="danger" title={t("รีเซ็ตข้อมูลไม่สำเร็จ")} description={error} />}
    </div>
  </Modal>;
}
