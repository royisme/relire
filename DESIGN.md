---
name: Relire
description: A quiet reading room for close reading and shadowing French.
colors:
  ink-paper: "#F7F6F3"
  ink-50: "#F7F6F3"
  ink-100: "#EFEDE8"
  ink-200: "#E2DFD8"
  ink-300: "#CFCBC2"
  ink-400: "#949087"
  ink-500: "#6F6B63"
  ink-600: "#5C5851"
  ink-700: "#433F3A"
  ink-800: "#2D2A27"
  ink-900: "#1E1C1A"
  ink-950: "#121110"
  accent-100: "#DCE6F5"
  accent-200: "#BDD0EA"
  accent-600: "#2F5490"
  accent-700: "#264676"
  accent-800: "#213A5F"
  accent-900: "#1D3150"
  ok-50: "#EEF6F0"
  ok-700: "#26633D"
  ok-800: "#1F4F32"
  bad-50: "#FBEFEE"
  bad-600: "#AB3A30"
  bad-700: "#8E2F27"
  surface: "#FFFFFF"
  on-fill: "#FFFFFF"
  scrim: "#121110"
  panel: "#2D2A27"
  panel-raised: "#3A3631"
  panel-line: "#4A4640"
  panel-ink: "#F4F0E8"
  panel-muted: "#B9B3A8"
  panel-accent: "#4473B5"
  panel-link: "#A9C2E6"
  panel-wave: "#92B0DA"
  panel-bad: "#C24A40"
  panel-bad-ink: "#F0B3AC"
typography:
  reading:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.8
  reading-small:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.8
  reading-medium:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.8
  reading-large:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.8
  headline:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  flashcard-word-small:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
  flashcard-word:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "'Source Serif 4', Georgia, 'Songti SC', serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  phonetic:
    fontFamily: "'Fira Code', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  md: "6px"
  lg: "10px"
  full: "9999px"
spacing:
  gutter-phone: "16px"
  gutter-tablet: "24px"
  content-max: "64rem"
  reading-max: "68ch"
components:
  button-primary:
    backgroundColor: "{colors.accent-700}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-800}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-800}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    textColor: "{colors.ink-600}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.bad-600}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.md}"
    height: "40px"
  button-small:
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  segmented:
    backgroundColor: "{colors.ink-100}"
    rounded: "{rounded.lg}"
    padding: "4px"
  surface-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    height: "40px"
  practice-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.panel-ink}"
    rounded: "{rounded.lg}"
    width: "28rem"
  record-button:
    backgroundColor: "{colors.panel-accent}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
---

# Design System: Relire

Product intent lives in `PRODUCT.md`. Tokens live in `src/index.css` (`@theme`); use the Tailwind role classes they generate, never raw hex. The frontmatter above lists the light theme's values; sepia and dark redefine the same names.

## Overview

**Creative North Star: "The Quiet Reading Room"**

Warm-neutral paper, ink-coloured type, one blue accent. The article column is the loudest thing on screen; everything else steps back. French printed matter is the reference: a good paperback and a dictionary entry, not a gamified app or an AI dashboard.

Controls are refined and restrained: 1px lines, no shadow at rest, fixed sizes. A state changes an icon or a label inside its control, never the layout around it. Everything a learner does while reading (look up, listen, record) happens in overlays that leave the text where it was.

**Key Characteristics:**
- The article is the page: one serif reading column, 68ch, generous leading.
- One accent, used for action and the current selection; colour beyond that is semantic only.
- Flat surfaces separated by rules and headings; only overlays float.
- Every theme (light, sepia, dark) redefines the same tokens, so components use one set of classes.
- Nothing moves when a control is used.

## Colors

A warm grey "ink" scale on paper, a single ink-blue accent and two semantic hues, each available in light, sepia and dark.

### Primary
- **Ink Blue** (`accent-700`, hover `accent-800`): the filled primary button, the current tab underline, the recording level bars (`accent-600`). Text in this hue uses `accent-900` (links, "All recordings"), because fills stay mid-tone in dark.
- **Selection Tint** (`accent-100` sentence, `accent-200` word): the playing, practised or selected sentence and the selected word. Selection only.

### Neutral
- **Paper** (`ink-50`): the app background.
- **Surface** (`surface`): cards, sheets, dialogs, menus, inputs, the article page, the practice card.
- **Rule** (`ink-200`; `ink-300` for inputs and outline buttons): every border and divider.
- **Ink** (`ink-900` body; `ink-700`/`ink-600` secondary; `ink-500` meta; `ink-400` placeholder and disabled only).
- **Scrim** (`scrim` at /25–/40): behind overlays; does not invert in dark.

### Ink panel
- **Ink Panel** (`panel`, hover `panel-raised`, rules `panel-line`): the reader's docked tools (sentence bar, practice card, article player). A dark warm ink in light and sepia (sepia's is brown), and in dark the lighter raised charcoal above the page, so a tool never reads as page.
- On it: text `panel-ink`, secondary `panel-muted`, links `panel-link`, live waveform `panel-wave`, errors `panel-bad-ink`; filled actions `panel-accent` (record, play) and `panel-bad` (stop), both with `on-fill` text at 4.5:1 or better. Focus rings inside a `.panel` switch to `panel-link`.

