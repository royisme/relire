# Conventions

The long form of the hard rules in `AGENTS.md`. The never-do list and working agreements are in `RULES.md`. Area-specific rules live in `.claude/rules/*.md` and are not repeated here.

## Strings and locales

- Every user-visible string goes through `t()`, with keys in both `src/i18n/locales/en.json` and `src/i18n/locales/zh.json`. `bun run i18n:check` enforces it; the key-level rules (plurals, placeholders, removing unused keys, Chinese copy style) are in `.claude/rules/i18n.md`.
- Chinese lives only in `src/i18n/locales/zh.json`, the `*.zh.txt` prompt templates, `README.zh-CN.md`, `marketing/zh/` and the schema-validated JSON content packs (see below). `bun run i18n:check` rejects hard-coded Chinese in components and other `.ts`/`.tsx` files.
- Content packs (`src/data/*/*.json`, for example the grammar pack) are data, not interface strings: they may carry Chinese and English text per entry (Zod-validated at load, with provenance and review status). Interface labels around them (tense names, headings, buttons) still go through `t()` with keys in both locales. Owner decision 2026-10-18.
- Prompt wording lives in template files (never in TypeScript); AI calls go through `src/services/ai` (`.claude/rules/ai-layer.md`).

## Language of text

Technical documentation, code comments, commit messages and PR text are in English. Comments explain why, not what (`.claude/rules/typescript.md`).

## Data and secrets

- API keys live only in the user's browser. Never commit one; backups never contain them (`.claude/rules/storage.md`).
- Never invent data: no sample stats, fake scores or fallback AI answers. Empty means empty; failures show the real error.

## UI components

Use a shadcn/ui component (Base UI) first: `bunx shadcn@latest add <name>`. Generated files live in `src/components/ui/` and are edited only to fit our tokens. Write a custom component only when no library component exists. Data tables compose `ui/table` with `@tanstack/react-table` at the page that needs them, not through a shared DataTable abstraction. Existing hand-written components are not migrated by this setup. Owner decision 2026-10-18.

Kept hand-written on purpose (owner decision 2026-10-22, issue #22): `overlay` (`Dialog`, `Sheet`, `Drawer`), `segmented`, `menu-button`. They work and their behaviour is pinned by the specs, so replacing them would change how they feel for no gain. A library equivalent exists for each; use it only if one of these has to be rewritten anyway. New components still follow the rule above.

## Controls never move the page

A transient state (loading, playing, recording, an error) shows on the control itself or in an overlay, never as a row that appears and disappears. The full UI form is in `.claude/rules/ui.md`; the owner checks it by hand, and `verify-ui` says when browser automation is justified.

## Changelog

Every change a user could notice gets a line in `CHANGELOG.md` under Unreleased (Added / Changed / Fixed / Removed), in the same commit as the change. It says what the user gets, not which files moved. `ship-change` checks it before commit.

## Nothing has shipped

Until a release is documented in `CHANGELOG.md`, nothing is "existing": no data shape, route, key or behaviour has users who depend on it. In practice:

- Change a stored shape and its readers and writers in the same commit. Do not add a migration, a version bump, a legacy field or a fallback that reads the old shape.
- Rename or remove a route, key or setting outright; no redirect or alias for the old one.
- Remove superseded code instead of keeping it "just in case".

Once a release is documented, this stops being true for what that release contained: from then on a data-shape change needs the user's decision (see "How to work here" in `CLAUDE.md`).

## Smallest design (first principles, Occam)

Start from what the task needs and build the least that does it.

- No defensive code for cases that cannot happen. Trust types and internal callers; validate at real boundaries (user input, imported files, AI output, storage read).
- No abstraction until a second real caller exists. Duplicating a few lines once is cheaper than a wrong interface; extract when the second use shows the shape.
- No speculative options, flags or config. Add one when a real need arrives.
- If two designs solve the task, pick the one with fewer moving parts.

## Git names

- **Branches:** at most three words joined by hyphens; no slash and no type prefix such as `feat/`, `fix/` or `pi/`. Examples: `today-v2`, `fix-scroll-state`, `d-remote`. Worker branches are named after the task (`git worktree add -b <task> ../relire-wt/<task> HEAD`). Branches that already exist (`feat/graded-readers`, `pi/*`) keep their names until merged or deleted.
- **Commits and PR titles:** `type(scope): summary`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. The scope is optional; use the affected area when it helps (`today`, `grammar`, `vocabulary`, `readers`, `speaking`, `worker`, `i18n`, `scripts`). Examples: `fix(today): keep the next step in view`, `docs: record the deployment decisions`, `chore(worker): regenerate types`.

## Code style

Applies to TypeScript in `src`, `scripts`, `worker` and `tests`. Where existing code differs, match it and leave it alone: do not rewrite old code only to follow a rule below. Generated shadcn/ui files under `src/components/ui` keep their own form.

**General**
- Keep things in one function unless the parts are composable or reusable.
- Validate an unknown value once, at the boundary that owns it (user input, imported file, AI output, storage read, network). Pass typed values inward; do not repeat `typeof` and property checks on values a schema, constructor or internal type already guarantees.
- Do not extract a single-use helper in advance. Inline it at the call site unless it is reused, hides a genuinely complex boundary, or has a clear independent name that makes the caller easier to read.
- Before adding complexity for a speculative or very unlikely race or security edge case, tell the owner the concrete failure, how likely it is and what the complexity costs, and get their agreement. Do not widen scope for theoretical robustness.
- Avoid `try`/`catch` where possible. Avoid `any`.
- In `scripts`, `worker` tooling and tests, use Bun APIs where they exist (`Bun.file()`). `src` runs in the browser: use web APIs.
- Rely on type inference; add an explicit annotation or interface only for exports or clarity.
- Prefer `flatMap`, `filter` and `map` over `for` loops; use a type guard in `filter` so the type narrows downstream.
- Inline a value that is used once, to keep the variable count down.
- Avoid unnecessary destructuring: use `obj.a` and `obj.b` so the context stays visible.

**Imports**
- Never alias an import (`import { foo as bar }`) and never use a star import (`import * as Foo`) in new code. If a namespace-style value is needed, import the module's own exported name.
- Never use a type-position `import("...")`. Only when two imports collide and nothing else works, an aliased `import type` is allowed.
- Import a heavy module that only some paths need with a dynamic `import()` inside the narrowest scope that needs it, destructuring the binding at the top of that scope. Avoid `await import("./m").then(...)` and `(await import("./m")).x()`.

**Flow**
- Prefer `const`. Use a ternary or an early return instead of reassignment.
- Avoid `else`; return early.
- When a function has several validation branches, make the main function read as the happy path and move supporting detail into small helpers below it, named for a real concept (`requireConfig`, `readMetadata`). Keep helpers next to the code they support. Synchronous parsing and validation stay synchronous.
- Comment non-obvious constraints and surprising behaviour, not assignments or control flow.

**Tests**
- Avoid mocks as far as possible and do not reach for `globalThis.*` unless it is the only option. AI and speech providers are mocked by rule (`AGENTS.md`); storage tests use `fake-indexeddb`.
- Test the real implementation; do not copy its logic into the test.

**Checks**
- Run `bun run typecheck`, never `tsc` directly. The full list of checks is in `docs/development.md`.
