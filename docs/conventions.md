# Conventions

The long form of the hard rules in `CLAUDE.md`. Area-specific rules live in `.claude/rules/*.md` and are not repeated here.

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
