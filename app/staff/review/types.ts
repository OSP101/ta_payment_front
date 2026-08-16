export interface Pending {
  user_id: string;
  full_name: string;
  email: string;
  status: string;
  submitted_at?: string;
  verified_at?: string;
  /** Earliest expires_at across the TA's three approved required docs.
   * Only populated for the approved bucket; used to render "จะลบใน N วัน". */
  earliest_expires_at?: string | null;
  /** True when the retention job has already purged every current
   * approved doc — disables the re-download action in the FE. */
  all_files_deleted?: boolean;
  /** Per-round download quota. The bundle carries PII, so the number of
   * copies that may leave the system is capped; showing what is left beats
   * letting the officer find out by being refused. */
  downloads_used?: number;
  downloads_limit?: number;
  /** Whether these documents have EVER left the system, bulk downloads
   * included. Not the same as downloads_used > 0: the bulk download is exempt
   * from the quota, so it advances this and not that. The "don't forget to
   * download" reminder must use this one. */
  ever_downloaded?: boolean;
  /** How many of the three required documents are currently uploaded. Only
   * meaningful in the incomplete bucket, where it is what distinguishes
   * "has not started" from "one file to go". */
  docs_in?: number;
}

export interface Doc {
  id: string;
  kind: string;
  filename: string;
  status: string;
  reject_reason?: string | null;
  size_bytes?: number;
  round?: number;
  superseded?: boolean;
  uploaded_at?: string;
  reviewed_at?: string | null;
  expires_at?: string | null;
  file_deleted_at?: string | null;
}

export interface Profile {
  status: string;
  reject_reason?: string | null;
  prefix?: string;
  // No bank/ID fields here: bank details are never stored at all (PDPA,
  // migration 0047), and the citizen ID — though stored encrypted since
  // migration 0076 — is never returned by this API either. Staff read both
  // from the creditor-form PDF in the review workspace.
  current_round?: number;
}

// Preset rejection reasons the officer can pick without typing. "อื่นๆ" opens
// a free-text box so unusual problems can still be described. Used by each
// document panel in the full-screen review workspace.
export const REJECT_PRESETS = [
  "เอกสารไม่ชัด / อ่านไม่ออก",
  "ยังไม่เซ็นชื่อ",
  "แนบผิดไฟล์ / ไม่ตรงประเภทเอกสาร",
  "อื่นๆ (ระบุเอง)",
];
export const OTHER_PRESET = "อื่นๆ (ระบุเอง)";

export const DOC_KIND_LABEL: Record<string, string> = {
  national_id:   "สำเนาบัตรประชาชน",
  bank_book:     "สำเนาสมุดบัญชีธนาคาร",
  creditor_form: "แบบฟอร์มเจ้าหนี้",
};

export function fmtDate(s?: string | null): string {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("th-TH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

/** Whole-days remaining until an ISO timestamp; negative when past. */
export function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  const ms = target - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
