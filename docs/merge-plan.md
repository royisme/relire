# Relire Plus: merging FrenchLab AI into Relire

Status: approved direction, implementation in phases.

Navigation amendment (owner-approved 2026-10-21): the historical generic Practice and Study → Grammar navigation below is superseded by `learning-navigation-tasks.md` and the current route/ownership contracts in `architecture.md`. Reading, Grammar, Listening and Speaking are learning destinations; saved Writing is conditional. Units and attempts require explicit learningArea; imports confirm each unit's area; mixed sets remain whole; Read aloud owns a durable workspace. Historical phase evidence below is not a compatibility-route contract.
Date: 2026-10-16.
Source projects: Relire (this repository, the host) and FrenchLab AI (`royisme/frenchPracticeApp`, merged in and then archived).

## 1. Goal

One application in which a learner does all of their French study: read real material, look up words and sentences, listen, shadow, work through exercises, review mistakes and vocabulary, and see honest progress. Today reading and pronunciation live in Relire, while workbook exercises, material import and the mistake notebook live in FrenchLab AI. Learners should not switch between two apps, two data stores and two AI setups.

## 2. Decisions

| # | Decision | Consequence |
| --- | --- | --- |
| 1 | No server for AI: every AI call goes from the browser with the learner's own key (BYOK). Amended 2026-10-19: an optional read-only content service for private grammar content exists beside it (`docs/adr-hosted-content-service.md`) and never sees a key. | FrenchLab's Express server (`server.ts`, `src/server/*`), its endpoint allowlist and its request-cancellation registry are dropped. OCR, tutoring, grading, drills and TTS become `src/services/ai` tasks. Cancellation is a browser `AbortController`. |
| 2 | Product scope widens to exercises, including listening (dictation) and writing (AI-graded open answers). | `CLAUDE.md`, `PRODUCT.md` and the READMEs stop saying "reading and speaking only". Still no mock exams and no official scores; AI grades are estimates. |
| 3 | A new grammar taxonomy that covers A1–C1 (section 6). | FrenchLab's textbook-specific categories are not mapped: importing FrenchLab backups is not planned. |
| 4 | New dependencies: `zod` (exercise contracts, import drafts, AI answer validation) and `pdfjs-dist` (local PDF page rendering, loaded on demand). Linting and formatting move to oxlint and oxfmt. | `bun run lint` becomes oxlint; type checking moves to `bun run typecheck`; `bun run format:check` joins CI. |
| 5 | The merged product is called **Relire Plus**. | The display name (title, manifest, header, marketing, READMEs) changes in phase 6, after the learning loop and migration are ready. Internal identifiers stay `relire`: the IndexedDB database `relire`, the `relire_*` localStorage keys, the package and the repository. Renaming them would lose learners' data. |
| 6 | A checked result retains the strict-accent preference used when it was graded, including through backup/restore. | Changing the preference does not reinterpret saved checks. Every checked result carries the preference, so per-slot markings are never guessed. |
| 7 | Importing is two separate pages: an article import under Read (an image or PDF is read by the OCR model into a title and text, pasted text uses no AI) and an exercise import under Practice (one new self-contained batch with a level the learner chooses, never an article); there are no workbook entries in the library. | Saving an article opens the Reader; saving exercises opens the new exercise set. Unconfirmed drafts stay in memory, block navigation, and trigger the browser warning on reload/close; leaving after confirmation loses the draft. |

