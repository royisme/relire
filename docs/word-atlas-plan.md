# Plan: what Relire takes from Word Atlas

Plan of record, written 2026-10-25 by the lead from six slice analyses (GPT, GLM, deepseek, Sonnet), a Sonnet consolidation and an Opus (xhigh) review. Nothing here is built. The reference is the open-source IELTS vocabulary app Word Atlas (词光, `github.com/designfuchen/word-atlas`, code MIT, data and art CC BY 4.0); the lead's local clone is `../relire-ref/word-atlas` (outside the repo, read only). The full reports stay local in `.pi-runs/word-atlas/` (`consolidated.md`, `parts/`).

## Verdict

Word Atlas is strong in first impression (README, copy, screenshots), not in learning design. We take presentation and process, not mechanics.

**Learn from it:** a README that opens with the problem, then a numbers table computed from real data, then an honesty block; one primary action whose label follows the real queue; settings hints that give the reason for a default; plain screenshots (no device frames, alt text that states the claim, a desktop and phone pair).

**Do not copy:** the streak flame and daily-goal ring; grades derived from answer speed; the hard-coded time estimate (invented data); extra new words past the daily limit; four accents, grain, glow, in-flow shadows, persona greeting, splash, galaxy and per-word art; their name, brand, voices and sound effects. Their content is English IELTS material of uncertain AI-output rights; we reuse none of it.

**Corrections to the consolidation** (the Opus review checked our code): the theme pre-paint script and live `theme-color` already exist; the content-labelling rule exists (`RULES.md`, Working agreements) and per-entry provenance already exists in the grammar packs and readers, so no new `check` schema; the keyless first run already landed (R1-11), so `PRODUCT.md` First run is stale; the minutes estimate is already specified (`docs/vocab-game-plan.md` 5b item 1); level and topic URL filters do not apply (our book has no CEFR or topic field); our README is factually stale (only Gemini named, "nothing goes through any other server" ignores the content service and Google Fonts, Words and graded readers missing).

## Work packages (order: P1, P2, P4, P6; P3 and P5 run beside anything)

Every dispatch: `magpie quota` first. Code and tests come from different models (`RULES.md`, Delegation); the lead re-runs every check and reads every diff; each package gets a second-model review.

- **P1 Words Overview next action (S).** The Overview shows one filled action whose label follows the real queue: due words, else new words, else none with the next due time; no streak, ring or goal framing; no "+5 more". Counts come from `wordsInput` (`src/services/today/inputs.ts`), so the Overview and Today agree. Fixes a real counting bug (the home shows the bare daily allowance instead of the words actually available) and removes the duplicate Map button. Owner gate: B1.
- **P1b Time estimate (S).** The rule already in `docs/vocab-game-plan.md` 5b item 1 (the 25th to 75th percentile of the gaps between consecutive ratings within a session, a gap over 5 minutes ends a session and a session of k ratings yields k-1 gaps, at least 30 gaps, shown as a range or omitted). Owner gate: Q4.
- **P2 Wordbook review label (S).** On revealed answers (flashcard back, Run reveal) and word details, say the book's real review status from its manifest (unreviewed, or reviewed by whom); never "reviewed" for the unreviewed state. Challenge text is shown before the learner answers, so it stays unlabelled (a label there would clutter the game and a per-option label could hint the answer); the label appears on reveal. Fills the honesty gap.
- **P3 README factual fix, both languages (S).** Providers, privacy (AI provider, optional content service; fonts are now bundled, so no Google Fonts disclosure), the missing areas, the stale conjugation caption, and `PRODUCT.md` First run.
- **P4 Copy pass (S).** Calm full sentences, no jargon (introduction allowance, leech, lapses), reasons for defaults; about 15 strings in en and zh. Owner gate: B2 and the table.
- **P5 Overlay accessibility (S-M).** Dialog: initial focus, restore, Tab trap; Sheet and Drawer: Tab trap and scroll lock. Owner gate: B3 (exception to the hand-written overlay rule).
- **P6 README restructure, screenshots and the screenshot skill (issue #24). Last.** Outline, numbers table (only rows computable from data, with the command), honesty block, shot list from real committed data only, and a skill that refuses non-real data.

**Do not build now:** a search palette (no second caller, new overlay kind, probable dependency), a word sheet from any route with `?w=`, URL filters, a per-entry `check` schema, a fail-set validator or drift script, prefetch, a typographic media fallback, a banner, badges, a Star call-to-action, a launch video, any streak, ring, splash, ambience or per-word art.

## Owner decisions (answer once; defaults are the lead's recommendations)

- **Settled by our docs, one yes confirms all:** Q4 estimate per the existing rule; Q5 the keyless first run already exists (only fix the stale `PRODUCT.md` line); Q6 the README states only what is true (Words outcomes are the learner's own rating; a run's challenge never changes the schedule; Gender rounds count first tries); Q7 no new check schema, show the existing review status; Q11 the map stays a DOM page.
- **B1** the filled Overview action is plain Review, not the game run (keeps the kill criterion unbiased); changes `PRODUCT.md` (Overview) and `DESIGN.md` (Words Overview).
- **Q1** README.md stays English, README.zh-CN.md at full parity. **Q2** no banner, no badges. **Q3** no palette now. **Q8** AI disclosure in the owner's voice (the Opus draft is in the local report). **Q9** no per-word art or hero. **Q12** no Star call-to-action.
- **Q10** screenshots only from committed public content (the sample articles, bundled readers, reviewed verbs, gender pack), personal words saved from it and real cached AI answers, restored from an owner backup kept in `.local/`; never wordbook entries or unpublished reader or topic text; phone shots allowed.
- **B2** the Chinese term for the API key: 密钥 (19 lines) or Key (32 lines); recommended Key.
- **B3** overlay accessibility: hand-written fix for Sheet and Drawer, move Dialog onto the shadcn Base UI dialog.
- **B4** (replaced by F1 after the legal review of 2026-10-25) was to disclose Google Fonts in the README; the fonts are now bundled instead, so there is nothing to disclose.

## Licence

Not legal advice. Nothing is copied, so no attribution is owed; if anything is ever reused, code and UI design are MIT (keep the notice) and data, illustrations and audio are CC BY 4.0 with "Word Atlas contributors — CC BY 4.0", a link and a statement of changes. Voices, sound effects, name and brand are not ours to reuse.
