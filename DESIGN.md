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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-800}"
    rounded: "{rounded.lg}"
    width: "28rem"
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

**Character:** a book face for the language being learned and a plain public-signage sans for everything that operates on it. Chinese and French set together; layouts tolerate mixed CJK and Latin lines and long French words.

### Hierarchy
- **Reading** (400, 17/19/21/24px chosen by the reader, line-height 1.8; 2.05 in marker mode): article text in a 68ch column, words and sentences quoted in sheets, cards and the shadowing log.
- **Headline** (600, serif): page and article titles (`text-balance` on article titles).
- **Title** (600, serif, 16–18px): section and group headings inside a page.
- **Body** (400, 14px sans, line-height 1.5): all interface text.
- **Label** (400, 12px sans): meta, hints, counts, timestamps. Nothing smaller than 12px.

**The Semibold Rule.** Headings are semibold, never bold. No uppercase or letter-spaced labels. Scores, counts, clocks and timestamps use `.tnum`.

## Layout

- **App frame:** content up to `max-w-5xl` (64rem) centred, with 16px gutters on phones and 24px from `sm`. The header is 56px.
- **Reader:** the article is a single bordered surface; the text column is `.reading` (68ch). Reading settings (font size, listen, speed, markers) sit in a toolbar above it.
- **Bottom dock:** the reader has exactly one fixed bottom area (`reader/BottomDock`), holding the practice card above the article player, each up to `max-w-md` (28rem), centred, respecting the safe-area inset. It publishes its height as `--dock-height`; the article's bottom padding is `max(7rem, dock height + 2rem)` and follow-scrolling keeps the current sentence above it. Any new fixed UI in the reader goes inside the dock.
- **Breakpoints:** `md` (768px) switches the nav from a drawer to flat tabs, sheets from bottom to side, and the shadowing log from stacked rows to a three-column table.
- **360px:** every screen is checked at 360px with long text; layouts wrap (`break-words`, `min-w-0`, `flex-wrap`) instead of fixing widths. No horizontal page scroll.

**The Still Page Rule.** Controls must not move the page. Loading, playing, recording and errors show on the pressed control (icon swap, fixed size) or in an overlay, never as a row that appears and disappears. A slot that changes content between states keeps its height.

## Elevation & Depth

Surfaces are flat with a 1px `ink-200` border and no shadow. Depth exists only for things that float above the text: sheets, dialogs, menus, the sentence pill, the article player and the practice card, which add `shadow-lg`. The scrim dims behind modal overlays; the dock and the sentence pill have no scrim, so reading continues around them.

**The Float Only Rule.** If it is in the page flow, it has no shadow. If it has a shadow, it is out of the page flow.

## Shapes

Two radii: controls `rounded-md` (6px); surfaces and overlays `rounded-lg` (10px). `rounded-full` is for badges, dots and level bars only. Structure inside a surface comes from headings and `ink-200` rules, not nested cards or tinted boxes. Decorative icons next to headings and labels are not used.

## Components

### Buttons
- **Shape:** gently rounded (6px); every variant has a 1px border, transparent unless outline, so switching variant never changes size.
- **Sizes:** default 40px, `sm` 36px (12px text), `icon` 40×40, `iconSm` 36×36. Touch targets are at least 40px.
- **Primary** (`accent-700` fill, `on-fill` text): one per view.
- **Outline** (`surface`, `ink-300` border, `ink-800` text), **Ghost** (`ink-600`, hover `ink-100`), **Secondary** (`ink-100` fill), **Destructive** (`bad-600` fill).
- **States:** hover changes the fill one step; disabled is 50% opacity; focus is the global 2px `accent-600` ring with 2px offset.

