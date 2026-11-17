// In-memory API for exercising the actual request page. No database or real accounts.
export const courseId = 'request-playground';
export const lecturer = { id: 'lecturer-playground', first_name: 'อาจารย์', last_name: 'ทดลอง', email: 'lecturer@example.test', roles: ['lecturer'], ui_theme: 'light', ui_locale: 'th', totp_enabled: true, mfa_setup_required: false };
export const candidates = Array.from({ length: 12 }, (_, i) => ({ id: `ta-${i + 1}`, first_name: 'ผู้ช่วยสอน', last_name: `ตัวอย่าง ${i + 1}`, email: `ta${i + 1}@example.test`, study_level: i === 10 ? 'master' : 'undergrad', approved_course_count: 0, at_quota: false, course_cap: 3, already_in_course: false, has_schedule: true }));
export const sections = Array.from({ length: 4 }, (_, i) => ({ id: `sec-${i + 1}`, sec_no: String(i + 1), track: 'regular', schedules: [{ kind: 'lecture', day_of_week: 1, start_time: '09:00', end_time: '11:00' }, { kind: 'lab', day_of_week: i + 2, start_time: '13:00', end_time: '15:00' }] }));
export const workload = (patch = {}) => ({ help_teach_hrs: 0, help_teach_desc: '', prep_hrs: 0, prep_desc: '', grade_hrs: 0, grade_desc: '', other_hrs: 0, other_desc: '', check_work_hrs: 0, attendance_hrs: 0, ug_other_hrs: 0, ug_other_desc: '', lab_hrs: 0, lab_other_hrs: 0, lab_other_desc: '', ...patch });
export const initialDraft = () => ({ v: 1, scope: 'both', assignments: [{ ta_id: 'ta-1', level: 'undergrad', section_ids: ['sec-1'], section_workloads: { 'sec-1': workload({ check_work_hrs: 1, attendance_hrs: 1, lab_hrs: 2 }) } }, { ta_id: 'ta-2', level: 'undergrad', section_ids: ['sec-2'], section_workloads: { 'sec-2': workload({ lab_hrs: 2 }) } }] });
export function createPlaygroundAPI() {
  let draft = initialDraft();
  let requests = [];
  const months = ['2026-11', '2026-12', '2027-01', '2027-02'].map(year_month => ({ year_month, lecture_periods: 4, lab_periods: 4, class_weeks: 4 }));
  const plan = { starts_on: '2026-11-01', ends_on: '2027-02-28', weeks_total: 16, class_weeks: 16, sections: sections.map(s => ({ section_id: s.id, sec_no: s.sec_no, track: s.track, num_students: 30, lecture_hours_weekly: 2, lab_hours_weekly: 2, lecture_periods: 16, lab_periods: 16, class_weeks: 16, skipped_holiday: 0, skipped_exam: 0, months })), tracks: { regular: { track: 'regular', cap_baht: 40000, existing_baht: 0, existing_lump_baht: 0, existing_tas: 0, num_students: 120 }, special: { track: 'special', cap_baht: 0, existing_baht: 0, existing_lump_baht: 0, existing_tas: 0, num_students: 0 } }, existing: [], rates: { undergrad_regular: 50, undergrad_special: 50, graduate_regular_hourly: 50, graduate_special_lumpsum: 12000, ug_special_monthly_cap: 3000, term_months: 4, grad_review_hour_cap: 2, plan_students_per_ta: 30, plan_min_students_per_ta: 15, plan_suggested_ta_cap: 4 } };
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method;
    let raw = ''; for await (const chunk of req) raw += chunk;
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { res.writeHead(400).end(); return; }
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (path === '/me' || path === '/me/preferences' || path === '/auth/heartbeat') return json(lecturer);
    if (path === '/settings/pay-rate') return json({ ...plan.rates, ug_regular_daily_hour_cap: 7, ug_special_daily_hour_cap: 6, grad_regular_daily_hour_cap: 6 });
    if (path === '/ta-request/windows') return json([{ id: 'window', term_id: 'term-playground', opens_at: new Date(Date.now() - 86400000).toISOString(), closes_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_open: true }]);
    if (path === '/ta-requests/candidates') return json({ items: candidates });
    if (path === '/ta-requests/preview-conflicts') return json({ conflicts: sections.map(s => ({ section_id: s.id, messages: [], blocked_kinds: [], cross_conflict: false })) });
    if (path === `/teaching-courses/${courseId}`) return json({ id: courseId, code: 'CP-DEMO', name_th: 'รายวิชาสำหรับทดลองคำขอ TA', term_id: 'term-playground', lecture_hrs: 2, lab_hrs: 2, has_missing_schedule: false, sections, lecturers: [{ ...lecturer, is_primary: true }] });
    if (path.endsWith('/ta-plan')) return json(plan);
    if (path.endsWith('/budget')) return json({ per_course_max: 40000, used_baht: 0, remaining_baht: 40000, over_budget: false, term_pay_special: 0, rates: plan.rates });
    if (path.endsWith('/budget-settlement')) return json({ forecast: { special: { committed: 0 } } });
    if (path.endsWith('/request-draft')) {
      if (method === 'PUT') draft = structuredClone(body);
      if (method === 'DELETE') draft = undefined;
      return json({ payload: draft, updated_at: new Date().toISOString() });
    }
    if (path === '/ta-requests') {
      if (method === 'POST') {
        const results = (body.assignments ?? []).map((a, i) => { const ta = candidates.find(t => t.id === a.ta_id); const row = { id: `test-request-${requests.length + i + 1}`, ta_id: a.ta_id, ta_name: ta ? `${ta.first_name} ${ta.last_name}` : '', status: 'approved', teaching_course_id: courseId, course_code: 'CP-DEMO', course_name: 'รายวิชาสำหรับทดลองคำขอ TA', ta_names: ta ? `${ta.first_name} ${ta.last_name}` : '', ta_count: 1, submitted_at: new Date().toISOString(), can_cancel: false }; return row; }); requests.push(...results); return json({ ...results[0], requests: results });
      }
      return json(requests);
    }
    if (/^\/ta-requests\/test-request-/.test(path)) return json({ ...requests.find(r => r.id === path.split('/')[2]), assignments: [] });
    if (path === '/api/health' || url.pathname === '/api/health') return json({ status: 'ok', playground: true });
    if (method === 'GET') return json([]);
    return json({ error: 'Unsupported playground operation' }, 404);
  };
}