**The Tool Not Page Rule.** Anything docked over the article uses the ink panel; anything that is page uses `surface`. Never put page colours (`ink-*`, `accent-700`) on the panel.

### Semantic
- **Correct** (`ok-700` fill, `ok-800` text, `ok-50` tint) and **Error** (`bad-600` fill, `bad-700` text, `bad-50` tint): status only, never decoration.

### Themes
Four choices from the theme menu in the header: **Match system** (light or dark, following the OS, live), **Light** (warm paper), **Sepia** (cream paper `#FBF6EA`, brown ink) and **Dark** (warm charcoal surface `#1E1C19`, never pure black). `src/theme/theme.ts` stores the choice (`relire_theme`) and sets `<html data-theme>`; an inline script in `index.html` does the same before first paint, so there is no flash. In dark the scales invert (50 = darkest tint, 900 = lightest text) except the fill steps (accent 700/800, ok 600/700, bad 600), which stay mid-tone so `on-fill` text stays white. Every pair meets WCAG AA (4.5:1 text, 3:1 placeholder and focus) in all three themes; recheck when changing a value.

**The One Accent Rule.** Blue means "act here" or "this is selected". No amber, indigo, gradients or per-feature colours.

**The Fill Step Rule.** Text in a hue uses steps 800–950 (`text-accent-900`, `text-ok-800`, `text-bad-700`), never a fill step; filled controls use `text-on-fill`, never `text-white`; surfaces use `bg-surface`, never `bg-white`.

## Typography

**Reading Font:** Source Serif 4 (with Georgia, Songti SC)
**UI Font:** Public Sans (with system UI, PingFang SC)
**Phonetic Font:** Fira Code, for IPA and code only

The fonts are self-hosted: Google's unmodified latin variable woff2 builds live in `public/fonts/` under the SIL Open Font License 1.1 (licence texts beside them) and are declared with `@font-face` in `src/index.css`; the app never requests fonts from Google.

**Character:** a book face for the language being learned and a plain public-signage sans for everything that operates on it. Chinese and French set together; layouts tolerate mixed CJK and Latin lines and long French words.

### Hierarchy
- **Reading** (400, 17/19/21/24px chosen by the reader, line-height 1.8; 2.05 in marker mode): article text in a 68ch column, words and sentences quoted in sheets, cards and the shadowing log.
- **Headline** (600, serif): page and article titles (`text-balance` on article titles).
- **Title** (600, serif, 16–18px): section and group headings inside a page.
- **Body** (400, 14px sans, line-height 1.5): all interface text.
- **Label** (400, 12px sans): meta, hints, counts, timestamps. Nothing smaller than 12px.

**The Semibold Rule.** Headings are semibold, never bold. No uppercase or letter-spaced labels. Scores, counts, clocks and timestamps use `.tnum`.

## Layout

- **App frame:** a 56px sticky header, then from `md` a sidebar column beside the content (see Navigation). Content up to `max-w-5xl` (64rem) centred in the space beside it, with 16px gutters on phones and 24px from `sm`.
- **Reader:** the article is a single bordered surface; the text column is `.reading` (68ch). Reading settings (font size, listen, speed, markers) sit in a toolbar above it.
- **Grammar topics:** lists and topic readers grow with their content and use page-level vertical scrolling, never a fixed-height reading pane. Prose blocks keep a readable measure; tables may use the full content width and scroll horizontally within the table component when needed.
- **Bottom dock:** the reader has exactly one fixed bottom area (`reader/BottomDock`), holding the practice card, then the touch sentence bar, then the article player, each up to `max-w-md` (28rem), centred, respecting the safe-area inset. It publishes its height as `--dock-height`; the article's bottom padding is `max(7rem, dock height + 2rem)` and follow-scrolling keeps the current sentence above it. Any new fixed UI in the reader goes inside the dock.
- **Breakpoints:** `md` (768px) brings in the sidebar as a 56px icon rail (below it, a menu button opens the same tree in a left drawer) and switches sheets from bottom to side. `lg` (1024px) lets the sidebar expand to 240px with labels and sub-pages.
- **360px:** every screen is checked at 360px with long text; layouts wrap (`break-words`, `min-w-0`, `flex-wrap`) instead of fixing widths. No horizontal page scroll.

**The Still Page Rule.** Controls must not move the page. Loading, playing, recording and errors show on the pressed control (icon swap, fixed size) or in an overlay, never as a row that appears and disappears. A control or status slot that changes content between states keeps its height. This does not fix the total height of a reading page: loaded documents grow naturally while the controls above them stay in place.

## Elevation & Depth

Surfaces are flat with a 1px `ink-200` border and no shadow. Depth exists only for things that float above the text: sheets, dialogs, menus, the sentence pill, the article player and the practice card, which add `shadow-lg`. The scrim dims behind modal overlays; the dock and the sentence pill have no scrim, so reading continues around them.

