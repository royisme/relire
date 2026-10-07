# Design

The visual system for Relire. Product intent lives in `PRODUCT.md`. Tokens live in `src/index.css` (`@theme`); use them, not raw hex.

## Direction: a quiet reading room

Warm-neutral paper, ink-coloured type, one blue accent. The article column is the loudest thing on screen; everything else steps back.

## Themes

Four choices, set from the theme menu in the header: **Match system** (light or dark, following the OS, live), **Light** (warm paper), **Sepia** (cream paper, brown ink) and **Dark** (warm charcoal, never pure black). `src/theme/theme.ts` stores the choice (`relire_theme`) and sets `<html data-theme>`; an inline script in `index.html` does the same before first paint, so there is no flash. Every theme redefines the same tokens in `src/index.css`, so components use one set of classes.

## Colour

Use roles, never raw hex (the only fixed colours are the theme swatches, which must show a theme's own paper).

| Role | Token | Use |
|---|---|---|
| Page | `ink-50` | app background |
| Surface | `surface` | cards, sheets, dialogs, menus, inputs, the article page |
| Line | `ink-200` (`ink-300` for inputs and outline buttons) | every border and divider |
| Text | `ink-900` body, `ink-700`/`ink-600` secondary, `ink-500` meta, `ink-400` placeholder/disabled only | |
| Fill | `accent-700` (hover `800`), `bad-600`, `ok-700`, with `text-on-fill` | primary and destructive buttons, the current tab underline |
| Text in a hue | `accent-900`, `ok-800`, `bad-700` (and darker steps on tints) | links, checks, errors; never a fill step, because fills stay mid-tone in dark |
| Tint | `accent-100` selected / sentence, `accent-200` word, `ok-50` / `bad-50` status | selection and status only |
| Scrim | `scrim` (with `/25`–`/40`) | behind overlays; does not invert in dark |

In dark the scales invert (50 = darkest tint, 900 = lightest text) except the fill steps, which stay mid-tone so text on a fill stays white. Every pair above meets WCAG AA (4.5:1 text, 3:1 placeholder and focus) in all three themes; recheck when changing a value. No amber, indigo, gradients or per-feature colours.

## Voice

Plain words for what the thing does. No hype ("smart", "interactive", "immersive", "AI-powered"), no jargon in titles (algorithm names, CEFR ranges, "S-V-O"), no exclamation marks or emoji, no numbered section titles, no French in parentheses in Chinese copy. Titles are short nouns ("Vocabulary", "Drills"); one quiet line under them says what the page is for. Empty states say what to do next in one sentence.

## Type

- **Source Serif 4**: article text, headings, words and sentences from the language being learned. **Public Sans**: UI. **Fira Code**: IPA and code only.
- Reading: `.reading` (68ch, line-height 1.8); sizes 17/19/21/24px. UI: 14px base, 12px (`text-xs`) for meta; nothing smaller.
- Headings are semibold, not bold. No uppercase or letter-spaced labels. Scores and counts use `.tnum`.

## Shape and elevation

- Radius: controls `rounded-md` (6px), surfaces and overlays `rounded-lg` (10px), `rounded-full` for badges and dots only.
- Elevation is declared once: surfaces use a 1px border and no shadow; only overlays (sheet, dialog, menu, sentence popover) add `shadow-lg`.
- Structure inside a surface comes from headings and `ink-200` rules, not nested cards or tinted boxes. Decorative icons next to headings and labels are not used.

## Interaction model

| Need | Pattern | Component |
|---|---|---|
| Look up a word or sentence while reading | Side sheet on md+, bottom sheet on phones, light scrim so text stays visible | `Sheet` |
| Task that needs focus (settings, import, install) | Centred dialog | `Dialog` |
| Switch area | Flat underlined tabs from `md` up; below `md` a menu button opens a left drawer holding the tabs, install and settings | `Navbar`, `Drawer` |
| Change interface language | One language icon in the header opening a short menu (extensible via `LANGUAGES`) | `LanguageSwitcher` |
| Sentence actions | Appear on hover **or tap**; never hover-only | `ReaderView` |

Rules: Esc closes any overlay; close buttons are ≥40px on touch; focus ring is global (`:focus-visible`); motion is 160–200ms ease-out and disabled under `prefers-reduced-motion`; no bounce, pulse or decorative animation. Recording state is the only exception that may pulse.

## Components

Use `ui/button` (default, secondary, outline, ghost, destructive; sizes sm 36px, default 40px; every variant has a 1px border, transparent unless outline, so switching variant never changes size), `ui/page-header` (tab title, subtitle, actions), `ui/segmented` (filters and modes), `ui/menu-button` (icon button with a short single-choice menu: language, theme), `ui/badge`, `ui/card`, `ui/overlay` (`Sheet`, `Dialog`, `Drawer`, `OverlayHeader`), `ui/speak-button`. One primary (filled) button per view; the rest are outline or ghost. Icons: lucide, 16px in controls, 1.5–2 stroke, one weight.
