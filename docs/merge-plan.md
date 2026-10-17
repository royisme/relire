# Relire Plus: merging FrenchLab AI into Relire

Status: approved direction, implementation in phases.
Date: 2026-10-16.
Source projects: Relire (this repository, the host) and FrenchLab AI (`royisme/frenchPracticeApp`, merged in and then archived).

## 1. Goal

One application in which a learner does all of their French study: read real material, look up words and sentences, listen, shadow, work through exercises, review mistakes and vocabulary, and see honest progress. Today reading and pronunciation live in Relire, while workbook exercises, material import and the mistake notebook live in FrenchLab AI. Learners should not switch between two apps, two data stores and two AI setups.

## 2. Decisions

| # | Decision | Consequence |
| --- | --- | --- |
| 1 | No server. Every AI call goes from the browser with the learner's own key (BYOK). | FrenchLab's Express server (`server.ts`, `src/server/*`), its endpoint allowlist and its request-cancellation registry are dropped. OCR, tutoring, grading, drills and TTS become `src/services/ai` tasks. Cancellation is a browser `AbortController`. |
| 2 | Product scope widens to exercises, including listening (dictation) and writing (AI-graded open answers). | `CLAUDE.md`, `PRODUCT.md` and the READMEs stop saying "reading and speaking only". Still no mock exams and no official scores; AI grades are estimates. |
| 3 | A new grammar taxonomy that covers A1–C1 (section 6). | FrenchLab's 14 textbook-specific categories are mapped onto it when old data is imported. |
| 4 | New dependencies: `zod` (exercise contracts, import drafts, AI answer validation) and `pdfjs-dist` (local PDF page rendering, loaded on demand). Linting and formatting move to oxlint and oxfmt. | `bun run lint` becomes oxlint; type checking moves to `bun run typecheck`; `bun run format:check` joins CI. |
| 5 | The merged product is called **Relire Plus**. | The display name (title, manifest, header, marketing, READMEs) changes in phase 6, after the learning loop and migration are ready. Internal identifiers stay `relire`: the IndexedDB database `relire`, the `relire_*` localStorage keys, the package and the repository. Renaming them would lose learners' data. |
| 6 | A checked result retains the strict-accent preference used when it was graded, including through backup/restore. | Changing the preference does not reinterpret saved checks. Legacy results without this metadata retain their overall verdict; multi-slot controls show no guessed per-slot verdicts. |
| 7 | An import saved as both article and exercises creates one readable material with attached units, not two library entries. | Save opens Practice when exercises were saved, otherwise Reader. Unconfirmed drafts stay in memory, block navigation, and trigger the browser warning on reload/close; leaving after confirmation loses the draft. |

