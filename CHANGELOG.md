# Changelog

What changed in Relire and why, newest first. Format follows [Keep a Changelog](https://keepachangelog.com); the project is not released yet, so everything sits under **Unreleased** until the first tagged version.

**How to use this file:** every change a user could notice (a feature, a behaviour change, a removal, a fix) gets a line under Unreleased in the same commit that makes it. Group by *Added / Changed / Fixed / Removed*. Say what the user gets, not which files moved. When a version is tagged, rename Unreleased to the version and date and start a new Unreleased.

## [Unreleased]

### Added
- **Saved pronunciation audio.** Every synthesized clip is stored on the device and played from there, so it is generated once and works offline. Audio for words in the vocabulary (the word, its context sentence, its example sentences) is kept for good; other clips are trimmed least-recently-used past 200 MB. Settings shows the amount and can clear the rest. Backups can optionally include the vocabulary's audio.
- **Saved explanations with the word.** Saving a word stores its full explanation (conjugation, examples) on the vocabulary entry and fetches its audio in the background.
- **Saved AI answers.** Word analyses are kept until cleared, sentence analyses and practice drills for 30 days, so repeating them costs nothing and cached answers work without a key. Identical requests in flight are shared. Settings shows the counts and can clear them.
- **Practice drills keep their set** per article and type; the last question offers "New questions" to replace it.
- **Progress page: French sounds in IPA.** A tap-to-hear chart of vowels, nasal vowels, semi-vowels and consonants with an example word each.
- **Article library.** The Read tab opens a table of articles with search, level filter, sortable columns, add, edit and delete (with confirmation) and a way to restore the sample articles. Opening an article shows the reader with a back link.
- **First-run guide.** Three steps: welcome, connect Gemini (the key is checked before it is saved), try a sample article. Skipping leaves a banner until a key is set.
- **Navigation.** Flat tabs from tablet width up and a left drawer on phones; the interface language is a single icon with a menu.
- **IndexedDB storage** for articles, vocabulary and stats, with debounced saves that flush when the page is hidden, a banner when a save fails, storage use and a "Protect my data" request in Settings.
- **Translation check** (`bun run i18n:check`, run in CI) that fails on missing or mismatched keys and hard-coded Chinese text.
- Repository basics: MIT licence, English and Chinese README, PRODUCT, DESIGN and CLAUDE guides, CI that type-checks, checks translations and builds.

### Changed
- **Renamed to Relire** ("to read again"), with a new icon.
- **Runs entirely in the browser.** The Express server is gone; Gemini is called directly with the user's own key, which stays in the browser. The build is a static PWA that can be hosted anywhere and installed. Bun is the only package manager.
- **Sentence actions float over the text** as an icon-only pill anchored above the sentence, so reading no longer shifts while hovering. On touch, tapping a word keeps the sentence's actions visible after the lookup sheet closes.
- **Design language unified:** one ink-blue accent, warm neutral paper, Source Serif 4 for reading and Public Sans for the interface, a 68-character reading column, one radius and elevation scheme. Word and sentence lookups open in a side sheet (bottom sheet on phones); tasks that need focus use a dialog.
- Practice shows the real error, or opens Settings when there is no key, instead of substituting canned drills.
- Backups never include the API key.
- Model, voice and level names, service errors and remaining labels moved into the locale files; Chinese copy tidied (no French parentheticals, no "Mac" wording); page title and `lang` follow the language.

### Fixed
- Vocabulary cards had black borders and an invalid hover class.
- The phone header overflowed sideways.
- Prose containing the word "rounded" had been rewritten by a find-and-replace.

### Removed
- Invented first-run data: sample statistics, three sample vocabulary words, the study-streak tile.
- The hard-coded "AI coach" diagnosis and per-sound status chips on the Progress page.
- Gradients, glass blur, bounce and pulse animations, emoji icons and uppercase eyebrow labels.
- Duplicate controls: the language section in Settings and the Import button in the header.
