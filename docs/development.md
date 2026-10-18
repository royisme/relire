# Development: commands and checks

Bun is the only package manager. The delivery checklist (which checks must pass, changelog, commit, report) belongs to the `ship-change` skill (`.claude/skills/ship-change/SKILL.md`); this page only says what each command does.

## Run and build

- `bun install`
- `bun run dev`: Vite on :5173.
- `bun run build`: static site in `dist/`, with the PWA service worker.
- `bun run preview`: serve the built site.

## Static checks

- `bun run typecheck`: `tsc --noEmit`.
- `bun run lint`: oxlint, type-aware, with the React Hooks rules; warnings fail. `bun run lint:fix` applies safe fixes.
- `bun run format` / `bun run format:check`: oxfmt is the only formatter (CI checks it). Markdown, prompt templates and `marketing/` are left as written.
- `bun run i18n:check`: keys exist in both locales, the locales match, and no hard-coded Chinese is in components (CI runs it). See `.claude/rules/i18n.md` and `docs/conventions.md`.

## Tests

- `bun run test`: `bun test` over `tests/`. Pure logic only: exercise contracts, grading, import drafts, taxonomy. Playwright specs in `e2e/` are separate.
- `bun run e2e`: Playwright specs in `e2e/` drive the real app in installed Chrome with every AI call mocked (`e2e/fixtures.ts`). Playwright starts its own Vite server on :5174 (`playwright.config.ts`), so only one e2e run can own that port at a time. Cover UI changes with a spec; how to write and run one is in the `verify-ui` skill (`.claude/skills/verify-ui/SKILL.md`). Who runs e2e when work is delegated: `docs/agent-delegation.md`. Run it at integration milestones (when a feature batch or phase is assembled), not after every unit of work: units are gated by `bun run test`, typecheck, lint, format, i18n and build (owner decision 2026-10-18).
- `bun scripts/check-prosody-schema.ts`: guards the prosody marker parser. Run it when markers, the prosody prompt or its parser change.
- `bun scripts/check-import-material.ts` and `bun scripts/check-import-workspace.ts`: production smoke checks for material import (local image/PDF rendering, offline resources), in installed Chrome with no AI. `check-import-material.ts` is described in `docs/architecture.md`; the first line of each script says what it covers.

## UI anti-pattern detector

`impeccable detect --json src index.html` must print `[]`. The CLI is not on PATH; run it through its launcher:

```sh
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html
```
