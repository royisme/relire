# CLAUDE.md

Relire is a static, browser-only PWA for French close reading and pronunciation practice, aimed at learners preparing for TCF Canada (no mock exams or official scores). It is becoming **Relire Plus** by absorbing the FrenchLab AI workbook (exercises including dictation and AI-graded writing, material import, mistake notebook); follow `docs/merge-plan.md` for that work. React 19 + Vite + Tailwind v4 + i18next, IndexedDB for data, the user's own AI key called straight from the browser. There is no server.

This file holds only what applies to every task. Everything else is loaded when needed (see "Where to look").

## Commands

Bun is the only package manager.

- `bun install` · `bun run dev` (Vite on :5173) · `bun run build` (static site in `dist/`, with the PWA service worker) · `bun run preview`
- `bun run typecheck`: `tsc --noEmit`
- `bun run lint`: oxlint, type-aware, with the React Hooks rules; warnings fail (`bun run lint:fix` applies safe fixes)
- `bun run format` / `bun run format:check`: oxfmt is the only formatter (CI checks it); Markdown, prompt templates and `marketing/` are left as written
- `bun run i18n:check`: keys exist in both locales, locales match, no hard-coded Chinese in components (CI runs it)
- `impeccable detect --json src index.html`: UI anti-pattern detector; keep it at `[]`
- `bun run e2e`: Playwright specs in `e2e/` drive the real app in installed Chrome with every AI call mocked (`e2e/fixtures.ts`); `bun scripts/check-prosody-schema.ts` guards the marker parser. Cover UI changes with a spec (`verify-ui` skill).

## Always

- Every user-visible string goes through `t()` with keys in both `en.json` and `zh.json`.
- Never commit API keys; backups never contain them. Keys live only in the user's browser.
- Never invent data (sample stats, fake scores, fallback AI answers). Empty means empty; failures show the real error.
- AI calls go through `src/services/ai`; prompt wording lives in template files, never in TypeScript.
- Controls never move the page: transient states show on the control itself or in an overlay.
- Technical documentation, code comments, commit messages and PR text are in English. Chinese lives only in `locales/zh.json`, the `*.zh.txt` prompts, `README.zh-CN.md` and `marketing/zh/`.
- Every change a user could notice gets a line in `CHANGELOG.md` (Unreleased) in the same commit.

## How to work here

- Read before you change: the files you will touch, and the docs below for the area.
- Keep diffs minimal and on-topic. Ask before decisions that are the user's (product scope, new dependencies, a new provider, data shape after release).
- Prove it works before saying so: run the checks, and for UI drive the app (`verify-ui`). Report what was and was not verified; AI responses in checks are mocked.
- Develop on the designated branch. Do not open PRs, merge or force-push unless asked. Finish with the `ship-change` skill.

## Where to look

| When you need… | Read |
| --- | --- |
| What the product is for, who it serves, what it must not claim | `PRODUCT.md` |
| Merging FrenchLab AI: decisions, target screens, storage, phases | `docs/merge-plan.md` |
| Visual system: tokens, type, spacing, overlays | `DESIGN.md` |
| Which module owns what, data flow, storage lifetimes | `docs/architecture.md` |
| Area rules (UI, AI layer, storage, speech, i18n, marketing site, TypeScript style) | `.claude/rules/*.md`, loaded automatically when you open matching files |
| Checking a change in the browser | skill `verify-ui` |
| Adding an AI provider | skill `add-ai-provider` |
| Finishing a change (checks, changelog, commit, report) | skill `ship-change` |
| Launch and deployment notes | `docs/LAUNCH.md`, `.github/workflows/` |
