# Design

The visual system for Éclair Français. Product intent lives in `PRODUCT.md`. Tokens live in `src/index.css` (`@theme`); use them, not raw hex.

## Direction: a quiet reading room

Warm-neutral paper, ink-coloured type, one blue accent. The article column is the loudest thing on screen; everything else steps back.

## Colour

| Role | Token | Use |
|---|---|---|
| Page | `ink-50` | app background, "parchment" reading theme |
| Surface | `white` | cards, sheets, dialogs, inputs |
| Line | `ink-200` (`ink-300` for inputs) | every border |
| Text | `ink-900` body, `ink-600` secondary, `ink-500` meta, `ink-400` placeholder/disabled only | |
| Accent | `accent-700` (hover `800`) | primary action, current tab, selected state, focus ring `600` |
| Selection tint | `accent-100` sentence, `accent-200` word | the reader's current position |
| Success / error | `ok-*` / `bad-*` | status only, never decoration |

No amber, indigo, gradients or per-feature colours. Text on a tinted surface uses a dark shade of that tint (`accent-900`, `ok-900`), never grey.

## Type

- **Source Serif 4**: article text, headings, words and sentences from the language being learned. **Public Sans**: UI. **Fira Code**: IPA and code only.
- Reading: `.reading` (68ch, line-height 1.8); sizes 17/19/21/24px. UI: 14px base, 12px (`text-xs`) for meta; nothing smaller.
- Headings are semibold, not bold. No uppercase or letter-spaced labels. Scores and counts use `.tnum`.

## Shape and elevation

- Radius: controls `rounded-md` (6px), surfaces and overlays `rounded-lg` (10px), `rounded-full` for badges and dots only.
- Elevation is declared once: surfaces use a 1px border and no shadow; only overlays (sheet, dialog, sentence popover) add `shadow-lg`.

## Interaction model

| Need | Pattern | Component |
|---|---|---|
| Look up a word or sentence while reading | Side sheet on md+, bottom sheet on phones, light scrim so text stays visible | `Sheet` |
| Task that needs focus (settings, import, install) | Centred dialog | `Dialog` |
| Switch area | Underlined top tabs, icon-only below `sm` | `Navbar` |
| Sentence actions | Appear on hover **or tap**; never hover-only | `ReaderView` |

Rules: Esc closes any overlay; close buttons are ≥40px on touch; focus ring is global (`:focus-visible`); motion is 160–200ms ease-out and disabled under `prefers-reduced-motion`; no bounce, pulse or decorative animation. Recording state is the only exception that may pulse.

## Components

Use `ui/button` (default, secondary, outline, ghost, destructive; sizes sm 36px, default 40px), `ui/badge` (default, secondary, outline, accent, ok, bad), `ui/card`, `ui/overlay` (`Sheet`, `Dialog`, `OverlayHeader`). Icons: lucide, 16px in controls, 1.5–2 stroke, one weight.