Dropped from FrenchLab: TanStack AI and its four adapters (Relire's provider registry replaces them), Dexie and `dexie-react-hooks` (Relire's `idb` storage stays), TanStack Query (no server metadata to cache), Express and dotenv, and its three themes (Relire's design system and themes stay).

## 3. Target product

### Learning loop

```
Material ──▶ Read ──▶ Practise ──▶ Speak ──▶ Review ──▶ Progress
(article or    (lookup,     (exercises     (shadowing,  (vocabulary SRS,  (real counts,
 imported       listen)      bound to the   assessment)  mistake notebook, accuracy by
 workbook)                   material)                   adaptive drills)  grammar area)
```

Every exercise belongs to a material, so a mistake can always lead back to the text it came from, and every word in an exercise prompt can be looked up like a word in the reader.

### Screens

| Tab | Contents | Comes from |
| --- | --- | --- |
| Read | Material library: articles and workbooks in one table with type, level and source. Add offers "Write or paste" (today's editor) and "Import from image, PDF or text" (FrenchLab's import with draft review). An import can be saved as exercises, as an article, or both. | Relire library + FrenchLab `OcrUploadStudio`, `ImportDraftReview` |
| Practise | One exercise unit on a single sheet: the 11 exercise types, Enter to advance or check, the French character bar, hints, explanations, unit reset that keeps history. Units come from an imported workbook or are generated from an article ("Make exercises from this article"). | FrenchLab `ExerciseCard`, `ExerciseContext`, `CurriculumNav`, `AccentBar`; Relire's current drills are folded in |
| My study | Words (vocabulary + SRS quiz), Shadowing (recordings log), **Mistakes** (wrong answers grouped by grammar area, with explanation, retry, "add word to vocabulary" and "open in material"). | Relire `StudyView` + FrenchLab `WeaknessNotebook` |
| Progress | Today's figures plus accuracy by grammar area from real attempts, with one action to generate drills for the weakest areas. Empty until there is data. | Relire `AnalyticsDashboard` + FrenchLab weakness radar |
| Settings | A full page, no longer a dialog (section 3, "App shell"): providers for text (including vision for import), speech, their models and keys; practice preferences; the prompt editor with the FrenchLab prompts; data and backup. | Relire `SettingsModal` + FrenchLab `SettingsStudio` (only the parts that still apply) |

### App shell: sidebar and settings page

Today Relire has four flat tabs (a left drawer below `md`) and Settings is a centred dialog that stacks AI, prompts and data in one scroll. After the merge there are two levels of places (Read: Library, Import; My study: Words, Shadowing, Mistakes; a workbook's units) and roughly twice as many settings, which neither the tab row nor the dialog holds well.

- **Collapsible sidebar from `lg` up**, replacing the top tabs. Expanded it shows icon + label for each area with its sub-pages indented under the current area, the due-vocabulary count, and Settings and install at the bottom. Collapsed it is a 56px icon rail with tooltips and accessible names; the choice is remembered (`relire_sidebar`). In the reader and on an exercise sheet it collapses by default, so the article and the sheet stay the page; the rail never covers the text. Between `md` and `lg` it is the rail only; below `md` the existing left drawer shows the same tree.
- **Context in the sidebar, not a second rail.** While a workbook is open, its units list under Practise (replacing FrenchLab's separate `CurriculumNav` rail).
- **Settings becomes a page** with its own section list (sidebar sub-pages on desktop, a list then detail on phones): Text AI, Speech, Practice (strict accents, dictation rate, speak after checking), Prompts, Data and backup, About. Each section saves on its own with a visible saved/failed state instead of one Save button for everything. When an AI feature needs a key, the app opens Settings → Text AI with the key field focused and returns to where the learner was after a successful check; the first-run guide stays a dialog.
- **Hash routes** (`#/read`, `#/read/:articleId`, `#/practice/:unitId`, `#/study/mistakes`, `#/settings/speech` …) with no router dependency, as FrenchLab's `useAppNavigation` does, so Back works, a reload keeps the place and Settings sections can be linked. An unknown route shows a recoverable not-found page.
- Header keeps only the brand, theme and language. `DESIGN.md` "Navigation" and "Overlay" rules are updated in the same change.

### Cross-links that make it one app

- Exercise prompts, reading passages (`READING_CLOZE`) and explanations use `ReaderWord`, so any word opens `WordDetailModal` and can be saved.
- A `READING_CLOZE` passage opens in the reader, with listening, sentence analysis and shadowing.
- Exercises generated from an article are saved as units with `materialId` pointing to that article. Today's drills are thrown away; after the merge they keep their attempts and feed the mistake notebook.
- A mistake offers "add the word to vocabulary"; vocabulary review then schedules it.
- Exercise audio (dictation, prompts) goes through `utils/speech` and the IndexedDB `audio` store, replacing FrenchLab's Cache API cache.
- Deleting a material currently deletes its units and item states but keeps attempts, as enforced by storage tests. Attempts carry their own prompt and answer text. Retention is the existing storage contract. The user confirmed that Progress and adaptive targeting include these retained attempts, so deleting a material does not erase its contribution to learning history. P5-A shows retained mistakes honestly and disables unavailable source/retry links.

## 4. Architecture after the merge

### AI layer (`src/services/ai`)

- New tasks in `tasks.ts`: `extractMaterial` (image or text to an import draft; images need a vision-capable model), `hint`, `explainMistake`, `gradeOpenAnswer`, `generateExercises` (from an article) and `generateAdaptiveDrills` (from weak grammar areas).
- FrenchLab's six prompts (`ocrExtract`, `textExtract`, `tutorHint`, `deepExplain`, `adaptiveDrills`, `openGrader`) and its import task contract become `prompts/defaults/<task>.{en,zh}.txt` templates registered in `prompts/registry.ts`, so they are editable and cached by fingerprint like the others.
- Exercise and draft contracts are Zod schemas in `src/types/exercises.ts`. `z.toJSONSchema` gives the provider its response schema (with the Gemini `const` → singleton-enum conversion FrenchLab already needed); answers are parsed with the same schema, and failures show the real error.
- `TextProvider` gains image input (`supportsImageInput`, a parts-based request). Providers: Gemini first; OpenAI-compatible, Anthropic and Ollama are added with the `add-ai-provider` skill. Browser constraints: Anthropic needs the direct-browser-access header; Ollama needs `OLLAMA_ORIGINS` set by the learner; Fish Audio TTS is only added if its API accepts browser requests (to be verified, otherwise it is left out).
- No automatic retry and no fallback between providers, as in both projects today. Import shows the provider, model and what will be sent before the request, and can be cancelled.

### Storage (`src/storage`)

`relire` IndexedDB version 5 adds:

| Store | Key | Indexes | Holds |
| --- | --- | --- | --- |
| `units` | `id` | `materialId` | Exercise units (title, instructions, type, items, optional reading passage, `answerSource`, `importSource`) |
| `itemStates` | `id` (`unitId:itemId`) | `unitId` | Current answer, checked result, hint/explanation shown |
| `attempts` | `id` | `unitId`, `grammarTag`, `timestamp` | One row per check: prompt, answer, expected, correct, grammar tag, time |

Articles stay in `articles`; an imported workbook is an `Article` with `kind: 'workbook'` (default `'article'` for existing rows) so the library, deletion and backup have one material list. Rules carried over from FrenchLab: checking an answer writes the item state and the attempt in one transaction; reset clears current states and keeps attempts; a write failure shows an error and never a fake success; late AI answers are dropped when their unit was reset or left (token check).

Import saves its material and initial units through `createImportedMaterial(article, units)` in one IndexedDB transaction over articles, units and meta, with no optimistic library success and no separate article-then-units writes. Prepare once and retain stable identities for retry after a rejected write. Creation is add-only: any existing id is a collision, never evidence of success; there are no recovery receipts or schema metadata. The Phase 4 prerequisite removed App's article snapshot autosave: initialization, editor saves and sample restores now commit explicit storage operations before React state updates, so an old library snapshot cannot delete a committed import. Vocabulary/stats autosave stays unchanged; concurrent explicit same-article operations remain last-write-wins. Exercises-only creates a workbook with valid units and may keep source text empty; article/both require source text, and both creates one readable material with attached units.

The import workspace uses `#/import` in the Read area; `#/read/import` remains a valid reader route for an existing article id. A synchronous `index.html` recorder indexes normal same-document entries before deferred application code. The import coordinator restores the real import entry before asking Keep/Discard and replays an accepted traversal without replacing history entries. Reload/close warns through beforeunload; pending saves cannot discard. Navigation API indices supplement older untagged entries, but normal operation does not require that API. Direction recovery for untagged entries fabricated before the earliest synchronous script without Navigation API is outside the recording contract.

Backups gain `units`, `itemStates` and `attempts`. Restore also accepts a FrenchLab `frenchlab-backup` v1 file: lessons become workbooks and units, states and attempts are kept, grammar tags are mapped (section 6), and FrenchLab settings are ignored except prompt overrides, which are offered for review rather than applied silently. FrenchLab runs on another origin, so this file is the only way to bring its data over.

### UI

FrenchLab components are rewritten against Relire's primitives (`ui/overlay`, `ui/button`, `ui/segmented`), tokens from `DESIGN.md`, and `t()` for every string (FrenchLab hard-codes Chinese today). Keep FrenchLab's interaction rules that are already good: underline inputs inside the sentence, Enter advances then checks, IME composition never submits, the character bar never steals focus, one sheet per unit with hairline rows. `ExerciseContext.tsx` (909 lines) is split into a state hook and per-type controls to respect the 300-line rule.

### Tooling

`bun run typecheck` (tsc), `bun run lint` (oxlint, type-aware, React Hooks rules, warnings denied), `bun run format:check` (oxfmt), `bun run i18n:check`, `bun run build`, `bun run e2e`, `impeccable detect`. Pure logic (grading, contracts, import draft promotion, taxonomy mapping, backup parsing) gets `bun test` unit tests ported from FrenchLab's `tests/`; flows get Playwright specs with mocked AI as today.

## 5. Phases

Each phase is shippable on its own, with e2e coverage, both locales and a CHANGELOG line. Visual acceptance is performed manually by the user; screenshots are not a delivery gate unless explicitly requested.

| Phase | Delivers | Done when |
| --- | --- | --- |
| 1. Direction and tooling | This plan; scope and name recorded in `CLAUDE.md` and `PRODUCT.md`; oxlint and oxfmt with a clean baseline. | CI runs typecheck, lint, format, translations and build. |
| 2. Foundation | Zod exercise contracts and grading (`exercise-comparison`), taxonomy, DB v5 stores and transactions, backup fields, new AI tasks and templates, `bun test` for the logic. No UI. | Unit tests cover grading for all 11 types, contract refinements, DB upgrade from v4 keeps data. |
| 2b. App shell | Collapsible sidebar, Settings as a page with sections, hash routes; no new features, today's screens move into it. | E2E: collapse and expand persist, Back and reload keep the place, a key request lands on Settings → Text AI, 360 px and 1280 px without overflow or layout shift. |
| 3. Practise (complete, including review fixes) | Exercise sheet with the 11 types, keyboard and character bar, hints, explanations, open-answer grading, dictation audio; article → generated unit; today's drills replaced. | E2E: each type answered right and wrong, Enter flow, reset keeps history, phone width without overflow. |
| 4. Import (complete, including review fixes) | Image, PDF (local rendering, up to 3 pages) and text import; draft review and editing; save as exercises and/or article. | E2E with mocked extraction: edit, exclude, block on missing context, cancel, failed save keeps the draft. |
| 5. Review loop | Mistakes in My study, accuracy by grammar area in Progress, adaptive drills, mistake → vocabulary, cross-links to the reader. | E2E: a wrong answer appears in Mistakes, its drill is generated, its word is saved. |
| 6. Migration and launch | FrenchLab backup import, the Relire Plus name across app, manifest, marketing and READMEs, additional providers, FrenchLab repository archived with a pointer here. | A real FrenchLab backup restores with every attempt kept. |

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

Mapping from FrenchLab: `gender-agreement` → `gender-number`; `nationality-adjectives` → `adjective-agreement`; `country-prepositions` → `prepositions`; `verb-conjugation-etre`, `verb-conjugation-sappeler`, `verb-conjugation-aller-avoir` → `present`; `pronouns-subject` → `subject-object-pronouns`; `definite-articles` → `articles`; `possessive-adjectives` → `possessive-demonstrative`; `numbers-time` → `numbers-time`; `question-formulation` → `questions`; `dialogue-comprehension`, `reading-comprehension` → `reading-comprehension`; `professions-vocabulary` → `vocabulary-usage`.

### Phase 5 execution gates

- **P5-A first:** the mistake notebook uses `listMistakes`, including its existing resolved marker, grouped with `grammarAreaOf`. Explanation and vocabulary lookup reuse the existing AI and word-sheet flows. Retry opens the surviving exercise sheet and uses its existing confirmed reset when needed, without silently resetting a unit or deleting attempts. Missing units/materials keep their historical text but offer no broken links.
- **P5-B, parallel with A:** the user confirmed both product gates: Progress/adaptive targeting includes retained attempts from deleted materials, and each generated adaptive set creates one new workbook saved atomically with its units. Every unit belongs to that workbook, never an arbitrary last-open article. Area accuracy sums correct/total counts, not an unweighted average of tag percentages. No account, new dependency or new persistence schema is required.
- **P5-C after verified A/B:** add word lookup to exercise prompts, passages and explanations, preserving answer-control keyboard behavior and safe inline markup. The existing reading-passage link is already present and should be extended, not duplicated. Repair the Library entry for empty-text workbooks so it opens their material-specific Practice list, while readable materials continue to open Reader. Synchronize `PRODUCT.md` with the shipped Progress/adaptive behavior.
- **P5-D last:** review the new Chinese copy after these interfaces settle; then run the full integration checks and update completion evidence. Do not mark a task complete before review and verification.

## 7. Risks

- **Size.** FrenchLab is about 10,700 lines; roughly 1,500 (server) are dropped and about 1,200 (settings studio) mostly replaced. The rest is rewritten, not copied, because state, storage, styling and strings all change.
- **Key in the browser.** FrenchLab promised keys never reach the browser. Under BYOK the key is the learner's own and stays in their browser, as Relire already documents; the import screen states what is sent and to whom.
- **Vision models.** Import needs a vision-capable text model. Settings shows whether the chosen model can read images and import says so before sending.
- **Bundle size.** PDF.js is loaded only when a PDF is chosen; its worker, fonts and cmaps are bundled for offline use.
- **Scope creep.** No mock exams, timed TCF papers or official-looking scores, in line with `PRODUCT.md`.
