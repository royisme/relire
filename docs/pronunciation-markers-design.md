# Reader pronunciation markers: implementation proposal

Status: implemented and committed on `feat/reader-pronunciation-markers`. No push, PR or release has been performed.

Progress:
- [x] Data contract, canonical tokens, validation, AI task, and cache integration.
- [x] Source-preserving renderer and measured marker geometry.
- [x] Generation queue, controls, displayed snapshots, and app integration.
- [x] Locales, saved-answer accounting, documentation, mocked browser acceptance, and diff review.
- [x] Detector gate: after upgrading the user's global impeccable skill to engine 4.0.0, `detect --json src index.html` reports `[]` (the previous 3.x-engine single-font warning on the untouched `index.html` was a false positive, fixed upstream).

Verification completed with mocked AI, not a live provider: type/i18n/build and diff checks passed; 35 throwaway token/validator assertions and 224 browser assertions passed. Browser coverage includes 360×740 and 1280×900, three themes, both languages, four font sizes, inspected screenshots, measured ink-relative stress dots, wrapped local tails, actual native clipboard text, keyboard/touch lookup and connection details, playback/vocabulary regressions, stable layers/staging, whole-article generation/Stop/retry, stale prompt/language/unmount guards, offline/no-key cache, invalid fresh/cached responses, malformed JSON, oversized sentences, unsupported grapheme segmentation, cache expiry/cap/clear and backup exclusion. Read-only security and architecture reviews found no blocking code issues. The build emits a large-chunk warning.

Real-provider pronunciation accuracy is unverified. Structural validation and browser fixtures do not certify phonetic quality; no learner key was read and no paid provider call was made.

### Revision: spelling-based model output and word-level demotion

Live Gemini answers kept failing on index bookkeeping (`le` with one IPA syllable and one boundary → `syllable-count`), and one bad word rejected its sentence, which then blocked the whole article. The user approved word-level demotion and a built-in function-word table. This revision supersedes the provider-output parts of the contract below; the index-based record stored in the cache and consumed by rendering is unchanged.

- **Provider output.** Per word: `ordinal`, `source`, `status`, `syllables: [{spelling, ipa}]` with silent letters in parentheses (`tem(ps)`), and `groupEnd`. Per connection: `left` (right is always `left + 1`), `type`, `sound`, and the left word's realized consonant `spelling`. No grapheme indices, no sentence echo, no stress list. A syllable's spelling and IPA travel together, so their counts cannot disagree.
- **Local derivation** (`utils/prosodyResponse.ts`): boundaries and silent ranges come from the spellings, checked letter by letter against the token. Stress goes on the last syllable of each `groupEnd` word, because French stress is group-final; the validator trims the anchor to audible letters. A connection's pronounced range is the last occurrence of its spelling in the left word.
- **Function words** (`utils/functionWords.ts`): exact, case-insensitive whole-token matches for frequent unambiguous words replace the model's syllables, including an unresolved answer. Variable words (plus, tous, six…) stay with the model.
- **Failure granularity.** Token alignment (word count, ordinal, source spelling, duplicates, top-level shape) still rejects the sentence. Word-local problems leave only that word unresolved: a spelling split that does not reproduce the token, unbalanced parentheses, a wholly silent syllable, and a new check, a syllable whose IPA has a vowel but whose pronounced spelling has no vowel letter (the `je` /ʒə/ with a silent e case; all-caps initials are exempt). An invalid connection or stress mark is dropped alone, including one pointing at a demoted word.
- **Unchanged:** a sentence that still fails stops generation, and the marker view still requires every supported sentence. Whether a failed sentence may be skipped is an open product decision.
- A user-customized prosody template written for the old index format will fail the new parser until reset.

## Goal and visual baseline

Bring the approved v7 pronunciation-marker design into the real reader, using the learner's French article rather than hard-coded sample annotations.

The reference artifact is `/tmp/relire-prosody-prototype.html` (v7), with screenshots `/tmp/prosody-checked-1280-light.png` and `/tmp/prosody-checked-375-dark.png`. These are local reference artifacts, not product assets. The following specification is sufficient if those temporary files are unavailable:

