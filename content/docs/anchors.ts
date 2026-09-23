import type { Audience } from "./types";

/**
 * `data-tour` key → doc page. `Panel` and `PageHeader` (app/components/ui.tsx)
 * look their own `data-tour` up here and, on a hit, render a `DocsAnchor`
 * book icon in their header — the Cloudflare-dashboard pattern of a small
 * "read the docs for this section" icon beside a section title, applied to
 * the whole app from one table instead of one edit per page.
 *
 * The tour system already labelled every panel worth explaining with a
 * `data-tour` key, so those keys double as stable anchors for the manual:
 * add a line here and the icon appears; nothing in the page file changes.
 * Keys that live on plain <div>/<span> elements (not Panel/PageHeader) don't
 * pass through this table — those sections carry an explicit `<DocsAnchor>`
 * in their JSX instead.
 */
export const DOC_ANCHORS: Record<string, { audience: Audience; slug: string }> = {
  // เจ้าหน้าที่
  "dash-shortcuts":      { audience: "staff", slug: "home" },
  "users-create":        { audience: "staff", slug: "users" },
  "appt-form":           { audience: "staff", slug: "appointments" },
  "appt-history":        { audience: "staff", slug: "appointments" },
  "payout-grid":         { audience: "staff", slug: "payouts/detail" },
  "payout-export":       { audience: "staff", slug: "payouts/export" },
  "course-sections":     { audience: "staff", slug: "teaching/sections" },
  "progress-gate":       { audience: "staff", slug: "progress" },
  "progress-stepper":    { audience: "staff", slug: "progress" },
  "progress-checklist":  { audience: "staff", slug: "progress" },

  // อาจารย์
  "home-term":           { audience: "lecturer", slug: "home" },
  "course-info":         { audience: "lecturer", slug: "course-overview" },
  "course-sections-list":{ audience: "lecturer", slug: "course-overview" },
  "set-info":            { audience: "lecturer", slug: "settings-schedule" },
  "set-sections":        { audience: "lecturer", slug: "settings-schedule" },
  "rep-history":         { audience: "lecturer", slug: "reports" },
  "budget-help":         { audience: "lecturer", slug: "budget" },
  "budget-info":         { audience: "lecturer", slug: "budget" },
  "budget-total":        { audience: "lecturer", slug: "budget" },

  // ผู้ช่วยสอน
  "ta-home-term":        { audience: "ta", slug: "home" },
  "ta-home-checklist":   { audience: "ta", slug: "home" },
  "ta-home-courses":     { audience: "ta", slug: "home" },
  "doc-progress":        { audience: "ta", slug: "documents/overview" },
  "sch-list":            { audience: "ta", slug: "schedule/manual-draw" },
  "sch-wba":             { audience: "ta", slug: "schedule/wba" },
  "ta-course-schedule":  { audience: "ta", slug: "course-overview" },
};
