# RULES

What an agent (or a person) must never do in this repository, and the working agreements that keep a change reviewable. The ten **hard rules** are in `AGENTS.md` (loaded every session); their long form is `docs/conventions.md`; area rules are `.claude/rules/*.md`. This file adds the prohibitions and the process, so nothing here repeats those.

## Never

**Secrets and private content**
- Never commit an API key, a `.env` file, `worker/.dev.vars` or anything under `.local/`. Private drafts (grammar topic text, graded-reader text, normalized wordbook) live in gitignored `.local/` and reach users only through the content service. Reader text appears in no issue, PR, changelog line or commit message.
- Never read `.env` or `worker/.dev.vars` from a worker; never print a key.

**Invented or overstated facts**
- Never invent data: no fake stats, scores, AI answers, review records or provenance. A failure shows the real error.
- Never write "reviewed", "verified" or "human-reviewed" for content that only passed machine gates or an AI review. AI review records carry the `AI review:` prefix (`scripts/graded-readers/review.ts --kind`); a worker never marks a review.
- Never report a check as passing without reading its exit code. A passing test run says nothing about typecheck or lint.
- Never claim the real AI provider, a real device, a real microphone, a browser or a deployed service was exercised when it was mocked or not run.

**Scope and shape**
- Never add compatibility shims, migrations, legacy fields or fallbacks for an unreleased state (`AGENTS.md`).
- Never add an abstraction before a second caller, a flag, an option or a dependency nobody asked for. Ask first for product scope, a new dependency, a new provider, or a data shape after release.
- Never edit a generated artifact by hand, or hand-format with prettier (the formatter is oxfmt). Do not use `sed -i` (it silently does nothing under the output wrapper); use the edit tool.
- Never put prompt wording in TypeScript, a user-visible string outside `t()`, or Chinese outside the places `docs/conventions.md` allows.

**Git and environment**
- Never `git add` a bare directory in a worktree: worktrees hold `node_modules` symlinks that `.gitignore`'s `node_modules/` does not match. Add explicit paths, or `git add -u` plus named new files, and read `git show --stat` before merging.
- Never run `rm -rf` on a `node_modules` that may be a symlink; never run `bun install` or touch the network from a worker.
- Never push, open a PR, merge to `main` or force-push unless the owner asks (the lead's local merges into the working branch excepted: `docs/agent-delegation.md`). Never bypass the pre-commit hook.
- Never stop, rebind or reset the owner's servers on 5173 and 8787, or start a second browser/e2e run (`docs/development.md`).

**Delegation**
- Never dispatch a worker, or rule a model out, without running `magpie quota` first.
- Never let the author of a piece of content also be its independent reviewer: authors and reviewers come from different model families.
- Never trust a worker's report: re-run every check, read the diff, read the exit codes, then merge.

## Working agreements

- **One small step at a time** (`TASKS.md`). A step has an acceptance line; it is done when the checks pass and the lead has read the diff.
- **Read before you change**: the files you will touch and the document for the area (`AGENTS.md` map).
- **Verification report**: say what ran, what did not, and what the owner must check by hand (visual acceptance, real devices, real keys).
- **Platform before content** (owner, 2026-10-23): framework and features first; copy, glosses and learning content are versioned data that can be revised later. Do not spend review rounds on wording while a platform task is open.
- **Content honesty**: content shown to learners is labelled with what checked it. A beginner cannot catch an error, so a human language review is the release gate for beginner content.
- **Docs move with the code**: user-noticeable change → `CHANGELOG.md` line in the same commit; module responsibilities → `docs/architecture.md`; an area rule → its `.claude/rules/*.md`; finished work → `PROGRESS.md`; the next step → `TASKS.md`.
