# Today v2: an app-like Today with guidance

Status: revised after the first Argon review (fail, 2026-10-24); direction B chosen by the owner. Owner feedback (2026-10-24): the current Today "has no app design and no guidance"; use the Today and UI of `parlons` (`/Users/royzhu/software/myproject/ts/studypro/parlons`, route `src/routes/index.tsx`, styles `src/styles.css` 467 to 720, mockups `parlons-docs/design/home-options/`, decision in `parlons-docs/docs/25-home-options-and-site-structure.md`) as the reference. Supersedes the view part of `docs/today-plan.md`; the plan model (`buildTodayPlan`, `Source<T>`, stateless, derived from timestamps) stays.

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
- No tinted box to make something important, no hero-metric ring or tile, no `rounded-lg` on every block (Today has one card). Importance comes from type size and weight, whitespace, a hairline rule and the one filled button.
- A numbered or connected sequence only when the order is information. Today's order is real (it is the plan's order), so the ordered rows are allowed, once; decoration is not.
- Nothing decorative that shows data: no waveform, ring or bars that are not a real measurement.
- State is carried by an icon or label inside the control (a check, "Next"), never by a coloured edge.

## Decision (owner, 2026-10-24): direction B, app structure

The owner chose B from the static comparison (`.pi-runs/today-v2/mockup.html`). The first Argon review (fail) found that the mockup shows the day's steps twice (a connected line in the card and a separate path list), that it uses sizes and decorations `DESIGN.md` forbids, and that the data model lacks fields the first draft assumed. This revision fixes the design on paper; the mockup is a rough guide for look only, and **the plan below wins where they differ**.

## Design

Layout from `md`: a main column and a 17rem aside; below `md` one column with the aside after the card. Content stays inside `max-w-5xl`. Three groups on the page: the heading block, **one card** (the only bordered surface, `rounded-lg border`, from the shadcn `card` component), and the aside (no box: a heading and ruled rows).

1. **Heading block.** `PageHeader` (the existing page headline, "Today"). Above or beside it a quiet date line from `Intl.DateTimeFormat(language)` of the one `now` the hook already holds (passed down as a prop; the view never calls `new Date()`). Under it one guidance sentence built from the plan (item 6). States that need no steps say what to do next in a whole sentence.
2. **One card, one ordered sequence.** The card holds the day's steps in plan order, once. Each step is one row (a whole-row link to the step's route, 48px or taller, a hairline `ink-200` rule between rows, a vertical connecting rule between the markers because the order is information). A row has: a marker (the number; a check in `ok-800` when done; a failed step shows its error text on the row instead of a special marker), the step title (`Title` style), a status line (counts, or the real error) and no icons beside titles. The **next step** (the first step that is not done and has no error) is the same row, expanded: its title is the card's focus item in the `Headline` style (24px serif), a why line under it, and the one filled `ui/button` ("Start", default `lg`, with the step's action label). Done rows are `ink-500` and stay links. Marker for the next step: the number in `accent-700`, no fill; no ring, no bar, no tint. Rows with an error are never "next".
3. **Practise on your own.** Below the card, a row of four outline links to Words, Read, Speaking and Grammar, text only (always shown: without a service Grammar still holds conjugation and gender). When every step is done these are the only actions and none is filled.
4. **Aside, "Today so far".** Ruled rows of real counts: words reviewed today, exercises answered today, readers worked on today. A count of 0 is shown as 0 (`.tnum`). A count whose source failed is omitted; the real error shows on the step row only. No goal, no streak, no percent, no progress bar, no ring. "n of m steps done" appears as text in the card's section heading only when there is at least one step.
5. **Why lines** (static copy, one per step): words "Each word comes back just before it is due, so a short review keeps what you learned."; read "A short graded text; tap any word for its meaning. No key needed."; sound "Hear and repeat the sounds you will meet in the next text."; mistakes "Retry what you got wrong; a right answer clears it."; grammar "The next topic in the book's order." They describe what the step does and claim no result.
6. **Guidance sentence.** Whole-sentence keys for the fixed states: nothing to do yet, all done, every step failed to load, first run. For the normal case a wrapper key `today.guidance.plan` with `{{steps}}` filled by `Intl.ListFormat(language, { type: 'conjunction' })` over per-step clause keys (`today.guidance.words` with `count` plurals, `today.guidance.read` with the reader title, `today.guidance.sound`, `today.guidance.mistakes` with `count` plurals, `today.guidance.grammar`), so English plurals, Chinese word order and capitalisation stay in the locale files. Only steps that exist and are not done are listed, in plan order.
7. **States.**
   - Loading: the heading and an empty card of a fixed minimum height with a static "Loading" line; no pulse (`DESIGN.md`). When the content service is configured the grammar row is appended last, after the local rows are shown; it only moves what is below it, as today.
   - A step whose source failed shows its real error on its own row and nowhere else; it is skipped when choosing the next step. If every pending step failed, the card has no expanded row and the guidance sentence says some steps could not load.
   - Nothing due and no readers and no service: only the sound row exists; it is the next step.
   - First run: the read step for reader 1 whose state is `start` carries a why line "Start here: Reader 1 needs no key." This is read from the step itself (order 1 and state `start`), not from a new flag.
