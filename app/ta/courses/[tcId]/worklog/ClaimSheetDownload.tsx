"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Checkbox } from "@heroui/react";
import { Download, FileSpreadsheet, Timer } from "lucide-react";
import { api, ApiError } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import { fmtHours } from "../../../../lib/dates";
import { Alert, Button, Modal, TipWrap } from "../../../../components/ui";
import { SkelRows } from "../../../../components/Skeletons";

interface ClaimMonth {
  year_month: string; // Gregorian "2026-06"
  label: string; // "มิถุนายน 2569"
  hours: number; // everything the sheet prints: approved, sent and draft
  approved_hours: number;
}

// "1:05" — minutes and seconds left on the rate limit.
function fmtCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The TA's own ใบเบิกเวลา — the same sheet staff export, cut to this TA — for
 * the months they pick. A plain read on the server: it locks nothing.
 *
 * The download shares the server's heavy-request limit (15 a minute per
 * account). When it trips, the button stays disabled with a countdown taken
 * from Retry-After rather than letting the TA keep pressing into the same 429.
 */
export function ClaimSheetDownload({ tcId, courseCode }: { tcId: string; courseCode?: string }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!blockedUntil) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= blockedUntil) setBlockedUntil(null);
    }, 1000);
    return () => clearInterval(t);
  }, [blockedUntil]);
  const secondsLeft = blockedUntil ? Math.max(0, Math.ceil((blockedUntil - now) / 1000)) : 0;
  const blocked = secondsLeft > 0;

  const { data: months, error } = useSWR<ClaimMonth[]>(
    open ? `/me/ta-courses/${tcId}/claim-sheet/months` : null,
  );
  // null = not touched yet: default to every month that has approved hours
  // (or all of them when none do — a เหมาจ่าย TA logs no hours at all).
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const defaultPick = useMemo(() => {
    if (!months) return new Set<string>();
    const withHours = months.filter(m => m.hours > 0).map(m => m.year_month);
    return new Set(withHours.length > 0 ? withHours : months.map(m => m.year_month));
  }, [months]);
  const selected = picked ?? defaultPick;

  function toggle(ym: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(ym);
    else next.delete(ym);
    setPicked(next);
  }

  async function download() {
    if (!months || selected.size === 0 || blocked) return;
    setDownloading(true);
    try {
      // Every month ticked = the whole term; leave the filter off.
      const chosen = months.map(m => m.year_month).filter(ym => selected.has(ym));
      const qs = chosen.length === months.length ? "" : `?months=${chosen.join(",")}`;
      const blob = await api.get<Blob>(`/me/ta-courses/${tcId}/claim-sheet.xlsx${qs}`);
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      const slice = qs ? `_${chosen[0]}${chosen.length > 1 ? `_${chosen[chosen.length - 1]}` : ""}` : "";
      el.download = `ใบเบิก-${(courseCode ?? "").replaceAll("/", "_")}${slice}.xlsx`;
      el.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const wait = e.retryAfter ?? 60;
        setNow(Date.now());
        setBlockedUntil(Date.now() + wait * 1000);
        notify.warning(`ดาวน์โหลดบ่อยเกินไป ระบบระงับไว้ชั่วคราว ลองใหม่ได้ในอีก ${fmtCountdown(wait)} นาที`);
      } else {
        notify.error(e, "ดาวน์โหลดใบเบิกไม่สำเร็จ");
      }
    } finally {
      setDownloading(false);
    }
  }

  const blockedText = `ดาวน์โหลดบ่อยเกินไป ระบบระงับไว้ชั่วคราว ลองใหม่ได้ในอีก ${fmtCountdown(secondsLeft)} นาที`;

  return (
    <>
      <TipWrap
        content={
          blocked
            ? blockedText
            : "ไฟล์ Excel ใบเบิกเวลาแบบเดียวกับที่เจ้าหน้าที่ใช้เบิกจ่าย เฉพาะของคุณ ใช้ตรวจสอบชั่วโมง ดาวน์โหลดได้แม้ยังไม่ได้ส่งให้อาจารย์"
        }
      >
        <Button variant="ghost" onClick={() => setOpen(true)} disabled={blocked}>
          {blocked ? <Timer size={14} /> : <Download size={14} />}
          {blocked ? `รอ ${fmtCountdown(secondsLeft)}` : "ดาวน์โหลดใบเบิก"}
        </Button>
      </TipWrap>

      <Modal
        open={open}
        onClose={() => { if (!downloading) setOpen(false); }}
        title="ดาวน์โหลดใบเบิก"
        icon={<FileSpreadsheet size={20} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={downloading}>ยกเลิก</Button>
            <Button
              variant="primary"
              onClick={download}
              isPending={downloading}
              disabled={downloading || blocked || !months || selected.size === 0}
            >
              {blocked ? <Timer size={14} /> : <Download size={14} />}
              {blocked ? `รอ ${fmtCountdown(secondsLeft)}` : `ดาวน์โหลด (${selected.size} เดือน)`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            ใบเบิกเวลาแบบเดียวกับที่เจ้าหน้าที่ใช้เบิกจ่าย แสดงเฉพาะของคุณ
            ใช้ตรวจสอบได้แม้ยังไม่ได้ส่งให้อาจารย์ รายการที่ยังไม่ส่งหรือรออาจารย์อนุมัติจะมีหมายเหตุกำกับ
            ไฟล์นี้เป็นสำเนาสำหรับตรวจสอบ ไม่ใช่เอกสารเบิกจ่าย ยอดเงินอาจเปลี่ยนได้จนกว่าเจ้าหน้าที่จะส่งออกเอกสาร
          </p>
          {blocked && (
            <Alert status="warning" icon={<Timer size={16} />} title={blockedText} />
          )}
          {error ? (
            <Alert status="danger" title="โหลดรายการเดือนไม่สำเร็จ" description={error instanceof Error ? error.message : undefined} />
          ) : !months ? (
            <SkelRows rows={4} columns={2} />
          ) : months.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีเดือนของภาคการศึกษานี้</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">เลือกเดือน</span>
                <span className="flex gap-3">
                  <button type="button" className="text-accent hover:underline" onClick={() => setPicked(new Set(months.map(m => m.year_month)))}>
                    เลือกทั้งหมด
                  </button>
                  <button type="button" className="text-accent hover:underline" onClick={() => setPicked(new Set())}>
                    ล้าง
                  </button>
                </span>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {months.map(m => (
                  <div key={m.year_month} className="flex items-center justify-between gap-3 px-3 py-2">
                    <Checkbox isSelected={selected.has(m.year_month)} onChange={on => toggle(m.year_month, on)}>
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-sm">{m.label}</span>
                      </Checkbox.Content>
                    </Checkbox>
                    <span className={"text-right text-xs tabular-nums " + (m.hours > 0 ? "text-ink-2" : "text-muted")}>
                      {m.hours <= 0
                        ? "ยังไม่มีบันทึกเวลา"
                        : m.approved_hours >= m.hours
                        ? `${fmtHours(m.hours)} ชม. · อนุมัติแล้วทั้งหมด`
                        : `${fmtHours(m.hours)} ชม. · อนุมัติแล้ว ${fmtHours(m.approved_hours)}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