- Preserve Relire's quiet reading-room direction, Source Serif 4, and existing theme tokens.
- Draw connection curves below the adjoining words, never above them. Use `ink-600`, rounded ends, 1.25 px stroke for liaison and 1 px for enchaînement. Curve sag is approximately 5 px and 3 px respectively at 21 px body size.
- Place a 1.3 px radius stress dot approximately 2.8 px below the actual glyph bottom, centered on the marked spoken syllable. Do not position it relative to the full line box.
- Use `ink-500` for genuinely silent spelling spans and slash separators, subject to contrast verification in all themes. Never fade an entire word as a substitute for analysis.
- Show `/` at spoken-syllable boundaries whenever the syllable layer is enabled. Use a 0.3 em separator slot and approximately 0.85 em separator size. No letter-spacing treatment and no selection-only separators.
- No rhythm-group lines. Group-final stress remains a pronunciation suggestion, not a claim that every French word is independently stressed in speech.
- Use 2.05 line-height in marker mode to accommodate the marks; ordinary reading retains the existing 1.8 line-height.
- Preserve the article's original spelling, punctuation, apostrophes, and hyphens. The prototype's manually chosen annotations are not a lexical truth source.

## Scope

### Building

An explicit reader mode with four independently selectable layers: connections, stress, silent letters, and spoken syllables. All four layers default to enabled within this mode, matching v7. A new article starts in ordinary reading; subsequent visits restore its saved display and layer choices only against complete validated cached answers.

Generate sentence-addressable annotations through the current text provider. Validate them, cache them locally, and render them over the original article. Existing word lookup, sentence analysis, vocabulary saving, and article/sentence playback continue to receive unannotated source text.

### Not building

- A backend, new AI provider, dictionary-scraping service, account, or new package dependency.
- Audio transcription, phoneme timestamps, or estimated word-by-word karaoke. Keep the existing sentence-level playback highlight.
- New pronunciation scores or changes to recording and assessment.
- New article fields, a new IndexedDB store, or backup migration.
- A general French pronunciation rule engine or a promise of exhaustive coverage.
- Media-import features from `docs/real-content-learning-design.md`. That separate document is an unapproved proposal and does not authorize a backend here.

## Linguistic contract

1. Use standard French oral pronunciation, with the Académie française as the terminology and usage reference. Do not label AI-produced per-word annotations as academy-authored or certified.
2. `/` represents the word's ordinary spoken-syllable segmentation, not written hyphenation. Connection curves separately explain word-boundary liaison or enchaînement; slashes are not a full resyllabification transcript of continuous audio.
3. Final silent `e` does not create an extra spoken syllable. Do not force a casual internal-schwa deletion. Where normal readings vary, use a conservative ordinary reading or explicitly return an unresolved annotation.
4. Silent spelling must be considered by grapheme group and context. Letters participating in nasalization or multi-letter sound spellings are not independently faded just because they lack a separate consonant sound. For example, nasalizing `n`, `ch`, `ou`, and the `-er` spelling need group-aware analysis.
5. Distinguish liaison (normally silent consonant realized at a word boundary) from enchaînement (a consonant already pronounced). Initially render obligatory liaisons and unambiguous enchaînements; optional or uncertain connections remain unmarked. Do not draw a connection across punctuation or a known aspirated-h boundary.
6. A letter pronounced through a rendered liaison cannot simultaneously be faded as silent. Disabling the connection layer hides only its curve; it does not change the chosen pronunciation.
7. Stress dots identify proposed phrase/group-final spoken syllables. Their location is contextual and not inferred from the last written vowel or last letter.
8. Unresolved words remain legible and unmarked. Report incomplete coverage in the controls. Absence of a mark must not be presented as proof that a word has no silent letters or connections.
9. These are text-based learning suggestions, not alignment to the currently selected TTS voice or recording. Provider output can be structurally correct yet linguistically wrong; runtime validation cannot certify pronunciation accuracy.

References checked during planning:

