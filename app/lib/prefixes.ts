// คำนำหน้าชื่อ. Mirrored on the server (service.AllowedPrefixes) — the two
// lists must stay in sync because the PDF overlay draws its circle at a
// coordinate keyed off this exact string. Extending this list means also
// picking a circle centre in internal/pdfgen/creditor.go.

export const THAI_PREFIXES = ["นาย", "นาง", "นางสาว"] as const;
export type ThaiPrefix = (typeof THAI_PREFIXES)[number];

export function isThaiPrefix(s: string): s is ThaiPrefix {
  return (THAI_PREFIXES as readonly string[]).includes(s);
}
