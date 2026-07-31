/** GET /dashboard/executive — the staff/admin summary for one term.
 *
 * Shared between the dashboard page and StaffShell: the sidebar badges and the
 * dashboard's to-do panel must show the same numbers, and SWR dedupes the two
 * components onto a single request. */
export interface Executive {
  term_id: string | null;
  term_label: string;
  total_courses: number;
  courses_with_ta: number;
  total_tas: number;
  pending_ta_requests: number;
  pending_reviews: number;
  pending_payout_reviews: number;
  ready_to_export: number;
  budget_allocated: number;
  budget_used: number;
  budget_courses: number;
  missing_student_counts: number;
}

export const emptyExecutive: Executive = {
  term_id: null,
  term_label: "",
  total_courses: 0,
  courses_with_ta: 0,
  total_tas: 0,
  pending_ta_requests: 0,
  pending_reviews: 0,
  pending_payout_reviews: 0,
  ready_to_export: 0,
  budget_allocated: 0,
  budget_used: 0,
  budget_courses: 0,
  missing_student_counts: 0,
};
