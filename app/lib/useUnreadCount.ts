"use client";
import useSWR from "swr";

/** Total unread notifications, from the backend's own count endpoint rather
 *  than the bell's 10-item preview list — the list undercounts past 10. */
export default function useUnreadCount(): number {
  const { data } = useSWR<{ count: number }>("/me/notifications/unread-count");
  return data?.count ?? 0;
}