**The Float Only Rule.** If it is in the page flow, it has no shadow. If it has a shadow, it is out of the page flow. The sole in-flow exception is the Words paper flashcard, specified below.

## Shapes

Two radii: controls `rounded-md` (6px); surfaces and overlays `rounded-lg` (10px). `rounded-full` is for badges, dots, waveform bars, the practice card's record button and Words' three recall targets only. Structure inside a surface comes from headings and `ink-200` rules, not nested cards or tinted boxes. Decorative icons next to headings and labels are not used.

## Components

### Buttons
- **Shape:** gently rounded (6px); every variant has a 1px border, transparent unless outline, so switching variant never changes size.
- **Sizes:** default 40px, `sm` 36px (12px text), `icon` 40×40, `iconSm` 36×36. Touch targets are at least 40px.
- **Primary** (`accent-700` fill, `on-fill` text): one per view.
- **Outline** (`surface`, `ink-300` border, `ink-800` text), **Ghost** (`ink-600`, hover `ink-100`), **Secondary** (`ink-100` fill), **Destructive** (`bad-600` fill).
- **States:** hover changes the fill one step; disabled is 50% opacity; focus is the global 2px `accent-600` ring with 2px offset.

### Data tables
Library articles, area-scoped sets and a set's exercises compose shadcn `ui/table` with TanStack Table, without a shared table wrapper. They share a `rounded-lg border border-ink-200 bg-surface` shell, a `bg-ink-50 text-xs` header, `divide-y divide-ink-200` rows and `hover:bg-ink-50`. Sortable headers use a 40px button, a sort arrow and `aria-sort` on the column heading. Secondary columns hide responsively; their essential metadata moves under the title. One row action column holds 40px icon buttons named by both `aria-label` and `title`; deletion asks in a named confirmation dialog. The page owns loading, errors, empty and no-match states, not the table.

### Segmented control
Filters and modes (library level, vocabulary filter): an `ink-100` track with 4px padding and `rounded-lg`, the selected option on `surface`. Radio options have 40px targets and one Tab stop; arrow keys wrap the selection and focus, and Home/End select the first/last option. Scrolls horizontally rather than wrapping when it does not fit. Page destinations use real links with `aria-current="page"`, never radios.

### Overlays
| Need | Pattern | Component |
|---|---|---|
| Look up a word or sentence while reading | Side sheet on md+, bottom sheet on phones, light scrim so text stays visible | `Sheet` |
| Task that needs focus (import, delete, install guide, first-run guide) | Centred dialog | `Dialog` |
| Switch area | A sidebar beside the content from `md` (rail, expanded from `lg`); below `md` a menu button opens the same tree in a left drawer | `shell/Sidebar`, `shell/Header` (`Drawer`) |
| Change settings | A page, not an overlay: its own sections, each saved on its own | `settings/SettingsPage` |
| Change interface language or theme | One icon in the header opening a short menu | `MenuButton` |
| Sentence actions | With a mouse or keyboard, a compact pill at the end of the sentence (play, analyse, record). On touch screens (`hover: none`, `pointer: coarse`), a bar in the bottom dock with 40px buttons and close, never over the text; the tapped sentence is scrolled clear of it | `ReaderView`, `reader/SentenceBar` |
| Practise a sentence | A docked card at the bottom of the reader | `PracticeCard` |

Dialog wraps the Base UI dialog; Sheet and Drawer trap focus, restore it to the opener on close and lock page scroll while open.

Esc closes the topmost thing: a modal sheet first, then the practice card, then speech. Close buttons are at least 40px on touch.

### Inputs / Fields
`surface` background, `ink-300` 1px border, 6px radius, 40px high, `ink-400` placeholder, global focus ring. Errors appear inline next to what failed, in `bad-700`, with the real reason.

### Speak buttons
`SpeakButton` / `SpeakIcon` show idle (speaker), loading (spinner), playing (stop square) and failed (crossed-out speaker, `bad-700`) at a fixed size; every button for the same text or take shows the same state. Never keep a separate "is speaking" flag. A failure shows its real reason where it happened, visibly on touch too: icon-only and labelled speak buttons float a small error overlay under the control (over it near the bottom of the screen) — outside the button's semantics, wrapped and scrollable, clamped inside the viewport — while the practice card and the article player use their bounded status lines; pressing the control retries and clears it. The Settings preview is a sound like any other: claiming the slot stops and unpublishes whatever played, anything that stops speech cancels it (never a failure, never a stuck check), leaving Settings cancels it with its request, and it only reports success once the clip has really finished playing.