### Segmented control
Filters and modes (library level, vocabulary filter, My study's Words | Shadowing): an `ink-100` track with 4px padding and `rounded-lg`, the selected option on `surface`. Scrolls horizontally rather than wrapping when it does not fit.

### Overlays
| Need | Pattern | Component |
|---|---|---|
| Look up a word or sentence while reading | Side sheet on md+, bottom sheet on phones, light scrim so text stays visible | `Sheet` |
| Task that needs focus (settings, import, delete) | Centred dialog | `Dialog` |
| Switch area | Flat underlined tabs from `md` up; below `md` a menu button opens a left drawer | `Navbar`, `Drawer` |
| Change interface language or theme | One icon in the header opening a short menu | `MenuButton` |
| Sentence actions | A compact pill at the end of the sentence (play, analyse, record), on hover **or tap**; never hover-only | `ReaderView` |
| Practise a sentence | A docked card at the bottom of the reader | `PracticeCard` |

Esc closes the topmost thing: a modal sheet first, then the practice card, then speech. Close buttons are at least 40px on touch.

### Inputs / Fields
`surface` background, `ink-300` 1px border, 6px radius, 40px high, `ink-400` placeholder, global focus ring. Errors appear inline next to what failed, in `bad-700`, with the real reason.

### Speak buttons
`SpeakButton` / `SpeakIcon` show idle (speaker), loading (spinner) and playing (stop square) at a fixed size; every button for the same text or take shows the same state. Never keep a separate "is speaking" flag.

### Practice card (signature)
A recording tool docked at the bottom of the reader, `surface` with a 1px `ink-300` border, 10px radius and `shadow-lg`, at most `min(45vh, 22rem)` tall, scrolling inside itself. Top to bottom:
1. The sentence in the reading face, clamped to two lines, with expand and close.
2. A control row that keeps its height in every phase: Reference (outline), Record (primary) or, while recording, Stop (destructive, with a `tnum` clock), Redo (outline) and seven `accent-600` level bars driven by the input level.
3. A rule, then the latest take: play (`tnum` time and duration), Compare (reference then take) and the "All recordings (n)" link in `accent-900`.
4. A rule, then one bounded `aria-live` line for the hint, status or error, with inline Retry/Discard when a save fails.

Focus goes to Close while the microphone is requested and to Stop while recording; it returns to the sentence's record button when the card closes. The level bars are the only motion that tracks live input; the recording state is the one place a pulse would be allowed.

### Shadowing log
Under My study → Shadowing: one section per article (serif title, `tnum` count), then rows separated by `ink-200` rules. From `md` up a three-column grid (text | reference | my recordings) with a quiet label row; below `md` each row stacks, with every control 40px. The text is a serif button that opens the sentence in the reader. Takes expand inline; orphaned recordings sit in collapsed "original text changed" and "article removed" groups.

### Reader pronunciation markers
Ordinary reading is the default. The toolbar has a direct marker switch and a settings button opening floating generation/status controls; no loading or error row enters the article. Display and layer choices are saved per article. Generated results are staged; the marker view unlocks only when generation has completed. Plain/marker switches may reflow but preserve the visible sentence anchor; toggling layers never changes word positions.

Marker mode uses line-height 2.05. Spoken-syllable `/` slots occupy 0.3em at 0.85em type size and keep their width when hidden. Silent spelling and slashes use `ink-500`; unresolved spelling is unchanged. Marker inks are theme tokens: silent spelling and slashes stay at or above 4.5:1 and curves at or above 3:1 against the reading surface in every theme. Paragraph-local `ink-600` curves sit below word gaps (liaison: 1.25px stroke / 5px sag; enchaînement: 1px / 3px, at 21px); wrapped pairs get local tails, never diagonal lines or nowrap wrappers. Stress dots have a 1.3px radius, centred about 2.8px below the marked glyph's ink bottom, scaling with type size. No rhythm-group lines or letter-spacing treatments, and no second muted grey. Decorations are non-interactive and excluded from accessible and copied text; connection explanations are available in the panel by touch and keyboard.

### Navigation
Flat tabs (Read, My study, Drills, Progress) with an icon and label, `ink-600` at rest, `ink-900` with a 2px `accent-700` underline when current. Below `md` a menu button opens a left drawer holding the tabs, install and settings.

### Motion
160–200ms with `ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`): sheets slide 24px (up on phones, from the right on md+), dialogs and floating controls fade. Everything is disabled under `prefers-reduced-motion`. No bounce, pulse or decorative animation.

## Do's and Don'ts

### Do:
- **Do** use role classes: `bg-surface`, `text-on-fill`, `bg-scrim/NN`, hue text from steps 800–950.
- **Do** keep one filled button per view; the rest are outline or ghost.
- **Do** show transient state on the control itself, at a fixed size.
- **Do** put new fixed reader UI inside `BottomDock` and keep the current sentence clear of it.
- **Do** check every new screen at 360px and in light, sepia and dark.
- **Do** write plain copy: short noun titles ("Vocabulary", "Drills", "Shadowing") with one quiet line under them; empty states say what to do next in one sentence.
- **Do** use lucide icons at 16px in controls, one stroke weight, `aria-hidden` when decorative.

### Don't:
- **Don't** use gradients, glass or blur, glowing cards, hero-metric tiles, emoji as icons or rainbow icon sets.
- **Don't** add streak flames, confetti, mascots or invented scores; empty means empty.
- **Don't** nest cards or use tinted boxes for structure; use headings and rules.
- **Don't** let a control insert or remove a row in the page flow.
- **Don't** use uppercase or letter-spaced eyebrow labels, bold headings or text below 12px.
- **Don't** write hype ("smart", "immersive", "AI-powered"), jargon in titles, exclamation marks, numbered section titles or French in parentheses in Chinese copy.
- **Don't** use hex or arbitrary colour values outside `src/index.css`.
