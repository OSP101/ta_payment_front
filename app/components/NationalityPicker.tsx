"use client";

import { RadioGroup, Radio, Description, Label } from "@heroui/react";
import type { Nationality } from "../lib/nationality";

const OPTIONS: { value: Nationality; label: string; desc: string }[] = [
  { value: "thai", label: "ไทย", desc: "ใช้บัตรประจำตัวประชาชน" },
  { value: "foreign", label: "ต่างชาติ", desc: "ใช้เลขและสำเนา Passport" },
];

/**
 * สัญชาติของ TA ตอนสร้างบัญชี. Shared by the staff user form and the
 * lecturer's create-TA panel so both say the same thing.
 */
export default function NationalityPicker({
  value, onChange, isDisabled,
}: {
  value: Nationality;
  onChange: (v: Nationality) => void;
  isDisabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={v => onChange(v as Nationality)}
      orientation="horizontal"
      isDisabled={isDisabled}
      className="w-full"
    >
      <Label className="text-sm font-medium">สัญชาติ</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {OPTIONS.map(o => (
          <Radio
            key={o.value}
            value={o.value}
            className="border border-border rounded-lg px-3 py-2 hover:bg-slate-50 data-selected:bg-brand-soft data-selected:border-brand/40"
          >
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <div className="flex flex-col">
                <span className="font-medium">{o.label}</span>
                <Description className="text-xs text-ink-3">{o.desc}</Description>
              </div>
            </Radio.Content>
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
