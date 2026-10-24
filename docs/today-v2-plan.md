# Today v2: an app-like Today with guidance

Status: draft for review (2026-10-24). Owner feedback (2026-10-24): the current Today "has no app design and no guidance"; use the Today and UI of `parlons` (`/Users/royzhu/software/myproject/ts/studypro/parlons`, route `src/routes/index.tsx`, styles `src/styles.css` 467 to 720, mockups `parlons-docs/design/home-options/`, decision in `parlons-docs/docs/25-home-options-and-site-structure.md`) as the reference. Supersedes the view part of `docs/today-plan.md`; the plan model (`buildTodayPlan`, `Source<T>`, stateless, derived from timestamps) stays.

## Why

Today is a plain list: a heading, one sentence, and five rows of title, status and a button. Nothing says what to do first, why, or how far along the learner is; every row looks the same; the page is the first thing a learner sees and it feels like a settings screen.

## What parlons does (read 2026-10-24)

1. A large focus block: one pill label, one large serif item, one line of explanation, one primary button.
2. "Today's path": a bordered list of numbered steps. Each row is one link: a round marker (number, or a check when done), a title, a detail line, a time, an arrow. The summary "N steps · M minutes" sits at the right of the section title.
3. An aside: "completed today" count with a progress track, a small tip card, a quiet note.
4. Option A of the mockups (chosen by its owner): date line, a display headline with a sentence of guidance ("Start with the 9 cards that are due, then ... Stop whenever you like; you will pick up from here"), one very large Start button, the day's steps as a connected line, and an "Or practise one skill on its own" row.

What we do not take: the decorative sound-bar visual and the fixed "10 a day" goal (invented or decorative), the minutes per step (an invented rule: `count * 2`), the olive tinted panel.

## Rules that bind this design (`DESIGN.md`, `AGENTS.md`)

Flat surfaces with 1px `ink-200` rules, no shadow at rest, no tinted boxes for structure, no gradients, no hero-metric tiles, no streaks or invented scores, one filled button per view (the Start button), lucide icons at 16px, headings semibold, no uppercase or letter-spaced labels, nothing below 12px, controls never move the page, every screen checked at 360px and in light, sepia and dark. Every string through `t()` in both locales. Nothing is invented: every number and name on the page is read from stored data.

## Anti-slop rules (owner, 2026-10-24: "the UI must follow anti AI slop")

The first mockup put a coloured bar on the left edge of a rounded card (the owner named it), a tinted block and a progress ring. All three are stock AI-interface patterns. For Today, and for every screen after it:
- No accent bar, stripe or rail on the edge of a card or row. (The sidebar's bar marks a navigation row; it is not a card style and is not extended.)
- No tinted box to make something important, no hero-metric ring or tile, no `rounded-lg` on every block. Importance comes from type size and weight, whitespace, a hairline rule and the one filled button.
- A numbered or connected sequence only when the order is information. Today's order is real (it is the plan's order), so the step line is allowed; decoration is not.
- Nothing decorative that shows data: no waveform, ring or bars that are not a real measurement.
- State is carried by an icon or label inside the control (a check, "Next"), never by a coloured edge.

## Decision before code: two directions (advisor, 2026-10-24)

The owner said the page is too flat, and `DESIGN.md` is the rulebook that produced the flat page. So the choice is the owner's, shown on a static page (`.pi-runs/today-v2/mockup.html`, real tokens, app width and 360 px, light and dark) before any view code. Both directions obey the anti-slop rules: **A, type-led and open**: no card around the next step, hairline rules, a 32px serif headline, one button, the path as an open ruled list; **B, app structure**: one flat card with a plain 1px border, the same headline and button, and the day's steps on a connected line inside it. Neither needs a `DESIGN.md` exception. V1 below works with either and is not blocked.

**Chosen by the owner, 2026-10-24: B (app structure).** The next step sits in one flat card with a plain 1px border and no bar, tint or ring; the day's steps run on a connected line inside it; the aside and the practise-on-your-own row stay as designed below.

## Design

Layout from `md`: a main column and a 17rem aside (parlons: 255px); below `md` one column with the aside after the path. Content stays inside `max-w-5xl`.

