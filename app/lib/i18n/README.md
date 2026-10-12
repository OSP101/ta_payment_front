# Interface language (ไทย / English)

The Thai text is the key. `t("ออกจากระบบ")` returns the English from
`messages/en.json` for English readers and the Thai itself otherwise (and for
anything not translated yet). Thai readers load no dictionary.

## Which function where

| Where | Use |
|---|---|
| Client component (`"use client"`) | `const { t, fmtDate, intl, locale } = useI18n();` from `app/lib/i18n/client` |
| Server component / layout / metadata | `const { t, fmtDate, intl } = await getT();` from `app/lib/i18n/server` |
| Constants, maps, helpers outside components | wrap the Thai in `msg("…")`, then `t(value)` where it is rendered |
| Non-component browser code (event handlers in plain modules, api.ts, confirm()) | `tc("…")` from client |

## Rules

1. Every Thai string a reader can see or hear goes through `t()` — JSX text,
   button labels, `aria-label`, placeholders, tooltips (`Tip content`), toast
   text, `confirm()` text, table headers, empty states, document titles.
2. **No template literals as keys.** Use placeholders:
   `` `เหลือ ${h} ชม.` `` → `t("เหลือ {h} ชม.", { h })`.
   Keep the whole sentence as ONE key so English word order can differ; never
   split a sentence into fragments.
3. A sentence with markup inside (bold, links, chips): `t.rich("ส่งให้ {name} แล้ว", { name: <b>{n}</b> })`.
4. Dates: replace `thaiDate(x)` with `fmtDate(x)`; replace the `"th-TH"`
   argument of `toLocaleDateString`/`toLocaleString`/`Intl.*` with `intl`.
   Month name tables → `monthName(m)`; a calendar year shown as BE (`y + 543`)
   → `year(y)`. Academic-year labels (2569, 2569/1) are identifiers — leave them.
5. Thai that is DATA, not text for a reader, stays as is and gets
   `// i18n-ignore` at the end of the line (or `// i18n-ignore-next-line` above):
   values sent to the API, strings compared against backend text, regexes over
   Thai input, print-only official forms that must stay Thai. Comments are fine
   as they are.
6. People's names, course names, announcement bodies, anything users typed:
   never translate.
7. Do not change behaviour. Only wrap text. Keep layout, classes, logic.
8. Hooks rules: call `useI18n()` at the top of each component that needs it
   (each sub-component in the file too). Non-component helper functions that
   return Thai text: return `msg("…")` keys and translate at the call site, or
   take `t` as a parameter.

## One Thai word, two meanings

Add a context suffix: `t("ปิด@state")` is its own dictionary entry ("Off")
while plain `t("ปิด")` stays "Close". Thai readers see the word without the
suffix. Use it only when the same Thai genuinely needs different English.

## Translations

Write the English for every key you add to `messages/parts/<batch>.json` —
a flat `{ "Thai key": "English" }` object, placeholders kept identical
(`{h}` stays `{h}`). Follow `GLOSSARY.md`. Then:

    node scripts/i18n-check.mjs <your files>   # 0 unwrapped is the goal
    node scripts/i18n-check.mjs --keys <your files>   # every key you used

`node scripts/i18n-merge.mjs` folds the parts into `messages/en.json`.
