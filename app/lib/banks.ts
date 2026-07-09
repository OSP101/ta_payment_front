// Thai commercial + state banks the payroll office accepts for TA payment.
// `accountLen` is the exact digit count the bank prints on its passbook — used
// to catch typos before the form hits the server. Where a bank uses more than
// one length in practice (BAAC, GSB legacy books) we accept every value in
// `accountLen` and show the largest as the hint.
//
// The `code` is the 3-digit BOT bank code; kept for future PromptPay checks.

export interface ThaiBank {
  code: string;
  name: string;      // Thai display name (matches passbook)
  short: string;     // English abbreviation
  accountLen: number[];
}

export const THAI_BANKS: ThaiBank[] = [
  { code: "002", name: "ธนาคารกรุงเทพ",             short: "BBL",  accountLen: [10] },
  { code: "004", name: "ธนาคารกสิกรไทย",             short: "KBank", accountLen: [10] },
  { code: "006", name: "ธนาคารกรุงไทย",              short: "KTB",  accountLen: [10] },
  { code: "011", name: "ธนาคารทหารไทยธนชาต",        short: "ttb",  accountLen: [10] },
  { code: "014", name: "ธนาคารไทยพาณิชย์",           short: "SCB",  accountLen: [10] },
  { code: "022", name: "ธนาคารซีไอเอ็มบี ไทย",       short: "CIMBT", accountLen: [10] },
  { code: "024", name: "ธนาคารยูโอบี",               short: "UOB",  accountLen: [10] },
  { code: "025", name: "ธนาคารกรุงศรีอยุธยา",         short: "BAY",  accountLen: [10] },
  { code: "030", name: "ธนาคารออมสิน",               short: "GSB",  accountLen: [12] },
  { code: "033", name: "ธนาคารอาคารสงเคราะห์",       short: "GHB",  accountLen: [10] },
  { code: "034", name: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร", short: "BAAC", accountLen: [10, 12] },
  { code: "066", name: "ธนาคารอิสลามแห่งประเทศไทย", short: "IBank", accountLen: [10] },
  { code: "067", name: "ธนาคารทิสโก้",               short: "TISCO", accountLen: [10] },
  { code: "069", name: "ธนาคารเกียรตินาคินภัทร",     short: "KKP",  accountLen: [10] },
  { code: "070", name: "ธนาคารไอซีบีซี (ไทย)",       short: "ICBCT", accountLen: [10] },
  { code: "071", name: "ธนาคารไทยเครดิต เพื่อรายย่อย", short: "TCR",  accountLen: [10] },
  { code: "073", name: "ธนาคารแลนด์ แอนด์ เฮ้าส์",   short: "LHFG", accountLen: [10] },
];

export function findBank(nameOrShort: string): ThaiBank | undefined {
  const q = nameOrShort.trim();
  if (!q) return undefined;
  return THAI_BANKS.find(b => b.name === q || b.short === q);
}

/** Digits only, with dashes/spaces stripped. */
export function normalizeAccountNo(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/** Digits only, with dashes stripped. */
export function normalizeNationalID(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/**
 * KKU student IDs are printed as `XXXXXXXXX-X` — 9 digits, a dash, then a
 * check digit. Total 11 characters. Anything else is a typo.
 */
export const STUDENT_ID_PATTERN = /^\d{9}-\d$/;
