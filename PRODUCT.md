# Product

## Register

**Read** for the reader, **Operate** for vocabulary, practice, analytics and settings. Nothing in the app is Persuade; there is no marketing surface.

## What it is

Éclair Français is a French deep-reading and speaking-practice app for Chinese-speaking learners (UI also in English). The learner reads real French articles and taps any word or sentence to get an AI-generated breakdown from Gemini. Words they save feed a spaced-repetition deck, and they practise pronunciation aloud against an AI assessor. It runs as a PWA (installable on Mac/iOS) backed by a small Express server that proxies Gemini; all user data lives in the browser's localStorage.

## Users

Intermediate learners (roughly A2–C1) preparing for TCF/DELF/DALF or reading French for pleasure. They are mostly Chinese speakers on a laptop or phone, in sessions of 15–45 minutes, often in the evening. They are already reading in a second language, so extra visual noise costs them real attention.

## Core jobs, in priority order

1. **Read an article without losing the thread.** The text is the product. Chrome recedes.
2. **Understand a word or sentence in context, then return to reading.** Lookups are brief detours: word (meaning, IPA, conjugation, examples), sentence (syntax segments, grammar points, shadowing guide).
3. **Keep what was learned.** Save words, review them on an SM-2 schedule (ratings 1/3/4/5).
4. **Speak and be corrected.** Shadowing and open practice with a score plus phoneme, liaison and intonation feedback.
5. **See progress honestly.** Counts and scores from real data only.

## Screens

- **Reader**: article picker/importer, reading settings (font size, theme: parchment / white / sepia / dark, playback speed), tap-to-analyse words, sentence toolbar (play, analyse).
- **Word detail**: translation, IPA, tense, conjugation table, usage examples, save to vocabulary.
- **Sentence drawer**: translation, syntax, grammar points, collocations, shadowing record and score.
- **Vocabulary**: list plus flashcard quiz with SRS ratings.
- **Practice**: AI-generated drills and oral assessment.
- **Analytics**: summary figures, phoneme profile, coach synthesis.
- **Settings**: API key and model, voice, language, backup/restore JSON.

## Tone and personality

A quiet, well-edited reading room: calm, literate, precise. French printed matter is the reference (a good paperback, a dictionary), not a gamified language app. Encouraging in copy but never cute; errors name the problem and the way out.

## Anti-references

Duolingo-style gamification (streak flames, confetti, mascots), generic AI-dashboard styling (gradients, glass, glowing cards, rainbow icons, hero-metric tiles, emoji as icons), and anything that makes the article column feel like one widget among many.

## Design principles

1. **The article is the page.** Reading column 60–70ch, generous leading, a real text face. Everything else is secondary and quieter.
2. **Lookups are detours, not destinations.** Contextual lookups open in a side sheet (bottom sheet on phones) beside the text and never hide it. Centered modals are reserved for tasks that need focus: settings, import, install.
3. **One accent, used for action and the current selection.** Colour beyond that is semantic only: success, error.
4. **Show real data or nothing.** No invented scores, streaks or levels; empty states say what to do next.
5. **Touch and keyboard are first-class.** Hover never gates a feature; targets are at least 40px on touch; focus is always visible; motion is short and respects reduced-motion.
6. **Chinese and French typeset together.** Layouts tolerate CJK and Latin mixed lines, long French words and translated strings of different length.

## Constraints

React 19, Vite, Tailwind v4, lucide-react icons, i18next (en/zh). Client-only persistence in localStorage keys `eclair_*_v1`; keep stored shapes backwards compatible. Gemini is called only from `server.ts`.
