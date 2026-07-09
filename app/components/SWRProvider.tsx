"use client";
import { SWRConfig } from "swr";
import { Toast, toast } from "@heroui/react";
import { fetcher, ApiError } from "../lib/api";

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Don't hammer the backend when it's down; SWR retries with backoff.
        errorRetryCount: 3,
        onError: (err) => {
          // 401/403 are handled by api.ts (redirect / gated UI). Surface only
          // real read failures the user can't otherwise see, and stay quiet for
          // auth so we don't stack a toast on top of a redirect.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return;
          const msg = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
          toast.danger(msg);
        },
      }}
    >
      {children}
      <Toast.Provider placement="top end" />
    </SWRConfig>
  );
}
