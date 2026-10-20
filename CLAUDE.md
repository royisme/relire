# CLAUDE.md

Relire is a static, browser-only PWA for French close reading and pronunciation practice for TCF Canada learners (no mock exams or official scores); it is becoming **Relire Plus** (`docs/merge-plan.md`). Stack: React 19, Vite, Tailwind v4, i18next, IndexedDB, the user's own AI key called from the browser; no server of its own: the only backend is an optional read-only content service for grammar, lexicon and wordbook content (`docs/adr-hosted-content-service.md`), which never sees a key, an answer, an article or a recording (it receives only a topic id, tapped word or book id/page/version) and is never required. Bun is the only package manager.

## Hard rules

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
- Prove it works and report what was and was not verified (AI in checks is mocked). Visual acceptance is manual: no screenshot gates unless asked.
- Develop on the designated branch. No PRs, merges or force-push unless asked, except the lead's local merge in `docs/agent-delegation.md`. Finish with `ship-change`.

## Where to look

| Your task | Read |
| --- | --- |
| Commands, checks, ports, e2e | `docs/development.md` |
| What the hard rules mean in practice | `docs/conventions.md` |
| Files in an area (UI, AI, storage, speech, i18n, marketing, TS) | `.claude/rules/*.md`, auto-loaded |
| Product intent, audience, claims to avoid | `PRODUCT.md` |
| UI work: tokens, type, spacing, overlays | `DESIGN.md`, skill `verify-ui` |
| Module ownership, data flow, storage | `docs/architecture.md` |
| What is done, next, later and deferred | `docs/roadmap.md` |
| Merging FrenchLab AI | `docs/merge-plan.md`, then `docs/merge-progress.md` |
| Grammar pack: Part 1 verified conjugation data, Part 2 grammar topics, Part 3 framework-first conjugation (any verb, AI-filled and engine-checked), Part 4 noun-gender tendencies | `docs/grammar-pack.md` |
| Adding an AI provider | skill `add-ai-provider` |
| Finishing a change | skill `ship-change` |
| Delegating to pi, agy, subagents | `docs/agent-delegation.md` |
| Launch and deployment | `docs/LAUNCH.md`, `.github/workflows/` |
