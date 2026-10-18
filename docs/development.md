# Development: commands and checks

Bun is the only package manager. The delivery checklist (which checks must pass, changelog, commit, report) belongs to the `ship-change` skill (`.claude/skills/ship-change/SKILL.md`); this page only says what each command does.

## Run and build

- `bun install`
- `bun run dev`: Vite on :5173.
- `bun run build`: static site in `dist/`, with the PWA service worker.
- `bun run preview`: serve the built site.
- `bun scripts/grammar-pack/build.ts`: generate `src/data/grammar-pack/pack.json`; P2 requires matching owner reviews for every included verb. `packDate` in `data/grammar-pack/verbs.json` is hand-set; builds never read the clock.
- `bun scripts/grammar-pack/build.ts --check`: regenerate in memory and reject any byte difference from the committed pack (also in CI).
- `bun scripts/grammar-pack/review.ts print <verbId...>`: print the generated tables before review; only the owner runs `record <verbId...> --by "<name>" --ref "<reference>"` to append review records. `data/grammar-pack/reviews.json` holds the owner's records for the four controls.

- `bun scripts/grammar-pack/oracle-diff.ts [verbId...]`: offline-only simple-tense/participle comparison, stdout and ignored `.local/oracle/<verb>.txt` reports; never run in CI or bundle the oracle.
- `bun scripts/grammar-pack/oracle-diff.ts attest [verbId...]`: record current row hashes only for verbs with zero uncovered disagreements; only the owner writes disagreement decisions in `data/grammar-pack/oracle-attest.json`.
- `MORPHALOU_DIR`: oracle directory, default `.local/morphalou/csv/Morphalou3.1_formatCSV` relative to the repository root; stale attestations are ignored and reported by the build.

## Add a UI component

Run `bunx shadcn@latest add <name> --yes` from the project root. `components.json` selects the Base UI variant and generates files in `src/components/ui/`. The `@/*` alias resolves to `src/*` in `tsconfig.json` (TypeScript and Bun tests) and `vite.config.ts` (Vite). Keep our tokens and themes in `src/index.css`, our `cn` utility and existing components; do not overwrite them as part of adding another component. New dependencies installed by `add` are allowed only for components the owner asked for.

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
