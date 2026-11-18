# TA request notebook

The real request page uses an editable headcount, one visible TA workload page at a time, and a final summary from the existing planner's estimates. The planner retains budget, workload, track, and compensation details. Its suggested headcount never sets the form's minimum or maximum.

Copying uses the open TA, leaves the new name blank, and opens the new page. Reducing headcount confirms removal of draft data. Applying a plan previews replacement and can restore the preceding entries. Existing validation, request payloads, server drafts, and submit APIs remain in use.

## Try locally

```sh
npm run dev:request-playground
```

Open http://localhost:3330/dev/request-preview. This runs the actual request page against an isolated in-memory API on port 3331. No database, real accounts, email, or production submissions are involved. Refresh preserves the server draft while the process runs; stopping the process resets the fixtures. Change ports with `REQUEST_PLAYGROUND_PORT` and `REQUEST_PLAYGROUND_API_PORT`.

The preview route returns 404 unless both development mode and `REQUEST_PLAYGROUND=1` are enabled. The launcher sets the flag and binds both servers to loopback. Outside this preview, use the regular authenticated lecturer course request route and the normal backend.

## Verification

With the playground running:

```sh
npm run test:request-form:browser
npx tsc --noEmit
```

The browser test covers switching pages, copying the active TA, editable headcount, removal cancellation/confirmation, draft reload, applying/undoing a plan, blocking conflicts on inactive pages, the actual submit payload, and mobile overflow. It validates the isolated API marker before writing test data. This fixture exercises UI flows; it does not replace the backend's validation or approval rules.

The workload guide is available from the form header, section selector, workload fields, and optional planner. Its five topics explain weekly duties, per-section assignments, automatic worklogs, and editable suggestions. Run `npm run test:request-guide:browser` with the playground running to check contextual opening, tab navigation, closing/focus return, mobile layout, and preservation of draft values. This test intercepts draft data within its browser context and does not overwrite the playground user's draft.

On each visit, the guide now opens automatically unless the signed-in account has opted out in this browser. Mandatory mode requires opening all five topics before confirming; Escape, backdrop clicks, and the close trigger cannot bypass it. Only confirming with the opt-out checkbox checked writes `ta-payment:request-guide:v1:<user-id>` to localStorage. Declining to opt out shows the guide again on the next visit. Manual help stays available after opting out. The preference is local to the account and browser, not synced across devices. Run `npm run test:request-guide-gate:browser` for the mandatory tutorial and preference lifecycle.

The guide footer has a single primary action: Next on topics 1–4 and Got it on the last topic. The optional suppression checkbox appears only on the last topic. Jumping directly to that topic does not enable confirmation or the checkbox until every topic has been opened.

The Edit / cancel topic explains that submitted requests must be cancelled per TA and resubmitted, points to the cancel icon beside View details in the history table below the form, and names the confirmation and re-entry actions. It explains the appointment-letter lock and the existing worklog/payment-document restrictions. The suggested-plan topic remains last, with the opt-out checkbox appearing there only.
