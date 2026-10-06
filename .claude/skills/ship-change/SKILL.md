---
name: ship-change
description: The checklist for finishing a change in Relire - checks, changelog, docs, commit, push, and how to report. Use before every commit and when the user asks to commit, push or open a PR.
---

# Ship a change

## 1. Checks (all must pass)
```sh
bun run lint
bun run i18n:check
bun run build
impeccable detect --json src index.html   # must print []
```
For UI changes, also run a browser check (`verify-ui` skill). There are no unit tests; do not claim tests ran.

## 2. Re-read your diff
- Unrelated edits, debug output, screenshots or scratch files in the repo? Remove them.
- New strings in both locale files? Keys you stopped using removed?
- Anything a user could notice gets a line in `CHANGELOG.md` under Unreleased (Added / Changed / Fixed / Removed), in the same commit, saying what the user gets, not which files moved.
- If you moved responsibilities between modules, update `docs/architecture.md`; if you changed an area rule, update the matching `.claude/rules/*.md`.

## 3. Commit and push
- Work on the designated feature branch. If its PR was already merged, restart the branch from the latest `main` and keep only unmerged commits.
- One commit per coherent change, with a message that explains why. End it with the attribution lines the session asks for.
- `git push -u origin <branch>`; retry network failures with backoff.
- Do not open a PR, merge, or force-push someone else's branch unless the user asks.

## 4. Report
- Lead with what changed for the user, then what was verified and how (mocked AI, which viewport sizes), then anything not verified or left for the user.
- Failures are reported as failures, with the output.
