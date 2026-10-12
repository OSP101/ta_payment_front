"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Ban, Undo2 } from "lucide-react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import { Panel, IconButton, ConfirmDialog } from "../../../../components/ui";
import { msg, useI18n } from "../../../../lib/i18n/client";

// One row of holiday-impacts' `other_makeups` (HolidayService.courseMakeupsExcept):
// a makeup or waiver of this course NOT tied to a holiday listed above.
interface OtherMakeup {
  id: string;
  section_id: string;
  sec_no: string;
  kind: string;
  original_date: string;
  makeup_date?: string | null;
  note?: string | null;
  waived: boolean;
}

const KIND_LABEL: Record<string, string> = { lecture: msg("บรรยาย"), lab: msg("ปฏิบัติการ") };

/**
 * "ไม่มีการชดเชย" declared for a day that is NOT a holiday (the lecturer was
 * away, a class was cancelled for another reason). The API has always accepted
 * these, but the page only listed holidays and dated makeups, so such a waiver
 * was invisible and could never be undone. Dated makeups of non-holiday days
 * are already listed by MakeupScheduler ("กรณีอื่น"), so only waivers here.
 */
export function OtherWaivers({ tcId }: { tcId: string }) {
  const { t, fmtDate } = useI18n();
  const key = `/teaching-courses/${tcId}/holiday-impacts`;
  const { data } = useSWR<{ other_makeups?: OtherMakeup[] | null }>(key);
  const [target, setTarget] = useState<OtherMakeup | null>(null);
  const [pending, setPending] = useState(false);
  const waivers = (data?.other_makeups ?? []).filter(m => m.waived);
  if (waivers.length === 0) return null;

  async function undo() {
    if (!target) return;
    setPending(true);
    try {
      await api.del(`/teaching-courses/${tcId}/makeup/${target.section_id}/${target.id}`);
      notify.success(t("ยกเลิกการไม่มีการชดเชยแล้ว"));
      await Promise.all([mutate(key), mutate(`/teaching-courses/${tcId}`)]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPending(false);
      setTarget(null);
    }
  }

  return (
    <>
      <Panel
        className="mt-4"
        title={t("คาบที่งดสอนโดยไม่มีการชดเชย (กรณีอื่น)")}
        description={t("คาบที่ประกาศว่าไม่มีการชดเชยในวันที่ไม่ใช่วันหยุด ยกเลิกได้หากประกาศผิด")}
        padded={false}
      >
        <div className="divide-y divide-(--hairline)">
          {waivers.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-4 flex-wrap md:flex-nowrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 h-6 bg-accent-soft text-accent-soft-foreground">
                sec {m.sec_no}
              </span>
              <div className="flex-1 min-w-0 text-sm">
                <span className="text-muted">{t.rich("งดคาบ{kind} วันที่ {date}", {
                  kind: KIND_LABEL[m.kind] ? t(KIND_LABEL[m.kind]) : m.kind,
                  date: <span className="font-medium text-foreground">{fmtDate(m.original_date)}</span>,
                })}</span>
                <span className="inline-flex items-center gap-1 text-muted"> · <Ban size={12} /> {t("ไม่มีการชดเชย")}</span>
                {m.note && <span className="text-xs text-muted"> — {m.note}</span>}
              </div>
              <IconButton label={t("ยกเลิกการไม่มีการชดเชย")} variant="ghost" size="sm" onClick={() => setTarget(m)}>
                <Undo2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      </Panel>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={undo}
        title={t("ยกเลิกการไม่มีการชดเชย")}
        message={target ? t("คาบ{kind} sec {sec} วันที่ {date} จะกลับเป็นคาบปกติ TA ลงเวลาคาบนี้ได้ตามตาราง", { kind: KIND_LABEL[target.kind] ? t(KIND_LABEL[target.kind]) : target.kind, sec: target.sec_no, date: fmtDate(target.original_date) }) : undefined}
        confirmLabel={t("ยกเลิกการไม่มีการชดเชย")}
        isPending={pending}
      />
    </>
  );
}
