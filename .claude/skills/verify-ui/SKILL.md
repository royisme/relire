---
name: verify-ui
description: Check a Relire UI change in headless Chromium with every AI call answered from fixtures (no key, no network) - layout shift, 360 px overflow, flows like lookup, playback, recording and scoring. Use after changing anything under src/components, src/hooks or src/utils/speech, and before saying a UI change works.
---

# Verify a UI change in the browser

Type checks do not prove a screen works. Drive the real app, with the AI mocked, and assert what the user would see.

## Setup (once per session)

1. Start the app: `bun run dev` (port 5173) in the background. If a server is already on the port, reuse it. Stop servers by port (`kill $(lsof -t -i:5173)`), never with `pkill -f`, which can kill your own shell.
2. Make a scratch folder outside the repo, install `playwright-core` there and copy the harness:
   ```sh
   mkdir -p "$SCRATCH/vui" && cd "$SCRATCH/vui"
   echo '{"type":"module"}' > package.json && bun add playwright-core
   cp <repo>/.claude/skills/verify-ui/{harness,example}.mjs .
   ```
   Do not add Playwright to the repo's dependencies. The harness finds Chromium via `CHROME_PATH`, else `$PLAYWRIGHT_BROWSERS_PATH/chromium-*`; never run `playwright install`.
3. Run `node example.mjs http://localhost:5173` once; it should print `ALL PASS`.

## Writing a check

Copy `example.mjs` and keep it in the scratch folder (checks are throwaway, not committed). `harness.mjs` gives you:

- `openApp({ url, viewport, touch, fixtures, fail, ttsDelayMs, mic })`: opens the app onboarded with a test key. Every AI request is answered from `fixtures` (`word`, `sentence`, `drills`, `pronunciation`; defaults in the harness), chosen by the prompt text. Put long strings in fixtures to test wrapping. `fail: ['sentence']` makes that task return 500; `setFail([...])` changes it later. `ttsDelayMs` keeps clips in the loading state long enough to observe. `mic: true` gives a fake microphone. Returns `calls` (request counts per task).
- `layout(page, selector)`: page height and an element's top; compare before, during and after an action to prove nothing moved.
- `overflowing(locator)`: descendants that stick out horizontally; must be empty.
- `checks()`: `check(name, ok, detail)` and `report()`.

Task detection reads the English prompts. Keep the UI in English for checks (the default in headless Chromium) or extend `taskOf` in the harness.

## What to check for a typical change

- At 360×740 (touch) and 1280×900: no horizontal overflow on the screens you touched, with long content.
- Transient states (loading, playing, recording, errors) do not change page height or move the content above and below.
- The flow end to end: the happy path, a failed AI call (error shown inline with the real reason), and repeating or cancelling the action.
- Take screenshots of the states you changed (`page.screenshot`) and look at them before reporting.

## Prove the check

When fixing a bug, run the same check on the old code first (`git stash`, run, `git stash pop`) and show it fails; a check that passes on both versions proves nothing. Write screenshots to the scratch folder, never into the repo, or the stash will collide with them.

## Report

Say what was checked, at which sizes, and that AI responses were mocked. Never claim the real provider was exercised.
