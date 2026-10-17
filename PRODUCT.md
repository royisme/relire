# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

**Read** for the reader, **Operate** for vocabulary, practice, analytics and settings. Nothing in the app is Persuade; there is no marketing surface.

## What it is

Relire (French for "to read again") is a close-reading assistant for French learners preparing for TCF Canada, with a Chinese and English interface. The learner reads real French articles and taps any word or sentence to get an AI-generated breakdown from Gemini. Words they save feed a spaced-repetition deck, and they practise pronunciation aloud against an AI assessor. It is a static PWA: no app server, no account. The learner supplies their own API key (Gemini today), stored in the browser and used for direct calls to the provider; explanations and speech can use different providers. User data (articles, vocabulary, stats, saved answers and audio, shadowing recordings) lives in the browser's IndexedDB; settings and keys live in localStorage.

## Direction: Relire Plus

Relire is absorbing FrenchLab AI so a learner does all of their study in one app: exercises bound to the material (11 types, including dictation and AI-graded open answers), importing workbook pages from images, PDFs or text, a mistake notebook, and drills for weak grammar areas, beside reading and shadowing. Scope therefore widens to listening and writing practice; there are still no mock exams and no official scores. The audience widens to A1–C1. The display name becomes Relire Plus in phase 6. Everything stays static and BYOK. The approved plan, its phases and the decisions behind them are in `docs/merge-plan.md`; until a phase ships, the sections below describe the product as it is.

## Positioning

Real French articles read sentence by sentence, where every sentence can be heard, repeated aloud and kept as a recording to compare against the reference later. The learner brings their own AI key; there is no account, and everything stays on their device.

## Users

Intermediate learners (roughly A2–C1) preparing for TCF/DELF/DALF or reading French for pleasure. They are mostly Chinese speakers on a laptop or phone, in sessions of 15–45 minutes, often in the evening. They are already reading in a second language, so extra visual noise costs them real attention.

## Core jobs, in priority order

1. **Read an article without losing the thread.** The text is the product. Chrome recedes.
2. **Understand a word or sentence in context, then return to reading.** Lookups are brief detours: word (meaning, IPA, conjugation, examples), sentence (syntax segments, grammar points, shadowing guide).
3. **Keep what was learned.** Save words, review them on an SM-2 schedule (ratings 1/3/4/5).
4. **Shadow a sentence and keep the record.** Hear a sentence, repeat it right away, and keep the last few takes per sentence to replay and compare with the reference at any time. No score is required.
5. **Speak and be corrected.** Optional AI assessment: a score plus phoneme, liaison and intonation feedback (open practice and the sentence sheet today; an optional score for shadowing takes later, switched in Settings).
6. **See progress honestly.** Counts and scores from real data only.

## Screens

First run: a three-step guide (welcome, connect Gemini with a checked key, try a sample article). Skipping is allowed and leaves a persistent banner until a key is set.


