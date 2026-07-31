// คำนำหน้าชื่อ. Mirrored on the server (service.AllowedPrefixes) — the two
// lists must stay in sync because the PDF overlay draws its circle at a
// coordinate keyed off this exact string. Extending this list means also
// picking a circle centre in internal/pdfgen/creditor.go.

export const THAI_PREFIXES = ["นาย", "นาง", "นางสาว"] as const;
export type ThaiPrefix = (typeof THAI_PREFIXES)[number];

export function isThaiPrefix(s: string): s is ThaiPrefix {
  return (THAI_PREFIXES as readonly string[]).includes(s);
}

/**
 * A person's name the way Thai writes it: the title runs straight into the
 * given name with NO space — "ผศ. ดร.วรัญญา วรรณศรี", "นายชนาธิป สีลาพล".
 * Only the surname is separated.
 *
 * Any internal spacing inside the title itself is kept as stored ("ผศ. ดร."),
 * because that is the writer's choice, not ours. The creditor-form PDF already
 * prints `prefix + name` this way (pdfgen/creditor.go), so screen and paper now
 * agree.
 */
export function formatFullName(
  p: { title?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  if (!p) return "";
  const given = `${(p.title ?? "").trim()}${(p.first_name ?? "").trim()}`;
  return [given, (p.last_name ?? "").trim()].filter(Boolean).join(" ");
}
