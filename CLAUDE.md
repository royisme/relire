# CLAUDE.md

Guidance for working in this repo. Product intent is in `PRODUCT.md`; the visual system is in `DESIGN.md` once it exists. Read both before touching UI.

## Commands

- `bun install` (or `npm install --legacy-peer-deps`; plain `npm install` hits a peer-dep conflict)
- `npm run dev`: Express + Vite middleware on `:3000` (`tsx server.ts`)
- `npm run build`: Vite build to `dist/` (also generates the PWA service worker)
- `npm run lint`: `tsc --noEmit` (the only check; there are no tests)
- Detector for UI anti-patterns: `impeccable detect --json src index.html` (from pbakaus/impeccable). Keep it at zero findings.

## Architecture

- `server.ts`: Express. Serves Vite in dev and `dist/` in prod. All Gemini calls live here: `/api/config`, `/api/tts`, `/api/analyze-word`, `/api/analyze-sentence`, `/api/assess-pronunciation`, `/api/practice-generate`. Model fallback and JSON cleanup are in `generateWithFallback` / `parseGeminiJson`. A user key can override the env key via the `x-gemini-api-key` header.
- `src/services/api.ts`: client wrappers with in-memory caches. Request headers carry key, model and UI language.
- `src/App.tsx`: owns all state (articles, vocab, stats, active word/sentence, modals) and persists to localStorage (`eclair_articles_v1`, `eclair_vocab_v1`, `eclair_stats_v1`). No router; navigation is a `currentTab` state.
- `src/components/`: one file per screen or overlay (`ReaderView`, `VocabularyView`, `PracticeView`, `AnalyticsDashboard`, `WordDetailModal`, `SentenceDrawer`, `SettingsModal`, `ArticleImporterModal`, `Navbar`). `ui/` holds the small button/card/badge primitives (cva).
- `src/utils/srs.ts`: SM-2 scheduling. `frenchSpeech.ts`: TTS playback. `appSettings.ts`: settings stored in localStorage.
- `src/i18n/`: i18next with `locales/en.json` and `locales/zh.json`.
- `src/types/index.ts`: shared shapes for Gemini responses and stored data.

## Conventions

- Every user-visible string goes through `t()`; add keys to **both** locale files. Some legacy inline `isEn ? … : …` strings exist; do not add more.
- Keep stored data shapes backwards compatible (users have data in localStorage); bump the `_vN` suffix only with a migration.
- Never call Gemini from the client; add a route in `server.ts` and a wrapper in `api.ts`.
- Backup/restore in `SettingsModal` reads and writes the three storage keys directly; update it if keys change.
- Prefer the `ui/` primitives and design tokens over ad-hoc Tailwind colour classes. No new gradients, glass/blur, emoji icons, bounce/pulse animations, uppercase eyebrow labels, or invented fallback numbers.
- Icons: lucide-react only, one stroke weight.
- Comments are English; UI copy is zh/en via i18n.
- Develop on the designated feature branch; do not open PRs unless asked.
