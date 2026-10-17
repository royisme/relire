# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

**Read** for the reader, **Operate** for vocabulary, practice, analytics and settings. Nothing in the app is Persuade; there is no marketing surface.

## What it is

Relire (French for "to read again") is a close-reading assistant for French learners preparing for TCF Canada, with a Chinese and English interface. The learner reads real French articles and taps any word or sentence to get an AI-generated breakdown from Gemini. Words they save feed a spaced-repetition deck, and they practise pronunciation aloud against an AI assessor. It is a static PWA: no app server, no account. The learner supplies their own API key (Gemini today), stored in the browser and used for direct calls to the provider; explanations and speech can use different providers. User data (articles, vocabulary, stats, saved answers and audio, shadowing recordings) lives in the browser's IndexedDB; settings and keys live in localStorage.

## Direction: Relire Plus

Relire is absorbing FrenchLab AI so a learner does all of their study in one app: exercises bound to the material (11 types, including dictation and AI-graded open answers), importing workbook pages from images, PDFs or text, a mistake notebook, and drills for weak grammar areas, beside reading and shadowing. Scope therefore widens to listening and writing practice; there are still no mock exams and no official scores. The audience widens to A1–C1. The display name becomes Relire Plus when the first exercise features ship. Everything stays static and BYOK. The approved plan, its phases and the decisions behind them are in `docs/merge-plan.md`; until a phase ships, the sections below describe the product as it is.

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


- **Library** (the Read tab's home): a table of all articles with search, level filter, sortable columns, add, edit and delete. Opening a row opens the reader.
- **Reader**: one article, back to the library, reading settings (font size, playback speed), "Make exercises" (opens Practice for this article), listen to the whole article, optional pronunciation markers, tap-to-analyse words, sentence toolbar (play, analyse, record). Record opens a closable practice card docked at the bottom: reference, record/stop, redo, input level, latest take with play and compare.
- **Word detail**: translation, IPA, tense, conjugation table, usage examples, save to vocabulary.
- **Sentence drawer**: translation, syntax, grammar points, collocations, shadowing record and score.
- **My study**: the learner's own material, in two parts. **Words**: the vocabulary list plus flashcard quiz with SRS ratings. **Shadowing**: every recorded sentence by article, as text | reference audio | my recordings, with compare, delete and open in the reader.
- **Practice**: the exercise units of one article, with the learner's real progress on each, and "Make exercises from this article" (a level and a number of items; items the article cannot support are left out and counted). One unit is one sheet: numbered rows with typed blanks, inline choices, option picks (gender, odd one out, matching) and ordered dialogue lines beside open answers, a check per row and "Check all", hints, explanations of wrong answers, open answers judged by an AI in words (an estimate, never a score), a French character bar, and a unit reset that keeps the history. Eight of the 11 exercise types are playable today (fill in the blanks, choose the option, transform the word, open questions, gender checks, odd one out, matching pairs, ordering a dialogue); the rest say they are coming. The open oral assessment (read a sentence of the article aloud and get a pronunciation score) is its own section on the same page.
- **Progress**: three plain figures (words saved, average pronunciation score, shadowing sessions), recent scores, and a tap-to-hear chart of the French sounds in IPA. No coaching text or invented scores; an AI coach summary is a possible later feature.
- **Settings**: a page with sections that each save on their own: Text AI (provider, model, key), Speech (provider, model, voice, key), editable prompts, stored data (saved answers, audio, shadowing recordings) with backup/restore JSON (recordings optional), and About. Language and theme are single icons in the header.

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