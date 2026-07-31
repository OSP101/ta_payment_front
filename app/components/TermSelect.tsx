"use client";
import { CalendarRange } from "lucide-react";
import { Chip, SelectField } from "./ui";
import type { Term } from "../lib/api";

/**
 * The academic-term picker, shared by every page that scopes to a term.
 *
 * One component rather than a hand-rolled <select> per page, because the term
 * is the same idea everywhere and used to look like three different controls:
 * a native dropdown reading "2569/1 (active)" on one page, "2569/1 · ใช้งาน"
 * on another, and a HeroUI Select with a Chip in the staff top bar. Same
 * question, three answers.
 *
 * The active term carries `<Chip tone="success">active</Chip>` — the same word
 * as the switch that sets it (ตั้งค่า → ภาคเรียน), so a reader who wonders what
 * the badge means can search that word and find the control that changes it.
 */
export default function TermSelect({
  terms,
  value,
  onChange,
  className = "w-44",
  isDisabled,
}: {
  terms: Term[] | undefined;
  value: string;
  onChange: (id: string) => void;
  className?: string;
  isDisabled?: boolean;
}) {
  const list = terms ?? [];
  return (
    <SelectField
      className={className}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      options={list.map(t => ({
        id: t.id,
        // textValue drives typeahead and the accessible name; the label below
        // is a node, so it cannot serve as either.
        textValue: `${t.academic_year}/${t.semester}${t.is_active ? " active" : ""}`,
        label: (
          <span className="flex items-center gap-2">
            <CalendarRange size={14} className="text-muted shrink-0" aria-hidden />
            <span className="tabular-nums">{t.academic_year}/{t.semester}</span>
            {t.is_active && <Chip tone="success">active</Chip>}
          </span>
        ),
      }))}
    />
  );
}