### Practice card (signature)
A recording tool on the ink panel (10px radius, `shadow-lg`, at most `min(70vh, 28rem)` tall, scrolling inside itself), docked at the bottom of the reader. Top to bottom:
1. A title row: "Shadowing" in `panel-muted` (on mouse and keyboard it is the drag handle, with a grip icon), then minimise and close.
2. The sentence in the reading face at 18px, clamped to two lines (tap it to show the rest).
3. The waveform strip, 40px high, full width, with a `tnum` clock on the right: while recording, the live input scrolls in from the right in `panel-wave`; afterwards, the latest take's real peaks in `panel-muted`; with no take, a flat `panel-line` baseline. Never invented bars.
4. The transport, three columns: Reference (outline) on the left, the record button in the centre (48px pill, `panel-accent`; while recording `panel-bad` with Stop and the clock), Compare on the right (Redo while recording). Below `sm` the side buttons show icons only.
5. A rule, then the latest take (play, time · duration) and "All recordings (n) ›" in `panel-link`.
6. A rule, then one bounded `aria-live` line for the hint, status or error, with inline Retry/Discard when a save fails.

**Moving it (desktop).** On mouse and keyboard the title is a handle: drag it anywhere on screen (kept 8px inside the window and below the header), or use the arrow keys (Shift for larger steps). The position is remembered in this browser (`relire_practice_card_pos`) and the floating card no longer counts toward the dock height. Double-click the handle or press Home to dock it again. Touch screens always keep it docked.

**Minimised**, the card is one row like the sentence bar: the sentence truncated, then Record (or, while recording, the level bars and a Stop with its clock), restore and close. It restores itself when a save fails, an error appears or the microphone is busy.

Focus goes to Close while the microphone is requested and to Stop while recording; it returns to the sentence's record button when the card closes. The level bars are the only motion that tracks live input; the recording state is the one place a pulse would be allowed.

### Exercise sheet
One unit on one sheet (`practice/UnitSheet`): a single `surface` card with a 1px `ink-200` border, as the reader's article is. Inside it, structure comes from rules, never from nested cards. Top to bottom:
1. A header: the exercise type in `ink-500` (12px), the unit title in the serif headline, the instruction in `ink-700`, an optional example in `ink-500`, then the running count "n of N checked, m right" in `ink-600` (12px, `tnum`), so progress is visible while answering instead of only at the foot of the sheet. A supplied reading passage follows before the questions, with its title and translation when present. A reading-cloze unit's passage sits beside the questions from `md` (a hairline rule between them) and stacks above them on phones, with an "Open in the reader" link to the material the unit belongs to.
2. Numbered rows separated by hairline `ink-200` rules. A row is a 28px marker column (the number in `ink-500`, replaced by a check in `ok-800` or a cross in `bad-700` once checked) and the content: the grammar topic in `ink-500` (12px) with a 40px ghost **Listen** control beside it, the control, a line of buttons, then notes. Listen speaks the prompt through the shared speech layer (`audioText` when the item has it, otherwise the prompt without its `[___]` and `{a|b}` markup, so neither is read aloud), and swaps its icon while the clip loads or plays; a dictation item has no second one, because its own control carries Listen.
3. A footer after a rule: **Check all** (the one filled button of the page; it checks only what is filled in, so an empty row is never a mistake) and **Reset this unit** (ghost; it asks first and says the history of attempts is kept). A draft that could not be saved says so beside them, in `bad-700`, with the real reason.

**Underline inputs.** Typed answers are blanks in the sentence: the serif face at 18px on a 2px underline (`ink-300`, `accent-700` on focus), no box, 7rem wide inline and wrapping with the sentence. After a check a right blank is `ok-800` on an `ok-700` underline; a wrong one is struck through in `bad-700` on a `bad-600` underline, with the reference answer beside it in `ok-800` semibold, so right and wrong never rest on colour alone (the marker icon and a screen-reader label say it too). An answer that is checked or being checked is read-only, not disabled, so the cursor stays put and nothing dims. Inline choices (`{a|b}`) are a small row of buttons with a hairline `ink-300` border; the pick is `accent-100` until checked, then `ok-50` or struck through on `bad-50`. Open answers use a bordered text area of fixed height with one line under it that says an AI reads it and gives feedback, not a score.

