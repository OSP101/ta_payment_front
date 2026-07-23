"use client";
import { useState } from "react";
import useSWR from "swr";
import { Download, Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Button, IconButton, Chip, Spinner } from "./ui";

// maskDigits hides every digit except the last `keep`, preserving non-digit
// characters (bank name, spaces). "ธ.ไทยพาณิชย์ 4091290303" → "…••••••0303".
// National IDs / account numbers are sensitive; the preview masks them by
// default and the eye toggle reveals the full value on demand.
function maskDigits(s: string, keep = 4): string {
  if (!s) return "";
  const digitCount = (s.match(/\d/g) ?? []).length;
  if (digitCount <= keep) return s;
  let toMask = digitCount - keep;
  let out = "";
  for (const ch of s) {
    if (/\d/.test(ch)) {
      if (toMask > 0) { out += "•"; toMask--; } else out += ch;
    } else out += ch;
  }
  return out;
}

// Pull the download filename out of a Content-Disposition header, handling both
// the RFC 5987 `filename*=UTF-8''…` form and the plain `filename="…"` form.
function filenameFromCD(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* malformed encoding — fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain?.[1]?.trim() ?? null;
}

// Read-only payout preview (GET /exports/course/:id/preview) — the exact numbers
// the ZIP would contain, so staff review before the locking download.
export interface PreviewRow {
  ta_id: string;
  full_name: string;
  email: string;
  level_th: string;
  track_th: string;
  hours_total: number;
  pay_baht: number;
  actual_paid: number;
  is_returning: boolean;
  national_id: string;
  bank_acct: string;
  profile_ready: boolean;
  profile_issue: string;
}
export interface ExportPreview {
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  term_months: number;
  budget_max: number;
  total_pay: number;
  total_actual: number;
  over_budget: boolean;
  prorated: boolean;
  all_ready: boolean;
  rows: PreviewRow[];
}

