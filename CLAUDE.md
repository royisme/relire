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

- `src/services/ai/`: everything that talks to an AI service, split so each part has one job.
  - `types.ts`: the contracts. `TextProvider` (`generateJson`, `checkKey`, `supportsAudioInput`) writes structured answers; `SpeechProvider` (`synthesize`) returns a WAV `Blob`; `ProviderInfo` lists a provider's models and voices; a `Provider` offers text, speech or both.
  - `providers/`: one folder per provider (`gemini/` today) plus `index.ts`, the registry. **To add a provider:** implement `Provider`, register it in `providers/index.ts`, add `providers.<id>` and its `models.*` / `voices.*` names to both locale files. Settings lists it automatically, and text and speech can use different providers, each with its own key.
  - `prompts/`: the wording the AI receives. Every prompt is a plain-text template in `prompts/defaults/<task>.<lang>.txt` (`{{var}}`, `{{#if var}}…{{/if}}`, `{{#if var=value}}`), registered in `registry.ts` with its variables. `store.ts` keeps the user's overrides (localStorage `relire_prompts_v1`, edited in Settings, included in backups); `index.ts` only prepares variables and builds provider-neutral `JsonRequest`s. **Never write prompt wording in TypeScript**; add or change a template file. `promptFingerprint` hashes the template in use and is part of every cache key, so editing a prompt never serves answers made with the old one.
  - `tasks.ts`: what the app asks (`analyzeWord`, `analyzeSentence`, `generateDrills`, `assessPronunciation`), written against `TextProvider` only.
  - `errors.ts`: `MissingApiKeyError` (App turns it into opening Settings) and `errorMessage`.
- `src/services/api.ts`: what the UI calls. Reads settings and language, builds the provider context, and decides what is cached. `cachedRequest.ts` is the generic persistent-cache-plus-in-flight-sharing wrapper. Word and sentence analyses and drills go through the cache (`src/storage/cache.ts`): words until cleared, sentences and drills 30 days, keyed by language, prompt fingerprint and normalized text (not provider, model or article context, so switching models never re-spends tokens); the cache is not backed up; `generatePracticeDrills(..., fresh)` replaces a saved set. Pronunciation assessments are deliberately not cached.
- `src/App.tsx`: owns all state (articles, vocab, stats, active word/sentence, overlays). No router; navigation is a `currentTab` state, and the Read tab shows the library list until an article is opened (`isReading`). The first-run guide (`OnboardingDialog`) opens when there is no API key and `relire_onboarded` is unset; skipping leaves a banner prompting for the key. It loads from IndexedDB once (rendering nothing until then) and saves each change with `usePersist`.
- `src/storage/`: `db.ts` owns the IndexedDB schema (stores `articles`, `vocab`, `meta`, `cache`, `audio`) plus backup import/export and storage-persistence helpers; `cache.ts` and `audio.ts` are the only other code that reads or writes it. `audio.ts` keeps every synthesized clip as a WAV Blob; clips whose text is a saved vocabulary word, its context sentence or its example sentences are protected and never trimmed, the rest are dropped least-recently-used past 200 MB. `utils/speech` plays from storage first, so a clip is paid for once; saving a word prefetches its word and sentence audio, and `VocabWord.analysis` keeps the full explanation with the word. `usePersist.ts` debounces writes, flushes on page hide, and reports failures, which App shows as a banner. Settings, the API key and the UI language stay in localStorage (`relire_app_settings_v1`, `relire_prompts_v1`, `relire_lang`) because they are needed synchronously at startup.
- `src/components/`: one file per screen or overlay (`LibraryView` article list, `ReaderView`, `VocabularyView`, `PracticeView`, `AnalyticsDashboard`, `WordDetailModal`, `SentenceDrawer`, `SettingsModal` (a shell; its sections are in `settings/`: `AiSection` providers/models/voices/keys, `PromptsSection` prompt editor, `DataSection` backup, saved answers and audio), `ArticleEditorDialog` add/edit, `OnboardingDialog` first-run guide, `Navbar`, `LanguageSwitcher`). `shadowing/` is the read-aloud flow shared by the sentence sheet and Practice (`ShadowingRecorder`: record, play back, check; `AssessmentResult`; `ShadowingGuide`: pace, phrasing, liaisons, intonation), driven by `hooks/useShadowingRecorder` (microphone, recording, scoring); screens never hold recorder state themselves. `ui/` holds `button`, `badge`, `card`, `overlay` (`Sheet`, `Dialog`, `Drawer`) and `speak-button` (`SpeakButton`, `SpeakIcon`, `useSpeechPhase`).
- `src/utils/srs.ts`: SM-2 scheduling. `utils/speech/`: `clips.ts` (stored audio first, else the speech provider, then store it), `playback.ts` (playing, rate, browser-voice fallback), `recorder.ts` (microphone). `appSettings.ts`: settings in localStorage (text and speech provider/model/voice, one API key per provider); unknown providers or models fall back to defaults.
- `src/i18n/`: i18next with `locales/en.json` and `locales/zh.json`; `LANGUAGES` lists the interface languages.
- `src/types/index.ts`: shared shapes for Gemini responses and stored data.
- `vite.config.ts`: PWA manifest and service worker (`base: './'`, so the build works from any path).

## Conventions

- Every user-visible string goes through `t()`, including `aria-label`, `title`, `placeholder`, alert and error text; add keys to **both** locale files. Never write `isEn ? … : …` for UI text. Model, voice and level display names are keys too (`models.*`, `voices.*`, `levels.*`). Run `bun run i18n:check` before committing.
- The app is not released yet, so stored shapes may still change freely. After the first release, keep them backwards compatible and bump the IndexedDB version in `db.ts` with an `upgrade` step.
- AI calls go through `src/services/ai` only, and tasks never name a provider. Never fabricate fallback AI content when a call fails; surface the error.
- Keep files to one responsibility and name the boundary in a header comment. When a file grows past about 300 lines or mixes concerns (a screen that also owns persistence, a service that also holds wording), split it; components get their own folder when they have sections (`components/settings/`).
- Never commit API keys. The user's keys live only in their browser.
- Backups (`SettingsModal`) go through `exportData`/`importData` and must never include API keys. They include prompt edits. They can optionally carry the vocabulary's audio (`exportProtectedAudio`). The `cache` store is never backed up. A new persisted entity needs a store in `db.ts`, an entry in the backup, and a `usePersist` call.
- Controls must not move the page: loading, playing, recording and errors show on the control that was pressed (icon swap, fixed size) or in an overlay, never as a row that appears and disappears. Playback state is `utils/speech/state.ts`; use `SpeakButton`, not your own `isSpeaking` state. New layouts are checked at 360 px with long text: wrap (`break-words`, `min-w-0`) instead of fixing widths.
- Never show invented data (sample stats, fake scores, placeholder streaks). Empty means empty.
- Prefer the `ui/` primitives and design tokens over ad-hoc Tailwind colour classes. No new gradients, glass/blur, emoji icons, bounce/pulse animations, uppercase eyebrow labels, or invented fallback numbers.
- Icons: lucide-react only, one stroke weight.
- Comments are English; UI copy is zh/en via i18n.
- Update `CHANGELOG.md` (under Unreleased, Added / Changed / Fixed / Removed) in the same commit as any change a user could notice.
- Develop on the designated feature branch; do not open PRs unless asked.