**Pick and order controls.** Gender checks, odd one out and matching draw their options as a bordered group the learner picks one from; arrow keys move the pick, as a radio group does, and the picked option is `accent-100` until checked, then `ok-50` or struck through on `bad-50` with the reference beside it in `ok-800`. A dialogue to order lists its lines with an up and a down button each (arrow keys move the line the pressed control belongs to; the buttons are 40px on phones); after a check a line in its right place is `ok-800`, a misplaced one is struck through in `bad-700`, and the right order follows below in `ok-800`. A sentence to build shows its words as tiles in a bordered bank; pressing a tile places it on the line under construction (kept at a fixed height), pressing a placed word takes it back, and the arrangement that matches the reference is graded at once while any other goes to the AI grader. A dictation item is one Listen button (loading and playing show on it, at the learner's dictation speed) and a typed line; the spoken text is never on screen before the check, and with "Speak after checking" on the item is spoken again once it is checked — with a remote voice only when the Practice opt-in for automatic playback is also on, otherwise with the device's voice.

**Buttons under an item.** Check (outline), Hint and Explain (ghost) are always there at a fixed size; pressing one swaps its icon for a spinner and never changes its width (Check is 7rem wide so "Checked" fits). Hint is for before the check, Explain for a wrong answer after it, Redo for trying the same item again; the unavailable one is disabled, not removed. **Redo** is always there and off until the item is checked, then it clears that item’s answer and result so it can be done again, and its attempts stay in the notebook, so a mistake remains until a later correct attempt resolves it. Being always present, it never adds or removes a line of buttons, so a check and a redo leave the rows below where they were. On phones they are 40px high and wrap. Hints and the AI's feedback sit under the item as plain text behind a 2px `ink-300` rule (not a tinted box); an explanation opens in a `Sheet` like a word lookup.

**Character bar.** One 40px round toggle fixed at the bottom right of the screen (`z-40`, below overlays), rising above the on-screen keyboard. It opens a small grid in a `surface` popover with `shadow-lg`: é è ê ë à â ç î ï ô ù û ü œ æ « », and a Shift key that makes the next character a capital (a physical Shift works too). Pressing a character inserts it at the cursor of the field the learner last used, and leaves focus there (the buttons do not take focus); it never opens by itself, never moves the page and does nothing to a checked answer. Esc closes it.

**Keyboard.** Enter moves to the next blank, then to the first empty one, and checks when every blank is filled; Shift+Enter is a new line in an open answer; Enter that commits an IME composition does nothing.

### Topic learning workbench

Grammar topics with authored learning use one flat, page-scrolling workbench, not the ordinary worksheet's stacked rows. A serif topic title and checkpoint heading lead compact `TopicBlocks` teaching, six 40px question selectors (two rows of three on phones), bilingual task instructions and one existing inline choice or typed control. French keeps the exercise serif treatment. Saved grammar exercises reuse the workbench without duplicating teaching/reference content.

Previous, Redo and Check-to-Next occupy three permanent cells. Checking stays on the question and retains focus; explicit question navigation focuses the new instruction. A local `h-32` result slot reserves status, feedback action, correction and summary/error space from the outset; overflow remains reachable. Corrections never append beside the prompt here. Longer authored feedback opens the existing responsive Sheet. The floating CharacterBar is shared and follows the selected input's editability. No lookup, AI or speech controls appear.

Full reference is one initially closed Collapsible below the Grammar workbench; opening it records nothing. Selectors use `aria-current="step"`, explicit unchecked/right/wrong icons and labels, existing accent/semantic tokens and focus rings. The pilot uses no new theme, typography, motion, mastery display or navigation chrome. Implementation checks use synthetic data; real twelve-question review and local/manual visual acceptance are still pending.

### Words workbench

Words stays in the Quiet Reading Room world. Overview and All words use real page links with `aria-current`; Review's Back targets Overview. Overview is counts and one filled action in a fixed-height slot that follows the real queue (plain Review, Learn new, or a calm sentence with no button; no streak, ring or "+N more"); beside Review and Learn only, in the same slot, a quiet `text-sm text-ink-600` pace estimate appears when the learner's own history is long enough, and nothing otherwise, with Play a run as the outlined secondary link and no Map link (the Map tab is the way); Settings → Words holds daily-new (0–100) and target-retention (80–95%) integer fields, one explicit Save and the wordbook's download/update control with its reserved status slot. Both drafts are page-owned, follow late-loaded values until edited and survive section changes; an older save cannot clear newer text. Save waits for loaded preferences. Brief settings-only copy explains target versus measured retention and pre-flip recall semantics; no new instructions or interval captions enter the card. The merged browser composes house Table and TanStack v9, 50 rows per page, with details in a Sheet. No level/frequency guesses or mastery badge.

Review is one centered, two-sided paper flashcard, at most 25rem wide and full available width on phones. Both faces prefer a 4:5 portrait proportion; long answers grow naturally beyond it. The front gives wrapping semibold serif French at 32px phone/40px desktop generous centered whitespace, with subordinate explicit selected-engine Listen and a quiet recall hint below. On the back, the word remains identity in secondary ink; 24px meanings lead 12px POS/source metadata and spaced 18px serif French/14px translation pairs, without Answer or large Built-in headings. Personal context, saved language and source remain available as quiet metadata. This Words-only paper-object exception uses the existing 10px surface radius, a hairline ink edge and subtle token-derived offset shadows; ordinary in-flow surfaces remain flat. No implied undercard stack. Click the word, prose or background on either face to flip; no visible Flip buttons. A textless native button supplies the accessible flip name and Enter/Space semantics as a sibling, never a parent, of selectable prose and independent speech controls. Selection, drag, scrolling, speech/error bubbles, fields and links never flip. The parent owns the visual face; first reveal unlocks the answer only after the introduction commits. Before that, no back answer DOM, POS, context, gloss or example mounts. Later flips are display-only. Active content sets natural page height, with no clipped definitions or internal reading scroll box. The inactive face is inert and aria-hidden.

Three equal-weight recall controls sit outside and below the card only on the unlocked back: Forgot / Fuzzy / Remembered, with X / EqualApproximately / Check icons in equal 48px circles and small visible labels below. Existing bad tint/ink, warm-neutral ink tint/text and ok tint/ink express recall, not correctness; no new hue or primary-blue emphasis. Focus stays obvious and accessible names match the labels. Skip for now remains independent. The front has no recall dashboard or interval captions. Saving/failures use fixed-size controls and a bounded `h-16` status region; long failures use a Sheet. Intentional flips may change content height while preserving the top/viewport anchor. The download/update slot in Settings → Words remains `h-16`. No autoplay, example audio or nested cards.

Back flips focus the existing word heading without scroll; front flips focus the textless card control; committed recall/Skip focuses the next card control or wait heading. Native Enter/Space flips once, held/repeated/IME events cannot grade or act on the next card, and only 1=Forgot / 2=Fuzzy / 3=Remembered apply while on the back, outside independent child controls, fields and overlays. Locale/theme changes preserve the card, unlock and focus. Word lookup keeps two permanent save/remove cells and a fixed saving/error slot; bookmark removal never deletes contexts/history. Visual acceptance remains manual.

### Shadowing log
Under Speaking → Recordings (`#/speaking/recordings`, with a back link to Speaking): one section per article or unit passage (serif title, `tnum` count), then sentence-first rows separated by `ink-200` rules. The full-width sentence leads; a related, naturally wrapping group below holds Reference, Play my recording, Compare and All recordings (n), with 40px targets at every width. Last-recorded date and actual duration are quiet metadata, not the primary playback label. The text is a serif button that opens the sentence in the reader. Takes expand below the sentence at full width, with playback, date, duration and deletion even for a sole take; unavailable recordings stay in their changed/removed source groups. No pseudo-table or nested cards.

### Reader pronunciation markers
Ordinary reading is the default. The toolbar has a direct marker switch and a settings button opening floating generation/status controls; no loading or error row enters the article. Display and layer choices are saved per article. Generated results are staged; the marker view unlocks only when generation has completed. Plain/marker switches may reflow but preserve the visible sentence anchor; toggling layers never changes word positions.

Marker mode uses line-height 2.05. Spoken-syllable `/` slots occupy 0.3em at 0.85em type size and keep their width when hidden. Silent spelling and slashes use `ink-500`; unresolved spelling is unchanged. Marker inks are theme tokens: silent spelling and slashes stay at or above 4.5:1 and curves at or above 3:1 against the reading surface in every theme. Paragraph-local `ink-600` curves sit below word gaps (liaison: 1.25px stroke / 5px sag; enchaînement: 1px / 3px, at 21px); wrapped pairs get local tails, never diagonal lines or nowrap wrappers. Stress dots have a 1.3px radius, centred about 2.8px below the marked glyph's ink bottom, scaling with type size. No rhythm-group lines or letter-spacing treatments, and no second muted grey. Decorations are non-interactive and excluded from accessible and copied text; connection explanations are available in the panel by touch and keyboard.

### Today

One page, one next action. The heading block holds the page headline, a full date from the one clock and a guidance sentence built from the plan. The day's steps sit in **one** `ui/card` (the page's only bordered surface): ordered rows with a number or a check as marker, a hairline between rows and a vertical connecting rule, because the order is information. Every row except the next is a whole-row link; a row whose source failed is plain text with its real error and is never the next step. The next step is the same row expanded: its title in the Headline style, one line of why and the page's one filled button as a link. No icons beside titles; the next marker is `text-accent-900`, never a fill, ring, bar or tint. The aside "Today so far" is ruled rows of real counts (0 shown as 0, a failed source omitted), unboxed. Below the card, text-only outline links to practise one skill on its own. No progress bar, ring, streak or goal. Loading is a static line, never a pulse.

