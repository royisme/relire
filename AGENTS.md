# AGENTS.md

Repository rules for contributors and AI coding agents. `CLAUDE.md` only imports this file, so every tool reads the same text.

Relire is a static, browser-only PWA for French close reading and pronunciation practice for TCF Canada learners (no mock exams or official scores). Stack: React 19, Vite, Tailwind v4, i18next, IndexedDB, the user's own AI key called from the browser. There is no server of its own: the only backend is an optional read-only content service (`worker/`) for grammar topics, the wordbook and graded readers; it never sees an AI key, an answer, an article or a recording. Bun is the only package manager.

Read `README.md` for what the app does, `PRODUCT.md` for who it is for and what not to claim, and `DESIGN.md` before any UI work.

## Commands

- `bun install`, `bun run dev` (Vite), `bun run build`.
- Checks: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run i18n:check`, `bun run format:check`, `bun run shape:check` (500 lines per file at most).
- `bun run e2e` runs the Playwright specs; it is not part of the routine checks.
- `bun run test:d1` runs the two slow tests that start a local wrangler D1 (content publishing); they are not part of `bun run test` or CI.

## Hard rules

- Every user-visible string goes through `t()` with keys in both `src/i18n/locales/en.json` and `zh.json`.
- Never commit API keys; backups never contain them.
- Never invent data (fake stats, scores, AI answers); failures show the real error.
- AI calls go through `src/services/ai`; prompt wording lives in template files, never in TypeScript.
- Nothing has shipped. Until a release is documented in `CHANGELOG.md`, no data shape, route, key or behaviour is "existing": no backward-compatibility shims, legacy fallbacks or migrations for unreleased states. Change the shape and the code together.
- Solve from first principles with the smallest design. No defensive code for cases that cannot happen, no abstraction until a second real caller exists, no speculative options or config.
- Use a shadcn/ui (Base UI) component first via `bunx shadcn@latest add <name>`; write a custom component only when none exists, and compose data tables from `ui/table` and `@tanstack/react-table`.
- Controls never move the page: transient states show on the control itself or in an overlay.
- Docs, comments, commit messages and PR text are in English.
- Names: a new branch is at most three words joined by hyphens, with no slash and no type prefix (`today-v2`, `fix-scroll-state`); commits and PR titles are `type(scope): summary` with type one of feat, fix, docs, chore, refactor, test.
- Code style: validate once at the boundary that owns the value, inline single-use helpers, no `any`, no aliased or star imports in new code, `const` and early returns instead of `else`, no speculative race or security handling.
- A user-noticeable change gets a `CHANGELOG.md` (Unreleased) line in the same commit.

## How to work here

- Read the files you will touch before you change them; keep diffs minimal.
- Run the static and unit checks and report what was and was not verified (AI is mocked). Visual acceptance of the UI is done by hand; browser automation is for critical persistence or integration risks that unit tests cannot cover.
- Do not open a pull request, merge or force-push unless asked.
