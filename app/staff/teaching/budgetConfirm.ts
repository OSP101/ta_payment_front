import { ApiError } from "../../lib/api";

// Mirrors service.BudgetConfirmPrefix (ta_payment_back/internal/service/
// teaching_rules.go). A 409 whose message starts with this is NOT a refusal:
// the edit would move the budget of a course whose TAs/hours are already
// approved, and the backend wants the same request again with confirm=true
// after staff have seen old vs new. Any other 409 is a plain refusal.
export const BUDGET_CONFIRM_PREFIX = "ต้องยืนยันการเปลี่ยนงบประมาณ:";

/** The preview text to show in the confirm dialog, or null for any other error. */
export function budgetConfirmMessage(e: unknown): string | null {
  if (e instanceof ApiError && e.status === 409 && e.message.startsWith(BUDGET_CONFIRM_PREFIX)) {
    return e.message.slice(BUDGET_CONFIRM_PREFIX.length).trim();
  }
  return null;
}