### Navigation
The sidebar is the one place to switch area. The header keeps only the brand, theme and language, plus the menu button on phones. Every place has a hash address (`#/read`, `#/words`, `#/mistakes`, `#/speaking/recordings`, `#/settings/ai/speech`), and rows are real links, so Back, reload and copied links keep the place. An unknown address or a missing article shows a plain not-found page with a link to the library.

- **Expanded** (from `lg`, 240px): 40px rows first (Today, Reading, Words, Grammar, Listening, Speaking, and Writing only when a saved writing unit exists), followed, after a rule, by Mistakes and Progress with a 16px icon and label, `ink-700` at rest. The current page is `ink-950` on an `ink-100` fill with a 2px `accent-700` bar at the row's left edge; the current area lists its sub-pages indented under it (Speaking: Read aloud only, with Recordings as a text link on the Speaking page and "All recordings" in the reader, not a sidebar row; Mistakes has no sub-pages; learning areas: their destinations, open complete set and its exercises; Words has no sidebar children, because its page draws Overview, All words and Map). The Words row carries the due-vocabulary count as an `accent-700` badge at the end of the row, and the Mistakes row carries the number of mistakes no later attempt has resolved the same way; each count sits on its own top-level row and counts only what is waiting; the two metrics are never added together. After a rule at the bottom: Install app, Settings (its sections indented under it while on a settings page), then About as the final destination outside Settings. The independent collapse/expand icon is at the sidebar top, outside the navigation tree, with a 40px target, accessible label and tooltip.
- **Rail** (56px; from `md`, and the collapsed state from `lg`): icons only, centred in 40px targets. The label is the tooltip (`title`) and the accessible name; A row that owns one metric shows it as a corner badge; no row ever shows a combined count. The Words row shows the due count there and the Mistakes row its unresolved count, each on its own icon; zero shows nothing. Sub-pages are left out, so pages that have them draw their own list: Settings' section list beside the page.
- **Remembered choice:** expanded or collapsed is stored in `relire_sidebar`. In the reader and on an exercise sheet the sidebar always starts as a rail so the content stays the page; expanding it there lasts for that visit and is not remembered. The sidebar takes its own column in the page flow, so it never covers text, and the reader's bottom dock centres on the content column.
- **Badge rules:** (1) Words counts cards due now in learner rows; new cards never count, so it can differ from Today's "due · new". (2) Mistakes counts unresolved items. (3) Each count sits on its own top-level row at every width: row end when expanded and in the drawer, corner on the rail; zero shows nothing. (4) Never a sum, a count on a parent or group, on the header or on the menu button, or a dot that stands for "something". (5) No badge on Progress, Reading or Grammar.
- **Phones** (below `md`): the header's menu button opens a left drawer with the same tree, closing when a link is followed. The drawer has no collapse control.
- **Flat:** a 1px `ink-200` rule on its right edge, no shadow, and no width animation.

