# REG timetable regression fixtures

These are PDF.js text/rectangle geometries from five user-supplied REG exports.
Student names, programme and identifying header text are excluded. The original
PDFs are private and are not committed.

`expected` checks each weekly slot (weekday/start/end/course/section), not just
counts. Times are estimates from the drawn frames. REG includes small drawing
offsets and frames away from half-hour boundaries; these fixtures are **not**
proof of exact registrar times. The UI always requires TA verification against
the original and permits corrections before import.

Run `npm run test:schedule-import`. To additionally exercise the complete PDF.js
reader on the five original files, set `REG_PDF_FIXTURES` to the folder containing
`repstudenttime.pdf` and `repstudenttime (1).pdf` through `(4).pdf`.

Browser regression (requires Playwright Chromium, installed with
`npx playwright install chromium`):

```sh
REG_PDF_FIXTURES=/path/to/private/pdfs npm run test:schedule-import:browser
```

For an installed Chrome instead, also set `REG_CHROME_CHANNEL=chrome`.
The browser test uses a temporary local route, removes it, and waits for Next to
regenerate route types before exiting. It covers mandatory confirmation,
minute-level corrections, invalid fields, adding/removing sessions, mismatched
semesters, stale asynchronous results, ICS compatibility, and preserving minutes
when moving/resizing a class. `REG_CAPTURE=1` optionally captures desktop/mobile
screenshots under `/tmp/reg-pdf-study/`.
