// สัญชาติของ TA (users.nationality, migration 0151). Chosen when the account is
// created. It decides which ID goes on the creditor form and which documents
// the TA owes. The office's rule (06/10/2026): a foreigner writes their
// passport number where the citizen ID goes and attaches a passport copy in
// place of the citizen-ID card. The transfer cover uses that passport number
// as their PromptPay number.

export type Nationality = "thai" | "foreign";

export const NATIONALITY_LABEL: Record<Nationality, string> = {
  thai: "ไทย",
  foreign: "ต่างชาติ",
};

export function isForeign(n: string | null | undefined): boolean {
  return n === "foreign";
}

/** The ID the creditor form asks this person for. */
export function idNumberLabel(n: string | null | undefined): string {
  return isForeign(n) ? "เลข Passport" : "เลขบัตรประชาชน";
}

/** Passport number as stored: letters and digits, upper-cased, at most 12. */
export function passportNumber(s: string): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

/** Mirrors validateIDNumber on the server: 6–12 characters, at least one digit. */
export function passportError(s: string): string | null {
  const p = passportNumber(s);
  if (p.length < 6) return "เลข Passport ต้องมี 6–12 ตัวอักษร";
  if (!/\d/.test(p)) return "เลข Passport ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  return null;
}

/** Mirrors ta_required_doc_kinds in SQL, in the order the TA works through them. */
export function requiredDocKinds(n: string | null | undefined): string[] {
  return isForeign(n)
    ? ["creditor_form", "passport", "bank_book"]
    : ["creditor_form", "national_id", "bank_book"];
}
