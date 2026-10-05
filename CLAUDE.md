# CLAUDE.md

Guidance for working in this repo. Product intent is in `PRODUCT.md`; the visual system is in `DESIGN.md` (tokens in `src/index.css`, overlays in `src/components/ui/overlay.tsx`). Read both before touching UI.

## Commands

Bun is the only supported package manager.

- `bun install`
- `bun run dev`: Vite dev server on `:5173`
- `bun run build`: static site in `dist/` (includes the PWA service worker); `bun run preview` serves it
- `bun run lint`: `tsc --noEmit` (the only check; there are no tests)
- Detector for UI anti-patterns: `impeccable detect --json src index.html` (from pbakaus/impeccable). Keep it at zero findings.

## Architecture

There is no server. Relire is a static PWA; `dist/` can be hosted anywhere.

- `src/services/gemini.ts`: every Gemini call (word and sentence analysis, pronunciation assessment, drills, TTS). Runs in the browser with the user's own key from settings. Throws `MissingApiKeyError` when no key is set; `App.tsx` turns that into opening Settings. Model fallback and JSON cleanup live here; raw TTS PCM is wrapped as WAV.
- `src/services/api.ts`: thin wrappers that read settings and language, with in-memory caches.
- `src/App.tsx`: owns all state (articles, vocab, stats, active word/sentence, overlays) and persists to localStorage (`eclair_articles_v1`, `eclair_vocab_v1`, `eclair_stats_v1`, `eclair_app_settings_v1`, `eclair_lang`). No router; navigation is a `currentTab` state.
- `src/components/`: one file per screen or overlay (`ReaderView`, `VocabularyView`, `PracticeView`, `AnalyticsDashboard`, `WordDetailModal`, `SentenceDrawer`, `SettingsModal`, `ArticleImporterModal`, `Navbar`, `LanguageSwitcher`). `ui/` holds `button`, `badge`, `card` and `overlay` (`Sheet`, `Dialog`, `Drawer`).
- `src/utils/srs.ts`: SM-2 scheduling. `frenchSpeech.ts`: TTS playback and recording. `appSettings.ts`: settings stored in localStorage.
- `src/i18n/`: i18next with `locales/en.json` and `locales/zh.json`; `LANGUAGES` lists the interface languages.
- `src/types/index.ts`: shared shapes for Gemini responses and stored data.
- `vite.config.ts`: PWA manifest and service worker (`base: './'`, so the build works from any path).

## Conventions

- Every user-visible string goes through `t()`; add keys to **both** locale files. Some legacy inline `isEn ? … : …` strings exist; do not add more.
- Keep stored data shapes backwards compatible (users have data in localStorage); bump the `_vN` suffix only with a migration.
- Gemini calls go through `src/services/gemini.ts` only. Never fabricate fallback AI content when a call fails; surface the error.
- Never commit API keys. The user's key lives only in their browser.
- Backup/restore in `SettingsModal` reads and writes the storage keys directly; update it if keys change.
- Prefer the `ui/` primitives and design tokens over ad-hoc Tailwind colour classes. No new gradients, glass/blur, emoji icons, bounce/pulse animations, uppercase eyebrow labels, or invented fallback numbers.
- Icons: lucide-react only, one stroke weight.
- Comments are English; UI copy is zh/en via i18n.
- Develop on the designated feature branch; do not open PRs unless asked.
