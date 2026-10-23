---
name: ship-change
description: The checklist for finishing a change in Relire - checks, changelog, docs, commit, push, and how to report. Use before every commit and when the user asks to commit, push or open a PR.
---

# Ship a change

## 1. Checks (all must pass)
```sh
bun run typecheck
bun run lint                              # oxlint, warnings fail
bun run format:check                      # run `bun run format` first
bun run test                              # unit tests in tests/: grading, contracts, import drafts, taxonomy
bun run i18n:check
bun run build
bun scripts/check-prosody-schema.ts       # when markers, the prosody prompt or its parser changed
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html   # must print [] (not on PATH; use this launcher)
```
Static/unit checks are the normal gate (owner decision 2026-10-20). UI visual acceptance belongs only to the owner, manually; no automatic UI/E2E gate or theme/viewport/focus/animation/screenshot assertion matrix. Browser automation is exceptional for necessary critical frontend/backend, browser persistence or backup/restore risk not covered by units. Prefer an existing focused spec; add coverage only for a necessary uncovered risk (`verify-ui`). Full E2E only on explicit owner request or separately justified broad integration need, never a default batch/phase gate. Preserve unrelated legacy coverage.

Workers run no browsers/servers unless explicitly authorized. Any authorized browser run requires `lsof -iTCP:5174 -sTCP:LISTEN` to print nothing first, then `CI=1` and one run at a time across checkouts; stop if busy, never reuse/kill the listener or start a second server. Preserve owner servers on 5173/8787. Report which checks ran and what was not run; AI is mocked, never claim the real provider was exercised.

## 2. Re-read your diff
- Unrelated edits, debug output, screenshots or scratch files in the repo? Remove them.
- New strings in both locale files? Keys you stopped using removed?
- Anything a user could notice gets a line in `CHANGELOG.md` under Unreleased (Added / Changed / Fixed / Removed), in the same commit, saying what the user gets, not which files moved.
- If you moved responsibilities between modules, update `docs/architecture.md`; if you changed an area rule, update the matching `.claude/rules/*.md`.
- Update `TASKS.md` (the step that landed leaves the queue, the next one is named) and `PROGRESS.md` (what is done, what broke, what is still unverified). `docs/HANDOFF.md` is local only; sync it with the handoff skill, never commit it.

## 3. Commit and push
- Work on the designated feature branch. If its PR was already merged, restart the branch from the latest `main` and keep only unmerged commits.
- One commit per coherent change, with a message that explains why. End it with the attribution lines the session asks for.
- `git push -u origin <branch>`; retry network failures with backoff.
- Do not open a PR, merge, or force-push someone else's branch unless the user asks.

## 4. Report
- Lead with what changed, then what was verified and how (mocked AI; any risk-justified focused spec), then checks not run and owner-manual visual acceptance still pending.
- Failures are reported as failures, with the output.
