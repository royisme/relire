# Architecture

How Relire is put together: where each responsibility lives and how data moves. Read this before changing more than one area, or when you need to know which module owns something. Area-specific rules live in `.claude/rules/` and load automatically when you touch those files.

## Shape of the system

There is no server. Relire is a static PWA built by Vite into `dist/`; the user's browser calls the AI provider directly with the user's own key, and everything the user creates is stored in that browser (IndexedDB, plus a few synchronous settings in localStorage).

```
UI (src/components)  ──calls──▶  src/services/api.ts  ──▶  src/services/ai (tasks → provider)
        │                               │
        │                               └──▶ src/storage/cache.ts   (saved AI answers)
        ├──▶ src/utils/speech  ──▶ src/storage/audio.ts              (saved TTS clips)
        └──▶ App.tsx state  ──usePersist──▶ src/storage/db.ts        (articles, vocab, stats)
```

GitHub Pages serves two things from one site (`.github/workflows/pages.yml`): the static marketing page from `marketing/` at the root, and the app build at `/app/`.

## Directory map

| Path | Owns |
| --- | --- |
| `src/App.tsx` | All app state (articles, vocab, stats, active word/sentence, which overlay is open). No router: `currentTab` picks the screen; the Read tab shows the library until an article is opened (`isReading`). Loads from IndexedDB once, renders nothing until then, saves each change with `usePersist`. Opens the first-run guide when there is no key and `relire_onboarded` is unset. |
| `src/components/` | One file per screen or overlay: `LibraryView`, `ReaderView`, `VocabularyView`, `PracticeView`, `AnalyticsDashboard`, `WordDetailModal`, `SentenceDrawer`, `SettingsModal`, `ArticleEditorDialog`, `OnboardingDialog`, `Navbar`, `LanguageSwitcher`. |
| `src/components/reader/` | `ReaderWord` (source-preserving clickable spelling), `PronunciationParagraph` (paragraph-local measured SVG), `PronunciationControls` (floating controls and accessible connection details). |
| `src/components/settings/` | Sections of the Settings shell: `AiSection` (providers, models, voices, keys), `PromptsSection` (prompt editor), `DataSection` (backup, saved answers, audio). |
| `src/components/shadowing/` | The read-aloud flow shared by the sentence sheet and Practice: `ShadowingGuide`, `ShadowingRecorder`, `AssessmentResult`. |
| `src/components/ui/` | Primitives: `button`, `badge`, `card`, `overlay` (`Sheet`, `Dialog`, `Drawer`), `speak-button` (`SpeakButton`, `SpeakIcon`, `useSpeechPhase`), `page-header`, `segmented`, `menu-button`, `theme-swatch`. |
| `src/hooks/` | `useShadowingRecorder` (microphone, recording, scoring), `usePronunciationMarkers` (cache-only recovery, cache-first sequential queue, session identity, staged/displayed snapshots), `usePWAInstall`. |
| `src/services/api.ts` | What the UI calls. Reads settings and language, builds the provider context, decides what is cached. |
| `src/services/cachedRequest.ts` | Generic persistent cache plus in-flight request sharing; optional validation rejects/deletes incompatible answers and validates before storage. |
| `src/services/ai/` | Everything that talks to an AI service; see below. |
| `src/storage/` | `db.ts` (IndexedDB schema, backup import/export, storage persistence), `cache.ts`, `audio.ts`, `usePersist.ts`. The only code that touches IndexedDB. |
| `src/utils/speech/` | `state.ts` (shared playback state), `clips.ts` (stored clip first, else synthesize and store), `playback.ts` (play, pause, resume, stop, rate, browser-voice fallback), `sequence.ts` (listening to a whole article: a queue of sentences played one after another), `recorder.ts` (microphone). |
| `src/utils/` | `appSettings.ts` (settings in localStorage), `srs.ts` (SM-2 scheduling), `i18nHelpers.ts`, `binary.ts`, `sentences.ts` (cuts an article into paragraphs and sentences; the reader and the listener share it), `readerTokens.ts` (canonical word occurrences/source spans/graphemes), `pronunciationMarkers.ts` (runtime validation of unknown annotation output), `pronunciationPreferences.ts` (per-article display/layer flags in localStorage). |
| `src/theme/` | `theme.ts` (theme preference, resolving "system", applying `data-theme` and the browser chrome colour), `useTheme`. `index.html` repeats the resolution inline before first paint. |
| `src/i18n/` | i18next setup, `LANGUAGES`, `locales/en.json`, `locales/zh.json`. |
| `src/types/` | `index.ts` (shared AI/stored shapes), `pronunciation.ts` (versioned text annotations, independent of articles and sentence analysis). |
| `src/data/` | Static content (sample articles, French IPA chart). |
| `scripts/check-i18n.ts` | The translation check run in CI. |
| `marketing/` | Static landing page, `robots.txt`, `sitemap.xml`. Not part of the app build. |
| `vite.config.ts` | PWA manifest and service worker; `base: './'` so the build works from any path. |

## AI layer (`src/services/ai/`)

Split so each part has one job:

