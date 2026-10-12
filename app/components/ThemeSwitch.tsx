"use client";
import { useEffect, useState } from "react";
import { ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tip } from "./ui";
import { msg, useI18n } from "../lib/i18n/client";
import { currentThemePref, isThemePref, setThemePref, THEME_EVENT, type ThemePref } from "../lib/preferences";

const OPTIONS: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: msg("สว่าง"), Icon: Sun },
  { id: "dark", label: msg("มืด"), Icon: Moon },
  { id: "system", label: msg("ตามอุปกรณ์"), Icon: Monitor },
];

/**
 * Light / dark / follow-the-device. Shows whatever <html> says is in force
 * (app/layout.tsx already chose between the account and the cookie), and
 * follows changes made by any other ThemeSwitch on the page. `showLabels`
 * spells the choices out (the account page); otherwise icons with tooltips
 * (the header menu, the login page).
 */
export default function ThemeSwitch({
  signedIn,
  showLabels = false,
  size = "sm",
}: {
  signedIn: boolean;
  showLabels?: boolean;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(currentThemePref());
    const on = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  function choose(keys: Set<Key>) {
    const next = [...keys][0];
    if (!isThemePref(next) || next === pref) return;
    setPref(next);
    void setThemePref(next, signedIn);
  }

  return (
    <ToggleButtonGroup
      aria-label={t("ธีมการแสดงผล")}
      selectionMode="single"
      disallowEmptySelection
      size={size}
      selectedKeys={new Set<Key>([pref])}
      onSelectionChange={choose}
    >
      {OPTIONS.map(({ id, label, Icon }, i) =>
        showLabels ? (
          <ToggleButton key={id} id={id}>
            {i > 0 && <ToggleButtonGroup.Separator />}
            <Icon className="size-4" />
            {t(label)}
          </ToggleButton>
        ) : (
          <Tip key={id} content={t(label)}>
            <ToggleButton id={id} isIconOnly aria-label={t(label)}>
              {i > 0 && <ToggleButtonGroup.Separator />}
              <Icon className="size-4" />
            </ToggleButton>
          </Tip>
        ),
      )}
    </ToggleButtonGroup>
  );
}