### Learning destinations

Reading's Library and Exercises use real local links. Grammar's service-conditional Topics, local Conjugation/Gender and saved Exercises use the same underlined link language with `aria-current`, never navigation radios. Area lists scope counts before set aggregation and say that batches can be mixed. A complete-set page labels every unit's real area and shows whole-batch totals; only that page offers whole-set deletion, with named cross-area scope. Preserve the existing flat tables and controls, not cards or a new dashboard.

Speaking is a quiet pronunciation hub: Read aloud first with contextual reader-shadowing copy, then Sound pairs creation and saved-answer counts, then the tap-to-hear French sounds reference. Sections use headings and rules; contrast rows and status have reserved, scrollable slots so loading and errors never shift the chart. Its article chooser and source/sentence workspace are separate destinations, never stacked under exercise lists. Reuse the existing recorder and speech controls with the original pronunciation-stat meaning. Empty or missing selected sources say so without switching articles. No future training tiles, disabled destinations, new assets or motion system.

### Settings page
Settings is a page, not an overlay, with five sections: AI services, Practice, Words, Prompts, Data and backup. About is an independent informational page at `#/about`; old `#/settings/about` links resolve there. The section list is the sidebar's sub-pages when it is expanded; beside the section from `md` otherwise; and on phones the page itself (a list of titles with a line each, then the section behind a "‹ Settings" link). Practice and Prompts each end with their own Save button (disabled until something changed) and one fixed-height status line: "Unsaved changes", "Saved" in `ok-800`, or the real reason in `bad-700`. Data and backup acts immediately and has no Save. Practice holds the exercise preferences: strict accents (whether an answer without accents still counts), the dictation speed, speaking a dictation item again after its check (off by default), and under it letting a check speak with the Speech synthesis provider (off by default) — one line says that automatic playback uses this device's voice until it is on, and that with it on a check may synthesize with the provider, which can cost money. Listen and Preview always use the chosen engine.

AI services is one page for three destinations — Text AI, OCR, Speech synthesis — shown as a page-local row of three underlined links under its heading, not as section rows in the sidebar (`#/settings/ai/text`, `/ocr`, `/speech`; the bare `#/settings/ai` opens Text AI). Below them, one single-column form about 42rem wide: provider, that provider's key, the model, the purpose's own fields (the voice for speech), a Check key or Preview voice button, a fixed-height status line, and one page-wide Save that stores all three selections and the keys they use. Purpose text says what each destination covers: lookups, generation and grading for Text AI; reading images and PDFs and pulling the exercise structure out of imported material for OCR; model and voice for Speech synthesis. Text below the key names the other destinations that use the same provider's key instead of repeating the key field; the key is never shown in errors. The model field takes a typed ID or one suggested by the browser's own list; Fetch models runs with the unsaved key, Refresh models replaces the list, and the note says a fetched list is discovery, never a passed test. A known-incompatible model is marked in `bad-700`, an unconfirmed one says so in `ink-600`; nothing implies a model was verified. A provider that declares a default endpoint shows a Base URL field under its key, with the provider's own address as the placeholder; an unusable address is refused inline and never saved, and only that provider's requests use it. A provider without a fixed voice list takes a free-text Voice ID (empty means the provider's default) instead of a select. The device voice is the one engine with no key, model or voice: choosing it replaces those three fields with a plain sentence — it speaks with this device's own voice, needs no key, costs nothing, stores nothing, and how it sounds depends on the French voices installed — and Preview voice still plays the test phrase, failing with its real reason when the device has no French voice. A local provider says its key is optional and that its server has to allow this origin; no key is ever invented for it. Each destination keeps its own unsaved edits when another is opened, and the section list never repeats the three destinations. Unsaved edits in any section survive moving between sections; leaving Settings drops them, except unsaved AI changes, which ask Keep or Discard first.

When an AI feature needs a key, the app opens AI services on the purpose that needs it — Text AI for lookups, generation and grading, OCR for images and PDFs, Speech synthesis for speech — with the key field focused and a short notice; once the key is checked and saved, "Go back to where you were" (drawn from the start, disabled until then) returns to the page the learner left. The first-run guide stays a dialog.

### Motion
Use motion purposefully, not a blanket ban: it should clarify a state change, spatial relationship or response to input without distracting from reading. Default to 160–200ms with `ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`): sheets slide 24px (up on phones, from the right on md+), dialogs and floating controls fade. The Words card uses a functional 180ms two-sided rotation with the same easing; its shown face determines natural height. Bounce or pulse needs a clear interaction purpose, not decoration. Respect `prefers-reduced-motion`: the card switches faces immediately without rotation or transition, preserving the same controls and feedback.

