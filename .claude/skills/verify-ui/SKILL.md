---
name: verify-ui
description: Check a Relire UI change with the committed Playwright e2e suite, every AI call answered from fixtures (no key, no network) - layout shift, 360 px overflow, flows like lookup, playback, recording, scoring and pronunciation markers. Use after changing anything under src/components, src/hooks or src/utils/speech, and before saying a UI change works.
---

# Verify a UI change in the browser

Type checks do not prove a screen works. Drive the real app, with the AI mocked, and assert what the user would see. Checks live in `e2e/` and are committed, so the next change re-runs them.

## Run

```sh
bun run e2e                          # all specs; starts Vite on :5174 or reuses it
bunx playwright test e2e/prosody.spec.ts -g "misspells"   # one spec / one test
bunx playwright show-report          # HTML report, traces and screenshots of failures
```

It uses the installed Google Chrome (`channel: 'chrome'`), or `CHROME_PATH` if set. Never run `playwright install`. Output goes to `test-results/` and `playwright-report/` (git-ignored).

## Writing a check

Import from `e2e/fixtures.ts`, not from `@playwright/test`:

- `test('…', async ({ page, ai }) => …)`: the `ai` fixture onboards the app with a fake key and answers every Gemini request by task (`word`, `sentence`, `pronunciation`, `prosody`, `exercises`, `hint`, `explain`, `grade`, chosen from the shipped prompt text). `ai.answer({ prosody: (prompt) => … })` replaces an answer (an object or a function of the prompt), `ai.fail(['sentence'])` makes a task return 500, `ai.ttsDelayMs` slows speech to observe loading states. `ai.calls` counts requests and `ai.prompts` keeps their text. The provider's model fallback sends several requests for one failing call, so assert on prompts (which sentence), not raw counts.
- `openArticle(page, title)`, `layout(page, selector)` (page size and an element's top: compare before and after an action to prove nothing moved), `overflowing(locator)` (must be `[]`), `prosodyTokens(prompt)` / `prosodySentence(prompt)`.
- Tests tagged `@phone` in their title run only at 360×740 with touch; the rest run at 1280×900.

The default prosody answer is source-addressed and unresolved: no invented phonetic data. Only the built-in function-word table resolves words; supply an explicit answer for anything else you assert.

## What to check for a typical change

- At 360×740 (`@phone`) and 1280×900: no horizontal overflow on the screens you touched, with long content.
- Themes: set `localStorage.relire_theme` to `light`, `sepia` or `dark` in `page.addInitScript`, then look at screenshots (`page.screenshot({ path: test.info().outputPath('x.png') })`).
- Transient states (loading, playing, recording, errors) do not change page height or move the content above and below.
- The flow end to end: the happy path, a failed AI call (error shown inline with the real reason), and repeating or cancelling the action. For exercise sheets, cover answer/check, help, Enter/IME, saved drafts and reset keeping history; unsupported controls remain placeholders.

## Prove the check

When fixing a bug, make the spec fail on the broken behaviour first (old code via `git stash`, or temporarily reintroduce the bug) and show it; a check that passes on both versions proves nothing.

## Report

Say which specs ran, at which sizes, and that AI responses were mocked. Never claim the real provider was exercised.
