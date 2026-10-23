# AGENTS.md

The one file of project instructions for every agent. `CLAUDE.md` only imports it, so Claude Code, pi and other tools read the same text; edit this file, never `CLAUDE.md`.

Relire is a static, browser-only PWA for French close reading and pronunciation practice for TCF Canada learners (no mock exams or official scores); it is becoming **Relire Plus** (`docs/merge-plan.md`). Stack: React 19, Vite, Tailwind v4, i18next, IndexedDB, the user's own AI key called from the browser; no server of its own: the only backend is an optional read-only content service for grammar, lexicon and wordbook content (`docs/adr-hosted-content-service.md`), which never sees a key, an answer, an article or a recording (it receives only a topic id, tapped word or book id/page/version) and is never required. Bun is the only package manager.

## Hard rules

The never-do list and working agreements are in `RULES.md`.

- Every user-visible string goes through `t()` with keys in both `en.json` and `zh.json`.
- Never commit API keys; backups never contain them.
- Never invent data (fake stats, scores, AI answers); failures show the real error.
- AI calls go through `src/services/ai`; prompt wording lives in template files, never in TypeScript.
- Nothing has shipped. Until a release is documented in `CHANGELOG.md`, no data shape, route, key or behaviour is "existing": no backward-compatibility shims, legacy fallbacks or migrations for unreleased states. Change the shape and the code together.
- Solve from first principles with the smallest design (Occam). No defensive code for cases that cannot happen, no abstraction until a second real caller exists, no speculative options or config.
- Use a shadcn/ui (Base UI) component first via `bunx shadcn@latest add <name>`; write a custom component only when none exists, and compose data tables from `ui/table` and `@tanstack/react-table`.
- Controls never move the page: transient states show on the control itself or in an overlay.
- Docs, comments, commit messages and PR text are in English; Chinese only where `docs/conventions.md` allows.
- A user-noticeable change gets a `CHANGELOG.md` (Unreleased) line in the same commit.

## How to work here

- Read before you change: the files you will touch, and the docs below for the area.
- Minimal diffs. Ask before decisions that are the user's (product scope, new dependencies, a new provider, data shape after release).
- Run static/unit checks and report what was and was not verified (AI is mocked). UI visual acceptance is owner-manual only; browser automation is exceptional for critical frontend/backend, persistence or backup/restore risk not covered by unit tests, preferring an existing focused spec. No automatic UI/E2E gate; full E2E only by explicit owner request or separately justified broad integration need (see `docs/development.md`).
- Before dispatching a worker, or ruling a model out, run `magpie quota` (read-only, instant): availability changes, so never trust a reset time written in a note or an old error. Details in `docs/agent-delegation.md`.
- Develop on the designated branch. No PRs, merges or force-push unless asked, except the lead's local merge in `docs/agent-delegation.md`. Finish with `ship-change`.

## The document set

AGENTS.md is the glue: it is loaded every session and points to the rest. One file per role, each with one owner of its content. Where a role already had a file with a tool-bound or widely referenced name, that file stays (renaming `PRODUCT.md` or `DESIGN.md` breaks the design tooling; `docs/architecture.md` is linked from many docs).

| Role | File | Read it when | Updated when |
| --- | --- | --- | --- |
| What we build and for whom (PRD) | `PRODUCT.md` | scope, audience, claims to avoid | scope or audience changes |
| Stack, folders, data flow, storage | `docs/architecture.md` | touching module boundaries or data | responsibilities move |
| Colors, type, components, tokens, overlays | `DESIGN.md`, skill `verify-ui` | any UI work | tokens or components change |
| Rules: never-do list, working agreements | `RULES.md` (hard rules above; long form `docs/conventions.md`; area rules `.claude/rules/*.md`, auto-loaded) | before your first change | a rule is added or reversed |
| Small steps, one at a time | `TASKS.md` | choosing what to do next | a step starts, lands or is replaced |
| Done, broken, unverified | `PROGRESS.md` (history: `docs/merge-progress.md`, `CHANGELOG.md`) | catching up | a step lands or something breaks |
| Direction: done, next, later, deferred | `docs/roadmap.md` | planning | priorities change |
| Live session state | `docs/HANDOFF.md` (**local only**, never committed; history in `.handoffs/`) | start of a session after a reset | end of a session |

Session protocol: read this file, `RULES.md`, then `TASKS.md` and `PROGRESS.md`; work one step; run the checks and read their exit codes; update `TASKS.md`, `PROGRESS.md`, the `CHANGELOG.md` line and any doc the change touches in the same commit; end with the skill `ship-change`.

## Where to look (by task)

| Your task | Read |
| --- | --- |
| Commands, checks, ports, e2e | `docs/development.md` |
| What the hard rules mean in practice | `docs/conventions.md` |
| Merging FrenchLab AI | `docs/merge-plan.md`, then `docs/merge-progress.md` |
| Grammar pack: Part 1 verified conjugation data, Part 2 grammar topics, Part 3 framework-first conjugation (any verb, AI-filled and engine-checked), Part 4 noun-gender tendencies | `docs/grammar-pack.md` |
| Graded readers: plan, then authoring pipeline, gates G0 to G5, review flow | `docs/graded-readers-plan.md`, then `docs/graded-readers.md` |
| Hosted content service | `docs/adr-hosted-content-service.md`, `worker/README.md` |
| Adding an AI provider | skill `add-ai-provider` |
| Finishing a change | skill `ship-change` |
| Delegating to pi, agy, subagents | `docs/agent-delegation.md` |
| Launch and deployment | `docs/LAUNCH.md`, `.github/workflows/` |