### Game surface (owner exception, 2026-10-24; limited to the brick palette)
The optional game mode (Grammar → Gender "Play a round", the vocabulary game that follows it, and the Sentence workshop) is the one place where the calm rules above are relaxed, so that a game can feel like a game. The rest of the app, Today included, is unchanged. Allowed on the game surface only: (1) **motion** beyond 160–200ms, with overshoot or elastic easing for a "pop", feedback layered within about 100ms of an action and scaled to the event's importance (a routine right answer small, a word graduating medium, a finished run or mastered page large), always returning to rest; (2) **short sound cues** (no music; each cue can be muted; the cues are synthesised with WebAudio, no new dependency; French speech is the app's own speech playback, the same control as everywhere else, never a second voice); (3) **number pops** that show figures computed from the learner's real activity; (4) **brick art** in the Sentence workshop, the only fixed palette: about six saturated hues for the word roles, defined as CSS variables scoped to the game's wrapper class in `src/index.css` (the only place for hex), tuned per theme so they sit on its board and with every brick text at WCAG AA on its fill (the neutral brick is the app's own grey, from the ink tokens). Everything else on the game surface uses the app's theme tokens and follows the theme switch: the stage is the page colour, the ticket and sheet are `surface`, the baseplate and bin are ink steps with the studs drawn as a mask over the board's own colour, the bar, Listen, Show answer, Sound, Effects and Exit are the ordinary ghost and outline buttons, and Check or Next is the ordinary primary (accent) button with a solid offset shadow derived from it. Bricks are the only saturated things on screen. **Solid depth**, meaning a flat fill with a solid offset shadow (derived from the fill or the token) and round or square studs, never blur and never a gradient; **one silhouette per role family**, so the hue is never the only cue (each brick also carries a role label); (5) **full-bleed play**: the game is a stage laid over the whole app (header, sidebar and page tabs included), with a slim bar for exit, progress pips and text-labelled Sound and Effects switches, and its explanations rise as a bottom sheet instead of growing the page. Bricks are game pieces, not buttons: "one filled button per view" there means the one big Check or Next button. Still required there: `prefers-reduced-motion` means no motion, plus a visible sound on/off and a reduce-effects setting; nothing flashes more than three times a second; feedback never blocks input and never moves the page; every number is real (no invented scores or XP); the layout rules, 360px and the three themes still hold; one filled button per view. Not granted: confetti, streak flames, mascots, glass, blur, gradients, emoji icons and any colour outside the theme tokens and the brick palette stay under Don't.

## Do's and Don'ts

### Do:
- **Do** use role classes: `bg-surface`, `text-on-fill`, `bg-scrim/NN`, hue text from steps 800–950.
- **Do** keep one filled button per view; the rest are outline or ghost.
- **Do** show transient state on the control itself, at a fixed size.
- **Do** put new fixed reader UI inside `BottomDock`, on the ink panel, and keep the current sentence clear of it.
- **Do** check every new screen at 360px and in light, sepia and dark.
- **Do** write plain copy: short noun titles ("Vocabulary", "Practice", "Recordings") with one quiet line under them; empty states say what to do next in one sentence.
- **Do** use lucide icons at 16px in controls, one stroke weight, `aria-hidden` when decorative.

### Don't:
- **Don't** use gradients, glass or blur, glowing cards, hero-metric tiles, emoji as icons or rainbow icon sets.
- **Don't** add streak flames, confetti, mascots or invented scores; empty means empty. (The game surface's motion, sound cues, number pops, brick art and full-bleed play are the one exception, above.)
- **Don't** nest cards or use tinted boxes for structure; use headings and rules.
- **Don't** let a control insert or remove a row in the page flow.
- **Don't** use uppercase or letter-spaced eyebrow labels, bold headings or text below 12px.
- **Don't** write hype ("smart", "immersive", "AI-powered"), jargon in titles, exclamation marks, numbered section titles or French in parentheses in Chinese copy.
- **Don't** use hex or arbitrary colour values outside `src/index.css`.
