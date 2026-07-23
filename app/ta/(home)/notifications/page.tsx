"use client";
import NotificationsList from "../../../components/NotificationsList";

// The approval reminder is intentionally NOT rendered here: the layout-level
// <TAApprovalBanner> (see ./TAGate) already shows a status-aware banner on this
// route (submitted / rejected / not-submitted), so a second local banner would
// both duplicate it and — as it hardcoded "ยังไม่ได้ส่งเอกสาร" — mislead a TA
// who had already submitted. We suppress the duplicate and defer to TAGate.
export default function TANotificationsPage() {
  return <NotificationsList />;
}
