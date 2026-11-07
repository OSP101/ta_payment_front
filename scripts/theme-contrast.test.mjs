import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Check rendered colour roles, not individual component class lists. The browser
// audit additionally covers palette utilities, alpha blending and HeroUI states.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const dark = css.match(/^\.dark \{([\s\S]*?)^\}/m)?.[1];
assert.ok(dark, 'The dark theme must define its own colours');
const tokens = Object.fromEntries([...dark.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
function rgb(name) {
  const value = name.startsWith('#') ? name : tokens[name];
  assert.ok(value, `Missing colour ${name}`);
  if (value.startsWith('var(')) return rgb(value.slice(4, -1));
  assert.match(value, /^#[\da-f]{6}$/i, `${name} must resolve to an opaque sRGB colour`);
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
}
function luminance(name) {
  return rgb(name).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(fg, bg, min) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => x - y);
  const ratio = (b + 0.05) / (a + 0.05);
  assert.ok(ratio >= min, `${fg} on ${bg}: ${ratio.toFixed(2)}:1; expected at least ${min}:1`);
}
const surfaces = ['--page-bg', '--panel-bg', '--surface-secondary', '--surface-tertiary', '--field-background'];
test('All body text roles remain readable on every screen surface', () => {
  for (const fg of ['--ink-1', '--ink-2', '--ink-3', '--ink-4', '--link', '--tone-brand-ink', '--tone-muted-ink', '--danger-soft-foreground', '--success-soft-foreground', '--warning-soft-foreground', '--color-blue-700', '--color-purple-700']) {
    for (const bg of surfaces) contrast(fg, bg, 4.5);
  }
});
test('Primary buttons and their hover state support white text', () => {
  for (const bg of ['--brand', '--brand-hover', '--danger']) contrast('#ffffff', bg, 4.5);
});
test('Field boundaries and keyboard focus are visible on every surface', () => {
  for (const bg of surfaces) {
    contrast('--border-strong', bg, 3);
    contrast('--focus', bg, 3);
  }
});
test('The canvas, panels and raised surfaces form distinct ordered layers', () => {
  const layers = ['--page-bg', '--panel-bg', '--surface-secondary', '--surface-tertiary'].map(luminance);
  for (let i = 1; i < layers.length; i++) assert.ok(layers[i] > layers[i - 1] * 1.3);
});
test('All timetable duty colours pair readable text with their dark fill', () => {
  for (const kind of ['own-class', 'lecture', 'lab', 'review']) contrast(`--duty-${kind}-fg`, `--duty-${kind}-bg`, 4.5);
});
test('Chart series remain visible against the report panel', () => {
  for (const name of Object.keys(tokens).filter(k => k.startsWith('--chart-'))) contrast(name, '--panel-bg', 3);
});
