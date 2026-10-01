"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Ban, Undo2 } from "lucide-react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import { Panel, IconButton, ConfirmDialog } from "../../../../components/ui";

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

const KIND_LABEL: Record<string, string> = { lecture: "บรรยาย", lab: "ปฏิบัติการ" };
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * "ไม่มีการชดเชย" declared for a day that is NOT a holiday (the lecturer was
 * away, a class was cancelled for another reason). The API has always accepted
 * these, but the page only listed holidays and dated makeups, so such a waiver
 * was invisible and could never be undone. Dated makeups of non-holiday days
 * are already listed by MakeupScheduler ("กรณีอื่น"), so only waivers here.
 */
export function OtherWaivers({ tcId }: { tcId: string }) {
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
      notify.success("ยกเลิกการไม่มีการชดเชยแล้ว");
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
        title="คาบที่งดสอนโดยไม่มีการชดเชย (กรณีอื่น)"
        description="คาบที่ประกาศว่าไม่มีการชดเชยในวันที่ไม่ใช่วันหยุด ยกเลิกได้หากประกาศผิด"
        padded={false}
      >
        <div className="divide-y divide-(--hairline)">
          {waivers.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-4 flex-wrap md:flex-nowrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 h-6 bg-accent-soft text-accent-soft-foreground">
                sec {m.sec_no}
              </span>
              <div className="flex-1 min-w-0 text-sm">
                <span className="text-muted">งดคาบ{KIND_LABEL[m.kind] ?? m.kind} วันที่ </span>
                <span className="font-medium">{thaiDate(m.original_date)}</span>
                <span className="inline-flex items-center gap-1 text-muted"> · <Ban size={12} /> ไม่มีการชดเชย</span>
                {m.note && <span className="text-xs text-muted"> — {m.note}</span>}
              </div>
              <IconButton label="ยกเลิกการไม่มีการชดเชย" variant="ghost" size="sm" onClick={() => setTarget(m)}>
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
        title="ยกเลิกการไม่มีการชดเชย"
        message={target ? `คาบ${KIND_LABEL[target.kind] ?? target.kind} sec ${target.sec_no} วันที่ ${thaiDate(target.original_date)} จะกลับเป็นคาบปกติ TA ลงเวลาคาบนี้ได้ตามตาราง` : undefined}
        confirmLabel="ยกเลิกการไม่มีการชดเชย"
        isPending={pending}
      />
    </>
  );
}