1. **Heading block.** A quiet date line (`Intl.DateTimeFormat` with the interface language, 12px `ink-500`), the serif headline "Today", and one guidance sentence built from the plan: "Review 12 words, then read Reader 2 and practise a sound. Stop whenever you like; you will pick up here." The sentence lists only the steps that exist, in order; with no steps left it says the day is done.
2. **Focus block** (the first step not done; no left accent bar, no tint: see "Anti-slop rules" below). Inside: the step icon and "Up next" in `ink-500`, the step's concrete item as a serif 24px headline (words: "12 words to review"; read: the reader's own title; grammar: the topic title; sound: "Sounds of French"; mistakes: "3 mistakes to retry"), one line of why, and the one filled button "Start" with the step's action label, `lg` size. When every step is done the card says so, shows what was done today (real counts), and offers the practise-on-your-own links as outline buttons; no button is filled then.
3. **Path** (section title "Today's path" with "n of m done" at the right). One bordered list; each row is a whole-row link, 56px or taller: a 32px round marker (the number; a check in `ok-800` on `ok-50` when done; a small error icon in `bad-700` when the step failed to load), the icon, the title, the status line (counts or the real error), and a chevron. The next row has a filled accent marker and a semibold title (no bar); done rows are `ink-500` with the check and stay links (a learner may do more). The focus card repeats the next row on purpose: the card is the action, the list is the map.
4. **Aside, "Today so far".** A real progress track (steps done of steps listed, `<progress>` semantics or the shadcn Progress), under it the counts from stored data: words reviewed today, sentences practised today (sound and mistakes attempts), and the readers opened today. A count of 0 is shown as 0. No goal, no streak, no percent beyond the track.
5. **Practise on your own** (option A's row, below the path): links to Words, Read, Speaking and Grammar (always: without a service Grammar still holds conjugation and gender), each with its icon. This is the agency for a learner who does not want the plan.
6. **Guidance copy** (the part that was missing): per step one "why" line, e.g. words: "Each word comes back just before it is due, so a short review keeps what you learned." read: "A short graded text at your level; tap any word for its meaning. No key needed." sound: "Hear and repeat the sounds you will meet in the next text." mistakes: "Retry what you got wrong; a right answer clears it." grammar: "The next topic in the book's order." The lines describe what the step does; they make no claim about results.
7. **States.** Loading keeps the heading and the path skeleton at their final height (no layout shift); a step whose source failed shows its real error on its row and in no other place; `allDone`, no steps (nothing due, no readers, no service: only the sound step exists) and the first run all have a sentence that says what to do next. First run (no reviews, no attempts, no reader opened ever) puts the first reader at the top with "New here? Start with Reader 1: it needs no key." derived from existing data, no new flag.
8. **Small data additions only.** `TodayReader` and the `read` step gain `title` (from the merged catalogue summary, interface language, English fallback as the catalogue already does); the card shows the title and the reader's order (every reader is A1, so no level is shown); the words step gains `reviewsToday` (already in the input); `TodayPlan` gains `doneCount` and `nextIndex`. `buildTodayPlan` stays pure and stateless; no storage, route or backup change.

## Limits

- Visual quality is judged by the owner. The lead looks at screenshots (light, sepia, dark; 360 and 1280 px) as an aid and fixes what is plainly broken, but that is not acceptance.
- No time estimates until a real basis exists (measured review durations would need new stored data).
- The `why` lines are static copy, not personalised.
- `DESIGN.md` gets a short "Today" section that records the focus card (flat, 1px border), the connected step line and the aside; no accent bar, tint or ring; nothing else in it changes.

## Steps (each lands separately)

- **V1 plan model** (code, worker): `title`, `reviewsToday`, `doneCount`, `nextIndex` in `plan.ts`/`inputs.ts`/`useToday.ts`; tests for the new fields, the first-run and no-step cases. Acceptance: `bun test tests/today*.test.ts` exits 0 and the full suite stays green.
- **V2 view** (code, worker): `TodayView` split into `TodayFocus`, `TodayPath`, `TodayAside` under `src/components/today/`, using `ui/button`, the shadcn `progress` (add via `bunx shadcn@latest add progress` if absent), lucide icons; English keys added for what it needs. Acceptance: typecheck, lint, `format:check`, `shape:check` exit 0; component tests render each state; `~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html` returns `[]`.
- **V3 copy** (agy gemini-3.8-flash, separate task): the `today.*` keys in `en.json` and `zh.json` (guidance sentence with plural forms, why lines, section titles, states). Acceptance: `bun run i18n:check` exits 0 and the key and placeholder sets match; the lead reads the zh.
- **V4 docs**: `DESIGN.md` Today section, `docs/architecture.md`, `CHANGELOG.md`, `TASKS.md`, `PROGRESS.md`.
- The lead re-runs typecheck, lint, format, shape, i18n, the full `bun run test`, the detector and `bun run build` in the main checkout, then takes screenshots at 360 and 1280 px in three themes and reads them.

## Owner checks (never done by an agent)

Look at Today in light, sepia and dark at 360 and 1280 px, first run and a day with everything done; say whether it now reads as an app and whether the guidance lines help; decide whether the card, the step line and the aside belong in the design language or Today should stay flatter.
