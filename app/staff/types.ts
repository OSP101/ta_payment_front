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
  /** Courses an officer can move today — the merged step-3/4 badge. */
  payout_courses_actionable: number;
  /** รายชื่อ (TA × วิชา) ที่อนุมัติแล้วแต่ยังไม่อยู่ในคำสั่งแต่งตั้งรอบใด
   *  ของเทอมนี้ — เลขเดียวกับ "จะออกคำสั่งให้ N รายชื่อ" ในหน้าใบแต่งตั้ง */
  pending_appointments: number;
  budget_allocated: number;
  budget_used: number;
  budget_courses: number;
  missing_student_counts: number;
}

/** GET /dashboard/analytics — the executive budget view for one term.
 *
 * Every baht figure is SETTLE-based (the same pricing-with-cutoff that prices
 * the printed claim), so the dashboard, the Excel export and the claim
 * documents can never disagree. */
export interface CurriculumStat {
  /** CS | IT | GIS | AI | CY | OTHER | "" (= ยังไม่ระบุ) */
  curriculum: string;
  courses_open: number;
  courses_with_ta: number;
  tas: number;
  spent_baht: number;
  cap_baht: number;
}

export interface CourseSpendStat {
  teaching_course_id: string;
  code: string;
  name_th: string;
  curriculum: string;
  tas: number;
  approved_hours: number;
  spent_baht: number;
  cap_baht: number;
  over_budget: boolean;
  forecast_baht?: number;
  unfunded_baht?: number;
  students?: number;
}

export interface TermAnalytics {
  term_id: string;
  term_label: string;
  starts_on?: string;
  ends_on?: string;
  /** 0–100; negative = the term has no dates, hide the pace bar. */
  elapsed_pct: number;
  courses_open: number;
  courses_with_ta: number;
  total_tas: number;
  /** งบรวมของภาคเรียน: the sum of each requesting course's budget (its formula
   *  ceiling), counting only courses with a submitted/approved TA request —
   *  the money to be set aside for the term. Derived, never entered. */
  budget_allocated: number;
  budget_used: number;
  approved_hours: number;
  monthly: { year_month: string; baht: number }[] | null;
  curricula: CurriculumStat[] | null;
  courses: CourseSpendStat[] | null;

  // ---- question-led dashboard (26/09/2026) ----
  /** Part of budget_used that is graduate-special lump sums. */
  budget_lump: number;
  /** Projected term spend from everything logged (a floor). */
  budget_forecast: number;
  /** Logged work the course pools cannot pay. */
  budget_unfunded: number;
  active_tas: number;
  tas_undergrad: number;
  tas_graduate: number;
  plan: PlanRatios;
  staffing: CourseStaffing[] | null;
  pipeline: PipelineSummary | null;
  flow: MonthFlow[] | null;
  deadline: DeadlineInfo | null;
  docs: DocStatusCounts;
}

export interface PlanRatios {
  students_per_ta: number;
  min_students_per_ta: number;
  suggested_ta_cap: number;
}

export type StaffingStatus =
  | "no_request" | "no_students" | "under" | "match" | "above_guide" | "over_ceiling";

export interface CourseStaffing {
  teaching_course_id: string;
  code: string;
  name_th: string;
  curriculum: string;
  level: string;
  lecturers: string[];
  students: number;
  students_missing: boolean;
  sittings: number;
  recommended: number;
  ceiling: number;
  requested: number;
  approved: number;
  pending_request: boolean;
  students_per_ta: number;
  status: StaffingStatus;
  spent_baht: number;
  cap_baht: number;
  forecast_baht: number;
  unfunded_baht: number;
  unresolved_makeups: number;
}

export type PipelineKey = "requests" | "documents" | "appointments" | "payout_review" | "export";

export interface PipelineSummary {
  stages: { key: PipelineKey; count: number; oldest_days?: number }[];
  docs_returned: number;
  months_sent_back: number;
  worklogs_rejected: number;
  requests_rejected: number;
  missing_students: number;
  unresolved_makeups: number;
  courses_no_ta: number;
  payout_courses: number;
}

export interface MonthFlow {
  /** Buddhist-era "2569-06", as submission_periods stores it. */
  year_month: string;
  label: string;
  due_date: string;
  is_closed: boolean;
  with_ta: number;
  with_lecturer: number;
  await_appointment: number;
  staff_review: number;
  ready_export: number;
  exported: number;
  finance_sent: number;
  skipped: number;
  sent_back: number;
  total: number;
  baht: number;
}

export interface DeadlineInfo {
  due_date: string;
  days_left: number;
  months: string[];
  labels: string[];
  remind_days: number;
  not_sent: number;
}

export interface DocStatusCounts {
  not_submitted: number;
  submitted: number;
  needs_fix: number;
  rejected: number;
  approved: number;
  total: number;
}

/** Must say the same words as the backend's CurriculumTH (analytics xlsx). */
export const CURRICULUM_TH: Record<string, string> = {
  CS: "วิทยาการคอมพิวเตอร์",
  IT: "เทคโนโลยีสารสนเทศ",
  GIS: "ภูมิสารสนเทศศาสตร์",
  AI: "ปัญญาประดิษฐ์",
  CY: "ความมั่นคงปลอดภัยไซเบอร์",
  OTHER: "คณะอื่น ๆ",
};
export const curriculumTH = (code: string) => CURRICULUM_TH[code] ?? "ยังไม่ระบุ";

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
  payout_courses_actionable: 0,
  pending_appointments: 0,
  budget_allocated: 0,
  budget_used: 0,
  budget_courses: 0,
  missing_student_counts: 0,
};
