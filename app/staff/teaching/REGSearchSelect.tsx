"use client";

import { Autocomplete, Label, ListBox, SearchField, useFilter } from "@heroui/react";
import { useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n/client";

export interface REGSearchOption {
  id: string;
  label: string;
  description?: string;
}

/** Search is local UI state: it never replaces a selected UUID/course code. */
export default function REGSearchSelect({
  label, hideLabel = false, placeholder, searchLabel, emptyText,
  value, options, disabled, onChange, openRequest = 0,
}: {
  label: string; hideLabel?: boolean; placeholder: string; searchLabel: string; emptyText: string;
  value: string; options: REGSearchOption[]; disabled: boolean; onChange: (id: string) => void;
  openRequest?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest > 0) setOpen(true); }, [openRequest]);
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = options.find(option => option.id === value);
  return <Autocomplete
    aria-label={label} selectionMode="single" value={value || null}
    isOpen={open} onOpenChange={setOpen}
    onChange={key => onChange(key == null ? "" : String(key))}
    isDisabled={disabled} placeholder={placeholder} className="w-full min-w-0"
  >
    <Label className={hideLabel ? "sr-only" : "font-medium"}>{label}</Label>
    <Autocomplete.Trigger aria-label={label} className="min-w-0">
      <Autocomplete.Value className="min-w-0 flex-1 truncate">
        {({ defaultChildren }) => !selected ? defaultChildren :
          <span className="block min-w-0 truncate">{selected.label}{selected.description ? ` · ${selected.description}` : ""}</span>}
      </Autocomplete.Value>
      <Autocomplete.ClearButton aria-label={`${t("ล้างค่าที่เลือก")}: ${label}`} />
      <Autocomplete.Indicator />
    </Autocomplete.Trigger>
    <Autocomplete.Popover placement="bottom start" className="max-w-[calc(100vw-2rem)]">
      <div onKeyDownCapture={event => {
        // Close only this nested picker; Escape must not also dismiss the
        // full-screen import review and open its discard-confirmation dialog.
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      }}>
      <Autocomplete.Filter filter={(text, query) => query.trim().split(/\s+/).every(word => contains(text, word))}>
        <SearchField autoFocus aria-label={searchLabel} variant="secondary">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input aria-label={searchLabel} placeholder={searchLabel} />
            <SearchField.ClearButton aria-label={t("ล้างคำค้นหา")} />
          </SearchField.Group>
        </SearchField>
        <ListBox className="max-h-72 overflow-y-auto" renderEmptyState={() =>
          <p className="p-3 text-center text-sm text-muted">{emptyText}</p>}>
          {options.map(option => <ListBox.Item key={option.id} id={option.id}
            textValue={`${option.label} ${option.description ?? ""}`}>
            <div className="min-w-0 flex-1">
              <Label className="break-words whitespace-normal">{option.label}</Label>
              {option.description && <p className="break-words text-sm text-muted">{option.description}</p>}
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>)}
        </ListBox>
      </Autocomplete.Filter>
      </div>
    </Autocomplete.Popover>
  </Autocomplete>;
}
