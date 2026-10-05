# CLAUDE.md

Guidance for working in this repo. Product intent is in `PRODUCT.md`; the visual system is in `DESIGN.md` (tokens in `src/index.css`, overlays in `src/components/ui/overlay.tsx`). Read both before touching UI.

## Commands

Bun is the only supported package manager.

- `bun install`
- `bun run dev`: Vite dev server on `:5173`
- `bun run build`: static site in `dist/` (includes the PWA service worker); `bun run preview` serves it
- `bun run lint`: `tsc --noEmit`
- `bun run i18n:check`: keys used in code exist in both locales, the locales match, no Chinese text hard-coded in components (CI runs it). There are no automated tests.
- Detector for UI anti-patterns: `impeccable detect --json src index.html` (from pbakaus/impeccable). Keep it at zero findings.

## Architecture

There is no server. Relire is a static PWA; `dist/` can be hosted anywhere.

- `src/services/gemini.ts`: every Gemini call (word and sentence analysis, pronunciation assessment, drills, TTS). Runs in the browser with the user's own key from settings. Throws `MissingApiKeyError` when no key is set; `App.tsx` turns that into opening Settings. Model fallback and JSON cleanup live here; raw TTS PCM is wrapped as WAV.
- `src/services/api.ts`: thin wrappers that read settings and language, with in-memory caches.
- `src/App.tsx`: owns all state (articles, vocab, stats, active word/sentence, overlays). No router; navigation is a `currentTab` state, and the Read tab shows the library list until an article is opened (`isReading`). The first-run guide (`OnboardingDialog`) opens when there is no API key and `relire_onboarded` is unset; skipping leaves a banner prompting for the key. It loads from IndexedDB once (rendering nothing until then) and saves each change with `usePersist`.
- `src/storage/`: `db.ts` is the only code that touches IndexedDB (stores `articles`, `vocab`, `meta`; plus backup import/export and storage-persistence helpers). `usePersist.ts` debounces writes, flushes on page hide, and reports failures, which App shows as a banner. Settings, the API key and the UI language stay in localStorage (`relire_app_settings_v1`, `relire_lang`) because they are needed synchronously at startup.
- `src/components/`: one file per screen or overlay (`LibraryView` article list, `ReaderView`, `VocabularyView`, `PracticeView`, `AnalyticsDashboard`, `WordDetailModal`, `SentenceDrawer`, `SettingsModal`, `ArticleEditorDialog` add/edit, `OnboardingDialog` first-run guide, `Navbar`, `LanguageSwitcher`). `ui/` holds `button`, `badge`, `card` and `overlay` (`Sheet`, `Dialog`, `Drawer`).
- `src/utils/srs.ts`: SM-2 scheduling. `frenchSpeech.ts`: TTS playback and recording. `appSettings.ts`: settings stored in localStorage.
- `src/i18n/`: i18next with `locales/en.json` and `locales/zh.json`; `LANGUAGES` lists the interface languages.
- `src/types/index.ts`: shared shapes for Gemini responses and stored data.
- `vite.config.ts`: PWA manifest and service worker (`base: './'`, so the build works from any path).

## Conventions

- Every user-visible string goes through `t()`, including `aria-label`, `title`, `placeholder`, alert and error text; add keys to **both** locale files. Never write `isEn ? … : …` for UI text. Model, voice and level display names are keys too (`models.*`, `voices.*`, `levels.*`). Run `bun run i18n:check` before committing.
- The app is not released yet, so stored shapes may still change freely. After the first release, keep them backwards compatible and bump the IndexedDB version in `db.ts` with an `upgrade` step.
- Gemini calls go through `src/services/gemini.ts` only. Never fabricate fallback AI content when a call fails; surface the error.
- Never commit API keys. The user's key lives only in their browser.
- Backups (`SettingsModal`) go through `exportData`/`importData` and must never include the API key. A new persisted entity needs a store in `db.ts`, an entry in the backup, and a `usePersist` call.
- Never show invented data (sample stats, fake scores, placeholder streaks). Empty means empty.
- Prefer the `ui/` primitives and design tokens over ad-hoc Tailwind colour classes. No new gradients, glass/blur, emoji icons, bounce/pulse animations, uppercase eyebrow labels, or invented fallback numbers.
- Icons: lucide-react only, one stroke weight.
- Comments are English; UI copy is zh/en via i18n.
- Develop on the designated feature branch; do not open PRs unless asked.