- [Académie française: syllabe](https://www.dictionnaire-academie.fr/article/A9S3815), distinguishing oral from written syllables.
- [Académie française: the unstable/silent e](https://www.academie-francaise.fr/extension-du-domaine-du-e-muet).
- [Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter), for grapheme segmentation, not phonetic syllabification.
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), including the need for application-level semantic validation.

## Reader interaction

Add a direct pronunciation-markers switch and separate settings button to the existing reading toolbar. The settings panel floats over the article, follows the existing overlay/focus conventions, and contains generation, status, and layer controls. On a narrow screen the panel fits the available width; errors and progress are inside the panel, never new rows in the reading column.

Flow:

1. Opening the panel performs no paid request. Explain that generation sends the requested French sentences to the already configured text provider.
2. The learner explicitly starts article generation. Check the cache first, then request every uncached sentence sequentially, with at most one logical sentence task in flight; Stop cancels the rest. The panel shows the remaining count while it runs.
3. Support Stop. It prevents new tasks; an already sent provider request may finish and may still be charged. Do not claim transport cancellation that the current provider interface cannot provide.
4. Stage successful annotations without changing the article's text layout. Show actual progress and incomplete/error counts in the panel. A provider or validation failure pauses new network work and exposes the real error. Retry uses already cached successes and requests only missing/failed sentences.
5. The marker view is enabled only once preparation has completed (every supported sentence has a validated staged answer); until then its toolbar switch opens the panel to guide explicit generation, rather than requesting AI or enabling incomplete results. The switch is temporarily disabled during cache recovery. Switching it on applies the staged snapshot explicitly. Unprocessed or unresolved text stays as original text, status distinguishes partial coverage, and a result with no usable marks does not enable a misleading empty marker mode.
6. Switching between ordinary reading and marker mode is an intentional layout change, because visible slashes occupy width. Preserve the current reading anchor across the switch. Normal reading has no invisible micro-spacing.
7. Within a displayed marker snapshot, reserve slash slots even when the syllable layer is hidden. Layer toggles change visibility/color, not word positions. New results are staged; the toolbar switch applies them, never a late network response.
8. Word tap or Enter/Space still opens the existing word detail. Decorative slashes, dots, and SVGs do not change lookup text or screen-reader text. Connections and their sound/type have a text explanation reachable by touch and keyboard, not just hover.
9. Mode/layer choices persist per article in `relire_pronunciation_preferences_v1`, including after refresh or browser restart. Entry reads and validates cached answers automatically, with stale identity/unmount guards. Readiness is derived from those answers, never a separate generated boolean. Only complete usable results can restore an enabled choice; partial, expired, invalid or cleared caches stay plain until explicit generation. Content/language/prompt identity is rechecked, and cache recovery never makes a paid request. These local UI preferences are not included in backups.

Missing-key behavior reuses the app's settings entry point. Valid cached results work without a key and offline. A cache miss cannot fabricate markers. Stop or leaving the reader prevents further queued work.

## Module responsibilities and data flow

```text
ReaderView
  |-- PronunciationControls <--> usePronunciationMarkers
  |                                 |
  |                                 v
  |                            services/api.ts
  |                            /             \
  |                 cachedRequest/cache     AI tasks
  |                                         |
  |                                  templates + JSON schema
  |                                         |
  |                                   existing provider
  |
  `-- PronunciationParagraph --> ReaderWord + measured SVG geometry
                                      ^
                                      |
                         canonical reader tokens + validated annotations
```

The seam exposed to the reader is a single marker-generation hook: it owns cache-first preparation, the sequential queue, staged/displayed snapshots, request identity, progress, and errors. UI modules do not construct prompts or touch IndexedDB. Rendering consumes only validated annotations and the canonical source tokens.

- `splitArticle` remains the shared sentence cutter for reading and listening. Do not create a second sentence regex.
- Extract the reader's word tokenization/rendering into focused modules rather than adding more persistence and AI logic to the already 506-line `ReaderView`.
- Canonical word tokens identify each occurrence by its ordinal within its sentence and source span, not by a search for the word string. Preserve original apostrophes and internal hyphens. Maintain the existing lookup convention for elided prefixes.
- Use `Intl.Segmenter` at grapheme granularity to avoid splitting a combining accent. Unsupported browsers retain ordinary reading and show the capability error; do not add a polyfill package in this change.
- The model receives sentence text and an enumerated token list. It returns token references and local grapheme boundaries, never HTML, SVG, CSS, or free-form instructions for execution.

### New annotation contract

The new shared type describes a versioned sentence result, separate from `SentenceAnalysis` and `Article`:

| Record | Required information |
| --- | --- |
| Sentence result | Schema version 1; sentence source echo; an entry for every canonical word occurrence; connection list; stress list |
| Word entry | Token ordinal; source-word echo; resolved/unresolved status; ordinary IPA syllables and matching spelling-boundary positions; silent grapheme ranges for the chosen contextual reading |
| Connection | Adjacent left/right token ordinals; liaison or enchaînement; sound; the pronounced left-word span when needed to rule out conflicting silent styling |
| Stress | Token ordinal; spoken-syllable index and its visible, pronounced grapheme anchor range |

All local ranges use grapheme indices with an inclusive start and exclusive end. Word entries are complete even when unresolved; unresolved entries contain no invented phonetic data and cannot be connection/stress targets.

Validate unknown provider output before caching or rendering:

- Correct version, field types, finite integer indices, and permitted enum values.
- Exactly one entry per input occurrence, no missing/duplicate/extra token references.
- Source echoes agree under the declared cache-equivalent normalization; always render the original input, never a model echo.
- Boundaries are ordered, within the token, and do not split a grapheme; written parts reconstruct the token, and IPA/visible syllable counts agree. Every declared IPA syllable needs a vowel nucleus, including nasal vowels and lax Canadian variants; a written vowel (especially silent e) is not evidence of one. Spelled initials such as T/C/F are valid syllables when their IPA has nuclei. If a word has a consonant-only IPA entry among otherwise usable syllables, suppress its slashes and retain the joined IPA as unsegmented pronunciation, not a claim that the word is monosyllabic. Do not invent replacement boundaries. A wholly vowel-less resolved IPA is rejected.
- Silent and stress spans are valid, nonempty, and do not conflict with the declared pronounced spans. Silent ranges are trimmed so they never cover elided-prefix spelling (l', d', j', m', qu'... — the elided consonant is always pronounced). A stress anchor is intersected with its syllable's spelling range; an empty intersection is an error (wrong syllable index), a crossing boundary is tolerated. Trim silence from the anchor and select a single continuous audible letter span (longest, rightmost on ties); never envelop separated spans across silent spelling. If the anchor is entirely silent, select such a span from its own syllable.
- Connections target adjacent resolved words in the same sentence, without intervening punctuation. A connection's pronounced range wins over word-in-isolation silence: the overlap is trimmed from the silent ranges (a realized liaison consonant is not silent in this context); a pronounced range containing no letter is an error.
- Validate every field before semantic filtering. Stress indices must refer to the original supplied syllable list and anchors must be valid even if segmentation repair later removes the stress. Connection sound/range fields must be valid even when the right word's consonant-initial IPA makes the connection impossible and its curve is dropped. Malformed fresh output is an error; malformed cached output is deleted.
- Text fields are bounded; model strings are plain text through React, never `dangerouslySetInnerHTML`.

A malformed result is an error, not a partially trusted answer. An intentionally unresolved word is valid incomplete coverage. Validate cached results again against the current canonical input; reject/delete an incompatible entry rather than applying it to a different occurrence.

### AI and cache changes

- Add a provider-neutral `prosody` task and `fetchPronunciationMarkers` entry point in `services/api.ts`.
- Add English/Chinese editable prompt templates and registry variables for the sentence and enumerated tokens. Input article text is data, not instructions.
- Extend `JsonRequest` with an optional JSON-schema field. The existing Gemini adapter forwards it as `responseJsonSchema`; other tasks retain their current behavior. The installed SDK already exposes this option. Use a fixed shape-only schema (field types, small version/status/type enums, required fields), with no sentence-dependent array limits or ordinal enums: Gemini's serving-time state budget is not reliably bounded by a token-count threshold. Exact word counts, unique ordinals and all ranges are enforced locally against the enumerated source. Keep the prompt/cache fingerprint unchanged when only serving-time constraints change. No Zod dependency.
- Keep a runtime validator even with provider-side structured output. Schema validity is not linguistic validity.
- Add `prosody` to the existing cache kind, with the sentence-analysis policy: 30 days, at most 1,000 entries. Include schema/tokenizer version, language, prompt fingerprint, and normalized sentence in the key. Do not add provider, model, or article context to the key.
- Cache-equivalent normalization trims/collapses whitespace and folds case; local token ordinals and grapheme spans are independent of surrounding whitespace. Check token equivalence before reuse, so normalization cannot silently misattach spans.
- Update cache counts and the Settings saved-answer summary/clear-button calculation. Prosody answers are cleared with existing cached answers, not exported in backups.
- Only extend the `CacheEntry.kind` type in `db.ts`. The existing store/index supports another kind; no IndexedDB version bump or new persisted user entity is needed.

### Rendering and lifetime rules

- Use a paragraph-local SVG overlay with pointer events disabled and accessible text supplied separately. No `white-space: nowrap` wrapper around connected word pairs.
- Measure the last/first relevant text fragments with DOM Ranges. Position stress from the actual text baseline/ink descent, not the CSS line-box bottom. Scale the reference geometry with font size.
- A connection across a line break becomes two short local tails, never a diagonal through another line. Long words can wrap without horizontal overflow; select the relevant local range fragment for each mark.
- Recompute after font readiness, size changes, mode/snapshot changes, and paragraph resizing. Batch geometry reads/writes with animation frames. Disconnect observers/listeners and cancel frames on unmount.
- In marker mode an unresolved word renders its elided prefix in normal ink; the light prefix tint stays a plain-reading convention, so in marker mode grey can only assert analysed silence.
- Make generated slash content decorative and excluded from selection/copy. Confirm actual clipboard text in the browser. TTS and all analysis calls use canonical source strings regardless of DOM decoration.
- Async generation checks a session identity including article ID, exact article content, language, prompt fingerprint, and schema/tokenizer version. Switching input, stopping, or unmounting prevents stale state writes and new tasks. An already validated result may remain cached for its original input.
- Entry may restore a complete validated snapshot according to the saved display choice. After recovery, the displayed snapshot changes only through an explicit toolbar switch action. Transient loading/error states and layer toggles do not reflow text.

## Implementation order and file scope

Deliver one complete, usable feature slice on `feat/reader-pronunciation-markers`, not on `main`. The steps below are implementation order, not separately releasable phases:

1. Canonical tokens, shared annotation type, schema, validator, templates, task, and cache integration.
2. Source-preserving word rendering and paragraph SVG geometry using fixtures outside production content.
3. Generation hook, overlay controls, displayed snapshots, and missing-key callback integration.
4. Both locales, saved-answer accounting, documentation/changelog, browser verification, and diff review.

This spans more than eight files, approximately 25-30, because templates, both locales, typed provider integration, cache accounting, and UI verification must change together. Main targets:

- Existing: `src/components/ReaderView.tsx`, `src/App.tsx`, `src/components/settings/DataSection.tsx`, `src/services/api.ts`, `src/services/ai/types.ts`, `src/services/ai/tasks.ts`, `src/services/ai/providers/gemini/client.ts`, `src/services/ai/prompts/{index,registry}.ts`, `src/storage/{cache,db}.ts`, `src/index.css`, `src/i18n/locales/{en,zh}.json`.
- New: `src/components/reader/{PronunciationControls,PronunciationParagraph,ReaderWord}.tsx`, `src/hooks/usePronunciationMarkers.ts`, `src/utils/{readerTokens,pronunciationMarkers}.ts`, `src/types/pronunciation.ts`, `src/services/ai/prosodySchema.ts`, `src/services/ai/prompts/defaults/prosody.{en,zh}.txt`.
- Verification/docs: `e2e/fixtures.ts` (originally the verify-ui harness) for task detection/fixtures, `docs/architecture.md`, `DESIGN.md`, `CHANGELOG.md`, and this proposal's final status.

Preserve existing user work: `.gitignore` has an unstaged `.works/` addition and `docs/real-content-learning-design.md` is untracked. Do not stage, revert, or rewrite either file. No PR, merge, push, or release is authorized by this proposal.

## Verification and release gate

Run `bun run lint`, `bun run i18n:check`, `bun scripts/check-prosody-schema.ts`, `bun run build`, and `impeccable detect --json src index.html`. The detector must report `[]`. `impeccable` is not currently on PATH; report that verification as blocked unless an approved existing installation can be located. Do not claim a clean detector run or install a new project dependency to hide the gap.

Use the `verify-ui` skill with the real app and mocked AI responses, Chrome available locally, and the scratch Playwright installation outside the repo. Extend task detection so `prosody` cannot accidentally be answered by a word-analysis fixture.

Acceptance cases:

- Ordinary reading on first entry sends no marker request and has no separator spacing.
- Generate/display all four layers on learner text; Stop/Generate/Retry work; counts reflect real work. One run processes every uncached supported sentence sequentially, with one logical sentence request in flight. Completion/apply messaging stays hidden while any supported sentence remains or generation is running.
- Word/sentence lookup, vocabulary saving, sentence playback and article playback receive the exact unannotated source. Clipboard output contains no synthetic slashes.
- Repeat generation uses cache/in-flight sharing; changing the template invalidates it; cached results display without a key/offline; an uncached missing-key action opens Settings.
- Loading, errors, layer toggles, and late results cause no article layout shift. Mode/apply actions may reflow, but preserve the reading anchor and correctly reposition the existing sentence-action pill.
- API failure, malformed JSON/schema, shifted/duplicate words, out-of-range or combining-accent boundaries, unknown pronunciation, and contradictory silence all follow the specified failure path. No fabricated fallback.
- Repeated identical sentences/words, typographic apostrophes, elisions, hyphenated words, leading punctuation, paragraphs without final punctuation, and source changes cannot misattach markers.
- Bound individual provider input to 2,000 source characters per sentence without silently truncating it. Oversized sentences stay original and are reported as unsupported; other supported sentences remain usable.
- Cross-line connections, long words, all four font sizes, font loading, resizing, and rapid article/language switches work without orphan marks or stale UI writes.
- Check 360x740 and 1280x900 in light/sepia/dark and both interface languages. Inspect screenshots against v7, including close-up stress-dot geometry; verify contrast, keyboard/touch actions, focus, Escape, and no horizontal overflow.
- Settings counts include markers; Clear answers handles a marker-only cache; backups still exclude caches and API keys; old articles/backups remain readable.

Use throwaway checks for tokenization/validator invariants as well as browser flows; do not introduce a test framework dependency. Browser fixtures prove rendering/orchestration, not live phonetic correctness. A real-provider linguistic check requires a separately authorized call using the learner's existing key; no key is requested or read during planning. Inspect a short corpus against reference pronunciations before claiming annotation quality.

Finish implementation with the project's `ship-change` skill and report any unverified gate. Do not merge or publish automatically.

## Recommendation, risks, and rollback

Recommended: a dedicated, validated AI annotation task plus local source-preserving rendering. Reuse the existing provider/cache/overlay patterns. Existing sentence-analysis prose is not a reliable machine-readable marker representation.

Minimal option: generate and display only the selected sentence with the same four layers and validation contract. It reduces queue/UI work, but does not meet the desired full-article experience, so it is not the recommendation.

The most fragile assumption is that the configured text model can provide useful context-sensitive phonetic annotations. If that assumption fails, structural checks alone will not save quality. Keep unresolved input unmarked, label output as AI suggestions, retain ordinary reading, and do not ship claims of academy-certified accuracy or audio alignment.

Failure/scale defenses: generation is explicit and sequential (one sentence task at a time), successes are reusable, provider failure stops new work, and Stop cancels the rest of a long article rather than letting it run unattended. Existing provider-level retries/model fallback still apply; a sentence count is not an exact paid-request or token-cost estimate.

Rollback requires no user-data migration. Remove the mode/task and ignore the disposable `prosody` cache entries; articles, saved vocabulary, pronunciation history, settings keys, and audio remain intact. Clear disposable entries through the existing storage layer when appropriate, never by deleting user data.

Dependencies: the user's existing text-provider API key and account only. Official documentation was reachable; the Google API host responded to an unauthenticated reachability check. No authenticated generation, paid API call, or production linguistic verification was performed during planning.