- **Library** (the Read tab's home): a table of articles and workbooks with search, level filter, sortable columns, add, edit and delete. Readable material opens Reader; a workbook without prose opens its own Practice unit list.
- **Import**: image, PDF or pasted workbook text, explicit model/content consent, editable question review and inclusion, then atomic save as exercises, an article or both. Exercises-only may create a workbook without prose. Drafts are in memory and warn before leaving.
- **Reader**: an article or a distinct exercise-unit passage, back to the library or its exercise sheet, reading settings (font size, playback speed), "Make exercises" for material prose (opens Practice for this article), listen to the whole article, optional pronunciation markers, tap-to-analyse words, sentence toolbar (play, analyse, record). Record opens a closable practice card docked at the bottom: reference, record/stop, redo, input level, latest take with play and compare.
- **Word detail**: translation, IPA, tense, conjugation table, usage examples, save to vocabulary.
- **Sentence drawer**: translation, syntax, grammar points, collocations, shadowing record and score.
- **My study**: the learner's own material, in three parts. **Words**: the vocabulary list plus flashcard quiz with SRS ratings. **Shadowing**: every recorded sentence by article or unit passage, as text | reference audio | my recordings, with compare, delete and open in the reader. **Mistakes** (`#/study/mistakes`): the latest wrong answer per exercise item, grouped by grammar area, with the actual prompt, given and reference answers and a resolved marker after a later correct attempt. Explanations use the saved attempt and the surviving unit context, if available. Tap a word to look it up and save it through the usual word sheet; retry opens the saved unit without resetting it. Deleted sources keep their readable history but have no unavailable links.
- **Practice**: the exercise units of one article or workbook, with the learner's real progress on each, and "Make exercises from this article" (a level and a number of items; items the article cannot support are left out and counted). One unit is one sheet: numbered rows with typed blanks, inline choices, option picks (gender, odd one out, matching), ordered dialogue lines, word tiles that build a sentence, a reading passage that sits beside its questions, a dictation Listen button and open answers, a check per row and "Check all", hints, explanations of wrong answers, open answers judged by an AI in words (an estimate, never a score), a French character bar, and a unit reset that keeps the history. Words in prompts, reading passages, hints and explanations open the usual word sheet and can be saved to vocabulary, with the current unit’s instructions and passage as context, never an unrelated last-read article. Enter or Space on a word opens lookup without checking an answer; answer fields keep their Enter and composition rules. Answer-choice buttons and word tiles keep their answer actions. A passage opens its exact stored text in the same Reader for listening, word and sentence analysis, pronunciation markers and shadowing, even when the material has different or no prose. Passage recordings stay separate from material prose and other units, keep their source and sentence on return from My study or reload, and can be included in backups. Unit reset keeps them; changed or removed passage text keeps playable history without a broken source link; deleting the parent material removes its passage recordings too. Reading a passage never creates a Library copy or changes the material. All 11 exercise types are playable (fill in the blanks, choose the option, transform the word, open questions, gender checks, odd one out, matching pairs, ordering a dialogue, building a sentence from word tiles, completing a reading passage, writing numbers from dictation). The open oral assessment (read a sentence of the article aloud and get a pronunciation score) is its own section on the same page.
- **Progress**: three plain figures (words saved, average pronunciation score, shadowing sessions), recent scores, and a tap-to-hear chart of the French sounds in IPA. Grammar accuracy shows real correct/total counts by attempted area, weighted by attempt counts rather than averaging topic percentages, including retained history from deleted sources. One action makes a standalone workbook targeting up to three weakest nonperfect grammar topics, at the chosen level and size. The workbook and its units save together; a failed save retains the generated set for storage-only retry without another AI call, and leaving an unsaved set requires explicit discard. No coaching text or invented scores.
- **Settings**: a page with sections that each save on their own: Text AI (provider, model, key), Speech (provider, model, voice, key), Practice (strict accents, dictation speed, speaking after a check), editable prompts, stored data (saved answers, audio, shadowing recordings) with backup/restore JSON (recordings optional), and About. Language and theme are single icons in the header.

## Tone and personality

A quiet, well-edited reading room: calm, literate, precise. French printed matter is the reference (a good paperback, a dictionary), not a gamified language app. Encouraging in copy but never cute; errors name the problem and the way out.

## Anti-references

Duolingo-style gamification (streak flames, confetti, mascots), generic AI-dashboard styling (gradients, glass, glowing cards, rainbow icons, hero-metric tiles, emoji as icons), and anything that makes the article column feel like one widget among many.

## Design principles

1. **The article is the page.** Reading column 60–70ch, generous leading, a real text face. Everything else is secondary and quieter.
2. **Lookups are detours, not destinations.** Contextual lookups open in a side sheet (bottom sheet on phones) beside the text and never hide it. Centered modals are reserved for tasks that need focus: the first-run guide, import, delete, install. Settings is a page.
3. **One accent, used for action and the current selection.** Colour beyond that is semantic only: success, error.
4. **Show real data or nothing.** No invented scores, streaks or levels; empty states say what to do next.
5. **Touch and keyboard are first-class.** Hover never gates a feature; targets are at least 40px on touch; focus is always visible; motion is short and respects reduced-motion.
6. **Chinese and French typeset together.** Layouts tolerate CJK and Latin mixed lines, long French words and translated strings of different length.

## Constraints

React 19, Vite, Tailwind v4, lucide-react icons, i18next (en/zh), Bun. Fully client-side: AI providers are called from the browser with the user's own keys (`src/services/ai`); prompts are editable templates, not code. Client-only persistence: user data in IndexedDB (`src/storage`), settings and API key in localStorage (`relire_*`). Never invent data to fill an empty state.