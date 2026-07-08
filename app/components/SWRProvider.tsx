"use client";
import { SWRConfig } from "swr";
import { Toast } from "@heroui/react";
import { fetcher } from "../lib/api";

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher }}>
      {children}
      <Toast.Provider placement="top end" />
    </SWRConfig>
  );
}
