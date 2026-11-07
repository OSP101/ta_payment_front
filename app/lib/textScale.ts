// Browser-specific: a comfortable size depends on the screen being used.
export const TEXT_SCALE_COOKIE = "ui_text_scale";
export const TEXT_SCALE_EVENT = "ui-text-scale-change";
export const TEXT_SCALES = [90, 100, 110, 120, 130, 140, 150] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export function parseTextScale(value: unknown): TextScale {
  return TEXT_SCALES.find(scale => String(scale) === value) ?? 100;
}
