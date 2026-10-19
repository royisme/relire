---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "scripts/**"
---

# TypeScript code style

- One responsibility per file, named in a header comment (what the file owns, what it does not). Split when concerns mix. File length (800 lines), line width (200 characters) and catch-all file names (`utils`, `types`, `config`...) are enforced by `bun run shape:check` (CI and the pre-commit hook), not by this rule: name a file for what it holds (`order_utils`, not `utils`), and name symbols so `grep` finds them (`orderTotal`, not `tmp2` or `data`).
- Match the surrounding code: naming, comment density, idioms. Comments are English and explain why, not what.
- Prefer typed shapes from `src/types` over `any` in new code.
- Async work that can be overtaken (a newer request, unmount, a changed input) checks a token or session id before setting state.
- Release what you create: object URLs, timers, media streams, event listeners.
- Keep diffs minimal and on-topic; no drive-by reformatting.
