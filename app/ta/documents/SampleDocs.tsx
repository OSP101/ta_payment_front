"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Inline SVG mockups shown next to each document uploader so a TA can see
// what a valid submission looks like before uploading. All content is fake
// (Somsak Jaidee / 1-2345-67890-12-3 etc.) and clearly watermarked ตัวอย่าง.

const WATERMARK = "ตัวอย่าง";

function Watermark() {
  return (
    <g opacity="0.12" transform="translate(200 140) rotate(-24)">
      <text
        x="0"
        y="0"
        fontSize="72"
        fontWeight="800"
        fill="#dc2626"
        textAnchor="middle"
        fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif"
      >
        {WATERMARK}
      </text>
    </g>
  );
}

export function CreditorFormSample() {
  return (
    <svg viewBox="0 0 480 300" role="img" aria-label="ตัวอย่างแบบแจ้งข้อมูลเจ้าหนี้บุคลากร" className="w-full h-auto">
      <rect x="1" y="1" width="478" height="298" rx="6" fill="#ffffff" stroke="#cbd5e1" />
      <text x="240" y="30" fontSize="14" fontWeight="700" textAnchor="middle" fill="#0f172a"
        fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif">
        แบบแจ้งข้อมูลเจ้าหนี้บุคลากร (มหาวิทยาลัยขอนแก่น)
      </text>

      <g fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" fontSize="11" fill="#0f172a">
        <text x="24" y="66">ชื่อ-สกุล:</text>
        <text x="90" y="66" fontWeight="600">นายสมศักดิ์ ใจดี</text>

        <text x="24" y="92">เลขบัตรประชาชน:</text>
        <text x="130" y="92" fontWeight="600">1-2345-67890-12-3</text>

        <text x="24" y="118">โทรศัพท์:</text>
        <text x="90" y="118" fontWeight="600">08x-xxx-xxxx</text>
        <text x="240" y="118">อีเมล:</text>
        <text x="285" y="118" fontWeight="600">somsak@example.ac.th</text>

        <text x="24" y="150" fontWeight="700">ข้อมูลบัญชีธนาคาร</text>
        <text x="24" y="172">ชื่อบัญชี:</text>
        <text x="90" y="172" fontWeight="600">สมศักดิ์ ใจดี</text>

        <text x="24" y="196">ธนาคาร:</text>
        <text x="90" y="196" fontWeight="600">ไทยพาณิชย์</text>
        <text x="220" y="196">สาขา:</text>
        <text x="260" y="196" fontWeight="600">มข.</text>
        <text x="330" y="196">รหัสสาขา:</text>
        <text x="390" y="196" fontWeight="600">0010</text>

        <text x="24" y="220">เลขที่บัญชี:</text>
        <text x="95" y="220" fontWeight="600">123-4-56789-0</text>

        <text x="24" y="256">ลายเซ็น:</text>
        <path d="M 90 262 q 12 -18 26 0 t 26 0 t 26 0" stroke="#0f172a" fill="none" strokeWidth="1.5" />
        <text x="24" y="278" fontSize="10" fill="#64748b">
          บัญชีต้องผูกพร้อมเพย์กับเลขบัตรประชาชนที่กรอกด้านบน
        </text>
      </g>

      <Watermark />
    </svg>
  );
}