8. **Data (small, all from stored data).** `TodayPlan` gains `nextIndex: number | undefined` (first step with `done === false` and no `error`), `doneCount: number`, and `counts: { reviews?: number; exercises?: number; readers?: number }` (a key is absent when its source failed). The read step gains `title` (the reader's French title, as the Read list shows it). `reviews` is the words source's `reviewsToday`. `readers` is the number of readers with `activeToday`. `exercises` is today's attempts counted once from a single `listAttemptsSince` result (the sound and mistake counters overlap, so they are never added). The date comes from the hook's `now`. No level, no minutes, no new stored state.

## Limits

- Visual quality is judged by the owner. The lead looks at screenshots (light, sepia, dark; 360 and 1280 px) as an aid and fixes what is plainly broken, but that is not acceptance.
- No time estimates until a real basis exists (measured review durations would need new stored data).
- The `why` lines are static copy, not personalised.
- The focus item in the card uses the existing 24px `Headline` style, the same size as the page headline; hierarchy comes from position, weight and the Start button. A larger size would need an owner-approved `DESIGN.md` exception.
- `DESIGN.md` gets a short "Today" section recording the one card, the ordered rows and the aside; no bar, tint or ring.

## Steps (each lands separately)

The lead adds the shadcn `card` before dispatching V2 (`bunx shadcn@latest add card`; a worker never runs a network command). The earlier idea of a `progress` component is dropped.

- **V1 plan model** (code, worker): the fields in item 8 in `plan.ts`, `inputs.ts` and `useToday.ts`; the `title` in the read step; update the `TodayPlan` literals in `tests/todayView.test.tsx` and the exact shapes in `tests/useToday.test.ts` so the whole suite typechecks; tests for `nextIndex` (skips error steps, `undefined` when none), `doneCount`, `counts` (omitted on a failed source, `exercises` counted once) and the no-step cases. Acceptance: `bun test tests/todayPlan.test.ts tests/useToday.test.ts tests/todayView.test.tsx` and the full suite exit 0, typecheck exits 0.
- **V2 view** (code, worker): `TodayView` split into the heading block, `TodayCard` (the ordered rows and the expanded next step), `TodayAside` and the practise row under `src/components/today/`, using `ui/card`, `ui/button` and `PageHeader`; the `today.*` keys in **both** `en.json` and `zh.json` (plain wording; V3 may refine it). Acceptance: typecheck, lint, `format:check`, `shape:check`, `i18n:check` exit 0; component tests render each state in both languages (next step, all done, error rows, no steps, first run, loading); the detector returns `[]`.
- **V3 copy** (agy gemini-3.8-flash, separate task): refine the `today.*` wording in both locales without changing keys or placeholders. Acceptance: `bun run i18n:check` exits 0; the lead reads the zh.
- **V4 docs**: `DESIGN.md` Today section, `docs/architecture.md`, `CHANGELOG.md`, `TASKS.md`, `PROGRESS.md`.
- The lead re-runs typecheck, lint, format, shape, i18n, the full `bun run test`, the detector and `bun run build` in the main checkout, then takes screenshots at 360 and 1280 px in three themes and reads them.

## Owner checks (never done by an agent)

Look at Today in light, sepia and dark at 360 and 1280 px, first run and a day with everything done; say whether it now reads as an app and whether the guidance lines help; decide whether the card, the ordered rows and the aside belong in the design language or Today should stay flatter, and whether a larger focus headline deserves a `DESIGN.md` exception.
