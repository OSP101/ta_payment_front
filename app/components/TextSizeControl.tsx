"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Tip } from "./ui";
import { useI18n } from "../lib/i18n/client";
import { writePrefCookie } from "../lib/preferences";
import { parseTextScale, TEXT_SCALE_COOKIE, TEXT_SCALE_EVENT, TEXT_SCALES, type TextScale } from "../lib/textScale";

export default function TextSizeControl() {
  const { t } = useI18n();
  const [scale, setScale] = useState<TextScale>(100);

  useEffect(() => {
    const sync = () => setScale(parseTextScale(document.documentElement.dataset.textScale));
    sync();
    window.addEventListener(TEXT_SCALE_EVENT, sync);
    return () => window.removeEventListener(TEXT_SCALE_EVENT, sync);
  }, []);

  function choose(next: TextScale) {
    document.documentElement.dataset.textScale = String(next);
    writePrefCookie(TEXT_SCALE_COOKIE, String(next));
    window.dispatchEvent(new Event(TEXT_SCALE_EVENT));
  }

  function step(direction: number) {
    const current = parseTextScale(document.documentElement.dataset.textScale);
    const index = Math.max(0, Math.min(TEXT_SCALES.length - 1, TEXT_SCALES.indexOf(current) + direction));
    choose(TEXT_SCALES[index]);
  }

  return (
    <div role="group" aria-label={t("ขนาดตัวอักษร")} className="flex shrink-0 items-center gap-1">
      <Tip content={t("ลดขนาดตัวอักษร")}>
      <Button type="button" variant="secondary" size="sm" isIconOnly
              aria-label={t("ลดขนาดตัวอักษร")}
              isDisabled={scale === TEXT_SCALES[0]} onPress={() => step(-1)}>
        <span aria-hidden="true" className="font-medium">A−</span>
      </Button>
      </Tip>
      <Tip content={t("คืนขนาดตัวอักษรเป็น 100%")}>
      <Button type="button" variant="secondary" size="sm" isIconOnly
              aria-label={t("คืนขนาดตัวอักษรเป็น 100%")}
              onPress={() => choose(100)}>
        <span aria-hidden="true" className="font-medium">A</span>
      </Button>
      </Tip>
      <Tip content={t("เพิ่มขนาดตัวอักษร")}>
      <Button type="button" variant="secondary" size="sm" isIconOnly
              aria-label={t("เพิ่มขนาดตัวอักษร")}
              isDisabled={scale === TEXT_SCALES[TEXT_SCALES.length - 1]} onPress={() => step(1)}>
        <span aria-hidden="true" className="font-medium">A+</span>
      </Button>
      </Tip>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {t("ขนาดตัวอักษร {scale}%", { scale })}
      </span>
    </div>
  );
}
