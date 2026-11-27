"use client";
import useSWR from "swr";
export interface CurriculumOption { code: string; full_name_th: string; level: "undergrad" | "graduate" }
export function useCurricula() {
  const { data } = useSWR<CurriculumOption[]>("/curricula");
  return data ?? [];
}
