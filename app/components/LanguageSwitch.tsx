"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { useI18n } from "../lib/i18n/client";
import { isLocale, type Locale } from "../lib/i18n/core";
import { setLocalePref } from "../lib/preferences";

// Each language is named in itself, so the way back is readable from either side.
const OPTIONS: { id: Locale; short: string; label: string }[] = [
  { id: "th", short: "TH", label: "ไทย" }, // i18n-ignore — each language is named in itself
  { id: "en", short: "EN", label: "English" },
];

/**
 * ไทย / English. Saves like the theme (account + cookie), then re-renders
 * from the server, which is where the words and the dictionary come from.
 */
export default function LanguageSwitch({
  signedIn,
  showLabels = false,
  size = "sm",
}: {
  signedIn: boolean;
  showLabels?: boolean;
  size?: "sm" | "md";
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(keys: Set<Key>) {
    const next = [...keys][0];
    if (!isLocale(next) || next === locale) return;
    void setLocalePref(next, signedIn).then(() => start(() => router.refresh()));
  }

  return (
    <ToggleButtonGroup
      aria-label={t("ภาษา")}
      selectionMode="single"
      disallowEmptySelection
      size={size}
      isDisabled={pending}
      selectedKeys={new Set<Key>([locale])}
      onSelectionChange={choose}
    >
      {OPTIONS.map(({ id, short, label }, i) => (
        <ToggleButton key={id} id={id} aria-label={label} lang={id}>
          {i > 0 && <ToggleButtonGroup.Separator />}
          {showLabels ? label : short}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