Dropped from FrenchLab: TanStack AI and its four adapters (Relire's provider registry replaces them), Dexie and `dexie-react-hooks` (Relire's `idb` storage stays), TanStack Query (no server metadata to cache), Express and dotenv, and its three themes (Relire's design system and themes stay).

## 3. Target product

### Learning loop

```
Material ──▶ Read ──▶ Practise ──▶ Speak ──▶ Review ──▶ Progress
(article or    (lookup,     (exercises     (shadowing,  (vocabulary SRS,  (real counts,
 imported       listen)      self-contained) assessment)  mistake notebook, accuracy by
 worksheet)                  sets)                       adaptive drills)  grammar area)
```

Every exercise unit is self-contained: it carries its own set, level and text, and may be an arbitrary excerpt, so a mistake needs no article to stay readable, and every word in an exercise prompt can be looked up like a word in the reader.

### Screens

| Tab | Contents | Comes from |
| --- | --- | --- |
| Read | Article library: articles in one table with level and source. Add offers "Write or paste" (today's editor) and "Import from image, PDF or text", which opens the article import (`#/import/article`; the transcription is reviewed and saved as one article). | Relire library + FrenchLab `OcrUploadStudio`, `ImportDraftReview` |
| Practise | One exercise unit on a single sheet: the 11 exercise types, Enter to advance or check, the French character bar, hints, explanations, unit reset that keeps history. Units come from an imported worksheet (the exercise import, `#/import/exercises`, a button on Practice) or are generated from an article ("Make exercises from this article"), in sets that keep no link to their source. | FrenchLab `ExerciseCard`, `ExerciseContext`, `CurriculumNav`, `AccentBar`; Relire's current drills are folded in |
| My study | Words (vocabulary + SRS quiz), Shadowing (recordings log), **Mistakes** (wrong answers grouped by grammar area, with explanation, retry and "add word to vocabulary"). | Relire `StudyView` + FrenchLab `WeaknessNotebook` |
| Progress | Today's figures plus accuracy by grammar area from real attempts, with one action to generate drills for the weakest areas. Empty until there is data. | Relire `AnalyticsDashboard` + FrenchLab weakness radar |
| Settings | A full page, no longer a dialog (section 3, "App shell"): providers for text (including vision for import), speech, their models and keys; practice preferences; the prompt editor with the FrenchLab prompts; data and backup. | Relire `SettingsModal` + FrenchLab `SettingsStudio` (only the parts that still apply) |

### App shell: sidebar and settings page

Today Relire has four flat tabs (a left drawer below `md`) and Settings is a centred dialog that stacks AI, prompts and data in one scroll. After the merge there are two levels of places (Read: Library, Import an article; Practice: Import exercises; My study: Words, Shadowing, Mistakes; the open set's units) and roughly twice as many settings, which neither the tab row nor the dialog holds well.

- **Collapsible sidebar from `lg` up**, replacing the top tabs. Expanded it shows icon + label for each area with its sub-pages indented under the current area, the due-vocabulary count, and Settings and install at the bottom. Collapsed it is a 56px icon rail with tooltips and accessible names; the choice is remembered (`relire_sidebar`). In the reader and on an exercise sheet it collapses by default, so the article and the sheet stay the page; the rail never covers the text. Between `md` and `lg` it is the rail only; below `md` the existing left drawer shows the same tree.
- **Context in the sidebar, not a second rail.** While a unit is open, the units of its set list under Practise (replacing FrenchLab's separate `CurriculumNav` rail).
- **Settings becomes a page** with its own section list (sidebar sub-pages on desktop, a list then detail on phones): AI services (one page for Text AI, OCR and Speech synthesis), Practice (strict accents, dictation rate, speak after checking), Prompts, Data and backup, About. Practice, Prompts and Data each save on their own with a visible saved/failed state instead of one Save button for everything; the three AI destinations share one page-wide Save. When an AI feature needs a key, the app opens AI services on the purpose that needs it with the key field focused and returns to where the learner was after a successful check; the first-run guide stays a dialog.
- **Hash routes** (`#/read`, `#/read/:articleId`, `#/practice/:unitId`, `#/study/mistakes`, `#/settings/ai/speech` …) with no router dependency, as FrenchLab's `useAppNavigation` does, so Back works, a reload keeps the place and Settings sections can be linked. An unknown route shows a recoverable not-found page.
- Header keeps only the brand, theme and language. `DESIGN.md` "Navigation" and "Overlay" rules are updated in the same change.

### Cross-links that make it one app

- Exercise prompts, reading passages (`READING_CLOZE`) and explanations use `ReaderWord`, so any word opens `WordDetailModal` and can be saved.
- A `READING_CLOZE` unit passage opens in the reader as its own source, with listening, sentence analysis, pronunciation markers and shadowing, with the unit's own level and its set's name as source; the toolbar returns to the sheet and never offers exercises for unrelated prose. Delivered in P5-C (`a4c49b7`, `8023995`).
- Exercises generated from an article are saved as a new batch of units (`setId`, `setTitle` = the article's title, `level`) with no link to that article. Today's drills are thrown away; after the merge they keep their attempts and feed the mistake notebook.
- A mistake offers "add the word to vocabulary"; vocabulary review then schedules it.
- Exercise audio (dictation, prompts) goes through `utils/speech` and the IndexedDB `audio` store, replacing FrenchLab's Cache API cache.
- Deleting an article leaves exercise units alone; deleting a set deletes its units, item states and passage recordings but keeps attempts, as enforced by storage tests. Attempts carry their own prompt and answer text. Retention is the existing storage contract. The user confirmed that Progress and adaptive targeting include these retained attempts, so deleting a set does not erase its contribution to learning history. P5-A shows retained mistakes honestly and disables unavailable retry links.

## 4. Architecture after the merge

### AI layer (`src/services/ai`)

- New tasks in `tasks.ts`: `extractMaterial` (image or text to an exercise draft; images need a vision-capable model), `transcribeMaterial` (page images to an article's title and text, OCR selection), `hint`, `explainMistake`, `gradeOpenAnswer`, `generateExercises` (from an article) and `generateAdaptiveDrills` (from weak grammar areas).
- FrenchLab's six prompts (`ocrExtract`, `textExtract`, `tutorHint`, `deepExplain`, `adaptiveDrills`, `openGrader`) and its import task contract become `prompts/defaults/<task>.{en,zh}.txt` templates registered in `prompts/registry.ts`, so they are editable and cached by fingerprint like the others.
- Exercise and draft contracts are Zod schemas in `src/types/exercises.ts`. `z.toJSONSchema` gives the provider its response schema (with the Gemini `const` → singleton-enum conversion FrenchLab already needed); answers are parsed with the same schema, and failures show the real error.
- `TextProvider` gains image input (`imageInputCapability`, a parts-based request). Shipped providers: Gemini, an OpenAI-compatible provider with an editable Base URL (so DeepSeek, Qwen or a self-hosted gateway work), Anthropic (direct-browser-access header) and Ollama (no key, local endpoint, `OLLAMA_ORIGINS`); speech: Gemini TTS and Fish Audio, whose browser CORS was verified before adding it (`access-control-allow-origin: *`, MP3 through `/compat/v1/audio/speech`). Any further provider is added with the `add-ai-provider` skill.
- No automatic retry and no fallback between providers, as in both projects today. Import shows the provider, model and what will be sent before the request, and can be cancelled.

### Storage (`src/storage`)

`relire` IndexedDB (a single schema at version 1) holds:

| Store | Key | Indexes | Holds |
| --- | --- | --- | --- |
| `units` | `id` | `setId` | Self-contained exercise units (`setId`, optional `setTitle`, `level`, title, instructions, type, items, optional reading passage, `answerSource`, `importSource`) |
| `itemStates` | `id` (`unitId:itemId`) | `unitId` | Current answer, checked result, hint/explanation shown |
| `attempts` | `id` | `unitId`, `grammarTag`, `timestamp` | One row per check: prompt, answer, expected, correct, grammar tag, time |

Articles stay in `articles` and are only reading articles; units never point at one. Rules carried over from FrenchLab: checking an answer writes the item state and the attempt in one transaction; reset clears current states and keeps attempts; a write failure shows an error and never a fake success; late AI answers are dropped when their unit was reset or left (token check).

The article import saves one article (`saveArticle`) and the exercise import one batch of units (`saveUnits`, one IndexedDB transaction over `units`), with no optimistic library success; neither saves the other. Prepare once and retain stable identities for retry after a rejected write. Creation is add-only: any existing id is a collision, never evidence of success; there are no recovery receipts or schema metadata. The Phase 4 prerequisite removed App's article snapshot autosave: initialization, editor saves and sample restores now commit explicit storage operations before React state updates, so an old library snapshot cannot delete a committed import. Vocabulary/stats autosave stays unchanged; concurrent explicit same-article operations remain last-write-wins. Exercises save a new batch of valid units and a level; an article requires a title and text.

The import pages use `#/import/article` (Read area) and `#/import/exercises` (Practice area); `#/read/import` remains a valid reader route for an existing article id. A synchronous `index.html` recorder indexes normal same-document entries before deferred application code. The import coordinator restores the real import entry before asking Keep/Discard and replays an accepted traversal without replacing history entries. Reload/close warns through beforeunload; pending saves cannot discard. Navigation API indices supplement older untagged entries, but normal operation does not require that API. Direction recovery for untagged entries fabricated before the earliest synchronous script without Navigation API is outside the recording contract.

Backups gain `units`, `itemStates` and `attempts`. Restoring a FrenchLab `frenchlab-backup` file is not planned.

### UI

FrenchLab components are rewritten against Relire's primitives (`ui/overlay`, `ui/button`, `ui/segmented`), tokens from `DESIGN.md`, and `t()` for every string (FrenchLab hard-codes Chinese today). Keep FrenchLab's interaction rules that are already good: underline inputs inside the sentence, Enter advances then checks, IME composition never submits, the character bar never steals focus, one sheet per unit with hairline rows. `ExerciseContext.tsx` (909 lines) is split into a state hook and per-type controls to respect the 300-line rule.

### Tooling

`bun run typecheck` (tsc), `bun run lint` (oxlint, type-aware, React Hooks rules, warnings denied), `bun run format:check` (oxfmt), `bun run i18n:check`, `bun run build`, `bun run e2e`, `impeccable detect`. Pure logic (grading, contracts, import draft promotion, taxonomy, backup parsing) gets `bun test` unit tests ported from FrenchLab's `tests/`; flows get Playwright specs with mocked AI as today.

## 5. Phases

Each phase is shippable on its own, with e2e coverage, both locales and a CHANGELOG line. Visual acceptance is performed manually by the user; screenshots are not a delivery gate unless explicitly requested.

| Phase | Delivers | Done when |
| --- | --- | --- |
| 1. Direction and tooling | This plan; scope and name recorded in `CLAUDE.md` and `PRODUCT.md`; oxlint and oxfmt with a clean baseline. | CI runs typecheck, lint, format, translations and build. |
| 2. Foundation | Zod exercise contracts and grading (`exercise-comparison`), taxonomy, DB stores and transactions, backup fields, new AI tasks and templates, `bun test` for the logic. No UI. | Unit tests cover grading for all 11 types, contract refinements, DB upgrade from v4 keeps data. |
| 2b. App shell | Collapsible sidebar, Settings as a page with sections, hash routes; no new features, today's screens move into it. | E2E: collapse and expand persist, Back and reload keep the place, a key request lands on AI services on the purpose that needs it, 360 px and 1280 px without overflow or layout shift. |
| 3. Practise (complete, including review fixes) | Exercise sheet with the 11 types, keyboard and character bar, hints, explanations, open-answer grading, dictation audio; article → generated unit; today's drills replaced. | E2E: each type answered right and wrong, Enter flow, reset keeps history, phone width without overflow. |
| 4. Import (complete, including review fixes) | Image, PDF (local rendering, up to 3 pages) and text import; draft review and editing; split into an article import (Read) and an exercise import (Practice). | E2E with mocked extraction: edit, exclude, block on missing context, cancel, failed save keeps the draft. |
| 5. Review loop | Mistakes in My study, accuracy by grammar area in Progress, adaptive drills, mistake → vocabulary, cross-links to the reader. | E2E: a wrong answer appears in Mistakes, its drill is generated, its word is saved. |
| 6. Migration and launch | The Relire Plus name across app, manifest, marketing and READMEs, additional providers, FrenchLab repository archived with a pointer here. | The name is consistent across the app, manifest, marketing and READMEs. |

## 6. Grammar taxonomy (implemented in phase 2)

Grouped by area; each attempt carries exactly one tag. Names are stable IDs; labels live in the locale files.

| Area | Tags |
| --- | --- |
| Nouns and determiners | `gender-number`, `articles`, `partitive-quantity`, `possessive-demonstrative` |
| Adjectives and adverbs | `adjective-agreement`, `adjective-position`, `comparison`, `adverbs` |
| Verbs: forms | `present`, `passe-compose`, `imparfait`, `plus-que-parfait`, `future`, `conditional`, `subjunctive`, `imperative`, `pronominal-verbs`, `passive` |
| Verbs: use | `tense-choice-past`, `past-participle-agreement`, `hypothesis-si`, `reported-speech`, `infinitive-gerund` |
| Pronouns | `subject-object-pronouns`, `y-en`, `relative-pronouns`, `other-pronouns` |
| Sentence | `negation`, `questions`, `prepositions`, `connectors`, `word-order` |
| Skills | `numbers-time`, `vocabulary-usage`, `reading-comprehension`, `listening-dictation`, `written-expression` |

### Phase 5 execution gates

- **P5-A first:** the mistake notebook uses `listMistakes`, including its existing resolved marker, grouped with `grammarAreaOf`. Explanation and vocabulary lookup reuse the existing AI and word-sheet flows. Retry opens the surviving exercise sheet and uses its existing confirmed reset when needed, without silently resetting a unit or deleting attempts. Missing units keep their historical text but offer no broken links.
- **P5-B, parallel with A:** the user confirmed both product gates: Progress/adaptive targeting includes retained attempts from deleted materials, and each generated adaptive set creates one new self-contained set (no article), saved atomically. Every unit belongs to that set, never an arbitrary last-open article. Area accuracy sums correct/total counts, not an unweighted average of tag percentages. No account, new dependency or new persistence schema is required.
- **P5-C after verified A/B:** delivered and parent-verified. Word lookup, keyboard/safe-markup handling, empty-workbook Library routing and `PRODUCT.md` synchronization landed first (`73d2d43`); the user-approved follow-up then made the unit passage a distinct reading/shadowing source (`a4c49b7`), with its route, source identity, recording lifetime, study return links and optional backup provenance corrected by `8023995` after two independent reviews. Article routes, keys and backups are unchanged, and Reader was reused rather than duplicated. The gap named here is closed, not deferred to phase 6.
- **P5-D last:** the Chinese copy of every new Phase 5 string was reviewed after the interfaces settled (`8a0baf7`, three wording alignments), the full integration checks were re-run on the integration branch, and the roadmap records them. Phase 5 is complete; nothing here is deferred to phase 6.

## 7. Risks

- **Size.** FrenchLab is about 10,700 lines; roughly 1,500 (server) are dropped and about 1,200 (settings studio) mostly replaced. The rest is rewritten, not copied, because state, storage, styling and strings all change.
- **Key in the browser.** FrenchLab promised keys never reach the browser. Under BYOK the key is the learner's own and stays in their browser, as Relire already documents; the import screen states what is sent and to whom.
- **Vision models.** Import needs a vision-capable text model. Settings shows whether the chosen model can read images and import says so before sending.
- **Bundle size.** PDF.js is loaded only when a PDF is chosen; its worker, fonts and cmaps are bundled for offline use.
- **Scope creep.** No mock exams, timed TCF papers or official-looking scores, in line with `PRODUCT.md`.