export function NationalIDSample() {
  return (
    <svg viewBox="0 0 480 300" role="img" aria-label="ตัวอย่างสำเนาบัตรประชาชน" className="w-full h-auto">
      <rect x="1" y="1" width="478" height="298" rx="6" fill="#f8fafc" stroke="#cbd5e1" />

      <g transform="translate(40 40)">
        <rect x="0" y="0" width="400" height="220" rx="14" fill="#fff" stroke="#94a3b8" />
        <rect x="0" y="0" width="400" height="42" rx="14" fill="#1e40af" />
        <text x="14" y="26" fontSize="12" fontWeight="700" fill="#fff"
          fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif">
            บัตรประจำตัวประชาชน · Thai National ID Card
        </text>

        <rect x="20" y="60" width="80" height="100" rx="4" fill="#e2e8f0" stroke="#94a3b8" />
        <circle cx="60" cy="94" r="16" fill="#cbd5e1" />
        <path d="M 34 154 q 26 -34 52 0" fill="#cbd5e1" />

        <g fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" fontSize="11" fill="#0f172a">
          <text x="120" y="72">เลขประจำตัวประชาชน</text>
          <text x="120" y="92" fontSize="15" fontWeight="700" letterSpacing="1">1 2345 67890 12 3</text>

          <text x="120" y="120">ชื่อตัว-ชื่อสกุล</text>
          <text x="120" y="138" fontWeight="600">นาย สมศักดิ์ ใจดี</text>

          <text x="120" y="160">Name / Last name</text>
          <text x="120" y="178" fontWeight="600">Mr. Somsak Jaidee</text>

          <text x="120" y="200">เกิดวันที่ 1 ม.ค. 2543</text>
        </g>
      </g>

      <text x="240" y="284" fontSize="10" textAnchor="middle" fill="#64748b"
        fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif">
          เซ็นชื่อรับรอง “สำเนาถูกต้อง” พร้อมวันที่บนสำเนา ก่อนอัปโหลด
      </text>

      <Watermark />
    </svg>
  );
}

export function BankBookSample() {
  return (
    <svg viewBox="0 0 480 300" role="img" aria-label="ตัวอย่างหน้าสมุดบัญชี" className="w-full h-auto">
      <rect x="1" y="1" width="478" height="298" rx="6" fill="#f8fafc" stroke="#cbd5e1" />

      <g transform="translate(60 40)">
        <rect x="0" y="0" width="360" height="220" rx="10" fill="#7c3aed" />
        <rect x="0" y="0" width="360" height="60" rx="10" fill="#5b21b6" />
        <text x="20" y="36" fontSize="14" fontWeight="800" fill="#fff"
          fontFamily="system-ui, sans-serif">MOCK BANK</text>
        <text x="20" y="52" fontSize="10" fill="#e9d5ff" fontFamily="system-ui, sans-serif">Savings Account</text>

        <g fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" fill="#fff">
          <text x="20" y="102" fontSize="11" opacity="0.85">ชื่อบัญชี / Account Name</text>
          <text x="20" y="122" fontSize="14" fontWeight="700">สมศักดิ์ ใจดี</text>

          <text x="20" y="158" fontSize="11" opacity="0.85">เลขที่บัญชี / Account No.</text>
          <text x="20" y="182" fontSize="18" fontWeight="700" letterSpacing="2">123-4-56789-0</text>

          <text x="20" y="204" fontSize="10" opacity="0.75">สาขา มข. · รหัสสาขา 0010</text>
        </g>
      </g>

      <text x="240" y="284" fontSize="10" textAnchor="middle" fill="#64748b"
        fontFamily="'Sarabun', 'Noto Sans Thai', system-ui, sans-serif">
          บัญชีต้องผูกพร้อมเพย์กับเลขบัตรประชาชนของคุณ · ถ่ายหน้าที่มีเลขบัญชีชัดเจน
      </text>

      <Watermark />
    </svg>
  );
}

// Wrapper component: shows a "ดูตัวอย่าง / ซ่อน" toggle above an inline SVG.
export function SampleToggle({
  kind,
  className,
}: {
  kind: "creditor_form" | "national_id" | "bank_book";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label =
    kind === "creditor_form" ? "ตัวอย่างแบบแจ้งเจ้าหนี้"
    : kind === "national_id" ? "ตัวอย่างสำเนาบัตรประชาชน"
    : "ตัวอย่างหน้าสมุดบัญชี";
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--brand)] hover:underline"
      >
        {open ? <EyeOff size={14} /> : <Eye size={14} />}
        {open ? "ซ่อนตัวอย่าง" : `ดู${label}`}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-[var(--hairline)] bg-white p-2 max-w-[520px]">
          {kind === "creditor_form" && <CreditorFormSample />}
          {kind === "national_id" && <NationalIDSample />}
          {kind === "bank_book" && <BankBookSample />}
          <div className="mt-1 text-[10px] text-[var(--ink-3)] text-center">
            ภาพนี้เป็น <b>ตัวอย่างสมมติ</b> เพื่อประกอบการอัปโหลดเท่านั้น
          </div>
        </div>
      )}
    </div>
  );
}
