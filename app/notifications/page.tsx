"use client";
import NotificationsList from "../components/NotificationsList";

// Rendered inside the reader's own shell (see the layout), which already
// supplies the page padding and the way back.
export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <NotificationsList />
    </div>
  );
}
