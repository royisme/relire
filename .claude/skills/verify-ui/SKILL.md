---
name: verify-ui
description: Review a Relire UI change with static/unit checks and owner-manual visual acceptance. Browser automation is exceptional for necessary critical integration or persistence risks, not a UI delivery gate.
---

# Verify a UI change

Run the normal static/unit checks in `ship-change`; use unit tests for logic. Visual acceptance belongs only to the owner, manually. Do not add or run E2E just because a screen changed, or require theme/viewport/focus/animation/screenshot assertion matrices. Meaningful normal motion remains part of the UI; reduced-motion accessibility is a separate concern, not a blanket animation ban.

## Decide whether a browser check is necessary

Browser automation is exceptional and risk-based (owner decision 2026-10-20): necessary critical flows across frontend/backend, browser persistence or backup/restore that unit tests cannot adequately cover. State the uncovered risk first. Prefer an existing focused spec; extend coverage only when that necessary risk has no adequate check. Do not transplant UI-only assertions to another harness or sweep-delete unrelated legacy tests. Full E2E needs an explicit owner request or separately justified broad integration need, never a default batch/phase gate.

Workers run no browsers or servers unless explicitly authorized. See `docs/agent-delegation.md`.

## Run only when justified and authorized

First `lsof -iTCP:5174 -sTCP:LISTEN` must print nothing. If busy, stop; never reuse or kill the listener. Then run one focused command, for example:

```sh
CI=1 bunx playwright test e2e/vocabulary-review.spec.ts -g "Words review commits"
```

One run at a time across checkouts. Playwright starts its own Vite on :5174; do not start a second server. Preserve owner servers on 5173/8787. Use installed Chrome (`CHROME_PATH` if set); never run `playwright install`. Output goes to ignored `test-results/` and `playwright-report/`; existing failure artifacts are diagnostic, not visual acceptance gates.

## Maintain a necessary check

Import `test` and `expect` from `e2e/fixtures.ts`, not `@playwright/test`. The fixture mocks every AI request with synthetic content; no real key/provider/content is exercised. Use stable semantic selectors and assert the critical outcome, including persistence or failure/retry where relevant, rather than CSS timing or geometry. Keep existing storage/service boundary evidence.

For regression logic, prefer a focused unit test that demonstrates the broken behavior before the fix. Do not stash user work or deliberately mutate unrelated code to manufacture red proof.

## Report

Say which static/unit checks ran, which browser checks (if any) were justified and authorized, that AI was mocked, and what was not run. Never inherit a pass from an earlier run or claim owner visual acceptance on the owner's behalf.
