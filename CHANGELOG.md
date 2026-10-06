# Changelog

What changed in Relire and why, newest first. Format follows [Keep a Changelog](https://keepachangelog.com); the project is not released yet, so everything sits under **Unreleased** until the first tagged version.

**How to use this file:** every change a user could notice (a feature, a behaviour change, a removal, a fix) gets a line under Unreleased in the same commit that makes it. Group by *Added / Changed / Fixed / Removed*. Say what the user gets, not which files moved. When a version is tagged, rename Unreleased to the version and date and start a new Unreleased.

## [Unreleased]

### Added
- **Separate AI for explanations and for speech.** Settings has a provider, model and key for each, so they can differ; Gemini is the only provider today and the app is structured so others are added by implementing one interface and registering it. Each provider keeps its own key; unknown or invalid saved choices fall back to defaults.
- **Editable prompts.** Every prompt is now a plain-text template (English and Chinese) with variables and simple conditions. Settings shows them, previews them with sample values, warns about unknown variables, and resets any prompt to the original; edits are included in backups. Cached answers are keyed by the prompt in use, so an edited prompt gets fresh answers and resetting brings the old ones back.
- **Saved pronunciation audio.** Every synthesized clip is stored on the device and played from there, so it is generated once and works offline. Audio for words in the vocabulary (the word, its context sentence, its example sentences) is kept for good; other clips are trimmed least-recently-used past 200 MB. Settings shows the amount and can clear the rest. Backups can optionally include the vocabulary's audio; if some clips cannot be saved while restoring, Settings says how many.
- **Saved explanations with the word.** Saving a word stores its full explanation (conjugation, examples) on the vocabulary entry and fetches its audio in the background.
- **Saved AI answers.** Word analyses are kept until cleared (no entry limit), sentence analyses and practice drills for 30 days, so repeating them costs nothing and cached answers work without a key. Identical requests in flight are shared. Settings shows the counts and can clear them.
- **Practice drills keep their set** per article and type; the last question offers "New questions" to replace it.
- **Progress page: French sounds in IPA.** A tap-to-hear chart of vowels, nasal vowels, semi-vowels and consonants with an example word each.
- **Article library.** The Read tab opens a table of articles with search, level filter, sortable columns, add, edit and delete (with confirmation) and a way to restore the sample articles. Opening an article shows the reader with a back link.
- **First-run guide.** Three steps: welcome, connect Gemini (the key is checked before it is saved), try a sample article. Skipping leaves a banner until a key is set.
- **Navigation.** Flat tabs from tablet width up and a left drawer on phones; the interface language is a single icon with a menu.
- **IndexedDB storage** for articles, vocabulary and stats, with debounced saves that flush when the page is hidden, a banner when a save fails, storage use and a "Protect my data" request in Settings.
- **Translation check** (`bun run i18n:check`, run in CI) that fails on missing or mismatched keys and hard-coded Chinese text.
- Repository basics: MIT licence, English and Chinese README, PRODUCT, DESIGN and CLAUDE guides, CI that type-checks, checks translations and builds.

### Changed
- **Shadowing section redesigned.** In the sentence sheet, "Shadowing" is now one clear block: how to say it (pace, phrasing as chips, liaisons, intonation, each label above its text), then Record, play back your recording, and Check pronunciation, then the result (overall score, accuracy / fluency / rhythm, sounds to work on with a status icon, words to fix, notes). The long "AI Shadowing Coach & Pronunciation Evaluation" title, its repeated subtitle and the off-palette colours are gone, and the record button is readable again. Practice's speaking drill uses the same component, so the two behave alike. Mic and scoring errors show inline with the real reason instead of an alert, a new recording clears the old result, and closing the sheet releases the microphone. Starting a new question clears the previous recording and score even when two questions use the same sentence, and a microphone that fails to start is released at once.
- **Code structure:** the AI layer is split into providers, prompt templates and tasks; the speech code into stored clips, playback and recording; Settings into a shell plus AI, prompts and data sections. Behaviour is unchanged (the default prompts are word-for-word the previous ones).
- **Renamed to Relire** ("to read again"), with a new icon.
- **Runs entirely in the browser.** The Express server is gone; Gemini is called directly with the user's own key, which stays in the browser. The build is a static PWA that can be hosted anywhere and installed. Bun is the only package manager.
- **Playing audio no longer moves the page.** The "now playing" bar that pushed the article down on every play is gone. Loading and playing show on the button you pressed (speaker, spinner, stop square) at a fixed size, and in the reader the playing sentence is highlighted. Escape, or leaving the article, stops the clip; stopping while a clip is still loading now really cancels it, and starting another clip replaces it. The reader's speed panel floats over the article instead of pushing it down. This covers the reader, word and sentence sheets, practice, vocabulary and the IPA chart.
- **Sentence actions float over the text** as a compact pill that follows the reading theme (white, parchment, sepia, dark) and sits at the end of the sentence — directly below its last line, flipping above it near the bottom of the screen — so reading no longer shifts while hovering. On touch, tapping a word keeps the sentence's actions visible after the lookup sheet closes.
- **Design language unified:** one ink-blue accent, warm neutral paper, Source Serif 4 for reading and Public Sans for the interface, a 68-character reading column, one radius and elevation scheme. Word and sentence lookups open in a side sheet (bottom sheet on phones); tasks that need focus use a dialog.
- Practice shows the real error, or opens Settings when there is no key, instead of substituting canned drills.
- Backups never include the API key.
- Model, voice and level names, service errors and remaining labels moved into the locale files; Chinese copy tidied (no French parentheticals, no "Mac" wording); page title and `lang` follow the language.

### Fixed
- In the English interface, the pattern-example translations in a sentence lookup showed Chinese; they now follow the interface language (English when the analysis has it, falling back to Chinese for older saved answers).
- The sentence sheet's shadowing card squeezed its title, subtitle and tip into one row and overflowed on narrow screens; the speed presets overflowed a 360 px phone too (now five equal columns).
- Vocabulary cards had black borders and an invalid hover class.
- The phone header overflowed sideways.
- Prose containing the word "rounded" had been rewritten by a find-and-replace.

### Removed
- Invented first-run data: sample statistics, three sample vocabulary words, the study-streak tile.
- The hard-coded "AI coach" diagnosis and per-sound status chips on the Progress page.
- Gradients, glass blur, bounce and pulse animations, emoji icons and uppercase eyebrow labels.
- Duplicate controls: the language section in Settings and the Import button in the header.