export const fmtBaht = (n: number) =>
  `฿${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ExportPreviewBody shows the payout numbers and hosts the locking ZIP download
// (gated behind an acknowledge checkbox + all-TAs-ready). Self-contained so it
// can be embedded inline (per-course workspace) or inside a modal.
export function ExportPreviewBody({
  tcId,
  exportedAt,
  onExported,
}: {
  tcId: string;
  exportedAt?: string | null;
  onExported?: () => void;
}) {
  const { data, error, isLoading } = useSWR<ExportPreview>(
    `/exports/course/${tcId}/preview`,
  );
  const [ack, setAck] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Per-row reveal state for the masked national-ID / bank-account column.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const alreadyExported = !!exportedAt;
  const notReady = (data?.rows ?? []).filter(r => !r.profile_ready);

  async function download() {
    // Fetch the ZIP as a blob (not window.location) so a backend error surfaces
    // as a Thai toast instead of navigating the SPA to a raw JSON body, and so
    // onExported() fires only after the download actually succeeded (the old
    // fixed 1.5s timer revalidated before MarkCourseExported had committed).
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/exports/course/${tcId}.zip`, {
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "";
        try {
          msg = ((await res.json()) as { error?: string })?.error ?? "";
        } catch {
          /* non-JSON error body */
        }
        notify.error(msg || "ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      const blob = await res.blob();
      const fname =
        filenameFromCD(res.headers.get("content-disposition")) ??
        `${data?.course_code ?? "export"}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAck(false);
      onExported?.();
    } catch {
      notify.error("ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDownloading(false);
    }
  }

  const canDownload = !!data?.all_ready && (alreadyExported || ack) && !downloading;

  if (isLoading || (!data && !error)) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted">
        <Spinner size="sm" /> กำลังคำนวณข้อมูลเบิกจ่าย…
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 text-center text-sm text-danger">
        โหลดข้อมูลไม่สำเร็จ — {errMessage(error)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryStat label="งบรายวิชา" value={data.budget_max > 0 ? fmtBaht(data.budget_max) : "ไม่จำกัด"} />
        <SummaryStat label="รวมที่คำนวณได้" value={fmtBaht(data.total_pay)} />
        <SummaryStat
          label="จ่ายจริง (หลังเกลี่ยงบ)"
          value={fmtBaht(data.total_actual)}
          tone={data.prorated ? "warn" : undefined}
        />
        <SummaryStat label="จำนวน TA" value={String(data.rows.length)} />
      </div>

      {data.over_budget && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <b>ยอดรวมเกินงบรายวิชา</b> — ระบบเกลี่ยเงิน (pro-rata) ให้อัตโนมัติ คอลัมน์ “จ่ายจริง” คือยอดหลังเกลี่ยแล้ว
        </div>
      )}

      {!data.all_ready && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          <b>ยังดาวน์โหลดไม่ได้</b> — มี TA ที่ข้อมูลไม่พร้อม {notReady.length} คน:{" "}
          {notReady.map(r => `${r.full_name} (${r.profile_issue})`).join(", ")} — โปรดให้ TA แก้ไขหรือเจ้าหน้าที่อนุมัติเอกสารก่อน
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-ink-2">
            <tr>
              <th className="text-left px-3 py-2">ชื่อ TA</th>
              <th className="text-left px-3 py-2">ระดับ / ภาค</th>
              <th className="text-right px-3 py-2">ชม.อนุมัติ</th>
              <th className="text-right px-3 py-2">เป็นเงิน</th>
              <th className="text-right px-3 py-2">จ่ายจริง</th>
              <th className="text-left px-3 py-2">ข้อมูล</th>
              <th className="text-left px-3 py-2">เลขบัตร / บัญชี</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">ยังไม่มี TA ที่อนุมัติในวิชานี้</td></tr>
            ) : data.rows.map(r => (
              <tr key={r.ta_id} className="border-t border-hairline">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.full_name}</span>
                    <Chip tone={r.is_returning ? "info" : "neutral"}>{r.is_returning ? "เก่า" : "ใหม่"}</Chip>
                  </div>
                  <div className="text-xs text-ink-3">{r.email}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.level_th} · {r.track_th}</td>
                <td className="px-3 py-2 text-right tabular">{r.hours_total.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular">{fmtBaht(r.pay_baht)}</td>
                <td className="px-3 py-2 text-right tabular">
                  {r.actual_paid !== r.pay_baht ? (
                    <span className="text-amber-700 dark:text-amber-300 font-medium">{fmtBaht(r.actual_paid)}</span>
                  ) : (
                    fmtBaht(r.actual_paid)
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.profile_ready ? (
                    <Chip tone="success"><CheckCircle2 size={11} /> พร้อม</Chip>
                  ) : (
                    <Chip tone="warn"><AlertTriangle size={11} /> {r.profile_issue}</Chip>
                  )}
                </td>
                <td className="px-3 py-2 text-xs tabular text-ink-3">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0">
                      <div>{r.national_id ? (revealed[r.ta_id] ? r.national_id : maskDigits(r.national_id)) : "—"}</div>
                      <div>{r.bank_acct ? (revealed[r.ta_id] ? r.bank_acct : maskDigits(r.bank_acct)) : "—"}</div>
                    </div>
                    {(r.national_id || r.bank_acct) && (
                      <IconButton
                        label={revealed[r.ta_id] ? "ซ่อนเลขบัตร/บัญชี" : "แสดงเลขบัตร/บัญชี"}
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevealed(x => ({ ...x, [r.ta_id]: !x[r.ta_id] }))}
                        className="shrink-0"
                      >
                        {revealed[r.ta_id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </IconButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-hairline bg-slate-50/60 font-medium">
                <td className="px-3 py-2" colSpan={2}>รวม</td>
                <td className="px-3 py-2 text-right tabular">
                  {data.rows.reduce((a, r) => a + r.hours_total, 0).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right tabular">{fmtBaht(data.total_pay)}</td>
                <td className="px-3 py-2 text-right tabular">{fmtBaht(data.total_actual)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {data.all_ready && !alreadyExported && (
        <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={e => setAck(e.target.checked)} />
          <span>
            ตรวจสอบข้อมูลข้างต้นถูกต้องแล้ว — เข้าใจว่าการดาวน์โหลดจะ<b>ล็อกบันทึกเวลาของเดือนที่อนุมัติครบ</b> (แก้ไม่ได้จนกว่าเจ้าหน้าที่จะตีกลับหรือแอดมินปลดล็อก)
          </span>
        </label>
      )}
      {alreadyExported && (
        <p className="text-xs text-ink-3">
          วิชานี้เคยส่งออก (ล็อก) แล้ว — ดาวน์โหลดซ้ำได้ทันทีโดยไม่มีผลกระทบเพิ่มเติม
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
        <span className="text-xs text-ink-3">
          หากตัวเลขไม่ถูกต้อง ให้ไปแก้ที่แท็บ “บันทึกเวลา” ก่อน แล้วกลับมาที่แท็บนี้ (ตัวเลขอัปเดตอัตโนมัติ)
        </span>
        <Button variant="primary" onClick={download} disabled={!canDownload} className="shrink-0">
          {alreadyExported ? <Download size={14} /> : <Lock size={14} />}
          {downloading
            ? "กำลังดาวน์โหลด…"
            : alreadyExported
            ? "ดาวน์โหลดซ้ำ"
            : "ดาวน์โหลด ZIP (ล็อก)"}
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === "warn" ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20" : "border-hairline bg-slate-50/60 dark:bg-slate-900/30"}`}>
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="text-sm font-semibold tabular">{value}</div>
    </div>
  );
}