- `types.ts`: the contracts. `TextProvider` (`generateJson`, `checkKey`, `supportsAudioInput`) writes structured answers; `SpeechProvider` (`synthesize`) returns a WAV `Blob`; `ProviderInfo` lists a provider's models and voices; a `Provider` offers text, speech or both.
- `providers/`: one folder per provider (`gemini/` today) plus `index.ts`, the registry. Text and speech can use different providers, each with its own key.
- `prompts/`: the wording the AI receives. Templates in `prompts/defaults/<task>.<lang>.txt`, registered in `registry.ts` with their variables; `engine.ts` renders `{{var}}`, `{{#if var}}…{{/if}}`, `{{#if var=value}}`; `store.ts` keeps the user's overrides; `index.ts` prepares variables and builds provider-neutral `JsonRequest`s. `promptFingerprint` hashes the template in use.
- `tasks.ts`: what the app asks (`analyzeWord`, `analyzeSentence`, `generateDrills`, `assessPronunciation`, `annotatePronunciation`), written against `TextProvider` only.
- `prosodySchema.ts`: provider-neutral JSON schema for markers; the provider forwards it when supported. The model writes spelling, not indices: per word a list of `{spelling, ipa}` syllables with silent letters in parentheses, a `groupEnd` flag, and connections naming the left word and its realized consonant spelling. `utils/prosodyResponse.ts` derives boundaries, silent ranges, group-final stress and connection ranges, applies the curated `utils/functionWords.ts` table to exact frequent words, then `utils/pronunciationMarkers.ts` validates the index-based record (also used for cache hits). Token alignment errors reject the sentence; a word-local inconsistency (bad spelling split, silent syllable, a vowel sound with no pronounced vowel letter) leaves only that word unresolved, and an invalid connection or stress mark is dropped alone. Structural validity does not certify phonetic correctness.
- `errors.ts`: `MissingApiKeyError` (App turns it into opening Settings) and `errorMessage`.

## Data and persistence

| Data | Where | Lifetime |
| --- | --- | --- |
| Articles, vocabulary (with full explanation in `VocabWord.analysis`), stats | IndexedDB `articles`, `vocab`, `meta` | Until the user deletes them; backed up |
| Word analyses | IndexedDB `cache` | Until cleared |
| Sentence analyses, practice drills, pronunciation markers | IndexedDB `cache` | 30 days (markers: at most 1,000 entries) |
| Synthesized speech | IndexedDB `audio` (WAV Blobs) | Vocabulary clips (word, context sentence, examples) kept for good; the rest trimmed least-recently-used past 200 MB |
| Reader marker display/layer preferences | localStorage `relire_pronunciation_preferences_v1` | Per article, across browser sessions; no annotations or independent readiness flag; not backed up |
| Skipped marker sentences | localStorage `relire_pronunciation_skipped_v1` | Per article: sentence text → validation error, bound to the language/prompt identity; cleared when every skipped sentence later succeeds; not backed up |
| Settings and API keys, prompt overrides, UI language, theme | localStorage `relire_app_settings_v1`, `relire_prompts_v1`, `relire_lang`, `relire_theme` | Needed synchronously at startup |

Cache keys are language + prompt fingerprint + normalized text, deliberately not provider, model or article context, so switching models never re-spends tokens. Marker keys additionally carry schema/tokenizer versions; hits are revalidated against current canonical source occurrences, so case/whitespace normalization cannot silently shift grapheme spans. The new `prosody` kind uses the existing cache store/index without a DB version change. Pronunciation assessments are never cached. The cache is never backed up; vocabulary audio optionally is.

## Key flows

- **Look up a word or sentence:** reader → `App` sets the active word/sentence → `api.fetchWordAnalysis` / `fetchSentenceAnalysis` → cache hit or `tasks` → provider → cache → sheet renders.
- **Pronunciation markers:** article entry → cache-only validation and readiness recovery (no provider request); complete usable answers restore the saved per-article display choice and layer flags. Missing/expired/invalid answers retain plain reading and the direct toolbar switch opens generation settings. Only explicit Generate → `usePronunciationMarkers` → frozen `api.createPronunciationSession` (language/settings/template) → validate cache first → sequential `annotatePronunciation` tasks across the whole article → stage successes. A sentence whose answer fails validation gets one fresh request, then is skipped (stays plain, recorded per article) and the queue continues; provider/key/network errors still pause it. Marker view unlocks once every supported sentence is staged or skipped; Generate retries skipped sentences; the direct toolbar switch applies the prepared snapshot; Stop/input changes/unmount invalidate scheduling and state writes, but an already sent request may finish and cache its original result. Identity includes exact article content, ID, language, prompt fingerprint and schema/tokenizer versions; prompt/language changes reset the session. Sentences over 2,000 characters are reported, never truncated. Missing `Intl.Segmenter` retains plain reading. Rendering uses original source text and local grapheme references, not model echoes, and never adds audio synchronization.
- **Listen to an article:** the reader's Listen button → `startSequence` with the article's sentences (`splitArticle`) → each sentence plays through `speakFrench`, whose `onSettled` starts the next; the current clip is loaded first, then the next two are prefetched. Pausing or stopping synthesizes nothing more. `ArticlePlayer` (a fixed overlay) shows play/pause, previous/next and stop; Escape, another speak button or leaving the article ends it.
- **Hear text:** `SpeakButton` → `toggleSpeech` → `clips.loadSpeech` (stored clip, else provider, then store) → `playback` publishes loading/playing through `state.ts`; every button with the same text reflects it.
- **Save a word:** `App` stores the word with its analysis, then prefetches word and sentence audio so it is protected and offline.
- **Shadowing:** `ShadowingRecorder` → `useShadowingRecorder` (record, stop, play back) → `api.assessPronunciation` → `onAssessed` adds the score to stats.
- **Backup:** `DataSection` → `exportData` / `importData` in `db.ts` (never API keys; includes prompt edits; audio optional).
