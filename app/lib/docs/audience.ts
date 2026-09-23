import { AUDIENCE_ROLES, AUDIENCE_ORDER, type Audience } from "../../../content/docs/types";
import type { Me } from "../api";

/** Every audience `me` is allowed to open, in switch order. */
export function allowedAudiences(me: Me): Audience[] {
  return AUDIENCE_ORDER.filter((a) => AUDIENCE_ROLES[a](me));
}

export function canViewAudience(me: Me, audience: Audience): boolean {
  if (audience === "common") return true;
  return AUDIENCE_ROLES[audience](me);
}

/**
 * Where `/docs` sends someone with no audience picked yet — the role they
 * spend the most time in, not necessarily the first one alphabetically.
 * Staff/admin land on the staff manual (their own working area); an
 * executive-flagged lecturer still lands on the lecturer manual, matching
 * `LecturerHomeShell`'s own "มุมมองผู้บริหาร" being a link out, not a home.
 */
export function defaultAudience(me: Me): Audience {
  if (me.roles.includes("admin") || me.roles.includes("staff")) return "staff";
  if (me.roles.includes("lecturer") || me.is_executive) return "lecturer";
  return "ta";
}

/**
 * The app route `defaultAudience`'s answer corresponds to — used for the
 * docs header's "กลับสู่ระบบ" link. Kept as a lookup off `defaultAudience`
 * itself rather than a second hand-written role-priority chain: the header's
 * back-to-app link and `/docs`'s own landing redirect must never disagree
 * about which area a given user belongs to (an is_executive-flagged account
 * with no "lecturer" role — a real combination; see app/staff/users/page.tsx
 * and app/executive/layout.tsx, where is_executive never requires it — used
 * to land in the lecturer manual but get a home link back to /ta).
 */
export function defaultHomeRoute(me: Me): string {
  return { staff: "/staff", lecturer: "/lecturer", ta: "/ta", common: "/" }[defaultAudience(me)];
}
